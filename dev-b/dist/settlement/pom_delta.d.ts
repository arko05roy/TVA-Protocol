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
import { WithdrawalIntent, PomDelta, PomDeltaJSON } from '../interfaces/types';
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
export declare function computeNetOutflow(withdrawals: WithdrawalIntent[]): PomDelta;
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
export declare function pomDeltaToJSON(delta: PomDelta): PomDeltaJSON;
/**
 * Parse PoM delta from JSON format.
 *
 * @param json - JSON object with asset_id -> amount string
 * @returns PoM delta map
 */
export declare function pomDeltaFromJSON(json: PomDeltaJSON): PomDelta;
/**
 * Verify that a settlement plan matches the PoM delta exactly.
 *
 * This is a critical safety check - NEVER submit if mismatched.
 *
 * @param planDelta - Delta computed from settlement plan transactions
 * @param pomDelta - Delta computed from withdrawal queue
 * @returns Object with match status and any discrepancies
 */
export declare function verifyDeltaMatch(planDelta: PomDelta, pomDelta: PomDelta): {
    matches: boolean;
    discrepancies: Array<{
        assetId: string;
        expected: bigint;
        actual: bigint;
    }>;
};
/**
 * Group withdrawals by asset for efficient batching.
 *
 * @param withdrawals - Array of withdrawal intents
 * @returns Map of asset_id -> array of withdrawals for that asset
 */
export declare function groupWithdrawalsByAsset(withdrawals: WithdrawalIntent[]): Map<string, WithdrawalIntent[]>;
/**
 * Sort withdrawals deterministically for consistent transaction ordering.
 *
 * Withdrawals are sorted by withdrawal_id to ensure the same withdrawal queue
 * always produces the same settlement transactions.
 *
 * @param withdrawals - Array of withdrawal intents
 * @returns Sorted array (new array, doesn't mutate input)
 */
export declare function sortWithdrawalsDeterministically(withdrawals: WithdrawalIntent[]): WithdrawalIntent[];
