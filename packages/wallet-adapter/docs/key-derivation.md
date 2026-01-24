# Key Derivation

This is the cool math part. Or the scary math part, depending on your background.

## How it works

We need a Stellar private key (Ed25519) to sign Soroban transactions. But the user only has an EVM wallet (secp256k1).

Instead of asking the user to manage *another* secret phrase (which they will inevitably lose or write on a sticky note), we generate the Stellar key **on the fly**.

1.  **Request Signature**: We ask MetaMask to sign a specific, constant message: `"Login to TVA Protocol"`.
2.  **Hash**: We take that signature (which is unique to the user's EVM private key) and hash it.
3.  **Seed**: That hash becomes the seed for the Stellar keypair.

## The Properties

- **Deterministic**: The same EVM wallet will *always* produce the same Stellar address.
- **Non-Custodial**: We (the app developers) never see the EVM private key. We only see the derived Stellar key, which is kept in memory.
- **Volatile**: The derived key disappears when the page refreshes. The user just signs the message again to "restore" it.

## Manual Derivation

If you are doing some backend magic and have access to a private key (be careful please), you can skip the signature step.

```typescript
import { deriveStellarKeypairFromEvmKey } from '@tva-protocol/wallet-adapter';

// DANGER ZONE
const evmPrivateKey = '0x...'; 

// "Science isn't about WHY. It's about WHY NOT!"
const stellarKeypair = deriveStellarKeypairFromEvmKey(evmPrivateKey);

console.log(stellarKeypair.publicKey());
```

## Security Note

The derivation message includes a **Domain Separator**. This ensures that if the user signs a similar message for a different app ("Login to Evilcorp"), it produces a completely different key. Your keys are safe...ish. As safe as keys can be on the internet.
