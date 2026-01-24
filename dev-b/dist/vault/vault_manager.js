"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VaultManager = void 0;
exports.createTestnetVaultManager = createTestnetVaultManager;
exports.generateTestAuditors = generateTestAuditors;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const types_1 = require("../interfaces/types");
/**
 * Vault Manager class for creating and managing Stellar multisig vaults
 */
class VaultManager {
    server;
    networkPassphrase;
    config;
    constructor(config = types_1.TESTNET_CONFIG) {
        this.config = config;
        this.server = new stellar_sdk_1.Horizon.Server(config.horizonUrl);
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
    async createVault(auditorPubkeys, threshold, assetList, funderKeypair) {
        // Validate inputs
        if (auditorPubkeys.length < 3) {
            throw new Error(`Minimum 3 auditors required, got ${auditorPubkeys.length}`);
        }
        const minThreshold = Math.floor(auditorPubkeys.length / 2) + 1;
        if (threshold < minThreshold) {
            throw new Error(`Threshold must be >= floor(n/2)+1 = ${minThreshold}, got ${threshold}`);
        }
        if (threshold > auditorPubkeys.length) {
            throw new Error(`Threshold ${threshold} exceeds auditor count ${auditorPubkeys.length}`);
        }
        // Validate all auditor keys are valid Stellar public keys
        for (const pubkey of auditorPubkeys) {
            if (!pubkey.startsWith('G')) {
                throw new Error(`Invalid auditor public key format: ${pubkey}`);
            }
        }
        const txHashes = [];
        // Step 1: Generate new keypair for vault
        const vaultKeypair = stellar_sdk_1.Keypair.random();
        console.log(`Generated vault keypair: ${vaultKeypair.publicKey()}`);
        // Step 2: Fund account
        if (this.config.isTestnet) {
            await this.fundWithFriendbot(vaultKeypair.publicKey());
            console.log(`Funded vault via friendbot`);
        }
        else {
            if (!funderKeypair) {
                throw new Error('Funder keypair required on mainnet');
            }
            const fundTxHash = await this.fundAccount(funderKeypair, vaultKeypair.publicKey());
            txHashes.push(fundTxHash);
            console.log(`Funded vault via funder: ${fundTxHash}`);
        }
        // Wait for account to be created
        await this.waitForAccount(vaultKeypair.publicKey());
        // Step 3-5: Configure signers and thresholds
        const configTxHash = await this.configureVaultSigners(vaultKeypair, auditorPubkeys, threshold);
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
    async createVaultWithTrustlines(auditorPubkeys, threshold, assetList, funderKeypair) {
        // Validate inputs
        if (auditorPubkeys.length < 3) {
            throw new Error(`Minimum 3 auditors required, got ${auditorPubkeys.length}`);
        }
        const minThreshold = Math.floor(auditorPubkeys.length / 2) + 1;
        if (threshold < minThreshold) {
            throw new Error(`Threshold must be >= floor(n/2)+1 = ${minThreshold}, got ${threshold}`);
        }
        const txHashes = [];
        const vaultKeypair = stellar_sdk_1.Keypair.random();
        console.log(`[Vault] Generated keypair: ${vaultKeypair.publicKey()}`);
        // Fund account
        if (this.config.isTestnet) {
            await this.fundWithFriendbot(vaultKeypair.publicKey());
            console.log(`[Vault] Funded via friendbot`);
        }
        else {
            if (!funderKeypair) {
                throw new Error('Funder keypair required on mainnet');
            }
            const fundTxHash = await this.fundAccount(funderKeypair, vaultKeypair.publicKey());
            txHashes.push(fundTxHash);
        }
        await this.waitForAccount(vaultKeypair.publicKey());
        // Add trustlines FIRST (while we still have master key)
        if (assetList.length > 0) {
            const trustlineTxHash = await this.addTrustlinesWithMasterKey(vaultKeypair, assetList);
            txHashes.push(trustlineTxHash);
            console.log(`[Vault] Added ${assetList.length} trustlines: ${trustlineTxHash}`);
        }
        // Configure signers and remove master key
        const configTxHash = await this.configureVaultSigners(vaultKeypair, auditorPubkeys, threshold);
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
    async fundWithFriendbot(publicKey) {
        const response = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
        if (!response.ok) {
            throw new Error(`Friendbot funding failed: ${response.statusText}`);
        }
    }
    /**
     * Fund account by sending XLM from funder
     */
    async fundAccount(funderKeypair, destinationPublicKey) {
        const funderAccount = await this.server.loadAccount(funderKeypair.publicKey());
        // Calculate required XLM: base reserve + reserves for entries
        // Assuming max 20 entries (signers + trustlines)
        const requiredXlm = '10'; // 10 XLM should be enough for most setups
        const tx = new stellar_sdk_1.TransactionBuilder(funderAccount, {
            fee: '100',
            networkPassphrase: this.networkPassphrase,
        })
            .addOperation(stellar_sdk_1.Operation.createAccount({
            destination: destinationPublicKey,
            startingBalance: requiredXlm,
        }))
            .setTimeout(300)
            .build();
        tx.sign(funderKeypair);
        const result = await this.server.submitTransaction(tx);
        return result.hash;
    }
    /**
     * Wait for account to be created on the network
     */
    async waitForAccount(publicKey, maxAttempts = 10) {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                await this.server.loadAccount(publicKey);
                return;
            }
            catch {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
        throw new Error(`Account ${publicKey} not found after ${maxAttempts} attempts`);
    }
    /**
     * Configure vault signers and thresholds, remove master key
     */
    async configureVaultSigners(vaultKeypair, auditorPubkeys, threshold) {
        const vaultAccount = await this.server.loadAccount(vaultKeypair.publicKey());
        const txBuilder = new stellar_sdk_1.TransactionBuilder(vaultAccount, {
            fee: '100',
            networkPassphrase: this.networkPassphrase,
        });
        // Add each auditor as a signer with weight = 1
        for (const auditor of auditorPubkeys) {
            txBuilder.addOperation(stellar_sdk_1.Operation.setOptions({
                signer: {
                    ed25519PublicKey: auditor,
                    weight: 1,
                },
            }));
        }
        // Set thresholds: low=0 (for view ops), med=threshold, high=threshold
        // Remove master key by setting its weight to 0
        txBuilder.addOperation(stellar_sdk_1.Operation.setOptions({
            masterWeight: 0,
            lowThreshold: 0,
            medThreshold: threshold,
            highThreshold: threshold,
        }));
        const tx = txBuilder.setTimeout(300).build();
        tx.sign(vaultKeypair);
        const result = await this.server.submitTransaction(tx);
        return result.hash;
    }
    /**
     * Add trustlines while master key is still active
     */
    async addTrustlinesWithMasterKey(vaultKeypair, assetList) {
        const vaultAccount = await this.server.loadAccount(vaultKeypair.publicKey());
        const txBuilder = new stellar_sdk_1.TransactionBuilder(vaultAccount, {
            fee: '100',
            networkPassphrase: this.networkPassphrase,
        });
        for (const asset of assetList) {
            // Skip native XLM - no trustline needed
            if (asset.issuer.toLowerCase() === 'native') {
                continue;
            }
            txBuilder.addOperation(stellar_sdk_1.Operation.changeTrust({
                asset: new stellar_sdk_1.Asset(asset.code, asset.issuer),
            }));
        }
        const tx = txBuilder.setTimeout(300).build();
        tx.sign(vaultKeypair);
        const result = await this.server.submitTransaction(tx);
        return result.hash;
    }
    /**
     * Add a trustline to an existing vault (requires auditor signatures)
     */
    async addTrustline(vaultAddress, asset, signerKeypairs) {
        if (asset.issuer.toLowerCase() === 'native') {
            throw new Error('Cannot add trustline for native XLM');
        }
        const vaultAccount = await this.server.loadAccount(vaultAddress);
        const tx = new stellar_sdk_1.TransactionBuilder(vaultAccount, {
            fee: '100',
            networkPassphrase: this.networkPassphrase,
        })
            .addOperation(stellar_sdk_1.Operation.changeTrust({
            asset: new stellar_sdk_1.Asset(asset.code, asset.issuer),
        }))
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
    async rotateSigner(vaultAddress, oldSigner, newSigner, signerKeypairs) {
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
        const tx = new stellar_sdk_1.TransactionBuilder(vaultAccount, {
            fee: '100',
            networkPassphrase: this.networkPassphrase,
        })
            // Add new signer
            .addOperation(stellar_sdk_1.Operation.setOptions({
            signer: {
                ed25519PublicKey: newSigner,
                weight: 1,
            },
        }))
            // Remove old signer
            .addOperation(stellar_sdk_1.Operation.setOptions({
            signer: {
                ed25519PublicKey: oldSigner,
                weight: 0,
            },
        }))
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
    async getVaultConfig(vaultAddress) {
        const account = await this.server.loadAccount(vaultAddress);
        // Extract signers (exclude any with weight 0)
        const auditors = account.signers
            .filter((s) => s.weight > 0 && s.type === 'ed25519_public_key')
            .map((s) => s.key);
        // Get threshold (use med_threshold)
        const threshold = account.thresholds.med_threshold;
        // Extract assets from balances
        const assets = account.balances.map((bal) => {
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
    async verifyVaultConfig(vaultAddress, expectedAuditors, expectedThreshold) {
        const errors = [];
        try {
            const config = await this.getVaultConfig(vaultAddress);
            // Check threshold
            if (config.threshold !== expectedThreshold) {
                errors.push(`Threshold mismatch: expected ${expectedThreshold}, got ${config.threshold}`);
            }
            // Check auditors
            const missingAuditors = expectedAuditors.filter((a) => !config.auditors.includes(a));
            if (missingAuditors.length > 0) {
                errors.push(`Missing auditors: ${missingAuditors.join(', ')}`);
            }
            const extraAuditors = config.auditors.filter((a) => !expectedAuditors.includes(a));
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
        }
        catch (error) {
            return {
                valid: false,
                errors: [`Failed to verify vault: ${error}`],
            };
        }
    }
}
exports.VaultManager = VaultManager;
/**
 * Create a new VaultManager instance for testnet
 */
function createTestnetVaultManager() {
    return new VaultManager(types_1.TESTNET_CONFIG);
}
/**
 * Generate test auditor keypairs (for testing only)
 */
function generateTestAuditors(count) {
    const auditors = [];
    for (let i = 0; i < count; i++) {
        auditors.push(stellar_sdk_1.Keypair.random());
    }
    return auditors;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmF1bHRfbWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy92YXVsdC92YXVsdF9tYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7O0dBU0c7OztBQTJnQkgsOERBRUM7QUFLRCxvREFNQztBQXRoQkQsc0RBUzhCO0FBQzlCLCtDQU02QjtBQWM3Qjs7R0FFRztBQUNILE1BQWEsWUFBWTtJQUNmLE1BQU0sQ0FBaUI7SUFDdkIsaUJBQWlCLENBQVM7SUFDMUIsTUFBTSxDQUFnQjtJQUU5QixZQUFZLFNBQXdCLHNCQUFjO1FBQ2hELElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxxQkFBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQztJQUNwRCxDQUFDO0lBRUQ7Ozs7Ozs7Ozs7Ozs7OztPQWVHO0lBQ0gsS0FBSyxDQUFDLFdBQVcsQ0FDZixjQUF3QixFQUN4QixTQUFpQixFQUNqQixTQUEwQixFQUMxQixhQUF1QjtRQUV2QixrQkFBa0I7UUFDbEIsSUFBSSxjQUFjLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzlCLE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLGNBQWMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQy9FLENBQUM7UUFFRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQy9ELElBQUksU0FBUyxHQUFHLFlBQVksRUFBRSxDQUFDO1lBQzdCLE1BQU0sSUFBSSxLQUFLLENBQ2IsdUNBQXVDLFlBQVksU0FBUyxTQUFTLEVBQUUsQ0FDeEUsQ0FBQztRQUNKLENBQUM7UUFFRCxJQUFJ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SyxFQUFFLENBQUM7YUFDN0MsQ0FBQztRQUNKLENBQUM7SUFDSCxDQUFDO0NBQ0Y7QUFuZUQsb0NBbWVDO0FBRUQ7O0dBRUc7QUFDSCxTQUFnQix5QkFBeUI7SUFDdkMsT0FBTyxJQUFJLFlBQVksQ0FBQyxzQkFBYyxDQUFDLENBQUM7QUFDMUMsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBZ0Isb0JBQW9CLENBQUMsS0FBYTtJQUNoRCxNQUFNLFFBQVEsR0FBYyxFQUFFLENBQUM7SUFDL0IsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQy9CLFFBQVEsQ0FBQyxJQUFJLENBQUMscUJBQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFDRCxPQUFPLFFBQVEsQ0FBQztBQUNsQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBBU1RSQUVVUyAtIFZhdWx0IE1hbmFnZXJcbiAqXG4gKiBDcmVhdGVzIGFuZCBtYW5hZ2VzIFN0ZWxsYXIgbXVsdGlzaWcgdmF1bHRzIGZvciBzdWJuZXQgdHJlYXN1cmllcy5cbiAqIEEgdmF1bHQgaXMgYSBTdGVsbGFyIGFjY291bnQgd2l0aDpcbiAqIC0gTXVsdGlwbGUgYXVkaXRvciBzaWduZXJzXG4gKiAtIFRocmVzaG9sZC1iYXNlZCBhdXRob3JpemF0aW9uXG4gKiAtIE5vIG1hc3RlciBrZXkgKGZ1bGx5IGRlY2VudHJhbGl6ZWQpXG4gKiAtIFJlcXVpcmVkIHRydXN0bGluZXMgZm9yIHdoaXRlbGlzdGVkIGFzc2V0c1xuICovXG5cbmltcG9ydCB7XG4gIEtleXBhaXIsXG4gIEhvcml6b24sXG4gIFRyYW5zYWN0aW9uQnVpbGRlcixcbiAgTmV0d29ya3MsXG4gIE9wZXJhdGlvbixcbiAgQXNzZXQsXG4gIE1lbW8sXG4gIEFjY291bnQsXG59IGZyb20gJ0BzdGVsbGFyL3N0ZWxsYXItc2RrJztcbmltcG9ydCB7XG4gIEFzc2V0IGFzIEFzdHJhZXVzQXNzZXQsXG4gIFZhdWx0Q29uZmlnLFxuICBOZXR3b3JrQ29uZmlnLFxuICBURVNUTkVUX0NPTkZJRyxcbiAgU1RFTExBUl9DT05TVEFOVFMsXG59IGZyb20gJy4uL2ludGVyZmFjZXMvdHlwZXMnO1xuXG4vKipcbiAqIFJlc3VsdCBvZiB2YXVsdCBjcmVhdGlvblxuICovXG5leHBvcnQgaW50ZXJmYWNlIFZhdWx0Q3JlYXRpb25SZXN1bHQge1xuICAvKiogVmF1bHQgcHVibGljIGtleSAoRy4uLiBhZGRyZXNzKSAqL1xuICBhZGRyZXNzOiBzdHJpbmc7XG4gIC8qKiBTZWNyZXQga2V5IChTLi4uKSAtIFNUT1JFIFNFQ1VSRUxZLCBuZWVkZWQgb25seSBmb3IgaW5pdGlhbCBzZXR1cCAqL1xuICBzZWNyZXRLZXk6IHN0cmluZztcbiAgLyoqIFRyYW5zYWN0aW9uIGhhc2hlcyBmcm9tIHNldHVwICovXG4gIHNldHVwVHhIYXNoZXM6IHN0cmluZ1tdO1xufVxuXG4vKipcbiAqIFZhdWx0IE1hbmFnZXIgY2xhc3MgZm9yIGNyZWF0aW5nIGFuZCBtYW5hZ2luZyBTdGVsbGFyIG11bHRpc2lnIHZhdWx0c1xuICovXG5leHBvcnQgY2xhc3MgVmF1bHRNYW5hZ2VyIHtcbiAgcHJpdmF0ZSBzZXJ2ZXI6IEhvcml6b24uU2VydmVyO1xuICBwcml2YXRlIG5ldHdvcmtQYXNzcGhyYXNlOiBzdHJpbmc7XG4gIHByaXZhdGUgY29uZmlnOiBOZXR3b3JrQ29uZmlnO1xuXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogTmV0d29ya0NvbmZpZyA9IFRFU1RORVRfQ09ORklHKSB7XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgdGhpcy5zZXJ2ZXIgPSBuZXcgSG9yaXpvbi5TZXJ2ZXIoY29uZmlnLmhvcml6b25VcmwpO1xuICAgIHRoaXMubmV0d29ya1Bhc3NwaHJhc2UgPSBjb25maWcubmV0d29ya1Bhc3NwaHJhc2U7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IG11bHRpc2lnIHZhdWx0IGZvciBhIHN1Ym5ldFxuICAgKlxuICAgKiBTdGVwczpcbiAgICogMS4gR2VuZXJhdGUgbmV3IGtleXBhaXIgZm9yIHZhdWx0XG4gICAqIDIuIEZ1bmQgYWNjb3VudCAodGVzdG5ldDogZnJpZW5kYm90LCBtYWlubmV0OiByZXF1aXJlcyBYTE0pXG4gICAqIDMuIEFkZCBhdWRpdG9ycyBhcyBzaWduZXJzXG4gICAqIDQuIFNldCB0aHJlc2hvbGRzXG4gICAqIDUuIFJlbW92ZSBtYXN0ZXIga2V5XG4gICAqIDYuIEFkZCB0cnVzdGxpbmVzXG4gICAqXG4gICAqIEBwYXJhbSBhdWRpdG9yUHVia2V5cyAtIEVkMjU1MTkgcHVibGljIGtleXMgb2YgYXVkaXRvcnMgKEcuLi4gYWRkcmVzc2VzKVxuICAgKiBAcGFyYW0gdGhyZXNob2xkIC0gUmVxdWlyZWQgc2lnbmF0dXJlIHRocmVzaG9sZCAobXVzdCBiZSA+PSBmbG9vcihuLzIpKzEpXG4gICAqIEBwYXJhbSBhc3NldExpc3QgLSBBc3NldHMgdG8gYWRkIHRydXN0bGluZXMgZm9yXG4gICAqIEBwYXJhbSBmdW5kZXJLZXlwYWlyIC0gT3B0aW9uYWwga2V5cGFpciB0byBmdW5kIHRoZSB2YXVsdCAocmVxdWlyZWQgb24gbWFpbm5ldClcbiAgICovXG4gIGFzeW5jIGNyZWF0ZVZhdWx0KFxuICAgIGF1ZGl0b3JQdWJrZXlzOiBzdHJpbmdbXSxcbiAgICB0aHJlc2hvbGQ6IG51bWJlcixcbiAgICBhc3NldExpc3Q6IEFzdHJhZXVzQXNzZXRbXSxcbiAgICBmdW5kZXJLZXlwYWlyPzogS2V5cGFpclxuICApOiBQcm9taXNlPFZhdWx0Q3JlYXRpb25SZXN1bHQ+IHtcbiAgICAvLyBWYWxpZGF0ZSBpbnB1dHNcbiAgICBpZiAoYXVkaXRvclB1YmtleXMubGVuZ3RoIDwgMykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBNaW5pbXVtIDMgYXVkaXRvcnMgcmVxdWlyZWQsIGdvdCAke2F1ZGl0b3JQdWJrZXlzLmxlbmd0aH1gKTtcbiAgICB9XG5cbiAgICBjb25zdCBtaW5UaHJlc2hvbGQgPSBNYXRoLmZsb29yKGF1ZGl0b3JQdWJrZXlzLmxlbmd0aCAvIDIpICsgMTtcbiAgICBpZiAodGhyZXNob2xkIDwgbWluVGhyZXNob2xkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBUaHJlc2hvbGQgbXVzdCBiZSA+PSBmbG9vcihuLzIpKzEgPSAke21pblRocmVzaG9sZH0sIGdvdCAke3RocmVzaG9sZH1gXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh0aHJlc2hvbGQgPiBhdWRpdG9yUHVia2V5cy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYFRocmVzaG9sZCAke3RocmVzaG9sZH0gZXhjZWVkcyBhdWRpdG9yIGNvdW50ICR7YXVkaXRvclB1YmtleXMubGVuZ3RofWBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgYWxsIGF1ZGl0b3Iga2V5cyBhcmUgdmFsaWQgU3RlbGxhciBwdWJsaWMga2V5c1xuICAgIGZvciAoY29uc3QgcHVia2V5IG9mIGF1ZGl0b3JQdWJrZXlzKSB7XG4gICAgICBpZiAoIXB1YmtleS5zdGFydHNXaXRoKCdHJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGF1ZGl0b3IgcHVibGljIGtleSBmb3JtYXQ6ICR7cHVia2V5fWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHR4SGFzaGVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgLy8gU3RlcCAxOiBHZW5lcmF0ZSBuZXcga2V5cGFpciBmb3IgdmF1bHRcbiAgICBjb25zdCB2YXVsdEtleXBhaXIgPSBLZXlwYWlyLnJhbmRvbSgpO1xuICAgIGNvbnNvbGUubG9nKGBHZW5lcmF0ZWQgdmF1bHQga2V5cGFpcjogJHt2YXVsdEtleXBhaXIucHVibGljS2V5KCl9YCk7XG5cbiAgICAvLyBTdGVwIDI6IEZ1bmQgYWNjb3VudFxuICAgIGlmICh0aGlzLmNvbmZpZy5pc1Rlc3RuZXQpIHtcbiAgICAgIGF3YWl0IHRoaXMuZnVuZFdpdGhGcmllbmRib3QodmF1bHRLZXlwYWlyLnB1YmxpY0tleSgpKTtcbiAgICAgIGNvbnNvbGUubG9nKGBGdW5kZWQgdmF1bHQgdmlhIGZyaWVuZGJvdGApO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIWZ1bmRlcktleXBhaXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGdW5kZXIga2V5cGFpciByZXF1aXJlZCBvbiBtYWlubmV0Jyk7XG4gICAgICB9XG4gICAgICBjb25zdCBmdW5kVHhIYXNoID0gYXdhaXQgdGhpcy5mdW5kQWNjb3VudChcbiAgICAgICAgZnVuZGVyS2V5cGFpcixcbiAgICAgICAgdmF1bHRLZXlwYWlyLnB1YmxpY0tleSgpXG4gICAgICApO1xuICAgICAgdHhIYXNoZXMucHVzaChmdW5kVHhIYXNoKTtcbiAgICAgIGNvbnNvbGUubG9nKGBGdW5kZWQgdmF1bHQgdmlhIGZ1bmRlcjogJHtmdW5kVHhIYXNofWApO1xuICAgIH1cblxuICAgIC8vIFdhaXQgZm9yIGFjY291bnQgdG8gYmUgY3JlYXRlZFxuICAgIGF3YWl0IHRoaXMud2FpdEZvckFjY291bnQodmF1bHRLZXlwYWlyLnB1YmxpY0tleSgpKTtcblxuICAgIC8vIFN0ZXAgMy01OiBDb25maWd1cmUgc2lnbmVycyBhbmQgdGhyZXNob2xkc1xuICAgIGNvbnN0IGNvbmZpZ1R4SGFzaCA9IGF3YWl0IHRoaXMuY29uZmlndXJlVmF1bHRTaWduZXJzKFxuICAgICAgdmF1bHRLZXlwYWlyLFxuICAgICAgYXVkaXRvclB1YmtleXMsXG4gICAgICB0aHJlc2hvbGRcbiAgICApO1xuICAgIHR4SGFzaGVzLnB1c2goY29uZmlnVHhIYXNoKTtcbiAgICBjb25zb2xlLmxvZyhgQ29uZmlndXJlZCB2YXVsdCBzaWduZXJzOiAke2NvbmZpZ1R4SGFzaH1gKTtcblxuICAgIC8vIFN0ZXAgNjogQWRkIHRydXN0bGluZXMgKHJlcXVpcmVzIGF1ZGl0b3Igc2lnbmF0dXJlcyBub3cpXG4gICAgLy8gRm9yIGluaXRpYWwgc2V0dXAsIHdlIGFkZCB0cnVzdGxpbmVzIEJFRk9SRSByZW1vdmluZyBtYXN0ZXIga2V5XG4gICAgLy8gQWN0dWFsbHksIHdlIG5lZWQgdG8gaGFuZGxlIHRoaXMgY2FyZWZ1bGx5IC0gbGV0J3MgZG8gaXQgaW4gdHdvIHBoYXNlc1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGFkZHJlc3M6IHZhdWx0S2V5cGFpci5wdWJsaWNLZXkoKSxcbiAgICAgIHNlY3JldEtleTogdmF1bHRLZXlwYWlyLnNlY3JldCgpLFxuICAgICAgc2V0dXBUeEhhc2hlczogdHhIYXNoZXMsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgdmF1bHQgd2l0aCB0cnVzdGxpbmVzIC0gZnVsbCBzZXR1cCBpbiBvbmUgY2FsbFxuICAgKiBUaGlzIHZlcnNpb24gYWRkcyB0cnVzdGxpbmVzIGJlZm9yZSByZW1vdmluZyBtYXN0ZXIga2V5XG4gICAqL1xuICBhc3luYyBjcmVhdGVWYXVsdFdpdGhUcnVzdGxpbmVzKFxuICAgIGF1ZGl0b3JQdWJrZXlzOiBzdHJpbmdbXSxcbiAgICB0aHJlc2hvbGQ6IG51bWJlcixcbiAgICBhc3NldExpc3Q6IEFzdHJhZXVzQXNzZXRbXSxcbiAgICBmdW5kZXJLZXlwYWlyPzogS2V5cGFpclxuICApOiBQcm9taXNlPFZhdWx0Q3JlYXRpb25SZXN1bHQ+IHtcbiAgICAvLyBWYWxpZGF0ZSBpbnB1dHNcbiAgICBpZiAoYXVkaXRvclB1YmtleXMubGVuZ3RoIDwgMykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBNaW5pbXVtIDMgYXVkaXRvcnMgcmVxdWlyZWQsIGdvdCAke2F1ZGl0b3JQdWJrZXlzLmxlbmd0aH1gKTtcbiAgICB9XG5cbiAgICBjb25zdCBtaW5UaHJlc2hvbGQgPSBNYXRoLmZsb29yKGF1ZGl0b3JQdWJrZXlzLmxlbmd0aCAvIDIpICsgMTtcbiAgICBpZiAodGhyZXNob2xkIDwgbWluVGhyZXNob2xkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBUaHJlc2hvbGQgbXVzdCBiZSA+PSBmbG9vcihuLzIpKzEgPSAke21pblRocmVzaG9sZH0sIGdvdCAke3RocmVzaG9sZH1gXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHR4SGFzaGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IHZhdWx0S2V5cGFpciA9IEtleXBhaXIucmFuZG9tKCk7XG5cbiAgICBjb25zb2xlLmxvZyhgW1ZhdWx0XSBHZW5lcmF0ZWQga2V5cGFpcjogJHt2YXVsdEtleXBhaXIucHVibGljS2V5KCl9YCk7XG5cbiAgICAvLyBGdW5kIGFjY291bnRcbiAgICBpZiAodGhpcy5jb25maWcuaXNUZXN0bmV0KSB7XG4gICAgICBhd2FpdCB0aGlzLmZ1bmRXaXRoRnJpZW5kYm90KHZhdWx0S2V5cGFpci5wdWJsaWNLZXkoKSk7XG4gICAgICBjb25zb2xlLmxvZyhgW1ZhdWx0XSBGdW5kZWQgdmlhIGZyaWVuZGJvdGApO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoIWZ1bmRlcktleXBhaXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGdW5kZXIga2V5cGFpciByZXF1aXJlZCBvbiBtYWlubmV0Jyk7XG4gICAgICB9XG4gICAgICBjb25zdCBmdW5kVHhIYXNoID0gYXdhaXQgdGhpcy5mdW5kQWNjb3VudChmdW5kZXJLZXlwYWlyLCB2YXVsdEtleXBhaXIucHVibGljS2V5KCkpO1xuICAgICAgdHhIYXNoZXMucHVzaChmdW5kVHhIYXNoKTtcbiAgICB9XG5cbiAgICBhd2FpdCB0aGlzLndhaXRGb3JBY2NvdW50KHZhdWx0S2V5cGFpci5wdWJsaWNLZXkoKSk7XG5cbiAgICAvLyBBZGQgdHJ1c3RsaW5lcyBGSVJTVCAod2hpbGUgd2Ugc3RpbGwgaGF2ZSBtYXN0ZXIga2V5KVxuICAgIGlmIChhc3NldExpc3QubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgdHJ1c3RsaW5lVHhIYXNoID0gYXdhaXQgdGhpcy5hZGRUcnVzdGxpbmVzV2l0aE1hc3RlcktleShcbiAgICAgICAgdmF1bHRLZXlwYWlyLFxuICAgICAgICBhc3NldExpc3RcbiAgICAgICk7XG4gICAgICB0eEhhc2hlcy5wdXNoKHRydXN0bGluZVR4SGFzaCk7XG4gICAgICBjb25zb2xlLmxvZyhgW1ZhdWx0XSBBZGRlZCAke2Fzc2V0TGlzdC5sZW5ndGh9IHRydXN0bGluZXM6ICR7dHJ1c3RsaW5lVHhIYXNofWApO1xuICAgIH1cblxuICAgIC8vIENvbmZpZ3VyZSBzaWduZXJzIGFuZCByZW1vdmUgbWFzdGVyIGtleVxuICAgIGNvbnN0IGNvbmZpZ1R4SGFzaCA9IGF3YWl0IHRoaXMuY29uZmlndXJlVmF1bHRTaWduZXJzKFxuICAgICAgdmF1bHRLZXlwYWlyLFxuICAgICAgYXVkaXRvclB1YmtleXMsXG4gICAgICB0aHJlc2hvbGRcbiAgICApO1xuICAgIHR4SGFzaGVzLnB1c2goY29uZmlnVHhIYXNoKTtcbiAgICBjb25zb2xlLmxvZyhgW1ZhdWx0XSBDb25maWd1cmVkIHNpZ25lcnMgYW5kIHJlbW92ZWQgbWFzdGVyIGtleTogJHtjb25maWdUeEhhc2h9YCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgYWRkcmVzczogdmF1bHRLZXlwYWlyLnB1YmxpY0tleSgpLFxuICAgICAgc2VjcmV0S2V5OiB2YXVsdEtleXBhaXIuc2VjcmV0KCksXG4gICAgICBzZXR1cFR4SGFzaGVzOiB0eEhhc2hlcyxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEZ1bmQgYWNjb3VudCB1c2luZyBTdGVsbGFyIHRlc3RuZXQgZnJpZW5kYm90XG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGZ1bmRXaXRoRnJpZW5kYm90KHB1YmxpY0tleTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChcbiAgICAgIGBodHRwczovL2ZyaWVuZGJvdC5zdGVsbGFyLm9yZz9hZGRyPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHB1YmxpY0tleSl9YFxuICAgICk7XG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBGcmllbmRib3QgZnVuZGluZyBmYWlsZWQ6ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogRnVuZCBhY2NvdW50IGJ5IHNlbmRpbmcgWExNIGZyb20gZnVuZGVyXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGZ1bmRBY2NvdW50KFxuICAgIGZ1bmRlcktleXBhaXI6IEtleXBhaXIsXG4gICAgZGVzdGluYXRpb25QdWJsaWNLZXk6IHN0cmluZ1xuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IGZ1bmRlckFjY291bnQgPSBhd2FpdCB0aGlzLnNlcnZlci5sb2FkQWNjb3VudChmdW5kZXJLZXlwYWlyLnB1YmxpY0tleSgpKTtcblxuICAgIC8vIENhbGN1bGF0ZSByZXF1aXJlZCBYTE06IGJhc2UgcmVzZXJ2ZSArIHJlc2VydmVzIGZvciBlbnRyaWVzXG4gICAgLy8gQXNzdW1pbmcgbWF4IDIwIGVudHJpZXMgKHNpZ25lcnMgKyB0cnVzdGxpbmVzKVxuICAgIGNvbnN0IHJlcXVpcmVkWGxtID0gJzEwJzsgLy8gMTAgWExNIHNob3VsZCBiZSBlbm91Z2ggZm9yIG1vc3Qgc2V0dXBzXG5cbiAgICBjb25zdCB0eCA9IG5ldyBUcmFuc2FjdGlvbkJ1aWxkZXIoZnVuZGVyQWNjb3VudCwge1xuICAgICAgZmVlOiAnMTAwJyxcbiAgICAgIG5ldHdvcmtQYXNzcGhyYXNlOiB0aGlzLm5ldHdvcmtQYXNzcGhyYXNlLFxuICAgIH0pXG4gICAgICAuYWRkT3BlcmF0aW9uKFxuICAgICAgICBPcGVyYXRpb24uY3JlYXRlQWNjb3VudCh7XG4gICAgICAgICAgZGVzdGluYXRpb246IGRlc3RpbmF0aW9uUHVibGljS2V5LFxuICAgICAgICAgIHN0YXJ0aW5nQmFsYW5jZTogcmVxdWlyZWRYbG0sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuc2V0VGltZW91dCgzMDApXG4gICAgICAuYnVpbGQoKTtcblxuICAgIHR4LnNpZ24oZnVuZGVyS2V5cGFpcik7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zZXJ2ZXIuc3VibWl0VHJhbnNhY3Rpb24odHgpO1xuICAgIHJldHVybiByZXN1bHQuaGFzaDtcbiAgfVxuXG4gIC8qKlxuICAgKiBXYWl0IGZvciBhY2NvdW50IHRvIGJlIGNyZWF0ZWQgb24gdGhlIG5ldHdvcmtcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgd2FpdEZvckFjY291bnQocHVibGljS2V5OiBzdHJpbmcsIG1heEF0dGVtcHRzID0gMTApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1heEF0dGVtcHRzOyBpKyspIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMuc2VydmVyLmxvYWRBY2NvdW50KHB1YmxpY0tleSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAwKSk7XG4gICAgICB9XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcihgQWNjb3VudCAke3B1YmxpY0tleX0gbm90IGZvdW5kIGFmdGVyICR7bWF4QXR0ZW1wdHN9IGF0dGVtcHRzYCk7XG4gIH1cblxuICAvKipcbiAgICogQ29uZmlndXJlIHZhdWx0IHNpZ25lcnMgYW5kIHRocmVzaG9sZHMsIHJlbW92ZSBtYXN0ZXIga2V5XG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGNvbmZpZ3VyZVZhdWx0U2lnbmVycyhcbiAgICB2YXVsdEtleXBhaXI6IEtleXBhaXIsXG4gICAgYXVkaXRvclB1YmtleXM6IHN0cmluZ1tdLFxuICAgIHRocmVzaG9sZDogbnVtYmVyXG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3QgdmF1bHRBY2NvdW50ID0gYXdhaXQgdGhpcy5zZXJ2ZXIubG9hZEFjY291bnQodmF1bHRLZXlwYWlyLnB1YmxpY0tleSgpKTtcblxuICAgIGNvbnN0IHR4QnVpbGRlciA9IG5ldyBUcmFuc2FjdGlvbkJ1aWxkZXIodmF1bHRBY2NvdW50LCB7XG4gICAgICBmZWU6ICcxMDAnLFxuICAgICAgbmV0d29ya1Bhc3NwaHJhc2U6IHRoaXMubmV0d29ya1Bhc3NwaHJhc2UsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgZWFjaCBhdWRpdG9yIGFzIGEgc2lnbmVyIHdpdGggd2VpZ2h0ID0gMVxuICAgIGZvciAoY29uc3QgYXVkaXRvciBvZiBhdWRpdG9yUHVia2V5cykge1xuICAgICAgdHhCdWlsZGVyLmFkZE9wZXJhdGlvbihcbiAgICAgICAgT3BlcmF0aW9uLnNldE9wdGlvbnMoe1xuICAgICAgICAgIHNpZ25lcjoge1xuICAgICAgICAgICAgZWQyNTUxOVB1YmxpY0tleTogYXVkaXRvcixcbiAgICAgICAgICAgIHdlaWdodDogMSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBTZXQgdGhyZXNob2xkczogbG93PTAgKGZvciB2aWV3IG9wcyksIG1lZD10aHJlc2hvbGQsIGhpZ2g9dGhyZXNob2xkXG4gICAgLy8gUmVtb3ZlIG1hc3RlciBrZXkgYnkgc2V0dGluZyBpdHMgd2VpZ2h0IHRvIDBcbiAgICB0eEJ1aWxkZXIuYWRkT3BlcmF0aW9uKFxuICAgICAgT3BlcmF0aW9uLnNldE9wdGlvbnMoe1xuICAgICAgICBtYXN0ZXJXZWlnaHQ6IDAsXG4gICAgICAgIGxvd1RocmVzaG9sZDogMCxcbiAgICAgICAgbWVkVGhyZXNob2xkOiB0aHJlc2hvbGQsXG4gICAgICAgIGhpZ2hUaHJlc2hvbGQ6IHRocmVzaG9sZCxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGNvbnN0IHR4ID0gdHhCdWlsZGVyLnNldFRpbWVvdXQoMzAwKS5idWlsZCgpO1xuICAgIHR4LnNpZ24odmF1bHRLZXlwYWlyKTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2VydmVyLnN1Ym1pdFRyYW5zYWN0aW9uKHR4KTtcbiAgICByZXR1cm4gcmVzdWx0Lmhhc2g7XG4gIH1cblxuICAvKipcbiAgICogQWRkIHRydXN0bGluZXMgd2hpbGUgbWFzdGVyIGtleSBpcyBzdGlsbCBhY3RpdmVcbiAgICovXG4gIHByaXZhdGUgYXN5bmMgYWRkVHJ1c3RsaW5lc1dpdGhNYXN0ZXJLZXkoXG4gICAgdmF1bHRLZXlwYWlyOiBLZXlwYWlyLFxuICAgIGFzc2V0TGlzdDogQXN0cmFldXNBc3NldFtdXG4gICk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3QgdmF1bHRBY2NvdW50ID0gYXdhaXQgdGhpcy5zZXJ2ZXIubG9hZEFjY291bnQodmF1bHRLZXlwYWlyLnB1YmxpY0tleSgpKTtcblxuICAgIGNvbnN0IHR4QnVpbGRlciA9IG5ldyBUcmFuc2FjdGlvbkJ1aWxkZXIodmF1bHRBY2NvdW50LCB7XG4gICAgICBmZWU6ICcxMDAnLFxuICAgICAgbmV0d29ya1Bhc3NwaHJhc2U6IHRoaXMubmV0d29ya1Bhc3NwaHJhc2UsXG4gICAgfSk7XG5cbiAgICBmb3IgKGNvbnN0IGFzc2V0IG9mIGFzc2V0TGlzdCkge1xuICAgICAgLy8gU2tpcCBuYXRpdmUgWExNIC0gbm8gdHJ1c3RsaW5lIG5lZWRlZFxuICAgICAgaWYgKGFzc2V0Lmlzc3Vlci50b0xvd2VyQ2FzZSgpID09PSAnbmF0aXZlJykge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgdHhCdWlsZGVyLmFkZE9wZXJhdGlvbihcbiAgICAgICAgT3BlcmF0aW9uLmNoYW5nZVRydXN0KHtcbiAgICAgICAgICBhc3NldDogbmV3IEFzc2V0KGFzc2V0LmNvZGUsIGFzc2V0Lmlzc3VlciksXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHR4ID0gdHhCdWlsZGVyLnNldFRpbWVvdXQoMzAwKS5idWlsZCgpO1xuICAgIHR4LnNpZ24odmF1bHRLZXlwYWlyKTtcblxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2VydmVyLnN1Ym1pdFRyYW5zYWN0aW9uKHR4KTtcbiAgICByZXR1cm4gcmVzdWx0Lmhhc2g7XG4gIH1cblxuICAvKipcbiAgICogQWRkIGEgdHJ1c3RsaW5lIHRvIGFuIGV4aXN0aW5nIHZhdWx0IChyZXF1aXJlcyBhdWRpdG9yIHNpZ25hdHVyZXMpXG4gICAqL1xuICBhc3luYyBhZGRUcnVzdGxpbmUoXG4gICAgdmF1bHRBZGRyZXNzOiBzdHJpbmcsXG4gICAgYXNzZXQ6IEFzdHJhZXVzQXNzZXQsXG4gICAgc2lnbmVyS2V5cGFpcnM6IEtleXBhaXJbXVxuICApOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGlmIChhc3NldC5pc3N1ZXIudG9Mb3dlckNhc2UoKSA9PT0gJ25hdGl2ZScpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGFkZCB0cnVzdGxpbmUgZm9yIG5hdGl2ZSBYTE0nKTtcbiAgICB9XG5cbiAgICBjb25zdCB2YXVsdEFjY291bnQgPSBhd2FpdCB0aGlzLnNlcnZlci5sb2FkQWNjb3VudCh2YXVsdEFkZHJlc3MpO1xuXG4gICAgY29uc3QgdHggPSBuZXcgVHJhbnNhY3Rpb25CdWlsZGVyKHZhdWx0QWNjb3VudCwge1xuICAgICAgZmVlOiAnMTAwJyxcbiAgICAgIG5ldHdvcmtQYXNzcGhyYXNlOiB0aGlzLm5ldHdvcmtQYXNzcGhyYXNlLFxuICAgIH0pXG4gICAgICAuYWRkT3BlcmF0aW9uKFxuICAgICAgICBPcGVyYXRpb24uY2hhbmdlVHJ1c3Qoe1xuICAgICAgICAgIGFzc2V0OiBuZXcgQXNzZXQoYXNzZXQuY29kZSwgYXNzZXQuaXNzdWVyKSxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5zZXRUaW1lb3V0KDMwMClcbiAgICAgIC5idWlsZCgpO1xuXG4gICAgLy8gU2lnbiB3aXRoIGFsbCBwcm92aWRlZCBzaWduZXJzXG4gICAgZm9yIChjb25zdCBzaWduZXIgb2Ygc2lnbmVyS2V5cGFpcnMpIHtcbiAgICAgIHR4LnNpZ24oc2lnbmVyKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnNlcnZlci5zdWJtaXRUcmFuc2FjdGlvbih0eCk7XG4gICAgcmV0dXJuIHJlc3VsdC5oYXNoO1xuICB9XG5cbiAgLyoqXG4gICAqIFJvdGF0ZSBhIHNpZ25lciBvbiB0aGUgdmF1bHQgKHJlcXVpcmVzIGV4aXN0aW5nIHNpZ25lcnMgdG8gYXV0aG9yaXplKVxuICAgKi9cbiAgYXN5bmMgcm90YXRlU2lnbmVyKFxuICAgIHZhdWx0QWRkcmVzczogc3RyaW5nLFxuICAgIG9sZFNpZ25lcjogc3RyaW5nLFxuICAgIG5ld1NpZ25lcjogc3RyaW5nLFxuICAgIHNpZ25lcktleXBhaXJzOiBLZXlwYWlyW11cbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCB2YXVsdEFjY291bnQgPSBhd2FpdCB0aGlzLnNlcnZlci5sb2FkQWNjb3VudCh2YXVsdEFkZHJlc3MpO1xuXG4gICAgLy8gVmVyaWZ5IG9sZCBzaWduZXIgZXhpc3RzXG4gICAgY29uc3QgZXhpc3RpbmdTaWduZXJzID0gdmF1bHRBY2NvdW50LnNpZ25lcnMubWFwKChzKSA9PiBzLmtleSk7XG4gICAgaWYgKCFleGlzdGluZ1NpZ25lcnMuaW5jbHVkZXMob2xkU2lnbmVyKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBPbGQgc2lnbmVyICR7b2xkU2lnbmVyfSBub3QgZm91bmQgaW4gdmF1bHQgc2lnbmVyc2ApO1xuICAgIH1cblxuICAgIC8vIFZlcmlmeSBuZXcgc2lnbmVyIGRvZXNuJ3QgYWxyZWFkeSBleGlzdFxuICAgIGlmIChleGlzdGluZ1NpZ25lcnMuaW5jbHVkZXMobmV3U2lnbmVyKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBOZXcgc2lnbmVyICR7bmV3U2lnbmVyfSBhbHJlYWR5IGV4aXN0cyBpbiB2YXVsdCBzaWduZXJzYCk7XG4gICAgfVxuXG4gICAgY29uc3QgdHggPSBuZXcgVHJhbnNhY3Rpb25CdWlsZGVyKHZhdWx0QWNjb3VudCwge1xuICAgICAgZmVlOiAnMTAwJyxcbiAgICAgIG5ldHdvcmtQYXNzcGhyYXNlOiB0aGlzLm5ldHdvcmtQYXNzcGhyYXNlLFxuICAgIH0pXG4gICAgICAvLyBBZGQgbmV3IHNpZ25lclxuICAgICAgLmFkZE9wZXJhdGlvbihcbiAgICAgICAgT3BlcmF0aW9uLnNldE9wdGlvbnMoe1xuICAgICAgICAgIHNpZ25lcjoge1xuICAgICAgICAgICAgZWQyNTUxOVB1YmxpY0tleTogbmV3U2lnbmVyLFxuICAgICAgICAgICAgd2VpZ2h0OiAxLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAvLyBSZW1vdmUgb2xkIHNpZ25lclxuICAgICAgLmFkZE9wZXJhdGlvbihcbiAgICAgICAgT3BlcmF0aW9uLnNldE9wdGlvbnMoe1xuICAgICAgICAgIHNpZ25lcjoge1xuICAgICAgICAgICAgZWQyNTUxOVB1YmxpY0tleTogb2xkU2lnbmVyLFxuICAgICAgICAgICAgd2VpZ2h0OiAwLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuc2V0VGltZW91dCgzMDApXG4gICAgICAuYnVpbGQoKTtcblxuICAgIGZvciAoY29uc3Qgc2lnbmVyIG9mIHNpZ25lcktleXBhaXJzKSB7XG4gICAgICB0eC5zaWduKHNpZ25lcik7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5zZXJ2ZXIuc3VibWl0VHJhbnNhY3Rpb24odHgpO1xuICAgIHJldHVybiByZXN1bHQuaGFzaDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdmF1bHQgY29uZmlndXJhdGlvbiBmcm9tIFN0ZWxsYXJcbiAgICovXG4gIGFzeW5jIGdldFZhdWx0Q29uZmlnKHZhdWx0QWRkcmVzczogc3RyaW5nKTogUHJvbWlzZTxWYXVsdENvbmZpZz4ge1xuICAgIGNvbnN0IGFjY291bnQgPSBhd2FpdCB0aGlzLnNlcnZlci5sb2FkQWNjb3VudCh2YXVsdEFkZHJlc3MpO1xuXG4gICAgLy8gRXh0cmFjdCBzaWduZXJzIChleGNsdWRlIGFueSB3aXRoIHdlaWdodCAwKVxuICAgIGNvbnN0IGF1ZGl0b3JzID0gYWNjb3VudC5zaWduZXJzXG4gICAgICAuZmlsdGVyKChzKSA9PiBzLndlaWdodCA+IDAgJiYgcy50eXBlID09PSAnZWQyNTUxOV9wdWJsaWNfa2V5JylcbiAgICAgIC5tYXAoKHMpID0+IHMua2V5KTtcblxuICAgIC8vIEdldCB0aHJlc2hvbGQgKHVzZSBtZWRfdGhyZXNob2xkKVxuICAgIGNvbnN0IHRocmVzaG9sZCA9IGFjY291bnQudGhyZXNob2xkcy5tZWRfdGhyZXNob2xkO1xuXG4gICAgLy8gRXh0cmFjdCBhc3NldHMgZnJvbSBiYWxhbmNlc1xuICAgIGNvbnN0IGFzc2V0czogQXN0cmFldXNBc3NldFtdID0gYWNjb3VudC5iYWxhbmNlcy5tYXAoKGJhbDogYW55KSA9PiB7XG4gICAgICBpZiAoYmFsLmFzc2V0X3R5cGUgPT09ICduYXRpdmUnKSB7XG4gICAgICAgIHJldHVybiB7IGNvZGU6ICdYTE0nLCBpc3N1ZXI6ICduYXRpdmUnIH07XG4gICAgICB9XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb2RlOiBiYWwuYXNzZXRfY29kZSxcbiAgICAgICAgaXNzdWVyOiBiYWwuYXNzZXRfaXNzdWVyLFxuICAgICAgfTtcbiAgICB9KTtcblxuICAgIHJldHVybiB7XG4gICAgICBhZGRyZXNzOiB2YXVsdEFkZHJlc3MsXG4gICAgICBhdWRpdG9ycyxcbiAgICAgIHRocmVzaG9sZCxcbiAgICAgIGFzc2V0cyxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFZlcmlmeSB2YXVsdCBjb25maWd1cmF0aW9uIG1hdGNoZXMgZXhwZWN0ZWQgdmFsdWVzXG4gICAqL1xuICBhc3luYyB2ZXJpZnlWYXVsdENvbmZpZyhcbiAgICB2YXVsdEFkZHJlc3M6IHN0cmluZyxcbiAgICBleHBlY3RlZEF1ZGl0b3JzOiBzdHJpbmdbXSxcbiAgICBleHBlY3RlZFRocmVzaG9sZDogbnVtYmVyXG4gICk6IFByb21pc2U8eyB2YWxpZDogYm9vbGVhbjsgZXJyb3JzOiBzdHJpbmdbXSB9PiB7XG4gICAgY29uc3QgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IGF3YWl0IHRoaXMuZ2V0VmF1bHRDb25maWcodmF1bHRBZGRyZXNzKTtcblxuICAgICAgLy8gQ2hlY2sgdGhyZXNob2xkXG4gICAgICBpZiAoY29uZmlnLnRocmVzaG9sZCAhPT0gZXhwZWN0ZWRUaHJlc2hvbGQpIHtcbiAgICAgICAgZXJyb3JzLnB1c2goXG4gICAgICAgICAgYFRocmVzaG9sZCBtaXNtYXRjaDogZXhwZWN0ZWQgJHtleHBlY3RlZFRocmVzaG9sZH0sIGdvdCAke2NvbmZpZy50aHJlc2hvbGR9YFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBhdWRpdG9yc1xuICAgICAgY29uc3QgbWlzc2luZ0F1ZGl0b3JzID0gZXhwZWN0ZWRBdWRpdG9ycy5maWx0ZXIoXG4gICAgICAgIChhKSA9PiAhY29uZmlnLmF1ZGl0b3JzLmluY2x1ZGVzKGEpXG4gICAgICApO1xuICAgICAgaWYgKG1pc3NpbmdBdWRpdG9ycy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGVycm9ycy5wdXNoKGBNaXNzaW5nIGF1ZGl0b3JzOiAke21pc3NpbmdBdWRpdG9ycy5qb2luKCcsICcpfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBleHRyYUF1ZGl0b3JzID0gY29uZmlnLmF1ZGl0b3JzLmZpbHRlcihcbiAgICAgICAgKGEpID0+ICFleHBlY3RlZEF1ZGl0b3JzLmluY2x1ZGVzKGEpXG4gICAgICApO1xuICAgICAgaWYgKGV4dHJhQXVkaXRvcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBlcnJvcnMucHVzaChgRXh0cmEgYXVkaXRvcnM6ICR7ZXh0cmFBdWRpdG9ycy5qb2luKCcsICcpfWApO1xuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayB0aGF0IG1hc3RlciBrZXkgaXMgcmVtb3ZlZFxuICAgICAgY29uc3QgYWNjb3VudCA9IGF3YWl0IHRoaXMuc2VydmVyLmxvYWRBY2NvdW50KHZhdWx0QWRkcmVzcyk7XG4gICAgICBjb25zdCBtYXN0ZXJTaWduZXIgPSBhY2NvdW50LnNpZ25lcnMuZmluZCgocykgPT4gcy5rZXkgPT09IHZhdWx0QWRkcmVzcyk7XG4gICAgICBpZiAobWFzdGVyU2lnbmVyICYmIG1hc3RlclNpZ25lci53ZWlnaHQgPiAwKSB7XG4gICAgICAgIGVycm9ycy5wdXNoKCdNYXN0ZXIga2V5IHN0aWxsIGhhcyB3ZWlnaHQgPiAwJyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHZhbGlkOiBlcnJvcnMubGVuZ3RoID09PSAwLFxuICAgICAgICBlcnJvcnMsXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB2YWxpZDogZmFsc2UsXG4gICAgICAgIGVycm9yczogW2BGYWlsZWQgdG8gdmVyaWZ5IHZhdWx0OiAke2Vycm9yfWBdLFxuICAgICAgfTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgVmF1bHRNYW5hZ2VyIGluc3RhbmNlIGZvciB0ZXN0bmV0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUZXN0bmV0VmF1bHRNYW5hZ2VyKCk6IFZhdWx0TWFuYWdlciB7XG4gIHJldHVybiBuZXcgVmF1bHRNYW5hZ2VyKFRFU1RORVRfQ09ORklHKTtcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZSB0ZXN0IGF1ZGl0b3Iga2V5cGFpcnMgKGZvciB0ZXN0aW5nIG9ubHkpXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVRlc3RBdWRpdG9ycyhjb3VudDogbnVtYmVyKTogS2V5cGFpcltdIHtcbiAgY29uc3QgYXVkaXRvcnM6IEtleXBhaXJbXSA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcbiAgICBhdWRpdG9ycy5wdXNoKEtleXBhaXIucmFuZG9tKCkpO1xuICB9XG4gIHJldHVybiBhdWRpdG9ycztcbn1cbiJdfQ==