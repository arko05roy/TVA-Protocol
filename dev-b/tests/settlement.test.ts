/**
 * ASTRAEUS - Settlement Tests
 *
 * Tests for PoM delta computation, settlement planning, and verification.
 * Uses actual specifications from interfaces.md and plan.md.
 */

import { Keypair } from '@stellar/stellar-sdk';
import {
  computeNetOutflow,
  pomDeltaToJSON,
  pomDeltaFromJSON,
  verifyDeltaMatch,
  groupWithdrawalsByAsset,
  sortWithdrawalsDeterministically,
} from '../src/settlement/pom_delta';
import { computeAssetId, computeMemo } from '../src/interfaces/crypto';
import { WithdrawalIntent, PomDelta } from '../src/interfaces/types';

/**
 * Create a withdrawal intent for testing.
 * Uses proper format from contracts/WITHDRAWAL_QUEUE_FORMAT.md
 */
function createWithdrawal(
  id: string,
  userId: string,
  assetCode: string,
  issuer: string,
  amount: string,
  destination: string
): WithdrawalIntent {
  return {
    withdrawal_id: id,
    user_id: userId,
    asset_code: assetCode,
    issuer: issuer,
    amount: amount,
    destination: destination,
  };
}

describe('PoM Delta Computation', () => {
  /**
   * Per interfaces.md Section 2.4:
   * NetOutflow[A] = Σ withdrawal.amount where asset == A
   */
  describe('computeNetOutflow', () => {
    it('should compute correct delta for single withdrawal', () => {
      const issuer = Keypair.random().publicKey();
      const withdrawals: WithdrawalIntent[] = [
        createWithdrawal(
          '0x' + '01'.repeat(32),
          '0x' + '02'.repeat(32),
          'USDC',
          issuer,
          '1000000', // 1 USDC (6 decimals)
          Keypair.random().publicKey()
        ),
      ];

      const delta = computeNetOutflow(withdrawals);
      const assetId = computeAssetId('USDC', issuer);

      expect(delta.size).toBe(1);
      expect(delta.get(assetId)).toBe(1000000n);
    });

    it('should sum withdrawals for same asset', () => {
      const issuer = Keypair.random().publicKey();
      const withdrawals: WithdrawalIntent[] = [
        createWithdrawal(
          '0x' + '01'.repeat(32),
          '0x' + '02'.repeat(32),
          'USDC',
          issuer,
          '1500000',
          Keypair.random().publicKey()
        ),
        createWithdrawal(
          '0x' + '03'.repeat(32),
          '0x' + '04'.repeat(32),
          'USDC',
          issuer,
          '500000',
          Keypair.random().publicKey()
        ),
      ];

      const delta = computeNetOutflow(withdrawals);
      const assetId = computeAssetId('USDC', issuer);

      // Per interfaces.md Section 2.5 example:
      // Withdrawal 1: 1500000 + Withdrawal 2: 500000 = 2000000
      expect(delta.get(assetId)).toBe(2000000n);
    });

    it('should handle multiple assets', () => {
      const usdcIssuer = Keypair.random().publicKey();
      const withdrawals: WithdrawalIntent[] = [
        createWithdrawal(
          '0x' + '01'.repeat(32),
          '0x' + '02'.repeat(32),
          'USDC',
          usdcIssuer,
          '1000000',
          Keypair.random().publicKey()
        ),
        createWithdrawal(
          '0x' + '03'.repeat(32),
          '0x' + '04'.repeat(32),
          'XLM',
          'NATIVE',
          '20000000', // 2 XLM
          Keypair.random().publicKey()
        ),
      ];

      const delta = computeNetOutflow(withdrawals);

      expect(delta.size).toBe(2);

      const usdcId = computeAssetId('USDC', usdcIssuer);
      const xlmId = computeAssetId('XLM', 'NATIVE');

      expect(delta.get(usdcId)).toBe(1000000n);
      expect(delta.get(xlmId)).toBe(20000000n);
    });

    it('should return empty delta for empty withdrawal queue', () => {
      const delta = computeNetOutflow([]);
      expect(delta.size).toBe(0);
    });
  });

  describe('pomDeltaToJSON / pomDeltaFromJSON', () => {
    it('should convert delta to JSON format per interfaces.md Section 2.3', () => {
      const delta: PomDelta = new Map([
        ['abc123'.padEnd(64, '0'), 1000000n],
        ['def456'.padEnd(64, '0'), 2000000n],
      ]);

      const json = pomDeltaToJSON(delta);

      // Per interfaces.md: { "asset_id_hex": "i128_string" }
      expect(json['abc123'.padEnd(64, '0')]).toBe('1000000');
      expect(json['def456'.padEnd(64, '0')]).toBe('2000000');
    });

    it('should roundtrip through JSON', () => {
      const original: PomDelta = new Map([
        ['abc123'.padEnd(64, '0'), 1000000n],
        ['def456'.padEnd(64, '0'), 2000000n],
      ]);

      const json = pomDeltaToJSON(original);
      const recovered = pomDeltaFromJSON(json);

      expect(recovered.size).toBe(original.size);
      for (const [key, value] of original) {
        expect(recovered.get(key)).toBe(value);
      }
    });
  });

  describe('verifyDeltaMatch', () => {
    it('should pass for matching deltas', () => {
      const delta1: PomDelta = new Map([
        ['asset1'.padEnd(64, '0'), 1000000n],
        ['asset2'.padEnd(64, '0'), 2000000n],
      ]);

      const delta2: PomDelta = new Map([
        ['asset1'.padEnd(64, '0'), 1000000n],
        ['asset2'.padEnd(64, '0'), 2000000n],
      ]);

      const result = verifyDeltaMatch(delta1, delta2);

      expect(result.matches).toBe(true);
      expect(result.discrepancies.length).toBe(0);
    });

    it('should fail for mismatched amounts', () => {
      const delta1: PomDelta = new Map([
        ['asset1'.padEnd(64, '0'), 1000000n],
      ]);

      const delta2: PomDelta = new Map([
        ['asset1'.padEnd(64, '0'), 2000000n], // Different amount
      ]);

      const result = verifyDeltaMatch(delta1, delta2);

      expect(result.matches).toBe(false);
      expect(result.discrepancies.length).toBe(1);
      expect(result.discrepancies[0].expected).toBe(2000000n);
      expect(result.discrepancies[0].actual).toBe(1000000n);
    });

    it('should fail for missing assets', () => {
      const delta1: PomDelta = new Map([
        ['asset1'.padEnd(64, '0'), 1000000n],
      ]);

      const delta2: PomDelta = new Map([
        ['asset1'.padEnd(64, '0'), 1000000n],
        ['asset2'.padEnd(64, '0'), 2000000n], // Extra asset
      ]);

      const result = verifyDeltaMatch(delta1, delta2);

      expect(result.matches).toBe(false);
      expect(result.discrepancies.some((d) => d.assetId === 'asset2'.padEnd(64, '0'))).toBe(true);
    });

    it('should fail for extra assets in plan', () => {
      const planDelta: PomDelta = new Map([
        ['asset1'.padEnd(64, '0'), 1000000n],
        ['asset2'.padEnd(64, '0'), 500000n], // Not in PoM
      ]);

      const pomDelta: PomDelta = new Map([
        ['asset1'.padEnd(64, '0'), 1000000n],
      ]);

      const result = verifyDeltaMatch(planDelta, pomDelta);

      expect(result.matches).toBe(false);
      expect(result.discrepancies.some((d) => d.assetId === 'asset2'.padEnd(64, '0'))).toBe(true);
    });
  });
});

