/**
 * ASTRAEUS - FX Engine
 *
 * Handles foreign exchange operations using Stellar DEX.
 *
 * Per agent/plan.md Section B5 (FX Handling):
 * - Uses PathPaymentStrictReceive
 * - Never sets internal prices
 * - Never uses oracles
 * - FX happens after execution, never inside PoM
 *
 * Per agent/core-idea.md Section 6.3:
 * - "No internal price. No oracle. Just: Stellar DEX at settlement time."
 *
 * CRITICAL REMINDERS:
 * - NEVER set internal FX prices - Use Stellar DEX only
 * - Slippage is bounded to protect treasury
 * - Path discovery uses Horizon API
 */

import {
  Horizon,
  Asset,
  Keypair,
  Transaction,
} from '@stellar/stellar-sdk';
import {
  WithdrawalIntent,
  NetworkConfig,
  TESTNET_CONFIG,
  SettlementError,
  SettlementFailure,
  Asset as AstraeusAsset,
} from '../interfaces/types';
import { SettlementPlanner } from '../settlement/settlement_planner';
import { MultisigOrchestrator } from '../settlement/multisig_orchestrator';

/**
 * Path discovery result from Stellar Horizon
 */
export interface PathResult {
  /** Source asset to send */
  sourceAsset: Asset;
  /** Amount of source asset required (in stroops) */
  sourceAmount: bigint;
  /** Destination asset to receive */
  destinationAsset: Asset;
  /** Amount of destination asset (in stroops) */
  destinationAmount: bigint;
  /** Intermediate path assets */
  path: Asset[];
}

/**
 * FX settlement result
 */
export interface FxSettlementResult {
  success: boolean;
  txHash?: string;
  ledger?: number;
  sourceAmount?: bigint;
  destinationAmount?: bigint;
  effectiveRate?: string;
  error?: string;
}

/**
 * Slippage configuration
 */
export interface SlippageConfig {
  /** Maximum slippage percentage (e.g., 1 = 1%) */
  maxSlippagePercent: number;
  /** Minimum acceptable rate (optional, computed from maxSlippage if not set) */
  minRate?: number;
}

/**
 * Default slippage configuration
 * 1% max slippage is conservative for most stablecoin pairs
 */
export const DEFAULT_SLIPPAGE_CONFIG: SlippageConfig = {
  maxSlippagePercent: 1,
};

/**
 * FX Engine class
 *
 * Handles path discovery and FX settlement using Stellar DEX.
 * Never sets internal prices - relies entirely on DEX liquidity.
 */
export class FxEngine {
  private server: Horizon.Server;
  private config: NetworkConfig;
  private slippageConfig: SlippageConfig;
  private planner: SettlementPlanner;
  private orchestrator: MultisigOrchestrator;

  constructor(
    config: NetworkConfig = TESTNET_CONFIG,
    slippageConfig: SlippageConfig = DEFAULT_SLIPPAGE_CONFIG
  ) {
    this.config = config;
    this.slippageConfig = slippageConfig;
    this.server = new Horizon.Server(config.horizonUrl);
    this.planner = new SettlementPlanner(config);
    this.orchestrator = new MultisigOrchestrator(config);
  }

