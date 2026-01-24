# Wallet Adapter

Welcome to the **Wallet Adapter** documentation.

Here's a fun fact: Stellar wallets and EVM wallets don't talk to each other. They're like cats and dogs. Or vim users and everyone else.

The **Wallet Adapter** is the mediator that forces them to get along.

## The Problem

- You have users with MetaMask (EVM).
- You built a dApp on TVA (Stellar/Soroban).
- You want the users to use your dApp without realizing they are venturing into a non-EVM land.

## The Solution

We built a bridge. A mathematical bridge.

This adapter allows a user to "login" with MetaMask, sign a specific message, and *poof*—we deterministically generate a Stellar keypair for them.

They control both identities with one private key (their specific MetaMask account). It's clean, it's secure, and it means they don't have to install a new wallet extension just to use your app.

## What it does

- 🔗 **Connects**: Hooks into `window.ethereum` (MetaMask, etc).
- 🔑 **Derives**: Creates a Stellar identity from an EVM signature.
- ✍️ **Signs**: Signs EVM transactions with MetaMask, and Stellar transactions with the derived key.
- 🧘 **Peace of Mind**: Handles the complexity so you can just call `signTransaction`.

Ready to make wallets play nice? Check out [Getting Started](getting-started.md).
