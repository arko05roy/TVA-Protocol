"use strict";
/**
 * ASTRAEUS - Replay Protection
 *
 * Prevents double-settlement using memo-based deduplication.
 *
 * Per agent/interfaces.md Section 8 (Determinism and Replay Protection):
 * - Each settlement is bound to memo = first_28_bytes(SHA256(subnet_id || block_number))
 * - This ensures:
 *   - No double settlement
 *   - No cross-subnet confusion
 *   - Full traceability
 *
 * Per agent/plan.md B6 (Failure Handling):
 * - Idempotency (memo-based)
 * - Tx hash tracking
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplayProtectionService = void 0;
exports.createTestnetReplayProtection = createTestnetReplayProtection;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const types_1 = require("../interfaces/types");
const crypto_1 = require("../interfaces/crypto");
/**
 * Replay Protection Service
 *
 * Tracks settlements and prevents double-processing using memo-based deduplication.
 */
class ReplayProtectionService {
    server;
    config;
    /** In-memory settlement log (could be persisted to database) */
    settlementLog = new Map();
    constructor(config = types_1.TESTNET_CONFIG) {
        this.config = config;
        this.server = new stellar_sdk_1.Horizon.Server(config.horizonUrl);
    }
    /**
     * Generate a unique key for a settlement (subnet_id + block_number).
     */
    getSettlementKey(subnetId, blockNumber) {
        return `${subnetId}:${blockNumber}`;
    }
    /**
     * Check if a settlement has already been processed.
     *
     * Per interfaces.md Section 8:
     * - Query Horizon for transactions with this memo
     * - If found, the settlement is already complete
     *
     * @param vaultAddress - Vault address to check transactions for
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @returns True if already settled, false otherwise
     */
    async isAlreadySettled(vaultAddress, subnetId, blockNumber) {
        // First check local cache
        const key = this.getSettlementKey(subnetId, blockNumber);
        const localRecord = this.settlementLog.get(key);
        if (localRecord && localRecord.status === 'confirmed') {
            return true;
        }
        // Check on-chain via Horizon
        const memoBuffer = (0, crypto_1.computeMemo)(subnetId, blockNumber);
        // Pad to 32 bytes for Stellar memo hash
        const memoHash = Buffer.concat([memoBuffer, Buffer.alloc(4, 0)]).toString('hex');
        try {
            // Query transactions for this vault
            const transactions = await this.server
                .transactions()
                .forAccount(vaultAddress)
                .order('desc')
                .limit(200) // Check recent transactions
                .call();
            // Look for matching memo
            for (const tx of transactions.records) {
                if (tx.memo_type === 'hash' && tx.memo === memoHash) {
                    // Found matching transaction - settlement already complete
                    // Update local cache
                    this.settlementLog.set(key, {
                        subnetId,
                        blockNumber,
                        memoHex: memoBuffer.toString('hex'),
                        txHashes: [tx.hash],
                        ledgers: [tx.ledger_attr],
                        timestamp: new Date(tx.created_at),
                        status: 'confirmed',
                    });
                    return true;
                }
            }
            return false;
        }
        catch (error) {
            // If we can't check Horizon, err on the side of caution
            // Don't return false - could cause double settlement
            console.error('Failed to check settlement status on Horizon:', error);
            throw error;
        }
    }
    /**
     * Record a pending settlement (before submission).
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @returns Settlement record
     */
    recordPendingSettlement(subnetId, blockNumber) {
        const key = this.getSettlementKey(subnetId, blockNumber);
        const memoBuffer = (0, crypto_1.computeMemo)(subnetId, blockNumber);
        const record = {
            subnetId,
            blockNumber,
            memoHex: memoBuffer.toString('hex'),
            txHashes: [],
            ledgers: [],
            timestamp: new Date(),
            status: 'pending',
        };
        this.settlementLog.set(key, record);
        return record;
    }
    /**
     * Record a confirmed settlement (after successful submission).
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @param txHashes - Array of transaction hashes
     * @param ledgers - Array of ledger numbers
     */
    recordConfirmedSettlement(subnetId, blockNumber, txHashes, ledgers) {
        const key = this.getSettlementKey(subnetId, blockNumber);
        const existing = this.settlementLog.get(key);
        const memoBuffer = (0, crypto_1.computeMemo)(subnetId, blockNumber);
        const record = {
            subnetId,
            blockNumber,
            memoHex: memoBuffer.toString('hex'),
            txHashes,
            ledgers,
            timestamp: existing?.timestamp || new Date(),
            status: 'confirmed',
        };
        this.settlementLog.set(key, record);
    }
    /**
     * Record a failed settlement.
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @param error - Error message
     */
    recordFailedSettlement(subnetId, blockNumber, error) {
        const key = this.getSettlementKey(subnetId, blockNumber);
        const existing = this.settlementLog.get(key);
        if (existing) {
            existing.status = 'failed';
            existing.error = error;
            this.settlementLog.set(key, existing);
        }
    }
    /**
     * Get settlement record for a specific block.
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @returns Settlement record or undefined
     */
    getSettlementRecord(subnetId, blockNumber) {
        const key = this.getSettlementKey(subnetId, blockNumber);
        return this.settlementLog.get(key);
    }
    /**
     * Get all settlement records for a subnet.
     *
     * @param subnetId - Subnet identifier
     * @returns Array of settlement records
     */
    getSubnetSettlements(subnetId) {
        const records = [];
        for (const [key, record] of this.settlementLog) {
            if (record.subnetId === subnetId) {
                records.push(record);
            }
        }
        // Sort by block number
        return records.sort((a, b) => {
            if (a.blockNumber < b.blockNumber)
                return -1;
            if (a.blockNumber > b.blockNumber)
                return 1;
            return 0;
        });
    }
    /**
     * Create settlement confirmation for Dev A.
     *
     * Per duo.md Interface 3 (Settlement Confirmation):
     * {
     *   subnet_id: string,
     *   block_number: number,
     *   tx_hashes: string[],
     *   memo: string,
     *   timestamp: string
     * }
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @returns Settlement confirmation or undefined if not found
     */
    getSettlementConfirmation(subnetId, blockNumber) {
        const record = this.getSettlementRecord(subnetId, blockNumber);
        if (!record || record.status !== 'confirmed') {
            return undefined;
        }
        return {
            subnet_id: record.subnetId,
            block_number: record.blockNumber,
            tx_hashes: record.txHashes,
            memo: record.memoHex,
            timestamp: record.timestamp,
        };
    }
    /**
     * Clear all records (for testing).
     */
    clearAll() {
        this.settlementLog.clear();
    }
    /**
     * Get count of settlements by status.
     */
    getStats() {
        let pending = 0;
        let confirmed = 0;
        let failed = 0;
        for (const record of this.settlementLog.values()) {
            switch (record.status) {
                case 'pending':
                    pending++;
                    break;
                case 'confirmed':
                    confirmed++;
                    break;
                case 'failed':
                    failed++;
                    break;
            }
        }
        return { pending, confirmed, failed };
    }
}
exports.ReplayProtectionService = ReplayProtectionService;
/**
 * Create a ReplayProtectionService for testnet
 */
