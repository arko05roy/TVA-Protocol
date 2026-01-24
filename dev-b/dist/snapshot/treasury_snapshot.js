"use strict";
/**
 * ASTRAEUS - Treasury Snapshot Service
 *
 * Provides treasury snapshots for Proof of Money (PoM) validation.
 * This service queries Stellar Horizon to get the current state of a vault:
 * - Asset balances (indexed by asset_id hash)
 * - Signer set
 * - Signature threshold
 *
 * Dev A uses this snapshot to verify PoM constraints before committing state.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TreasurySnapshotService = void 0;
exports.createTestnetSnapshotService = createTestnetSnapshotService;
exports.stroopsToDecimal = stroopsToDecimal;
exports.decimalToStroops = decimalToStroops;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const types_1 = require("../interfaces/types");
const crypto_1 = require("../interfaces/crypto");
/**
 * Treasury Snapshot Service
 */
class TreasurySnapshotService {
    server;
    config;
    constructor(config = types_1.TESTNET_CONFIG) {
        this.config = config;
        this.server = new stellar_sdk_1.Horizon.Server(config.horizonUrl);
    }
    /**
     * Get a complete treasury snapshot for PoM validation
     *
     * @param vaultAddress - Stellar address of the vault (G... format)
     * @returns TreasurySnapshot with balances, signers, and threshold
     */
    async getTreasurySnapshot(vaultAddress) {
        // Fetch account from Horizon
        const account = await this.fetchAccountWithRetry(vaultAddress);
        // Parse balances
        const balances = this.parseBalances(account.balances);
        // Extract signers (only those with weight > 0)
        const signers = this.parseSigners(account.signers);
        // Get threshold (use med_threshold for standard operations)
        const threshold = account.thresholds.med_threshold;
        return {
            balances,
            signers,
            threshold,
        };
    }
    /**
     * Get treasury snapshot as JSON-serializable object
     * (For API responses)
     */
    async getTreasurySnapshotJSON(vaultAddress) {
        const snapshot = await this.getTreasurySnapshot(vaultAddress);
        // Convert Map to plain object
        const balancesObj = {};
        for (const [assetId, balance] of snapshot.balances) {
            balancesObj[assetId] = balance.toString();
        }
        return {
            balances: balancesObj,
            signers: snapshot.signers,
            threshold: snapshot.threshold,
        };
    }
    /**
     * Fetch account from Horizon with retry logic
     */
    async fetchAccountWithRetry(address, maxRetries = 3, delayMs = 1000) {
        let lastError;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await this.server.loadAccount(address);
            }
            catch (error) {
                lastError = error;
                // Don't retry on 404 (account not found)
                if (error.response && error.response.status === 404) {
                    throw new Error(`Vault account not found: ${address}`);
                }
                // Retry on timeout or network errors
                console.warn(`[TreasurySnapshot] Attempt ${attempt + 1}/${maxRetries} failed: ${error.message}`);
                if (attempt < maxRetries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
                }
            }
        }
        throw new Error(`Failed to fetch account after ${maxRetries} attempts: ${lastError?.message}`);
    }
    /**
     * Parse Horizon balances to asset_id -> balance map
     *
     * Implements the asset_id computation from interfaces.md Section 2.2:
     * asset_id = SHA256(asset_code || issuer)
     */
    parseBalances(horizonBalances) {
        const balances = new Map();
        for (const bal of horizonBalances) {
            // Skip liquidity pool shares
            if (bal.liquidity_pool_id) {
                continue;
            }
            let assetCode;
            let issuer;
            if (bal.asset_type === 'native') {
                assetCode = 'XLM';
                issuer = 'NATIVE';
            }
            else {
                assetCode = bal.asset_code;
                issuer = bal.asset_issuer;
            }
            // Compute asset_id using SHA-256 as specified in interfaces.md
            const assetId = (0, crypto_1.computeAssetId)(assetCode, issuer);
            // Convert balance to stroops (bigint)
            // Horizon returns balance as string with 7 decimal places
            const stroops = this.balanceToStroops(bal.balance);
            balances.set(assetId, stroops);
        }
        return balances;
    }
    /**
     * Convert Horizon balance string to stroops (bigint)
     * Horizon format: "100.0000000" (7 decimal places)
     */
    balanceToStroops(balance) {
        const [whole, decimal = ''] = balance.split('.');
        const paddedDecimal = decimal.padEnd(7, '0').slice(0, 7);
        return BigInt(whole + paddedDecimal);
    }
    /**
     * Parse Horizon signers to list of public keys
     */
    parseSigners(horizonSigners) {
        return horizonSigners
            .filter((s) => s.weight > 0 && s.type === 'ed25519_public_key')
            .map((s) => s.key);
    }
    /**
     * Get balance for a specific asset
     */
    async getAssetBalance(vaultAddress, assetCode, issuer) {
        const snapshot = await this.getTreasurySnapshot(vaultAddress);
        const assetId = (0, crypto_1.computeAssetId)(assetCode, issuer);
        return snapshot.balances.get(assetId) || 0n;
    }
    /**
     * Check if treasury has sufficient balance for a given PoM delta
     *
     * @param vaultAddress - Vault address
     * @param pomDelta - Map of asset_id -> required outflow
     * @returns Object with solvency status and any shortfalls
     */
    async checkSolvency(vaultAddress, pomDelta) {
        const snapshot = await this.getTreasurySnapshot(vaultAddress);
        const shortfalls = new Map();
        for (const [assetId, requiredAmount] of pomDelta) {
            const availableBalance = snapshot.balances.get(assetId) || 0n;
            if (availableBalance < requiredAmount) {
                shortfalls.set(assetId, {
                    required: requiredAmount,
                    available: availableBalance,
                });
            }
        }
        return {
            solvent: shortfalls.size === 0,
            shortfalls,
        };
    }
    /**
     * Verify that a set of signers can meet the threshold
     */
    async canMeetThreshold(vaultAddress, availableSigners) {
        const snapshot = await this.getTreasurySnapshot(vaultAddress);
        // Count how many of the available signers are actually vault signers
        const validSigners = availableSigners.filter((s) => snapshot.signers.includes(s));
        return {
            canMeet: validSigners.length >= snapshot.threshold,
            required: snapshot.threshold,
            available: validSigners.length,
        };
    }
}
exports.TreasurySnapshotService = TreasurySnapshotService;
/**
 * Create a new TreasurySnapshotService for testnet
 */
