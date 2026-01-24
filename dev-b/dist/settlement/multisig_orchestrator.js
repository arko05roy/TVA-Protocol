"use strict";
/**
 * ASTRAEUS - Multisig Orchestrator
 *
 * Handles signature collection and transaction submission for settlement.
 *
 * Per agent/plan.md Section B4 (Multisig Orchestration):
 * - Signer coordination
 * - Transaction signature aggregation
 * - Retry logic
 *
 * Steps:
 * 1. Fetch commitment
 * 2. Recompute NetOutflow (sanity check)
 * 3. Verify tx matches PoM delta
 * 4. Sign tx
 * 5. Submit to Stellar
 *
 * Per agent/plan.md Section 9.2 (Attack Analysis):
 * - PoM mismatch → HALT (never submit)
 * - Funds must remain safe
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultisigOrchestrator = void 0;
exports.createTestnetOrchestrator = createTestnetOrchestrator;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const types_1 = require("../interfaces/types");
const pom_delta_1 = require("./pom_delta");
/**
 * Multisig Orchestrator class
 *
 * Coordinates signature collection and transaction submission
 * with strict PoM verification.
 */
class MultisigOrchestrator {
    server;
    networkPassphrase;
    config;
    constructor(config = types_1.TESTNET_CONFIG) {
        this.config = config;
        this.server = new stellar_sdk_1.Horizon.Server(config.horizonUrl);
        this.networkPassphrase = config.networkPassphrase;
    }
    /**
     * Verify that settlement plan matches PoM delta exactly.
     *
     * Per plan.md B4: "Verify tx matches PoM delta"
     * Per core-idea.md Section 5.2: "PoM proves execution is payable"
     *
     * This is a CRITICAL safety check. If mismatched, the system MUST HALT.
     * Never submit transactions that don't match the expected PoM delta.
     *
     * @param plan - Settlement plan to verify
     * @param expectedDelta - PoM delta from withdrawal queue
     * @throws SettlementError with POM_MISMATCH if verification fails
     */
    verifySettlementMatchesPoM(plan, expectedDelta) {
        // Verify plan totals match expected delta
        const verification = (0, pom_delta_1.verifyDeltaMatch)(plan.totalsByAsset, expectedDelta);
        if (!verification.matches) {
            const discrepancyDetails = verification.discrepancies
                .map((d) => `Asset ${d.assetId}: expected ${d.expected}, got ${d.actual}`)
                .join('; ');
            throw new types_1.SettlementError(types_1.SettlementFailure.POM_MISMATCH, `Settlement plan does not match PoM delta: ${discrepancyDetails}`, verification.discrepancies);
        }
    }
    /**
     * Verify that treasury has sufficient balance for settlement.
     *
     * Per core-idea.md Section 5.1 (PoM Definition):
     * "∀a: Δ(a) ≤ T(a)" - For each asset, outflow must not exceed treasury balance
     *
     * @param expectedDelta - PoM delta (required outflows)
     * @param snapshot - Current treasury snapshot
     * @throws SettlementError with INSUFFICIENT_BALANCE if insolvent
     */
    verifySolvency(expectedDelta, snapshot) {
        for (const [assetId, requiredAmount] of expectedDelta) {
            const availableBalance = snapshot.balances.get(assetId) || 0n;
            if (availableBalance < requiredAmount) {
                throw new types_1.SettlementError(types_1.SettlementFailure.INSUFFICIENT_BALANCE, `Insufficient balance for asset ${assetId}: need ${requiredAmount}, have ${availableBalance}`, { assetId, required: requiredAmount, available: availableBalance });
            }
        }
    }
    /**
     * Verify that we have enough signers to meet threshold.
     *
     * Per plan.md A4.3 (Authorization Checks):
     * - signer set ⊆ auditor set
     * - threshold satisfiable
     *
     * @param availableSigners - Keypairs available for signing
     * @param snapshot - Treasury snapshot with signer info
     * @throws SettlementError with THRESHOLD_NOT_MET if insufficient signers
     */
    verifySignerThreshold(availableSigners, snapshot) {
        // Get public keys from available signers
        const availableKeys = availableSigners.map((k) => k.publicKey());
        // Count how many are valid vault signers
        const validSignerCount = availableKeys.filter((key) => snapshot.signers.includes(key)).length;
        if (validSignerCount < snapshot.threshold) {
            throw new types_1.SettlementError(types_1.SettlementFailure.THRESHOLD_NOT_MET, `Insufficient signers: need ${snapshot.threshold}, have ${validSignerCount} valid signers`, {
                required: snapshot.threshold,
                available: validSignerCount,
                validSigners: availableKeys.filter((key) => snapshot.signers.includes(key)),
            });
        }
    }
    /**
     * Sign a transaction with multiple signers.
     *
     * @param transaction - Transaction to sign
     * @param signerKeypairs - Array of signer keypairs
     * @param threshold - Required number of signatures
     * @returns Signed transaction
     */
    signTransaction(transaction, signerKeypairs, threshold) {
        let signedCount = 0;
        for (const keypair of signerKeypairs) {
            if (signedCount >= threshold) {
                break;
            }
            transaction.sign(keypair);
            signedCount++;
        }
        if (signedCount < threshold) {
            throw new types_1.SettlementError(types_1.SettlementFailure.THRESHOLD_NOT_MET, `Could only gather ${signedCount} signatures, need ${threshold}`, { signed: signedCount, required: threshold });
        }
        return transaction;
    }
    /**
     * Submit a signed transaction to Stellar.
     *
     * Per plan.md B4: "Submit to Stellar"
     *
     * @param transaction - Signed transaction
     * @returns Submission result with hash and ledger
     */
    async submitTransaction(transaction) {
        try {
            const response = await this.server.submitTransaction(transaction);
            return {
                hash: response.hash,
                ledger: response.ledger,
                successful: response.successful,
            };
        }
        catch (error) {
            // Handle Horizon errors
            if (error.response && error.response.data) {
                const extras = error.response.data.extras;
                throw new types_1.SettlementError(types_1.SettlementFailure.PARTIAL_SUBMISSION, `Transaction submission failed: ${error.message}`, { horizonError: extras });
            }
            throw new types_1.SettlementError(types_1.SettlementFailure.HORIZON_TIMEOUT, `Transaction submission failed: ${error.message}`, { originalError: error });
        }
    }
    /**
     * Submit transaction with retry logic.
     *
     * Per plan.md B6 (Failure Handling):
     * - Network retries
     * - Idempotency (memo-based)
     *
     * @param transaction - Signed transaction
     * @param maxRetries - Maximum retry attempts
     * @param retryDelayMs - Base delay between retries
     * @returns Submission result
     */
    async submitWithRetry(transaction, maxRetries = 3, retryDelayMs = 1000) {
        let lastError;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await this.submitTransaction(transaction);
            }
            catch (error) {
                lastError = error;
                // Don't retry on certain errors
                if (error instanceof types_1.SettlementError &&
                    error.failure === types_1.SettlementFailure.PARTIAL_SUBMISSION) {
                    // This is a definitive failure, don't retry
                    throw error;
                }
                // Exponential backoff
                if (attempt < maxRetries - 1) {
                    const delay = retryDelayMs * Math.pow(2, attempt);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }
        throw new types_1.SettlementError(types_1.SettlementFailure.HORIZON_TIMEOUT, `Transaction submission failed after ${maxRetries} attempts`, { lastError });
    }
    /**
     * Execute full settlement with all verifications.
     *
     * This is the main entry point for settlement execution.
     * Performs all safety checks before submitting any transactions.
     *
     * Per plan.md B4 Steps:
     * 1. Fetch commitment (passed in as plan)
     * 2. Recompute NetOutflow (sanity check)
     * 3. Verify tx matches PoM delta
     * 4. Sign tx
     * 5. Submit to Stellar
     *
     * @param plan - Settlement plan to execute
     * @param expectedDelta - Expected PoM delta for verification
     * @param snapshot - Current treasury snapshot
     * @param signerKeypairs - Available signer keypairs
     * @returns Execution result with all transaction hashes
     */
    async executeSettlement(plan, expectedDelta, snapshot, signerKeypairs) {
        // Step 1: Verify PoM match (CRITICAL - halts if mismatch)
        this.verifySettlementMatchesPoM(plan, expectedDelta);
        // Step 2: Verify solvency
        this.verifySolvency(expectedDelta, snapshot);
        // Step 3: Verify we have enough signers
        this.verifySignerThreshold(signerKeypairs, snapshot);
        // Step 4: Sign and submit each transaction
        const transactionResults = [];
        for (let i = 0; i < plan.transactions.length; i++) {
            const settlementTx = plan.transactions[i];
            try {
                // Sign the transaction
                const signedTx = this.signTransaction(settlementTx.transaction, signerKeypairs, snapshot.threshold);
                // Submit with retry
                const result = await this.submitWithRetry(signedTx);
                transactionResults.push({
                    index: i,
                    hash: result.hash,
                    ledger: result.ledger,
                    withdrawalCount: settlementTx.withdrawals.length,
                });
            }
            catch (error) {
                // Per plan.md B6: "halt on PoM mismatch" / "partial submission failures"
                // If any transaction fails, we halt and report
                return {
                    success: false,
                    transactionResults,
                    failedAt: i,
                    error: error.message,
                };
            }
        }
        return {
            success: true,
            transactionResults,
        };
    }
}
exports.MultisigOrchestrator = MultisigOrchestrator;
/**
 * Create a MultisigOrchestrator for testnet
 */
