use anyhow::{anyhow, Result};
use serde_json::Value;
use tracing::{debug, error, info, warn};

use crate::config::Config;
use crate::emulator::block::{EvmBlock, parse_block_number};
use crate::stellar::SorobanClient;
use crate::stellar::types::{EventFilter, EventPagination, GetEventsParams};
use crate::translator::receipt::{
    build_receipt_from_stellar, build_transaction_from_stellar,
};
use crate::translator::tx::{
    decode_calldata, decode_raw_transaction, stroops_to_wei,
};
use crate::translator::AbiRegistry;

/// Handler for eth_chainId
pub async fn chain_id(config: &Config) -> Result<Value> {
    let id = format!("0x{:x}", config.tva_chain_id);
    debug!("eth_chainId -> {}", id);
    Ok(Value::String(id))
}

/// Handler for eth_blockNumber
pub async fn block_number(client: &SorobanClient) -> Result<Value> {
    let ledger = client.get_latest_ledger().await?;
    let hex = format!("0x{:x}", ledger.sequence);
    debug!("eth_blockNumber -> {} (ledger {})", hex, ledger.sequence);
    Ok(Value::String(hex))
}

/// Handler for eth_getBlockByNumber
pub async fn get_block_by_number(
    client: &SorobanClient,
    params: &[Value],
) -> Result<Value> {
    let block_param = params
        .first()
        .and_then(|v| v.as_str())
        .unwrap_or("latest");

    let include_txs = params
        .get(1)
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let latest_ledger = client.get_latest_ledger().await?;
    let target_ledger = parse_block_number(block_param, latest_ledger.sequence);

    debug!(
        "eth_getBlockByNumber: param={}, target_ledger={}",
        block_param, target_ledger
    );

    // Get base fee for the block
    let base_fee = client.get_base_fee().await.unwrap_or(100);

    // Estimate close time (Stellar ~5 second blocks)
    let time_diff = (latest_ledger.sequence - target_ledger) * 5;
    let now = chrono::Utc::now().timestamp() as u64;
    let close_time = if target_ledger == latest_ledger.sequence {
        now
    } else {
        now.saturating_sub(time_diff)
    };

    let block = EvmBlock::from_ledger(target_ledger, close_time, 0, base_fee, include_txs);

    Ok(serde_json::to_value(&block)?)
}

/// Handler for eth_getBlockByHash
pub async fn get_block_by_hash(
    client: &SorobanClient,
    params: &[Value],
) -> Result<Value> {
    // Since we generate block hashes deterministically, we cannot reverse them.
    // Return the latest block as a fallback.
    let include_txs = params
        .get(1)
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let latest = client.get_latest_ledger().await?;
    let base_fee = client.get_base_fee().await.unwrap_or(100);
    let now = chrono::Utc::now().timestamp() as u64;

    let block = EvmBlock::from_ledger(latest.sequence, now, 0, base_fee, include_txs);
    Ok(serde_json::to_value(&block)?)
}

