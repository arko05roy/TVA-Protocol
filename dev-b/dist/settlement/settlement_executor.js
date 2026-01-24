"use strict";
/**
 * ASTRAEUS - Settlement Executor
 *
 * End-to-end settlement execution orchestrating all components.
 *
 * Per agent/plan.md Section B (Dev B Overview):
 * "Dev B owns everything that touches Stellar L1 but never mutates execution state."
 *
 * Per duo.md Phase 6 (Full Flow):
 * 11. [Dev B] Receive commitment event
 * 12. [Dev B] Fetch withdrawal queue from Dev A
 * 13. [Dev B] Build settlement plan
 * 14. [Dev B] Verify plan matches PoM delta
 * 15. [Dev B] Sign and submit transactions
 * 16. [Dev B] Verify L1 balances changed correctly
 * 17. [Dev B] Send settlement confirmation to Dev A
 *
 * CRITICAL REMINDERS (from duo.md):
 * 1. NEVER use keccak256 — All hashes are SHA-256
 * 2. NEVER submit if PoM doesn't match — Halt immediately
 * 3. NEVER set internal FX prices — Use Stellar DEX only
 * 4. NEVER mutate execution state — You only move money
 * 5. ALWAYS verify before submit — Re-compute delta locally
 * 6. ALWAYS use memo-based idempotency — Prevent double-settlement
 * 7. ALWAYS halt on partial failure — Don't leave inconsistent state
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettlementExecutor = void 0;
exports.createTestnetSettlementExecutor = createTestnetSettlementExecutor;
const types_1 = require("../interfaces/types");
const settlement_planner_1 = require("./settlement_planner");
const multisig_orchestrator_1 = require("./multisig_orchestrator");
const replay_protection_1 = require("../safety/replay_protection");
const treasury_snapshot_1 = require("../snapshot/treasury_snapshot");
const pom_delta_1 = require("./pom_delta");
/**
 * Settlement Executor class
 *
 * Main orchestration layer for end-to-end settlement execution.
 * Implements the full settlement flow as specified in duo.md Phase 6.
 */
