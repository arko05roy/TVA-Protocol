/**
 * ASTRAEUS - Failure Handler
 *
 * Comprehensive failure handling for settlement operations.
 *
 * Per agent/plan.md Section B6 (Failure Handling):
 * - Idempotency (memo-based) - handled by replay_protection.ts
 * - Tx hash tracking
 * - Network retries
 * - Halt on PoM mismatch
 * - Halt on partial submission failures
 *
 * Per agent/core-idea.md Section 9.2 (Attack Analysis):
 * - PoM mismatch → Blocked by PoM
 * - Partial submission → HALT immediately
 * - Threshold not met → HALT
 *
 * CRITICAL: System MUST HALT on certain failure conditions to prevent
 * fund loss or inconsistent state.
 */

import {
  SettlementError,
  SettlementFailure,
} from '../interfaces/types';

/**
 * Failure severity levels
 */
export enum FailureSeverity {
  /** Informational - no action required */
  INFO = 'INFO',
  /** Warning - operation may be degraded */
  WARNING = 'WARNING',
  /** Error - operation failed but system can continue */
  ERROR = 'ERROR',
  /** Critical - system must halt to prevent fund loss */
  CRITICAL = 'CRITICAL',
}

/**
 * Failure context for detailed logging and analysis
 */
export interface FailureContext {
  /** Failure type */
  failure: SettlementFailure;
  /** Severity level */
  severity: FailureSeverity;
  /** Human-readable message */
  message: string;
  /** Timestamp of failure */
  timestamp: Date;
  /** Subnet ID if applicable */
  subnetId?: string;
  /** Block number if applicable */
  blockNumber?: bigint;
  /** Transaction hash if applicable */
  txHash?: string;
  /** Additional context data */
  context?: Record<string, unknown>;
}

/**
 * Recovery action to take after failure
 */
export enum RecoveryAction {
  /** Do nothing - operation completed successfully despite error */
  NONE = 'NONE',
  /** Retry the operation */
  RETRY = 'RETRY',
  /** Skip this item and continue with others */
  SKIP = 'SKIP',
  /** Halt all operations immediately */
  HALT = 'HALT',
  /** Manual intervention required */
  MANUAL = 'MANUAL',
}

/**
 * Failure classification result
 */
export interface FailureClassification {
  severity: FailureSeverity;
  action: RecoveryAction;
  retryable: boolean;
  maxRetries: number;
  haltReason?: string;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay between retries in milliseconds */
  baseDelayMs: number;
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: number;
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Failure Handler class
 *
 * Classifies failures, determines recovery actions, and manages retries.
 */
export class FailureHandler {
  private retryConfig: RetryConfig;
  private failureLog: FailureContext[] = [];

  constructor(retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.retryConfig = retryConfig;
  }

  /**
   * Determine if a failure should cause the system to halt.
   *
   * Per plan.md B6 and core-idea.md Section 9.2:
   * Certain failures MUST halt the system to prevent fund loss.
   *
   * @param failure - The failure type
   * @returns True if system should halt
   */
  shouldHalt(failure: SettlementFailure): boolean {
    const haltConditions = [
      SettlementFailure.POM_MISMATCH,
      SettlementFailure.PARTIAL_SUBMISSION,
      SettlementFailure.THRESHOLD_NOT_MET,
      SettlementFailure.INSUFFICIENT_BALANCE,
    ];

    return haltConditions.includes(failure);
  }

  /**
   * Determine if a failure is retryable.
   *
   * @param failure - The failure type
   * @returns True if operation can be retried
   */
  isRetryable(failure: SettlementFailure): boolean {
    const retryableConditions = [
      SettlementFailure.HORIZON_TIMEOUT,
      SettlementFailure.PATH_NOT_FOUND, // May find path later
      SettlementFailure.SLIPPAGE_EXCEEDED, // Prices may improve
    ];

    return retryableConditions.includes(failure);
  }

