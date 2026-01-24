# TVA Protocol SDK

Welcome to the **TVA Protocol SDK** documentation. 

If you're reading this, you’ve likely made the questionable but bold life choice to run Solidity smart contracts on Stellar. We respect that. In fact, we built this entire toolset just for people like you.

## What is this thing?

The TVA SDK is your bridge between two worlds:
1.  **The EVM World**: Where Solidity flows like wine and `msg.sender` is your best friend.
2.  **The Stellar World**: Where Soroban reigns supreme and transaction fees are so low they're basically a rounding error.

We take your Solidity code, throw it into our LLVM-based compiler (which we wrap nicely so you don't have to touch the scary internals), and spit out a WASM binary that runs on Soroban. It’s like putting a V8 engine in a spaceship. It shouldn't work, but it does, and it goes fast.

## Why use this?

- **You know Solidity**: You don't want to learn Rust just to deploy a simpler counter contract.
- **You like Stellar**: Speed, low fees, reliable consensus.
- **You enjoy chaos**: Mixing EVM and WASM allows for some truly "creative" architectural decisions.

## What's in the box?

The SDK gives you tools for:
- 🔑 **Wallets**: Managing the identity crisis of having both an EVM address and a Stellar address.
- 🏗️ **Compilation**: Turning `.sol` files into distinct Soroban artifacts.
- 🚀 **Deployment**: Putting that code on-chain without crying.
- 📞 **Interaction**: Calling your contracts as if they were normal EVM contracts (mostly).

Ready to break some boundaries? Head over to [Getting Started](getting-started.md).