class SettlementExecutor {
    config;
    planner;
    orchestrator;
    replayProtection;
    snapshotService;
    constructor(config) {
        this.config = config;
        this.planner = new settlement_planner_1.SettlementPlanner(config.networkConfig);
        this.orchestrator = new multisig_orchestrator_1.MultisigOrchestrator(config.networkConfig);
        this.replayProtection = new replay_protection_1.ReplayProtectionService(config.networkConfig);
        this.snapshotService = new treasury_snapshot_1.TreasurySnapshotService(config.networkConfig);
    }
    /**
     * Execute settlement for a commitment event.
     *
     * This is the main entry point implementing the full flow from duo.md Phase 6.
     *
     * @param event - Commitment event from Dev A
     * @param withdrawals - Withdrawal queue from Dev A's contract
     * @returns Settlement result with transaction hashes
     */
    async executeSettlement(event, withdrawals) {
        const { subnet_id, block_number } = event;
        try {
            // Step 1: Check for replay (memo-based idempotency)
            // Per duo.md: "ALWAYS use memo-based idempotency — Prevent double-settlement"
            const alreadySettled = await this.replayProtection.isAlreadySettled(this.config.vaultAddress, subnet_id, block_number);
            if (alreadySettled) {
                const confirmation = this.replayProtection.getSettlementConfirmation(subnet_id, block_number);
                return {
                    status: 'already_settled',
                    tx_hashes: confirmation?.tx_hashes || [],
                    memo: confirmation?.memo || '',
                };
            }
            // Step 2: Handle empty withdrawal queue
            if (withdrawals.length === 0) {
                return {
                    status: 'confirmed',
                    tx_hashes: [],
                    memo: '',
                };
            }
            // Step 3: Record pending settlement
            this.replayProtection.recordPendingSettlement(subnet_id, block_number);
            // Step 4: Get treasury snapshot for solvency check
            // Per duo.md: "ALWAYS verify before submit — Re-compute delta locally"
            const snapshot = await this.snapshotService.getTreasurySnapshot(this.config.vaultAddress);
            // Step 5: Compute PoM delta from withdrawals
            const pomDelta = (0, pom_delta_1.computeNetOutflow)(withdrawals);
            // Step 6: Build settlement plan
            const plan = await this.planner.buildSettlementPlan(this.config.vaultAddress, subnet_id, block_number, withdrawals);
            // Step 7: Execute settlement (includes PoM verification)
            // Per duo.md: "NEVER submit if PoM doesn't match — Halt immediately"
            const executionResult = await this.orchestrator.executeSettlement(plan, pomDelta, snapshot, this.config.signerKeypairs);
            // Step 8: Record result
            if (executionResult.success) {
                const txHashes = executionResult.transactionResults.map((r) => r.hash);
                const ledgers = executionResult.transactionResults.map((r) => r.ledger);
                this.replayProtection.recordConfirmedSettlement(subnet_id, block_number, txHashes, ledgers);
                return {
                    status: 'confirmed',
                    tx_hashes: txHashes,
                    memo: plan.memoHex,
                };
            }
            else {
                // Per duo.md: "ALWAYS halt on partial failure — Don't leave inconsistent state"
                this.replayProtection.recordFailedSettlement(subnet_id, block_number, executionResult.error || 'Unknown error');
                return {
                    status: 'failed',
                    tx_hashes: executionResult.transactionResults.map((r) => r.hash),
                    memo: plan.memoHex,
                    error: executionResult.error,
                };
            }
        }
        catch (error) {
            // Handle errors
            this.replayProtection.recordFailedSettlement(subnet_id, block_number, error.message);
            // Re-throw if it's a critical error that should halt
            if (error instanceof types_1.SettlementError && error.shouldHalt()) {
                throw error;
            }
            return {
                status: 'failed',
                tx_hashes: [],
                memo: '',
                error: error.message,
            };
        }
    }
    /**
     * Get settlement confirmation for Dev A.
     *
     * Per duo.md Interface 3 (Settlement Confirmation):
     * Dev B → Dev A: { subnet_id, block_number, tx_hashes, memo, timestamp }
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @returns Settlement confirmation or undefined
     */
    getSettlementConfirmation(subnetId, blockNumber) {
        return this.replayProtection.getSettlementConfirmation(subnetId, blockNumber);
    }
    /**
     * Check if a settlement exists (for querying).
     *
     * @param subnetId - Subnet identifier
     * @param blockNumber - Block number
     * @returns True if settlement exists (any status)
     */
    hasSettlement(subnetId, blockNumber) {
        return this.replayProtection.getSettlementRecord(subnetId, blockNumber) !== undefined;
    }
    /**
     * Get settlement statistics.
     */
    getStats() {
        return this.replayProtection.getStats();
    }
    /**
     * Handle commitment event from Dev A.
     *
     * This is the event handler that would be called when Dev A commits a state root.
     * It fetches the withdrawal queue and triggers settlement.
     *
     * @param event - Commitment event
     * @param fetchWithdrawals - Function to fetch withdrawals from Dev A
     * @returns Settlement result
     */
    async onCommitmentEvent(event, fetchWithdrawals) {
        // Fetch withdrawal queue from Dev A
        const withdrawals = await fetchWithdrawals(event.subnet_id, event.block_number);
        // Execute settlement
        return this.executeSettlement(event, withdrawals);
    }
}
exports.SettlementExecutor = SettlementExecutor;
/**
 * Create a SettlementExecutor for testnet
 */