  /**
   * Discover the best path for an FX trade using Stellar's pathfinding.
   *
   * Per plan.md B5: Uses Horizon's strict_receive_paths endpoint.
   * This finds the best path to receive exactly destAmount of destAsset.
   *
   * @param sourceAsset - Asset the vault holds and will send
   * @param destinationAsset - Asset the user wants to receive
   * @param destinationAmount - Exact amount user should receive (in stroops)
   * @returns Best path result with source amount and path
   * @throws SettlementError with PATH_NOT_FOUND if no path exists
   */
  async discoverPath(
    sourceAsset: AstraeusAsset,
    destinationAsset: AstraeusAsset,
    destinationAmount: bigint
  ): Promise<PathResult> {
    const stellarSourceAsset = this.toStellarAsset(sourceAsset);
    const stellarDestAsset = this.toStellarAsset(destinationAsset);

    try {
      // Use Horizon's strict receive paths endpoint
      // This finds paths where destination receives exact amount
      const paths = await this.server
        .strictReceivePaths(
          [stellarSourceAsset],
          stellarDestAsset,
          this.stroopsToDecimal(destinationAmount)
        )
        .call();

      if (paths.records.length === 0) {
        throw new SettlementError(
          SettlementFailure.PATH_NOT_FOUND,
          `No path found from ${sourceAsset.code} to ${destinationAsset.code}`,
          { sourceAsset, destinationAsset, destinationAmount: destinationAmount.toString() }
        );
      }

      // Sort by lowest source amount (best rate)
      const sortedPaths = paths.records.sort((a, b) =>
        parseFloat(a.source_amount) - parseFloat(b.source_amount)
      );

      const bestPath = sortedPaths[0];

      // Convert path assets to Stellar SDK Asset objects
      const pathAssets = bestPath.path.map((p: any) => {
        if (p.asset_type === 'native') {
          return Asset.native();
        }
        return new Asset(p.asset_code, p.asset_issuer);
      });

      return {
        sourceAsset: stellarSourceAsset,
        sourceAmount: this.decimalToStroops(bestPath.source_amount),
        destinationAsset: stellarDestAsset,
        destinationAmount: destinationAmount,
        path: pathAssets,
      };
    } catch (error: any) {
      if (error instanceof SettlementError) {
        throw error;
      }

      throw new SettlementError(
        SettlementFailure.PATH_NOT_FOUND,
        `Path discovery failed: ${error.message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Validate that slippage is within acceptable bounds.
   *
   * Per duo.md Phase 5.1: MAX_SLIPPAGE_PERCENT = 1 (1% max slippage)
   *
   * @param expectedAmount - Expected source amount from initial quote
   * @param actualAmount - Actual source amount at execution time
   * @returns True if slippage is acceptable
   */
  validateSlippage(expectedAmount: bigint, actualAmount: bigint): boolean {
    if (actualAmount <= expectedAmount) {
      // Better rate than expected, always acceptable
      return true;
    }

    // Calculate slippage percentage
    // slippage = (actual - expected) / expected * 100
    const difference = actualAmount - expectedAmount;
    const slippagePercent = Number((difference * 100n) / expectedAmount);

    return slippagePercent <= this.slippageConfig.maxSlippagePercent;
  }

  /**
   * Calculate the maximum amount to send with slippage buffer.
   *
   * @param sourceAmount - Expected source amount from path discovery
   * @returns Maximum amount to send (sourceAmount + slippage buffer)
   */
  calculateSendMax(sourceAmount: bigint): bigint {
    // Add slippage buffer: sendMax = sourceAmount * (1 + slippagePercent/100)
    const slippageMultiplier = 100n + BigInt(this.slippageConfig.maxSlippagePercent);
    return (sourceAmount * slippageMultiplier) / 100n;
  }

  /**
   * Execute an FX settlement for a withdrawal.
   *
   * Full flow:
   * 1. Discover best path
   * 2. Validate slippage
   * 3. Build PathPaymentStrictReceive transaction
   * 4. Sign and submit
   *
   * Per plan.md B5 and core-idea.md Section 6.3:
   * - Uses Stellar DEX, no internal prices
   * - Slippage bounded to protect treasury
   *
   * @param vaultAddress - Treasury vault address
   * @param withdrawal - Withdrawal requiring FX
   * @param vaultAsset - Asset the vault holds
   * @param memo - 28-byte memo buffer
   * @param signerKeypairs - Keypairs for signing
   * @param threshold - Required signature threshold
   * @returns FX settlement result
   */
  async settleWithFx(
    vaultAddress: string,
    withdrawal: WithdrawalIntent,
    vaultAsset: AstraeusAsset,
    memo: Buffer,
    signerKeypairs: Keypair[],
    threshold: number
  ): Promise<FxSettlementResult> {
    const destAsset: AstraeusAsset = {
      code: withdrawal.asset_code,
      issuer: withdrawal.issuer,
    };

    try {
      // Step 1: Discover best path
      const path = await this.discoverPath(
        vaultAsset,
        destAsset,
        BigInt(withdrawal.amount)
      );

      // Step 2: Calculate sendMax with slippage buffer
      const sendMax = this.calculateSendMax(path.sourceAmount);

      // Step 3: Get vault account for sequence number
      const vaultAccount = await this.server.loadAccount(vaultAddress);
      const sequenceNumber = (BigInt(vaultAccount.sequenceNumber()) + 1n).toString();

      // Step 4: Build PathPaymentStrictReceive transaction
      const tx = await this.planner.buildPathPaymentTransaction(
        vaultAddress,
        sequenceNumber,
        withdrawal,
        vaultAsset,
        sendMax,
        path.path,
        memo
      );

      // Step 5: Sign transaction
      const signedTx = this.orchestrator.signTransaction(
        tx,
        signerKeypairs,
        threshold
      );

      // Step 6: Submit with retry
      const result = await this.orchestrator.submitWithRetry(signedTx);

      // Calculate effective rate for logging/auditing
      const effectiveRate = this.calculateEffectiveRate(
        path.sourceAmount,
        BigInt(withdrawal.amount)
      );

      return {
        success: true,
        txHash: result.hash,
        ledger: result.ledger,
        sourceAmount: path.sourceAmount,
        destinationAmount: BigInt(withdrawal.amount),
        effectiveRate,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Batch FX settlements for multiple withdrawals requiring currency conversion.
   *
   * Groups withdrawals by destination asset and processes each group.
   *
   * @param vaultAddress - Treasury vault address
   * @param withdrawals - Withdrawals requiring FX
   * @param vaultAsset - Asset the vault holds
   * @param memo - 28-byte memo buffer
   * @param signerKeypairs - Keypairs for signing
   * @param threshold - Required signature threshold
   * @returns Array of FX settlement results
   */
  async batchSettleWithFx(
    vaultAddress: string,
    withdrawals: WithdrawalIntent[],
    vaultAsset: AstraeusAsset,
    memo: Buffer,
    signerKeypairs: Keypair[],
    threshold: number
  ): Promise<FxSettlementResult[]> {
    const results: FxSettlementResult[] = [];

    // Process each withdrawal individually
    // (PathPaymentStrictReceive requires individual path discovery)
    for (const withdrawal of withdrawals) {
      const result = await this.settleWithFx(
        vaultAddress,
        withdrawal,
        vaultAsset,
        memo,
        signerKeypairs,
        threshold
      );

      results.push(result);

      // If any FX settlement fails, we continue but track the failure
      // The caller can decide whether to halt based on failure count
    }

    return results;
  }

  /**
   * Check if a withdrawal requires FX (asset mismatch with vault holdings).
   *
   * @param withdrawal - Withdrawal intent
   * @param vaultAssets - Assets the vault holds
   * @returns True if FX is required
   */
  requiresFx(withdrawal: WithdrawalIntent, vaultAssets: AstraeusAsset[]): boolean {
    return !vaultAssets.some(
      (asset) =>
        asset.code === withdrawal.asset_code &&
        asset.issuer.toUpperCase() === withdrawal.issuer.toUpperCase()
    );
  }

  /**
   * Separate withdrawals into those requiring FX and those that don't.
   *
   * @param withdrawals - All withdrawals
   * @param vaultAssets - Assets the vault holds
   * @returns Tuple of [directWithdrawals, fxWithdrawals]
   */
  separateFxWithdrawals(
    withdrawals: WithdrawalIntent[],
    vaultAssets: AstraeusAsset[]
  ): [WithdrawalIntent[], WithdrawalIntent[]] {
    const direct: WithdrawalIntent[] = [];
    const fx: WithdrawalIntent[] = [];

    for (const withdrawal of withdrawals) {
      if (this.requiresFx(withdrawal, vaultAssets)) {
        fx.push(withdrawal);
      } else {
        direct.push(withdrawal);
      }
    }

    return [direct, fx];
  }

  /**
   * Get current slippage configuration.
   */
  getSlippageConfig(): SlippageConfig {
    return { ...this.slippageConfig };
  }

  /**
   * Update slippage configuration.
   *
   * @param config - New slippage configuration
   */
  setSlippageConfig(config: SlippageConfig): void {
    if (config.maxSlippagePercent < 0 || config.maxSlippagePercent > 100) {
      throw new Error('Slippage percent must be between 0 and 100');
    }
    this.slippageConfig = { ...config };
  }

  // ============================================================
  // Private helper methods
  // ============================================================

  /**
   * Convert AstraeusAsset to Stellar SDK Asset.
   */
  private toStellarAsset(asset: AstraeusAsset): Asset {
    if (asset.issuer.toUpperCase() === 'NATIVE') {
      return Asset.native();
    }
    return new Asset(asset.code, asset.issuer);
  }

  /**
   * Convert stroops to decimal string.
   */
  private stroopsToDecimal(stroops: bigint): string {
    const str = stroops.toString().padStart(8, '0');
    const whole = str.slice(0, -7) || '0';
    const decimal = str.slice(-7);
    return `${whole}.${decimal}`;
  }

  /**
   * Convert decimal string to stroops.
   */
  private decimalToStroops(decimal: string): bigint {
    const [whole, frac = ''] = decimal.split('.');
    const fracPadded = frac.padEnd(7, '0').slice(0, 7);
    return BigInt(whole + fracPadded);
  }

  /**
   * Calculate effective exchange rate.
   */
  private calculateEffectiveRate(sourceAmount: bigint, destAmount: bigint): string {
    // Rate = destAmount / sourceAmount
    // Using fixed-point arithmetic for precision
    const rateScaled = (destAmount * 10000000n) / sourceAmount;
    const rate = Number(rateScaled) / 10000000;
    return rate.toFixed(7);
  }
}

/**
 * Create an FxEngine for testnet
 */
export function createTestnetFxEngine(
  slippageConfig: SlippageConfig = DEFAULT_SLIPPAGE_CONFIG
): FxEngine {
  return new FxEngine(TESTNET_CONFIG, slippageConfig);
}
