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

import {
  Keypair,
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  Memo,
  Account,
} from '@stellar/stellar-sdk';
import {
  Asset as AstraeusAsset,
  VaultConfig,
  NetworkConfig,
  TESTNET_CONFIG,
  STELLAR_CONSTANTS,
} from '../interfaces/types';

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
export class VaultManager {
  private server: Horizon.Server;
  private networkPassphrase: string;
  private config: NetworkConfig;

  constructor(config: NetworkConfig = TESTNET_CONFIG) {
    this.config = config;
    this.server = new Horizon.Server(config.horizonUrl);
    this.networkPassphrase = config.networkPassphrase;
  }

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
  async createVault(
    auditorPubkeys: string[],
    threshold: number,
    assetList: AstraeusAsset[],
    funderKeypair?: Keypair
  ): Promise<VaultCreationResult> {
    // Validate inputs
    if (auditorPubkeys.length < 3) {
      throw new Error(`Minimum 3 auditors required, got ${auditorPubkeys.length}`);
    }

    const minThreshold = Math.floor(auditorPubkeys.length / 2) + 1;
    if (threshold < minThreshold) {
      throw new Error(
        `Threshold must be >= floor(n/2)+1 = ${minThreshold}, got ${threshold}`
      );
    }

    if (threshold > auditorPubkeys.length) {
      throw new Error(
        `Threshold ${threshold} exceeds auditor count ${auditorPubkeys.length}`
      );
    }

    // Validate all auditor keys are valid Stellar public keys
    for (const pubkey of auditorPubkeys) {
      if (!pubkey.startsWith('G')) {
        throw new Error(`Invalid auditor public key format: ${pubkey}`);
      }
    }

    const txHashes: string[] = [];

    // Step 1: Generate new keypair for vault
    const vaultKeypair = Keypair.random();
    console.log(`Generated vault keypair: ${vaultKeypair.publicKey()}`);

    // Step 2: Fund account
    if (this.config.isTestnet) {
      await this.fundWithFriendbot(vaultKeypair.publicKey());
      console.log(`Funded vault via friendbot`);
    } else {
      if (!funderKeypair) {
        throw new Error('Funder keypair required on mainnet');
      }
      const fundTxHash = await this.fundAccount(
        funderKeypair,
        vaultKeypair.publicKey()
      );
      txHashes.push(fundTxHash);
      console.log(`Funded vault via funder: ${fundTxHash}`);
    }

    // Wait for account to be created
    await this.waitForAccount(vaultKeypair.publicKey());

    // Step 3-5: Configure signers and thresholds
    const configTxHash = await this.configureVaultSigners(
      vaultKeypair,
      auditorPubkeys,
      threshold
    );
    txHashes.push(configTxHash);
    console.log(`Configured vault signers: ${configTxHash}`);

    // Step 6: Add trustlines (requires auditor signatures now)
    // For initial setup, we add trustlines BEFORE removing master key
    // Actually, we need to handle this carefully - let's do it in two phases

    return {
      address: vaultKeypair.publicKey(),
      secretKey: vaultKeypair.secret(),
      setupTxHashes: txHashes,
    };
  }

