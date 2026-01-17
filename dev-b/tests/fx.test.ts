/**
 * ASTRAEUS - FX Engine Tests
 *
 * Tests for FX path discovery, slippage validation, and failure handling.
 */

import { Keypair, Asset } from '@stellar/stellar-sdk';
import {
  FxEngine,
  SlippageConfig,
  DEFAULT_SLIPPAGE_CONFIG,
  PathResult,
} from '../src/fx/fx_engine';
import {
  FailureHandler,
  FailureSeverity,
  RecoveryAction,
  DEFAULT_RETRY_CONFIG,
  assertOrHalt,
} from '../src/safety/failure_handler';
import {
  SettlementFailure,
  SettlementError,
  TESTNET_CONFIG,
  Asset as AstraeusAsset,
} from '../src/interfaces/types';
import { WithdrawalIntent } from '../src/interfaces/types';

/**
 * Create a test withdrawal intent
 */
function createTestWithdrawal(
  assetCode: string,
  issuer: string,
  amount: string,
  destination: string
): WithdrawalIntent {
  return {
    withdrawal_id: '0x' + '01'.repeat(32),
    user_id: '0x' + '02'.repeat(32),
    asset_code: assetCode,
    issuer: issuer,
    amount: amount,
    destination: destination,
  };
}

