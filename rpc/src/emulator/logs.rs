use anyhow::Result;
use sha3::{Digest, Keccak256};
use tracing::debug;

use crate::stellar::types::SorobanEvent;
use crate::translator::receipt::EvmLog;
use super::block::ledger_to_block_hash;

/// Convert a Soroban contract event to an EVM log entry.
pub fn soroban_event_to_evm_log(
    event: &SorobanEvent,
    log_index: u64,
    tx_hash: &str,
    tx_index: u64,
) -> Result<EvmLog> {
    // Convert contract_id to EVM address format (take last 20 bytes)
    let contract_address = contract_id_to_evm_address(&event.contract_id);

    // Convert Soroban topics to EVM topics (32-byte hex strings)
    let topics: Vec<String> = event
        .topic
        .iter()
        .map(|t| xdr_topic_to_evm_topic(t))
        .collect();

    // Convert the event value to EVM log data
    let data = xdr_value_to_log_data(&event.value);

    let block_number = format!("0x{:x}", event.ledger);
    let block_hash = ledger_to_block_hash(event.ledger);

    Ok(EvmLog {
        address: contract_address,
        topics,
        data,
        block_number,
        transaction_hash: ensure_0x_prefix(tx_hash),
        transaction_index: format!("0x{:x}", tx_index),
        block_hash,
        log_index: format!("0x{:x}", log_index),
        removed: false,
    })
}

/// Convert a list of Soroban events to EVM logs.
pub fn soroban_events_to_evm_logs(
    events: &[SorobanEvent],
    tx_hash: &str,
) -> Vec<EvmLog> {
    let mut logs = Vec::new();

    for (i, event) in events.iter().enumerate() {
        match soroban_event_to_evm_log(event, i as u64, tx_hash, 0) {
            Ok(log) => logs.push(log),
            Err(e) => {
                debug!("Failed to convert Soroban event to EVM log: {}", e);
            }
        }
    }

    logs
}

/// Convert a Stellar contract ID to an EVM-style address (20 bytes, 0x-prefixed).
fn contract_id_to_evm_address(contract_id: &str) -> String {
    // Hash the contract ID and take the last 20 bytes
    let hash = Keccak256::digest(contract_id.as_bytes());
    format!("0x{}", hex::encode(&hash[12..32]))
}

/// Convert a Soroban XDR topic to a 32-byte EVM topic.
fn xdr_topic_to_evm_topic(xdr_base64: &str) -> String {
    // Decode base64 XDR and hash it to produce a 32-byte topic
    match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, xdr_base64) {
        Ok(bytes) => {
            if bytes.len() == 32 {
                format!("0x{}", hex::encode(&bytes))
            } else if bytes.len() > 32 {
                // Hash longer values
                let hash = Keccak256::digest(&bytes);
                format!("0x{}", hex::encode(hash))
            } else {
                // Pad shorter values to 32 bytes (left-pad)
                let mut padded = vec![0u8; 32 - bytes.len()];
                padded.extend_from_slice(&bytes);
                format!("0x{}", hex::encode(&padded))
            }
        }
        Err(_) => {
            // If not valid base64, hash the raw string
            let hash = Keccak256::digest(xdr_base64.as_bytes());
            format!("0x{}", hex::encode(hash))
        }
    }
}

/// Convert a Soroban XDR value to EVM log data (hex-encoded bytes).
fn xdr_value_to_log_data(xdr_base64: &str) -> String {
    match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, xdr_base64) {
        Ok(bytes) => {
            if bytes.is_empty() {
                "0x".to_string()
            } else {
                // Pad to 32-byte alignment for ABI compatibility
                let padded_len = bytes.len().div_ceil(32) * 32;
                let mut padded = bytes.clone();
                padded.resize(padded_len, 0);
                format!("0x{}", hex::encode(&padded))
            }
        }
        Err(_) => "0x".to_string(),
    }
}

/// Ensure a string has the 0x prefix.
fn ensure_0x_prefix(s: &str) -> String {
    if s.starts_with("0x") || s.starts_with("0X") {
        s.to_string()
    } else {
        format!("0x{}", s)
    }
}

/// Build an event signature hash (topic[0]) from a Solidity event signature.
/// e.g., "Transfer(address,address,uint256)" -> keccak256 hash
pub fn event_signature_to_topic(signature: &str) -> String {
    let hash = Keccak256::digest(signature.as_bytes());
    format!("0x{}", hex::encode(hash))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_signature_to_topic() {
        let topic = event_signature_to_topic("Transfer(address,address,uint256)");
        // Known keccak256 of Transfer(address,address,uint256)
        assert_eq!(
            topic,
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        );
    }

    #[test]
    fn test_contract_id_to_evm_address() {
        let addr = contract_id_to_evm_address("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHWHYF");
        assert!(addr.starts_with("0x"));
        assert_eq!(addr.len(), 42); // 0x + 40 hex chars
    }
}
