/**
 * TVA Protocol Contract Module
 *
 * Provides contract deployment and interaction capabilities.
 */

export {
  TVAContract,
  TypedContract,
  ContractDeployer,
  evmAddressToContractId,
  contractIdToEvmAddress,
  getFunctionSelector,
  getFunctionSignature,
  encodeFunctionCall,
} from './contract.js';