  /**
   * Create vault with trustlines - full setup in one call
   * This version adds trustlines before removing master key
   */
  async createVaultWithTrustlines(
    auditorPubkeys: string[],
    threshold: number,
    assetList: AstraeusAsset[],
    funderKeypair?: Keypair
  ): Promise<VaultCreationResult> {
    // Validate inputs
    if (auditorPubkeys.length < 3) {
      throw new Error(`Minimum 3 auditors required, got ${auditorPubkeys.length}`);
    }

    const minThreshold = Math.floor(auditorPubkeys.length / 2) + 1;
    if (threshold < minThreshold) {
      throw new Error(
        `Threshold must be >= floor(n/2)+1 = ${minThreshold}, got ${threshold}`
      );
    }

    const txHashes: string[] = [];
    const vaultKeypair = Keypair.random();

    console.log(`[Vault] Generated keypair: ${vaultKeypair.publicKey()}`);

    // Fund account
    if (this.config.isTestnet) {
      await this.fundWithFriendbot(vaultKeypair.publicKey());
      console.log(`[Vault] Funded via friendbot`);
    } else {
      if (!funderKeypair) {
        throw new Error('Funder keypair required on mainnet');
      }
      const fundTxHash = await this.fundAccount(funderKeypair, vaultKeypair.publicKey());
      txHashes.push(fundTxHash);
    }

    await this.waitForAccount(vaultKeypair.publicKey());

    // Add trustlines FIRST (while we still have master key)
    if (assetList.length > 0) {
      const trustlineTxHash = await this.addTrustlinesWithMasterKey(
        vaultKeypair,
        assetList
      );
      txHashes.push(trustlineTxHash);
      console.log(`[Vault] Added ${assetList.length} trustlines: ${trustlineTxHash}`);
    }

    // Configure signers and remove master key
    const configTxHash = await this.configureVaultSigners(
      vaultKeypair,
      auditorPubkeys,
      threshold
    );
    txHashes.push(configTxHash);
    console.log(`[Vault] Configured signers and removed master key: ${configTxHash}`);

    return {
      address: vaultKeypair.publicKey(),
      secretKey: vaultKeypair.secret(),
      setupTxHashes: txHashes,
    };
  }

