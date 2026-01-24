"use strict";
/**
 * ASTRAEUS - Dev B Module Exports
 *
 * Stellar Treasury, Settlement, and FX Layer
 *
 * This module provides everything Dev B needs for:
 * - Vault management (create, configure multisig)
 * - Treasury snapshots (for PoM validation)
 * - Settlement planning (build Stellar transactions)
 * - Settlement execution (sign, submit, track)
 * - Replay protection (memo-based deduplication)
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestnetSettlementExecutor = exports.SettlementExecutor = exports.createTestnetReplayProtection = exports.ReplayProtectionService = exports.createTestnetOrchestrator = exports.MultisigOrchestrator = exports.createTestnetSettlementPlanner = exports.SettlementPlanner = exports.sortWithdrawalsDeterministically = exports.groupWithdrawalsByAsset = exports.verifyDeltaMatch = exports.pomDeltaFromJSON = exports.pomDeltaToJSON = exports.computeNetOutflow = exports.decimalToStroops = exports.stroopsToDecimal = exports.createTestnetSnapshotService = exports.TreasurySnapshotService = exports.generateTestAuditors = exports.createTestnetVaultManager = exports.VaultManager = void 0;
// =============================================================================
// Types and Interfaces
// =============================================================================
__exportStar(require("./interfaces/types"), exports);
__exportStar(require("./interfaces/crypto"), exports);
// =============================================================================
// Vault Management
// =============================================================================
var vault_manager_1 = require("./vault/vault_manager");
Object.defineProperty(exports, "VaultManager", { enumerable: true, get: function () { return vault_manager_1.VaultManager; } });
Object.defineProperty(exports, "createTestnetVaultManager", { enumerable: true, get: function () { return vault_manager_1.createTestnetVaultManager; } });
Object.defineProperty(exports, "generateTestAuditors", { enumerable: true, get: function () { return vault_manager_1.generateTestAuditors; } });
// =============================================================================
// Treasury Snapshot
// =============================================================================
var treasury_snapshot_1 = require("./snapshot/treasury_snapshot");
Object.defineProperty(exports, "TreasurySnapshotService", { enumerable: true, get: function () { return treasury_snapshot_1.TreasurySnapshotService; } });
Object.defineProperty(exports, "createTestnetSnapshotService", { enumerable: true, get: function () { return treasury_snapshot_1.createTestnetSnapshotService; } });
Object.defineProperty(exports, "stroopsToDecimal", { enumerable: true, get: function () { return treasury_snapshot_1.stroopsToDecimal; } });
Object.defineProperty(exports, "decimalToStroops", { enumerable: true, get: function () { return treasury_snapshot_1.decimalToStroops; } });
// =============================================================================
// PoM Delta Computation
// =============================================================================
var pom_delta_1 = require("./settlement/pom_delta");
Object.defineProperty(exports, "computeNetOutflow", { enumerable: true, get: function () { return pom_delta_1.computeNetOutflow; } });
Object.defineProperty(exports, "pomDeltaToJSON", { enumerable: true, get: function () { return pom_delta_1.pomDeltaToJSON; } });
Object.defineProperty(exports, "pomDeltaFromJSON", { enumerable: true, get: function () { return pom_delta_1.pomDeltaFromJSON; } });
Object.defineProperty(exports, "verifyDeltaMatch", { enumerable: true, get: function () { return pom_delta_1.verifyDeltaMatch; } });
Object.defineProperty(exports, "groupWithdrawalsByAsset", { enumerable: true, get: function () { return pom_delta_1.groupWithdrawalsByAsset; } });
Object.defineProperty(exports, "sortWithdrawalsDeterministically", { enumerable: true, get: function () { return pom_delta_1.sortWithdrawalsDeterministically; } });
// =============================================================================
// Settlement Planning
// =============================================================================
var settlement_planner_1 = require("./settlement/settlement_planner");
Object.defineProperty(exports, "SettlementPlanner", { enumerable: true, get: function () { return settlement_planner_1.SettlementPlanner; } });
Object.defineProperty(exports, "createTestnetSettlementPlanner", { enumerable: true, get: function () { return settlement_planner_1.createTestnetSettlementPlanner; } });
// =============================================================================
// Multisig Orchestration
// =============================================================================
var multisig_orchestrator_1 = require("./settlement/multisig_orchestrator");
Object.defineProperty(exports, "MultisigOrchestrator", { enumerable: true, get: function () { return multisig_orchestrator_1.MultisigOrchestrator; } });
Object.defineProperty(exports, "createTestnetOrchestrator", { enumerable: true, get: function () { return multisig_orchestrator_1.createTestnetOrchestrator; } });
// =============================================================================
// Replay Protection
// =============================================================================
var replay_protection_1 = require("./safety/replay_protection");
Object.defineProperty(exports, "ReplayProtectionService", { enumerable: true, get: function () { return replay_protection_1.ReplayProtectionService; } });
Object.defineProperty(exports, "createTestnetReplayProtection", { enumerable: true, get: function () { return replay_protection_1.createTestnetReplayProtection; } });
// =============================================================================
// Settlement Execution (Main Entry Point)
// =============================================================================
var settlement_executor_1 = require("./settlement/settlement_executor");
Object.defineProperty(exports, "SettlementExecutor", { enumerable: true, get: function () { return settlement_executor_1.SettlementExecutor; } });
Object.defineProperty(exports, "createTestnetSettlementExecutor", { enumerable: true, get: function () { return settlement_executor_1.createTestnetSettlementExecutor; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7OztHQVdHOzs7Ozs7Ozs7Ozs7Ozs7OztBQUVILGdGQUFnRjtBQUNoRix1QkFBdUI7QUFDdkIsZ0ZBQWdGO0FBQ2hGLHFEQUFtQztBQUNuQyxzREFBb0M7QUFFcEMsZ0ZBQWdGO0FBQ2hGLG1CQUFtQjtBQUNuQixnRkFBZ0Y7QUFDaEYsdURBSytCO0FBSjdCLDZHQUFBLFlBQVksT0FBQTtBQUVaLDBIQUFBLHlCQUF5QixPQUFBO0FBQ3pCLHFIQUFBLG9CQUFvQixPQUFBO0FBR3RCLGdGQUFnRjtBQUNoRixvQkFBb0I7QUFDcEIsZ0ZBQWdGO0FBQ2hGLGtFQUtzQztBQUpwQyw0SEFBQSx1QkFBdUIsT0FBQTtBQUN2QixpSUFBQSw0QkFBNEIsT0FBQTtBQUM1QixxSEFBQSxnQkFBZ0IsT0FBQTtBQUNoQixxSEFBQSxnQkFBZ0IsT0FBQTtBQUdsQixnRkFBZ0Y7QUFDaEYsd0JBQXdCO0FBQ3hCLGdGQUFnRjtBQUNoRixvREFPZ0M7QUFOOUIsOEdBQUEsaUJBQWlCLE9BQUE7QUFDakIsMkdBQUEsY0FBYyxPQUFBO0FBQ2QsNkdBQUEsZ0JBQWdCLE9BQUE7QUFDaEIsNkdBQUEsZ0JBQWdCLE9BQUE7QUFDaEIsb0hBQUEsdUJBQXVCLE9BQUE7QUFDdkIsNkhBQUEsZ0NBQWdDLE9BQUE7QUFHbEMsZ0ZBQWdGO0FBQ2hGLHNCQUFzQjtBQUN0QixnRkFBZ0Y7QUFDaEYsc0VBS3lDO0FBSnZDLHVIQUFBLGlCQUFpQixPQUFBO0FBR2pCLG9JQUFBLDhCQUE4QixPQUFBO0FBR2hDLGdGQUFnRjtBQUNoRix5QkFBeUI7QUFDekIsZ0ZBQWdGO0FBQ2hGLDRFQUs0QztBQUoxQyw2SEFBQSxvQkFBb0IsT0FBQTtBQUdwQixrSUFBQSx5QkFBeUIsT0FBQTtBQUczQixnRkFBZ0Y7QUFDaEYsb0JBQW9CO0FBQ3BCLGdGQUFnRjtBQUNoRixnRUFJb0M7QUFIbEMsNEhBQUEsdUJBQXVCLE9BQUE7QUFFdkIsa0lBQUEsNkJBQTZCLE9BQUE7QUFHL0IsZ0ZBQWdGO0FBQ2hGLDBDQUEwQztBQUMxQyxnRkFBZ0Y7QUFDaEYsd0VBSzBDO0FBSnhDLHlIQUFBLGtCQUFrQixPQUFBO0FBR2xCLHNJQUFBLCtCQUErQixPQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBBU1RSQUVVUyAtIERldiBCIE1vZHVsZSBFeHBvcnRzXG4gKlxuICogU3RlbGxhciBUcmVhc3VyeSwgU2V0dGxlbWVudCwgYW5kIEZYIExheWVyXG4gKlxuICogVGhpcyBtb2R1bGUgcHJvdmlkZXMgZXZlcnl0aGluZyBEZXYgQiBuZWVkcyBmb3I6XG4gKiAtIFZhdWx0IG1hbmFnZW1lbnQgKGNyZWF0ZSwgY29uZmlndXJlIG11bHRpc2lnKVxuICogLSBUcmVhc3VyeSBzbmFwc2hvdHMgKGZvciBQb00gdmFsaWRhdGlvbilcbiAqIC0gU2V0dGxlbWVudCBwbGFubmluZyAoYnVpbGQgU3RlbGxhciB0cmFuc2FjdGlvbnMpXG4gKiAtIFNldHRsZW1lbnQgZXhlY3V0aW9uIChzaWduLCBzdWJtaXQsIHRyYWNrKVxuICogLSBSZXBsYXkgcHJvdGVjdGlvbiAobWVtby1iYXNlZCBkZWR1cGxpY2F0aW9uKVxuICovXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUeXBlcyBhbmQgSW50ZXJmYWNlc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbmV4cG9ydCAqIGZyb20gJy4vaW50ZXJmYWNlcy90eXBlcyc7XG5leHBvcnQgKiBmcm9tICcuL2ludGVyZmFjZXMvY3J5cHRvJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFZhdWx0IE1hbmFnZW1lbnRcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5leHBvcnQge1xuICBWYXVsdE1hbmFnZXIsXG4gIFZhdWx0Q3JlYXRpb25SZXN1bHQsXG4gIGNyZWF0ZVRlc3RuZXRWYXVsdE1hbmFnZXIsXG4gIGdlbmVyYXRlVGVzdEF1ZGl0b3JzLFxufSBmcm9tICcuL3ZhdWx0L3ZhdWx0X21hbmFnZXInO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVHJlYXN1cnkgU25hcHNob3Rcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5leHBvcnQge1xuICBUcmVhc3VyeVNuYXBzaG90U2VydmljZSxcbiAgY3JlYXRlVGVzdG5ldFNuYXBzaG90U2VydmljZSxcbiAgc3Ryb29wc1RvRGVjaW1hbCxcbiAgZGVjaW1hbFRvU3Ryb29wcyxcbn0gZnJvbSAnLi9zbmFwc2hvdC90cmVhc3VyeV9zbmFwc2hvdCc7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBQb00gRGVsdGEgQ29tcHV0YXRpb25cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5leHBvcnQge1xuICBjb21wdXRlTmV0T3V0ZmxvdyxcbiAgcG9tRGVsdGFUb0pTT04sXG4gIHBvbURlbHRhRnJvbUpTT04sXG4gIHZlcmlmeURlbHRhTWF0Y2gsXG4gIGdyb3VwV2l0aGRyYXdhbHNCeUFzc2V0LFxuICBzb3J0V2l0aGRyYXdhbHNEZXRlcm1pbmlzdGljYWxseSxcbn0gZnJvbSAnLi9zZXR0bGVtZW50L3BvbV9kZWx0YSc7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBTZXR0bGVtZW50IFBsYW5uaW5nXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuZXhwb3J0IHtcbiAgU2V0dGxlbWVudFBsYW5uZXIsXG4gIFNldHRsZW1lbnRUcmFuc2FjdGlvbixcbiAgRGV0YWlsZWRTZXR0bGVtZW50UGxhbixcbiAgY3JlYXRlVGVzdG5ldFNldHRsZW1lbnRQbGFubmVyLFxufSBmcm9tICcuL3NldHRsZW1lbnQvc2V0dGxlbWVudF9wbGFubmVyJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIE11bHRpc2lnIE9yY2hlc3RyYXRpb25cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5leHBvcnQge1xuICBNdWx0aXNpZ09yY2hlc3RyYXRvcixcbiAgU3VibWlzc2lvblJlc3VsdCxcbiAgU2V0dGxlbWVudEV4ZWN1dGlvblJlc3VsdCxcbiAgY3JlYXRlVGVzdG5ldE9yY2hlc3RyYXRvcixcbn0gZnJvbSAnLi9zZXR0bGVtZW50L211bHRpc2lnX29yY2hlc3RyYXRvcic7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBSZXBsYXkgUHJvdGVjdGlvblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbmV4cG9ydCB7XG4gIFJlcGxheVByb3RlY3Rpb25TZXJ2aWNlLFxuICBTZXR0bGVtZW50UmVjb3JkLFxuICBjcmVhdGVUZXN0bmV0UmVwbGF5UHJvdGVjdGlvbixcbn0gZnJvbSAnLi9zYWZldHkvcmVwbGF5X3Byb3RlY3Rpb24nO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gU2V0dGxlbWVudCBFeGVjdXRpb24gKE1haW4gRW50cnkgUG9pbnQpXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuZXhwb3J0IHtcbiAgU2V0dGxlbWVudEV4ZWN1dG9yLFxuICBTZXR0bGVtZW50RXhlY3V0b3JDb25maWcsXG4gIENvbW1pdG1lbnRFdmVudExpc3RlbmVyLFxuICBjcmVhdGVUZXN0bmV0U2V0dGxlbWVudEV4ZWN1dG9yLFxufSBmcm9tICcuL3NldHRsZW1lbnQvc2V0dGxlbWVudF9leGVjdXRvcic7XG4iXX0=