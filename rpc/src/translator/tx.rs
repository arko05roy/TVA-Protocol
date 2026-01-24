use anyhow::{anyhow, Context, Result};
use rlp::Rlp;
use sha3::{Digest, Keccak256};
use tracing::{debug, info, warn};

use super::abi::{AbiRegistry, decode_abi_params};
use super::scval::{abi_param_to_scval, ScVal};

/// Decoded EVM transaction fields.
#[derive(Debug, Clone)]
pub struct DecodedEvmTransaction {
    /// Transaction nonce
    pub nonce: u64,
    /// Gas price (in wei)
    pub gas_price: u64,
    /// Gas limit
    pub gas_limit: u64,
    /// Recipient address (None for contract creation)
    pub to: Option<[u8; 20]>,
    /// Value in wei
    pub value: u128,
    /// Transaction data (calldata)
    pub data: Vec<u8>,
    /// Chain ID (from EIP-155)
    pub chain_id: Option<u64>,
    /// V value of signature
    pub v: u64,
    /// R value of signature
    pub r: Vec<u8>,
    /// S value of signature
    pub s: Vec<u8>,
    /// Raw transaction hash
    pub tx_hash: [u8; 32],
}

/// Decoded calldata from an EVM transaction.
#[derive(Debug, Clone)]
pub struct DecodedCalldata {
    /// 4-byte function selector
    pub selector: [u8; 4],
    /// Function name (if resolved from ABI registry)
    pub function_name: Option<String>,
    /// Raw parameter bytes (after selector)
    pub params_data: Vec<u8>,
    /// Decoded parameter values as ScVals (if ABI is available)
    pub scval_params: Vec<ScVal>,
}

/// Result of translating an EVM transaction for Stellar submission.
#[derive(Debug)]
pub struct TranslatedTransaction {
    /// The XDR-encoded Stellar transaction (base64)
    pub transaction_xdr: String,
    /// The target contract ID on Stellar
    pub contract_id: String,
    /// The function being invoked
    pub function_name: String,
    /// Whether this is a contract creation
    pub is_deployment: bool,
}

/// RLP-decode a raw EVM transaction.
/// Supports both legacy and EIP-155 transaction formats.
pub fn decode_raw_transaction(raw_tx: &[u8]) -> Result<DecodedEvmTransaction> {
    // Check for EIP-2718 typed transactions
    let (tx_data, is_typed) = if !raw_tx.is_empty() && raw_tx[0] < 0x7f {
        // Type prefix: skip it for now (handle Type 2 EIP-1559 in future)
        let tx_type = raw_tx[0];
        debug!("Typed transaction detected: type={}", tx_type);
        (&raw_tx[1..], true)
    } else {
        (raw_tx, false)
    };

    let rlp = Rlp::new(tx_data);

    if !rlp.is_list() {
        return Err(anyhow!("Transaction RLP is not a list"));
    }

    let item_count = rlp.item_count().map_err(|e| anyhow!("RLP parse error: {}", e))?;

    if is_typed && item_count >= 9 {
        // EIP-1559 (Type 2): [chain_id, nonce, max_priority_fee, max_fee, gas_limit, to, value, data, access_list, v, r, s]
        decode_eip1559_transaction(&rlp, raw_tx)
    } else if item_count == 9 {
        // Legacy EIP-155 transaction: [nonce, gasPrice, gasLimit, to, value, data, v, r, s]
        decode_legacy_transaction(&rlp, raw_tx)
    } else if item_count == 6 {
        // Unsigned transaction: [nonce, gasPrice, gasLimit, to, value, data]
        decode_unsigned_transaction(&rlp, raw_tx)
    } else {
        Err(anyhow!(
            "Unexpected RLP item count: {} (expected 6, 9, or typed)",
            item_count
        ))
    }
}