describe('Withdrawal Grouping and Sorting', () => {
  describe('groupWithdrawalsByAsset', () => {
    it('should group withdrawals by asset_id', () => {
      const issuer1 = Keypair.random().publicKey();
      const issuer2 = Keypair.random().publicKey();

      const withdrawals: WithdrawalIntent[] = [
        createWithdrawal('0x' + '01'.repeat(32), '0x' + 'a'.repeat(64), 'USDC', issuer1, '100', 'G...'),
        createWithdrawal('0x' + '02'.repeat(32), '0x' + 'b'.repeat(64), 'USDC', issuer1, '200', 'G...'),
        createWithdrawal('0x' + '03'.repeat(32), '0x' + 'c'.repeat(64), 'EUR', issuer2, '300', 'G...'),
      ];

      const groups = groupWithdrawalsByAsset(withdrawals);

      expect(groups.size).toBe(2);

      const usdcId = computeAssetId('USDC', issuer1);
      const eurId = computeAssetId('EUR', issuer2);

      expect(groups.get(usdcId)?.length).toBe(2);
      expect(groups.get(eurId)?.length).toBe(1);
    });
  });

  describe('sortWithdrawalsDeterministically', () => {
    it('should sort by withdrawal_id', () => {
      const withdrawals: WithdrawalIntent[] = [
        createWithdrawal('0x' + 'cc'.repeat(32), '0x' + 'a'.repeat(64), 'USDC', 'G...', '100', 'G...'),
        createWithdrawal('0x' + 'aa'.repeat(32), '0x' + 'b'.repeat(64), 'USDC', 'G...', '200', 'G...'),
        createWithdrawal('0x' + 'bb'.repeat(32), '0x' + 'c'.repeat(64), 'USDC', 'G...', '300', 'G...'),
      ];

      const sorted = sortWithdrawalsDeterministically(withdrawals);

      expect(sorted[0].withdrawal_id).toBe('0x' + 'aa'.repeat(32));
      expect(sorted[1].withdrawal_id).toBe('0x' + 'bb'.repeat(32));
      expect(sorted[2].withdrawal_id).toBe('0x' + 'cc'.repeat(32));
    });

    it('should not mutate original array', () => {
      const withdrawals: WithdrawalIntent[] = [
        createWithdrawal('0x' + 'bb'.repeat(32), '0x' + 'a'.repeat(64), 'USDC', 'G...', '100', 'G...'),
        createWithdrawal('0x' + 'aa'.repeat(32), '0x' + 'b'.repeat(64), 'USDC', 'G...', '200', 'G...'),
      ];

      const originalFirst = withdrawals[0].withdrawal_id;
      sortWithdrawalsDeterministically(withdrawals);

      expect(withdrawals[0].withdrawal_id).toBe(originalFirst);
    });

    it('should produce consistent ordering', () => {
      const withdrawals: WithdrawalIntent[] = [
        createWithdrawal('0x' + 'cc'.repeat(32), '0x' + 'a'.repeat(64), 'USDC', 'G...', '100', 'G...'),
        createWithdrawal('0x' + 'aa'.repeat(32), '0x' + 'b'.repeat(64), 'USDC', 'G...', '200', 'G...'),
        createWithdrawal('0x' + 'bb'.repeat(32), '0x' + 'c'.repeat(64), 'USDC', 'G...', '300', 'G...'),
      ];

      const sorted1 = sortWithdrawalsDeterministically(withdrawals);
      const sorted2 = sortWithdrawalsDeterministically([...withdrawals].reverse());

      // Same ordering regardless of input order
      expect(sorted1.map((w) => w.withdrawal_id)).toEqual(
        sorted2.map((w) => w.withdrawal_id)
      );
    });
  });
});