function createTestnetSettlementExecutor(vaultAddress, signerKeypairs) {
    return new SettlementExecutor({
        vaultAddress,
        signerKeypairs,
        networkConfig: types_1.TESTNET_CONFIG,
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGxlbWVudF9leGVjdXRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zZXR0bGVtZW50L3NldHRsZW1lbnRfZXhlY3V0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBeUJHOzs7QUFpUEgsMEVBU0M7QUF2UEQsK0NBUzZCO0FBQzdCLDZEQUFpRjtBQUNqRixtRUFBMEY7QUFDMUYsbUVBQXNFO0FBQ3RFLHFFQUF3RTtBQUN4RSwyQ0FBZ0Q7QUFjaEQ7Ozs7O0dBS0c7QUFDSCxNQUFhLGtCQUFrQjtJQUNyQixNQUFNLENBQTJCO0lBQ2pDLE9BQU8sQ0FBb0I7SUFDM0IsWUFBWSxDQUF1QjtJQUNuQyxnQkFBZ0IsQ0FBMEI7SUFDMUMsZUFBZSxDQUEwQjtJQUVqRCxZQUFZLE1BQWdDO1FBQzFDLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxzQ0FBaUIsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLDRDQUFvQixDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNuRSxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSwyQ0FBdUIsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDMUUsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLDJDQUF1QixDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUMzRSxDQUFDO0lBRUQ7Ozs7Ozs7O09BUUc7SUFDSCxLQUFLLENBQUMsaUJBQWlCLENBQ3JCLEtBQXNCLEVBQ3RCLFdBQStCO1FBRS9CLE1BQU0sRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRTFDLElBQUksQ0FBQztZQUNILG9EQUFvRDtZQUNwRCw4RUFBOEU7WUFDOUUsTUFBTSxjQUFjLEdB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LEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUVoRixxQkFBcUI7UUFDckIsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ3BELENBQUM7Q0FDRjtBQXZNRCxnREF1TUM7QUFFRDs7R0FFRztBQUNILFNBQWdCLCtCQUErQixDQUM3QyxZQUFvQixFQUNwQixjQUF5QjtJQUV6QixPQUFPLElBQUksa0JBQWtCLENBQUM7UUFDNUIsWUFBWTtRQUNaLGNBQWM7UUFDZCxhQUFhLEVBQUUsc0JBQWM7S0FDOUIsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQVNUUkFFVVMgLSBTZXR0bGVtZW50IEV4ZWN1dG9yXG4gKlxuICogRW5kLXRvLWVuZCBzZXR0bGVtZW50IGV4ZWN1dGlvbiBvcmNoZXN0cmF0aW5nIGFsbCBjb21wb25lbnRzLlxuICpcbiAqIFBlciBhZ2VudC9wbGFuLm1kIFNlY3Rpb24gQiAoRGV2IEIgT3ZlcnZpZXcpOlxuICogXCJEZXYgQiBvd25zIGV2ZXJ5dGhpbmcgdGhhdCB0b3VjaGVzIFN0ZWxsYXIgTDEgYnV0IG5ldmVyIG11dGF0ZXMgZXhlY3V0aW9uIHN0YXRlLlwiXG4gKlxuICogUGVyIGR1by5tZCBQaGFzZSA2IChGdWxsIEZsb3cpOlxuICogMTEuIFtEZXYgQl0gUmVjZWl2ZSBjb21taXRtZW50IGV2ZW50XG4gKiAxMi4gW0RldiBCXSBGZXRjaCB3aXRoZHJhd2FsIHF1ZXVlIGZyb20gRGV2IEFcbiAqIDEzLiBbRGV2IEJdIEJ1aWxkIHNldHRsZW1lbnQgcGxhblxuICogMTQuIFtEZXYgQl0gVmVyaWZ5IHBsYW4gbWF0Y2hlcyBQb00gZGVsdGFcbiAqIDE1LiBbRGV2IEJdIFNpZ24gYW5kIHN1Ym1pdCB0cmFuc2FjdGlvbnNcbiAqIDE2LiBbRGV2IEJdIFZlcmlmeSBMMSBiYWxhbmNlcyBjaGFuZ2VkIGNvcnJlY3RseVxuICogMTcuIFtEZXYgQl0gU2VuZCBzZXR0bGVtZW50IGNvbmZpcm1hdGlvbiB0byBEZXYgQVxuICpcbiAqIENSSVRJQ0FMIFJFTUlOREVSUyAoZnJvbSBkdW8ubWQpOlxuICogMS4gTkVWRVIgdXNlIGtlY2NhazI1NiDigJQgQWxsIGhhc2hlcyBhcmUgU0hBLTI1NlxuICogMi4gTkVWRVIgc3VibWl0IGlmIFBvTSBkb2Vzbid0IG1hdGNoIOKAlCBIYWx0IGltbWVkaWF0ZWx5XG4gKiAzLiBORVZFUiBzZXQgaW50ZXJuYWwgRlggcHJpY2VzIOKAlCBVc2UgU3RlbGxhciBERVggb25seVxuICogNC4gTkVWRVIgbXV0YXRlIGV4ZWN1dGlvbiBzdGF0ZSDigJQgWW91IG9ubHkgbW92ZSBtb25leVxuICogNS4gQUxXQVlTIHZlcmlmeSBiZWZvcmUgc3VibWl0IOKAlCBSZS1jb21wdXRlIGRlbHRhIGxvY2FsbHlcbiAqIDYuIEFMV0FZUyB1c2UgbWVtby1iYXNlZCBpZGVtcG90ZW5jeSDigJQgUHJldmVudCBkb3VibGUtc2V0dGxlbWVudFxuICogNy4gQUxXQVlTIGhhbHQgb24gcGFydGlhbCBmYWlsdXJlIOKAlCBEb24ndCBsZWF2ZSBpbmNvbnNpc3RlbnQgc3RhdGVcbiAqL1xuXG5pbXBvcnQgeyBLZXlwYWlyIH0gZnJvbSAnQHN0ZWxsYXIvc3RlbGxhci1zZGsnO1xuaW1wb3J0IHtcbiAgV2l0aGRyYXdhbEludGVudCxcbiAgQ29tbWl0bWVudEV2ZW50LFxuICBTZXR0bGVtZW50Q29uZmlybWF0aW9uLFxuICBTZXR0bGVtZW50UmVzdWx0LFxuICBOZXR3b3JrQ29uZmlnLFxuICBURVNUTkVUX0NPTkZJRyxcbiAgU2V0dGxlbWVudEVycm9yLFxuICBTZXR0bGVtZW50RmFpbHVyZSxcbn0gZnJvbSAnLi4vaW50ZXJmYWNlcy90eXBlcyc7XG5pbXBvcnQgeyBTZXR0bGVtZW50UGxhbm5lciwgRGV0YWlsZWRTZXR0bGVtZW50UGxhbiB9IGZyb20gJy4vc2V0dGxlbWVudF9wbGFubmVyJztcbmltcG9ydCB7IE11bHRpc2lnT3JjaGVzdHJhdG9yLCBTZXR0bGVtZW50RXhlY3V0aW9uUmVzdWx0IH0gZnJvbSAnLi9tdWx0aXNpZ19vcmNoZXN0cmF0b3InO1xuaW1wb3J0IHsgUmVwbGF5UHJvdGVjdGlvblNlcnZpY2UgfSBmcm9tICcuLi9zYWZldHkvcmVwbGF5X3Byb3RlY3Rpb24nO1xuaW1wb3J0IHsgVHJlYXN1cnlTbmFwc2hvdFNlcnZpY2UgfSBmcm9tICcuLi9zbmFwc2hvdC90cmVhc3VyeV9zbmFwc2hvdCc7XG5pbXBvcnQgeyBjb21wdXRlTmV0T3V0ZmxvdyB9IGZyb20gJy4vcG9tX2RlbHRhJztcblxuLyoqXG4gKiBTZXR0bGVtZW50IEV4ZWN1dG9yIGNvbmZpZ3VyYXRpb25cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXR0bGVtZW50RXhlY3V0b3JDb25maWcge1xuICAvKiogVmF1bHQgYWRkcmVzcyAoRy4uLiBmb3JtYXQpICovXG4gIHZhdWx0QWRkcmVzczogc3RyaW5nO1xuICAvKiogU2lnbmVyIGtleXBhaXJzIGZvciBtdWx0aXNpZyAqL1xuICBzaWduZXJLZXlwYWlyczogS2V5cGFpcltdO1xuICAvKiogTmV0d29yayBjb25maWd1cmF0aW9uICovXG4gIG5ldHdvcmtDb25maWc6IE5ldHdvcmtDb25maWc7XG59XG5cbi8qKlxuICogU2V0dGxlbWVudCBFeGVjdXRvciBjbGFzc1xuICpcbiAqIE1haW4gb3JjaGVzdHJhdGlvbiBsYXllciBmb3IgZW5kLXRvLWVuZCBzZXR0bGVtZW50IGV4ZWN1dGlvbi5cbiAqIEltcGxlbWVudHMgdGhlIGZ1bGwgc2V0dGxlbWVudCBmbG93IGFzIHNwZWNpZmllZCBpbiBkdW8ubWQgUGhhc2UgNi5cbiAqL1xuZXhwb3J0IGNsYXNzIFNldHRsZW1lbnRFeGVjdXRvciB7XG4gIHByaXZhdGUgY29uZmlnOiBTZXR0bGVtZW50RXhlY3V0b3JDb25maWc7XG4gIHByaXZhdGUgcGxhbm5lcjogU2V0dGxlbWVudFBsYW5uZXI7XG4gIHByaXZhdGUgb3JjaGVzdHJhdG9yOiBNdWx0aXNpZ09yY2hlc3RyYXRvcjtcbiAgcHJpdmF0ZSByZXBsYXlQcm90ZWN0aW9uOiBSZXBsYXlQcm90ZWN0aW9uU2VydmljZTtcbiAgcHJpdmF0ZSBzbmFwc2hvdFNlcnZpY2U6IFRyZWFzdXJ5U25hcHNob3RTZXJ2aWNlO1xuXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogU2V0dGxlbWVudEV4ZWN1dG9yQ29uZmlnKSB7XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgdGhpcy5wbGFubmVyID0gbmV3IFNldHRsZW1lbnRQbGFubmVyKGNvbmZpZy5uZXR3b3JrQ29uZmlnKTtcbiAgICB0aGlzLm9yY2hlc3RyYXRvciA9IG5ldyBNdWx0aXNpZ09yY2hlc3RyYXRvcihjb25maWcubmV0d29ya0NvbmZpZyk7XG4gICAgdGhpcy5yZXBsYXlQcm90ZWN0aW9uID0gbmV3IFJlcGxheVByb3RlY3Rpb25TZXJ2aWNlKGNvbmZpZy5uZXR3b3JrQ29uZmlnKTtcbiAgICB0aGlzLnNuYXBzaG90U2VydmljZSA9IG5ldyBUcmVhc3VyeVNuYXBzaG90U2VydmljZShjb25maWcubmV0d29ya0NvbmZpZyk7XG4gIH1cblxuICAvKipcbiAgICogRXhlY3V0ZSBzZXR0bGVtZW50IGZvciBhIGNvbW1pdG1lbnQgZXZlbnQuXG4gICAqXG4gICAqIFRoaXMgaXMgdGhlIG1haW4gZW50cnkgcG9pbnQgaW1wbGVtZW50aW5nIHRoZSBmdWxsIGZsb3cgZnJvbSBkdW8ubWQgUGhhc2UgNi5cbiAgICpcbiAgICogQHBhcmFtIGV2ZW50IC0gQ29tbWl0bWVudCBldmVudCBmcm9tIERldiBBXG4gICAqIEBwYXJhbSB3aXRoZHJhd2FscyAtIFdpdGhkcmF3YWwgcXVldWUgZnJvbSBEZXYgQSdzIGNvbnRyYWN0XG4gICAqIEByZXR1cm5zIFNldHRsZW1lbnQgcmVzdWx0IHdpdGggdHJhbnNhY3Rpb24gaGFzaGVzXG4gICAqL1xuICBhc3luYyBleGVjdXRlU2V0dGxlbWVudChcbiAgICBldmVudDogQ29tbWl0bWVudEV2ZW50LFxuICAgIHdpdGhkcmF3YWxzOiBXaXRoZHJhd2FsSW50ZW50W11cbiAgKTogUHJvbWlzZTxTZXR0bGVtZW50UmVzdWx0PiB7XG4gICAgY29uc3QgeyBzdWJuZXRfaWQsIGJsb2NrX251bWJlciB9ID0gZXZlbnQ7XG5cbiAgICB0cnkge1xuICAgICAgLy8gU3RlcCAxOiBDaGVjayBmb3IgcmVwbGF5IChtZW1vLWJhc2VkIGlkZW1wb3RlbmN5KVxuICAgICAgLy8gUGVyIGR1by5tZDogXCJBTFdBWVMgdXNlIG1lbW8tYmFzZWQgaWRlbXBvdGVuY3kg4oCUIFByZXZlbnQgZG91YmxlLXNldHRsZW1lbnRcIlxuICAgICAgY29uc3QgYWxyZWFkeVNldHRsZWQgPSBhd2FpdCB0aGlzLnJlcGxheVByb3RlY3Rpb24uaXNBbHJlYWR5U2V0dGxlZChcbiAgICAgICAgdGhpcy5jb25maWcudmF1bHRBZGRyZXNzLFxuICAgICAgICBzdWJuZXRfaWQsXG4gICAgICAgIGJsb2NrX251bWJlclxuICAgICAgKTtcblxuICAgICAgaWYgKGFscmVhZHlTZXR0bGVkKSB7XG4gICAgICAgIGNvbnN0IGNvbmZpcm1hdGlvbiA9IHRoaXMucmVwbGF5UHJvdGVjdGlvbi5nZXRTZXR0bGVtZW50Q29uZmlybWF0aW9uKFxuICAgICAgICAgIHN1Ym5ldF9pZCxcbiAgICAgICAgICBibG9ja19udW1iZXJcbiAgICAgICAgKTtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN0YXR1czogJ2FscmVhZHlfc2V0dGxlZCcsXG4gICAgICAgICAgdHhfaGFzaGVzOiBjb25maXJtYXRpb24/LnR4X2hhc2hlcyB8fCBbXSxcbiAgICAgICAgICBtZW1vOiBjb25maXJtYXRpb24/Lm1lbW8gfHwgJycsXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIC8vIFN0ZXAgMjogSGFuZGxlIGVtcHR5IHdpdGhkcmF3YWwgcXVldWVcbiAgICAgIGlmICh3aXRoZHJhd2Fscy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXM6ICdjb25maXJtZWQnLFxuICAgICAgICAgIHR4X2hhc2hlczogW10sXG4gICAgICAgICAgbWVtbzogJycsXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIC8vIFN0ZXAgMzogUmVjb3JkIHBlbmRpbmcgc2V0dGxlbWVudFxuICAgICAgdGhpcy5yZXBsYXlQcm90ZWN0aW9uLnJlY29yZFBlbmRpbmdTZXR0bGVtZW50KHN1Ym5ldF9pZCwgYmxvY2tfbnVtYmVyKTtcblxuICAgICAgLy8gU3RlcCA0OiBHZXQgdHJlYXN1cnkgc25hcHNob3QgZm9yIHNvbHZlbmN5IGNoZWNrXG4gICAgICAvLyBQZXIgZHVvLm1kOiBcIkFMV0FZUyB2ZXJpZnkgYmVmb3JlIHN1Ym1pdCDigJQgUmUtY29tcHV0ZSBkZWx0YSBsb2NhbGx5XCJcbiAgICAgIGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgdGhpcy5zbmFwc2hvdFNlcnZpY2UuZ2V0VHJlYXN1cnlTbmFwc2hvdChcbiAgICAgICAgdGhpcy5jb25maWcudmF1bHRBZGRyZXNzXG4gICAgICApO1xuXG4gICAgICAvLyBTdGVwIDU6IENvbXB1dGUgUG9NIGRlbHRhIGZyb20gd2l0aGRyYXdhbHNcbiAgICAgIGNvbnN0IHBvbURlbHRhID0gY29tcHV0ZU5ldE91dGZsb3cod2l0aGRyYXdhbHMpO1xuXG4gICAgICAvLyBTdGVwIDY6IEJ1aWxkIHNldHRsZW1lbnQgcGxhblxuICAgICAgY29uc3QgcGxhbiA9IGF3YWl0IHRoaXMucGxhbm5lci5idWlsZFNldHRsZW1lbnRQbGFuKFxuICAgICAgICB0aGlzLmNvbmZpZy52YXVsdEFkZHJlc3MsXG4gICAgICAgIHN1Ym5ldF9pZCxcbiAgICAgICAgYmxvY2tfbnVtYmVyLFxuICAgICAgICB3aXRoZHJhd2Fsc1xuICAgICAgKTtcblxuICAgICAgLy8gU3RlcCA3OiBFeGVjdXRlIHNldHRsZW1lbnQgKGluY2x1ZGVzIFBvTSB2ZXJpZmljYXRpb24pXG4gICAgICAvLyBQZXIgZHVvLm1kOiBcIk5FVkVSIHN1Ym1pdCBpZiBQb00gZG9lc24ndCBtYXRjaCDigJQgSGFsdCBpbW1lZGlhdGVseVwiXG4gICAgICBjb25zdCBleGVjdXRpb25SZXN1bHQgPSBhd2FpdCB0aGlzLm9yY2hlc3RyYXRvci5leGVjdXRlU2V0dGxlbWVudChcbiAgICAgICAgcGxhbixcbiAgICAgICAgcG9tRGVsdGEsXG4gICAgICAgIHNuYXBzaG90LFxuICAgICAgICB0aGlzLmNvbmZpZy5zaWduZXJLZXlwYWlyc1xuICAgICAgKTtcblxuICAgICAgLy8gU3RlcCA4OiBSZWNvcmQgcmVzdWx0XG4gICAgICBpZiAoZXhlY3V0aW9uUmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAgICAgY29uc3QgdHhIYXNoZXMgPSBleGVjdXRpb25SZXN1bHQudHJhbnNhY3Rpb25SZXN1bHRzLm1hcCgocikgPT4gci5oYXNoKTtcbiAgICAgICAgY29uc3QgbGVkZ2VycyA9IGV4ZWN1dGlvblJlc3VsdC50cmFuc2FjdGlvblJlc3VsdHMubWFwKChyKSA9PiByLmxlZGdlcik7XG5cbiAgICAgICAgdGhpcy5yZXBsYXlQcm90ZWN0aW9uLnJlY29yZENvbmZpcm1lZFNldHRsZW1lbnQoXG4gICAgICAgICAgc3VibmV0X2lkLFxuICAgICAgICAgIGJsb2NrX251bWJlcixcbiAgICAgICAgICB0eEhhc2hlcyxcbiAgICAgICAgICBsZWRnZXJzXG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXM6ICdjb25maXJtZWQnLFxuICAgICAgICAgIHR4X2hhc2hlczogdHhIYXNoZXMsXG4gICAgICAgICAgbWVtbzogcGxhbi5tZW1vSGV4LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gUGVyIGR1by5tZDogXCJBTFdBWVMgaGFsdCBvbiBwYXJ0aWFsIGZhaWx1cmUg4oCUIERvbid0IGxlYXZlIGluY29uc2lzdGVudCBzdGF0ZVwiXG4gICAgICAgIHRoaXMucmVwbGF5UHJvdGVjdGlvbi5yZWNvcmRGYWlsZWRTZXR0bGVtZW50KFxuICAgICAgICAgIHN1Ym5ldF9pZCxcbiAgICAgICAgICBibG9ja19udW1iZXIsXG4gICAgICAgICAgZXhlY3V0aW9uUmVzdWx0LmVycm9yIHx8ICdVbmtub3duIGVycm9yJ1xuICAgICAgICApO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3RhdHVzOiAnZmFpbGVkJyxcbiAgICAgICAgICB0eF9oYXNoZXM6IGV4ZWN1dGlvblJlc3VsdC50cmFuc2FjdGlvblJlc3VsdHMubWFwKChyKSA9PiByLmhhc2gpLFxuICAgICAgICAgIG1lbW86IHBsYW4ubWVtb0hleCxcbiAgICAgICAgICBlcnJvcjogZXhlY3V0aW9uUmVzdWx0LmVycm9yLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgIC8vIEhhbmRsZSBlcnJvcnNcbiAgICAgIHRoaXMucmVwbGF5UHJvdGVjdGlvbi5yZWNvcmRGYWlsZWRTZXR0bGVtZW50KFxuICAgICAgICBzdWJuZXRfaWQsXG4gICAgICAgIGJsb2NrX251bWJlcixcbiAgICAgICAgZXJyb3IubWVzc2FnZVxuICAgICAgKTtcblxuICAgICAgLy8gUmUtdGhyb3cgaWYgaXQncyBhIGNyaXRpY2FsIGVycm9yIHRoYXQgc2hvdWxkIGhhbHRcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFNldHRsZW1lbnRFcnJvciAmJiBlcnJvci5zaG91bGRIYWx0KCkpIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1czogJ2ZhaWxlZCcsXG4gICAgICAgIHR4X2hhc2hlczogW10sXG4gICAgICAgIG1lbW86ICcnLFxuICAgICAgICBlcnJvcjogZXJyb3IubWVzc2FnZSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdldCBzZXR0bGVtZW50IGNvbmZpcm1hdGlvbiBmb3IgRGV2IEEuXG4gICAqXG4gICAqIFBlciBkdW8ubWQgSW50ZXJmYWNlIDMgKFNldHRsZW1lbnQgQ29uZmlybWF0aW9uKTpcbiAgICogRGV2IEIg4oaSIERldiBBOiB7IHN1Ym5ldF9pZCwgYmxvY2tfbnVtYmVyLCB0eF9oYXNoZXMsIG1lbW8sIHRpbWVzdGFtcCB9XG4gICAqXG4gICAqIEBwYXJhbSBzdWJuZXRJZCAtIFN1Ym5ldCBpZGVudGlmaWVyXG4gICAqIEBwYXJhbSBibG9ja051bWJlciAtIEJsb2NrIG51bWJlclxuICAgKiBAcmV0dXJucyBTZXR0bGVtZW50IGNvbmZpcm1hdGlvbiBvciB1bmRlZmluZWRcbiAgICovXG4gIGdldFNldHRsZW1lbnRDb25maXJtYXRpb24oXG4gICAgc3VibmV0SWQ6IHN0cmluZyxcbiAgICBibG9ja051bWJlcjogYmlnaW50XG4gICk6IFNldHRsZW1lbnRDb25maXJtYXRpb24gfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLnJlcGxheVByb3RlY3Rpb24uZ2V0U2V0dGxlbWVudENvbmZpcm1hdGlvbihzdWJuZXRJZCwgYmxvY2tOdW1iZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGlmIGEgc2V0dGxlbWVudCBleGlzdHMgKGZvciBxdWVyeWluZykuXG4gICAqXG4gICAqIEBwYXJhbSBzdWJuZXRJZCAtIFN1Ym5ldCBpZGVudGlmaWVyXG4gICAqIEBwYXJhbSBibG9ja051bWJlciAtIEJsb2NrIG51bWJlclxuICAgKiBAcmV0dXJucyBUcnVlIGlmIHNldHRsZW1lbnQgZXhpc3RzIChhbnkgc3RhdHVzKVxuICAgKi9cbiAgaGFzU2V0dGxlbWVudChzdWJuZXRJZDogc3RyaW5nLCBibG9ja051bWJlcjogYmlnaW50KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMucmVwbGF5UHJvdGVjdGlvbi5nZXRTZXR0bGVtZW50UmVjb3JkKHN1Ym5ldElkLCBibG9ja051bWJlcikgIT09IHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgc2V0dGxlbWVudCBzdGF0aXN0aWNzLlxuICAgKi9cbiAgZ2V0U3RhdHMoKTogeyBwZW5kaW5nOiBudW1iZXI7IGNvbmZpcm1lZDogbnVtYmVyOyBmYWlsZWQ6IG51bWJlciB9IHtcbiAgICByZXR1cm4gdGhpcy5yZXBsYXlQcm90ZWN0aW9uLmdldFN0YXRzKCk7XG4gIH1cblxuICAvKipcbiAgICogSGFuZGxlIGNvbW1pdG1lbnQgZXZlbnQgZnJvbSBEZXYgQS5cbiAgICpcbiAgICogVGhpcyBpcyB0aGUgZXZlbnQgaGFuZGxlciB0aGF0IHdvdWxkIGJlIGNhbGxlZCB3aGVuIERldiBBIGNvbW1pdHMgYSBzdGF0ZSByb290LlxuICAgKiBJdCBmZXRjaGVzIHRoZSB3aXRoZHJhd2FsIHF1ZXVlIGFuZCB0cmlnZ2VycyBzZXR0bGVtZW50LlxuICAgKlxuICAgKiBAcGFyYW0gZXZlbnQgLSBDb21taXRtZW50IGV2ZW50XG4gICAqIEBwYXJhbSBmZXRjaFdpdGhkcmF3YWxzIC0gRnVuY3Rpb24gdG8gZmV0Y2ggd2l0aGRyYXdhbHMgZnJvbSBEZXYgQVxuICAgKiBAcmV0dXJucyBTZXR0bGVtZW50IHJlc3VsdFxuICAgKi9cbiAgYXN5bmMgb25Db21taXRtZW50RXZlbnQoXG4gICAgZXZlbnQ6IENvbW1pdG1lbnRFdmVudCxcbiAgICBmZXRjaFdpdGhkcmF3YWxzOiAoc3VibmV0SWQ6IHN0cmluZywgYmxvY2tOdW1iZXI6IGJpZ2ludCkgPT4gUHJvbWlzZTxXaXRoZHJhd2FsSW50ZW50W10+XG4gICk6IFByb21pc2U8U2V0dGxlbWVudFJlc3VsdD4ge1xuICAgIC8vIEZldGNoIHdpdGhkcmF3YWwgcXVldWUgZnJvbSBEZXYgQVxuICAgIGNvbnN0IHdpdGhkcmF3YWxzID0gYXdhaXQgZmV0Y2hXaXRoZHJhd2FscyhldmVudC5zdWJuZXRfaWQsIGV2ZW50LmJsb2NrX251bWJlcik7XG5cbiAgICAvLyBFeGVjdXRlIHNldHRsZW1lbnRcbiAgICByZXR1cm4gdGhpcy5leGVjdXRlU2V0dGxlbWVudChldmVudCwgd2l0aGRyYXdhbHMpO1xuICB9XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgU2V0dGxlbWVudEV4ZWN1dG9yIGZvciB0ZXN0bmV0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUZXN0bmV0U2V0dGxlbWVudEV4ZWN1dG9yKFxuICB2YXVsdEFkZHJlc3M6IHN0cmluZyxcbiAgc2lnbmVyS2V5cGFpcnM6IEtleXBhaXJbXVxuKTogU2V0dGxlbWVudEV4ZWN1dG9yIHtcbiAgcmV0dXJuIG5ldyBTZXR0bGVtZW50RXhlY3V0b3Ioe1xuICAgIHZhdWx0QWRkcmVzcyxcbiAgICBzaWduZXJLZXlwYWlycyxcbiAgICBuZXR3b3JrQ29uZmlnOiBURVNUTkVUX0NPTkZJRyxcbiAgfSk7XG59XG5cbi8qKlxuICogQ29tbWl0bWVudCBldmVudCBsaXN0ZW5lciBpbnRlcmZhY2UuXG4gKlxuICogVGhpcyB3b3VsZCBiZSBpbXBsZW1lbnRlZCB0byBsaXN0ZW4gZm9yIGV2ZW50cyBmcm9tIERldiBBJ3MgY29tbWl0bWVudCBjb250cmFjdC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBDb21taXRtZW50RXZlbnRMaXN0ZW5lciB7XG4gIC8qKlxuICAgKiBTdGFydCBsaXN0ZW5pbmcgZm9yIGNvbW1pdG1lbnQgZXZlbnRzLlxuICAgKiBAcGFyYW0gaGFuZGxlciAtIEhhbmRsZXIgZnVuY3Rpb24gY2FsbGVkIHdoZW4gZXZlbnQgaXMgcmVjZWl2ZWRcbiAgICovXG4gIHN0YXJ0KGhhbmRsZXI6IChldmVudDogQ29tbWl0bWVudEV2ZW50KSA9PiBQcm9taXNlPHZvaWQ+KTogdm9pZDtcblxuICAvKipcbiAgICogU3RvcCBsaXN0ZW5pbmcuXG4gICAqL1xuICBzdG9wKCk6IHZvaWQ7XG59XG4iXX0=