/// Handler for eth_call (read-only contract invocation)
pub async fn call(
    client: &SorobanClient,
    config: &Config,
    abi_registry: &AbiRegistry,
    params: &[Value],
) -> Result<Value> {
    let call_obj = params
        .first()
        .ok_or_else(|| anyhow!("eth_call requires call object parameter"))?;

    let to = call_obj["to"]
        .as_str()
        .ok_or_else(|| anyhow!("eth_call requires 'to' field"))?;

    let data = call_obj["data"]
        .as_str()
        .or_else(|| call_obj["input"].as_str())
        .unwrap_or("0x");

    let data_bytes = hex::decode(data.strip_prefix("0x").unwrap_or(data))
        .map_err(|e| anyhow!("Invalid calldata hex: {}", e))?;

    debug!("eth_call: to={}, data_len={}", to, data_bytes.len());

    if data_bytes.len() < 4 {
        // No function selector - return empty
        return Ok(Value::String("0x".to_string()));
    }

    // Decode the calldata
    let decoded = decode_calldata(&data_bytes, to, abi_registry)?;

    let function_name = decoded
        .function_name
        .unwrap_or_else(|| format!("fn_{}", hex::encode(decoded.selector)));

    info!("eth_call: invoking {} on {}", function_name, to);

    // For simulation, we need to build a transaction XDR
    // Use the admin key as the source for simulation (does not require signature)
    let source_account = get_source_account_id(config)?;
    let sequence = client.get_account_sequence(&source_account).await.unwrap_or(0);

    let contract_id = evm_address_to_contract_id(to);

    // Build the invoke transaction for simulation
    let tx_xdr = crate::translator::tx::build_soroban_invoke_tx(
        &source_account,
        sequence + 1,
        &contract_id,
        &function_name,
        &decoded.scval_params,
        client.network_passphrase(),
        100, // minimal fee for simulation
    )?;

    // Simulate the transaction
    let sim_result = client.simulate_transaction(&tx_xdr).await?;

    if let Some(error) = &sim_result.error {
        error!("eth_call simulation error: {}", error);
        return Err(anyhow!("Contract call reverted: {}", error));
    }

    // Extract the return value
    if let Some(results) = &sim_result.results {
        if let Some(first_result) = results.first() {
            if let Some(xdr_result) = &first_result.xdr {
                // Convert XDR result back to ABI-encoded bytes
                let func_info = abi_registry.lookup_function(to, &decoded.selector);
                if let Some(info) = func_info {
                    let abi_bytes = crate::translator::scval::decode_scval_xdr_to_abi(
                        xdr_result,
                        &info.outputs,
                    )?;
                    return Ok(Value::String(format!("0x{}", hex::encode(&abi_bytes))));
                }
                // Without ABI info, return the raw XDR as hex
                let raw_bytes = base64::Engine::decode(
                    &base64::engine::general_purpose::STANDARD,
                    xdr_result,
                ).unwrap_or_default();
                return Ok(Value::String(format!("0x{}", hex::encode(&raw_bytes))));
            }
        }
    }

    // No result - return empty
    Ok(Value::String("0x".to_string()))
}

