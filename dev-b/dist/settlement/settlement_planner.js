"use strict";
/**
 * ASTRAEUS - Settlement Planner
 *
 * Builds deterministic Stellar transactions from withdrawal queues.
 *
 * Per agent/plan.md Section B3 (Settlement Planner):
 * - Input: committed_state_root, withdrawal_queue
 * - Output: SettlementPlan { txs[] }
 * - Rules: batch per asset, deterministic ordering, memo = H(subnet_id || block_number)
 *
 * Per agent/interfaces.md Section 3 (Memo Format):
 * - memo = first_28_bytes(SHA256(subnet_id || block_number))
 *
 * Per agent/interfaces.md Section 7.2 (Transaction Construction):
 * - Native/Issued → Payment
 * - FX required → PathPaymentStrictReceive
 * - Memo encodes (subnet_id, block_number)
 * - Fails atomically if constraints violated
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettlementPlanner = void 0;
exports.createTestnetSettlementPlanner = createTestnetSettlementPlanner;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const types_1 = require("../interfaces/types");
const crypto_1 = require("../interfaces/crypto");
const pom_delta_1 = require("./pom_delta");
/**
 * Settlement Planner class
 *
 * Builds Stellar transactions from withdrawal queues following
 * the specifications in interfaces.md and plan.md.
 */
class SettlementPlanner {
    server;
    networkPassphrase;
    config;
    constructor(config = types_1.TESTNET_CONFIG) {
        this.config = config;
        this.server = new stellar_sdk_1.Horizon.Server(config.horizonUrl);
        this.networkPassphrase = config.networkPassphrase;
    }
    /**
     * Build a complete settlement plan from withdrawal queue.
     *
     * Per plan.md B3 and interfaces.md Section 3:
     * 1. Compute memo = first_28_bytes(SHA256(subnet_id || block_number))
     * 2. Group withdrawals by asset
     * 3. Sort deterministically within each group
     * 4. Build transactions (max 100 ops each)
     * 5. Attach memo to each transaction
     *
     * @param vaultAddress - Stellar address of the treasury vault (G... format)
     * @param subnetId - Subnet identifier (bytes32, hex string)
     * @param blockNumber - Block number (uint64)
     * @param withdrawals - Array of withdrawal intents from ExecutionCore
     * @returns Detailed settlement plan with all transactions
     */
    async buildSettlementPlan(vaultAddress, subnetId, blockNumber, withdrawals) {
        if (withdrawals.length === 0) {
            // No withdrawals to process
            const memoBuffer = (0, crypto_1.computeMemo)(subnetId, blockNumber);
            return {
                subnetId,
                blockNumber,
                memoHex: memoBuffer.toString('hex'),
                memoBuffer,
                transactions: [],
                totalWithdrawals: 0,
                totalsByAsset: new Map(),
            };
        }
        // Step 1: Compute memo per interfaces.md Section 3
        // memo = first_28_bytes(SHA256(subnet_id || block_number))
        const memoBuffer = (0, crypto_1.computeMemo)(subnetId, blockNumber);
        const memoHex = memoBuffer.toString('hex');
        // Step 2: Group withdrawals by asset
        const groupedWithdrawals = (0, pom_delta_1.groupWithdrawalsByAsset)(withdrawals);
        // Step 3: Build transactions for each asset group
        const transactions = [];
        const totalsByAsset = (0, pom_delta_1.computeNetOutflow)(withdrawals);
        // Load vault account for sequence number
        const vaultAccount = await this.server.loadAccount(vaultAddress);
        // Track sequence number for multiple transactions
        let sequenceNumber = BigInt(vaultAccount.sequenceNumber());
        for (const [assetId, assetWithdrawals] of groupedWithdrawals) {
            // Sort withdrawals deterministically within the group
            const sortedWithdrawals = (0, pom_delta_1.sortWithdrawalsDeterministically)(assetWithdrawals);
            // Batch into transactions (max 100 operations per tx)
            const batches = this.batchWithdrawals(sortedWithdrawals);
            for (const batch of batches) {
                sequenceNumber = sequenceNumber + 1n;
                const tx = await this.buildPaymentTransaction(vaultAddress, sequenceNumber.toString(), batch, memoBuffer);
                transactions.push({
                    transaction: tx,
                    withdrawals: batch,
                    assetId,
                });
            }
        }
        return {
            subnetId,
            blockNumber,
            memoHex,
            memoBuffer,
            transactions,
            totalWithdrawals: withdrawals.length,
            totalsByAsset,
        };
    }
    /**
     * Build a payment transaction for a batch of withdrawals.
     *
     * Per interfaces.md Section 7.2:
     * - Native → Payment
     * - Issued → Payment
     * - Each tx encodes memo
     * - Fails atomically
     *
     * @param vaultAddress - Source vault address
     * @param sequenceNumber - Transaction sequence number
     * @param withdrawals - Batch of withdrawals (same asset)
     * @param memo - 28-byte memo buffer
     * @returns Built (unsigned) transaction
     */
    async buildPaymentTransaction(vaultAddress, sequenceNumber, withdrawals, memo) {
        // Create account object with specific sequence number
        const sourceAccount = {
            accountId: () => vaultAddress,
            sequenceNumber: () => sequenceNumber,
            incrementSequenceNumber: () => { },
        };
        const txBuilder = new stellar_sdk_1.TransactionBuilder(sourceAccount, {
            fee: this.calculateFee(withdrawals.length).toString(),
            networkPassphrase: this.networkPassphrase,
        });
        // Add payment operation for each withdrawal
        for (const withdrawal of withdrawals) {
            const asset = this.toStellarAsset(withdrawal.asset_code, withdrawal.issuer);
            const destination = this.convertDestination(withdrawal.destination);
            const amount = this.stroopsToDecimal(BigInt(withdrawal.amount));
            txBuilder.addOperation(stellar_sdk_1.Operation.payment({
                destination,
                asset,
                amount,
            }));
        }
        // Add memo (MemoHash with 32 bytes, padded from 28)
        // Stellar MemoHash requires 32 bytes, so we pad with zeros
        const memoHash = Buffer.concat([memo, Buffer.alloc(4, 0)]);
        txBuilder.addMemo(stellar_sdk_1.Memo.hash(memoHash.toString('hex')));
        // Set timeout (5 minutes)
        txBuilder.setTimeout(300);
        return txBuilder.build();
    }
    /**
     * Build a PathPaymentStrictReceive transaction for FX settlement.
     *
     * Per plan.md B5 (FX Handling):
     * - Uses PathPaymentStrictReceive
     * - Never sets internal prices
     * - Never uses oracles
     * - FX happens after execution, never inside PoM
     *
     * @param vaultAddress - Source vault address
     * @param sequenceNumber - Transaction sequence number
     * @param withdrawal - Single withdrawal requiring FX
     * @param sendAsset - Asset the vault will send
     * @param sendMax - Maximum amount to send (with slippage)
     * @param path - Intermediate path assets
     * @param memo - 28-byte memo buffer
     * @returns Built (unsigned) transaction
     */
    async buildPathPaymentTransaction(vaultAddress, sequenceNumber, withdrawal, sendAsset, sendMax, path, memo) {
        const sourceAccount = {
            accountId: () => vaultAddress,
            sequenceNumber: () => sequenceNumber,
            incrementSequenceNumber: () => { },
        };
        const txBuilder = new stellar_sdk_1.TransactionBuilder(sourceAccount, {
            fee: this.calculateFee(1).toString(),
            networkPassphrase: this.networkPassphrase,
        });
        const destAsset = this.toStellarAsset(withdrawal.asset_code, withdrawal.issuer);
        const destination = this.convertDestination(withdrawal.destination);
        const destAmount = this.stroopsToDecimal(BigInt(withdrawal.amount));
        const sendMaxDecimal = this.stroopsToDecimal(sendMax);
        txBuilder.addOperation(stellar_sdk_1.Operation.pathPaymentStrictReceive({
            sendAsset: this.toStellarAsset(sendAsset.code, sendAsset.issuer),
            sendMax: sendMaxDecimal,
            destination,
            destAsset,
            destAmount,
            path,
        }));
        // Add memo
        const memoHash = Buffer.concat([memo, Buffer.alloc(4, 0)]);
        txBuilder.addMemo(stellar_sdk_1.Memo.hash(memoHash.toString('hex')));
        txBuilder.setTimeout(300);
        return txBuilder.build();
    }
    /**
     * Batch withdrawals into groups respecting Stellar's max operations limit.
     *
     * Per STELLAR_CONSTANTS.MAX_OPS_PER_TX (100 operations max)
     *
     * @param withdrawals - Sorted array of withdrawals
     * @returns Array of batches
     */
    batchWithdrawals(withdrawals) {
        const batches = [];
        const maxOps = types_1.STELLAR_CONSTANTS.MAX_OPS_PER_TX;
        for (let i = 0; i < withdrawals.length; i += maxOps) {
            batches.push(withdrawals.slice(i, i + maxOps));
        }
        return batches;
    }
    /**
     * Convert withdrawal destination to Stellar address.
     *
     * Destination comes from Dev A as bytes32 (hex) or G... address.
     * Per contracts/WITHDRAWAL_QUEUE_FORMAT.md: destination is Ed25519 pubkey
     *
     * @param destination - Destination from withdrawal intent
     * @returns Stellar address (G... format)
     */
    convertDestination(destination) {
        if (destination.startsWith('G')) {
            // Already in Stellar format
            return destination;
        }
        // Convert from hex (bytes32) to Stellar address
        return (0, crypto_1.hexToStellarKey)(destination);
    }
    /**
     * Convert asset to Stellar SDK Asset.
     *
     * Per contracts/WITHDRAWAL_QUEUE_FORMAT.md:
     * - issuer = "NATIVE" for XLM
     * - issuer = bytes32 hex for issued assets
     *
     * @param assetCode - Asset code (e.g., "USDC", "XLM")
     * @param issuer - "NATIVE" or issuer address/hex
     * @returns Stellar SDK Asset
     */
    toStellarAsset(assetCode, issuer) {
        if (issuer.toUpperCase() === 'NATIVE') {
            return stellar_sdk_1.Asset.native();
        }
        // Convert issuer to Stellar format if needed
        let stellarIssuer;
        if (issuer.startsWith('G')) {
            stellarIssuer = issuer;
        }
        else {
            stellarIssuer = (0, crypto_1.hexToStellarKey)(issuer);
        }
        return new stellar_sdk_1.Asset(assetCode, stellarIssuer);
    }
    /**
     * Convert stroops to decimal string for Stellar SDK.
     *
     * Stellar SDK uses string amounts with 7 decimal places.
     * 1 XLM = 10,000,000 stroops
     *
     * @param stroops - Amount in stroops
     * @returns Decimal string (e.g., "10.0000000")
     */
    stroopsToDecimal(stroops) {
        const str = stroops.toString().padStart(8, '0');
        const whole = str.slice(0, -7) || '0';
        const decimal = str.slice(-7);
        return `${whole}.${decimal}`;
    }
    /**
     * Calculate transaction fee based on number of operations.
     *
     * Base fee is 100 stroops per operation.
     *
     * @param numOperations - Number of operations in transaction
     * @returns Total fee in stroops
     */
    calculateFee(numOperations) {
        const baseFeePerOp = 100;
        return baseFeePerOp * numOperations;
    }
}
exports.SettlementPlanner = SettlementPlanner;
/**
 * Create a SettlementPlanner for testnet
 */
