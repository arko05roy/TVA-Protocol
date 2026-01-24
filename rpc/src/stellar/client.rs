use anyhow::{anyhow, Context, Result};
use reqwest::Client;
use tracing::{debug, error, info};

use super::types::*;

/// Client wrapper for Soroban RPC API calls.
#[derive(Clone)]
pub struct SorobanClient {
    http_client: Client,
    rpc_url: String,
    network_passphrase: String,
}

impl SorobanClient {
    /// Create a new Soroban RPC client.
    pub fn new(rpc_url: &str, network_passphrase: &str) -> Self {
        Self {
            http_client: Client::new(),
            rpc_url: rpc_url.to_string(),
            network_passphrase: network_passphrase.to_string(),
        }
    }

    /// Get the network passphrase.
    pub fn network_passphrase(&self) -> &str {
        &self.network_passphrase
    }

    /// Send a JSON-RPC request to the Soroban RPC endpoint.
    async fn send_request(&self, request: &SorobanRpcRequest) -> Result<SorobanRpcResponse> {
        debug!("Sending Soroban RPC request: method={}", request.method);

        let response = self
            .http_client
            .post(&self.rpc_url)
            .json(request)
            .send()
            .await
            .context("Failed to send request to Soroban RPC")?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            error!("Soroban RPC returned HTTP {}: {}", status, body);
            return Err(anyhow!("Soroban RPC HTTP error: {} - {}", status, body));
        }

        let rpc_response: SorobanRpcResponse = response
            .json()
            .await
            .context("Failed to parse Soroban RPC response")?;

        if let Some(err) = &rpc_response.error {
            error!(
                "Soroban RPC error: code={}, message={}",
                err.code, err.message
            );
            return Err(anyhow!(
                "Soroban RPC error {}: {}",
                err.code,
                err.message
            ));
        }

