use anyhow::Result;
use serde_json::Value;
use sha3::{Digest, Keccak256};
use tracing::debug;

/// Handler for web3_clientVersion
/// Returns the client version string.
pub async fn client_version() -> Result<Value> {
    let version = format!("TVA/{}", env!("CARGO_PKG_VERSION"));
    debug!("web3_clientVersion -> {}", version);
    Ok(Value::String(version))
}

/// Handler for web3_sha3
/// Returns the Keccak-256 hash of the given data.
pub async fn sha3(params: &[Value]) -> Result<Value> {
    let data_hex = params
        .first()
        .and_then(|v| v.as_str())
        .unwrap_or("0x");

    let data_bytes = hex::decode(data_hex.strip_prefix("0x").unwrap_or(data_hex))
        .unwrap_or_default();

    let hash = Keccak256::digest(&data_bytes);
    let result = format!("0x{}", hex::encode(hash));

    debug!("web3_sha3: input_len={} -> {}", data_bytes.len(), result);
    Ok(Value::String(result))
}
