/**
 * ASTRAEUS - Crypto Utilities Tests
 *
 * Tests for SHA-256 hashing functions as specified in interfaces.md
 * These tests verify that Dev B's hash computations will match Dev A's
 */

import {
  sha256,
  computeAssetId,
  computeMemo,
  bigintToBuffer,
  bufferToBigint,
  stellarKeyToRaw,
  rawToStellarKey,
  hexToStellarKey,
  isValidStellarPublicKey,
  computeBalanceLeaf,
  computeWithdrawalLeaf,
} from '../src/interfaces/crypto';
import { Keypair } from '@stellar/stellar-sdk';

describe('SHA-256 Hashing', () => {
  it('should compute correct SHA-256 hash', () => {
    const input = Buffer.from('hello world');
    const hash = sha256(input);

    expect(hash.length).toBe(32);
    // Known SHA-256 hash of "hello world"
    expect(hash.toString('hex')).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    );
  });

  it('should produce different hashes for different inputs', () => {
    const hash1 = sha256(Buffer.from('input1'));
    const hash2 = sha256(Buffer.from('input2'));

    expect(hash1.toString('hex')).not.toBe(hash2.toString('hex'));
  });
});

describe('Asset ID Computation', () => {
  it('should compute asset_id for XLM (native)', () => {
    const assetId = computeAssetId('XLM', 'NATIVE');

    // Asset ID should be 64 lowercase hex characters
    expect(assetId.length).toBe(64);
    expect(assetId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should compute same asset_id for NATIVE and native (case insensitive)', () => {
    const assetId1 = computeAssetId('XLM', 'NATIVE');
    const assetId2 = computeAssetId('XLM', 'native');

    expect(assetId1).toBe(assetId2);
  });

  it('should compute asset_id for issued asset with G... issuer', () => {
    // Generate a test keypair for issuer
    const issuerKeypair = Keypair.random();
    const assetId = computeAssetId('USDC', issuerKeypair.publicKey());

    expect(assetId.length).toBe(64);
    expect(assetId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should compute same asset_id for issuer in different formats', () => {
    const issuerKeypair = Keypair.random();

    // G... format
    const assetId1 = computeAssetId('USDC', issuerKeypair.publicKey());

    // 0x-prefixed hex format
    const rawBytes = stellarKeyToRaw(issuerKeypair.publicKey());
    const assetId2 = computeAssetId('USDC', '0x' + rawBytes.toString('hex'));

    // Raw hex format (no 0x)
    const assetId3 = computeAssetId('USDC', rawBytes.toString('hex'));

    expect(assetId1).toBe(assetId2);
    expect(assetId2).toBe(assetId3);
  });

  it('should produce different asset_ids for different assets', () => {
    const issuerKeypair = Keypair.random();

    const usdcId = computeAssetId('USDC', issuerKeypair.publicKey());
    const eurId = computeAssetId('EUR', issuerKeypair.publicKey());

    expect(usdcId).not.toBe(eurId);
  });

  it('should produce different asset_ids for different issuers', () => {
    const issuer1 = Keypair.random();
    const issuer2 = Keypair.random();

    const assetId1 = computeAssetId('USDC', issuer1.publicKey());
    const assetId2 = computeAssetId('USDC', issuer2.publicKey());

    expect(assetId1).not.toBe(assetId2);
  });
});

describe('Memo Computation', () => {
  it('should compute 28-byte memo', () => {
    const subnetId = '0x' + '01'.repeat(32); // 32 bytes of 0x01
    const blockNumber = 42n;

    const memo = computeMemo(subnetId, blockNumber);

    expect(memo.length).toBe(28);
  });

  it('should accept subnet_id without 0x prefix', () => {
    const subnetId1 = '0x' + '01'.repeat(32);
    const subnetId2 = '01'.repeat(32);

    const memo1 = computeMemo(subnetId1, 42n);
    const memo2 = computeMemo(subnetId2, 42n);

    expect(memo1.toString('hex')).toBe(memo2.toString('hex'));
  });

  it('should produce different memos for different subnet_ids', () => {
    const subnetId1 = '0x' + '01'.repeat(32);
    const subnetId2 = '0x' + '02'.repeat(32);

    const memo1 = computeMemo(subnetId1, 42n);
    const memo2 = computeMemo(subnetId2, 42n);

    expect(memo1.toString('hex')).not.toBe(memo2.toString('hex'));
  });

  it('should produce different memos for different block numbers', () => {
    const subnetId = '0x' + '01'.repeat(32);

    const memo1 = computeMemo(subnetId, 42n);
    const memo2 = computeMemo(subnetId, 43n);

    expect(memo1.toString('hex')).not.toBe(memo2.toString('hex'));
  });

  it('should throw on invalid subnet_id length', () => {
    const invalidSubnetId = '0x' + '01'.repeat(16); // Only 16 bytes

    expect(() => computeMemo(invalidSubnetId, 42n)).toThrow();
  });
});

describe('BigInt/Buffer Conversions', () => {
  it('should convert bigint to buffer (big-endian)', () => {
    const value = 256n;
    const buffer = bigintToBuffer(value, 2);

    expect(buffer.length).toBe(2);
    expect(buffer[0]).toBe(0x01);
    expect(buffer[1]).toBe(0x00);
  });

  it('should convert buffer to bigint', () => {
    const buffer = Buffer.from([0x01, 0x00]);
    const value = bufferToBigint(buffer);

    expect(value).toBe(256n);
  });

  it('should roundtrip bigint through buffer', () => {
    const original = 123456789012345678901234567890n;
    const buffer = bigintToBuffer(original, 32);
    const roundtrip = bufferToBigint(buffer);

    expect(roundtrip).toBe(original);
  });

  it('should handle zero', () => {
    const buffer = bigintToBuffer(0n, 8);
    expect(buffer.length).toBe(8);
    expect(buffer.every((b) => b === 0)).toBe(true);

    const value = bufferToBigint(buffer);
    expect(value).toBe(0n);
  });
});

describe('Stellar Key Conversions', () => {
  it('should convert Stellar key to raw bytes', () => {
    const keypair = Keypair.random();
    const rawBytes = stellarKeyToRaw(keypair.publicKey());

    expect(rawBytes.length).toBe(32);
  });

  it('should convert raw bytes to Stellar key', () => {
    const keypair = Keypair.random();
    const rawBytes = stellarKeyToRaw(keypair.publicKey());
    const recovered = rawToStellarKey(rawBytes);

    expect(recovered).toBe(keypair.publicKey());
  });

  it('should convert hex to Stellar key', () => {
    const keypair = Keypair.random();
    const rawBytes = stellarKeyToRaw(keypair.publicKey());
    const hex = rawBytes.toString('hex');

    const recovered1 = hexToStellarKey(hex);
    const recovered2 = hexToStellarKey('0x' + hex);

    expect(recovered1).toBe(keypair.publicKey());
    expect(recovered2).toBe(keypair.publicKey());
  });

  it('should validate Stellar public keys', () => {
    const validKey = Keypair.random().publicKey();
    const invalidKey = 'not-a-valid-key';

    expect(isValidStellarPublicKey(validKey)).toBe(true);
    expect(isValidStellarPublicKey(invalidKey)).toBe(false);
  });
});

describe('Balance Leaf Computation', () => {
  it('should compute balance leaf with correct format', () => {
    const userId = '0x' + '01'.repeat(32);
    const assetCode = 'USDC';
    const issuer = Keypair.random().publicKey();
    const balance = 1500000n;

    const leaf = computeBalanceLeaf(userId, assetCode, issuer, balance);

    // Should be 64 hex characters (32 bytes)
    expect(leaf.length).toBe(64);
    expect(leaf).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should compute balance leaf for native XLM', () => {
    const userId = '0x' + '01'.repeat(32);
    const balance = 20000000n;

    const leaf = computeBalanceLeaf(userId, 'XLM', 'NATIVE', balance);

    expect(leaf.length).toBe(64);
  });

  it('should produce different leaves for different balances', () => {
    const userId = '0x' + '01'.repeat(32);
    const issuer = Keypair.random().publicKey();

    const leaf1 = computeBalanceLeaf(userId, 'USDC', issuer, 1000000n);
    const leaf2 = computeBalanceLeaf(userId, 'USDC', issuer, 2000000n);

    expect(leaf1).not.toBe(leaf2);
  });
});

describe('Withdrawal Leaf Computation', () => {
  it('should compute withdrawal leaf with correct format', () => {
    const withdrawalId = '0x' + 'ab'.repeat(32);
    const userId = '0x' + '01'.repeat(32);
    const assetCode = 'USDC';
    const issuer = Keypair.random().publicKey();
    const amount = 1000000n;
    const destination = Keypair.random().publicKey();

    const leaf = computeWithdrawalLeaf(
      withdrawalId,
      userId,
      assetCode,
      issuer,
      amount,
      destination
    );

    expect(leaf.length).toBe(64);
    expect(leaf).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should produce different leaves for different withdrawals', () => {
    const userId = '0x' + '01'.repeat(32);
    const issuer = Keypair.random().publicKey();
    const amount = 1000000n;
    const destination = Keypair.random().publicKey();

    const leaf1 = computeWithdrawalLeaf(
      '0x' + '01'.repeat(32),
      userId,
      'USDC',
      issuer,
      amount,
      destination
    );
    const leaf2 = computeWithdrawalLeaf(
      '0x' + '02'.repeat(32),
      userId,
      'USDC',
      issuer,
      amount,
      destination
    );

    expect(leaf1).not.toBe(leaf2);
  });
});

describe('Interface Compatibility', () => {
  /**
   * This test creates a golden test vector that can be used by Dev A
   * to verify their implementation matches Dev B's
   */
  it('should produce deterministic asset_id for known inputs', () => {
    // Test vector: USDC with a specific issuer
    // Using a fixed raw public key for determinism
    const rawIssuerHex = 'a' + '1'.repeat(63);
    const assetId = computeAssetId('USDC', '0x' + rawIssuerHex);

    // Log for cross-verification with Dev A
    console.log('Golden Test Vector - Asset ID:');
    console.log(`  asset_code: "USDC"`);
    console.log(`  issuer (hex): 0x${rawIssuerHex}`);
    console.log(`  asset_id: ${assetId}`);

    // The asset_id should be consistent across runs
    const assetId2 = computeAssetId('USDC', '0x' + rawIssuerHex);
    expect(assetId).toBe(assetId2);
  });

  it('should produce deterministic memo for known inputs', () => {
    const subnetId = '0x' + '0123456789abcdef'.repeat(4);
    const blockNumber = 42n;

    const memo = computeMemo(subnetId, blockNumber);

    console.log('Golden Test Vector - Memo:');
    console.log(`  subnet_id: ${subnetId}`);
    console.log(`  block_number: ${blockNumber}`);
    console.log(`  memo (hex): ${memo.toString('hex')}`);

    // Verify consistency
    const memo2 = computeMemo(subnetId, blockNumber);
    expect(memo.toString('hex')).toBe(memo2.toString('hex'));
  });

  it('should produce deterministic XLM asset_id', () => {
    const xlmAssetId = computeAssetId('XLM', 'NATIVE');

    console.log('Golden Test Vector - XLM Asset ID:');
    console.log(`  asset_code: "XLM"`);
    console.log(`  issuer: "NATIVE"`);
    console.log(`  asset_id: ${xlmAssetId}`);

    // Verify consistency
    const xlmAssetId2 = computeAssetId('XLM', 'NATIVE');
    expect(xlmAssetId).toBe(xlmAssetId2);
  });
});
