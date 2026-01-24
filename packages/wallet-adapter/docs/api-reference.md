# API Reference

Here are the raw details for the `TVAWalletAdapter` class.

## Constructor

```typescript
new TVAWalletAdapter(network?: 'testnet' | 'mainnet' | 'local')
```

Defaults to `testnet` if you are too lazy to specify.

## Methods

### `connect()`
`Promise<void>`
Kicks off the connection flow. Popups will appear. Signatures will be requested.

### `disconnect()`
`Promise<void>`
Clears the state. Poof.

### `signEvmTransaction(tx)`
`Promise<string>`
Passes a transaction object to MetaMask. Returns the transaction hash.
- `tx`: Standard Ethereum transaction object (to, value, data, etc.)

### `signStellarTransaction(tx)`
`Promise<Transaction>`
Signs a Stellar transaction object using the *derived* key.
- `tx`: A Stellar SDK `Transaction` object.

### `switchToTVANetwork()`
`Promise<void>`
Requests a chain switch in MetaMask.

## Events

The adapter extends `EventEmitter`. You can listen to it.

```typescript
adapter.on('connect', (address) => { ... });
adapter.on('disconnect', () => { ... });
adapter.on('stellarKeyDerived', (stellarAddress) => { 
  // This is usually the event you actually care about
});
```