function createTestnetReplayProtection() {
    return new ReplayProtectionService(types_1.TESTNET_CONFIG);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbGF5X3Byb3RlY3Rpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvc2FmZXR5L3JlcGxheV9wcm90ZWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7O0dBZUc7OztBQWlUSCxzRUFFQztBQWpURCxzREFBK0M7QUFDL0MsK0NBSTZCO0FBQzdCLGlEQUFtRDtBQWdCbkQ7Ozs7R0FJRztBQUNILE1BQWEsdUJBQXVCO0lBQzFCLE1BQU0sQ0FBaUI7SUFDdkIsTUFBTSxDQUFnQjtJQUU5QixnRUFBZ0U7SUFDeEQsYUFBYSxHQUFrQyxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBRWpFLFlBQVksU0FBd0Isc0JBQWM7UUFDaEQsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLHFCQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRUQ7O09BRUc7SUFDSyxnQkFBZ0IsQ0FBQyxRQUFnQixFQUFFLFdBQW1CO1FBQzVELE9BQU8sR0FBRyxRQUFRLElBQUksV0FBVyxFQUFFLENBQUM7SUFDdEMsQ0FBQztJQUVEOzs7Ozs7Ozs7OztPQVdHO0lBQ0gsS0FBSyxDQUFDLGdCQUFnQixDQUNwQixZQUFvQixFQUNwQixRQUFnQixFQUNoQixXQUFtQjtRQUVuQiwwQkFBMEI7UUFDMUIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUN6RCxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUVoRCxJQUFJLFdBQVcsSUFBSSxXQUFXLENBQUMsTUFBTSxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQ3RELE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQztRQUVELDZCQUE2QjtRQUM3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QUMsS0FBSyxFQUFFLENBQUM7SUFDN0IsQ0FBQztJQUVEOztPQUVHO0lBQ0gsUUFBUTtRQUNOLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQztRQUNoQixJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFDbEIsSUFBSSxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBRWYsS0FBSyxNQUFNLE1BQU0sSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUM7WUFDakQsUUFBUSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3RCLEtBQUssU0FBUztvQkFDWixPQUFPLEVBQUUsQ0FBQztvQkFDVixNQUFNO2dCQUNSLEtBQUssV0FBVztvQkFDZCxTQUFTLEVBQUUsQ0FBQztvQkFDWixNQUFNO2dCQUNSLEtBQUssUUFBUTtvQkFDWCxNQUFNLEVBQUUsQ0FBQztvQkFDVCxNQUFNO1lBQ1YsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsQ0FBQztJQUN4QyxDQUFDO0NBQ0Y7QUEvUUQsMERBK1FDO0FBRUQ7O0dBRUc7QUFDSCxTQUFnQiw2QkFBNkI7SUFDM0MsT0FBTyxJQUFJLHVCQUF1QixDQUFDLHNCQUFjLENBQUMsQ0FBQztBQUNyRCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBBU1RSQUVVUyAtIFJlcGxheSBQcm90ZWN0aW9uXG4gKlxuICogUHJldmVudHMgZG91YmxlLXNldHRsZW1lbnQgdXNpbmcgbWVtby1iYXNlZCBkZWR1cGxpY2F0aW9uLlxuICpcbiAqIFBlciBhZ2VudC9pbnRlcmZhY2VzLm1kIFNlY3Rpb24gOCAoRGV0ZXJtaW5pc20gYW5kIFJlcGxheSBQcm90ZWN0aW9uKTpcbiAqIC0gRWFjaCBzZXR0bGVtZW50IGlzIGJvdW5kIHRvIG1lbW8gPSBmaXJzdF8yOF9ieXRlcyhTSEEyNTYoc3VibmV0X2lkIHx8IGJsb2NrX251bWJlcikpXG4gKiAtIFRoaXMgZW5zdXJlczpcbiAqICAgLSBObyBkb3VibGUgc2V0dGxlbWVudFxuICogICAtIE5vIGNyb3NzLXN1Ym5ldCBjb25mdXNpb25cbiAqICAgLSBGdWxsIHRyYWNlYWJpbGl0eVxuICpcbiAqIFBlciBhZ2VudC9wbGFuLm1kIEI2IChGYWlsdXJlIEhhbmRsaW5nKTpcbiAqIC0gSWRlbXBvdGVuY3kgKG1lbW8tYmFzZWQpXG4gKiAtIFR4IGhhc2ggdHJhY2tpbmdcbiAqL1xuXG5pbXBvcnQgeyBIb3Jpem9uIH0gZnJvbSAnQHN0ZWxsYXIvc3RlbGxhci1zZGsnO1xuaW1wb3J0IHtcbiAgTmV0d29ya0NvbmZpZyxcbiAgVEVTVE5FVF9DT05GSUcsXG4gIFNldHRsZW1lbnRDb25maXJtYXRpb24sXG59IGZyb20gJy4uL2ludGVyZmFjZXMvdHlwZXMnO1xuaW1wb3J0IHsgY29tcHV0ZU1lbW8gfSBmcm9tICcuLi9pbnRlcmZhY2VzL2NyeXB0byc7XG5cbi8qKlxuICogU2V0dGxlbWVudCByZWNvcmQgZm9yIHRyYWNraW5nXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2V0dGxlbWVudFJlY29yZCB7XG4gIHN1Ym5ldElkOiBzdHJpbmc7XG4gIGJsb2NrTnVtYmVyOiBiaWdpbnQ7XG4gIG1lbW9IZXg6IHN0cmluZztcbiAgdHhIYXNoZXM6IHN0cmluZ1tdO1xuICBsZWRnZXJzOiBudW1iZXJbXTtcbiAgdGltZXN0YW1wOiBEYXRlO1xuICBzdGF0dXM6ICdwZW5kaW5nJyB8ICdjb25maXJtZWQnIHwgJ2ZhaWxlZCc7XG4gIGVycm9yPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFJlcGxheSBQcm90ZWN0aW9uIFNlcnZpY2VcbiAqXG4gKiBUcmFja3Mgc2V0dGxlbWVudHMgYW5kIHByZXZlbnRzIGRvdWJsZS1wcm9jZXNzaW5nIHVzaW5nIG1lbW8tYmFzZWQgZGVkdXBsaWNhdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIFJlcGxheVByb3RlY3Rpb25TZXJ2aWNlIHtcbiAgcHJpdmF0ZSBzZXJ2ZXI6IEhvcml6b24uU2VydmVyO1xuICBwcml2YXRlIGNvbmZpZzogTmV0d29ya0NvbmZpZztcblxuICAvKiogSW4tbWVtb3J5IHNldHRsZW1lbnQgbG9nIChjb3VsZCBiZSBwZXJzaXN0ZWQgdG8gZGF0YWJhc2UpICovXG4gIHByaXZhdGUgc2V0dGxlbWVudExvZzogTWFwPHN0cmluZywgU2V0dGxlbWVudFJlY29yZD4gPSBuZXcgTWFwKCk7XG5cbiAgY29uc3RydWN0b3IoY29uZmlnOiBOZXR3b3JrQ29uZmlnID0gVEVTVE5FVF9DT05GSUcpIHtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICB0aGlzLnNlcnZlciA9IG5ldyBIb3Jpem9uLlNlcnZlcihjb25maWcuaG9yaXpvblVybCk7XG4gIH1cblxuICAvKipcbiAgICogR2VuZXJhdGUgYSB1bmlxdWUga2V5IGZvciBhIHNldHRsZW1lbnQgKHN1Ym5ldF9pZCArIGJsb2NrX251bWJlcikuXG4gICAqL1xuICBwcml2YXRlIGdldFNldHRsZW1lbnRLZXkoc3VibmV0SWQ6IHN0cmluZywgYmxvY2tOdW1iZXI6IGJpZ2ludCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGAke3N1Ym5ldElkfToke2Jsb2NrTnVtYmVyfWA7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgYSBzZXR0bGVtZW50IGhhcyBhbHJlYWR5IGJlZW4gcHJvY2Vzc2VkLlxuICAgKlxuICAgKiBQZXIgaW50ZXJmYWNlcy5tZCBTZWN0aW9uIDg6XG4gICAqIC0gUXVlcnkgSG9yaXpvbiBmb3IgdHJhbnNhY3Rpb25zIHdpdGggdGhpcyBtZW1vXG4gICAqIC0gSWYgZm91bmQsIHRoZSBzZXR0bGVtZW50IGlzIGFscmVhZHkgY29tcGxldGVcbiAgICpcbiAgICogQHBhcmFtIHZhdWx0QWRkcmVzcyAtIFZhdWx0IGFkZHJlc3MgdG8gY2hlY2sgdHJhbnNhY3Rpb25zIGZvclxuICAgKiBAcGFyYW0gc3VibmV0SWQgLSBTdWJuZXQgaWRlbnRpZmllclxuICAgKiBAcGFyYW0gYmxvY2tOdW1iZXIgLSBCbG9jayBudW1iZXJcbiAgICogQHJldHVybnMgVHJ1ZSBpZiBhbHJlYWR5IHNldHRsZWQsIGZhbHNlIG90aGVyd2lzZVxuICAgKi9cbiAgYXN5bmMgaXNBbHJlYWR5U2V0dGxlZChcbiAgICB2YXVsdEFkZHJlc3M6IHN0cmluZyxcbiAgICBzdWJuZXRJZDogc3RyaW5nLFxuICAgIGJsb2NrTnVtYmVyOiBiaWdpbnRcbiAgKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgLy8gRmlyc3QgY2hlY2sgbG9jYWwgY2FjaGVcbiAgICBjb25zdCBrZXkgPSB0aGlzLmdldFNldHRsZW1lbnRLZXkoc3VibmV0SWQsIGJsb2NrTnVtYmVyKTtcbiAgICBjb25zdCBsb2NhbFJlY29yZCA9IHRoaXMuc2V0dGxlbWVudExvZy5nZXQoa2V5KTtcblxuICAgIGlmIChsb2NhbFJlY29yZCAmJiBsb2NhbFJlY29yZC5zdGF0dXMgPT09ICdjb25maXJtZWQnKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBvbi1jaGFpbiB2aWEgSG9yaXpvblxuICAgIGNvbnN0IG1lbW9CdWZmZXIgPSBjb21wdXRlTWVtbyhzdWJuZXRJZCwgYmxvY2tOdW1iZXIpO1xuICAgIC8vIFBhZCB0byAzMiBieXRlcyBmb3IgU3RlbGxhciBtZW1vIGhhc2hcbiAgICBjb25zdCBtZW1vSGFzaCA9IEJ1ZmZlci5jb25jYXQoW21lbW9CdWZmZXIsIEJ1ZmZlci5hbGxvYyg0LCAwKV0pLnRvU3RyaW5nKCdoZXgnKTtcblxuICAgIHRyeSB7XG4gICAgICAvLyBRdWVyeSB0cmFuc2FjdGlvbnMgZm9yIHRoaXMgdmF1bHRcbiAgICAgIGNvbnN0IHRyYW5zYWN0aW9ucyA9IGF3YWl0IHRoaXMuc2VydmVyXG4gICAgICAgIC50cmFuc2FjdGlvbnMoKVxuICAgICAgICAuZm9yQWNjb3VudCh2YXVsdEFkZHJlc3MpXG4gICAgICAgIC5vcmRlcignZGVzYycpXG4gICAgICAgIC5saW1pdCgyMDApIC8vIENoZWNrIHJlY2VudCB0cmFuc2FjdGlvbnNcbiAgICAgICAgLmNhbGwoKTtcblxuICAgICAgLy8gTG9vayBmb3IgbWF0Y2hpbmcgbWVtb1xuICAgICAgZm9yIChjb25zdCB0eCBvZiB0cmFuc2FjdGlvbnMucmVjb3Jkcykge1xuICAgICAgICBpZiAodHgubWVtb190eXBlID09PSAnaGFzaCcgJiYgdHgubWVtbyA9PT0gbWVtb0hhc2gpIHtcbiAgICAgICAgICAvLyBGb3VuZCBtYXRjaGluZyB0cmFuc2FjdGlvbiAtIHNldHRsZW1lbnQgYWxyZWFkeSBjb21wbGV0ZVxuICAgICAgICAgIC8vIFVwZGF0ZSBsb2NhbCBjYWNoZVxuICAgICAgICAgIHRoaXMuc2V0dGxlbWVudExvZy5zZXQoa2V5LCB7XG4gICAgICAgICAgICBzdWJuZXRJZCxcbiAgICAgICAgICAgIGJsb2NrTnVtYmVyLFxuICAgICAgICAgICAgbWVtb0hleDogbWVtb0J1ZmZlci50b1N0cmluZygnaGV4JyksXG4gICAgICAgICAgICB0eEhhc2hlczogW3R4Lmhhc2hdLFxuICAgICAgICAgICAgbGVkZ2VyczogW3R4LmxlZGdlcl9hdHRyXSxcbiAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUodHguY3JlYXRlZF9hdCksXG4gICAgICAgICAgICBzdGF0dXM6ICdjb25maXJtZWQnLFxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBJZiB3ZSBjYW4ndCBjaGVjayBIb3Jpem9uLCBlcnIgb24gdGhlIHNpZGUgb2YgY2F1dGlvblxuICAgICAgLy8gRG9uJ3QgcmV0dXJuIGZhbHNlIC0gY291bGQgY2F1c2UgZG91YmxlIHNldHRsZW1lbnRcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBjaGVjayBzZXR0bGVtZW50IHN0YXR1cyBvbiBIb3Jpem9uOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZWNvcmQgYSBwZW5kaW5nIHNldHRsZW1lbnQgKGJlZm9yZSBzdWJtaXNzaW9uKS5cbiAgICpcbiAgICogQHBhcmFtIHN1Ym5ldElkIC0gU3VibmV0IGlkZW50aWZpZXJcbiAgICogQHBhcmFtIGJsb2NrTnVtYmVyIC0gQmxvY2sgbnVtYmVyXG4gICAqIEByZXR1cm5zIFNldHRsZW1lbnQgcmVjb3JkXG4gICAqL1xuICByZWNvcmRQZW5kaW5nU2V0dGxlbWVudChcbiAgICBzdWJuZXRJZDogc3RyaW5nLFxuICAgIGJsb2NrTnVtYmVyOiBiaWdpbnRcbiAgKTogU2V0dGxlbWVudFJlY29yZCB7XG4gICAgY29uc3Qga2V5ID0gdGhpcy5nZXRTZXR0bGVtZW50S2V5KHN1Ym5ldElkLCBibG9ja051bWJlcik7XG4gICAgY29uc3QgbWVtb0J1ZmZlciA9IGNvbXB1dGVNZW1vKHN1Ym5ldElkLCBibG9ja051bWJlcik7XG5cbiAgICBjb25zdCByZWNvcmQ6IFNldHRsZW1lbnRSZWNvcmQgPSB7XG4gICAgICBzdWJuZXRJZCxcbiAgICAgIGJsb2NrTnVtYmVyLFxuICAgICAgbWVtb0hleDogbWVtb0J1ZmZlci50b1N0cmluZygnaGV4JyksXG4gICAgICB0eEhhc2hlczogW10sXG4gICAgICBsZWRnZXJzOiBbXSxcbiAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKSxcbiAgICAgIHN0YXR1czogJ3BlbmRpbmcnLFxuICAgIH07XG5cbiAgICB0aGlzLnNldHRsZW1lbnRMb2cuc2V0KGtleSwgcmVjb3JkKTtcbiAgICByZXR1cm4gcmVjb3JkO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlY29yZCBhIGNvbmZpcm1lZCBzZXR0bGVtZW50IChhZnRlciBzdWNjZXNzZnVsIHN1Ym1pc3Npb24pLlxuICAgKlxuICAgKiBAcGFyYW0gc3VibmV0SWQgLSBTdWJuZXQgaWRlbnRpZmllclxuICAgKiBAcGFyYW0gYmxvY2tOdW1iZXIgLSBCbG9jayBudW1iZXJcbiAgICogQHBhcmFtIHR4SGFzaGVzIC0gQXJyYXkgb2YgdHJhbnNhY3Rpb24gaGFzaGVzXG4gICAqIEBwYXJhbSBsZWRnZXJzIC0gQXJyYXkgb2YgbGVkZ2VyIG51bWJlcnNcbiAgICovXG4gIHJlY29yZENvbmZpcm1lZFNldHRsZW1lbnQoXG4gICAgc3VibmV0SWQ6IHN0cmluZyxcbiAgICBibG9ja051bWJlcjogYmlnaW50LFxuICAgIHR4SGFzaGVzOiBzdHJpbmdbXSxcbiAgICBsZWRnZXJzOiBudW1iZXJbXVxuICApOiB2b2lkIHtcbiAgICBjb25zdCBrZXkgPSB0aGlzLmdldFNldHRsZW1lbnRLZXkoc3VibmV0SWQsIGJsb2NrTnVtYmVyKTtcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuc2V0dGxlbWVudExvZy5nZXQoa2V5KTtcbiAgICBjb25zdCBtZW1vQnVmZmVyID0gY29tcHV0ZU1lbW8oc3VibmV0SWQsIGJsb2NrTnVtYmVyKTtcblxuICAgIGNvbnN0IHJlY29yZDogU2V0dGxlbWVudFJlY29yZCA9IHtcbiAgICAgIHN1Ym5ldElkLFxuICAgICAgYmxvY2tOdW1iZXIsXG4gICAgICBtZW1vSGV4OiBtZW1vQnVmZmVyLnRvU3RyaW5nKCdoZXgnKSxcbiAgICAgIHR4SGFzaGVzLFxuICAgICAgbGVkZ2VycyxcbiAgICAgIHRpbWVzdGFtcDogZXhpc3Rpbmc/LnRpbWVzdGFtcCB8fCBuZXcgRGF0ZSgpLFxuICAgICAgc3RhdHVzOiAnY29uZmlybWVkJyxcbiAgICB9O1xuXG4gICAgdGhpcy5zZXR0bGVtZW50TG9nLnNldChrZXksIHJlY29yZCk7XG4gIH1cblxuICAvKipcbiAgICogUmVjb3JkIGEgZmFpbGVkIHNldHRsZW1lbnQuXG4gICAqXG4gICAqIEBwYXJhbSBzdWJuZXRJZCAtIFN1Ym5ldCBpZGVudGlmaWVyXG4gICAqIEBwYXJhbSBibG9ja051bWJlciAtIEJsb2NrIG51bWJlclxuICAgKiBAcGFyYW0gZXJyb3IgLSBFcnJvciBtZXNzYWdlXG4gICAqL1xuICByZWNvcmRGYWlsZWRTZXR0bGVtZW50KFxuICAgIHN1Ym5ldElkOiBzdHJpbmcsXG4gICAgYmxvY2tOdW1iZXI6IGJpZ2ludCxcbiAgICBlcnJvcjogc3RyaW5nXG4gICk6IHZvaWQge1xuICAgIGNvbnN0IGtleSA9IHRoaXMuZ2V0U2V0dGxlbWVudEtleShzdWJuZXRJZCwgYmxvY2tOdW1iZXIpO1xuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5zZXR0bGVtZW50TG9nLmdldChrZXkpO1xuXG4gICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICBleGlzdGluZy5zdGF0dXMgPSAnZmFpbGVkJztcbiAgICAgIGV4aXN0aW5nLmVycm9yID0gZXJyb3I7XG4gICAgICB0aGlzLnNldHRsZW1lbnRMb2cuc2V0KGtleSwgZXhpc3RpbmcpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgc2V0dGxlbWVudCByZWNvcmQgZm9yIGEgc3BlY2lmaWMgYmxvY2suXG4gICAqXG4gICAqIEBwYXJhbSBzdWJuZXRJZCAtIFN1Ym5ldCBpZGVudGlmaWVyXG4gICAqIEBwYXJhbSBibG9ja051bWJlciAtIEJsb2NrIG51bWJlclxuICAgKiBAcmV0dXJucyBTZXR0bGVtZW50IHJlY29yZCBvciB1bmRlZmluZWRcbiAgICovXG4gIGdldFNldHRsZW1lbnRSZWNvcmQoXG4gICAgc3VibmV0SWQ6IHN0cmluZyxcbiAgICBibG9ja051bWJlcjogYmlnaW50XG4gICk6IFNldHRsZW1lbnRSZWNvcmQgfCB1bmRlZmluZWQge1xuICAgIGNvbnN0IGtleSA9IHRoaXMuZ2V0U2V0dGxlbWVudEtleShzdWJuZXRJZCwgYmxvY2tOdW1iZXIpO1xuICAgIHJldHVybiB0aGlzLnNldHRsZW1lbnRMb2cuZ2V0KGtleSk7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGFsbCBzZXR0bGVtZW50IHJlY29yZHMgZm9yIGEgc3VibmV0LlxuICAgKlxuICAgKiBAcGFyYW0gc3VibmV0SWQgLSBTdWJuZXQgaWRlbnRpZmllclxuICAgKiBAcmV0dXJucyBBcnJheSBvZiBzZXR0bGVtZW50IHJlY29yZHNcbiAgICovXG4gIGdldFN1Ym5ldFNldHRsZW1lbnRzKHN1Ym5ldElkOiBzdHJpbmcpOiBTZXR0bGVtZW50UmVjb3JkW10ge1xuICAgIGNvbnN0IHJlY29yZHM6IFNldHRsZW1lbnRSZWNvcmRbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBba2V5LCByZWNvcmRdIG9mIHRoaXMuc2V0dGxlbWVudExvZykge1xuICAgICAgaWYgKHJlY29yZC5zdWJuZXRJZCA9PT0gc3VibmV0SWQpIHtcbiAgICAgICAgcmVjb3Jkcy5wdXNoKHJlY29yZCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gU29ydCBieSBibG9jayBudW1iZXJcbiAgICByZXR1cm4gcmVjb3Jkcy5zb3J0KChhLCBiKSA9PiB7XG4gICAgICBpZiAoYS5ibG9ja051bWJlciA8IGIuYmxvY2tOdW1iZXIpIHJldHVybiAtMTtcbiAgICAgIGlmIChhLmJsb2NrTnVtYmVyID4gYi5ibG9ja051bWJlcikgcmV0dXJuIDE7XG4gICAgICByZXR1cm4gMDtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgc2V0dGxlbWVudCBjb25maXJtYXRpb24gZm9yIERldiBBLlxuICAgKlxuICAgKiBQZXIgZHVvLm1kIEludGVyZmFjZSAzIChTZXR0bGVtZW50IENvbmZpcm1hdGlvbik6XG4gICAqIHtcbiAgICogICBzdWJuZXRfaWQ6IHN0cmluZyxcbiAgICogICBibG9ja19udW1iZXI6IG51bWJlcixcbiAgICogICB0eF9oYXNoZXM6IHN0cmluZ1tdLFxuICAgKiAgIG1lbW86IHN0cmluZyxcbiAgICogICB0aW1lc3RhbXA6IHN0cmluZ1xuICAgKiB9XG4gICAqXG4gICAqIEBwYXJhbSBzdWJuZXRJZCAtIFN1Ym5ldCBpZGVudGlmaWVyXG4gICAqIEBwYXJhbSBibG9ja051bWJlciAtIEJsb2NrIG51bWJlclxuICAgKiBAcmV0dXJucyBTZXR0bGVtZW50IGNvbmZpcm1hdGlvbiBvciB1bmRlZmluZWQgaWYgbm90IGZvdW5kXG4gICAqL1xuICBnZXRTZXR0bGVtZW50Q29uZmlybWF0aW9uKFxuICAgIHN1Ym5ldElkOiBzdHJpbmcsXG4gICAgYmxvY2tOdW1iZXI6IGJpZ2ludFxuICApOiBTZXR0bGVtZW50Q29uZmlybWF0aW9uIHwgdW5kZWZpbmVkIHtcbiAgICBjb25zdCByZWNvcmQgPSB0aGlzLmdldFNldHRsZW1lbnRSZWNvcmQoc3VibmV0SWQsIGJsb2NrTnVtYmVyKTtcblxuICAgIGlmICghcmVjb3JkIHx8IHJlY29yZC5zdGF0dXMgIT09ICdjb25maXJtZWQnKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBzdWJuZXRfaWQ6IHJlY29yZC5zdWJuZXRJZCxcbiAgICAgIGJsb2NrX251bWJlcjogcmVjb3JkLmJsb2NrTnVtYmVyLFxuICAgICAgdHhfaGFzaGVzOiByZWNvcmQudHhIYXNoZXMsXG4gICAgICBtZW1vOiByZWNvcmQubWVtb0hleCxcbiAgICAgIHRpbWVzdGFtcDogcmVjb3JkLnRpbWVzdGFtcCxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIENsZWFyIGFsbCByZWNvcmRzIChmb3IgdGVzdGluZykuXG4gICAqL1xuICBjbGVhckFsbCgpOiB2b2lkIHtcbiAgICB0aGlzLnNldHRsZW1lbnRMb2cuY2xlYXIoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgY291bnQgb2Ygc2V0dGxlbWVudHMgYnkgc3RhdHVzLlxuICAgKi9cbiAgZ2V0U3RhdHMoKTogeyBwZW5kaW5nOiBudW1iZXI7IGNvbmZpcm1lZDogbnVtYmVyOyBmYWlsZWQ6IG51bWJlciB9IHtcbiAgICBsZXQgcGVuZGluZyA9IDA7XG4gICAgbGV0IGNvbmZpcm1lZCA9IDA7XG4gICAgbGV0IGZhaWxlZCA9IDA7XG5cbiAgICBmb3IgKGNvbnN0IHJlY29yZCBvZiB0aGlzLnNldHRsZW1lbnRMb2cudmFsdWVzKCkpIHtcbiAgICAgIHN3aXRjaCAocmVjb3JkLnN0YXR1cykge1xuICAgICAgICBjYXNlICdwZW5kaW5nJzpcbiAgICAgICAgICBwZW5kaW5nKys7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NvbmZpcm1lZCc6XG4gICAgICAgICAgY29uZmlybWVkKys7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2ZhaWxlZCc6XG4gICAgICAgICAgZmFpbGVkKys7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgcGVuZGluZywgY29uZmlybWVkLCBmYWlsZWQgfTtcbiAgfVxufVxuXG4vKipcbiAqIENyZWF0ZSBhIFJlcGxheVByb3RlY3Rpb25TZXJ2aWNlIGZvciB0ZXN0bmV0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUZXN0bmV0UmVwbGF5UHJvdGVjdGlvbigpOiBSZXBsYXlQcm90ZWN0aW9uU2VydmljZSB7XG4gIHJldHVybiBuZXcgUmVwbGF5UHJvdGVjdGlvblNlcnZpY2UoVEVTVE5FVF9DT05GSUcpO1xufVxuIl19