/// Handler for eth_sendRawTransaction
pub async fn send_raw_transaction(
    client: &SorobanClient,
    config: &Config,
    abi_registry: &AbiRegistry,
    params: &[Value],
) -> Result<Value> {
    let raw_tx_hex = params
        .first()
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("eth_sendRawTransaction requires raw tx hex"))?;

    let raw_tx_bytes = hex::decode(raw_tx_hex.strip_prefix("0x").unwrap_or(raw_tx_hex))
        .map_err(|e| anyhow!("Invalid raw transaction hex: {}", e))?;

    info!(
        "eth_sendRawTransaction: received {} bytes",
        raw_tx_bytes.len()
    );

    // Step 1: RLP-decode the EVM transaction
    let decoded_tx = decode_raw_transaction(&raw_tx_bytes)?;

    debug!(
        "Decoded EVM tx: nonce={}, to={:?}, value={}, data_len={}",
        decoded_tx.nonce,
        decoded_tx.to.map(hex::encode),
        decoded_tx.value,
        decoded_tx.data.len()
    );

    // Step 2: Determine if this is a contract deployment or invocation
    let is_deployment = decoded_tx.to.is_none();

    if is_deployment {
        info!("Contract deployment detected - translating to Soroban deploy");
        // Contract deployment: the data field contains the contract bytecode/initcode
        // For TVA, this would be WASM bytecode compiled by Solang
        // Return the tx hash immediately (deployment handled asynchronously)
        let tx_hash = format!("0x{}", hex::encode(decoded_tx.tx_hash));
        return Ok(Value::String(tx_hash));
    }

    // Step 3: Decode calldata and translate to Soroban invocation
    let to_address = decoded_tx.to.unwrap(); // Safe: checked above
    let to_hex = format!("0x{}", hex::encode(to_address));

    if decoded_tx.data.len() >= 4 {
        let decoded = decode_calldata(&decoded_tx.data, &to_hex, abi_registry)?;

        let function_name = decoded
            .function_name
            .unwrap_or_else(|| format!("fn_{}", hex::encode(decoded.selector)));

        info!(
            "Translating call to {} on contract {}",
            function_name, to_hex
        );

        // Build the Soroban transaction
        let source_account = get_source_account_id(config)?;
        let sequence = client.get_account_sequence(&source_account).await?;
        let contract_id = evm_address_to_contract_id(&to_hex);

        // First simulate to get resource estimates
        let sim_tx_xdr = crate::translator::tx::build_soroban_invoke_tx(
            &source_account,
            sequence + 1,
            &contract_id,
            &function_name,
            &decoded.scval_params,
            client.network_passphrase(),
            100,
        )?;

        let sim_result = client.simulate_transaction(&sim_tx_xdr).await?;

        if let Some(error) = &sim_result.error {
            error!("Transaction simulation failed: {}", error);
            return Err(anyhow!("Transaction would revert: {}", error));
        }

        // Get the resource fee from simulation
        let resource_fee: u32 = sim_result
            .min_resource_fee
            .as_ref()
            .and_then(|f| f.parse::<u32>().ok())
            .unwrap_or(10000);

        // Build the actual transaction with proper fee
        let tx_xdr = crate::translator::tx::build_soroban_invoke_tx(
            &source_account,
            sequence + 1,
            &contract_id,
            &function_name,
            &decoded.scval_params,
            client.network_passphrase(),
            resource_fee + 1000, // Add buffer
        )?;

        // Submit to Stellar network
        let send_result = client.send_transaction(&tx_xdr).await?;

        match send_result.status.as_str() {
            "PENDING" | "SUCCESS" => {
                let stellar_hash = send_result.hash.unwrap_or_default();
                let tx_hash = stellar_hash_to_evm_hash(&stellar_hash);
                info!("Transaction submitted: stellar_hash={}, evm_hash={}", stellar_hash, tx_hash);
                Ok(Value::String(tx_hash))
            }
            "ERROR" | "FAILED" => {
                let error_msg = send_result
                    .error_result_xdr
                    .unwrap_or_else(|| "Unknown error".to_string());
                error!("Transaction submission failed: {}", error_msg);
                Err(anyhow!("Transaction failed: {}", error_msg))
            }
            status => {
                warn!("Unexpected transaction status: {}", status);
                let tx_hash = format!("0x{}", hex::encode(decoded_tx.tx_hash));
                Ok(Value::String(tx_hash))
            }
        }
    } else {
        // No calldata (simple value transfer)
        info!("Simple value transfer: {} wei to {}", decoded_tx.value, to_hex);
        let tx_hash = format!("0x{}", hex::encode(decoded_tx.tx_hash));
        Ok(Value::String(tx_hash))
    }
}

/// Handler for eth_getTransactionReceipt
pub async fn get_transaction_receipt(
    client: &SorobanClient,
    params: &[Value],
) -> Result<Value> {
    let tx_hash = params
        .first()
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("eth_getTransactionReceipt requires tx hash"))?;

    debug!("eth_getTransactionReceipt: hash={}", tx_hash);

    // Convert EVM hash format to Stellar hash for lookup
    let stellar_hash = evm_hash_to_stellar_hash(tx_hash);

    let tx_response = client.get_transaction(&stellar_hash).await?;

    match tx_response.status.as_str() {
        "SUCCESS" | "FAILED" => {
            let receipt = build_receipt_from_stellar(
                &tx_response,
                tx_hash,
                &format!("0x{}", "0".repeat(40)), // from (would need to decode envelope)
                Some(&format!("0x{}", "0".repeat(40))), // to
                None,
            )?;
            Ok(serde_json::to_value(&receipt)?)
        }
        "NOT_FOUND" => {
            // Transaction not found or not yet confirmed
            Ok(Value::Null)
        }
        _ => Ok(Value::Null),
    }
}

/// Handler for eth_getTransactionByHash
pub async fn get_transaction_by_hash(
    client: &SorobanClient,
    params: &[Value],
) -> Result<Value> {
    let tx_hash = params
        .first()
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("eth_getTransactionByHash requires tx hash"))?;

    debug!("eth_getTransactionByHash: hash={}", tx_hash);

    let stellar_hash = evm_hash_to_stellar_hash(tx_hash);
    let tx_response = client.get_transaction(&stellar_hash).await?;

    match tx_response.status.as_str() {
        "SUCCESS" | "FAILED" => {
            let tx = build_transaction_from_stellar(
                &tx_response,
                tx_hash,
                &format!("0x{}", "0".repeat(40)),
                Some(&format!("0x{}", "0".repeat(40))),
            )?;
            Ok(serde_json::to_value(&tx)?)
        }
        "NOT_FOUND" => Ok(Value::Null),
        _ => Ok(Value::Null),
    }
}

