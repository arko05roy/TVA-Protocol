/**
 * ASTRAEUS - Treasury Snapshot Service
 *
 * Provides treasury snapshots for Proof of Money (PoM) validation.
 * This service queries Stellar Horizon to get the current state of a vault:
 * - Asset balances (indexed by asset_id hash)
 * - Signer set
 * - Signature threshold
 *
 * Dev A uses this snapshot to verify PoM constraints before committing state.
 */

import { Horizon } from '@stellar/stellar-sdk';
import {
  TreasurySnapshot,
  TreasurySnapshotJSON,
  NetworkConfig,
  TESTNET_CONFIG,
} from '../interfaces/types';
import { computeAssetId } from '../interfaces/crypto';

/**
 * Balance information from Horizon
 */
interface HorizonBalance {
  asset_type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  liquidity_pool_id?: string;
}

/**
 * Signer information from Horizon
 */
interface HorizonSigner {
  key: string;
  weight: number;
  type: 'ed25519_public_key' | 'sha256_hash' | 'preauth_tx';
}

/**
 * Treasury Snapshot Service
 */
export class TreasurySnapshotService {
  private server: Horizon.Server;
  private config: NetworkConfig;

  constructor(config: NetworkConfig = TESTNET_CONFIG) {
    this.config = config;
    this.server = new Horizon.Server(config.horizonUrl);
  }

  /**
   * Get a complete treasury snapshot for PoM validation
   *
   * @param vaultAddress - Stellar address of the vault (G... format)
   * @returns TreasurySnapshot with balances, signers, and threshold
   */
  async getTreasurySnapshot(vaultAddress: string): Promise<TreasurySnapshot> {
    // Fetch account from Horizon
    const account = await this.fetchAccountWithRetry(vaultAddress);

    // Parse balances
    const balances = this.parseBalances(account.balances as HorizonBalance[]);

    // Extract signers (only those with weight > 0)
    const signers = this.parseSigners(account.signers as HorizonSigner[]);

    // Get threshold (use med_threshold for standard operations)
    const threshold = account.thresholds.med_threshold;

    return {
      balances,
      signers,
      threshold,
    };
  }

  /**
   * Get treasury snapshot as JSON-serializable object
   * (For API responses)
   */
  async getTreasurySnapshotJSON(vaultAddress: string): Promise<TreasurySnapshotJSON> {
    const snapshot = await this.getTreasurySnapshot(vaultAddress);

    // Convert Map to plain object
    const balancesObj: { [key: string]: string } = {};
    for (const [assetId, balance] of snapshot.balances) {
      balancesObj[assetId] = balance.toString();
    }

    return {
      balances: balancesObj,
      signers: snapshot.signers,
      threshold: snapshot.threshold,
    };
  }