fn decode_legacy_transaction(rlp: &Rlp, raw_tx: &[u8]) -> Result<DecodedEvmTransaction> {
    let nonce: u64 = rlp.val_at(0).unwrap_or(0);
    let gas_price: u64 = rlp.val_at(1).unwrap_or(0);
    let gas_limit: u64 = rlp.val_at(2).unwrap_or(0);

    let to_bytes: Vec<u8> = rlp.val_at(3).unwrap_or_default();
    let to = if to_bytes.len() == 20 {
        let mut addr = [0u8; 20];
        addr.copy_from_slice(&to_bytes);
        Some(addr)
    } else {
        None
    };

    let value_bytes: Vec<u8> = rlp.val_at(4).unwrap_or_default();
    let value = bytes_to_u128(&value_bytes);

    let data: Vec<u8> = rlp.val_at(5).unwrap_or_default();

    let v: u64 = rlp.val_at(6).unwrap_or(0);
    let r: Vec<u8> = rlp.val_at(7).unwrap_or_default();
    let s: Vec<u8> = rlp.val_at(8).unwrap_or_default();

    // EIP-155 chain ID extraction
    let chain_id = if v >= 35 {
        Some((v - 35) / 2)
    } else {
        None
    };

    let tx_hash = Keccak256::digest(raw_tx);
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&tx_hash);

    Ok(DecodedEvmTransaction {
        nonce,
        gas_price,
        gas_limit,
        to,
        value,
        data,
        chain_id,
        v,
        r,
        s,
        tx_hash: hash,
    })
}

fn decode_eip1559_transaction(rlp: &Rlp, raw_tx: &[u8]) -> Result<DecodedEvmTransaction> {
    // EIP-1559: [chain_id, nonce, max_priority_fee, max_fee, gas_limit, to, value, data, access_list, v, r, s]
    let chain_id: u64 = rlp.val_at(0).unwrap_or(0);
    let nonce: u64 = rlp.val_at(1).unwrap_or(0);
    let _max_priority_fee: u64 = rlp.val_at(2).unwrap_or(0);
    let max_fee: u64 = rlp.val_at(3).unwrap_or(0);
    let gas_limit: u64 = rlp.val_at(4).unwrap_or(0);

    let to_bytes: Vec<u8> = rlp.val_at(5).unwrap_or_default();
    let to = if to_bytes.len() == 20 {
        let mut addr = [0u8; 20];
        addr.copy_from_slice(&to_bytes);
        Some(addr)
    } else {
        None
    };

    let value_bytes: Vec<u8> = rlp.val_at(6).unwrap_or_default();
    let value = bytes_to_u128(&value_bytes);

    let data: Vec<u8> = rlp.val_at(7).unwrap_or_default();
    // access_list at index 8 is ignored for now

    let v: u64 = rlp.val_at(9).unwrap_or(0);
    let r: Vec<u8> = rlp.val_at(10).unwrap_or_default();
    let s: Vec<u8> = rlp.val_at(11).unwrap_or_default();

    let tx_hash = Keccak256::digest(raw_tx);
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&tx_hash);

    Ok(DecodedEvmTransaction {
        nonce,
        gas_price: max_fee,
        gas_limit,
        to,
        value,
        data,
        chain_id: Some(chain_id),
        v,
        r,
        s,
        tx_hash: hash,
    })
}

fn decode_unsigned_transaction(rlp: &Rlp, raw_tx: &[u8]) -> Result<DecodedEvmTransaction> {
    let nonce: u64 = rlp.val_at(0).unwrap_or(0);
    let gas_price: u64 = rlp.val_at(1).unwrap_or(0);
    let gas_limit: u64 = rlp.val_at(2).unwrap_or(0);

    let to_bytes: Vec<u8> = rlp.val_at(3).unwrap_or_default();
    let to = if to_bytes.len() == 20 {
        let mut addr = [0u8; 20];
        addr.copy_from_slice(&to_bytes);
        Some(addr)
    } else {
        None
    };

    let value_bytes: Vec<u8> = rlp.val_at(4).unwrap_or_default();
    let value = bytes_to_u128(&value_bytes);

    let data: Vec<u8> = rlp.val_at(5).unwrap_or_default();

    let tx_hash = Keccak256::digest(raw_tx);
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&tx_hash);

    Ok(DecodedEvmTransaction {
        nonce,
        gas_price,
        gas_limit,
        to,
        value,
        data,
        chain_id: None,
        v: 0,
        r: Vec::new(),
        s: Vec::new(),
        tx_hash: hash,
    })
}

