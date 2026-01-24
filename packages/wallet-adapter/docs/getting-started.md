# Getting Started

Let's get this integration running before your users realize they need to download another wallet extension.

## Installation

```bash
npm install @tva-protocol/wallet-adapter
# or
yarn add @tva-protocol/wallet-adapter
```

## The Basics

Here is how you wire it up in a generic TypeScript environment (we'll get to React in a second).

```typescript
import { getWalletAdapter } from '@tva-protocol/wallet-adapter';

// 1. Get the adapter singleton
// We use a singleton because you usually only have one user at a time.
// Unless you are writing a bot farm, in which case, carry on.
const adapter = getWalletAdapter('testnet');

// 2. Connect
// This will trigger the MetaMask popup "Sign this message to login"
await adapter.connect();

// 3. Inspect the damage
const state = adapter.getState();
console.log("EVM Address:", state.evmAddress);       // 0x...
console.log("Stellar Address:", state.stellarAddress); // G... (Derived!)
```

## React Hooks

We know you probably use React. Everyone does. 

```tsx
import { useState, useEffect } from 'react';
import { TVAWalletAdapter, type ConnectionState } from '@tva-protocol/wallet-adapter';

export function WalletButton() {
  const [adapter] = useState(() => new TVAWalletAdapter('testnet'));
  const [state, setState] = useState<ConnectionState>(adapter.getState());

  useEffect(() => {
    // Listen for changes
    const update = () => setState(adapter.getState());
    
    adapter.on('connect', update);
    adapter.on('disconnect', update);
    adapter.on('stellarKeyDerived', update);

    return () => {
      adapter.off('connect', update);
      adapter.off('disconnect', update);
      adapter.off('stellarKeyDerived', update);
    };
  }, [adapter]);

  const handleConnect = async () => {
    try {
      await adapter.connect();
    } catch (e) {
      console.error("User rejected request or something broke", e);
    }
  };

  if (!state.connected) {
    return <button onClick={handleConnect}>Connect Wallet</button>;
  }

  return (
    <div>
      <p>Connected as: {state.evmAddress}</p>
      <p>Stellar alter-ego: {state.stellarAddress}</p>
    </div>
  );
}
```

## Making Metamask Cooperate

Sometimes Metamask is on the wrong network. It happens.

```typescript
// Ask nicely to switch
await adapter.switchToTVANetwork();

// Force the issue (add the network if it's missing)
await adapter.addTVANetwork();
```
