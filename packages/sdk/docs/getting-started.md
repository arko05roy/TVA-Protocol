# Getting Started

Alright, let's get this thing on your machine. We assume you have Node.js (v18+) installed. If not, go ask your local sysadmin or just download it. We'll wait.

## Installation

Run this command. You know the drill.

```bash
npm install @tva-protocol/sdk
```

Or, if you prefer other package managers (we don't judge... much):

```bash
yarn add @tva-protocol/sdk
# or
pnpm add @tva-protocol/sdk
```

## The "Hello World" Check

Here is the absolute minimum code you need to verify that you didn't break anything immediately.

```typescript
import { generateMnemonic } from '@tva-protocol/sdk';

const mnemonic = generateMnemonic();
console.log("Look at me, I have a seed phrase:", mnemonic);
```

If that prints a string of words, congratulations! You have successfully installed a library.

## Prerequisites

To actually use this for development, there are a few things you should know:

1.  **Node.js**: As mentioned, keep it fresh (v18+).
2.  **Compiler**: Our compiler uses LLVM under the hood. Usually, we handle the binary for you, but if you're doing weird custom OS stuff, you might need to check your environment.
3.  **Stellar Core**: You don't *need* to run a node, but understanding that you are deploying to a Stellar network helps.
