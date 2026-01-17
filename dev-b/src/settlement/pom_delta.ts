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
import { computeAssetId } from '../interfaces/crypto';

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
export function computeNetOutflow(withdrawals: WithdrawalIntent[]): PomDelta {
  const delta: PomDelta = new Map();

  for (const withdrawal of withdrawals) {
    // Compute asset_id per interfaces.md Section 2.2
    // asset_id = SHA256(asset_code || issuer)
    const assetId = computeAssetId(withdrawal.asset_code, withdrawal.issuer);

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
export function pomDeltaToJSON(delta: PomDelta): PomDeltaJSON {
  const json: PomDeltaJSON = {};

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
export function pomDeltaFromJSON(json: PomDeltaJSON): PomDelta {
  const delta: PomDelta = new Map();

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
export function verifyDeltaMatch(
  planDelta: PomDelta,
  pomDelta: PomDelta
): {
  matches: boolean;
  discrepancies: Array<{
    assetId: string;
    expected: bigint;
    actual: bigint;
  }>;
} {
  const discrepancies: Array<{
    assetId: string;
    expected: bigint;
    actual: bigint;
  }> = [];

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
export function groupWithdrawalsByAsset(
  withdrawals: WithdrawalIntent[]
): Map<string, WithdrawalIntent[]> {
  const groups = new Map<string, WithdrawalIntent[]>();

  for (const withdrawal of withdrawals) {
    const assetId = computeAssetId(withdrawal.asset_code, withdrawal.issuer);

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
export function sortWithdrawalsDeterministically(
  withdrawals: WithdrawalIntent[]
): WithdrawalIntent[] {
  return [...withdrawals].sort((a, b) => {
    // Sort by withdrawal_id (hex string comparison)
    const idA = a.withdrawal_id.toLowerCase();
    const idB = b.withdrawal_id.toLowerCase();
    return idA.localeCompare(idB);
  });
}
