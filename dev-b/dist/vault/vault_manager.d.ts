/**
 * ASTRAEUS - Vault Manager
 *
 * Creates and manages Stellar multisig vaults for subnet treasuries.
 * A vault is a Stellar account with:
 * - Multiple auditor signers
 * - Threshold-based authorization
 * - No master key (fully decentralized)
 * - Required trustlines for whitelisted assets
 */
import { Keypair } from '@stellar/stellar-sdk';
import { Asset as AstraeusAsset, VaultConfig, NetworkConfig } from '../interfaces/types';
/**
 * Result of vault creation
 */
export interface VaultCreationResult {
    /** Vault public key (G... address) */
    address: string;
    /** Secret key (S...) - STORE SECURELY, needed only for initial setup */
    secretKey: string;
    /** Transaction hashes from setup */
    setupTxHashes: string[];
}
/**
 * Vault Manager class for creating and managing Stellar multisig vaults
 */
export declare class VaultManager {
    private server;
    private networkPassphrase;
    private config;
    constructor(config?: NetworkConfig);
    /**
     * Create a new multisig vault for a subnet
     *
     * Steps:
     * 1. Generate new keypair for vault
     * 2. Fund account (testnet: friendbot, mainnet: requires XLM)
     * 3. Add auditors as signers
     * 4. Set thresholds
     * 5. Remove master key
     * 6. Add trustlines
     *
     * @param auditorPubkeys - Ed25519 public keys of auditors (G... addresses)
     * @param threshold - Required signature threshold (must be >= floor(n/2)+1)
     * @param assetList - Assets to add trustlines for
     * @param funderKeypair - Optional keypair to fund the vault (required on mainnet)
     */
    createVault(auditorPubkeys: string[], threshold: number, assetList: AstraeusAsset[], funderKeypair?: Keypair): Promise<VaultCreationResult>;
    /**
     * Create vault with trustlines - full setup in one call
     * This version adds trustlines before removing master key
     */
    createVaultWithTrustlines(auditorPubkeys: string[], threshold: number, assetList: AstraeusAsset[], funderKeypair?: Keypair): Promise<VaultCreationResult>;
    /**
     * Fund account using Stellar testnet friendbot
     */
    private fundWithFriendbot;
    /**
     * Fund account by sending XLM from funder
     */
    private fundAccount;
    /**
     * Wait for account to be created on the network
     */
    private waitForAccount;
    /**
     * Configure vault signers and thresholds, remove master key
     */
    private configureVaultSigners;
    /**
     * Add trustlines while master key is still active
     */
    private addTrustlinesWithMasterKey;
    /**
     * Add a trustline to an existing vault (requires auditor signatures)
     */
    addTrustline(vaultAddress: string, asset: AstraeusAsset, signerKeypairs: Keypair[]): Promise<string>;
    /**
     * Rotate a signer on the vault (requires existing signers to authorize)
     */
    rotateSigner(vaultAddress: string, oldSigner: string, newSigner: string, signerKeypairs: Keypair[]): Promise<string>;
    /**
     * Get vault configuration from Stellar
     */
    getVaultConfig(vaultAddress: string): Promise<VaultConfig>;
    /**
     * Verify vault configuration matches expected values
     */
    verifyVaultConfig(vaultAddress: string, expectedAuditors: string[], expectedThreshold: number): Promise<{
        valid: boolean;
        errors: string[];
    }>;
}
/**
 * Create a new VaultManager instance for testnet
 */
export declare function createTestnetVaultManager(): VaultManager;
/**
 * Generate test auditor keypairs (for testing only)
 */
export declare function generateTestAuditors(count: number): Keypair[];
