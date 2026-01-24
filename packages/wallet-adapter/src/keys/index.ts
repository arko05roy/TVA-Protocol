/**
 * TVA Wallet Key Management
 */

export {
  deriveStellarKeypairFromEvmKey,
  deriveStellarKeypairFromSignature,
  getKeyDerivationMessage,
  getKeyDerivationTypedData,
  evmAddressToDisplayAddress,
  validateDerivedAddress,
  stellarAddressToPublicKeyBytes,
  publicKeyBytesToStellarAddress,
  computeEvmAddress,
} from './derivation.js';