  /**
   * Classify a failure and determine appropriate action.
   *
   * @param failure - The failure type
   * @returns Classification with severity and recommended action
   */
  classifyFailure(failure: SettlementFailure): FailureClassification {
    switch (failure) {
      // CRITICAL - Must halt immediately
      case SettlementFailure.POM_MISMATCH:
        return {
          severity: FailureSeverity.CRITICAL,
          action: RecoveryAction.HALT,
          retryable: false,
          maxRetries: 0,
          haltReason: 'Settlement plan does not match Proof of Money delta. Potential attack or bug detected.',
        };

      case SettlementFailure.PARTIAL_SUBMISSION:
        return {
          severity: FailureSeverity.CRITICAL,
          action: RecoveryAction.HALT,
          retryable: false,
          maxRetries: 0,
          haltReason: 'Partial transaction submission detected. System state may be inconsistent.',
        };

      case SettlementFailure.THRESHOLD_NOT_MET:
        return {
          severity: FailureSeverity.CRITICAL,
          action: RecoveryAction.HALT,
          retryable: false,
          maxRetries: 0,
          haltReason: 'Insufficient signers to meet multisig threshold. Cannot authorize transactions.',
        };

      case SettlementFailure.INSUFFICIENT_BALANCE:
        return {
          severity: FailureSeverity.CRITICAL,
          action: RecoveryAction.HALT,
          retryable: false,
          maxRetries: 0,
          haltReason: 'Treasury balance insufficient for settlement. Solvency check failed.',
        };

      // ERROR - Retryable
      case SettlementFailure.HORIZON_TIMEOUT:
        return {
          severity: FailureSeverity.ERROR,
          action: RecoveryAction.RETRY,
          retryable: true,
          maxRetries: this.retryConfig.maxRetries,
        };

      case SettlementFailure.PATH_NOT_FOUND:
        return {
          severity: FailureSeverity.ERROR,
          action: RecoveryAction.RETRY,
          retryable: true,
          maxRetries: 2, // Fewer retries for path issues
        };

      case SettlementFailure.SLIPPAGE_EXCEEDED:
        return {
          severity: FailureSeverity.WARNING,
          action: RecoveryAction.RETRY,
          retryable: true,
          maxRetries: 2,
        };

      default:
        return {
          severity: FailureSeverity.ERROR,
          action: RecoveryAction.MANUAL,
          retryable: false,
          maxRetries: 0,
        };
    }
  }

  /**
   * Calculate delay for retry attempt with exponential backoff.
   *
   * @param attempt - Current attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  calculateRetryDelay(attempt: number): number {
    const delay = this.retryConfig.baseDelayMs *
      Math.pow(this.retryConfig.backoffMultiplier, attempt);

    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  /**
   * Execute an operation with retry logic.
   *
   * @param operation - Async operation to execute
   * @param operationName - Name for logging
   * @returns Operation result
   * @throws SettlementError if all retries exhausted or non-retryable error
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Check if this is a SettlementError
        if (error instanceof SettlementError) {
          const classification = this.classifyFailure(error.failure);

          // Log the failure
          this.logFailure({
            failure: error.failure,
            severity: classification.severity,
            message: error.message,
            timestamp: new Date(),
            context: { attempt, operationName },
          });

          // If not retryable, throw immediately
          if (!classification.retryable) {
            throw error;
          }

          // If we've exhausted retries, throw
          if (attempt >= classification.maxRetries) {
            throw new SettlementError(
              error.failure,
              `${operationName} failed after ${attempt + 1} attempts: ${error.message}`,
              { attempts: attempt + 1, lastError: error.details }
            );
          }
        } else {
          // Unknown error - log and retry with generic handling
          this.logFailure({
            failure: SettlementFailure.HORIZON_TIMEOUT, // Default classification
            severity: FailureSeverity.ERROR,
            message: error.message,
            timestamp: new Date(),
            context: { attempt, operationName, errorType: error.constructor.name },
          });

          if (attempt >= this.retryConfig.maxRetries) {
            throw error;
          }
        }

        // Wait before retrying
        const delay = this.calculateRetryDelay(attempt);
        await this.sleep(delay);
      }
    }

    // Should not reach here, but handle just in case
    throw lastError || new Error(`${operationName} failed with unknown error`);
  }

  /**
   * Handle a failure and determine next steps.
   *
   * @param error - The error that occurred
   * @param subnetId - Subnet ID if applicable
   * @param blockNumber - Block number if applicable
   * @returns Failure context with classification
   */
  handleFailure(
    error: Error,
    subnetId?: string,
    blockNumber?: bigint
  ): FailureContext {
    let failure: SettlementFailure;
    let severity: FailureSeverity;
    let action: RecoveryAction;

    if (error instanceof SettlementError) {
      failure = error.failure;
      const classification = this.classifyFailure(failure);
      severity = classification.severity;
      action = classification.action;
    } else {
      // Unknown error type
      failure = SettlementFailure.HORIZON_TIMEOUT; // Default
      severity = FailureSeverity.ERROR;
      action = RecoveryAction.MANUAL;
    }

    const context: FailureContext = {
      failure,
      severity,
      message: error.message,
      timestamp: new Date(),
      subnetId,
      blockNumber,
      context: {
        action,
        errorType: error.constructor.name,
      },
    };

    this.logFailure(context);

    return context;
  }