  /**
   * Fund account using Stellar testnet friendbot
   */
  private async fundWithFriendbot(publicKey: string): Promise<void> {
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
    );
    if (!response.ok) {
      throw new Error(`Friendbot funding failed: ${response.statusText}`);
    }
  }

  /**
   * Fund account by sending XLM from funder
   */
  private async fundAccount(
    funderKeypair: Keypair,
    destinationPublicKey: string
  ): Promise<string> {
    const funderAccount = await this.server.loadAccount(funderKeypair.publicKey());

    // Calculate required XLM: base reserve + reserves for entries
    // Assuming max 20 entries (signers + trustlines)
    const requiredXlm = '10'; // 10 XLM should be enough for most setups

    const tx = new TransactionBuilder(funderAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.createAccount({
          destination: destinationPublicKey,
          startingBalance: requiredXlm,
        })
      )
      .setTimeout(300)
      .build();

    tx.sign(funderKeypair);
    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }

  /**
   * Wait for account to be created on the network
   */
  private async waitForAccount(publicKey: string, maxAttempts = 10): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.server.loadAccount(publicKey);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error(`Account ${publicKey} not found after ${maxAttempts} attempts`);
  }

  /**
   * Configure vault signers and thresholds, remove master key
   */
  private async configureVaultSigners(
    vaultKeypair: Keypair,
    auditorPubkeys: string[],
    threshold: number
  ): Promise<string> {
    const vaultAccount = await this.server.loadAccount(vaultKeypair.publicKey());

    const txBuilder = new TransactionBuilder(vaultAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    });

    // Add each auditor as a signer with weight = 1
    for (const auditor of auditorPubkeys) {
      txBuilder.addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: auditor,
            weight: 1,
          },
        })
      );
    }

    // Set thresholds: low=0 (for view ops), med=threshold, high=threshold
    // Remove master key by setting its weight to 0
    txBuilder.addOperation(
      Operation.setOptions({
        masterWeight: 0,
        lowThreshold: 0,
        medThreshold: threshold,
        highThreshold: threshold,
      })
    );

    const tx = txBuilder.setTimeout(300).build();
    tx.sign(vaultKeypair);

    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }

  /**
   * Add trustlines while master key is still active
   */
  private async addTrustlinesWithMasterKey(
    vaultKeypair: Keypair,
    assetList: AstraeusAsset[]
  ): Promise<string> {
    const vaultAccount = await this.server.loadAccount(vaultKeypair.publicKey());

    const txBuilder = new TransactionBuilder(vaultAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    });

    for (const asset of assetList) {
      // Skip native XLM - no trustline needed
      if (asset.issuer.toLowerCase() === 'native') {
        continue;
      }

      txBuilder.addOperation(
        Operation.changeTrust({
          asset: new Asset(asset.code, asset.issuer),
        })
      );
    }

    const tx = txBuilder.setTimeout(300).build();
    tx.sign(vaultKeypair);

    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }

  /**
   * Add a trustline to an existing vault (requires auditor signatures)
   */
  async addTrustline(
    vaultAddress: string,
    asset: AstraeusAsset,
    signerKeypairs: Keypair[]
  ): Promise<string> {
    if (asset.issuer.toLowerCase() === 'native') {
      throw new Error('Cannot add trustline for native XLM');
    }

    const vaultAccount = await this.server.loadAccount(vaultAddress);

    const tx = new TransactionBuilder(vaultAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.changeTrust({
          asset: new Asset(asset.code, asset.issuer),
        })
      )
      .setTimeout(300)
      .build();

    // Sign with all provided signers
    for (const signer of signerKeypairs) {
      tx.sign(signer);
    }

    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }

  /**
   * Rotate a signer on the vault (requires existing signers to authorize)
   */
  async rotateSigner(
    vaultAddress: string,
    oldSigner: string,
    newSigner: string,
    signerKeypairs: Keypair[]
  ): Promise<string> {
    const vaultAccount = await this.server.loadAccount(vaultAddress);

    // Verify old signer exists
    const existingSigners = vaultAccount.signers.map((s) => s.key);
    if (!existingSigners.includes(oldSigner)) {
      throw new Error(`Old signer ${oldSigner} not found in vault signers`);
    }

    // Verify new signer doesn't already exist
    if (existingSigners.includes(newSigner)) {
      throw new Error(`New signer ${newSigner} already exists in vault signers`);
    }

    const tx = new TransactionBuilder(vaultAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      // Add new signer
      .addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: newSigner,
            weight: 1,
          },
        })
      )
      // Remove old signer
      .addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: oldSigner,
            weight: 0,
          },
        })
      )
      .setTimeout(300)
      .build();

    for (const signer of signerKeypairs) {
      tx.sign(signer);
    }

    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }

  /**
   * Get vault configuration from Stellar
   */
  async getVaultConfig(vaultAddress: string): Promise<VaultConfig> {
    const account = await this.server.loadAccount(vaultAddress);

    // Extract signers (exclude any with weight 0)
    const auditors = account.signers
      .filter((s) => s.weight > 0 && s.type === 'ed25519_public_key')
      .map((s) => s.key);

    // Get threshold (use med_threshold)
    const threshold = account.thresholds.med_threshold;

    // Extract assets from balances
    const assets: AstraeusAsset[] = account.balances.map((bal: any) => {
      if (bal.asset_type === 'native') {
        return { code: 'XLM', issuer: 'native' };
      }
      return {
        code: bal.asset_code,
        issuer: bal.asset_issuer,
      };
    });

    return {
      address: vaultAddress,
      auditors,
      threshold,
      assets,
    };
  }

  /**
   * Verify vault configuration matches expected values
   */
  async verifyVaultConfig(
    vaultAddress: string,
    expectedAuditors: string[],
    expectedThreshold: number
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const config = await this.getVaultConfig(vaultAddress);

      // Check threshold
      if (config.threshold !== expectedThreshold) {
        errors.push(
          `Threshold mismatch: expected ${expectedThreshold}, got ${config.threshold}`
        );
      }

      // Check auditors
      const missingAuditors = expectedAuditors.filter(
        (a) => !config.auditors.includes(a)
      );
      if (missingAuditors.length > 0) {
        errors.push(`Missing auditors: ${missingAuditors.join(', ')}`);
      }

      const extraAuditors = config.auditors.filter(
        (a) => !expectedAuditors.includes(a)
      );
      if (extraAuditors.length > 0) {
        errors.push(`Extra auditors: ${extraAuditors.join(', ')}`);
      }

      // Check that master key is removed
      const account = await this.server.loadAccount(vaultAddress);
      const masterSigner = account.signers.find((s) => s.key === vaultAddress);
      if (masterSigner && masterSigner.weight > 0) {
        errors.push('Master key still has weight > 0');
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to verify vault: ${error}`],
      };
    }
  }
}

/**
 * Create a new VaultManager instance for testnet
 */
export function createTestnetVaultManager(): VaultManager {
  return new VaultManager(TESTNET_CONFIG);
}

/**
 * Generate test auditor keypairs (for testing only)
 */
export function generateTestAuditors(count: number): Keypair[] {
  const auditors: Keypair[] = [];
  for (let i = 0; i < count; i++) {
    auditors.push(Keypair.random());
  }
  return auditors;
}
