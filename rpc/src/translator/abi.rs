use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use sha3::{Digest, Keccak256};
use std::collections::HashMap;
use std::sync::RwLock;
use tracing::debug;

/// ABI function parameter definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbiParam {
    pub name: String,
    #[serde(rename = "type")]
    pub param_type: String,
    #[serde(default)]
    pub indexed: bool,
    #[serde(default)]
    pub components: Option<Vec<AbiParam>>,
}

/// ABI function/event entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbiEntry {
    #[serde(rename = "type")]
    pub entry_type: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub inputs: Vec<AbiParam>,
    #[serde(default)]
    pub outputs: Vec<AbiParam>,
    #[serde(default)]
    pub state_mutability: Option<String>,
}

/// Stores the mapping from a 4-byte function selector to the function name and its ABI entry.
#[derive(Debug, Clone)]
pub struct FunctionInfo {
    pub name: String,
    pub selector: [u8; 4],
    pub inputs: Vec<AbiParam>,
    pub outputs: Vec<AbiParam>,
    pub state_mutability: String,
}

/// ABI Registry: maps contract addresses to their ABI entries and function selectors.
pub struct AbiRegistry {
    /// Map of contract address (hex, lowercase, no 0x) -> list of function infos
    contracts: RwLock<HashMap<String, Vec<FunctionInfo>>>,
}

impl Default for AbiRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl AbiRegistry {
    /// Create a new empty ABI registry.
    pub fn new() -> Self {
        Self {
            contracts: RwLock::new(HashMap::new()),
        }
    }

    /// Compute the 4-byte function selector from a function signature.
    /// e.g., "transfer(address,uint256)" -> first 4 bytes of keccak256
    pub fn compute_selector(signature: &str) -> [u8; 4] {
        let hash = Keccak256::digest(signature.as_bytes());
        let mut selector = [0u8; 4];
        selector.copy_from_slice(&hash[..4]);
        selector
    }

    /// Build the canonical function signature from an ABI entry.
    /// e.g., AbiEntry { name: "transfer", inputs: [address, uint256] } -> "transfer(address,uint256)"
    pub fn build_signature(name: &str, inputs: &[AbiParam]) -> String {
        let param_types: Vec<String> = inputs
            .iter()
            .map(|p| Self::canonical_type(&p.param_type, &p.components))
            .collect();
        format!("{}({})", name, param_types.join(","))
    }

    /// Get the canonical ABI type string, handling tuples.
    fn canonical_type(param_type: &str, components: &Option<Vec<AbiParam>>) -> String {
        if param_type == "tuple" || param_type.starts_with("tuple") {
            if let Some(comps) = components {
                let inner: Vec<String> = comps
                    .iter()
                    .map(|c| Self::canonical_type(&c.param_type, &c.components))
                    .collect();
                let suffix = if param_type.ends_with("[]") {
                    "[]"
                } else {
                    ""
                };
                format!("({}){}", inner.join(","), suffix)
            } else {
                param_type.to_string()
            }
        } else {
            param_type.to_string()
        }
    }

    /// Register a contract's ABI entries.
    pub fn register_contract(&self, address: &str, abi: &[AbiEntry]) -> Result<()> {
        let addr = normalize_address(address);
        let mut functions = Vec::new();

        for entry in abi {
            if entry.entry_type == "function" {
                if let Some(name) = &entry.name {
                    let signature = Self::build_signature(name, &entry.inputs);
                    let selector = Self::compute_selector(&signature);
                    debug!(
                        "Registered function: {} selector=0x{} for contract {}",
                        signature,
                        hex::encode(selector),
                        addr
                    );
                    functions.push(FunctionInfo {
                        name: name.clone(),
                        selector,
                        inputs: entry.inputs.clone(),
                        outputs: entry.outputs.clone(),
                        state_mutability: entry
                            .state_mutability
                            .clone()
                            .unwrap_or_else(|| "nonpayable".to_string()),
                    });
                }
            }
        }

        let mut contracts = self.contracts.write().map_err(|e| anyhow!("Lock poisoned: {}", e))?;
        contracts.insert(addr, functions);
        Ok(())
    }

