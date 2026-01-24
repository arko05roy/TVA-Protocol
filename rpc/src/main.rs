//! TVA Protocol RPC Translation Server
//!
//! Entry point for the TVA RPC server that bridges Ethereum JSON-RPC
//! to Stellar/Soroban. Loads configuration from environment/.env file
//! and starts the JSON-RPC server on the configured port.

use anyhow::Result;
use tracing::info;
use tracing_subscriber::EnvFilter;

use tva_rpc::config::Config;
use tva_rpc::server::start_server;

#[tokio::main]
async fn main() -> Result<()> {
    // Load .env file if present
    dotenvy::dotenv().ok();

    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_target(true)
        .with_thread_ids(false)
        .with_file(false)
        .init();

    info!("=== TVA Protocol RPC Translation Server ===");
    info!("Version: {}", env!("CARGO_PKG_VERSION"));
    info!("Bridging Ethereum JSON-RPC to Stellar/Soroban");
    info!("");

    // Load configuration
    let config = Config::from_env()?;

    info!("Configuration:");
    info!("  Chain ID: {} ({})", config.tva_chain_id, config.chain_id_hex());
    info!("  RPC Port: {}", config.tva_rpc_port);
    info!("  Stellar RPC: {}", config.stellar_rpc_url);
    info!("  Network: {}", config.stellar_network_passphrase);
    info!("");

    // Start the RPC server
    start_server(config).await?;

    Ok(())
}