        Ok(rpc_response)
    }

    /// Check the health of the Soroban RPC node.
    pub async fn get_health(&self) -> Result<HealthResponse> {
        let request = SorobanRpcRequest::new("getHealth", None);
        let response = self.send_request(&request).await?;
        let result = response
            .result
            .ok_or_else(|| anyhow!("No result in getHealth response"))?;
        serde_json::from_value(result).context("Failed to parse getHealth response")
    }

    /// Get the latest ledger information.
    pub async fn get_latest_ledger(&self) -> Result<LatestLedgerResponse> {
        let request = SorobanRpcRequest::new("getLatestLedger", None);
        let response = self.send_request(&request).await?;
        let result = response
            .result
            .ok_or_else(|| anyhow!("No result in getLatestLedger response"))?;
        serde_json::from_value(result).context("Failed to parse getLatestLedger response")
    }

    /// Get a transaction by its hash.
    pub async fn get_transaction(&self, tx_hash: &str) -> Result<GetTransactionResponse> {
        let params = serde_json::json!({ "hash": tx_hash });
        let request = SorobanRpcRequest::new("getTransaction", Some(params));
        let response = self.send_request(&request).await?;
        let result = response
            .result
            .ok_or_else(|| anyhow!("No result in getTransaction response"))?;
        serde_json::from_value(result).context("Failed to parse getTransaction response")
    }

    /// Simulate a transaction (for eth_call and eth_estimateGas).
    pub async fn simulate_transaction(
        &self,
        transaction_xdr: &str,
    ) -> Result<SimulateTransactionResponse> {
        let params = serde_json::json!({ "transaction": transaction_xdr });
        let request = SorobanRpcRequest::new("simulateTransaction", Some(params));
        let response = self.send_request(&request).await?;
        let result = response
            .result
            .ok_or_else(|| anyhow!("No result in simulateTransaction response"))?;
        serde_json::from_value(result).context("Failed to parse simulateTransaction response")
    }

    /// Send a transaction to the network.
    pub async fn send_transaction(
        &self,
        transaction_xdr: &str,
    ) -> Result<SendTransactionResponse> {
        let params = serde_json::json!({ "transaction": transaction_xdr });
        let request = SorobanRpcRequest::new("sendTransaction", Some(params));
        let response = self.send_request(&request).await?;
        let result = response
            .result
            .ok_or_else(|| anyhow!("No result in sendTransaction response"))?;
        serde_json::from_value(result).context("Failed to parse sendTransaction response")
    }

    /// Get ledger entries (for contract data, account balances, etc.).
    pub async fn get_ledger_entries(
        &self,
        keys: Vec<String>,
    ) -> Result<GetLedgerEntriesResponse> {
        let params = serde_json::json!({ "keys": keys });
        let request = SorobanRpcRequest::new("getLedgerEntries", Some(params));
        let response = self.send_request(&request).await?;
        let result = response
            .result
            .ok_or_else(|| anyhow!("No result in getLedgerEntries response"))?;
        serde_json::from_value(result).context("Failed to parse getLedgerEntries response")
    }

    /// Get events (for eth_getLogs).
    pub async fn get_events(&self, params: GetEventsParams) -> Result<GetEventsResponse> {
        let params_value = serde_json::to_value(params)
            .context("Failed to serialize getEvents params")?;
        let request = SorobanRpcRequest::new("getEvents", Some(params_value));
        let response = self.send_request(&request).await?;
        let result = response
            .result
            .ok_or_else(|| anyhow!("No result in getEvents response"))?;
        serde_json::from_value(result).context("Failed to parse getEvents response")
    }

    /// Get the account sequence number for a Stellar address.
    /// Uses Horizon API since Soroban RPC does not expose this directly.
    pub async fn get_account_sequence(&self, account_id: &str) -> Result<u64> {
        // Derive Horizon URL from Soroban RPC URL
        let horizon_url = if self.rpc_url.contains("testnet") {
            "https://horizon-testnet.stellar.org"
        } else {
            "https://horizon.stellar.org"
        };

        let url = format!("{}/accounts/{}", horizon_url, account_id);
        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .context("Failed to query Horizon for account")?;

        if !response.status().is_success() {
            return Ok(0); // Account not found, return 0
        }

        let body: serde_json::Value = response.json().await?;
        let sequence = body["sequence"]
            .as_str()
            .unwrap_or("0")
            .parse::<u64>()
            .unwrap_or(0);

        Ok(sequence)
    }

    /// Get the XLM balance for a Stellar address in stroops.
    pub async fn get_xlm_balance(&self, account_id: &str) -> Result<u64> {
        let horizon_url = if self.rpc_url.contains("testnet") {
            "https://horizon-testnet.stellar.org"
        } else {
            "https://horizon.stellar.org"
        };

        let url = format!("{}/accounts/{}", horizon_url, account_id);
        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .context("Failed to query Horizon for balance")?;

        if !response.status().is_success() {
            return Ok(0);
        }

        let body: serde_json::Value = response.json().await?;
        let balances = body["balances"].as_array();

        if let Some(balances) = balances {
            for balance in balances {
                if balance["asset_type"].as_str() == Some("native") {
                    let balance_str = balance["balance"].as_str().unwrap_or("0");
                    // Convert from XLM (7 decimal) to stroops
                    let parts: Vec<&str> = balance_str.split('.').collect();
                    let whole: u64 = parts[0].parse().unwrap_or(0);
                    let frac: u64 = if parts.len() > 1 {
                        let frac_str = format!("{:0<7}", parts[1]);
                        frac_str[..7].parse().unwrap_or(0)
                    } else {
                        0
                    };
                    return Ok(whole * 10_000_000 + frac);
                }
            }
        }

        Ok(0)
    }

    /// Get the current base fee from the network.
    pub async fn get_base_fee(&self) -> Result<u64> {
        let horizon_url = if self.rpc_url.contains("testnet") {
            "https://horizon-testnet.stellar.org"
        } else {
            "https://horizon.stellar.org"
        };

        let url = format!("{}/fee_stats", horizon_url);
        let response = self
            .http_client
            .get(&url)
            .send()
            .await
            .context("Failed to query fee stats")?;

        if !response.status().is_success() {
            return Ok(100); // Default base fee: 100 stroops
        }

        let body: serde_json::Value = response.json().await?;
        let fee = body["last_ledger_base_fee"]
            .as_str()
            .unwrap_or("100")
            .parse::<u64>()
            .unwrap_or(100);

        Ok(fee)
    }

    /// Wait for a transaction to be confirmed, polling getTransaction.
    pub async fn wait_for_transaction(
        &self,
        tx_hash: &str,
        max_attempts: u32,
    ) -> Result<GetTransactionResponse> {
        info!("Waiting for transaction {} to confirm...", tx_hash);

        for attempt in 0..max_attempts {
            let result = self.get_transaction(tx_hash).await?;
            match result.status.as_str() {
                "SUCCESS" => {
                    info!("Transaction {} confirmed at attempt {}", tx_hash, attempt);
                    return Ok(result);
                }
                "FAILED" => {
                    return Err(anyhow!(
                        "Transaction {} failed: {:?}",
                        tx_hash,
                        result.result_xdr
                    ));
                }
                "NOT_FOUND" => {
                    debug!(
                        "Transaction {} not yet found, attempt {}/{}",
                        tx_hash, attempt, max_attempts
                    );
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
                status => {
                    debug!("Transaction {} status: {}", tx_hash, status);
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            }
        }

        Err(anyhow!(
            "Transaction {} not confirmed after {} attempts",
            tx_hash,
            max_attempts
        ))
    }
}