    /// Look up a function by its 4-byte selector for a given contract.
    pub fn lookup_function(&self, address: &str, selector: &[u8; 4]) -> Option<FunctionInfo> {
        let addr = normalize_address(address);
        let contracts = self.contracts.read().ok()?;
        let functions = contracts.get(&addr)?;

        functions.iter().find(|f| &f.selector == selector).cloned()
    }

    /// Look up a function by name for a given contract.
    pub fn lookup_function_by_name(&self, address: &str, name: &str) -> Option<FunctionInfo> {
        let addr = normalize_address(address);
        let contracts = self.contracts.read().ok()?;
        let functions = contracts.get(&addr)?;

        functions.iter().find(|f| f.name == name).cloned()
    }

    /// Check if a contract is registered.
    pub fn has_contract(&self, address: &str) -> bool {
        let addr = normalize_address(address);
        let contracts = self.contracts.read().unwrap_or_else(|e| e.into_inner());
        contracts.contains_key(&addr)
    }

    /// Get all registered function selectors for a contract.
    pub fn get_selectors(&self, address: &str) -> Vec<[u8; 4]> {
        let addr = normalize_address(address);
        let contracts = self.contracts.read().unwrap_or_else(|e| e.into_inner());
        contracts
            .get(&addr)
            .map(|funcs| funcs.iter().map(|f| f.selector).collect())
            .unwrap_or_default()
    }
}

/// Normalize an address to lowercase without 0x prefix.
fn normalize_address(address: &str) -> String {
    address
        .strip_prefix("0x")
        .unwrap_or(address)
        .to_lowercase()
}

/// Decode ABI-encoded parameters given their types.
/// Returns a vector of decoded values as raw byte chunks.
pub fn decode_abi_params(data: &[u8], param_types: &[AbiParam]) -> Result<Vec<Vec<u8>>> {
    if data.is_empty() && param_types.is_empty() {
        return Ok(Vec::new());
    }

    let mut decoded = Vec::new();
    let mut offset = 0;

    for param in param_types {
        if is_dynamic_type(&param.param_type) {
            // Dynamic types: read the offset pointer, then the data
            if offset + 32 > data.len() {
                return Err(anyhow!("ABI data too short for dynamic offset"));
            }
            let data_offset = read_u256_as_usize(&data[offset..offset + 32])?;
            let dynamic_data = decode_dynamic_param(data, data_offset, &param.param_type)?;
            decoded.push(dynamic_data);
            offset += 32;
        } else {
            // Static types: read 32 bytes
            if offset + 32 > data.len() {
                return Err(anyhow!("ABI data too short for static param"));
            }
            decoded.push(data[offset..offset + 32].to_vec());
            offset += 32;
        }
    }

    Ok(decoded)
}

/// Check if a type is dynamic (bytes, string, dynamic arrays).
fn is_dynamic_type(param_type: &str) -> bool {
    param_type == "bytes"
        || param_type == "string"
        || param_type.ends_with("[]")
        || (param_type == "tuple") // Simplified; real impl would check components
}

/// Read a 256-bit big-endian integer as usize.
fn read_u256_as_usize(data: &[u8]) -> Result<usize> {
    if data.len() < 32 {
        return Err(anyhow!("Not enough data for u256"));
    }
    // Only look at last 8 bytes (usize is at most 64-bit)
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&data[24..32]);
    Ok(u64::from_be_bytes(bytes) as usize)
}

/// Decode a dynamic ABI parameter.
fn decode_dynamic_param(data: &[u8], offset: usize, param_type: &str) -> Result<Vec<u8>> {
    if offset + 32 > data.len() {
        return Err(anyhow!("Dynamic param offset out of bounds"));
    }

    if param_type == "bytes" || param_type == "string" {
        let length = read_u256_as_usize(&data[offset..offset + 32])?;
        let start = offset + 32;
        let end = start + length;
        if end > data.len() {
            return Err(anyhow!("Dynamic param data out of bounds"));
        }
        Ok(data[start..end].to_vec())
    } else if param_type.ends_with("[]") {
        // Dynamic array: length + elements
        let length = read_u256_as_usize(&data[offset..offset + 32])?;
        let start = offset + 32;
        let end = start + length * 32;
        if end > data.len() {
            return Err(anyhow!("Dynamic array data out of bounds"));
        }
        Ok(data[offset..end].to_vec())
    } else {
        // Fallback: return 32 bytes from offset
        let end = (offset + 32).min(data.len());
        Ok(data[offset..end].to_vec())
    }
}

