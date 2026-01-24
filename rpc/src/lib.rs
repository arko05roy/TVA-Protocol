//! TVA Protocol RPC Translation Server
//!
//! This crate implements a JSON-RPC server that accepts Ethereum-compatible
//! RPC calls (eth_*, net_*, web3_*) and translates them to Stellar/Soroban
//! API calls. This enables developers to use standard EVM tooling (MetaMask,
//! Hardhat, ethers.js) to interact with contracts deployed on Stellar's
//! Soroban smart contract platform.
//!
//! # Architecture
//!
//! ```text
//! Developer (MetaMask/Hardhat/ethers.js)
//!     |
//!     | eth_* JSON-RPC calls
//!     v
//! TVA RPC Server (this crate)
//!     |
//!     | Soroban RPC / Horizon API calls
//!     v
//! Stellar Network (testnet/mainnet)
//! ```
//!
//! # Modules
//!
//! - `config` - Environment and configuration management
//! - `server` - JSON-RPC server setup and method registration
//! - `methods` - Individual RPC method implementations (eth, net, web3)
//! - `translator` - EVM-to-Stellar transaction translation logic
//! - `stellar` - Soroban/Horizon RPC client wrapper
//! - `emulator` - Block/log emulation (Stellar ledger -> EVM format)

pub mod config;
pub mod emulator;
pub mod methods;
pub mod server;
pub mod stellar;
pub mod translator;
