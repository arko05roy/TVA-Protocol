/**
 * TVA Protocol Wallet Module
 *
 * Provides key management and signing capabilities for TVA Protocol's
 * dual-key architecture (EVM secp256k1 + Stellar Ed25519).
 */

export {
  generateMnemonic,
  validateMnemonic,
  deriveKeyPairFromMnemonic,
  deriveKeyPairFromEvmPrivateKey,
  generateRandomKeyPair,
  getEvmAddress,
  getStellarAddress,
  publicKeyToEvmAddress,
  publicKeyToStellarAddress,
  verifyEvmAddress,
  verifyStellarAddress,
} from './keys.js';

export {
  EvmSigner,
  StellarSigner,
  TVASigner,
} from './signer.js';