function createTestnetSettlementPlanner() {
    return new SettlementPlanner(types_1.TESTNET_CONFIG);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGxlbWVudF9wbGFubmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3NldHRsZW1lbnQvc2V0dGxlbWVudF9wbGFubmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBa0JHOzs7QUFnWUgsd0VBRUM7QUFoWUQsc0RBUzhCO0FBQzlCLCtDQU82QjtBQUM3QixpREFBb0U7QUFDcEUsMkNBSXFCO0FBZ0NyQjs7Ozs7R0FLRztBQUNILE1BQWEsaUJBQWlCO0lBQ3BCLE1BQU0sQ0FBaUI7SUFDdkIsaUJBQWlCLENBQVM7SUFDMUIsTUFBTSxDQUFnQjtJQUU5QixZQUFZLFNBQXdCLHNCQUFjO1FBQ2hELElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxxQkFBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQztJQUNwRCxDQUFDO0lBRUQ7Ozs7Ozs7Ozs7Ozs7OztPQWVHO0lBQ0gsS0FBSyxDQUFDLG1CQUFtQixDQUN2QixZQUFvQixFQUNwQixRQUFnQixFQUNoQixXQUFtQixFQUNuQixXQUErQjtRQUUvQixJQUFJLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDN0IsNEJBQTRCO1lBQzVCLE1BQU0sVUFBVSxHQUFHLElBQUEsb0JBQVcsRUFBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDdEQsT0FBTztnQkFDTCxRQUFRO2dCQUNSLFdBQVc7Z0JBQ1gsT0FBTyxFQUFFLFVBQVUsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO2dCQUNuQyxVQUFVO2dCQUNWLFlBQVksRUFBRSxFQUFFO2dCQUNoQixnQkFBZ0IsRUFBRSxDQUFDO2dCQUNuQixhQUFhLEVBQUUsSUFBSSxHQUFHLEVBQUU7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TyxDQUFDLFFBQVEsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDaEQsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUM7UUFDdEMsTUFBTSxPQUFPLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlCLE9BQU8sR0FBRyxLQUFLLElBQUksT0FBTyxFQUFFLENBQUM7SUFDL0IsQ0FBQztJQUVEOzs7Ozs7O09BT0c7SUFDSyxZQUFZLENBQUMsYUFBcUI7UUFDeEMsTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDO1FBQ3pCLE9BQU8sWUFBWSxHQUFHLGFBQWEsQ0FBQztJQUN0QyxDQUFDO0NBQ0Y7QUE1VEQsOENBNFRDO0FBRUQ7O0dBRUc7QUFDSCxTQUFnQiw4QkFBOEI7SUFDNUMsT0FBTyxJQUFJLGlCQUFpQixDQUFDLHNCQUFjLENBQUMsQ0FBQztBQUMvQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBBU1RSQUVVUyAtIFNldHRsZW1lbnQgUGxhbm5lclxuICpcbiAqIEJ1aWxkcyBkZXRlcm1pbmlzdGljIFN0ZWxsYXIgdHJhbnNhY3Rpb25zIGZyb20gd2l0aGRyYXdhbCBxdWV1ZXMuXG4gKlxuICogUGVyIGFnZW50L3BsYW4ubWQgU2VjdGlvbiBCMyAoU2V0dGxlbWVudCBQbGFubmVyKTpcbiAqIC0gSW5wdXQ6IGNvbW1pdHRlZF9zdGF0ZV9yb290LCB3aXRoZHJhd2FsX3F1ZXVlXG4gKiAtIE91dHB1dDogU2V0dGxlbWVudFBsYW4geyB0eHNbXSB9XG4gKiAtIFJ1bGVzOiBiYXRjaCBwZXIgYXNzZXQsIGRldGVybWluaXN0aWMgb3JkZXJpbmcsIG1lbW8gPSBIKHN1Ym5ldF9pZCB8fCBibG9ja19udW1iZXIpXG4gKlxuICogUGVyIGFnZW50L2ludGVyZmFjZXMubWQgU2VjdGlvbiAzIChNZW1vIEZvcm1hdCk6XG4gKiAtIG1lbW8gPSBmaXJzdF8yOF9ieXRlcyhTSEEyNTYoc3VibmV0X2lkIHx8IGJsb2NrX251bWJlcikpXG4gKlxuICogUGVyIGFnZW50L2ludGVyZmFjZXMubWQgU2VjdGlvbiA3LjIgKFRyYW5zYWN0aW9uIENvbnN0cnVjdGlvbik6XG4gKiAtIE5hdGl2ZS9Jc3N1ZWQg4oaSIFBheW1lbnRcbiAqIC0gRlggcmVxdWlyZWQg4oaSIFBhdGhQYXltZW50U3RyaWN0UmVjZWl2ZVxuICogLSBNZW1vIGVuY29kZXMgKHN1Ym5ldF9pZCwgYmxvY2tfbnVtYmVyKVxuICogLSBGYWlscyBhdG9taWNhbGx5IGlmIGNvbnN0cmFpbnRzIHZpb2xhdGVkXG4gKi9cblxuaW1wb3J0IHtcbiAgSG9yaXpvbixcbiAgVHJhbnNhY3Rpb25CdWlsZGVyLFxuICBPcGVyYXRpb24sXG4gIEFzc2V0LFxuICBNZW1vLFxuICBLZXlwYWlyLFxuICBUcmFuc2FjdGlvbixcbiAgRmVlQnVtcFRyYW5zYWN0aW9uLFxufSBmcm9tICdAc3RlbGxhci9zdGVsbGFyLXNkayc7XG5pbXBvcnQge1xuICBXaXRoZHJhd2FsSW50ZW50LFxuICBTZXR0bGVtZW50UGxhbixcbiAgTmV0d29ya0NvbmZpZyxcbiAgVEVTVE5FVF9DT05GSUcsXG4gIFNURUxMQVJfQ09OU1RBTlRTLFxuICBBc3NldCBhcyBBc3RyYWV1c0Fzc2V0LFxufSBmcm9tICcuLi9pbnRlcmZhY2VzL3R5cGVzJztcbmltcG9ydCB7IGNvbXB1dGVNZW1vLCBoZXhUb1N0ZWxsYXJLZXkgfSBmcm9tICcuLi9pbnRlcmZhY2VzL2NyeXB0byc7XG5pbXBvcnQge1xuICBncm91cFdpdGhkcmF3YWxzQnlBc3NldCxcbiAgc29ydFdpdGhkcmF3YWxzRGV0ZXJtaW5pc3RpY2FsbHksXG4gIGNvbXB1dGVOZXRPdXRmbG93LFxufSBmcm9tICcuL3BvbV9kZWx0YSc7XG5cbi8qKlxuICogU2V0dGxlbWVudCB0cmFuc2FjdGlvbiB3aXRoIG1ldGFkYXRhXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2V0dGxlbWVudFRyYW5zYWN0aW9uIHtcbiAgLyoqIFRoZSBidWlsdCBTdGVsbGFyIHRyYW5zYWN0aW9uICh1bnNpZ25lZCkgKi9cbiAgdHJhbnNhY3Rpb246IFRyYW5zYWN0aW9uO1xuICAvKiogV2l0aGRyYXdhbHMgaW5jbHVkZWQgaW4gdGhpcyB0cmFuc2FjdGlvbiAqL1xuICB3aXRoZHJhd2FsczogV2l0aGRyYXdhbEludGVudFtdO1xuICAvKiogQXNzZXQgYmVpbmcgc2V0dGxlZCAqL1xuICBhc3NldElkOiBzdHJpbmc7XG59XG5cbi8qKlxuICogRXh0ZW5kZWQgc2V0dGxlbWVudCBwbGFuIHdpdGggdHJhbnNhY3Rpb24gZGV0YWlsc1xuICovXG5leHBvcnQgaW50ZXJmYWNlIERldGFpbGVkU2V0dGxlbWVudFBsYW4ge1xuICBzdWJuZXRJZDogc3RyaW5nO1xuICBibG9ja051bWJlcjogYmlnaW50O1xuICAvKiogMjgtYnl0ZSBtZW1vIGFzIGhleCBzdHJpbmcgKi9cbiAgbWVtb0hleDogc3RyaW5nO1xuICAvKiogTWVtbyBhcyBCdWZmZXIgZm9yIFN0ZWxsYXIgU0RLICovXG4gIG1lbW9CdWZmZXI6IEJ1ZmZlcjtcbiAgLyoqIFNldHRsZW1lbnQgdHJhbnNhY3Rpb25zICovXG4gIHRyYW5zYWN0aW9uczogU2V0dGxlbWVudFRyYW5zYWN0aW9uW107XG4gIC8qKiBUb3RhbCB3aXRoZHJhd2FscyBwcm9jZXNzZWQgKi9cbiAgdG90YWxXaXRoZHJhd2FsczogbnVtYmVyO1xuICAvKiogVG90YWwgYW1vdW50IHBlciBhc3NldCAoZm9yIHZlcmlmaWNhdGlvbikgKi9cbiAgdG90YWxzQnlBc3NldDogTWFwPHN0cmluZywgYmlnaW50Pjtcbn1cblxuLyoqXG4gKiBTZXR0bGVtZW50IFBsYW5uZXIgY2xhc3NcbiAqXG4gKiBCdWlsZHMgU3RlbGxhciB0cmFuc2FjdGlvbnMgZnJvbSB3aXRoZHJhd2FsIHF1ZXVlcyBmb2xsb3dpbmdcbiAqIHRoZSBzcGVjaWZpY2F0aW9ucyBpbiBpbnRlcmZhY2VzLm1kIGFuZCBwbGFuLm1kLlxuICovXG5leHBvcnQgY2xhc3MgU2V0dGxlbWVudFBsYW5uZXIge1xuICBwcml2YXRlIHNlcnZlcjogSG9yaXpvbi5TZXJ2ZXI7XG4gIHByaXZhdGUgbmV0d29ya1Bhc3NwaHJhc2U6IHN0cmluZztcbiAgcHJpdmF0ZSBjb25maWc6IE5ldHdvcmtDb25maWc7XG5cbiAgY29uc3RydWN0b3IoY29uZmlnOiBOZXR3b3JrQ29uZmlnID0gVEVTVE5FVF9DT05GSUcpIHtcbiAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgICB0aGlzLnNlcnZlciA9IG5ldyBIb3Jpem9uLlNlcnZlcihjb25maWcuaG9yaXpvblVybCk7XG4gICAgdGhpcy5uZXR3b3JrUGFzc3BocmFzZSA9IGNvbmZpZy5uZXR3b3JrUGFzc3BocmFzZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBCdWlsZCBhIGNvbXBsZXRlIHNldHRsZW1lbnQgcGxhbiBmcm9tIHdpdGhkcmF3YWwgcXVldWUuXG4gICAqXG4gICAqIFBlciBwbGFuLm1kIEIzIGFuZCBpbnRlcmZhY2VzLm1kIFNlY3Rpb24gMzpcbiAgICogMS4gQ29tcHV0ZSBtZW1vID0gZmlyc3RfMjhfYnl0ZXMoU0hBMjU2KHN1Ym5ldF9pZCB8fCBibG9ja19udW1iZXIpKVxuICAgKiAyLiBHcm91cCB3aXRoZHJhd2FscyBieSBhc3NldFxuICAgKiAzLiBTb3J0IGRldGVybWluaXN0aWNhbGx5IHdpdGhpbiBlYWNoIGdyb3VwXG4gICAqIDQuIEJ1aWxkIHRyYW5zYWN0aW9ucyAobWF4IDEwMCBvcHMgZWFjaClcbiAgICogNS4gQXR0YWNoIG1lbW8gdG8gZWFjaCB0cmFuc2FjdGlvblxuICAgKlxuICAgKiBAcGFyYW0gdmF1bHRBZGRyZXNzIC0gU3RlbGxhciBhZGRyZXNzIG9mIHRoZSB0cmVhc3VyeSB2YXVsdCAoRy4uLiBmb3JtYXQpXG4gICAqIEBwYXJhbSBzdWJuZXRJZCAtIFN1Ym5ldCBpZGVudGlmaWVyIChieXRlczMyLCBoZXggc3RyaW5nKVxuICAgKiBAcGFyYW0gYmxvY2tOdW1iZXIgLSBCbG9jayBudW1iZXIgKHVpbnQ2NClcbiAgICogQHBhcmFtIHdpdGhkcmF3YWxzIC0gQXJyYXkgb2Ygd2l0aGRyYXdhbCBpbnRlbnRzIGZyb20gRXhlY3V0aW9uQ29yZVxuICAgKiBAcmV0dXJucyBEZXRhaWxlZCBzZXR0bGVtZW50IHBsYW4gd2l0aCBhbGwgdHJhbnNhY3Rpb25zXG4gICAqL1xuICBhc3luYyBidWlsZFNldHRsZW1lbnRQbGFuKFxuICAgIHZhdWx0QWRkcmVzczogc3RyaW5nLFxuICAgIHN1Ym5ldElkOiBzdHJpbmcsXG4gICAgYmxvY2tOdW1iZXI6IGJpZ2ludCxcbiAgICB3aXRoZHJhd2FsczogV2l0aGRyYXdhbEludGVudFtdXG4gICk6IFByb21pc2U8RGV0YWlsZWRTZXR0bGVtZW50UGxhbj4ge1xuICAgIGlmICh3aXRoZHJhd2Fscy5sZW5ndGggPT09IDApIHtcbiAgICAgIC8vIE5vIHdpdGhkcmF3YWxzIHRvIHByb2Nlc3NcbiAgICAgIGNvbnN0IG1lbW9CdWZmZXIgPSBjb21wdXRlTWVtbyhzdWJuZXRJZCwgYmxvY2tOdW1iZXIpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3VibmV0SWQsXG4gICAgICAgIGJsb2NrTnVtYmVyLFxuICAgICAgICBtZW1vSGV4OiBtZW1vQnVmZmVyLnRvU3RyaW5nKCdoZXgnKSxcbiAgICAgICAgbWVtb0J1ZmZlcixcbiAgICAgICAgdHJhbnNhY3Rpb25zOiBbXSxcbiAgICAgICAgdG90YWxXaXRoZHJhd2FsczogMCxcbiAgICAgICAgdG90YWxzQnlBc3NldDogbmV3IE1hcCgpLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBTdGVwIDE6IENvbXB1dGUgbWVtbyBwZXIgaW50ZXJmYWNlcy5tZCBTZWN0aW9uIDNcbiAgICAvLyBtZW1vID0gZmlyc3RfMjhfYnl0ZXMoU0hBMjU2KHN1Ym5ldF9pZCB8fCBibG9ja19udW1iZXIpKVxuICAgIGNvbnN0IG1lbW9CdWZmZXIgPSBjb21wdXRlTWVtbyhzdWJuZXRJZCwgYmxvY2tOdW1iZXIpO1xuICAgIGNvbnN0IG1lbW9IZXggPSBtZW1vQnVmZmVyLnRvU3RyaW5nKCdoZXgnKTtcblxuICAgIC8vIFN0ZXAgMjogR3JvdXAgd2l0aGRyYXdhbHMgYnkgYXNzZXRcbiAgICBjb25zdCBncm91cGVkV2l0aGRyYXdhbHMgPSBncm91cFdpdGhkcmF3YWxzQnlBc3NldCh3aXRoZHJhd2Fscyk7XG5cbiAgICAvLyBTdGVwIDM6IEJ1aWxkIHRyYW5zYWN0aW9ucyBmb3IgZWFjaCBhc3NldCBncm91cFxuICAgIGNvbnN0IHRyYW5zYWN0aW9uczogU2V0dGxlbWVudFRyYW5zYWN0aW9uW10gPSBbXTtcbiAgICBjb25zdCB0b3RhbHNCeUFzc2V0ID0gY29tcHV0ZU5ldE91dGZsb3cod2l0aGRyYXdhbHMpO1xuXG4gICAgLy8gTG9hZCB2YXVsdCBhY2NvdW50IGZvciBzZXF1ZW5jZSBudW1iZXJcbiAgICBjb25zdCB2YXVsdEFjY291bnQgPSBhd2FpdCB0aGlzLnNlcnZlci5sb2FkQWNjb3VudCh2YXVsdEFkZHJlc3MpO1xuXG4gICAgLy8gVHJhY2sgc2VxdWVuY2UgbnVtYmVyIGZvciBtdWx0aXBsZSB0cmFuc2FjdGlvbnNcbiAgICBsZXQgc2VxdWVuY2VOdW1iZXIgPSBCaWdJbnQodmF1bHRBY2NvdW50LnNlcXVlbmNlTnVtYmVyKCkpO1xuXG4gICAgZm9yIChjb25zdCBbYXNzZXRJZCwgYXNzZXRXaXRoZHJhd2Fsc10gb2YgZ3JvdXBlZFdpdGhkcmF3YWxzKSB7XG4gICAgICAvLyBTb3J0IHdpdGhkcmF3YWxzIGRldGVybWluaXN0aWNhbGx5IHdpdGhpbiB0aGUgZ3JvdXBcbiAgICAgIGNvbnN0IHNvcnRlZFdpdGhkcmF3YWxzID0gc29ydFdpdGhkcmF3YWxzRGV0ZXJtaW5pc3RpY2FsbHkoYXNzZXRXaXRoZHJhd2Fscyk7XG5cbiAgICAgIC8vIEJhdGNoIGludG8gdHJhbnNhY3Rpb25zIChtYXggMTAwIG9wZXJhdGlvbnMgcGVyIHR4KVxuICAgICAgY29uc3QgYmF0Y2hlcyA9IHRoaXMuYmF0Y2hXaXRoZHJhd2Fscyhzb3J0ZWRXaXRoZHJhd2Fscyk7XG5cbiAgICAgIGZvciAoY29uc3QgYmF0Y2ggb2YgYmF0Y2hlcykge1xuICAgICAgICBzZXF1ZW5jZU51bWJlciA9IHNlcXVlbmNlTnVtYmVyICsgMW47XG5cbiAgICAgICAgY29uc3QgdHggPSBhd2FpdCB0aGlzLmJ1aWxkUGF5bWVudFRyYW5zYWN0aW9uKFxuICAgICAgICAgIHZhdWx0QWRkcmVzcyxcbiAgICAgICAgICBzZXF1ZW5jZU51bWJlci50b1N0cmluZygpLFxuICAgICAgICAgIGJhdGNoLFxuICAgICAgICAgIG1lbW9CdWZmZXJcbiAgICAgICAgKTtcblxuICAgICAgICB0cmFuc2FjdGlvbnMucHVzaCh7XG4gICAgICAgICAgdHJhbnNhY3Rpb246IHR4LFxuICAgICAgICAgIHdpdGhkcmF3YWxzOiBiYXRjaCxcbiAgICAgICAgICBhc3NldElkLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3VibmV0SWQsXG4gICAgICBibG9ja051bWJlcixcbiAgICAgIG1lbW9IZXgsXG4gICAgICBtZW1vQnVmZmVyLFxuICAgICAgdHJhbnNhY3Rpb25zLFxuICAgICAgdG90YWxXaXRoZHJhd2Fsczogd2l0aGRyYXdhbHMubGVuZ3RoLFxuICAgICAgdG90YWxzQnlBc3NldCxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEJ1aWxkIGEgcGF5bWVudCB0cmFuc2FjdGlvbiBmb3IgYSBiYXRjaCBvZiB3aXRoZHJhd2Fscy5cbiAgICpcbiAgICogUGVyIGludGVyZmFjZXMubWQgU2VjdGlvbiA3LjI6XG4gICAqIC0gTmF0aXZlIOKGkiBQYXltZW50XG4gICAqIC0gSXNzdWVkIOKGkiBQYXltZW50XG4gICAqIC0gRWFjaCB0eCBlbmNvZGVzIG1lbW9cbiAgICogLSBGYWlscyBhdG9taWNhbGx5XG4gICAqXG4gICAqIEBwYXJhbSB2YXVsdEFkZHJlc3MgLSBTb3VyY2UgdmF1bHQgYWRkcmVzc1xuICAgKiBAcGFyYW0gc2VxdWVuY2VOdW1iZXIgLSBUcmFuc2FjdGlvbiBzZXF1ZW5jZSBudW1iZXJcbiAgICogQHBhcmFtIHdpdGhkcmF3YWxzIC0gQmF0Y2ggb2Ygd2l0aGRyYXdhbHMgKHNhbWUgYXNzZXQpXG4gICAqIEBwYXJhbSBtZW1vIC0gMjgtYnl0ZSBtZW1vIGJ1ZmZlclxuICAgKiBAcmV0dXJucyBCdWlsdCAodW5zaWduZWQpIHRyYW5zYWN0aW9uXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGJ1aWxkUGF5bWVudFRyYW5zYWN0aW9uKFxuICAgIHZhdWx0QWRkcmVzczogc3RyaW5nLFxuICAgIHNlcXVlbmNlTnVtYmVyOiBzdHJpbmcsXG4gICAgd2l0aGRyYXdhbHM6IFdpdGhkcmF3YWxJbnRlbnRbXSxcbiAgICBtZW1vOiBCdWZmZXJcbiAgKTogUHJvbWlzZTxUcmFuc2FjdGlvbj4ge1xuICAgIC8vIENyZWF0ZSBhY2NvdW50IG9iamVjdCB3aXRoIHNwZWNpZmljIHNlcXVlbmNlIG51bWJlclxuICAgIGNvbnN0IHNvdXJjZUFjY291bnQgPSB7XG4gICAgICBhY2NvdW50SWQ6ICgpID0+IHZhdWx0QWRkcmVzcyxcbiAgICAgIHNlcXVlbmNlTnVtYmVyOiAoKSA9PiBzZXF1ZW5jZU51bWJlcixcbiAgICAgIGluY3JlbWVudFNlcXVlbmNlTnVtYmVyOiAoKSA9PiB7fSxcbiAgICB9O1xuXG4gICAgY29uc3QgdHhCdWlsZGVyID0gbmV3IFRyYW5zYWN0aW9uQnVpbGRlcihzb3VyY2VBY2NvdW50IGFzIGFueSwge1xuICAgICAgZmVlOiB0aGlzLmNhbGN1bGF0ZUZlZSh3aXRoZHJhd2Fscy5sZW5ndGgpLnRvU3RyaW5nKCksXG4gICAgICBuZXR3b3JrUGFzc3BocmFzZTogdGhpcy5uZXR3b3JrUGFzc3BocmFzZSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCBwYXltZW50IG9wZXJhdGlvbiBmb3IgZWFjaCB3aXRoZHJhd2FsXG4gICAgZm9yIChjb25zdCB3aXRoZHJhd2FsIG9mIHdpdGhkcmF3YWxzKSB7XG4gICAgICBjb25zdCBhc3NldCA9IHRoaXMudG9TdGVsbGFyQXNzZXQod2l0aGRyYXdhbC5hc3NldF9jb2RlLCB3aXRoZHJhd2FsLmlzc3Vlcik7XG4gICAgICBjb25zdCBkZXN0aW5hdGlvbiA9IHRoaXMuY29udmVydERlc3RpbmF0aW9uKHdpdGhkcmF3YWwuZGVzdGluYXRpb24pO1xuICAgICAgY29uc3QgYW1vdW50ID0gdGhpcy5zdHJvb3BzVG9EZWNpbWFsKEJpZ0ludCh3aXRoZHJhd2FsLmFtb3VudCkpO1xuXG4gICAgICB0eEJ1aWxkZXIuYWRkT3BlcmF0aW9uKFxuICAgICAgICBPcGVyYXRpb24ucGF5bWVudCh7XG4gICAgICAgICAgZGVzdGluYXRpb24sXG4gICAgICAgICAgYXNzZXQsXG4gICAgICAgICAgYW1vdW50LFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBBZGQgbWVtbyAoTWVtb0hhc2ggd2l0aCAzMiBieXRlcywgcGFkZGVkIGZyb20gMjgpXG4gICAgLy8gU3RlbGxhciBNZW1vSGFzaCByZXF1aXJlcyAzMiBieXRlcywgc28gd2UgcGFkIHdpdGggemVyb3NcbiAgICBjb25zdCBtZW1vSGFzaCA9IEJ1ZmZlci5jb25jYXQoW21lbW8sIEJ1ZmZlci5hbGxvYyg0LCAwKV0pO1xuICAgIHR4QnVpbGRlci5hZGRNZW1vKE1lbW8uaGFzaChtZW1vSGFzaC50b1N0cmluZygnaGV4JykpKTtcblxuICAgIC8vIFNldCB0aW1lb3V0ICg1IG1pbnV0ZXMpXG4gICAgdHhCdWlsZGVyLnNldFRpbWVvdXQoMzAwKTtcblxuICAgIHJldHVybiB0eEJ1aWxkZXIuYnVpbGQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBCdWlsZCBhIFBhdGhQYXltZW50U3RyaWN0UmVjZWl2ZSB0cmFuc2FjdGlvbiBmb3IgRlggc2V0dGxlbWVudC5cbiAgICpcbiAgICogUGVyIHBsYW4ubWQgQjUgKEZYIEhhbmRsaW5nKTpcbiAgICogLSBVc2VzIFBhdGhQYXltZW50U3RyaWN0UmVjZWl2ZVxuICAgKiAtIE5ldmVyIHNldHMgaW50ZXJuYWwgcHJpY2VzXG4gICAqIC0gTmV2ZXIgdXNlcyBvcmFjbGVzXG4gICAqIC0gRlggaGFwcGVucyBhZnRlciBleGVjdXRpb24sIG5ldmVyIGluc2lkZSBQb01cbiAgICpcbiAgICogQHBhcmFtIHZhdWx0QWRkcmVzcyAtIFNvdXJjZSB2YXVsdCBhZGRyZXNzXG4gICAqIEBwYXJhbSBzZXF1ZW5jZU51bWJlciAtIFRyYW5zYWN0aW9uIHNlcXVlbmNlIG51bWJlclxuICAgKiBAcGFyYW0gd2l0aGRyYXdhbCAtIFNpbmdsZSB3aXRoZHJhd2FsIHJlcXVpcmluZyBGWFxuICAgKiBAcGFyYW0gc2VuZEFzc2V0IC0gQXNzZXQgdGhlIHZhdWx0IHdpbGwgc2VuZFxuICAgKiBAcGFyYW0gc2VuZE1heCAtIE1heGltdW0gYW1vdW50IHRvIHNlbmQgKHdpdGggc2xpcHBhZ2UpXG4gICAqIEBwYXJhbSBwYXRoIC0gSW50ZXJtZWRpYXRlIHBhdGggYXNzZXRzXG4gICAqIEBwYXJhbSBtZW1vIC0gMjgtYnl0ZSBtZW1vIGJ1ZmZlclxuICAgKiBAcmV0dXJucyBCdWlsdCAodW5zaWduZWQpIHRyYW5zYWN0aW9uXG4gICAqL1xuICBhc3luYyBidWlsZFBhdGhQYXltZW50VHJhbnNhY3Rpb24oXG4gICAgdmF1bHRBZGRyZXNzOiBzdHJpbmcsXG4gICAgc2VxdWVuY2VOdW1iZXI6IHN0cmluZyxcbiAgICB3aXRoZHJhd2FsOiBXaXRoZHJhd2FsSW50ZW50LFxuICAgIHNlbmRBc3NldDogQXN0cmFldXNBc3NldCxcbiAgICBzZW5kTWF4OiBiaWdpbnQsXG4gICAgcGF0aDogQXNzZXRbXSxcbiAgICBtZW1vOiBCdWZmZXJcbiAgKTogUHJvbWlzZTxUcmFuc2FjdGlvbj4ge1xuICAgIGNvbnN0IHNvdXJjZUFjY291bnQgPSB7XG4gICAgICBhY2NvdW50SWQ6ICgpID0+IHZhdWx0QWRkcmVzcyxcbiAgICAgIHNlcXVlbmNlTnVtYmVyOiAoKSA9PiBzZXF1ZW5jZU51bWJlcixcbiAgICAgIGluY3JlbWVudFNlcXVlbmNlTnVtYmVyOiAoKSA9PiB7fSxcbiAgICB9O1xuXG4gICAgY29uc3QgdHhCdWlsZGVyID0gbmV3IFRyYW5zYWN0aW9uQnVpbGRlcihzb3VyY2VBY2NvdW50IGFzIGFueSwge1xuICAgICAgZmVlOiB0aGlzLmNhbGN1bGF0ZUZlZSgxKS50b1N0cmluZygpLFxuICAgICAgbmV0d29ya1Bhc3NwaHJhc2U6IHRoaXMubmV0d29ya1Bhc3NwaHJhc2UsXG4gICAgfSk7XG5cbiAgICBjb25zdCBkZXN0QXNzZXQgPSB0aGlzLnRvU3RlbGxhckFzc2V0KHdpdGhkcmF3YWwuYXNzZXRfY29kZSwgd2l0aGRyYXdhbC5pc3N1ZXIpO1xuICAgIGNvbnN0IGRlc3RpbmF0aW9uID0gdGhpcy5jb252ZXJ0RGVzdGluYXRpb24od2l0aGRyYXdhbC5kZXN0aW5hdGlvbik7XG4gICAgY29uc3QgZGVzdEFtb3VudCA9IHRoaXMuc3Ryb29wc1RvRGVjaW1hbChCaWdJbnQod2l0aGRyYXdhbC5hbW91bnQpKTtcbiAgICBjb25zdCBzZW5kTWF4RGVjaW1hbCA9IHRoaXMuc3Ryb29wc1RvRGVjaW1hbChzZW5kTWF4KTtcblxuICAgIHR4QnVpbGRlci5hZGRPcGVyYXRpb24oXG4gICAgICBPcGVyYXRpb24ucGF0aFBheW1lbnRTdHJpY3RSZWNlaXZlKHtcbiAgICAgICAgc2VuZEFzc2V0OiB0aGlzLnRvU3RlbGxhckFzc2V0KHNlbmRBc3NldC5jb2RlLCBzZW5kQXNzZXQuaXNzdWVyKSxcbiAgICAgICAgc2VuZE1heDogc2VuZE1heERlY2ltYWwsXG4gICAgICAgIGRlc3RpbmF0aW9uLFxuICAgICAgICBkZXN0QXNzZXQsXG4gICAgICAgIGRlc3RBbW91bnQsXG4gICAgICAgIHBhdGgsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBBZGQgbWVtb1xuICAgIGNvbnN0IG1lbW9IYXNoID0gQnVmZmVyLmNvbmNhdChbbWVtbywgQnVmZmVyLmFsbG9jKDQsIDApXSk7XG4gICAgdHhCdWlsZGVyLmFkZE1lbW8oTWVtby5oYXNoKG1lbW9IYXNoLnRvU3RyaW5nKCdoZXgnKSkpO1xuXG4gICAgdHhCdWlsZGVyLnNldFRpbWVvdXQoMzAwKTtcblxuICAgIHJldHVybiB0eEJ1aWxkZXIuYnVpbGQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBCYXRjaCB3aXRoZHJhd2FscyBpbnRvIGdyb3VwcyByZXNwZWN0aW5nIFN0ZWxsYXIncyBtYXggb3BlcmF0aW9ucyBsaW1pdC5cbiAgICpcbiAgICogUGVyIFNURUxMQVJfQ09OU1RBTlRTLk1BWF9PUFNfUEVSX1RYICgxMDAgb3BlcmF0aW9ucyBtYXgpXG4gICAqXG4gICAqIEBwYXJhbSB3aXRoZHJhd2FscyAtIFNvcnRlZCBhcnJheSBvZiB3aXRoZHJhd2Fsc1xuICAgKiBAcmV0dXJucyBBcnJheSBvZiBiYXRjaGVzXG4gICAqL1xuICBwcml2YXRlIGJhdGNoV2l0aGRyYXdhbHMod2l0aGRyYXdhbHM6IFdpdGhkcmF3YWxJbnRlbnRbXSk6IFdpdGhkcmF3YWxJbnRlbnRbXVtdIHtcbiAgICBjb25zdCBiYXRjaGVzOiBXaXRoZHJhd2FsSW50ZW50W11bXSA9IFtdO1xuICAgIGNvbnN0IG1heE9wcyA9IFNURUxMQVJfQ09OU1RBTlRTLk1BWF9PUFNfUEVSX1RYO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB3aXRoZHJhd2Fscy5sZW5ndGg7IGkgKz0gbWF4T3BzKSB7XG4gICAgICBiYXRjaGVzLnB1c2god2l0aGRyYXdhbHMuc2xpY2UoaSwgaSArIG1heE9wcykpO1xuICAgIH1cblxuICAgIHJldHVybiBiYXRjaGVzO1xuICB9XG5cbiAgLyoqXG4gICAqIENvbnZlcnQgd2l0aGRyYXdhbCBkZXN0aW5hdGlvbiB0byBTdGVsbGFyIGFkZHJlc3MuXG4gICAqXG4gICAqIERlc3RpbmF0aW9uIGNvbWVzIGZyb20gRGV2IEEgYXMgYnl0ZXMzMiAoaGV4KSBvciBHLi4uIGFkZHJlc3MuXG4gICAqIFBlciBjb250cmFjdHMvV0lUSERSQVdBTF9RVUVVRV9GT1JNQVQubWQ6IGRlc3RpbmF0aW9uIGlzIEVkMjU1MTkgcHVia2V5XG4gICAqXG4gICAqIEBwYXJhbSBkZXN0aW5hdGlvbiAtIERlc3RpbmF0aW9uIGZyb20gd2l0aGRyYXdhbCBpbnRlbnRcbiAgICogQHJldHVybnMgU3RlbGxhciBhZGRyZXNzIChHLi4uIGZvcm1hdClcbiAgICovXG4gIHByaXZhdGUgY29udmVydERlc3RpbmF0aW9uKGRlc3RpbmF0aW9uOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGlmIChkZXN0aW5hdGlvbi5zdGFydHNXaXRoKCdHJykpIHtcbiAgICAgIC8vIEFscmVhZHkgaW4gU3RlbGxhciBmb3JtYXRcbiAgICAgIHJldHVybiBkZXN0aW5hdGlvbjtcbiAgICB9XG5cbiAgICAvLyBDb252ZXJ0IGZyb20gaGV4IChieXRlczMyKSB0byBTdGVsbGFyIGFkZHJlc3NcbiAgICByZXR1cm4gaGV4VG9TdGVsbGFyS2V5KGRlc3RpbmF0aW9uKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb252ZXJ0IGFzc2V0IHRvIFN0ZWxsYXIgU0RLIEFzc2V0LlxuICAgKlxuICAgKiBQZXIgY29udHJhY3RzL1dJVEhEUkFXQUxfUVVFVUVfRk9STUFULm1kOlxuICAgKiAtIGlzc3VlciA9IFwiTkFUSVZFXCIgZm9yIFhMTVxuICAgKiAtIGlzc3VlciA9IGJ5dGVzMzIgaGV4IGZvciBpc3N1ZWQgYXNzZXRzXG4gICAqXG4gICAqIEBwYXJhbSBhc3NldENvZGUgLSBBc3NldCBjb2RlIChlLmcuLCBcIlVTRENcIiwgXCJYTE1cIilcbiAgICogQHBhcmFtIGlzc3VlciAtIFwiTkFUSVZFXCIgb3IgaXNzdWVyIGFkZHJlc3MvaGV4XG4gICAqIEByZXR1cm5zIFN0ZWxsYXIgU0RLIEFzc2V0XG4gICAqL1xuICBwcml2YXRlIHRvU3RlbGxhckFzc2V0KGFzc2V0Q29kZTogc3RyaW5nLCBpc3N1ZXI6IHN0cmluZyk6IEFzc2V0IHtcbiAgICBpZiAoaXNzdWVyLnRvVXBwZXJDYXNlKCkgPT09ICdOQVRJVkUnKSB7XG4gICAgICByZXR1cm4gQXNzZXQubmF0aXZlKCk7XG4gICAgfVxuXG4gICAgLy8gQ29udmVydCBpc3N1ZXIgdG8gU3RlbGxhciBmb3JtYXQgaWYgbmVlZGVkXG4gICAgbGV0IHN0ZWxsYXJJc3N1ZXI6IHN0cmluZztcbiAgICBpZiAoaXNzdWVyLnN0YXJ0c1dpdGgoJ0cnKSkge1xuICAgICAgc3RlbGxhcklzc3VlciA9IGlzc3VlcjtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RlbGxhcklzc3VlciA9IGhleFRvU3RlbGxhcktleShpc3N1ZXIpO1xuICAgIH1cblxuICAgIHJldHVybiBuZXcgQXNzZXQoYXNzZXRDb2RlLCBzdGVsbGFySXNzdWVyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb252ZXJ0IHN0cm9vcHMgdG8gZGVjaW1hbCBzdHJpbmcgZm9yIFN0ZWxsYXIgU0RLLlxuICAgKlxuICAgKiBTdGVsbGFyIFNESyB1c2VzIHN0cmluZyBhbW91bnRzIHdpdGggNyBkZWNpbWFsIHBsYWNlcy5cbiAgICogMSBYTE0gPSAxMCwwMDAsMDAwIHN0cm9vcHNcbiAgICpcbiAgICogQHBhcmFtIHN0cm9vcHMgLSBBbW91bnQgaW4gc3Ryb29wc1xuICAgKiBAcmV0dXJucyBEZWNpbWFsIHN0cmluZyAoZS5nLiwgXCIxMC4wMDAwMDAwXCIpXG4gICAqL1xuICBwcml2YXRlIHN0cm9vcHNUb0RlY2ltYWwoc3Ryb29wczogYmlnaW50KTogc3RyaW5nIHtcbiAgICBjb25zdCBzdHIgPSBzdHJvb3BzLnRvU3RyaW5nKCkucGFkU3RhcnQoOCwgJzAnKTtcbiAgICBjb25zdCB3aG9sZSA9IHN0ci5zbGljZSgwLCAtNykgfHwgJzAnO1xuICAgIGNvbnN0IGRlY2ltYWwgPSBzdHIuc2xpY2UoLTcpO1xuICAgIHJldHVybiBgJHt3aG9sZX0uJHtkZWNpbWFsfWA7XG4gIH1cblxuICAvKipcbiAgICogQ2FsY3VsYXRlIHRyYW5zYWN0aW9uIGZlZSBiYXNlZCBvbiBudW1iZXIgb2Ygb3BlcmF0aW9ucy5cbiAgICpcbiAgICogQmFzZSBmZWUgaXMgMTAwIHN0cm9vcHMgcGVyIG9wZXJhdGlvbi5cbiAgICpcbiAgICogQHBhcmFtIG51bU9wZXJhdGlvbnMgLSBOdW1iZXIgb2Ygb3BlcmF0aW9ucyBpbiB0cmFuc2FjdGlvblxuICAgKiBAcmV0dXJucyBUb3RhbCBmZWUgaW4gc3Ryb29wc1xuICAgKi9cbiAgcHJpdmF0ZSBjYWxjdWxhdGVGZWUobnVtT3BlcmF0aW9uczogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBiYXNlRmVlUGVyT3AgPSAxMDA7XG4gICAgcmV0dXJuIGJhc2VGZWVQZXJPcCAqIG51bU9wZXJhdGlvbnM7XG4gIH1cbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBTZXR0bGVtZW50UGxhbm5lciBmb3IgdGVzdG5ldFxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGVzdG5ldFNldHRsZW1lbnRQbGFubmVyKCk6IFNldHRsZW1lbnRQbGFubmVyIHtcbiAgcmV0dXJuIG5ldyBTZXR0bGVtZW50UGxhbm5lcihURVNUTkVUX0NPTkZJRyk7XG59XG4iXX0=