use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use jsonrpsee::server::{RpcModule, Server};
use tracing::{info, warn};

use crate::config::Config;
use crate::methods::{eth, net, web3};
use crate::stellar::SorobanClient;
use crate::translator::AbiRegistry;

/// Shared state for the RPC server.
pub struct RpcState {
    pub config: Config,
    pub soroban_client: SorobanClient,
    pub abi_registry: AbiRegistry,
}

/// Start the JSON-RPC server.
pub async fn start_server(config: Config) -> Result<()> {
    let addr = SocketAddr::from(([0, 0, 0, 0], config.tva_rpc_port));

    info!("Starting TVA RPC Server on {}", addr);
    info!("Chain ID: {} (0x{:x})", config.tva_chain_id, config.tva_chain_id);
    info!("Stellar RPC: {}", config.stellar_rpc_url);

    // Initialize Soroban client
    let soroban_client = SorobanClient::new(
        &config.stellar_rpc_url,
        &config.stellar_network_passphrase,
    );

    // Check Soroban RPC health
    match soroban_client.get_health().await {
        Ok(health) => {
            info!("Soroban RPC health: status={}", health.status);
            if let Some(latest) = health.latest_ledger {
                info!("Latest ledger: {}", latest);
            }
        }
        Err(e) => {
            warn!("Could not reach Soroban RPC (will retry on requests): {}", e);
        }
    }

    // Initialize ABI registry
    let abi_registry = AbiRegistry::new();

    // Create shared state
    let state = Arc::new(RpcState {
        config: config.clone(),
        soroban_client,
        abi_registry,
    });

    // Build the RPC module
    let mut module = RpcModule::new(state.clone());

    // Register all RPC methods
    register_methods(&mut module)?;

    // Start the server
    let server = Server::builder()
        .build(addr)
        .await
        .map_err(|e| anyhow!("Failed to bind server to {}: {}", addr, e))?;

    info!("TVA RPC Server listening on http://{}", addr);
    info!("Compatible with MetaMask, Hardhat, ethers.js, and other EVM tooling");

    let handle = server.start(module);

    // Wait for the server to finish (runs until shutdown signal)
    handle.stopped().await;

    info!("TVA RPC Server stopped");
    Ok(())
}