describe('FxEngine', () => {
  let fxEngine: FxEngine;

  beforeEach(() => {
    fxEngine = new FxEngine(TESTNET_CONFIG);
  });

  describe('Slippage Configuration', () => {
    it('should use default slippage config', () => {
      const config = fxEngine.getSlippageConfig();
      expect(config.maxSlippagePercent).toBe(1);
    });

    it('should allow updating slippage config', () => {
      fxEngine.setSlippageConfig({ maxSlippagePercent: 2 });
      const config = fxEngine.getSlippageConfig();
      expect(config.maxSlippagePercent).toBe(2);
    });

    it('should reject invalid slippage config', () => {
      expect(() => {
        fxEngine.setSlippageConfig({ maxSlippagePercent: -1 });
      }).toThrow('Slippage percent must be between 0 and 100');

      expect(() => {
        fxEngine.setSlippageConfig({ maxSlippagePercent: 101 });
      }).toThrow('Slippage percent must be between 0 and 100');
    });
  });

  describe('Slippage Validation', () => {
    it('should accept when actual equals expected', () => {
      const result = fxEngine.validateSlippage(1000000n, 1000000n);
      expect(result).toBe(true);
    });

    it('should accept when actual is less than expected (better rate)', () => {
      const result = fxEngine.validateSlippage(1000000n, 900000n);
      expect(result).toBe(true);
    });

    it('should accept slippage within bounds', () => {
      // 1% slippage on 1000000 = 1010000
      const result = fxEngine.validateSlippage(1000000n, 1010000n);
      expect(result).toBe(true);
    });

    it('should reject slippage exceeding bounds', () => {
      // 2% slippage on 1000000 = 1020000 (exceeds 1% limit)
      const result = fxEngine.validateSlippage(1000000n, 1020000n);
      expect(result).toBe(false);
    });

    it('should handle edge case at exactly max slippage', () => {
      // Exactly 1% slippage
      const result = fxEngine.validateSlippage(1000000n, 1010000n);
      expect(result).toBe(true);
    });
  });

  describe('SendMax Calculation', () => {
    it('should add 1% buffer to source amount', () => {
      const sourceAmount = 1000000n;
      const sendMax = fxEngine.calculateSendMax(sourceAmount);
      // 1% buffer = 1010000
      expect(sendMax).toBe(1010000n);
    });

    it('should handle large amounts', () => {
      const sourceAmount = 100000000000n; // 10,000 units
      const sendMax = fxEngine.calculateSendMax(sourceAmount);
      expect(sendMax).toBe(101000000000n);
    });

    it('should handle small amounts', () => {
      const sourceAmount = 100n;
      const sendMax = fxEngine.calculateSendMax(sourceAmount);
      expect(sendMax).toBe(101n);
    });
  });

  describe('FX Requirement Detection', () => {
    const vaultAssets: AstraeusAsset[] = [
      { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
      { code: 'XLM', issuer: 'NATIVE' },
    ];

    it('should detect when FX is NOT required (direct asset match)', () => {
      const withdrawal = createTestWithdrawal(
        'USDC',
        'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        '1000000',
        Keypair.random().publicKey()
      );

      const requiresFx = fxEngine.requiresFx(withdrawal, vaultAssets);
      expect(requiresFx).toBe(false);
    });

    it('should detect when FX is required (asset not in vault)', () => {
      const withdrawal = createTestWithdrawal(
        'EUR',
        'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ',
        '1000000',
        Keypair.random().publicKey()
      );

      const requiresFx = fxEngine.requiresFx(withdrawal, vaultAssets);
      expect(requiresFx).toBe(true);
    });

    it('should be case-insensitive for issuer comparison', () => {
      const withdrawal = createTestWithdrawal(
        'XLM',
        'native', // lowercase
        '10000000',
        Keypair.random().publicKey()
      );

      const requiresFx = fxEngine.requiresFx(withdrawal, vaultAssets);
      expect(requiresFx).toBe(false);
    });
  });

  describe('Withdrawal Separation', () => {
    const vaultAssets: AstraeusAsset[] = [
      { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
      { code: 'XLM', issuer: 'NATIVE' },
    ];

    it('should separate direct and FX withdrawals', () => {
      const withdrawals: WithdrawalIntent[] = [
        createTestWithdrawal('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', '100', 'G...'),
        createTestWithdrawal('EUR', 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ', '200', 'G...'),
        createTestWithdrawal('XLM', 'NATIVE', '300', 'G...'),
      ];

      const [direct, fx] = fxEngine.separateFxWithdrawals(withdrawals, vaultAssets);

      expect(direct.length).toBe(2); // USDC and XLM
      expect(fx.length).toBe(1); // EUR requires FX
      expect(fx[0].asset_code).toBe('EUR');
    });

    it('should handle all direct withdrawals', () => {
      const withdrawals: WithdrawalIntent[] = [
        createTestWithdrawal('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', '100', 'G...'),
        createTestWithdrawal('XLM', 'NATIVE', '300', 'G...'),
      ];

      const [direct, fx] = fxEngine.separateFxWithdrawals(withdrawals, vaultAssets);

      expect(direct.length).toBe(2);
      expect(fx.length).toBe(0);
    });

    it('should handle all FX withdrawals', () => {
      const withdrawals: WithdrawalIntent[] = [
        createTestWithdrawal('EUR', 'G...issuer1', '100', 'G...'),
        createTestWithdrawal('GBP', 'G...issuer2', '200', 'G...'),
      ];

      const [direct, fx] = fxEngine.separateFxWithdrawals(withdrawals, vaultAssets);

      expect(direct.length).toBe(0);
      expect(fx.length).toBe(2);
    });
  });
});

describe('FailureHandler', () => {
  let failureHandler: FailureHandler;

  beforeEach(() => {
    failureHandler = new FailureHandler();
    failureHandler.clearFailureLog();
  });

  describe('Halt Conditions', () => {
    it('should halt on POM_MISMATCH', () => {
      expect(failureHandler.shouldHalt(SettlementFailure.POM_MISMATCH)).toBe(true);
    });

    it('should halt on PARTIAL_SUBMISSION', () => {
      expect(failureHandler.shouldHalt(SettlementFailure.PARTIAL_SUBMISSION)).toBe(true);
    });

    it('should halt on THRESHOLD_NOT_MET', () => {
      expect(failureHandler.shouldHalt(SettlementFailure.THRESHOLD_NOT_MET)).toBe(true);
    });

    it('should halt on INSUFFICIENT_BALANCE', () => {
      expect(failureHandler.shouldHalt(SettlementFailure.INSUFFICIENT_BALANCE)).toBe(true);
    });

    it('should NOT halt on HORIZON_TIMEOUT', () => {
      expect(failureHandler.shouldHalt(SettlementFailure.HORIZON_TIMEOUT)).toBe(false);
    });

    it('should NOT halt on PATH_NOT_FOUND', () => {
      expect(failureHandler.shouldHalt(SettlementFailure.PATH_NOT_FOUND)).toBe(false);
    });

    it('should NOT halt on SLIPPAGE_EXCEEDED', () => {
      expect(failureHandler.shouldHalt(SettlementFailure.SLIPPAGE_EXCEEDED)).toBe(false);
    });
  });

  describe('Retryable Conditions', () => {
    it('should allow retry on HORIZON_TIMEOUT', () => {
      expect(failureHandler.isRetryable(SettlementFailure.HORIZON_TIMEOUT)).toBe(true);
    });

    it('should allow retry on PATH_NOT_FOUND', () => {
      expect(failureHandler.isRetryable(SettlementFailure.PATH_NOT_FOUND)).toBe(true);
    });

    it('should allow retry on SLIPPAGE_EXCEEDED', () => {
      expect(failureHandler.isRetryable(SettlementFailure.SLIPPAGE_EXCEEDED)).toBe(true);
    });

    it('should NOT allow retry on POM_MISMATCH', () => {
      expect(failureHandler.isRetryable(SettlementFailure.POM_MISMATCH)).toBe(false);
    });

    it('should NOT allow retry on PARTIAL_SUBMISSION', () => {
      expect(failureHandler.isRetryable(SettlementFailure.PARTIAL_SUBMISSION)).toBe(false);
    });
  });

  describe('Failure Classification', () => {
    it('should classify POM_MISMATCH as CRITICAL with HALT action', () => {
      const classification = failureHandler.classifyFailure(SettlementFailure.POM_MISMATCH);

      expect(classification.severity).toBe(FailureSeverity.CRITICAL);
      expect(classification.action).toBe(RecoveryAction.HALT);
      expect(classification.retryable).toBe(false);
      expect(classification.haltReason).toContain('Proof of Money');
    });

    it('should classify HORIZON_TIMEOUT as ERROR with RETRY action', () => {
      const classification = failureHandler.classifyFailure(SettlementFailure.HORIZON_TIMEOUT);

      expect(classification.severity).toBe(FailureSeverity.ERROR);
      expect(classification.action).toBe(RecoveryAction.RETRY);
      expect(classification.retryable).toBe(true);
      expect(classification.maxRetries).toBeGreaterThan(0);
    });

    it('should classify SLIPPAGE_EXCEEDED as WARNING with RETRY action', () => {
      const classification = failureHandler.classifyFailure(SettlementFailure.SLIPPAGE_EXCEEDED);

      expect(classification.severity).toBe(FailureSeverity.WARNING);
      expect(classification.action).toBe(RecoveryAction.RETRY);
      expect(classification.retryable).toBe(true);
    });
  });

  describe('Retry Delay Calculation', () => {
    it('should calculate exponential backoff', () => {
      const delay0 = failureHandler.calculateRetryDelay(0);
      const delay1 = failureHandler.calculateRetryDelay(1);
      const delay2 = failureHandler.calculateRetryDelay(2);

      expect(delay0).toBe(1000); // baseDelay
      expect(delay1).toBe(2000); // baseDelay * 2
      expect(delay2).toBe(4000); // baseDelay * 4
    });

    it('should cap at max delay', () => {
      const delay10 = failureHandler.calculateRetryDelay(10);
      expect(delay10).toBe(DEFAULT_RETRY_CONFIG.maxDelayMs);
    });
  });

  describe('Failure Logging', () => {
    it('should log failures', () => {
      const error = new SettlementError(
        SettlementFailure.PATH_NOT_FOUND,
        'No path found',
        {}
      );

      failureHandler.handleFailure(error, 'subnet123', 42n);

      const log = failureHandler.getFailureLog();
      expect(log.length).toBe(1);
      expect(log[0].failure).toBe(SettlementFailure.PATH_NOT_FOUND);
      expect(log[0].subnetId).toBe('subnet123');
      expect(log[0].blockNumber).toBe(42n);
    });

    it('should track multiple failures', () => {
      const errors = [
        new SettlementError(SettlementFailure.PATH_NOT_FOUND, 'No path', {}),
        new SettlementError(SettlementFailure.SLIPPAGE_EXCEEDED, 'Too much slippage', {}),
        new SettlementError(SettlementFailure.HORIZON_TIMEOUT, 'Timeout', {}),
      ];

      errors.forEach((e) => failureHandler.handleFailure(e));

      const log = failureHandler.getFailureLog();
      expect(log.length).toBe(3);
    });

    it('should clear failure log', () => {
      failureHandler.handleFailure(
        new SettlementError(SettlementFailure.PATH_NOT_FOUND, 'No path', {})
      );

      expect(failureHandler.getFailureLog().length).toBe(1);

      failureHandler.clearFailureLog();

      expect(failureHandler.getFailureLog().length).toBe(0);
    });
  });

  describe('Failure Statistics', () => {
    it('should compute statistics', () => {
      const errors = [
        new SettlementError(SettlementFailure.PATH_NOT_FOUND, 'No path', {}),
        new SettlementError(SettlementFailure.PATH_NOT_FOUND, 'No path again', {}),
        new SettlementError(SettlementFailure.SLIPPAGE_EXCEEDED, 'Slippage', {}),
        new SettlementError(SettlementFailure.POM_MISMATCH, 'Mismatch', {}),
      ];

      errors.forEach((e) => failureHandler.handleFailure(e));

      const stats = failureHandler.getStats();

      expect(stats.total).toBe(4);
      expect(stats.byFailure[SettlementFailure.PATH_NOT_FOUND]).toBe(2);
      expect(stats.byFailure[SettlementFailure.SLIPPAGE_EXCEEDED]).toBe(1);
      expect(stats.byFailure[SettlementFailure.POM_MISMATCH]).toBe(1);
    });

    it('should detect critical failures', () => {
      expect(failureHandler.hasCriticalFailures()).toBe(false);

      failureHandler.handleFailure(
        new SettlementError(SettlementFailure.PATH_NOT_FOUND, 'No path', {})
      );
      expect(failureHandler.hasCriticalFailures()).toBe(false);

      failureHandler.handleFailure(
        new SettlementError(SettlementFailure.POM_MISMATCH, 'Mismatch', {})
      );
      expect(failureHandler.hasCriticalFailures()).toBe(true);
    });
  });

  describe('Filter by Severity', () => {
    it('should filter failures by minimum severity', () => {
      const errors = [
        new SettlementError(SettlementFailure.SLIPPAGE_EXCEEDED, 'Warning', {}),
        new SettlementError(SettlementFailure.PATH_NOT_FOUND, 'Error', {}),
        new SettlementError(SettlementFailure.POM_MISMATCH, 'Critical', {}),
      ];

      errors.forEach((e) => failureHandler.handleFailure(e));

      const criticalOnly = failureHandler.getFailuresBySeverity(FailureSeverity.CRITICAL);
      expect(criticalOnly.length).toBe(1);

      const errorAndAbove = failureHandler.getFailuresBySeverity(FailureSeverity.ERROR);
      expect(errorAndAbove.length).toBe(2);

      const warningAndAbove = failureHandler.getFailuresBySeverity(FailureSeverity.WARNING);
      expect(warningAndAbove.length).toBe(3);
    });
  });

  describe('Execute with Retry', () => {
    it('should succeed on first attempt', async () => {
      let attempts = 0;
      const result = await failureHandler.executeWithRetry(async () => {
        attempts++;
        return 'success';
      }, 'test operation');

      expect(result).toBe('success');
      expect(attempts).toBe(1);
    });

    it('should retry on retryable error', async () => {
      let attempts = 0;
      const customHandler = new FailureHandler({
        maxRetries: 3,
        baseDelayMs: 1, // Very fast for testing
        maxDelayMs: 10,
        backoffMultiplier: 1, // No backoff for speed
      });

      const result = await customHandler.executeWithRetry(async () => {
        attempts++;
        if (attempts < 3) {
          throw new SettlementError(
            SettlementFailure.HORIZON_TIMEOUT,
            'Timeout',
            {}
          );
        }
        return 'success';
      }, 'test operation');

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    }, 10000); // 10 second timeout

    it('should NOT retry on non-retryable error', async () => {
      let attempts = 0;

      await expect(
        failureHandler.executeWithRetry(async () => {
          attempts++;
          throw new SettlementError(
            SettlementFailure.POM_MISMATCH,
            'Mismatch',
            {}
          );
        }, 'test operation')
      ).rejects.toThrow('Mismatch');

      expect(attempts).toBe(1);
    });
  });
});

describe('assertOrHalt', () => {
  it('should not throw when condition is true', () => {
    expect(() => {
      assertOrHalt(true, SettlementFailure.POM_MISMATCH, 'Should not fail');
    }).not.toThrow();
  });

  it('should throw SettlementError when condition is false', () => {
    expect(() => {
      assertOrHalt(false, SettlementFailure.POM_MISMATCH, 'Delta mismatch');
    }).toThrow(SettlementError);
  });

  it('should include correct failure type in error', () => {
    try {
      assertOrHalt(false, SettlementFailure.INSUFFICIENT_BALANCE, 'Not enough funds');
      fail('Expected assertOrHalt to throw');
    } catch (error: any) {
      expect(error.failure).toBe(SettlementFailure.INSUFFICIENT_BALANCE);
      expect(error.message).toContain('Not enough funds');
    }
  });
});