  /**
   * Log a failure for audit trail.
   *
   * @param context - Failure context to log
   */
  logFailure(context: FailureContext): void {
    this.failureLog.push(context);

    // In production, this would also log to external system
    // For now, just console log for visibility
    const logLevel = this.getLogLevel(context.severity);
    console[logLevel](
      `[${context.severity}] ${context.failure}: ${context.message}`,
      context.context
    );
  }

  /**
   * Get all logged failures.
   *
   * @returns Array of failure contexts
   */
  getFailureLog(): FailureContext[] {
    return [...this.failureLog];
  }

  /**
   * Get failures filtered by severity.
   *
   * @param severity - Minimum severity level
   * @returns Filtered failure contexts
   */
  getFailuresBySeverity(severity: FailureSeverity): FailureContext[] {
    const severityOrder = [
      FailureSeverity.INFO,
      FailureSeverity.WARNING,
      FailureSeverity.ERROR,
      FailureSeverity.CRITICAL,
    ];

    const minIndex = severityOrder.indexOf(severity);

    return this.failureLog.filter((ctx) =>
      severityOrder.indexOf(ctx.severity) >= minIndex
    );
  }

  /**
   * Clear the failure log.
   */
  clearFailureLog(): void {
    this.failureLog = [];
  }

  /**
   * Get failure statistics.
   */
  getStats(): {
    total: number;
    bySeverity: Record<FailureSeverity, number>;
    byFailure: Record<string, number>;
  } {
    const bySeverity: Record<FailureSeverity, number> = {
      [FailureSeverity.INFO]: 0,
      [FailureSeverity.WARNING]: 0,
      [FailureSeverity.ERROR]: 0,
      [FailureSeverity.CRITICAL]: 0,
    };

    const byFailure: Record<string, number> = {};

    for (const ctx of this.failureLog) {
      bySeverity[ctx.severity]++;
      byFailure[ctx.failure] = (byFailure[ctx.failure] || 0) + 1;
    }

    return {
      total: this.failureLog.length,
      bySeverity,
      byFailure,
    };
  }

  /**
   * Check if any critical failures have occurred.
   *
   * @returns True if any critical failures logged
   */
  hasCriticalFailures(): boolean {
    return this.failureLog.some(
      (ctx) => ctx.severity === FailureSeverity.CRITICAL
    );
  }

  // ============================================================
  // Private helper methods
  // ============================================================

  /**
   * Get console log level for severity.
   */
  private getLogLevel(severity: FailureSeverity): 'log' | 'warn' | 'error' {
    switch (severity) {
      case FailureSeverity.INFO:
        return 'log';
      case FailureSeverity.WARNING:
        return 'warn';
      case FailureSeverity.ERROR:
      case FailureSeverity.CRITICAL:
        return 'error';
    }
  }

  /**
   * Sleep helper for retry delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a FailureHandler with default configuration
 */
export function createFailureHandler(
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): FailureHandler {
  return new FailureHandler(retryConfig);
}

/**
 * Assert that a condition is true or halt.
 *
 * Use this for critical invariants that must hold.
 *
 * @param condition - Condition to check
 * @param failure - Failure type if condition is false
 * @param message - Error message
 * @throws SettlementError if condition is false
 */
export function assertOrHalt(
  condition: boolean,
  failure: SettlementFailure,
  message: string
): asserts condition {
  if (!condition) {
    throw new SettlementError(failure, message, { halt: true });
  }
}