/// Register all JSON-RPC methods on the module.
fn register_methods(module: &mut RpcModule<Arc<RpcState>>) -> Result<()> {
    // --- eth_* methods ---

    module.register_async_method("eth_chainId", |params, ctx, _| async move {
        let _ = params;
        eth::chain_id(&ctx.config)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_blockNumber", |params, ctx, _| async move {
        let _ = params;
        eth::block_number(&ctx.soroban_client)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_getBlockByNumber", |params, ctx, _| async move {
        let p: Vec<serde_json::Value> = params.parse().unwrap_or_default();
        eth::get_block_by_number(&ctx.soroban_client, &p)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_getBlockByHash", |params, ctx, _| async move {
        let p: Vec<serde_json::Value> = params.parse().unwrap_or_default();
        eth::get_block_by_hash(&ctx.soroban_client, &p)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_call", |params, ctx, _| async move {
        let p: Vec<serde_json::Value> = params.parse().unwrap_or_default();
        eth::call(&ctx.soroban_client, &ctx.config, &ctx.abi_registry, &p)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_sendRawTransaction", |params, ctx, _| async move {
        let p: Vec<serde_json::Value> = params.parse().unwrap_or_default();
        eth::send_raw_transaction(&ctx.soroban_client, &ctx.config, &ctx.abi_registry, &p)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_getTransactionReceipt", |params, ctx, _| async move {
        let p: Vec<serde_json::Value> = params.parse().unwrap_or_default();
        eth::get_transaction_receipt(&ctx.soroban_client, &p)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_getTransactionByHash", |params, ctx, _| async move {
        let p: Vec<serde_json::Value> = params.parse().unwrap_or_default();
        eth::get_transaction_by_hash(&ctx.soroban_client, &p)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_getCode", |params, ctx, _| async move {
        let p: Vec<serde_json::Value> = params.parse().unwrap_or_default();
        eth::get_code(&ctx.soroban_client, &p)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_getBalance", |params, ctx, _| async move {
        let p: Vec<serde_json::Value> = params.parse().unwrap_or_default();
        eth::get_balance(&ctx.soroban_client, &p)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_gasPrice", |params, ctx, _| async move {
        let _ = params;
        eth::gas_price(&ctx.soroban_client)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_estimateGas", |params, ctx, _| async move {
        let p: Vec<serde_json::Value> = params.parse().unwrap_or_default();
        eth::estimate_gas(&ctx.soroban_client, &ctx.config, &ctx.abi_registry, &p)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_getTransactionCount", |params, ctx, _| async move {
        let p: Vec<serde_json::Value> = params.parse().unwrap_or_default();
        eth::get_transaction_count(&ctx.soroban_client, &p)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_getLogs", |params, ctx, _| async move {
        let p: Vec<serde_json::Value> = params.parse().unwrap_or_default();
        eth::get_logs(&ctx.soroban_client, &p)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_accounts", |_params, _ctx, _| async move {
        eth::accounts()
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_mining", |_params, _ctx, _| async move {
        eth::mining()
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_hashrate", |_params, _ctx, _| async move {
        eth::hashrate()
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_syncing", |_params, _ctx, _| async move {
        eth::syncing()
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_coinbase", |_params, _ctx, _| async move {
        eth::coinbase()
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("eth_getStorageAt", |params, _ctx, _| async move {
        let p: Vec<serde_json::Value> = params.parse().unwrap_or_default();
        eth::get_storage_at(&p)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    // --- net_* methods ---

    module.register_async_method("net_version", |_params, ctx, _| async move {
        net::version(&ctx.config)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("net_listening", |_params, _ctx, _| async move {
        net::listening()
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("net_peerCount", |_params, _ctx, _| async move {
        net::peer_count()
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    // --- web3_* methods ---

    module.register_async_method("web3_clientVersion", |_params, _ctx, _| async move {
        web3::client_version()
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    module.register_async_method("web3_sha3", |params, _ctx, _| async move {
        let p: Vec<serde_json::Value> = params.parse().unwrap_or_default();
        web3::sha3(&p)
            .await
            .map_err(|e| jsonrpsee_error(&e.to_string()))
    })?;

    // --- Additional compatibility methods ---

    // eth_protocolVersion
    module.register_async_method("eth_protocolVersion", |_params, _ctx, _| async move {
        Ok::<serde_json::Value, jsonrpsee::types::ErrorObjectOwned>(
            serde_json::Value::String("0x41".to_string()), // Protocol version 65
        )
    })?;

    // eth_maxPriorityFeePerGas (EIP-1559)
    module.register_async_method("eth_maxPriorityFeePerGas", |_params, _ctx, _| async move {
        Ok::<serde_json::Value, jsonrpsee::types::ErrorObjectOwned>(
            serde_json::Value::String("0x3b9aca00".to_string()), // 1 gwei
        )
    })?;

    // eth_feeHistory (EIP-1559)
    module.register_async_method("eth_feeHistory", |_params, _ctx, _| async move {
        let response = serde_json::json!({
            "baseFeePerGas": ["0x3b9aca00"],
            "gasUsedRatio": [0.5],
            "oldestBlock": "0x1",
            "reward": [["0x3b9aca00"]]
        });
        Ok::<serde_json::Value, jsonrpsee::types::ErrorObjectOwned>(response)
    })?;

    info!("Registered all RPC methods successfully");
    Ok(())
}

/// Create a jsonrpsee error from a string message.
fn jsonrpsee_error(message: &str) -> jsonrpsee::types::ErrorObjectOwned {
    jsonrpsee::types::ErrorObjectOwned::owned(
        -32603, // Internal error
        message.to_string(),
        None::<()>,
    )
}
