# @tva-protocol/wallet-adapter

Wallet adapter for TVA Protocol - enables MetaMask and EVM wallets to work with Stellar/Soroban.

## Installation

```bash
npm install @tva-protocol/wallet-adapter
# or
pnpm add @tva-protocol/wallet-adapter
# or
yarn add @tva-protocol/wallet-adapter
```

## Overview

TVA Protocol uses a dual-key architecture:
- **EVM Key (secp256k1)**: Used for MetaMask signing and EVM address derivation
- **Stellar Key (Ed25519)**: Used for Stellar/Soroban transaction submission

This adapter bridges the two by deriving Stellar keys deterministically from MetaMask signatures, allowing users to control both identities with a single wallet.

## Quick Start

### Browser Usage

```typescript
import { TVAWalletAdapter, getWalletAdapter } from '@tva-protocol/wallet-adapter';

// Get or create adapter instance
const adapter = getWalletAdapter('testnet');

// Connect to MetaMask
await adapter.connect();

// The adapter automatically derives your Stellar keypair
console.log('EVM Address:', adapter.getState().evmAddress);
console.log('Stellar Address:', adapter.getState().stellarAddress);

// Sign EVM transaction (via MetaMask)
await adapter.signEvmTransaction({
  to: '0x...',
  value: '0x0',
  data: '0x...',
});

// Sign Stellar transaction (via derived key)
import { TransactionBuilder } from '@stellar/stellar-sdk';
const stellarTx = new TransactionBuilder(...).build();
adapter.signStellarTransaction(stellarTx);
```

### React Integration

```tsx
import { useState, useEffect } from 'react';
import { TVAWalletAdapter, type ConnectionState } from '@tva-protocol/wallet-adapter';

function WalletConnect() {
  const [adapter] = useState(() => new TVAWalletAdapter('testnet'));
  const [state, setState] = useState<ConnectionState>(adapter.getState());

  useEffect(() => {
    const handleConnect = () => setState(adapter.getState());
    const handleDisconnect = () => setState(adapter.getState());

    adapter.on('connect', handleConnect);
    adapter.on('disconnect', handleDisconnect);
    adapter.on('stellarKeyDerived', handleConnect);

    return () => {
      adapter.off('connect', handleConnect);
      adapter.off('disconnect', handleDisconnect);
      adapter.off('stellarKeyDerived', handleConnect);
    };
  }, [adapter]);

  const connect = async () => {
    try {
      await adapter.connect();
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  if (!state.connected) {
    return <button onClick={connect}>Connect Wallet</button>;
  }

  return (
    <div>
      <p>EVM: {state.evmAddress}</p>
      <p>Stellar: {state.stellarAddress}</p>
    </div>
  );
}
```

## Key Derivation

The Stellar keypair is derived deterministically from a MetaMask signature:

1. User clicks "Connect"
2. MetaMask prompts user to sign a derivation message
3. The signature is hashed to create a 32-byte Ed25519 seed
4. The same wallet always produces the same Stellar address

This ensures:
- No additional seed phrase to manage
- Deterministic and recoverable
- Secure (signature is never transmitted)

### Manual Key Derivation

For server-side usage with direct private key access:

```typescript
import { deriveStellarKeypairFromEvmKey } from '@tva-protocol/wallet-adapter';

const evmPrivateKey = '0x...'; // Never expose this!
const stellarKeypair = deriveStellarKeypairFromEvmKey(evmPrivateKey);

console.log('Stellar Public Key:', stellarKeypair.publicKey());
```

## API Reference

### TVAWalletAdapter

#### Constructor

```typescript
new TVAWalletAdapter(network?: 'testnet' | 'mainnet' | 'local')
```

#### Methods

| Method | Description |
|--------|-------------|
| `connect()` | Connect to MetaMask and derive Stellar key |
| `disconnect()` | Disconnect from wallet |
| `getState()` | Get current connection state |
| `signMessage(message)` | Sign message with MetaMask (personal_sign) |
| `signTypedData(data)` | Sign EIP-712 typed data |
| `signEvmTransaction(tx)` | Send transaction via MetaMask |
| `signStellarTransaction(tx)` | Sign Stellar transaction with derived key |
| `switchToTVANetwork()` | Switch MetaMask to TVA network |
| `addTVANetwork()` | Add TVA network to MetaMask |

#### Events

| Event | Data | Description |
|-------|------|-------------|
| `connect` | `EvmAddress` | Connected to MetaMask |
| `disconnect` | - | Disconnected from wallet |
| `accountsChanged` | `EvmAddress[]` | MetaMask accounts changed |
| `chainChanged` | `number` | MetaMask chain changed |
| `stellarKeyDerived` | `StellarAddress` | Stellar keypair derived |
| `error` | `Error` | Error occurred |

### Helper Functions

```typescript
// Get singleton adapter instance
const adapter = getWalletAdapter('testnet');

// Reset adapter (for testing)
resetWalletAdapter();

// Key derivation utilities
import {
  getKeyDerivationMessage,    // Get message to sign
  deriveStellarKeypairFromSignature,  // Derive from signature
  deriveStellarKeypairFromEvmKey,     // Derive from private key
} from '@tva-protocol/wallet-adapter';
```

## Security Considerations

1. **Private Keys**: The Stellar secret key is held in memory. Never log or transmit it.
2. **Signature Security**: The derivation message clearly states its purpose.
3. **Domain Separation**: Uses unique domain separator to prevent collision.
4. **No Persistence**: Keys are not persisted; users re-derive on each session.

## MetaMask Network Configuration

The adapter can automatically add the TVA network to MetaMask:

```typescript
await adapter.addTVANetwork();
```

This adds:
- **Network Name**: TVA Protocol Testnet
- **RPC URL**: https://rpc.testnet.tva-protocol.io
- **Chain ID**: 0x544541 (5522753)
- **Currency**: XLM

## License

MIT
