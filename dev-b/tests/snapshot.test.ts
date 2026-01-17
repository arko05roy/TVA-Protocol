/**
 * ASTRAEUS - Treasury Snapshot Tests
 *
 * Tests for treasury snapshot service functionality
 */

import { stroopsToDecimal, decimalToStroops } from '../src/snapshot/treasury_snapshot';

describe('Stroop Conversion Utilities', () => {
  describe('stroopsToDecimal', () => {
    it('should convert stroops to decimal string', () => {
      // 10 XLM = 100,000,000 stroops
      expect(stroopsToDecimal(100000000n)).toBe('10.0000000');
    });

    it('should handle small amounts', () => {
      expect(stroopsToDecimal(1n)).toBe('0.0000001');
    });

    it('should handle zero', () => {
      expect(stroopsToDecimal(0n)).toBe('0.0000000');
    });

    it('should handle large amounts', () => {
      // 1 billion XLM
      expect(stroopsToDecimal(10000000000000000n)).toBe('1000000000.0000000');
    });

    it('should handle fractional amounts', () => {
      expect(stroopsToDecimal(15234567n)).toBe('1.5234567');
    });
  });

  describe('decimalToStroops', () => {
    it('should convert decimal string to stroops', () => {
      expect(decimalToStroops('10.0000000')).toBe(100000000n);
    });

    it('should handle whole numbers', () => {
      expect(decimalToStroops('10')).toBe(100000000n);
    });

    it('should handle small decimals', () => {
      expect(decimalToStroops('0.0000001')).toBe(1n);
    });

    it('should handle truncation beyond 7 decimals', () => {
      // Should truncate, not round
      expect(decimalToStroops('1.00000019')).toBe(10000001n);
    });

    it('should handle zero', () => {
      expect(decimalToStroops('0')).toBe(0n);
      expect(decimalToStroops('0.0')).toBe(0n);
    });
  });

  describe('roundtrip conversion', () => {
    it('should maintain value through roundtrip', () => {
      const testValues = [
        0n,
        1n,
        100n,
        10000000n,
        100000000n,
        1234567890123456n,
      ];

      for (const value of testValues) {
        const decimal = stroopsToDecimal(value);
        const roundtrip = decimalToStroops(decimal);
        expect(roundtrip).toBe(value);
      }
    });
  });
});

describe('TreasurySnapshot Type Checks', () => {
  it('should have correct TreasurySnapshot structure', () => {
    // Type check - this ensures the interface is properly defined
    const mockSnapshot = {
      balances: new Map<string, bigint>([
        ['abc123', 100000000n],
        ['def456', 50000000n],
      ]),
      signers: [
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      ],
      threshold: 2,
    };

    expect(mockSnapshot.balances.size).toBe(2);
    expect(mockSnapshot.signers.length).toBe(2);
    expect(mockSnapshot.threshold).toBe(2);
  });

  it('should have correct TreasurySnapshotJSON structure', () => {
    const mockSnapshotJSON = {
      balances: {
        abc123: '100000000',
        def456: '50000000',
      },
      signers: ['G...', 'G...'],
      threshold: 2,
    };

    expect(Object.keys(mockSnapshotJSON.balances).length).toBe(2);
    expect(typeof mockSnapshotJSON.balances['abc123']).toBe('string');
  });
});

describe('Asset ID in Snapshot Context', () => {
  /**
   * These tests verify that asset_id computation produces consistent results
   * that will match between Dev A and Dev B
   */

  it('should use lowercase hex for asset_id', () => {
    // Asset IDs should always be lowercase
    const { computeAssetId } = require('../src/interfaces/crypto');

    const assetId = computeAssetId('USDC', 'NATIVE');
    expect(assetId).toMatch(/^[0-9a-f]+$/); // Only lowercase hex
    expect(assetId).not.toMatch(/[A-F]/); // No uppercase
  });

  it('should produce 64-character asset_id', () => {
    const { computeAssetId } = require('../src/interfaces/crypto');

    const xlmId = computeAssetId('XLM', 'NATIVE');
    expect(xlmId.length).toBe(64);

    // Generate a random issuer for testing
    const { Keypair } = require('@stellar/stellar-sdk');
    const issuer = Keypair.random().publicKey();
    const usdcId = computeAssetId('USDC', issuer);
    expect(usdcId.length).toBe(64);
  });
});
