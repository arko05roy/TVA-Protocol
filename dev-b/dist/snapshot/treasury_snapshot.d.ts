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
import { TreasurySnapshot, TreasurySnapshotJSON, NetworkConfig } from '../interfaces/types';
/**
 * Treasury Snapshot Service
 */
export declare class TreasurySnapshotService {
    private server;
    private config;
    constructor(config?: NetworkConfig);
    /**
     * Get a complete treasury snapshot for PoM validation
     *
     * @param vaultAddress - Stellar address of the vault (G... format)
     * @returns TreasurySnapshot with balances, signers, and threshold
     */
    getTreasurySnapshot(vaultAddress: string): Promise<TreasurySnapshot>;
    /**
     * Get treasury snapshot as JSON-serializable object
     * (For API responses)
     */
    getTreasurySnapshotJSON(vaultAddress: string): Promise<TreasurySnapshotJSON>;
    /**
     * Fetch account from Horizon with retry logic
     */
    private fetchAccountWithRetry;
    /**
     * Parse Horizon balances to asset_id -> balance map
     *
     * Implements the asset_id computation from interfaces.md Section 2.2:
     * asset_id = SHA256(asset_code || issuer)
     */
    private parseBalances;
    /**
     * Convert Horizon balance string to stroops (bigint)
     * Horizon format: "100.0000000" (7 decimal places)
     */
    private balanceToStroops;
    /**
     * Parse Horizon signers to list of public keys
     */
    private parseSigners;
    /**
     * Get balance for a specific asset
     */
    getAssetBalance(vaultAddress: string, assetCode: string, issuer: string): Promise<bigint>;
    /**
     * Check if treasury has sufficient balance for a given PoM delta
     *
     * @param vaultAddress - Vault address
     * @param pomDelta - Map of asset_id -> required outflow
     * @returns Object with solvency status and any shortfalls
     */
    checkSolvency(vaultAddress: string, pomDelta: Map<string, bigint>): Promise<{
        solvent: boolean;
        shortfalls: Map<string, {
            required: bigint;
            available: bigint;
        }>;
    }>;
    /**
     * Verify that a set of signers can meet the threshold
     */
    canMeetThreshold(vaultAddress: string, availableSigners: string[]): Promise<{
        canMeet: boolean;
        required: number;
        available: number;
    }>;
}
/**
 * Create a new TreasurySnapshotService for testnet
 */
export declare function createTestnetSnapshotService(): TreasurySnapshotService;
/**
 * Utility function: Convert stroops to human-readable amount
 */
export declare function stroopsToDecimal(stroops: bigint, decimals?: number): string;
/**
 * Utility function: Convert decimal amount to stroops
 */
export declare function decimalToStroops(decimal: string): bigint;
