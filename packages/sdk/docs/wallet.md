# The Wallet

In the TVA Protocol, your account has a bit of a split personality. 

You exist simultaneously as:
1.  **An EVM Entity**: Uses `secp256k1` keys and has a `0x...` address.
2.  **A Stellar Entity**: Uses `ed25519` keys and has a `G...` address.

We link these two together so you can sign transactions that satisfy both the EVM logic and the Stellar network requirements. It's like having a passport and a driver's license—different IDs, same person.

## The KeyPair

The `KeyPair` object is the holy grail. It holds the private keys for both identities.

### Generating a Fresh Identity

```typescript
import { 
  generateMnemonic, 
  deriveKeyPairFromMnemonic,
  getEvmAddress,
  getStellarAddress 
} from '@tva-protocol/sdk';

// 1. Summon some entropy from the void
const mnemonic = generateMnemonic();

// 2. Derive the magic pair
// This creates both your EVM private key and Stellar keypair deterministically.
// It's like magic, but just math.
const keyPair = await deriveKeyPairFromMnemonic(mnemonic);

// 3. Who am I?
console.log("EVM Address:", getEvmAddress(keyPair)); 
// Output: 0x71C... (The one you know and love)

console.log("Stellar Address:", getStellarAddress(keyPair)); 
// Output: GBA4... (The one you're learning to tolerate)
```

## The Signer

When you want to actually *do* things (like deploy contracts or spend money), you need a `TVASigner`. 

This class wraps your KeyPair and network configuration into a handy object that knows how to sign transactions for the TVA environment. It's bilingual.

```typescript
import { TVASigner } from '@tva-protocol/sdk';

// Initialize with your keys and the network you're targeting
// 'testnet' | 'mainnet' | 'local'
const signer = new TVASigner(keyPair, 'testnet');

// Now you can pass this 'signer' to contract interactions.
// It handles the confusing crypto stuff under the hood.
```

### Pro Tip
Don't commit your mnemonic to GitHub. We shouldn't have to say this, but we've seen things.