  /**
   * Fetch account from Horizon with retry logic
   */
  private async fetchAccountWithRetry(
    address: string,
    maxRetries = 3,
    delayMs = 1000
  ): Promise<any> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.server.loadAccount(address);
      } catch (error: any) {
        lastError = error;

        // Don't retry on 404 (account not found)
        if (error.response && error.response.status === 404) {
          throw new Error(`Vault account not found: ${address}`);
        }

        // Retry on timeout or network errors
        console.warn(
          `[TreasurySnapshot] Attempt ${attempt + 1}/${maxRetries} failed: ${error.message}`
        );

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
        }
      }
    }

    throw new Error(`Failed to fetch account after ${maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Parse Horizon balances to asset_id -> balance map
   *
   * Implements the asset_id computation from interfaces.md Section 2.2:
   * asset_id = SHA256(asset_code || issuer)
   */
  private parseBalances(horizonBalances: HorizonBalance[]): Map<string, bigint> {
    const balances = new Map<string, bigint>();

    for (const bal of horizonBalances) {
      // Skip liquidity pool shares
      if (bal.liquidity_pool_id) {
        continue;
      }

      let assetCode: string;
      let issuer: string;

      if (bal.asset_type === 'native') {
        assetCode = 'XLM';
        issuer = 'NATIVE';
      } else {
        assetCode = bal.asset_code!;
        issuer = bal.asset_issuer!;
      }

      // Compute asset_id using SHA-256 as specified in interfaces.md
      const assetId = computeAssetId(assetCode, issuer);

      // Convert balance to stroops (bigint)
      // Horizon returns balance as string with 7 decimal places
      const stroops = this.balanceToStroops(bal.balance);

      balances.set(assetId, stroops);
    }

    return balances;
  }

  /**
   * Convert Horizon balance string to stroops (bigint)
   * Horizon format: "100.0000000" (7 decimal places)
   */
  private balanceToStroops(balance: string): bigint {
    const [whole, decimal = ''] = balance.split('.');
    const paddedDecimal = decimal.padEnd(7, '0').slice(0, 7);
    return BigInt(whole + paddedDecimal);
  }

  /**
   * Parse Horizon signers to list of public keys
   */
  private parseSigners(horizonSigners: HorizonSigner[]): string[] {
    return horizonSigners
      .filter((s) => s.weight > 0 && s.type === 'ed25519_public_key')
      .map((s) => s.key);
  }

  /**
   * Get balance for a specific asset
   */
  async getAssetBalance(vaultAddress: string, assetCode: string, issuer: string): Promise<bigint> {
    const snapshot = await this.getTreasurySnapshot(vaultAddress);
    const assetId = computeAssetId(assetCode, issuer);
    return snapshot.balances.get(assetId) || 0n;
  }

  /**
   * Check if treasury has sufficient balance for a given PoM delta
   *
   * @param vaultAddress - Vault address
   * @param pomDelta - Map of asset_id -> required outflow
   * @returns Object with solvency status and any shortfalls
   */
  async checkSolvency(
    vaultAddress: string,
    pomDelta: Map<string, bigint>
  ): Promise<{
    solvent: boolean;
    shortfalls: Map<string, { required: bigint; available: bigint }>;
  }> {
    const snapshot = await this.getTreasurySnapshot(vaultAddress);
    const shortfalls = new Map<string, { required: bigint; available: bigint }>();

    for (const [assetId, requiredAmount] of pomDelta) {
      const availableBalance = snapshot.balances.get(assetId) || 0n;

      if (availableBalance < requiredAmount) {
        shortfalls.set(assetId, {
          required: requiredAmount,
          available: availableBalance,
        });
      }
    }

    return {
      solvent: shortfalls.size === 0,
      shortfalls,
    };
  }

  /**
   * Verify that a set of signers can meet the threshold
   */
  async canMeetThreshold(
    vaultAddress: string,
    availableSigners: string[]
  ): Promise<{ canMeet: boolean; required: number; available: number }> {
    const snapshot = await this.getTreasurySnapshot(vaultAddress);

    // Count how many of the available signers are actually vault signers
    const validSigners = availableSigners.filter((s) =>
      snapshot.signers.includes(s)
    );

    return {
      canMeet: validSigners.length >= snapshot.threshold,
      required: snapshot.threshold,
      available: validSigners.length,
    };
  }
}

/**
 * Create a new TreasurySnapshotService for testnet
 */
export function createTestnetSnapshotService(): TreasurySnapshotService {
  return new TreasurySnapshotService(TESTNET_CONFIG);
}

/**
 * Utility function: Convert stroops to human-readable amount
 */
export function stroopsToDecimal(stroops: bigint, decimals = 7): string {
  const str = stroops.toString().padStart(decimals + 1, '0');
  const whole = str.slice(0, -decimals) || '0';
  const decimal = str.slice(-decimals);
  return `${whole}.${decimal}`;
}

/**
 * Utility function: Convert decimal amount to stroops
 */
export function decimalToStroops(decimal: string): bigint {
  const [whole, frac = ''] = decimal.split('.');
  const paddedFrac = frac.padEnd(7, '0').slice(0, 7);
  return BigInt(whole + paddedFrac);
}
