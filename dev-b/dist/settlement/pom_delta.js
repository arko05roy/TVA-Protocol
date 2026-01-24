"use strict";
/**
 * ASTRAEUS - Proof of Money (PoM) Delta Computation
 *
 * Implements PoM Delta Schema as specified in agent/interfaces.md Section 2.
 *
 * The PoM Delta represents the net monetary outflow from a subnet's withdrawal queue.
 * It is computed by summing all withdrawal amounts, grouped by asset.
 *
 * From interfaces.md:
 * - asset_id = SHA256(asset_code || issuer)
 * - Delta format: { "asset_id_hex": "i128_string" }
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeNetOutflow = computeNetOutflow;
exports.pomDeltaToJSON = pomDeltaToJSON;
exports.pomDeltaFromJSON = pomDeltaFromJSON;
exports.verifyDeltaMatch = verifyDeltaMatch;
exports.groupWithdrawalsByAsset = groupWithdrawalsByAsset;
exports.sortWithdrawalsDeterministically = sortWithdrawalsDeterministically;
const crypto_1 = require("../interfaces/crypto");
/**
 * Compute the PoM delta from a withdrawal queue.
 *
 * Per interfaces.md Section 2.4:
 * 1. Initialize an empty map: delta = {}
 * 2. For each withdrawal in the withdrawal queue:
 *    - Compute asset_id = SHA256(asset_code || issuer)
 *    - Add withdrawal.amount to delta[asset_id]
 * 3. Output as map of asset_id -> total_outflow
 *
 * @param withdrawals - Array of withdrawal intents from ExecutionCore
 * @returns Map of asset_id_hex -> total outflow in stroops
 */
function computeNetOutflow(withdrawals) {
    const delta = new Map();
    for (const withdrawal of withdrawals) {
        // Compute asset_id per interfaces.md Section 2.2
        // asset_id = SHA256(asset_code || issuer)
        const assetId = (0, crypto_1.computeAssetId)(withdrawal.asset_code, withdrawal.issuer);
        // Parse amount (comes as decimal string from contract)
        const amount = BigInt(withdrawal.amount);
        // Accumulate outflow for this asset
        const currentOutflow = delta.get(assetId) || 0n;
        delta.set(assetId, currentOutflow + amount);
    }
    return delta;
}
/**
 * Convert PoM delta to JSON format for transmission/storage.
 *
 * Per interfaces.md Section 2.3:
 * {
 *   "asset_id_hex": "i128_string"
 * }
 *
 * @param delta - PoM delta map
 * @returns JSON-serializable object
 */
function pomDeltaToJSON(delta) {
    const json = {};
    for (const [assetId, amount] of delta) {
        // asset_id is already lowercase hex (64 chars)
        // amount is converted to decimal string
        json[assetId] = amount.toString();
    }
    return json;
}
/**
 * Parse PoM delta from JSON format.
 *
 * @param json - JSON object with asset_id -> amount string
 * @returns PoM delta map
 */
function pomDeltaFromJSON(json) {
    const delta = new Map();
    for (const [assetId, amountStr] of Object.entries(json)) {
        delta.set(assetId, BigInt(amountStr));
    }
    return delta;
}
/**
 * Verify that a settlement plan matches the PoM delta exactly.
 *
 * This is a critical safety check - NEVER submit if mismatched.
 *
 * @param planDelta - Delta computed from settlement plan transactions
 * @param pomDelta - Delta computed from withdrawal queue
 * @returns Object with match status and any discrepancies
 */
function verifyDeltaMatch(planDelta, pomDelta) {
    const discrepancies = [];
    // Check all assets in PoM delta
    for (const [assetId, expectedAmount] of pomDelta) {
        const actualAmount = planDelta.get(assetId) || 0n;
        if (actualAmount !== expectedAmount) {
            discrepancies.push({
                assetId,
                expected: expectedAmount,
                actual: actualAmount,
            });
        }
    }
    // Check for extra assets in plan that shouldn't be there
    for (const [assetId, actualAmount] of planDelta) {
        if (!pomDelta.has(assetId)) {
            discrepancies.push({
                assetId,
                expected: 0n,
                actual: actualAmount,
            });
        }
    }
    return {
        matches: discrepancies.length === 0,
        discrepancies,
    };
}
/**
 * Group withdrawals by asset for efficient batching.
 *
 * @param withdrawals - Array of withdrawal intents
 * @returns Map of asset_id -> array of withdrawals for that asset
 */
