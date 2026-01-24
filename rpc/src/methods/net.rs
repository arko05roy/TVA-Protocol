use anyhow::Result;
use serde_json::Value;
use tracing::debug;

use crate::config::Config;

/// Handler for net_version
/// Returns the network version (chain ID as decimal string).
pub async fn version(config: &Config) -> Result<Value> {
    let version = config.tva_chain_id.to_string();
    debug!("net_version -> {}", version);
    Ok(Value::String(version))
}

/// Handler for net_listening
/// Returns true if the server is actively listening for connections.
pub async fn listening() -> Result<Value> {
    Ok(Value::Bool(true))
}

/// Handler for net_peerCount
/// Returns the number of peers. TVA connects to Soroban RPC, so effectively 1.
pub async fn peer_count() -> Result<Value> {
    Ok(Value::String("0x1".to_string()))
}