function createTestnetSnapshotService() {
    return new TreasurySnapshotService(types_1.TESTNET_CONFIG);
}
/**
 * Utility function: Convert stroops to human-readable amount
 */
function stroopsToDecimal(stroops, decimals = 7) {
    const str = stroops.toString().padStart(decimals + 1, '0');
    const whole = str.slice(0, -decimals) || '0';
    const decimal = str.slice(-decimals);
    return `${whole}.${decimal}`;
}
/**
 * Utility function: Convert decimal amount to stroops
 */
function decimalToStroops(decimal) {
    const [whole, frac = ''] = decimal.split('.');
    const paddedFrac = frac.padEnd(7, '0').slice(0, 7);
    return BigInt(whole + paddedFrac);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJlYXN1cnlfc25hcHNob3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvc25hcHNob3QvdHJlYXN1cnlfc25hcHNob3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7O0dBVUc7OztBQTBQSCxvRUFFQztBQUtELDRDQUtDO0FBS0QsNENBSUM7QUE3UUQsc0RBQStDO0FBQy9DLCtDQUs2QjtBQUM3QixpREFBc0Q7QUFzQnREOztHQUVHO0FBQ0gsTUFBYSx1QkFBdUI7SUFDMUIsTUFBTSxDQUFpQjtJQUN2QixNQUFNLENBQWdCO0lBRTlCLFlBQVksU0FBd0Isc0JBQWM7UUFDaEQsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLHFCQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSCxLQUFLLENBQUMsbUJBQW1CLENBQUMsWUFBb0I7UUFDNUMsNkJBQTZCO1FBQzdCLE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLHFCQUFxQixDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRS9ELGlCQUFpQjtRQUNqQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxRQUE0QixDQUFDLENBQUM7UUFFMUUsK0NBQStDO1FBQy9DLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLE9BQTBCLENBQUMsQ0FBQztRQUV0RSw0REFBNEQ7UUFDNUQsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUM7UUFFbkQsT0FBTztZQUNMLFFBQVE7WUFDUixPQUFPO1lBQ1AsU0FBUztTQUNWLENBQUM7SUFDSixDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLHVCQUF1QixDQUFDLFlBQW9CO1FBQ2hE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WSxDQUFDLE1BQU07U0FDL0IsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQW5ORCwwREFtTkM7QUFFRDs7R0FFRztBQUNILFNBQWdCLDRCQUE0QjtJQUMxQyxPQUFPLElBQUksdUJBQXVCLENBQUMsc0JBQWMsQ0FBQyxDQUFDO0FBQ3JELENBQUM7QUFFRDs7R0FFRztBQUNILFNBQWdCLGdCQUFnQixDQUFDLE9BQWUsRUFBRSxRQUFRLEdBQUcsQ0FBQztJQUM1RCxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDM0QsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLENBQUM7SUFDN0MsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3JDLE9BQU8sR0FBRyxLQUFLLElBQUksT0FBTyxFQUFFLENBQUM7QUFDL0IsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBZ0IsZ0JBQWdCLENBQUMsT0FBZTtJQUM5QyxNQUFNLENBQUMsS0FBSyxFQUFFLElBQUksR0FBRyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzlDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDbkQsT0FBTyxNQUFNLENBQUMsS0FBSyxHQUFHLFVBQVUsQ0FBQyxDQUFDO0FBQ3BDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEFTVFJBRVVTIC0gVHJlYXN1cnkgU25hcHNob3QgU2VydmljZVxuICpcbiAqIFByb3ZpZGVzIHRyZWFzdXJ5IHNuYXBzaG90cyBmb3IgUHJvb2Ygb2YgTW9uZXkgKFBvTSkgdmFsaWRhdGlvbi5cbiAqIFRoaXMgc2VydmljZSBxdWVyaWVzIFN0ZWxsYXIgSG9yaXpvbiB0byBnZXQgdGhlIGN1cnJlbnQgc3RhdGUgb2YgYSB2YXVsdDpcbiAqIC0gQXNzZXQgYmFsYW5jZXMgKGluZGV4ZWQgYnkgYXNzZXRfaWQgaGFzaClcbiAqIC0gU2lnbmVyIHNldFxuICogLSBTaWduYXR1cmUgdGhyZXNob2xkXG4gKlxuICogRGV2IEEgdXNlcyB0aGlzIHNuYXBzaG90IHRvIHZlcmlmeSBQb00gY29uc3RyYWludHMgYmVmb3JlIGNvbW1pdHRpbmcgc3RhdGUuXG4gKi9cblxuaW1wb3J0IHsgSG9yaXpvbiB9IGZyb20gJ0BzdGVsbGFyL3N0ZWxsYXItc2RrJztcbmltcG9ydCB7XG4gIFRyZWFzdXJ5U25hcHNob3QsXG4gIFRyZWFzdXJ5U25hcHNob3RKU09OLFxuICBOZXR3b3JrQ29uZmlnLFxuICBURVNUTkVUX0NPTkZJRyxcbn0gZnJvbSAnLi4vaW50ZXJmYWNlcy90eXBlcyc7XG5pbXBvcnQgeyBjb21wdXRlQXNzZXRJZCB9IGZyb20gJy4uL2ludGVyZmFjZXMvY3J5cHRvJztcblxuLyoqXG4gKiBCYWxhbmNlIGluZm9ybWF0aW9uIGZyb20gSG9yaXpvblxuICovXG5pbnRlcmZhY2UgSG9yaXpvbkJhbGFuY2Uge1xuICBhc3NldF90eXBlOiAnbmF0aXZlJyB8ICdjcmVkaXRfYWxwaGFudW00JyB8ICdjcmVkaXRfYWxwaGFudW0xMic7XG4gIGFzc2V0X2NvZGU/OiBzdHJpbmc7XG4gIGFzc2V0X2lzc3Vlcj86IHN0cmluZztcbiAgYmFsYW5jZTogc3RyaW5nO1xuICBsaXF1aWRpdHlfcG9vbF9pZD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBTaWduZXIgaW5mb3JtYXRpb24gZnJvbSBIb3Jpem9uXG4gKi9cbmludGVyZmFjZSBIb3Jpem9uU2lnbmVyIHtcbiAga2V5OiBzdHJpbmc7XG4gIHdlaWdodDogbnVtYmVyO1xuICB0eXBlOiAnZWQyNTUxOV9wdWJsaWNfa2V5JyB8ICdzaGEyNTZfaGFzaCcgfCAncHJlYXV0aF90eCc7XG59XG5cbi8qKlxuICogVHJlYXN1cnkgU25hcHNob3QgU2VydmljZVxuICovXG5leHBvcnQgY2xhc3MgVHJlYXN1cnlTbmFwc2hvdFNlcnZpY2Uge1xuICBwcml2YXRlIHNlcnZlcjogSG9yaXpvbi5TZXJ2ZXI7XG4gIHByaXZhdGUgY29uZmlnOiBOZXR3b3JrQ29uZmlnO1xuXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogTmV0d29ya0NvbmZpZyA9IFRFU1RORVRfQ09ORklHKSB7XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgdGhpcy5zZXJ2ZXIgPSBuZXcgSG9yaXpvbi5TZXJ2ZXIoY29uZmlnLmhvcml6b25VcmwpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhIGNvbXBsZXRlIHRyZWFzdXJ5IHNuYXBzaG90IGZvciBQb00gdmFsaWRhdGlvblxuICAgKlxuICAgKiBAcGFyYW0gdmF1bHRBZGRyZXNzIC0gU3RlbGxhciBhZGRyZXNzIG9mIHRoZSB2YXVsdCAoRy4uLiBmb3JtYXQpXG4gICAqIEByZXR1cm5zIFRyZWFzdXJ5U25hcHNob3Qgd2l0aCBiYWxhbmNlcywgc2lnbmVycywgYW5kIHRocmVzaG9sZFxuICAgKi9cbiAgYXN5bmMgZ2V0VHJlYXN1cnlTbmFwc2hvdCh2YXVsdEFkZHJlc3M6IHN0cmluZyk6IFByb21pc2U8VHJlYXN1cnlTbmFwc2hvdD4ge1xuICAgIC8vIEZldGNoIGFjY291bnQgZnJvbSBIb3Jpem9uXG4gICAgY29uc3QgYWNjb3VudCA9IGF3YWl0IHRoaXMuZmV0Y2hBY2NvdW50V2l0aFJldHJ5KHZhdWx0QWRkcmVzcyk7XG5cbiAgICAvLyBQYXJzZSBiYWxhbmNlc1xuICAgIGNvbnN0IGJhbGFuY2VzID0gdGhpcy5wYXJzZUJhbGFuY2VzKGFjY291bnQuYmFsYW5jZXMgYXMgSG9yaXpvbkJhbGFuY2VbXSk7XG5cbiAgICAvLyBFeHRyYWN0IHNpZ25lcnMgKG9ubHkgdGhvc2Ugd2l0aCB3ZWlnaHQgPiAwKVxuICAgIGNvbnN0IHNpZ25lcnMgPSB0aGlzLnBhcnNlU2lnbmVycyhhY2NvdW50LnNpZ25lcnMgYXMgSG9yaXpvblNpZ25lcltdKTtcblxuICAgIC8vIEdldCB0aHJlc2hvbGQgKHVzZSBtZWRfdGhyZXNob2xkIGZvciBzdGFuZGFyZCBvcGVyYXRpb25zKVxuICAgIGNvbnN0IHRocmVzaG9sZCA9IGFjY291bnQudGhyZXNob2xkcy5tZWRfdGhyZXNob2xkO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGJhbGFuY2VzLFxuICAgICAgc2lnbmVycyxcbiAgICAgIHRocmVzaG9sZCxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0cmVhc3VyeSBzbmFwc2hvdCBhcyBKU09OLXNlcmlhbGl6YWJsZSBvYmplY3RcbiAgICogKEZvciBBUEkgcmVzcG9uc2VzKVxuICAgKi9cbiAgYXN5bmMgZ2V0VHJlYXN1cnlTbmFwc2hvdEpTT04odmF1bHRBZGRyZXNzOiBzdHJpbmcpOiBQcm9taXNlPFRyZWFzdXJ5U25hcHNob3RKU09OPiB7XG4gICAgY29uc3Qgc25hcHNob3QgPSBhd2FpdCB0aGlzLmdldFRyZWFzdXJ5U25hcHNob3QodmF1bHRBZGRyZXNzKTtcblxuICAgIC8vIENvbnZlcnQgTWFwIHRvIHBsYWluIG9iamVjdFxuICAgIGNvbnN0IGJhbGFuY2VzT2JqOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0ge307XG4gICAgZm9yIChjb25zdCBbYXNzZXRJZCwgYmFsYW5jZV0gb2Ygc25hcHNob3QuYmFsYW5jZXMpIHtcbiAgICAgIGJhbGFuY2VzT2JqW2Fzc2V0SWRdID0gYmFsYW5jZS50b1N0cmluZygpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBiYWxhbmNlczogYmFsYW5jZXNPYmosXG4gICAgICBzaWduZXJzOiBzbmFwc2hvdC5zaWduZXJzLFxuICAgICAgdGhyZXNob2xkOiBzbmFwc2hvdC50aHJlc2hvbGQsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGZXRjaCBhY2NvdW50IGZyb20gSG9yaXpvbiB3aXRoIHJldHJ5IGxvZ2ljXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGZldGNoQWNjb3VudFdpdGhSZXRyeShcbiAgICBhZGRyZXNzOiBzdHJpbmcsXG4gICAgbWF4UmV0cmllcyA9IDMsXG4gICAgZGVsYXlNcyA9IDEwMDBcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBsZXQgbGFzdEVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuICAgIGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDwgbWF4UmV0cmllczsgYXR0ZW1wdCsrKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gYXdhaXQgdGhpcy5zZXJ2ZXIubG9hZEFjY291bnQoYWRkcmVzcyk7XG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgIGxhc3RFcnJvciA9IGVycm9yO1xuXG4gICAgICAgIC8vIERvbid0IHJldHJ5IG9uIDQwNCAoYWNjb3VudCBub3QgZm91bmQpXG4gICAgICAgIGlmIChlcnJvci5yZXNwb25zZSAmJiBlcnJvci5yZXNwb25zZS5zdGF0dXMgPT09IDQwNCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVmF1bHQgYWNjb3VudCBub3QgZm91bmQ6ICR7YWRkcmVzc31gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJldHJ5IG9uIHRpbWVvdXQgb3IgbmV0d29yayBlcnJvcnNcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBbVHJlYXN1cnlTbmFwc2hvdF0gQXR0ZW1wdCAke2F0dGVtcHQgKyAxfS8ke21heFJldHJpZXN9IGZhaWxlZDogJHtlcnJvci5tZXNzYWdlfWBcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoYXR0ZW1wdCA8IG1heFJldHJpZXMgLSAxKSB7XG4gICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgZGVsYXlNcyAqIChhdHRlbXB0ICsgMSkpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGFjY291bnQgYWZ0ZXIgJHttYXhSZXRyaWVzfSBhdHRlbXB0czogJHtsYXN0RXJyb3I/Lm1lc3NhZ2V9YCk7XG4gIH1cblxuICAvKipcbiAgICogUGFyc2UgSG9yaXpvbiBiYWxhbmNlcyB0byBhc3NldF9pZCAtPiBiYWxhbmNlIG1hcFxuICAgKlxuICAgKiBJbXBsZW1lbnRzIHRoZSBhc3NldF9pZCBjb21wdXRhdGlvbiBmcm9tIGludGVyZmFjZXMubWQgU2VjdGlvbiAyLjI6XG4gICAqIGFzc2V0X2lkID0gU0hBMjU2KGFzc2V0X2NvZGUgfHwgaXNzdWVyKVxuICAgKi9cbiAgcHJpdmF0ZSBwYXJzZUJhbGFuY2VzKGhvcml6b25CYWxhbmNlczogSG9yaXpvbkJhbGFuY2VbXSk6IE1hcDxzdHJpbmcsIGJpZ2ludD4ge1xuICAgIGNvbnN0IGJhbGFuY2VzID0gbmV3IE1hcDxzdHJpbmcsIGJpZ2ludD4oKTtcblxuICAgIGZvciAoY29uc3QgYmFsIG9mIGhvcml6b25CYWxhbmNlcykge1xuICAgICAgLy8gU2tpcCBsaXF1aWRpdHkgcG9vbCBzaGFyZXNcbiAgICAgIGlmIChiYWwubGlxdWlkaXR5X3Bvb2xfaWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGxldCBhc3NldENvZGU6IHN0cmluZztcbiAgICAgIGxldCBpc3N1ZXI6IHN0cmluZztcblxuICAgICAgaWYgKGJhbC5hc3NldF90eXBlID09PSAnbmF0aXZlJykge1xuICAgICAgICBhc3NldENvZGUgPSAnWExNJztcbiAgICAgICAgaXNzdWVyID0gJ05BVElWRSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhc3NldENvZGUgPSBiYWwuYXNzZXRfY29kZSE7XG4gICAgICAgIGlzc3VlciA9IGJhbC5hc3NldF9pc3N1ZXIhO1xuICAgICAgfVxuXG4gICAgICAvLyBDb21wdXRlIGFzc2V0X2lkIHVzaW5nIFNIQS0yNTYgYXMgc3BlY2lmaWVkIGluIGludGVyZmFjZXMubWRcbiAgICAgIGNvbnN0IGFzc2V0SWQgPSBjb21wdXRlQXNzZXRJZChhc3NldENvZGUsIGlzc3Vlcik7XG5cbiAgICAgIC8vIENvbnZlcnQgYmFsYW5jZSB0byBzdHJvb3BzIChiaWdpbnQpXG4gICAgICAvLyBIb3Jpem9uIHJldHVybnMgYmFsYW5jZSBhcyBzdHJpbmcgd2l0aCA3IGRlY2ltYWwgcGxhY2VzXG4gICAgICBjb25zdCBzdHJvb3BzID0gdGhpcy5iYWxhbmNlVG9TdHJvb3BzKGJhbC5iYWxhbmNlKTtcblxuICAgICAgYmFsYW5jZXMuc2V0KGFzc2V0SWQsIHN0cm9vcHMpO1xuICAgIH1cblxuICAgIHJldHVybiBiYWxhbmNlcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDb252ZXJ0IEhvcml6b24gYmFsYW5jZSBzdHJpbmcgdG8gc3Ryb29wcyAoYmlnaW50KVxuICAgKiBIb3Jpem9uIGZvcm1hdDogXCIxMDAuMDAwMDAwMFwiICg3IGRlY2ltYWwgcGxhY2VzKVxuICAgKi9cbiAgcHJpdmF0ZSBiYWxhbmNlVG9TdHJvb3BzKGJhbGFuY2U6IHN0cmluZyk6IGJpZ2ludCB7XG4gICAgY29uc3QgW3dob2xlLCBkZWNpbWFsID0gJyddID0gYmFsYW5jZS5zcGxpdCgnLicpO1xuICAgIGNvbnN0IHBhZGRlZERlY2ltYWwgPSBkZWNpbWFsLnBhZEVuZCg3LCAnMCcpLnNsaWNlKDAsIDcpO1xuICAgIHJldHVybiBCaWdJbnQod2hvbGUgKyBwYWRkZWREZWNpbWFsKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBQYXJzZSBIb3Jpem9uIHNpZ25lcnMgdG8gbGlzdCBvZiBwdWJsaWMga2V5c1xuICAgKi9cbiAgcHJpdmF0ZSBwYXJzZVNpZ25lcnMoaG9yaXpvblNpZ25lcnM6IEhvcml6b25TaWduZXJbXSk6IHN0cmluZ1tdIHtcbiAgICByZXR1cm4gaG9yaXpvblNpZ25lcnNcbiAgICAgIC5maWx0ZXIoKHMpID0+IHMud2VpZ2h0ID4gMCAmJiBzLnR5cGUgPT09ICdlZDI1NTE5X3B1YmxpY19rZXknKVxuICAgICAgLm1hcCgocykgPT4gcy5rZXkpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBiYWxhbmNlIGZvciBhIHNwZWNpZmljIGFzc2V0XG4gICAqL1xuICBhc3luYyBnZXRBc3NldEJhbGFuY2UodmF1bHRBZGRyZXNzOiBzdHJpbmcsIGFzc2V0Q29kZTogc3RyaW5nLCBpc3N1ZXI6IHN0cmluZyk6IFByb21pc2U8YmlnaW50PiB7XG4gICAgY29uc3Qgc25hcHNob3QgPSBhd2FpdCB0aGlzLmdldFRyZWFzdXJ5U25hcHNob3QodmF1bHRBZGRyZXNzKTtcbiAgICBjb25zdCBhc3NldElkID0gY29tcHV0ZUFzc2V0SWQoYXNzZXRDb2RlLCBpc3N1ZXIpO1xuICAgIHJldHVybiBzbmFwc2hvdC5iYWxhbmNlcy5nZXQoYXNzZXRJZCkgfHwgMG47XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgdHJlYXN1cnkgaGFzIHN1ZmZpY2llbnQgYmFsYW5jZSBmb3IgYSBnaXZlbiBQb00gZGVsdGFcbiAgICpcbiAgICogQHBhcmFtIHZhdWx0QWRkcmVzcyAtIFZhdWx0IGFkZHJlc3NcbiAgICogQHBhcmFtIHBvbURlbHRhIC0gTWFwIG9mIGFzc2V0X2lkIC0+IHJlcXVpcmVkIG91dGZsb3dcbiAgICogQHJldHVybnMgT2JqZWN0IHdpdGggc29sdmVuY3kgc3RhdHVzIGFuZCBhbnkgc2hvcnRmYWxsc1xuICAgKi9cbiAgYXN5bmMgY2hlY2tTb2x2ZW5jeShcbiAgICB2YXVsdEFkZHJlc3M6IHN0cmluZyxcbiAgICBwb21EZWx0YTogTWFwPHN0cmluZywgYmlnaW50PlxuICApOiBQcm9taXNlPHtcbiAgICBzb2x2ZW50OiBib29sZWFuO1xuICAgIHNob3J0ZmFsbHM6IE1hcDxzdHJpbmcsIHsgcmVxdWlyZWQ6IGJpZ2ludDsgYXZhaWxhYmxlOiBiaWdpbnQgfT47XG4gIH0+IHtcbiAgICBjb25zdCBzbmFwc2hvdCA9IGF3YWl0IHRoaXMuZ2V0VHJlYXN1cnlTbmFwc2hvdCh2YXVsdEFkZHJlc3MpO1xuICAgIGNvbnN0IHNob3J0ZmFsbHMgPSBuZXcgTWFwPHN0cmluZywgeyByZXF1aXJlZDogYmlnaW50OyBhdmFpbGFibGU6IGJpZ2ludCB9PigpO1xuXG4gICAgZm9yIChjb25zdCBbYXNzZXRJZCwgcmVxdWlyZWRBbW91bnRdIG9mIHBvbURlbHRhKSB7XG4gICAgICBjb25zdCBhdmFpbGFibGVCYWxhbmNlID0gc25hcHNob3QuYmFsYW5jZXMuZ2V0KGFzc2V0SWQpIHx8IDBuO1xuXG4gICAgICBpZiAoYXZhaWxhYmxlQmFsYW5jZSA8IHJlcXVpcmVkQW1vdW50KSB7XG4gICAgICAgIHNob3J0ZmFsbHMuc2V0KGFzc2V0SWQsIHtcbiAgICAgICAgICByZXF1aXJlZDogcmVxdWlyZWRBbW91bnQsXG4gICAgICAgICAgYXZhaWxhYmxlOiBhdmFpbGFibGVCYWxhbmNlLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgc29sdmVudDogc2hvcnRmYWxscy5zaXplID09PSAwLFxuICAgICAgc2hvcnRmYWxscyxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFZlcmlmeSB0aGF0IGEgc2V0IG9mIHNpZ25lcnMgY2FuIG1lZXQgdGhlIHRocmVzaG9sZFxuICAgKi9cbiAgYXN5bmMgY2FuTWVldFRocmVzaG9sZChcbiAgICB2YXVsdEFkZHJlc3M6IHN0cmluZyxcbiAgICBhdmFpbGFibGVTaWduZXJzOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPHsgY2FuTWVldDogYm9vbGVhbjsgcmVxdWlyZWQ6IG51bWJlcjsgYXZhaWxhYmxlOiBudW1iZXIgfT4ge1xuICAgIGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5nZXRUcmVhc3VyeVNuYXBzaG90KHZhdWx0QWRkcmVzcyk7XG5cbiAgICAvLyBDb3VudCBob3cgbWFueSBvZiB0aGUgYXZhaWxhYmxlIHNpZ25lcnMgYXJlIGFjdHVhbGx5IHZhdWx0IHNpZ25lcnNcbiAgICBjb25zdCB2YWxpZFNpZ25lcnMgPSBhdmFpbGFibGVTaWduZXJzLmZpbHRlcigocykgPT5cbiAgICAgIHNuYXBzaG90LnNpZ25lcnMuaW5jbHVkZXMocylcbiAgICApO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNhbk1lZXQ6IHZhbGlkU2lnbmVycy5sZW5ndGggPj0gc25hcHNob3QudGhyZXNob2xkLFxuICAgICAgcmVxdWlyZWQ6IHNuYXBzaG90LnRocmVzaG9sZCxcbiAgICAgIGF2YWlsYWJsZTogdmFsaWRTaWduZXJzLmxlbmd0aCxcbiAgICB9O1xuICB9XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgbmV3IFRyZWFzdXJ5U25hcHNob3RTZXJ2aWNlIGZvciB0ZXN0bmV0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUZXN0bmV0U25hcHNob3RTZXJ2aWNlKCk6IFRyZWFzdXJ5U25hcHNob3RTZXJ2aWNlIHtcbiAgcmV0dXJuIG5ldyBUcmVhc3VyeVNuYXBzaG90U2VydmljZShURVNUTkVUX0NPTkZJRyk7XG59XG5cbi8qKlxuICogVXRpbGl0eSBmdW5jdGlvbjogQ29udmVydCBzdHJvb3BzIHRvIGh1bWFuLXJlYWRhYmxlIGFtb3VudFxuICovXG5leHBvcnQgZnVuY3Rpb24gc3Ryb29wc1RvRGVjaW1hbChzdHJvb3BzOiBiaWdpbnQsIGRlY2ltYWxzID0gNyk6IHN0cmluZyB7XG4gIGNvbnN0IHN0ciA9IHN0cm9vcHMudG9TdHJpbmcoKS5wYWRTdGFydChkZWNpbWFscyArIDEsICcwJyk7XG4gIGNvbnN0IHdob2xlID0gc3RyLnNsaWNlKDAsIC1kZWNpbWFscykgfHwgJzAnO1xuICBjb25zdCBkZWNpbWFsID0gc3RyLnNsaWNlKC1kZWNpbWFscyk7XG4gIHJldHVybiBgJHt3aG9sZX0uJHtkZWNpbWFsfWA7XG59XG5cbi8qKlxuICogVXRpbGl0eSBmdW5jdGlvbjogQ29udmVydCBkZWNpbWFsIGFtb3VudCB0byBzdHJvb3BzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZWNpbWFsVG9TdHJvb3BzKGRlY2ltYWw6IHN0cmluZyk6IGJpZ2ludCB7XG4gIGNvbnN0IFt3aG9sZSwgZnJhYyA9ICcnXSA9IGRlY2ltYWwuc3BsaXQoJy4nKTtcbiAgY29uc3QgcGFkZGVkRnJhYyA9IGZyYWMucGFkRW5kKDcsICcwJykuc2xpY2UoMCwgNyk7XG4gIHJldHVybiBCaWdJbnQod2hvbGUgKyBwYWRkZWRGcmFjKTtcbn1cbiJdfQ==