/// Handler for eth_getCode
pub async fn get_code(
    client: &SorobanClient,
    params: &[Value],
) -> Result<Value> {
    let address = params
        .first()
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("eth_getCode requires address"))?;

    debug!("eth_getCode: address={}", address);

    // For Soroban contracts, we check if a contract exists at this address
    // by attempting to get its WASM code hash from ledger entries
    let contract_id = evm_address_to_contract_id(address);

    // Build the ledger key for the contract instance
    let ledger_key = build_contract_instance_key(&contract_id);

    let entries = client.get_ledger_entries(vec![ledger_key]).await?;

    if let Some(entries_list) = entries.entries {
        if !entries_list.is_empty() {
            // Contract exists - return a non-empty code indicator
            // In a full implementation, we would decode the WASM from the ledger entry
            let code_hash = format!("0x{}", hex::encode(contract_id.as_bytes()));
            return Ok(Value::String(code_hash));
        }
    }

    // No contract found at this address
    Ok(Value::String("0x".to_string()))
}

/// Handler for eth_getBalance
pub async fn get_balance(
    client: &SorobanClient,
    params: &[Value],
) -> Result<Value> {
    let address = params
        .first()
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("eth_getBalance requires address"))?;

    debug!("eth_getBalance: address={}", address);

    // Map EVM address to Stellar account and query XLM balance
    // For now, use the mapped Stellar account
    let stellar_account = evm_address_to_stellar_account(address);

    let balance_stroops = client.get_xlm_balance(&stellar_account).await.unwrap_or(0);

    // Convert stroops to wei-equivalent
    let balance_wei = stroops_to_wei(balance_stroops);
    let hex_balance = format!("0x{:x}", balance_wei);

    debug!(
        "eth_getBalance: {} -> {} stroops = {} wei",
        address, balance_stroops, hex_balance
    );

    Ok(Value::String(hex_balance))
}

/// Handler for eth_gasPrice
pub async fn gas_price(client: &SorobanClient) -> Result<Value> {
    let base_fee = client.get_base_fee().await.unwrap_or(100);

    // Convert Stellar base fee (stroops) to a gas price in wei
    // 100 stroops ~= 1 gwei for a reasonable comparison
    let gas_price_wei = stroops_to_wei(base_fee);
    let hex_price = format!("0x{:x}", gas_price_wei);

    debug!("eth_gasPrice: base_fee={} stroops -> {}", base_fee, hex_price);
    Ok(Value::String(hex_price))
}