/// Encode values back to ABI format.
pub fn encode_abi_values(values: &[Vec<u8>], param_types: &[AbiParam]) -> Vec<u8> {
    let mut result = Vec::new();
    let mut dynamic_data = Vec::new();
    let head_size = param_types.len() * 32;

    for (i, param) in param_types.iter().enumerate() {
        if is_dynamic_type(&param.param_type) {
            // Write offset pointer
            let offset = head_size + dynamic_data.len();
            let mut offset_bytes = [0u8; 32];
            offset_bytes[24..32].copy_from_slice(&(offset as u64).to_be_bytes());
            result.extend_from_slice(&offset_bytes);

            // Prepare dynamic data
            let value = &values[i];
            let mut len_bytes = [0u8; 32];
            len_bytes[24..32].copy_from_slice(&(value.len() as u64).to_be_bytes());
            dynamic_data.extend_from_slice(&len_bytes);
            dynamic_data.extend_from_slice(value);
            // Pad to 32 bytes
            let padding = (32 - (value.len() % 32)) % 32;
            dynamic_data.extend(vec![0u8; padding]);
        } else {
            // Static: pad to 32 bytes (left-pad for integers, right-pad for bytes)
            if i < values.len() {
                let value = &values[i];
                if value.len() >= 32 {
                    result.extend_from_slice(&value[..32]);
                } else {
                    // Left-pad with zeros
                    let mut padded = vec![0u8; 32 - value.len()];
                    padded.extend_from_slice(value);
                    result.extend_from_slice(&padded);
                }
            } else {
                result.extend_from_slice(&[0u8; 32]);
            }
        }
    }

    result.extend(dynamic_data);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_selector() {
        // transfer(address,uint256)
        let selector = AbiRegistry::compute_selector("transfer(address,uint256)");
        assert_eq!(hex::encode(selector), "a9059cbb");

        // balanceOf(address)
        let selector = AbiRegistry::compute_selector("balanceOf(address)");
        assert_eq!(hex::encode(selector), "70a08231");
    }

    #[test]
    fn test_build_signature() {
        let inputs = vec![
            AbiParam {
                name: "to".to_string(),
                param_type: "address".to_string(),
                indexed: false,
                components: None,
            },
            AbiParam {
                name: "amount".to_string(),
                param_type: "uint256".to_string(),
                indexed: false,
                components: None,
            },
        ];
        let sig = AbiRegistry::build_signature("transfer", &inputs);
        assert_eq!(sig, "transfer(address,uint256)");
    }

    #[test]
    fn test_register_and_lookup() {
        let registry = AbiRegistry::new();
        let abi = vec![AbiEntry {
            entry_type: "function".to_string(),
            name: Some("transfer".to_string()),
            inputs: vec![
                AbiParam {
                    name: "to".to_string(),
                    param_type: "address".to_string(),
                    indexed: false,
                    components: None,
                },
                AbiParam {
                    name: "amount".to_string(),
                    param_type: "uint256".to_string(),
                    indexed: false,
                    components: None,
                },
            ],
            outputs: vec![AbiParam {
                name: "".to_string(),
                param_type: "bool".to_string(),
                indexed: false,
                components: None,
            }],
            state_mutability: Some("nonpayable".to_string()),
        }];

        registry
            .register_contract("0x1234567890abcdef1234567890abcdef12345678", &abi)
            .unwrap();

        let selector = AbiRegistry::compute_selector("transfer(address,uint256)");
        let func = registry
            .lookup_function("0x1234567890abcdef1234567890abcdef12345678", &selector)
            .unwrap();

        assert_eq!(func.name, "transfer");
        assert_eq!(func.inputs.len(), 2);
    }
}
