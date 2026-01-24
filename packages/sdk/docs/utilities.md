# Utilities

We packed a bunch of helper functions into the SDK because we got tired of copy-pasting them from Stack Overflow every time we started a new project. 

Use them. Or don't. We're not the code police.

## Math for people who hate Math

Dealing with 18 decimal places makes our eyes bleed. Here are some helpers to save your sanity.

```typescript
import { formatEth, parseEth, formatXlm, parseXlm } from '@tva-protocol/sdk';

// BigInt -> String
const wei = 1000000000000000000n; // 1 ETH
console.log(formatEth(wei)); // "1.0"

// String -> BigInt
const value = parseEth("1.5");
console.log(value); // 1500000000000000000n

// Stellar uses 7 decimals (stroops) because they like to be different.
const stroops = 10000000n; // 1 XLM
console.log(formatXlm(stroops)); // "1.0"
```

## Addressing The Issue

"Is this a valid address or did my cat walk on the keyboard?"

```typescript
import { 
  isValidEvmAddress, 
  isValidStellarAddress, 
  checksumAddress 
} from '@tva-protocol/sdk';

// Check format
isValidEvmAddress('0x123...'); // true/false
isValidStellarAddress('G...'); // true/false

// EIP-55 Checksum (The mixed-case thing)
console.log(checksumAddress('0xabcdef...')); // 0xAbCdEf...
```

## Life Hacks

```typescript
import { sleep, retry } from '@tva-protocol/sdk';

// Procrastinate for 1 second
await sleep(1000);

// Stubbornness
// Keep trying until it works or we give up
await retry(async () => {
  // do something risky
  await makeNetworkRequest();
}, { 
  maxRetries: 5,
  initialDelay: 1000 
});
```