/// Decode calldata into function selector and parameters.
pub fn decode_calldata(
    calldata: &[u8],
    contract_address: &str,
    abi_registry: &AbiRegistry,
) -> Result<DecodedCalldata> {
    if calldata.len() < 4 {
        return Err(anyhow!(
            "Calldata too short for function selector (need at least 4 bytes, got {})",
            calldata.len()
        ));
    }

    let mut selector = [0u8; 4];
    selector.copy_from_slice(&calldata[..4]);
    let params_data = calldata[4..].to_vec();

    debug!(
        "Decoding calldata: selector=0x{}, params_len={}",
        hex::encode(selector),
        params_data.len()
    );

    // Look up function in ABI registry
    let function_info = abi_registry.lookup_function(contract_address, &selector);

    let (function_name, scval_params) = if let Some(info) = function_info {
        info!(
            "Resolved function: {} for contract {}",
            info.name, contract_address
        );

        // Decode ABI params
        let decoded_params = decode_abi_params(&params_data, &info.inputs)?;

        // Convert to ScVal
        let mut scvals = Vec::new();
        for (i, param_data) in decoded_params.iter().enumerate() {
            if i < info.inputs.len() {
                let scval = abi_param_to_scval(param_data, &info.inputs[i])?;
                scvals.push(scval);
            }
        }

        (Some(info.name), scvals)
    } else {
        warn!(
            "Function selector 0x{} not found in ABI registry for {}",
            hex::encode(selector),
            contract_address
        );
        // Without ABI, pass raw data as bytes
        let scvals = if !params_data.is_empty() {
            vec![ScVal::Bytes(params_data.clone())]
        } else {
            vec![]
        };
        (None, scvals)
    };

    Ok(DecodedCalldata {
        selector,
        function_name,
        params_data,
        scval_params,
    })
}

/// Build a Soroban InvokeHostFunction transaction XDR.
/// This constructs the transaction envelope for submitting to the Stellar network.
pub fn build_soroban_invoke_tx(
    source_account: &str,
    sequence_number: u64,
    contract_id: &str,
    function_name: &str,
    args: &[ScVal],
    network_passphrase: &str,
    fee: u32,
) -> Result<String> {
    // Build the InvokeContractArgs XDR
    let invoke_args_xdr = build_invoke_contract_args(contract_id, function_name, args)?;

    // Build the transaction XDR
    let tx_xdr = build_transaction_envelope(
        source_account,
        sequence_number,
        &invoke_args_xdr,
        network_passphrase,
        fee,
    )?;

    // Base64 encode
    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&tx_xdr))
}

/// Build InvokeContractArgs XDR.
fn build_invoke_contract_args(
    contract_id: &str,
    function_name: &str,
    args: &[ScVal],
) -> Result<Vec<u8>> {
    let mut xdr = Vec::new();

    // Contract address (SC_ADDRESS_TYPE_CONTRACT = 1)
    let contract_bytes = decode_contract_id(contract_id)?;
    xdr.extend_from_slice(&1u32.to_be_bytes()); // SC_ADDRESS_TYPE_CONTRACT
    xdr.extend_from_slice(&contract_bytes);

    // Function name as Symbol
    let name_bytes = function_name.as_bytes();
    xdr.extend_from_slice(&(name_bytes.len() as u32).to_be_bytes());
    xdr.extend_from_slice(name_bytes);
    let padding = (4 - (name_bytes.len() % 4)) % 4;
    xdr.extend(vec![0u8; padding]);

    // Arguments as ScVal array
    xdr.extend_from_slice(&(args.len() as u32).to_be_bytes());
    for arg in args {
        xdr.extend(arg.to_xdr());
    }

    Ok(xdr)
}