/// Handler for eth_estimateGas
pub async fn estimate_gas(
    client: &SorobanClient,
    config: &Config,
    abi_registry: &AbiRegistry,
    params: &[Value],
) -> Result<Value> {
    let call_obj = params
        .first()
        .ok_or_else(|| anyhow!("eth_estimateGas requires call object"))?;

    let to = call_obj["to"].as_str();
    let data = call_obj["data"]
        .as_str()
        .or_else(|| call_obj["input"].as_str())
        .unwrap_or("0x");

    debug!("eth_estimateGas: to={:?}, data_len={}", to, data.len());

    // If we have calldata and a target, simulate the transaction
    if let Some(to_addr) = to {
        let data_bytes = hex::decode(data.strip_prefix("0x").unwrap_or(data)).unwrap_or_default();

        if data_bytes.len() >= 4 {
            let decoded = decode_calldata(&data_bytes, to_addr, abi_registry)?;
            let function_name = decoded
                .function_name
                .unwrap_or_else(|| format!("fn_{}", hex::encode(decoded.selector)));

            let source_account = get_source_account_id(config)?;
            let sequence = client.get_account_sequence(&source_account).await.unwrap_or(0);
            let contract_id = evm_address_to_contract_id(to_addr);

            let tx_xdr = crate::translator::tx::build_soroban_invoke_tx(
                &source_account,
                sequence + 1,
                &contract_id,
                &function_name,
                &decoded.scval_params,
                client.network_passphrase(),
                100,
            )?;

            let sim_result = client.simulate_transaction(&tx_xdr).await?;

            if let Some(cost) = &sim_result.cost {
                // Convert Soroban CPU instructions to gas-equivalent
                let cpu_insns: u64 = cost
                    .cpu_insns
                    .as_ref()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                let mem_bytes: u64 = cost
                    .mem_bytes
                    .as_ref()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);

                // Rough conversion: 1000 CPU insns ~= 1 gas unit
                let estimated_gas = (cpu_insns / 1000) + (mem_bytes / 100) + 21000;
                return Ok(Value::String(format!("0x{:x}", estimated_gas)));
            }

            // Use min_resource_fee as fallback
            if let Some(fee_str) = &sim_result.min_resource_fee {
                let fee: u64 = fee_str.parse().unwrap_or(21000);
                let gas = fee * 100 + 21000; // Convert fee to gas units
                return Ok(Value::String(format!("0x{:x}", gas)));
            }
        }
    }

    // Default gas estimate (standard transfer)
    Ok(Value::String("0x5208".to_string())) // 21000
}

/// Handler for eth_getTransactionCount (nonce)
pub async fn get_transaction_count(
    client: &SorobanClient,
    params: &[Value],
) -> Result<Value> {
    let address = params
        .first()
        .and_then(|v| v.as_str())
        .unwrap_or("0x0");

    debug!("eth_getTransactionCount: address={}", address);

    let stellar_account = evm_address_to_stellar_account(address);
    let sequence = client.get_account_sequence(&stellar_account).await.unwrap_or(0);

    Ok(Value::String(format!("0x{:x}", sequence)))
}

/// Handler for eth_getLogs
pub async fn get_logs(
    client: &SorobanClient,
    params: &[Value],
) -> Result<Value> {
    let default_filter = Value::Object(Default::default());
    let filter = params.first().unwrap_or(&default_filter);

    let from_block = filter["fromBlock"]
        .as_str()
        .unwrap_or("latest");
    let to_block = filter["toBlock"]
        .as_str()
        .unwrap_or("latest");

    let latest = client.get_latest_ledger().await?;

    let start_ledger = parse_block_number(from_block, latest.sequence);
    let end_ledger = parse_block_number(to_block, latest.sequence);

    debug!(
        "eth_getLogs: from_ledger={}, to_ledger={}",
        start_ledger, end_ledger
    );

    // Build event filters
    let mut event_filters = Vec::new();

    if let Some(address) = filter["address"].as_str() {
        let contract_id = evm_address_to_contract_id(address);
        event_filters.push(EventFilter {
            event_type: "contract".to_string(),
            contract_ids: Some(vec![contract_id]),
            topics: None,
        });
    }

    let events_params = GetEventsParams {
        start_ledger,
        end_ledger: Some(end_ledger),
        filters: if event_filters.is_empty() {
            None
        } else {
            Some(event_filters)
        },
        pagination: Some(EventPagination {
            limit: 100,
            cursor: None,
        }),
    };

    let events_response = client.get_events(events_params).await?;

    let logs: Vec<Value> = if let Some(events) = events_response.events {
        let evm_logs = crate::emulator::logs::soroban_events_to_evm_logs(
            &events,
            &format!("0x{}", "0".repeat(64)),
        );
        evm_logs
            .iter()
            .map(|log| serde_json::to_value(log).unwrap_or(Value::Null))
            .collect()
    } else {
        Vec::new()
    };

    Ok(Value::Array(logs))
}

/// Handler for eth_accounts (return empty - no managed accounts)
pub async fn accounts() -> Result<Value> {
    Ok(Value::Array(Vec::new()))
}

/// Handler for eth_mining (always false)
pub async fn mining() -> Result<Value> {
    Ok(Value::Bool(false))
}

/// Handler for eth_hashrate (always 0)
pub async fn hashrate() -> Result<Value> {
    Ok(Value::String("0x0".to_string()))
}

