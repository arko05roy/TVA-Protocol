use serde::{Deserialize, Serialize};

/// JSON-RPC request to Soroban RPC
#[derive(Debug, Serialize)]
pub struct SorobanRpcRequest {
    pub jsonrpc: String,
    pub id: u64,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

impl SorobanRpcRequest {
    pub fn new(method: &str, params: Option<serde_json::Value>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: 1,
            method: method.to_string(),
            params,
        }
    }
}

/// JSON-RPC response from Soroban RPC
#[derive(Debug, Deserialize)]
pub struct SorobanRpcResponse {
    pub jsonrpc: String,
    pub id: u64,
    pub result: Option<serde_json::Value>,
    pub error: Option<SorobanRpcError>,
}

/// JSON-RPC error from Soroban RPC
#[derive(Debug, Deserialize)]
pub struct SorobanRpcError {
    pub code: i64,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

/// Response from getLatestLedger
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestLedgerResponse {
    pub id: String,
    pub protocol_version: u32,
    pub sequence: u64,
}

/// Response from getHealth
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    #[serde(default)]
    pub latest_ledger: Option<u64>,
    #[serde(default)]
    pub oldest_ledger: Option<u64>,
    #[serde(default)]
    pub ledger_retention_window: Option<u64>,
}

/// Response from getTransaction
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetTransactionResponse {
    pub status: String,
    #[serde(default)]
    pub latest_ledger: Option<u64>,
    #[serde(default)]
    pub latest_ledger_close_time: Option<String>,
    #[serde(default)]
    pub oldest_ledger: Option<u64>,
    #[serde(default)]
    pub oldest_ledger_close_time: Option<String>,
    #[serde(default)]
    pub ledger: Option<u64>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub application_order: Option<u32>,
    #[serde(default)]
    pub envelope_xdr: Option<String>,
    #[serde(default)]
    pub result_xdr: Option<String>,
    #[serde(default)]
    pub result_meta_xdr: Option<String>,
}

/// Response from simulateTransaction
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulateTransactionResponse {
    #[serde(default)]
    pub results: Option<Vec<SimulateResult>>,
    #[serde(default)]
    pub cost: Option<SimulateCost>,
    #[serde(default)]
    pub latest_ledger: Option<u64>,
    #[serde(default)]
    pub min_resource_fee: Option<String>,
    #[serde(default)]
    pub transaction_data: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub restore_preamble: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulateResult {
    #[serde(default)]
    pub xdr: Option<String>,
    #[serde(default)]
    pub auth: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulateCost {
    #[serde(default)]
    pub cpu_insns: Option<String>,
    #[serde(default)]
    pub mem_bytes: Option<String>,
}

/// Response from sendTransaction
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendTransactionResponse {
    pub status: String,
    #[serde(default)]
    pub hash: Option<String>,
    #[serde(default)]
    pub latest_ledger: Option<u64>,
    #[serde(default)]
    pub latest_ledger_close_time: Option<String>,
    #[serde(default)]
    pub error_result_xdr: Option<String>,
    #[serde(default)]
    pub diagnostic_events_xdr: Option<Vec<String>>,
}

/// Response from getLedgerEntries
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetLedgerEntriesResponse {
    #[serde(default)]
    pub entries: Option<Vec<LedgerEntry>>,
    #[serde(default)]
    pub latest_ledger: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEntry {
    pub key: String,
    pub xdr: String,
    #[serde(default)]
    pub last_modified_ledger_seq: Option<u64>,
    #[serde(default)]
    pub live_until_ledger_seq: Option<u64>,
}

/// Response from getEvents
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetEventsResponse {
    #[serde(default)]
    pub events: Option<Vec<SorobanEvent>>,
    #[serde(default)]
    pub latest_ledger: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SorobanEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub ledger: u64,
    #[serde(default)]
    pub ledger_closed_at: Option<String>,
    pub contract_id: String,
    pub id: String,
    #[serde(default)]
    pub paging_token: Option<String>,
    pub topic: Vec<String>,
    pub value: String,
    #[serde(default)]
    pub in_successful_contract_call: Option<bool>,
}

/// Parameters for getEvents
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetEventsParams {
    pub start_ledger: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_ledger: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filters: Option<Vec<EventFilter>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pagination: Option<EventPagination>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventFilter {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contract_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topics: Option<Vec<Vec<String>>>,
}

#[derive(Debug, Serialize)]
pub struct EventPagination {
    pub limit: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}