/// Build a minimal transaction envelope XDR for simulation.
/// This is used for eth_call (simulateTransaction) where we do not need a real signature.
fn build_transaction_envelope(
    source_account: &str,
    sequence_number: u64,
    invoke_args: &[u8],
    _network_passphrase: &str,
    fee: u32,
) -> Result<Vec<u8>> {
    let mut xdr = Vec::new();

    // Transaction envelope type: ENVELOPE_TYPE_TX = 2
    xdr.extend_from_slice(&2u32.to_be_bytes());

    // Source account (MuxedAccount - KEY_TYPE_ED25519 = 0)
    let source_key = decode_stellar_address(source_account)?;
    xdr.extend_from_slice(&0u32.to_be_bytes()); // KEY_TYPE_ED25519
    xdr.extend_from_slice(&source_key);

    // Fee
    xdr.extend_from_slice(&fee.to_be_bytes());

    // Sequence number
    xdr.extend_from_slice(&sequence_number.to_be_bytes());

    // Time bounds (optional - none for simulation)
    xdr.extend_from_slice(&0u32.to_be_bytes()); // no preconditions

    // Memo (none)
    xdr.extend_from_slice(&0u32.to_be_bytes()); // MEMO_NONE

    // Operations (1 operation)
    xdr.extend_from_slice(&1u32.to_be_bytes());

    // Operation: no source account override
    xdr.extend_from_slice(&0u32.to_be_bytes()); // false (no source account)

    // Operation type: INVOKE_HOST_FUNCTION = 24
    xdr.extend_from_slice(&24u32.to_be_bytes());

    // Host function type: HOST_FUNCTION_TYPE_INVOKE_CONTRACT = 0
    xdr.extend_from_slice(&0u32.to_be_bytes());

    // InvokeContractArgs
    xdr.extend(invoke_args);

    // Auth entries (empty for simulation)
    xdr.extend_from_slice(&0u32.to_be_bytes());

    // Transaction ext (v0)
    xdr.extend_from_slice(&0u32.to_be_bytes());

    // Signatures (empty for simulation)
    xdr.extend_from_slice(&0u32.to_be_bytes());

    Ok(xdr)
}

/// Decode a Stellar contract ID (C... address) to 32 bytes.
fn decode_contract_id(contract_id: &str) -> Result<[u8; 32]> {
    // If it's a hex string
    if contract_id.starts_with("0x") || contract_id.len() == 64 {
        let hex_str = contract_id.strip_prefix("0x").unwrap_or(contract_id);
        let bytes = hex::decode(hex_str)
            .context("Invalid hex contract ID")?;
        if bytes.len() != 32 {
            return Err(anyhow!("Contract ID hex must be 32 bytes"));
        }
        let mut result = [0u8; 32];
        result.copy_from_slice(&bytes);
        return Ok(result);
    }

    // If it's a Stellar strkey (C...)
    if contract_id.starts_with('C') && contract_id.len() == 56 {
        return decode_strkey(contract_id);
    }

    // Try as raw hex without prefix
    if contract_id.len() == 64 {
        let bytes = hex::decode(contract_id)?;
        let mut result = [0u8; 32];
        result.copy_from_slice(&bytes);
        return Ok(result);
    }

    Err(anyhow!(
        "Unable to parse contract ID: {} (expected C... strkey or 32-byte hex)",
        contract_id
    ))
}

/// Decode a Stellar G... or C... strkey address to 32 raw bytes.
fn decode_strkey(address: &str) -> Result<[u8; 32]> {
    // Stellar strkey: 1 byte version + 32 bytes payload + 2 bytes checksum
    // Encoded as base32
    let decoded = base32_decode(address)?;
    if decoded.len() < 35 {
        return Err(anyhow!("Strkey too short: {} bytes", decoded.len()));
    }
    let mut result = [0u8; 32];
    result.copy_from_slice(&decoded[1..33]);
    Ok(result)
}