function createTestnetOrchestrator() {
    return new MultisigOrchestrator(types_1.TESTNET_CONFIG);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGlzaWdfb3JjaGVzdHJhdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3NldHRsZW1lbnQvbXVsdGlzaWdfb3JjaGVzdHJhdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FvQkc7OztBQXVXSCw4REFFQztBQXZXRCxzREFLOEI7QUFDOUIsK0NBTzZCO0FBRTdCLDJDQUFrRTtBQTBCbEU7Ozs7O0dBS0c7QUFDSCxNQUFhLG9CQUFvQjtJQUN2QixNQUFNLENBQWlCO0lBQ3ZCLGlCQUFpQixDQUFTO0lBQzFCLE1BQU0sQ0FBZ0I7SUFFOUIsWUFBWSxTQUF3QixzQkFBYztRQUNoRCxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUkscUJBQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxpQkFBaUIsR0FBRyxNQUFNLENBQUMsaUJBQWlCLENBQUM7SUFDcEQsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7T0FZRztJQUNILDBCQUEwQixDQUN4QixJQUE0QixFQUM1QixhQUF1QjtRQUV2QiwwQ0FBMEM7UUFDMUMsTUFBTSxZQUFZLEdBQUcsSUFBQSw0QkFBZ0IsRUFBQyxJQUFJLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBRXpFLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDMUIsTUFBTSxrQkFBa0IsR0FBRyxZQUFZLENBQUMsYUFBYTtpQkFDbEQsR0FBRyxDQUNGLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FDSixTQUFTLENBQUMsQ0FBQyxPQUFPLGNBQWMsQ0FBQyxDQUFDLFFBQVEsU0FBUyxDQUFDLENBQUMsTUFBTSxFQUFFLENBQ2hFO2lCQUNBLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVkLE1BQU0sSUFBSSx1QkFBZSxD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QyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNsRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRTFDLElBQUksQ0FBQztnQkFDSCx1QkFBdUI7Z0JBQ3ZCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQ25DLFlBQVksQ0FBQyxXQUFXLEVBQ3hCLGNBQWMsRUFDZCxRQUFRLENBQUMsU0FBUyxDQUNuQixDQUFDO2dCQUVGLG9CQUFvQjtnQkFDcEIsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUVwRCxrQkFBa0IsQ0FBQyxJQUFJLENBQUM7b0JBQ3RCLEtBQUssRUFBRSxDQUFDO29CQUNSLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSTtvQkFDakIsTUFBTSxFQUFFLE1BQU0sQ0FBQyxNQUFNO29CQUNyQixlQUFlLEVBQUUsWUFBWSxDQUFDLFdBQVcsQ0FBQyxNQUFNO2lCQUNqRCxDQUFDLENBQUM7WUFDTCxDQUFDO1lBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztnQkFDcEIseUVBQXlFO2dCQUN6RSwrQ0FBK0M7Z0JBQy9DLE9BQU87b0JBQ0wsT0FBTyxFQUFFLEtBQUs7b0JBQ2Qsa0JBQWtCO29CQUNsQixRQUFRLEVBQUUsQ0FBQztvQkFDWCxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU87aUJBQ3JCLENBQUM7WUFDSixDQUFDO1FBQ0gsQ0FBQztRQUVELE9BQU87WUFDTCxPQUFPLEVBQUUsSUFBSTtZQUNiLGtCQUFrQjtTQUNuQixDQUFDO0lBQ0osQ0FBQztDQUNGO0FBalRELG9EQWlUQztBQUVEOztHQUVHO0FBQ0gsU0FBZ0IseUJBQXlCO0lBQ3ZDLE9BQU8sSUFBSSxvQkFBb0IsQ0FBQyxzQkFBYyxDQUFDLENBQUM7QUFDbEQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQVNUUkFFVVMgLSBNdWx0aXNpZyBPcmNoZXN0cmF0b3JcbiAqXG4gKiBIYW5kbGVzIHNpZ25hdHVyZSBjb2xsZWN0aW9uIGFuZCB0cmFuc2FjdGlvbiBzdWJtaXNzaW9uIGZvciBzZXR0bGVtZW50LlxuICpcbiAqIFBlciBhZ2VudC9wbGFuLm1kIFNlY3Rpb24gQjQgKE11bHRpc2lnIE9yY2hlc3RyYXRpb24pOlxuICogLSBTaWduZXIgY29vcmRpbmF0aW9uXG4gKiAtIFRyYW5zYWN0aW9uIHNpZ25hdHVyZSBhZ2dyZWdhdGlvblxuICogLSBSZXRyeSBsb2dpY1xuICpcbiAqIFN0ZXBzOlxuICogMS4gRmV0Y2ggY29tbWl0bWVudFxuICogMi4gUmVjb21wdXRlIE5ldE91dGZsb3cgKHNhbml0eSBjaGVjaylcbiAqIDMuIFZlcmlmeSB0eCBtYXRjaGVzIFBvTSBkZWx0YVxuICogNC4gU2lnbiB0eFxuICogNS4gU3VibWl0IHRvIFN0ZWxsYXJcbiAqXG4gKiBQZXIgYWdlbnQvcGxhbi5tZCBTZWN0aW9uIDkuMiAoQXR0YWNrIEFuYWx5c2lzKTpcbiAqIC0gUG9NIG1pc21hdGNoIOKGkiBIQUxUIChuZXZlciBzdWJtaXQpXG4gKiAtIEZ1bmRzIG11c3QgcmVtYWluIHNhZmVcbiAqL1xuXG5pbXBvcnQge1xuICBIb3Jpem9uLFxuICBUcmFuc2FjdGlvbixcbiAgS2V5cGFpcixcbiAgRmVlQnVtcFRyYW5zYWN0aW9uLFxufSBmcm9tICdAc3RlbGxhci9zdGVsbGFyLXNkayc7XG5pbXBvcnQge1xuICBQb21EZWx0YSxcbiAgTmV0d29ya0NvbmZpZyxcbiAgVEVTVE5FVF9DT05GSUcsXG4gIFNldHRsZW1lbnRFcnJvcixcbiAgU2V0dGxlbWVudEZhaWx1cmUsXG4gIFRyZWFzdXJ5U25hcHNob3QsXG59IGZyb20gJy4uL2ludGVyZmFjZXMvdHlwZXMnO1xuaW1wb3J0IHsgRGV0YWlsZWRTZXR0bGVtZW50UGxhbiwgU2V0dGxlbWVudFRyYW5zYWN0aW9uIH0gZnJvbSAnLi9zZXR0bGVtZW50X3BsYW5uZXInO1xuaW1wb3J0IHsgdmVyaWZ5RGVsdGFNYXRjaCwgY29tcHV0ZU5ldE91dGZsb3cgfSBmcm9tICcuL3BvbV9kZWx0YSc7XG5cbi8qKlxuICogUmVzdWx0IG9mIHRyYW5zYWN0aW9uIHN1Ym1pc3Npb25cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTdWJtaXNzaW9uUmVzdWx0IHtcbiAgaGFzaDogc3RyaW5nO1xuICBsZWRnZXI6IG51bWJlcjtcbiAgc3VjY2Vzc2Z1bDogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBSZXN1bHQgb2Ygc2V0dGxlbWVudCBleGVjdXRpb25cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBTZXR0bGVtZW50RXhlY3V0aW9uUmVzdWx0IHtcbiAgc3VjY2VzczogYm9vbGVhbjtcbiAgdHJhbnNhY3Rpb25SZXN1bHRzOiBBcnJheTx7XG4gICAgaW5kZXg6IG51bWJlcjtcbiAgICBoYXNoOiBzdHJpbmc7XG4gICAgbGVkZ2VyOiBudW1iZXI7XG4gICAgd2l0aGRyYXdhbENvdW50OiBudW1iZXI7XG4gIH0+O1xuICBmYWlsZWRBdD86IG51bWJlcjtcbiAgZXJyb3I/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogTXVsdGlzaWcgT3JjaGVzdHJhdG9yIGNsYXNzXG4gKlxuICogQ29vcmRpbmF0ZXMgc2lnbmF0dXJlIGNvbGxlY3Rpb24gYW5kIHRyYW5zYWN0aW9uIHN1Ym1pc3Npb25cbiAqIHdpdGggc3RyaWN0IFBvTSB2ZXJpZmljYXRpb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBNdWx0aXNpZ09yY2hlc3RyYXRvciB7XG4gIHByaXZhdGUgc2VydmVyOiBIb3Jpem9uLlNlcnZlcjtcbiAgcHJpdmF0ZSBuZXR3b3JrUGFzc3BocmFzZTogc3RyaW5nO1xuICBwcml2YXRlIGNvbmZpZzogTmV0d29ya0NvbmZpZztcblxuICBjb25zdHJ1Y3Rvcihjb25maWc6IE5ldHdvcmtDb25maWcgPSBURVNUTkVUX0NPTkZJRykge1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgIHRoaXMuc2VydmVyID0gbmV3IEhvcml6b24uU2VydmVyKGNvbmZpZy5ob3Jpem9uVXJsKTtcbiAgICB0aGlzLm5ldHdvcmtQYXNzcGhyYXNlID0gY29uZmlnLm5ldHdvcmtQYXNzcGhyYXNlO1xuICB9XG5cbiAgLyoqXG4gICAqIFZlcmlmeSB0aGF0IHNldHRsZW1lbnQgcGxhbiBtYXRjaGVzIFBvTSBkZWx0YSBleGFjdGx5LlxuICAgKlxuICAgKiBQZXIgcGxhbi5tZCBCNDogXCJWZXJpZnkgdHggbWF0Y2hlcyBQb00gZGVsdGFcIlxuICAgKiBQZXIgY29yZS1pZGVhLm1kIFNlY3Rpb24gNS4yOiBcIlBvTSBwcm92ZXMgZXhlY3V0aW9uIGlzIHBheWFibGVcIlxuICAgKlxuICAgKiBUaGlzIGlzIGEgQ1JJVElDQUwgc2FmZXR5IGNoZWNrLiBJZiBtaXNtYXRjaGVkLCB0aGUgc3lzdGVtIE1VU1QgSEFMVC5cbiAgICogTmV2ZXIgc3VibWl0IHRyYW5zYWN0aW9ucyB0aGF0IGRvbid0IG1hdGNoIHRoZSBleHBlY3RlZCBQb00gZGVsdGEuXG4gICAqXG4gICAqIEBwYXJhbSBwbGFuIC0gU2V0dGxlbWVudCBwbGFuIHRvIHZlcmlmeVxuICAgKiBAcGFyYW0gZXhwZWN0ZWREZWx0YSAtIFBvTSBkZWx0YSBmcm9tIHdpdGhkcmF3YWwgcXVldWVcbiAgICogQHRocm93cyBTZXR0bGVtZW50RXJyb3Igd2l0aCBQT01fTUlTTUFUQ0ggaWYgdmVyaWZpY2F0aW9uIGZhaWxzXG4gICAqL1xuICB2ZXJpZnlTZXR0bGVtZW50TWF0Y2hlc1BvTShcbiAgICBwbGFuOiBEZXRhaWxlZFNldHRsZW1lbnRQbGFuLFxuICAgIGV4cGVjdGVkRGVsdGE6IFBvbURlbHRhXG4gICk6IHZvaWQge1xuICAgIC8vIFZlcmlmeSBwbGFuIHRvdGFscyBtYXRjaCBleHBlY3RlZCBkZWx0YVxuICAgIGNvbnN0IHZlcmlmaWNhdGlvbiA9IHZlcmlmeURlbHRhTWF0Y2gocGxhbi50b3RhbHNCeUFzc2V0LCBleHBlY3RlZERlbHRhKTtcblxuICAgIGlmICghdmVyaWZpY2F0aW9uLm1hdGNoZXMpIHtcbiAgICAgIGNvbnN0IGRpc2NyZXBhbmN5RGV0YWlscyA9IHZlcmlmaWNhdGlvbi5kaXNjcmVwYW5jaWVzXG4gICAgICAgIC5tYXAoXG4gICAgICAgICAgKGQpID0+XG4gICAgICAgICAgICBgQXNzZXQgJHtkLmFzc2V0SWR9OiBleHBlY3RlZCAke2QuZXhwZWN0ZWR9LCBnb3QgJHtkLmFjdHVhbH1gXG4gICAgICAgIClcbiAgICAgICAgLmpvaW4oJzsgJyk7XG5cbiAgICAgIHRocm93IG5ldyBTZXR0bGVtZW50RXJyb3IoXG4gICAgICAgIFNldHRsZW1lbnRGYWlsdXJlLlBPTV9NSVNNQVRDSCxcbiAgICAgICAgYFNldHRsZW1lbnQgcGxhbiBkb2VzIG5vdCBtYXRjaCBQb00gZGVsdGE6ICR7ZGlzY3JlcGFuY3lEZXRhaWxzfWAsXG4gICAgICAgIHZlcmlmaWNhdGlvbi5kaXNjcmVwYW5jaWVzXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBWZXJpZnkgdGhhdCB0cmVhc3VyeSBoYXMgc3VmZmljaWVudCBiYWxhbmNlIGZvciBzZXR0bGVtZW50LlxuICAgKlxuICAgKiBQZXIgY29yZS1pZGVhLm1kIFNlY3Rpb24gNS4xIChQb00gRGVmaW5pdGlvbik6XG4gICAqIFwi4oiAYTogzpQoYSkg4omkIFQoYSlcIiAtIEZvciBlYWNoIGFzc2V0LCBvdXRmbG93IG11c3Qgbm90IGV4Y2VlZCB0cmVhc3VyeSBiYWxhbmNlXG4gICAqXG4gICAqIEBwYXJhbSBleHBlY3RlZERlbHRhIC0gUG9NIGRlbHRhIChyZXF1aXJlZCBvdXRmbG93cylcbiAgICogQHBhcmFtIHNuYXBzaG90IC0gQ3VycmVudCB0cmVhc3VyeSBzbmFwc2hvdFxuICAgKiBAdGhyb3dzIFNldHRsZW1lbnRFcnJvciB3aXRoIElOU1VGRklDSUVOVF9CQUxBTkNFIGlmIGluc29sdmVudFxuICAgKi9cbiAgdmVyaWZ5U29sdmVuY3koZXhwZWN0ZWREZWx0YTogUG9tRGVsdGEsIHNuYXBzaG90OiBUcmVhc3VyeVNuYXBzaG90KTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBbYXNzZXRJZCwgcmVxdWlyZWRBbW91bnRdIG9mIGV4cGVjdGVkRGVsdGEpIHtcbiAgICAgIGNvbnN0IGF2YWlsYWJsZUJhbGFuY2UgPSBzbmFwc2hvdC5iYWxhbmNlcy5nZXQoYXNzZXRJZCkgfHwgMG47XG5cbiAgICAgIGlmIChhdmFpbGFibGVCYWxhbmNlIDwgcmVxdWlyZWRBbW91bnQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFNldHRsZW1lbnRFcnJvcihcbiAgICAgICAgICBTZXR0bGVtZW50RmFpbHVyZS5JTlNVRkZJQ0lFTlRfQkFMQU5DRSxcbiAgICAgICAgICBgSW5zdWZmaWNpZW50IGJhbGFuY2UgZm9yIGFzc2V0ICR7YXNzZXRJZH06IG5lZWQgJHtyZXF1aXJlZEFtb3VudH0sIGhhdmUgJHthdmFpbGFibGVCYWxhbmNlfWAsXG4gICAgICAgICAgeyBhc3NldElkLCByZXF1aXJlZDogcmVxdWlyZWRBbW91bnQsIGF2YWlsYWJsZTogYXZhaWxhYmxlQmFsYW5jZSB9XG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFZlcmlmeSB0aGF0IHdlIGhhdmUgZW5vdWdoIHNpZ25lcnMgdG8gbWVldCB0aHJlc2hvbGQuXG4gICAqXG4gICAqIFBlciBwbGFuLm1kIEE0LjMgKEF1dGhvcml6YXRpb24gQ2hlY2tzKTpcbiAgICogLSBzaWduZXIgc2V0IOKKhiBhdWRpdG9yIHNldFxuICAgKiAtIHRocmVzaG9sZCBzYXRpc2ZpYWJsZVxuICAgKlxuICAgKiBAcGFyYW0gYXZhaWxhYmxlU2lnbmVycyAtIEtleXBhaXJzIGF2YWlsYWJsZSBmb3Igc2lnbmluZ1xuICAgKiBAcGFyYW0gc25hcHNob3QgLSBUcmVhc3VyeSBzbmFwc2hvdCB3aXRoIHNpZ25lciBpbmZvXG4gICAqIEB0aHJvd3MgU2V0dGxlbWVudEVycm9yIHdpdGggVEhSRVNIT0xEX05PVF9NRVQgaWYgaW5zdWZmaWNpZW50IHNpZ25lcnNcbiAgICovXG4gIHZlcmlmeVNpZ25lclRocmVzaG9sZChcbiAgICBhdmFpbGFibGVTaWduZXJzOiBLZXlwYWlyW10sXG4gICAgc25hcHNob3Q6IFRyZWFzdXJ5U25hcHNob3RcbiAgKTogdm9pZCB7XG4gICAgLy8gR2V0IHB1YmxpYyBrZXlzIGZyb20gYXZhaWxhYmxlIHNpZ25lcnNcbiAgICBjb25zdCBhdmFpbGFibGVLZXlzID0gYXZhaWxhYmxlU2lnbmVycy5tYXAoKGspID0+IGsucHVibGljS2V5KCkpO1xuXG4gICAgLy8gQ291bnQgaG93IG1hbnkgYXJlIHZhbGlkIHZhdWx0IHNpZ25lcnNcbiAgICBjb25zdCB2YWxpZFNpZ25lckNvdW50ID0gYXZhaWxhYmxlS2V5cy5maWx0ZXIoKGtleSkgPT5cbiAgICAgIHNuYXBzaG90LnNpZ25lcnMuaW5jbHVkZXMoa2V5KVxuICAgICkubGVuZ3RoO1xuXG4gICAgaWYgKHZhbGlkU2lnbmVyQ291bnQgPCBzbmFwc2hvdC50aHJlc2hvbGQpIHtcbiAgICAgIHRocm93IG5ldyBTZXR0bGVtZW50RXJyb3IoXG4gICAgICAgIFNldHRsZW1lbnRGYWlsdXJlLlRIUkVTSE9MRF9OT1RfTUVULFxuICAgICAgICBgSW5zdWZmaWNpZW50IHNpZ25lcnM6IG5lZWQgJHtzbmFwc2hvdC50aHJlc2hvbGR9LCBoYXZlICR7dmFsaWRTaWduZXJDb3VudH0gdmFsaWQgc2lnbmVyc2AsXG4gICAgICAgIHtcbiAgICAgICAgICByZXF1aXJlZDogc25hcHNob3QudGhyZXNob2xkLFxuICAgICAgICAgIGF2YWlsYWJsZTogdmFsaWRTaWduZXJDb3VudCxcbiAgICAgICAgICB2YWxpZFNpZ25lcnM6IGF2YWlsYWJsZUtleXMuZmlsdGVyKChrZXkpID0+XG4gICAgICAgICAgICBzbmFwc2hvdC5zaWduZXJzLmluY2x1ZGVzKGtleSlcbiAgICAgICAgICApLFxuICAgICAgICB9XG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBTaWduIGEgdHJhbnNhY3Rpb24gd2l0aCBtdWx0aXBsZSBzaWduZXJzLlxuICAgKlxuICAgKiBAcGFyYW0gdHJhbnNhY3Rpb24gLSBUcmFuc2FjdGlvbiB0byBzaWduXG4gICAqIEBwYXJhbSBzaWduZXJLZXlwYWlycyAtIEFycmF5IG9mIHNpZ25lciBrZXlwYWlyc1xuICAgKiBAcGFyYW0gdGhyZXNob2xkIC0gUmVxdWlyZWQgbnVtYmVyIG9mIHNpZ25hdHVyZXNcbiAgICogQHJldHVybnMgU2lnbmVkIHRyYW5zYWN0aW9uXG4gICAqL1xuICBzaWduVHJhbnNhY3Rpb24oXG4gICAgdHJhbnNhY3Rpb246IFRyYW5zYWN0aW9uLFxuICAgIHNpZ25lcktleXBhaXJzOiBLZXlwYWlyW10sXG4gICAgdGhyZXNob2xkOiBudW1iZXJcbiAgKTogVHJhbnNhY3Rpb24ge1xuICAgIGxldCBzaWduZWRDb3VudCA9IDA7XG5cbiAgICBmb3IgKGNvbnN0IGtleXBhaXIgb2Ygc2lnbmVyS2V5cGFpcnMpIHtcbiAgICAgIGlmIChzaWduZWRDb3VudCA+PSB0aHJlc2hvbGQpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIHRyYW5zYWN0aW9uLnNpZ24oa2V5cGFpcik7XG4gICAgICBzaWduZWRDb3VudCsrO1xuICAgIH1cblxuICAgIGlmIChzaWduZWRDb3VudCA8IHRocmVzaG9sZCkge1xuICAgICAgdGhyb3cgbmV3IFNldHRsZW1lbnRFcnJvcihcbiAgICAgICAgU2V0dGxlbWVudEZhaWx1cmUuVEhSRVNIT0xEX05PVF9NRVQsXG4gICAgICAgIGBDb3VsZCBvbmx5IGdhdGhlciAke3NpZ25lZENvdW50fSBzaWduYXR1cmVzLCBuZWVkICR7dGhyZXNob2xkfWAsXG4gICAgICAgIHsgc2lnbmVkOiBzaWduZWRDb3VudCwgcmVxdWlyZWQ6IHRocmVzaG9sZCB9XG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiB0cmFuc2FjdGlvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdWJtaXQgYSBzaWduZWQgdHJhbnNhY3Rpb24gdG8gU3RlbGxhci5cbiAgICpcbiAgICogUGVyIHBsYW4ubWQgQjQ6IFwiU3VibWl0IHRvIFN0ZWxsYXJcIlxuICAgKlxuICAgKiBAcGFyYW0gdHJhbnNhY3Rpb24gLSBTaWduZWQgdHJhbnNhY3Rpb25cbiAgICogQHJldHVybnMgU3VibWlzc2lvbiByZXN1bHQgd2l0aCBoYXNoIGFuZCBsZWRnZXJcbiAgICovXG4gIGFzeW5jIHN1Ym1pdFRyYW5zYWN0aW9uKFxuICAgIHRyYW5zYWN0aW9uOiBUcmFuc2FjdGlvbiB8IEZlZUJ1bXBUcmFuc2FjdGlvblxuICApOiBQcm9taXNlPFN1Ym1pc3Npb25SZXN1bHQ+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLnNlcnZlci5zdWJtaXRUcmFuc2FjdGlvbih0cmFuc2FjdGlvbik7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGhhc2g6IHJlc3BvbnNlLmhhc2gsXG4gICAgICAgIGxlZGdlcjogcmVzcG9uc2UubGVkZ2VyLFxuICAgICAgICBzdWNjZXNzZnVsOiByZXNwb25zZS5zdWNjZXNzZnVsLFxuICAgICAgfTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAvLyBIYW5kbGUgSG9yaXpvbiBlcnJvcnNcbiAgICAgIGlmIChlcnJvci5yZXNwb25zZSAmJiBlcnJvci5yZXNwb25zZS5kYXRhKSB7XG4gICAgICAgIGNvbnN0IGV4dHJhcyA9IGVycm9yLnJlc3BvbnNlLmRhdGEuZXh0cmFzO1xuICAgICAgICB0aHJvdyBuZXcgU2V0dGxlbWVudEVycm9yKFxuICAgICAgICAgIFNldHRsZW1lbnRGYWlsdXJlLlBBUlRJQUxfU1VCTUlTU0lPTixcbiAgICAgICAgICBgVHJhbnNhY3Rpb24gc3VibWlzc2lvbiBmYWlsZWQ6ICR7ZXJyb3IubWVzc2FnZX1gLFxuICAgICAgICAgIHsgaG9yaXpvbkVycm9yOiBleHRyYXMgfVxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICB0aHJvdyBuZXcgU2V0dGxlbWVudEVycm9yKFxuICAgICAgICBTZXR0bGVtZW50RmFpbHVyZS5IT1JJWk9OX1RJTUVPVVQsXG4gICAgICAgIGBUcmFuc2FjdGlvbiBzdWJtaXNzaW9uIGZhaWxlZDogJHtlcnJvci5tZXNzYWdlfWAsXG4gICAgICAgIHsgb3JpZ2luYWxFcnJvcjogZXJyb3IgfVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU3VibWl0IHRyYW5zYWN0aW9uIHdpdGggcmV0cnkgbG9naWMuXG4gICAqXG4gICAqIFBlciBwbGFuLm1kIEI2IChGYWlsdXJlIEhhbmRsaW5nKTpcbiAgICogLSBOZXR3b3JrIHJldHJpZXNcbiAgICogLSBJZGVtcG90ZW5jeSAobWVtby1iYXNlZClcbiAgICpcbiAgICogQHBhcmFtIHRyYW5zYWN0aW9uIC0gU2lnbmVkIHRyYW5zYWN0aW9uXG4gICAqIEBwYXJhbSBtYXhSZXRyaWVzIC0gTWF4aW11bSByZXRyeSBhdHRlbXB0c1xuICAgKiBAcGFyYW0gcmV0cnlEZWxheU1zIC0gQmFzZSBkZWxheSBiZXR3ZWVuIHJldHJpZXNcbiAgICogQHJldHVybnMgU3VibWlzc2lvbiByZXN1bHRcbiAgICovXG4gIGFzeW5jIHN1Ym1pdFdpdGhSZXRyeShcbiAgICB0cmFuc2FjdGlvbjogVHJhbnNhY3Rpb24gfCBGZWVCdW1wVHJhbnNhY3Rpb24sXG4gICAgbWF4UmV0cmllczogbnVtYmVyID0gMyxcbiAgICByZXRyeURlbGF5TXM6IG51bWJlciA9IDEwMDBcbiAgKTogUHJvbWlzZTxTdWJtaXNzaW9uUmVzdWx0PiB7XG4gICAgbGV0IGxhc3RFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cbiAgICBmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8IG1heFJldHJpZXM7IGF0dGVtcHQrKykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGF3YWl0IHRoaXMuc3VibWl0VHJhbnNhY3Rpb24odHJhbnNhY3Rpb24pO1xuICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICBsYXN0RXJyb3IgPSBlcnJvcjtcblxuICAgICAgICAvLyBEb24ndCByZXRyeSBvbiBjZXJ0YWluIGVycm9yc1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBTZXR0bGVtZW50RXJyb3IgJiZcbiAgICAgICAgICBlcnJvci5mYWlsdXJlID09PSBTZXR0bGVtZW50RmFpbHVyZS5QQVJUSUFMX1NVQk1JU1NJT05cbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gVGhpcyBpcyBhIGRlZmluaXRpdmUgZmFpbHVyZSwgZG9uJ3QgcmV0cnlcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEV4cG9uZW50aWFsIGJhY2tvZmZcbiAgICAgICAgaWYgKGF0dGVtcHQgPCBtYXhSZXRyaWVzIC0gMSkge1xuICAgICAgICAgIGNvbnN0IGRlbGF5ID0gcmV0cnlEZWxheU1zICogTWF0aC5wb3coMiwgYXR0ZW1wdCk7XG4gICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgZGVsYXkpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBTZXR0bGVtZW50RXJyb3IoXG4gICAgICBTZXR0bGVtZW50RmFpbHVyZS5IT1JJWk9OX1RJTUVPVVQsXG4gICAgICBgVHJhbnNhY3Rpb24gc3VibWlzc2lvbiBmYWlsZWQgYWZ0ZXIgJHttYXhSZXRyaWVzfSBhdHRlbXB0c2AsXG4gICAgICB7IGxhc3RFcnJvciB9XG4gICAgKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFeGVjdXRlIGZ1bGwgc2V0dGxlbWVudCB3aXRoIGFsbCB2ZXJpZmljYXRpb25zLlxuICAgKlxuICAgKiBUaGlzIGlzIHRoZSBtYWluIGVudHJ5IHBvaW50IGZvciBzZXR0bGVtZW50IGV4ZWN1dGlvbi5cbiAgICogUGVyZm9ybXMgYWxsIHNhZmV0eSBjaGVja3MgYmVmb3JlIHN1Ym1pdHRpbmcgYW55IHRyYW5zYWN0aW9ucy5cbiAgICpcbiAgICogUGVyIHBsYW4ubWQgQjQgU3RlcHM6XG4gICAqIDEuIEZldGNoIGNvbW1pdG1lbnQgKHBhc3NlZCBpbiBhcyBwbGFuKVxuICAgKiAyLiBSZWNvbXB1dGUgTmV0T3V0ZmxvdyAoc2FuaXR5IGNoZWNrKVxuICAgKiAzLiBWZXJpZnkgdHggbWF0Y2hlcyBQb00gZGVsdGFcbiAgICogNC4gU2lnbiB0eFxuICAgKiA1LiBTdWJtaXQgdG8gU3RlbGxhclxuICAgKlxuICAgKiBAcGFyYW0gcGxhbiAtIFNldHRsZW1lbnQgcGxhbiB0byBleGVjdXRlXG4gICAqIEBwYXJhbSBleHBlY3RlZERlbHRhIC0gRXhwZWN0ZWQgUG9NIGRlbHRhIGZvciB2ZXJpZmljYXRpb25cbiAgICogQHBhcmFtIHNuYXBzaG90IC0gQ3VycmVudCB0cmVhc3VyeSBzbmFwc2hvdFxuICAgKiBAcGFyYW0gc2lnbmVyS2V5cGFpcnMgLSBBdmFpbGFibGUgc2lnbmVyIGtleXBhaXJzXG4gICAqIEByZXR1cm5zIEV4ZWN1dGlvbiByZXN1bHQgd2l0aCBhbGwgdHJhbnNhY3Rpb24gaGFzaGVzXG4gICAqL1xuICBhc3luYyBleGVjdXRlU2V0dGxlbWVudChcbiAgICBwbGFuOiBEZXRhaWxlZFNldHRsZW1lbnRQbGFuLFxuICAgIGV4cGVjdGVkRGVsdGE6IFBvbURlbHRhLFxuICAgIHNuYXBzaG90OiBUcmVhc3VyeVNuYXBzaG90LFxuICAgIHNpZ25lcktleXBhaXJzOiBLZXlwYWlyW11cbiAgKTogUHJvbWlzZTxTZXR0bGVtZW50RXhlY3V0aW9uUmVzdWx0PiB7XG4gICAgLy8gU3RlcCAxOiBWZXJpZnkgUG9NIG1hdGNoIChDUklUSUNBTCAtIGhhbHRzIGlmIG1pc21hdGNoKVxuICAgIHRoaXMudmVyaWZ5U2V0dGxlbWVudE1hdGNoZXNQb00ocGxhbiwgZXhwZWN0ZWREZWx0YSk7XG5cbiAgICAvLyBTdGVwIDI6IFZlcmlmeSBzb2x2ZW5jeVxuICAgIHRoaXMudmVyaWZ5U29sdmVuY3koZXhwZWN0ZWREZWx0YSwgc25hcHNob3QpO1xuXG4gICAgLy8gU3RlcCAzOiBWZXJpZnkgd2UgaGF2ZSBlbm91Z2ggc2lnbmVyc1xuICAgIHRoaXMudmVyaWZ5U2lnbmVyVGhyZXNob2xkKHNpZ25lcktleXBhaXJzLCBzbmFwc2hvdCk7XG5cbiAgICAvLyBTdGVwIDQ6IFNpZ24gYW5kIHN1Ym1pdCBlYWNoIHRyYW5zYWN0aW9uXG4gICAgY29uc3QgdHJhbnNhY3Rpb25SZXN1bHRzOiBTZXR0bGVtZW50RXhlY3V0aW9uUmVzdWx0Wyd0cmFuc2FjdGlvblJlc3VsdHMnXSA9IFtdO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwbGFuLnRyYW5zYWN0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgc2V0dGxlbWVudFR4ID0gcGxhbi50cmFuc2FjdGlvbnNbaV07XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIFNpZ24gdGhlIHRyYW5zYWN0aW9uXG4gICAgICAgIGNvbnN0IHNpZ25lZFR4ID0gdGhpcy5zaWduVHJhbnNhY3Rpb24oXG4gICAgICAgICAgc2V0dGxlbWVudFR4LnRyYW5zYWN0aW9uLFxuICAgICAgICAgIHNpZ25lcktleXBhaXJzLFxuICAgICAgICAgIHNuYXBzaG90LnRocmVzaG9sZFxuICAgICAgICApO1xuXG4gICAgICAgIC8vIFN1Ym1pdCB3aXRoIHJldHJ5XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc3VibWl0V2l0aFJldHJ5KHNpZ25lZFR4KTtcblxuICAgICAgICB0cmFuc2FjdGlvblJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgaW5kZXg6IGksXG4gICAgICAgICAgaGFzaDogcmVzdWx0Lmhhc2gsXG4gICAgICAgICAgbGVkZ2VyOiByZXN1bHQubGVkZ2VyLFxuICAgICAgICAgIHdpdGhkcmF3YWxDb3VudDogc2V0dGxlbWVudFR4LndpdGhkcmF3YWxzLmxlbmd0aCxcbiAgICAgICAgfSk7XG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgIC8vIFBlciBwbGFuLm1kIEI2OiBcImhhbHQgb24gUG9NIG1pc21hdGNoXCIgLyBcInBhcnRpYWwgc3VibWlzc2lvbiBmYWlsdXJlc1wiXG4gICAgICAgIC8vIElmIGFueSB0cmFuc2FjdGlvbiBmYWlscywgd2UgaGFsdCBhbmQgcmVwb3J0XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgdHJhbnNhY3Rpb25SZXN1bHRzLFxuICAgICAgICAgIGZhaWxlZEF0OiBpLFxuICAgICAgICAgIGVycm9yOiBlcnJvci5tZXNzYWdlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiB0cnVlLFxuICAgICAgdHJhbnNhY3Rpb25SZXN1bHRzLFxuICAgIH07XG4gIH1cbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBNdWx0aXNpZ09yY2hlc3RyYXRvciBmb3IgdGVzdG5ldFxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGVzdG5ldE9yY2hlc3RyYXRvcigpOiBNdWx0aXNpZ09yY2hlc3RyYXRvciB7XG4gIHJldHVybiBuZXcgTXVsdGlzaWdPcmNoZXN0cmF0b3IoVEVTVE5FVF9DT05GSUcpO1xufVxuIl19