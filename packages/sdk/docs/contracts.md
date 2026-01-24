# Contracts

You have keys. You have compiled code. Now comes the moment of truth: putting it on the blockchain.

## Deployment

Deploying contracts on TVA is surprisingly painless. You need the `ContractDeployer`.

```typescript
import { ContractDeployer } from '@tva-protocol/sdk';

// 1. Setup the deployer for your network
const deployer = new ContractDeployer('testnet');

// 2. Deploy
// You need:
// - The compiled artifact (from the compiler step)
// - Your signer (to pay for the resources)
console.log("Deploying... praying to the network gods...");

const deployResult = await deployer.deploy(myContract, signer);

console.log("Success!");
console.log("Soroban ID:", deployResult.contractId); // The C... address
console.log("EVM Address:", deployResult.evmAddress); // The 0x... address
```

Wait, two addresses? Yes. The `contractId` is what Soroban knows. The `evmAddress` is a deterministic mapping so you can refer to it in other Solidity contracts.

## Interaction

Now that it's live, let's talk to it. We provide a `TVAContract` class that tries its best to look like an Ethers.js contract.

```typescript
import { TVAContract } from '@tva-protocol/sdk';

// Instantiate the contract instance
const contract = new TVAContract(
  deployResult.contractId, // The ID you got from deployment
  myContract.abi,          // The ABI from compilation
  'testnet'
);

// 1. READ (View Functions)
// These are faster and (usually) cheaper.
// Equivalent to: contract.balanceOf(address)
const balance = await contract.call('balanceOf', [myEvmAddress], signer);
console.log("My Balance:", balance.toString());

// 2. WRITE (Transactions)
// These change state and cost gas.
// Equivalent to: contract.transfer(to, amount)
console.log("Sending money...");
const tx = await contract.send('transfer', [friendEvmAddress, 1000], signer);

console.log("Transaction Complete.");
console.log("You are now 1000 units poorer (plus gas).");
```

### Argument Encoding

We handle the encoding of arguments for you. If your Solidity function expects a `uint256`, you can pass a generic number or BigInt. If it expects an `address`, you can pass a Stellar address or an EVM address—we'll figure it out. Usually.