describe('Memo Computation', () => {
  /**
   * Per interfaces.md Section 3:
   * memo = first_28_bytes(SHA256(subnet_id || block_number))
   */
  it('should compute 28-byte memo', () => {
    const subnetId = '0x' + '0123456789abcdef'.repeat(4);
    const blockNumber = 42n;

    const memo = computeMemo(subnetId, blockNumber);

    expect(memo.length).toBe(28);
  });

  it('should be deterministic for same inputs', () => {
    const subnetId = '0x' + '0123456789abcdef'.repeat(4);
    const blockNumber = 100n;

    const memo1 = computeMemo(subnetId, blockNumber);
    const memo2 = computeMemo(subnetId, blockNumber);

    expect(memo1.toString('hex')).toBe(memo2.toString('hex'));
  });

  it('should differ for different block numbers', () => {
    const subnetId = '0x' + '0123456789abcdef'.repeat(4);

    const memo1 = computeMemo(subnetId, 1n);
    const memo2 = computeMemo(subnetId, 2n);

    expect(memo1.toString('hex')).not.toBe(memo2.toString('hex'));
  });
});

describe('Settlement Verification Integration', () => {
  /**
   * Per core-idea.md Section 5:
   * "PoM does not prove balances are correct"
   * "PoM does not prove execution was fair"
   * "PoM proves execution is payable"
   */
  it('should verify settlement matches PoM for valid plan', () => {
    const issuer = Keypair.random().publicKey();

    // Simulate withdrawal queue
    const withdrawals: WithdrawalIntent[] = [
      createWithdrawal(
        '0x' + '01'.repeat(32),
        '0x' + 'aa'.repeat(32),
        'USDC',
        issuer,
        '1000000',
        Keypair.random().publicKey()
      ),
      createWithdrawal(
        '0x' + '02'.repeat(32),
        '0x' + 'bb'.repeat(32),
        'USDC',
        issuer,
        '500000',
        Keypair.random().publicKey()
      ),
    ];

    // Compute expected PoM delta
    const expectedDelta = computeNetOutflow(withdrawals);

    // Simulate plan delta (should match)
    const planDelta = computeNetOutflow(withdrawals);

    // Verify match
    const result = verifyDeltaMatch(planDelta, expectedDelta);

    expect(result.matches).toBe(true);
  });

  it('should reject settlement that exceeds PoM delta', () => {
    const issuer = Keypair.random().publicKey();
    const assetId = computeAssetId('USDC', issuer);

    // PoM allows 1000000
    const pomDelta: PomDelta = new Map([[assetId, 1000000n]]);

    // Plan tries to send 2000000 (ATTACK!)
    const planDelta: PomDelta = new Map([[assetId, 2000000n]]);

    const result = verifyDeltaMatch(planDelta, pomDelta);

    // Per core-idea.md Section 9.2: "Fake balances → Blocked by PoM"
    expect(result.matches).toBe(false);
    expect(result.discrepancies[0].actual).toBe(2000000n);
    expect(result.discrepancies[0].expected).toBe(1000000n);
  });
});