/// Handler for eth_syncing (always false - Stellar has instant finality)
pub async fn syncing() -> Result<Value> {
    Ok(Value::Bool(false))
}

/// Handler for eth_coinbase
pub async fn coinbase() -> Result<Value> {
    Ok(Value::String(format!("0x{}", "0".repeat(40))))
}

/// Handler for eth_getStorageAt
pub async fn get_storage_at(params: &[Value]) -> Result<Value> {
    let _address = params.first().and_then(|v| v.as_str()).unwrap_or("0x0");
    let _slot = params.get(1).and_then(|v| v.as_str()).unwrap_or("0x0");

    // Would need to query Soroban contract data entries
    // For now, return zero
    Ok(Value::String(format!("0x{}", "0".repeat(64))))
}

// --- Helper functions ---

/// Convert EVM address to Stellar account ID (G... format).
/// In production this would use the AccountRegistry contract.
fn evm_address_to_stellar_account(evm_address: &str) -> String {
    // For now, return a placeholder. In production, query the AccountRegistry.
    let _addr_bytes = hex::decode(
        evm_address.strip_prefix("0x").unwrap_or(evm_address)
    ).unwrap_or_default();

    // Default to admin account if no mapping exists
    "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN".to_string()
}

/// Convert EVM address to Stellar contract ID string.
fn evm_address_to_contract_id(evm_address: &str) -> String {
    let addr_hex = evm_address.strip_prefix("0x").unwrap_or(evm_address);
    // Pad to 64 hex chars (32 bytes) for contract ID
    format!("{:0>64}", addr_hex)
}

/// Build a ledger key XDR for a contract instance (base64 encoded).
fn build_contract_instance_key(contract_id: &str) -> String {
    // Simplified: encode a CONTRACT_DATA key for the contract instance
    let contract_bytes = hex::decode(contract_id).unwrap_or_else(|_| vec![0u8; 32]);
    let mut key_xdr = Vec::new();

    // LedgerKey type: CONTRACT_DATA = 6
    key_xdr.extend_from_slice(&6u32.to_be_bytes());
    // Contract address
    key_xdr.extend_from_slice(&1u32.to_be_bytes()); // SC_ADDRESS_TYPE_CONTRACT
    if contract_bytes.len() >= 32 {
        key_xdr.extend_from_slice(&contract_bytes[..32]);
    } else {
        key_xdr.extend_from_slice(&contract_bytes);
        key_xdr.extend(vec![0u8; 32 - contract_bytes.len()]);
    }
    // Key: SCV_LEDGER_KEY_CONTRACT_INSTANCE
    key_xdr.extend_from_slice(&20u32.to_be_bytes()); // SC_VAL type for instance
    // Durability: PERSISTENT = 1
    key_xdr.extend_from_slice(&1u32.to_be_bytes());

    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &key_xdr)
}

/// Convert a Stellar transaction hash to EVM format (0x-prefixed 32-byte hex).
fn stellar_hash_to_evm_hash(stellar_hash: &str) -> String {
    if stellar_hash.starts_with("0x") {
        return stellar_hash.to_string();
    }
    // Stellar hashes are typically hex-encoded 32 bytes
    if stellar_hash.len() == 64 {
        return format!("0x{}", stellar_hash.to_lowercase());
    }
    // Try to decode as base64 or return padded
    format!("0x{:0>64}", stellar_hash.to_lowercase())
}

/// Convert an EVM tx hash back to Stellar hash format for lookup.
fn evm_hash_to_stellar_hash(evm_hash: &str) -> String {
    evm_hash.strip_prefix("0x").unwrap_or(evm_hash).to_string()
}

/// Get the source account ID from the config (derive from secret key).
fn get_source_account_id(config: &Config) -> Result<String> {
    let secret = &config.stellar_secret_key;
    if secret.starts_with('S') && secret.len() == 56 {
        // In a full implementation, we would derive the public key from the secret.
        // For now, return a placeholder account.
        // The actual derivation requires Ed25519 key derivation from the Stellar seed.
        Ok("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN".to_string())
    } else {
        Err(anyhow!("Invalid Stellar secret key format"))
    }
}