/// Decode a Stellar address (G...) to 32 bytes.
fn decode_stellar_address(address: &str) -> Result<[u8; 32]> {
    if address.starts_with('G') && address.len() == 56 {
        return decode_strkey(address);
    }
    // Try as hex
    if address.len() == 64 {
        let bytes = hex::decode(address)?;
        let mut result = [0u8; 32];
        result.copy_from_slice(&bytes);
        return Ok(result);
    }
    Err(anyhow!("Invalid Stellar address format: {}", address))
}

/// Simple base32 decoding (RFC 4648, no padding required).
fn base32_decode(input: &str) -> Result<Vec<u8>> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    let mut result = Vec::new();
    let mut buffer: u64 = 0;
    let mut bits_in_buffer = 0;

    for ch in input.bytes() {
        let val = if ch == b'=' {
            break; // padding
        } else if let Some(pos) = ALPHABET.iter().position(|&c| c == ch) {
            pos as u64
        } else {
            return Err(anyhow!("Invalid base32 character: {}", ch as char));
        };

        buffer = (buffer << 5) | val;
        bits_in_buffer += 5;

        if bits_in_buffer >= 8 {
            bits_in_buffer -= 8;
            result.push((buffer >> bits_in_buffer) as u8);
            buffer &= (1 << bits_in_buffer) - 1;
        }
    }

    Ok(result)
}

/// Convert a byte slice to u128 (big-endian).
fn bytes_to_u128(bytes: &[u8]) -> u128 {
    let mut result: u128 = 0;
    for &b in bytes {
        result = (result << 8) | (b as u128);
    }
    result
}

/// Convert an EVM address (20 bytes) to a Stellar-compatible contract address string.
/// This creates a deterministic mapping by padding the 20-byte address to 32 bytes.
pub fn evm_address_to_stellar_contract(evm_address: &[u8; 20]) -> [u8; 32] {
    let mut stellar_addr = [0u8; 32];
    // Place EVM address in the last 20 bytes (right-aligned)
    stellar_addr[12..32].copy_from_slice(evm_address);
    stellar_addr
}

/// Convert stroops to a wei-equivalent value.
/// 1 XLM = 10^7 stroops, 1 ETH = 10^18 wei
/// We map: 1 XLM = 1 "ETH" for display, so 1 stroop = 10^11 wei-equivalent
pub fn stroops_to_wei(stroops: u64) -> u128 {
    (stroops as u128) * 100_000_000_000 // 10^11
}

/// Convert wei-equivalent to stroops.
pub fn wei_to_stroops(wei: u128) -> u64 {
    (wei / 100_000_000_000) as u64
}

/// Convert a Stellar fee (in stroops) to an EVM gas price.
/// Gas price = fee / gas_limit, represented in wei.
pub fn stellar_fee_to_gas_price(fee_stroops: u64) -> u128 {
    // Represent as a reasonable gas price in gwei range
    // 100 stroops ~= 1 gwei equivalent
    stroops_to_wei(fee_stroops)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bytes_to_u128() {
        assert_eq!(bytes_to_u128(&[0x01]), 1);
        assert_eq!(bytes_to_u128(&[0x01, 0x00]), 256);
        assert_eq!(bytes_to_u128(&[]), 0);
    }

    #[test]
    fn test_stroops_to_wei() {
        assert_eq!(stroops_to_wei(10_000_000), 1_000_000_000_000_000_000); // 1 XLM = 1 ETH equivalent
        assert_eq!(stroops_to_wei(1), 100_000_000_000); // 1 stroop
    }

    #[test]
    fn test_wei_to_stroops() {
        assert_eq!(wei_to_stroops(1_000_000_000_000_000_000), 10_000_000); // 1 ETH = 1 XLM
        assert_eq!(wei_to_stroops(100_000_000_000), 1); // Minimum
    }

    #[test]
    fn test_evm_address_mapping() {
        let evm_addr: [u8; 20] = [0xab; 20];
        let stellar = evm_address_to_stellar_contract(&evm_addr);
        assert_eq!(&stellar[12..32], &evm_addr[..]);
        assert_eq!(&stellar[0..12], &[0u8; 12]);
    }
}