function groupWithdrawalsByAsset(withdrawals) {
    const groups = new Map();
    for (const withdrawal of withdrawals) {
        const assetId = (0, crypto_1.computeAssetId)(withdrawal.asset_code, withdrawal.issuer);
        const group = groups.get(assetId) || [];
        group.push(withdrawal);
        groups.set(assetId, group);
    }
    return groups;
}
/**
 * Sort withdrawals deterministically for consistent transaction ordering.
 *
 * Withdrawals are sorted by withdrawal_id to ensure the same withdrawal queue
 * always produces the same settlement transactions.
 *
 * @param withdrawals - Array of withdrawal intents
 * @returns Sorted array (new array, doesn't mutate input)
 */
function sortWithdrawalsDeterministically(withdrawals) {
    return [...withdrawals].sort((a, b) => {
        // Sort by withdrawal_id (hex string comparison)
        const idA = a.withdrawal_id.toLowerCase();
        const idB = b.withdrawal_id.toLowerCase();
        return idA.localeCompare(idB);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9tX2RlbHRhLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3NldHRsZW1lbnQvcG9tX2RlbHRhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7R0FXRzs7QUFrQkgsOENBaUJDO0FBYUQsd0NBVUM7QUFRRCw0Q0FRQztBQVdELDRDQTZDQztBQVFELDBEQWNDO0FBV0QsNEVBU0M7QUF6S0QsaURBQXNEO0FBRXREOzs7Ozs7Ozs7Ozs7R0FZRztBQUNILFNBQWdCLGlCQUFpQixDQUFDLFdBQStCO0lBQy9ELE1BQU0sS0FBSyxHQUFhLElBQUksR0FBRyxFQUFFLENBQUM7SUFFbEMsS0FBSyxNQUFNLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQztRQUNyQyxpREFBaUQ7UUFDakQsMENBQTBDO1FBQzFDLE1BQU0sT0FBTyxHQUFHLElBQUEsdUJBQWMsRUFBQyxVQUFVLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV6RSx1REFBdUQ7UUFDdkQsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV6QyxvQ0FBb0M7UUFDcEMsTUFBTSxjQUFjLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDaEQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsY0FBYyxHQUFHLE1BQU0sQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUM7QUFFRDs7Ozs7Ozs7OztHQVVHO0FBQ0gsU0FBZ0IsY0FBYyxDQUFDLEtBQWU7SUFDNUMsTUFBTSxJQUFJLEdBQWlCLEVBQUUsQ0FBQztJQUU5QixLQUFLLE1BQU0sQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUM7UUFDdEMsK0NBQStDO1FBQy9DLHdDQUF3QztRQUN4QyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ3BDLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQztBQUNkLENBQUM7QUFFRDs7Ozs7R0FLRztBQUNILFNBQWdCLGdCQUFnQixDQUFDLElBQWtCO0lBQ2pELE1BQU0sS0FBSyxHQUFhLElBQUksR0FBRyxFQUFFLENBQUM7SUFFbEMsS0FBSyxNQUFNLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztRQUN4RCxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZixDQUFDO0FBRUQ7Ozs7Ozs7O0dBUUc7QUFDSCxTQUFnQixnQkFBZ0IsQ0FDOUIsU0FBbUIsRUFDbkIsUUFBa0I7SUFTbEIsTUFBTSxhQUFhLEdBSWQsRUFBRSxDQUFDO0lBRVIsZ0NBQWdDO0lBQ2hDLEtBQUssTUFBTSxDQUFDLE9BQU8sRUFBRSxjQUFjLENBQUMsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUNqRCxNQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUVsRCxJQUFJLFlBQVksS0FBSyxjQUFjLEVBQUUsQ0FBQztZQUNwQyxhQUFhLENBQUMsSUFBSSxDQUFDO2dCQUNqQixPQUFPO2dCQUNQLFFBQVEsRUFBRSxjQUFjO2dCQUN4QixNQUFNLEVBQUUsWUFBWTthQUNyQixDQUFDLENBQUM7UUFDTCxDQUFDO0lBQ0gsQ0FBQztJQUVELHlEQUF5RDtJQUN6RCxLQUFLLE1BQU0sQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLElBQUksU0FBUyxFQUFFLENBQUM7UUFDaEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUMzQixhQUFhLENBQUMsSUFBSSxDQUFDO2dCQUNqQixPQUFPO2dCQUNQLFFBQVEsRUFBRSxFQUFFO2dCQUNaLE1BQU0sRUFBRSxZQUFZO2FBQ3JCLENBQUMsQ0FBQztRQUNMLENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTztRQUNMLE9BQU8sRUFBRSxhQUFhLENBQUMsTUFBTSxLQUFLLENBQUM7UUFDbkMsYUFBYTtLQUNkLENBQUM7QUFDSixDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSCxTQUFnQix1QkFBdUIsQ0FDckMsV0FBK0I7SUFFL0IsTUFBTSxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQThCLENBQUM7SUFFckQsS0FBSyxNQUFNLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQztRQUNyQyxNQUFNLE9BQU8sR0FBRyxJQUFBLHVCQUFjLEVBQUMsVUFBVSxDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFekUsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDeEMsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN2QixNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM3QixDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQztBQUVEOzs7Ozs7OztHQVFHO0FBQ0gsU0FBZ0IsZ0NBQWdDLENBQzlDLFdBQStCO0lBRS9CLE9BQU8sQ0FBQyxHQUFHLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUNwQyxnREFBZ0Q7UUFDaEQsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUMxQyxNQUFNLEdBQUcsR0FBRyxDQUFDLENBQUMsYUFBYSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQzFDLE9BQU8sR0FBRyxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNoQyxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEFTVFJBRVVTIC0gUHJvb2Ygb2YgTW9uZXkgKFBvTSkgRGVsdGEgQ29tcHV0YXRpb25cbiAqXG4gKiBJbXBsZW1lbnRzIFBvTSBEZWx0YSBTY2hlbWEgYXMgc3BlY2lmaWVkIGluIGFnZW50L2ludGVyZmFjZXMubWQgU2VjdGlvbiAyLlxuICpcbiAqIFRoZSBQb00gRGVsdGEgcmVwcmVzZW50cyB0aGUgbmV0IG1vbmV0YXJ5IG91dGZsb3cgZnJvbSBhIHN1Ym5ldCdzIHdpdGhkcmF3YWwgcXVldWUuXG4gKiBJdCBpcyBjb21wdXRlZCBieSBzdW1taW5nIGFsbCB3aXRoZHJhd2FsIGFtb3VudHMsIGdyb3VwZWQgYnkgYXNzZXQuXG4gKlxuICogRnJvbSBpbnRlcmZhY2VzLm1kOlxuICogLSBhc3NldF9pZCA9IFNIQTI1Nihhc3NldF9jb2RlIHx8IGlzc3VlcilcbiAqIC0gRGVsdGEgZm9ybWF0OiB7IFwiYXNzZXRfaWRfaGV4XCI6IFwiaTEyOF9zdHJpbmdcIiB9XG4gKi9cblxuaW1wb3J0IHsgV2l0aGRyYXdhbEludGVudCwgUG9tRGVsdGEsIFBvbURlbHRhSlNPTiB9IGZyb20gJy4uL2ludGVyZmFjZXMvdHlwZXMnO1xuaW1wb3J0IHsgY29tcHV0ZUFzc2V0SWQgfSBmcm9tICcuLi9pbnRlcmZhY2VzL2NyeXB0byc7XG5cbi8qKlxuICogQ29tcHV0ZSB0aGUgUG9NIGRlbHRhIGZyb20gYSB3aXRoZHJhd2FsIHF1ZXVlLlxuICpcbiAqIFBlciBpbnRlcmZhY2VzLm1kIFNlY3Rpb24gMi40OlxuICogMS4gSW5pdGlhbGl6ZSBhbiBlbXB0eSBtYXA6IGRlbHRhID0ge31cbiAqIDIuIEZvciBlYWNoIHdpdGhkcmF3YWwgaW4gdGhlIHdpdGhkcmF3YWwgcXVldWU6XG4gKiAgICAtIENvbXB1dGUgYXNzZXRfaWQgPSBTSEEyNTYoYXNzZXRfY29kZSB8fCBpc3N1ZXIpXG4gKiAgICAtIEFkZCB3aXRoZHJhd2FsLmFtb3VudCB0byBkZWx0YVthc3NldF9pZF1cbiAqIDMuIE91dHB1dCBhcyBtYXAgb2YgYXNzZXRfaWQgLT4gdG90YWxfb3V0Zmxvd1xuICpcbiAqIEBwYXJhbSB3aXRoZHJhd2FscyAtIEFycmF5IG9mIHdpdGhkcmF3YWwgaW50ZW50cyBmcm9tIEV4ZWN1dGlvbkNvcmVcbiAqIEByZXR1cm5zIE1hcCBvZiBhc3NldF9pZF9oZXggLT4gdG90YWwgb3V0ZmxvdyBpbiBzdHJvb3BzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlTmV0T3V0Zmxvdyh3aXRoZHJhd2FsczogV2l0aGRyYXdhbEludGVudFtdKTogUG9tRGVsdGEge1xuICBjb25zdCBkZWx0YTogUG9tRGVsdGEgPSBuZXcgTWFwKCk7XG5cbiAgZm9yIChjb25zdCB3aXRoZHJhd2FsIG9mIHdpdGhkcmF3YWxzKSB7XG4gICAgLy8gQ29tcHV0ZSBhc3NldF9pZCBwZXIgaW50ZXJmYWNlcy5tZCBTZWN0aW9uIDIuMlxuICAgIC8vIGFzc2V0X2lkID0gU0hBMjU2KGFzc2V0X2NvZGUgfHwgaXNzdWVyKVxuICAgIGNvbnN0IGFzc2V0SWQgPSBjb21wdXRlQXNzZXRJZCh3aXRoZHJhd2FsLmFzc2V0X2NvZGUsIHdpdGhkcmF3YWwuaXNzdWVyKTtcblxuICAgIC8vIFBhcnNlIGFtb3VudCAoY29tZXMgYXMgZGVjaW1hbCBzdHJpbmcgZnJvbSBjb250cmFjdClcbiAgICBjb25zdCBhbW91bnQgPSBCaWdJbnQod2l0aGRyYXdhbC5hbW91bnQpO1xuXG4gICAgLy8gQWNjdW11bGF0ZSBvdXRmbG93IGZvciB0aGlzIGFzc2V0XG4gICAgY29uc3QgY3VycmVudE91dGZsb3cgPSBkZWx0YS5nZXQoYXNzZXRJZCkgfHwgMG47XG4gICAgZGVsdGEuc2V0KGFzc2V0SWQsIGN1cnJlbnRPdXRmbG93ICsgYW1vdW50KTtcbiAgfVxuXG4gIHJldHVybiBkZWx0YTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0IFBvTSBkZWx0YSB0byBKU09OIGZvcm1hdCBmb3IgdHJhbnNtaXNzaW9uL3N0b3JhZ2UuXG4gKlxuICogUGVyIGludGVyZmFjZXMubWQgU2VjdGlvbiAyLjM6XG4gKiB7XG4gKiAgIFwiYXNzZXRfaWRfaGV4XCI6IFwiaTEyOF9zdHJpbmdcIlxuICogfVxuICpcbiAqIEBwYXJhbSBkZWx0YSAtIFBvTSBkZWx0YSBtYXBcbiAqIEByZXR1cm5zIEpTT04tc2VyaWFsaXphYmxlIG9iamVjdFxuICovXG5leHBvcnQgZnVuY3Rpb24gcG9tRGVsdGFUb0pTT04oZGVsdGE6IFBvbURlbHRhKTogUG9tRGVsdGFKU09OIHtcbiAgY29uc3QganNvbjogUG9tRGVsdGFKU09OID0ge307XG5cbiAgZm9yIChjb25zdCBbYXNzZXRJZCwgYW1vdW50XSBvZiBkZWx0YSkge1xuICAgIC8vIGFzc2V0X2lkIGlzIGFscmVhZHkgbG93ZXJjYXNlIGhleCAoNjQgY2hhcnMpXG4gICAgLy8gYW1vdW50IGlzIGNvbnZlcnRlZCB0byBkZWNpbWFsIHN0cmluZ1xuICAgIGpzb25bYXNzZXRJZF0gPSBhbW91bnQudG9TdHJpbmcoKTtcbiAgfVxuXG4gIHJldHVybiBqc29uO1xufVxuXG4vKipcbiAqIFBhcnNlIFBvTSBkZWx0YSBmcm9tIEpTT04gZm9ybWF0LlxuICpcbiAqIEBwYXJhbSBqc29uIC0gSlNPTiBvYmplY3Qgd2l0aCBhc3NldF9pZCAtPiBhbW91bnQgc3RyaW5nXG4gKiBAcmV0dXJucyBQb00gZGVsdGEgbWFwXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwb21EZWx0YUZyb21KU09OKGpzb246IFBvbURlbHRhSlNPTik6IFBvbURlbHRhIHtcbiAgY29uc3QgZGVsdGE6IFBvbURlbHRhID0gbmV3IE1hcCgpO1xuXG4gIGZvciAoY29uc3QgW2Fzc2V0SWQsIGFtb3VudFN0cl0gb2YgT2JqZWN0LmVudHJpZXMoanNvbikpIHtcbiAgICBkZWx0YS5zZXQoYXNzZXRJZCwgQmlnSW50KGFtb3VudFN0cikpO1xuICB9XG5cbiAgcmV0dXJuIGRlbHRhO1xufVxuXG4vKipcbiAqIFZlcmlmeSB0aGF0IGEgc2V0dGxlbWVudCBwbGFuIG1hdGNoZXMgdGhlIFBvTSBkZWx0YSBleGFjdGx5LlxuICpcbiAqIFRoaXMgaXMgYSBjcml0aWNhbCBzYWZldHkgY2hlY2sgLSBORVZFUiBzdWJtaXQgaWYgbWlzbWF0Y2hlZC5cbiAqXG4gKiBAcGFyYW0gcGxhbkRlbHRhIC0gRGVsdGEgY29tcHV0ZWQgZnJvbSBzZXR0bGVtZW50IHBsYW4gdHJhbnNhY3Rpb25zXG4gKiBAcGFyYW0gcG9tRGVsdGEgLSBEZWx0YSBjb21wdXRlZCBmcm9tIHdpdGhkcmF3YWwgcXVldWVcbiAqIEByZXR1cm5zIE9iamVjdCB3aXRoIG1hdGNoIHN0YXR1cyBhbmQgYW55IGRpc2NyZXBhbmNpZXNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZlcmlmeURlbHRhTWF0Y2goXG4gIHBsYW5EZWx0YTogUG9tRGVsdGEsXG4gIHBvbURlbHRhOiBQb21EZWx0YVxuKToge1xuICBtYXRjaGVzOiBib29sZWFuO1xuICBkaXNjcmVwYW5jaWVzOiBBcnJheTx7XG4gICAgYXNzZXRJZDogc3RyaW5nO1xuICAgIGV4cGVjdGVkOiBiaWdpbnQ7XG4gICAgYWN0dWFsOiBiaWdpbnQ7XG4gIH0+O1xufSB7XG4gIGNvbnN0IGRpc2NyZXBhbmNpZXM6IEFycmF5PHtcbiAgICBhc3NldElkOiBzdHJpbmc7XG4gICAgZXhwZWN0ZWQ6IGJpZ2ludDtcbiAgICBhY3R1YWw6IGJpZ2ludDtcbiAgfT4gPSBbXTtcblxuICAvLyBDaGVjayBhbGwgYXNzZXRzIGluIFBvTSBkZWx0YVxuICBmb3IgKGNvbnN0IFthc3NldElkLCBleHBlY3RlZEFtb3VudF0gb2YgcG9tRGVsdGEpIHtcbiAgICBjb25zdCBhY3R1YWxBbW91bnQgPSBwbGFuRGVsdGEuZ2V0KGFzc2V0SWQpIHx8IDBuO1xuXG4gICAgaWYgKGFjdHVhbEFtb3VudCAhPT0gZXhwZWN0ZWRBbW91bnQpIHtcbiAgICAgIGRpc2NyZXBhbmNpZXMucHVzaCh7XG4gICAgICAgIGFzc2V0SWQsXG4gICAgICAgIGV4cGVjdGVkOiBleHBlY3RlZEFtb3VudCxcbiAgICAgICAgYWN0dWFsOiBhY3R1YWxBbW91bnQsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICAvLyBDaGVjayBmb3IgZXh0cmEgYXNzZXRzIGluIHBsYW4gdGhhdCBzaG91bGRuJ3QgYmUgdGhlcmVcbiAgZm9yIChjb25zdCBbYXNzZXRJZCwgYWN0dWFsQW1vdW50XSBvZiBwbGFuRGVsdGEpIHtcbiAgICBpZiAoIXBvbURlbHRhLmhhcyhhc3NldElkKSkge1xuICAgICAgZGlzY3JlcGFuY2llcy5wdXNoKHtcbiAgICAgICAgYXNzZXRJZCxcbiAgICAgICAgZXhwZWN0ZWQ6IDBuLFxuICAgICAgICBhY3R1YWw6IGFjdHVhbEFtb3VudCxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgbWF0Y2hlczogZGlzY3JlcGFuY2llcy5sZW5ndGggPT09IDAsXG4gICAgZGlzY3JlcGFuY2llcyxcbiAgfTtcbn1cblxuLyoqXG4gKiBHcm91cCB3aXRoZHJhd2FscyBieSBhc3NldCBmb3IgZWZmaWNpZW50IGJhdGNoaW5nLlxuICpcbiAqIEBwYXJhbSB3aXRoZHJhd2FscyAtIEFycmF5IG9mIHdpdGhkcmF3YWwgaW50ZW50c1xuICogQHJldHVybnMgTWFwIG9mIGFzc2V0X2lkIC0+IGFycmF5IG9mIHdpdGhkcmF3YWxzIGZvciB0aGF0IGFzc2V0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBncm91cFdpdGhkcmF3YWxzQnlBc3NldChcbiAgd2l0aGRyYXdhbHM6IFdpdGhkcmF3YWxJbnRlbnRbXVxuKTogTWFwPHN0cmluZywgV2l0aGRyYXdhbEludGVudFtdPiB7XG4gIGNvbnN0IGdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBXaXRoZHJhd2FsSW50ZW50W10+KCk7XG5cbiAgZm9yIChjb25zdCB3aXRoZHJhd2FsIG9mIHdpdGhkcmF3YWxzKSB7XG4gICAgY29uc3QgYXNzZXRJZCA9IGNvbXB1dGVBc3NldElkKHdpdGhkcmF3YWwuYXNzZXRfY29kZSwgd2l0aGRyYXdhbC5pc3N1ZXIpO1xuXG4gICAgY29uc3QgZ3JvdXAgPSBncm91cHMuZ2V0KGFzc2V0SWQpIHx8IFtdO1xuICAgIGdyb3VwLnB1c2god2l0aGRyYXdhbCk7XG4gICAgZ3JvdXBzLnNldChhc3NldElkLCBncm91cCk7XG4gIH1cblxuICByZXR1cm4gZ3JvdXBzO1xufVxuXG4vKipcbiAqIFNvcnQgd2l0aGRyYXdhbHMgZGV0ZXJtaW5pc3RpY2FsbHkgZm9yIGNvbnNpc3RlbnQgdHJhbnNhY3Rpb24gb3JkZXJpbmcuXG4gKlxuICogV2l0aGRyYXdhbHMgYXJlIHNvcnRlZCBieSB3aXRoZHJhd2FsX2lkIHRvIGVuc3VyZSB0aGUgc2FtZSB3aXRoZHJhd2FsIHF1ZXVlXG4gKiBhbHdheXMgcHJvZHVjZXMgdGhlIHNhbWUgc2V0dGxlbWVudCB0cmFuc2FjdGlvbnMuXG4gKlxuICogQHBhcmFtIHdpdGhkcmF3YWxzIC0gQXJyYXkgb2Ygd2l0aGRyYXdhbCBpbnRlbnRzXG4gKiBAcmV0dXJucyBTb3J0ZWQgYXJyYXkgKG5ldyBhcnJheSwgZG9lc24ndCBtdXRhdGUgaW5wdXQpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzb3J0V2l0aGRyYXdhbHNEZXRlcm1pbmlzdGljYWxseShcbiAgd2l0aGRyYXdhbHM6IFdpdGhkcmF3YWxJbnRlbnRbXVxuKTogV2l0aGRyYXdhbEludGVudFtdIHtcbiAgcmV0dXJuIFsuLi53aXRoZHJhd2Fsc10uc29ydCgoYSwgYikgPT4ge1xuICAgIC8vIFNvcnQgYnkgd2l0aGRyYXdhbF9pZCAoaGV4IHN0cmluZyBjb21wYXJpc29uKVxuICAgIGNvbnN0IGlkQSA9IGEud2l0aGRyYXdhbF9pZC50b0xvd2VyQ2FzZSgpO1xuICAgIGNvbnN0IGlkQiA9IGIud2l0aGRyYXdhbF9pZC50b0xvd2VyQ2FzZSgpO1xuICAgIHJldHVybiBpZEEubG9jYWxlQ29tcGFyZShpZEIpO1xuICB9KTtcbn1cbiJdfQ==