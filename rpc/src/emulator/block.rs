use serde::{Deserialize, Serialize};
use tracing::debug;

/// EVM-formatted block object.
/// Maps Stellar ledger data to EVM block format.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvmBlock {
    /// Block number (ledger sequence)
    pub number: String,
    /// Block hash (derived from ledger)
    pub hash: String,
    /// Parent block hash
    pub parent_hash: String,
    /// Nonce (not used in Stellar, always zero)
    pub nonce: String,
    /// SHA3 of uncles (empty for Stellar)
    pub sha3_uncles: String,
    /// Logs bloom filter
    pub logs_bloom: String,
    /// Transactions root
    pub transactions_root: String,
    /// State root
    pub state_root: String,
    /// Receipts root
    pub receipts_root: String,
    /// Miner/validator address (not applicable for SCP)
    pub miner: String,
    /// Difficulty (always 0 for non-PoW)
    pub difficulty: String,
    /// Total difficulty
    pub total_difficulty: String,
    /// Extra data
    pub extra_data: String,
    /// Block size (estimated)
    pub size: String,
    /// Gas limit
    pub gas_limit: String,
    /// Gas used
    pub gas_used: String,
    /// Block timestamp (ledger close time)
    pub timestamp: String,
    /// Transactions in this block
    pub transactions: serde_json::Value,
    /// Uncle blocks (always empty for Stellar)
    pub uncles: Vec<String>,
    /// Base fee per gas (from Stellar fee model)
    pub base_fee_per_gas: String,
    /// Mix hash (not applicable)
    pub mix_hash: String,
}

impl EvmBlock {
    /// Create an EVM block from Stellar ledger data.
    pub fn from_ledger(
        ledger_sequence: u64,
        close_time: u64,
        tx_count: u32,
        base_fee: u64,
        include_txs: bool,
    ) -> Self {
        let number = format!("0x{:x}", ledger_sequence);
        let hash = ledger_to_block_hash(ledger_sequence);
        let parent_hash = if ledger_sequence > 0 {
            ledger_to_block_hash(ledger_sequence - 1)
        } else {
            format!("0x{}", "0".repeat(64))
        };

        let timestamp = format!("0x{:x}", close_time);

        // Estimate gas from transaction count
        let gas_used = format!("0x{:x}", tx_count as u64 * 21000);
        let gas_limit = "0x1c9c380".to_string(); // 30M gas limit

        let transactions = if include_txs {
            // Full transaction objects would go here
            serde_json::Value::Array(Vec::new())
        } else {
            // Just transaction hashes
            serde_json::Value::Array(Vec::new())
        };

        let base_fee_per_gas = format!("0x{:x}", base_fee * 100); // Convert stroops to gwei-like

        debug!(
            "Created EVM block: number={}, timestamp={}, txs={}",
            number, timestamp, tx_count
        );

        EvmBlock {
            number,
            hash,
            parent_hash,
            nonce: "0x0000000000000000".to_string(),
            sha3_uncles: "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347"
                .to_string(),
            logs_bloom: format!("0x{}", "0".repeat(512)),
            transactions_root: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421"
                .to_string(),
            state_root: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421"
                .to_string(),
            receipts_root: "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421"
                .to_string(),
            miner: format!("0x{}", "0".repeat(40)),
            difficulty: "0x0".to_string(),
            total_difficulty: "0x0".to_string(),
            extra_data: "0x".to_string(),
            size: format!("0x{:x}", 1000 + tx_count * 200),
            gas_limit,
            gas_used,
            timestamp,
            transactions,
            uncles: Vec::new(),
            base_fee_per_gas,
            mix_hash: format!("0x{}", "0".repeat(64)),
        }
    }

    /// Create a block representing the "latest" state.
    pub fn latest(ledger_sequence: u64, close_time: u64, base_fee: u64) -> Self {
        Self::from_ledger(ledger_sequence, close_time, 0, base_fee, false)
    }

    /// Create a "pending" block.
    pub fn pending(ledger_sequence: u64) -> Self {
        let now = chrono::Utc::now().timestamp() as u64;
        Self::from_ledger(ledger_sequence + 1, now, 0, 100, false)
    }
}

/// Generate a deterministic block hash from a ledger sequence number.
/// Uses a simple hash derivation to produce a consistent 32-byte hash.
pub fn ledger_to_block_hash(ledger_sequence: u64) -> String {
    use sha3::{Digest, Keccak256};

    let mut hasher = Keccak256::new();
    hasher.update(b"TVA_BLOCK_");
    hasher.update(ledger_sequence.to_be_bytes());
    let hash = hasher.finalize();
    format!("0x{}", hex::encode(hash))
}

/// Parse an EVM block number parameter.
/// Handles "latest", "earliest", "pending", "safe", "finalized", and hex numbers.
pub fn parse_block_number(block_param: &str, latest_ledger: u64) -> u64 {
    match block_param {
        "latest" | "safe" | "finalized" => latest_ledger,
        "earliest" => 0,
        "pending" => latest_ledger + 1,
        hex_str => {
            let stripped = hex_str.strip_prefix("0x").unwrap_or(hex_str);
            u64::from_str_radix(stripped, 16).unwrap_or(latest_ledger)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ledger_to_block_hash() {
        let hash1 = ledger_to_block_hash(100);
        let hash2 = ledger_to_block_hash(101);
        let hash1_again = ledger_to_block_hash(100);

        assert_ne!(hash1, hash2);
        assert_eq!(hash1, hash1_again);
        assert!(hash1.starts_with("0x"));
        assert_eq!(hash1.len(), 66); // 0x + 64 hex chars
    }

    #[test]
    fn test_parse_block_number() {
        assert_eq!(parse_block_number("latest", 1000), 1000);
        assert_eq!(parse_block_number("earliest", 1000), 0);
        assert_eq!(parse_block_number("pending", 1000), 1001);
        assert_eq!(parse_block_number("0xa", 1000), 10);
        assert_eq!(parse_block_number("0xff", 1000), 255);
    }

    #[test]
    fn test_evm_block_creation() {
        let block = EvmBlock::from_ledger(42, 1700000000, 5, 100, false);
        assert_eq!(block.number, "0x2a");
        assert_eq!(block.timestamp, "0x6553f100");
        assert!(block.hash.starts_with("0x"));
    }
}
