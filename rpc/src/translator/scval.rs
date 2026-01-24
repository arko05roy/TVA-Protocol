use anyhow::{anyhow, Result};
use tracing::debug;

use super::abi::AbiParam;

/// Represents a Soroban ScVal type for transaction construction.
/// Since we are building XDR manually without the full stellar-sdk crate,
/// we represent ScVal as its XDR-encoded bytes.
#[derive(Debug, Clone)]
pub enum ScVal {
    /// Boolean value
    Bool(bool),
    /// Void / unit type
    Void,
    /// Unsigned 32-bit integer
    U32(u32),
    /// Signed 32-bit integer
    I32(i32),
    /// Unsigned 64-bit integer
    U64(u64),
    /// Signed 64-bit integer
    I64(i64),
    /// Unsigned 128-bit integer
    U128(u128),
    /// Signed 128-bit integer
    I128(i128),
    /// Unsigned 256-bit integer (stored as 4x u64 limbs, big-endian)
    U256([u64; 4]),
    /// Signed 256-bit integer
    I256([u64; 4]),
    /// Bytes blob
    Bytes(Vec<u8>),
    /// UTF-8 string
    Str(String),
    /// Symbol (short identifier string)
    Symbol(String),
    /// Address (Stellar account or contract)
    Address(StellarAddress),
    /// Vector of ScVal
    Vec(Vec<ScVal>),
    /// Map of key-value pairs
    Map(Vec<(ScVal, ScVal)>),
}

/// A Stellar address can be either an account (G...) or a contract (C...).
#[derive(Debug, Clone)]
pub enum StellarAddress {
    Account([u8; 32]),
    Contract([u8; 32]),
}

/// XDR type discriminants for ScVal
#[allow(dead_code)]
mod xdr_types {
    pub const SC_VAL_BOOL: i32 = 0;
    pub const SC_VAL_VOID: i32 = 1;
    pub const SC_VAL_ERROR: i32 = 2;
    pub const SC_VAL_U32: i32 = 3;
    pub const SC_VAL_I32: i32 = 4;
    pub const SC_VAL_U64: i32 = 5;
    pub const SC_VAL_I64: i32 = 6;
    pub const SC_VAL_TIMEPOINT: i32 = 7;
    pub const SC_VAL_DURATION: i32 = 8;
    pub const SC_VAL_U128: i32 = 9;
    pub const SC_VAL_I128: i32 = 10;
    pub const SC_VAL_U256: i32 = 11;
    pub const SC_VAL_I256: i32 = 12;
    pub const SC_VAL_BYTES: i32 = 13;
    pub const SC_VAL_STRING: i32 = 14;
    pub const SC_VAL_SYMBOL: i32 = 15;
    pub const SC_VAL_VEC: i32 = 16;
    pub const SC_VAL_MAP: i32 = 17;
    pub const SC_VAL_ADDRESS: i32 = 18;
}

impl ScVal {
    /// Encode this ScVal to XDR bytes (Stellar XDR format).
    pub fn to_xdr(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        match self {
            ScVal::Bool(v) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_BOOL as u32).to_be_bytes());
                buf.extend_from_slice(&(*v as u32).to_be_bytes());
            }
            ScVal::Void => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_VOID as u32).to_be_bytes());
            }
            ScVal::U32(v) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_U32 as u32).to_be_bytes());
                buf.extend_from_slice(&v.to_be_bytes());
            }
            ScVal::I32(v) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_I32 as u32).to_be_bytes());
                buf.extend_from_slice(&v.to_be_bytes());
            }
            ScVal::U64(v) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_U64 as u32).to_be_bytes());
                buf.extend_from_slice(&v.to_be_bytes());
            }
            ScVal::I64(v) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_I64 as u32).to_be_bytes());
                buf.extend_from_slice(&v.to_be_bytes());
            }
            ScVal::U128(v) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_U128 as u32).to_be_bytes());
                // XDR U128: hi (u64) + lo (u64)
                let hi = (*v >> 64) as u64;
                let lo = *v as u64;
                buf.extend_from_slice(&hi.to_be_bytes());
                buf.extend_from_slice(&lo.to_be_bytes());
            }
            ScVal::I128(v) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_I128 as u32).to_be_bytes());
                let hi = (*v >> 64) as i64;
                let lo = *v as u64;
                buf.extend_from_slice(&hi.to_be_bytes());
                buf.extend_from_slice(&lo.to_be_bytes());
            }
            ScVal::U256(limbs) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_U256 as u32).to_be_bytes());
                for limb in limbs {
                    buf.extend_from_slice(&limb.to_be_bytes());
                }
            }
            ScVal::I256(limbs) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_I256 as u32).to_be_bytes());
                for limb in limbs {
                    buf.extend_from_slice(&limb.to_be_bytes());
                }
            }
            ScVal::Bytes(data) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_BYTES as u32).to_be_bytes());
                // XDR variable-length opaque: length + data + padding
                buf.extend_from_slice(&(data.len() as u32).to_be_bytes());
                buf.extend_from_slice(data);
                let padding = (4 - (data.len() % 4)) % 4;
                buf.extend(vec![0u8; padding]);
            }
            ScVal::Str(s) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_STRING as u32).to_be_bytes());
                let bytes = s.as_bytes();
                buf.extend_from_slice(&(bytes.len() as u32).to_be_bytes());
                buf.extend_from_slice(bytes);
                let padding = (4 - (bytes.len() % 4)) % 4;
                buf.extend(vec![0u8; padding]);
            }
            ScVal::Symbol(s) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_SYMBOL as u32).to_be_bytes());
                let bytes = s.as_bytes();
                buf.extend_from_slice(&(bytes.len() as u32).to_be_bytes());
                buf.extend_from_slice(bytes);
                let padding = (4 - (bytes.len() % 4)) % 4;
                buf.extend(vec![0u8; padding]);
            }
            ScVal::Address(addr) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_ADDRESS as u32).to_be_bytes());
                match addr {
                    StellarAddress::Account(key) => {
                        buf.extend_from_slice(&0u32.to_be_bytes()); // SC_ADDRESS_TYPE_ACCOUNT
                        buf.extend_from_slice(key);
                    }
                    StellarAddress::Contract(hash) => {
                        buf.extend_from_slice(&1u32.to_be_bytes()); // SC_ADDRESS_TYPE_CONTRACT
                        buf.extend_from_slice(hash);
                    }
                }
            }
            ScVal::Vec(items) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_VEC as u32).to_be_bytes());
                // Optional flag (present)
                buf.extend_from_slice(&1u32.to_be_bytes());
                buf.extend_from_slice(&(items.len() as u32).to_be_bytes());
                for item in items {
                    buf.extend(item.to_xdr());
                }
            }
            ScVal::Map(entries) => {
                buf.extend_from_slice(&(xdr_types::SC_VAL_MAP as u32).to_be_bytes());
                // Optional flag (present)
                buf.extend_from_slice(&1u32.to_be_bytes());
                buf.extend_from_slice(&(entries.len() as u32).to_be_bytes());
                for (key, val) in entries {
                    buf.extend(key.to_xdr());
                    buf.extend(val.to_xdr());
                }
            }
        }
        buf
    }
}

/// Convert ABI-encoded parameter bytes to a ScVal based on the ABI type.
pub fn abi_param_to_scval(data: &[u8], param: &AbiParam) -> Result<ScVal> {
    let param_type = param.param_type.as_str();
    debug!(
        "Converting ABI param '{}' of type '{}' ({} bytes)",
        param.name,
        param_type,
        data.len()
    );

    match param_type {
        "bool" => {
            if data.len() < 32 {
                return Err(anyhow!("Bool data too short"));
            }
            let value = data[31] != 0;
            Ok(ScVal::Bool(value))
        }
        "address" => {
            // EVM address is 20 bytes, right-aligned in 32-byte word
            if data.len() < 32 {
                return Err(anyhow!("Address data too short"));
            }
            let mut addr_bytes = [0u8; 32];
            // Pad the 20-byte EVM address to 32 bytes for Stellar
            addr_bytes[12..32].copy_from_slice(&data[12..32]);
            Ok(ScVal::Address(StellarAddress::Contract(addr_bytes)))
        }
        "uint8" | "uint16" | "uint32" => {
            if data.len() < 32 {
                return Err(anyhow!("Uint data too short"));
            }
            let mut bytes = [0u8; 4];
            bytes.copy_from_slice(&data[28..32]);
            Ok(ScVal::U32(u32::from_be_bytes(bytes)))
        }
        "int8" | "int16" | "int32" => {
            if data.len() < 32 {
                return Err(anyhow!("Int data too short"));
            }
            let mut bytes = [0u8; 4];
            bytes.copy_from_slice(&data[28..32]);
            Ok(ScVal::I32(i32::from_be_bytes(bytes)))
        }
        "uint64" => {
            if data.len() < 32 {
                return Err(anyhow!("Uint64 data too short"));
            }
            let mut bytes = [0u8; 8];
            bytes.copy_from_slice(&data[24..32]);
            Ok(ScVal::U64(u64::from_be_bytes(bytes)))
        }
        "int64" => {
            if data.len() < 32 {
                return Err(anyhow!("Int64 data too short"));
            }
            let mut bytes = [0u8; 8];
            bytes.copy_from_slice(&data[24..32]);
            Ok(ScVal::I64(i64::from_be_bytes(bytes)))
        }
        "uint128" => {
            if data.len() < 32 {
                return Err(anyhow!("Uint128 data too short"));
            }
            let mut bytes = [0u8; 16];
            bytes.copy_from_slice(&data[16..32]);
            Ok(ScVal::U128(u128::from_be_bytes(bytes)))
        }
        "int128" => {
            if data.len() < 32 {
                return Err(anyhow!("Int128 data too short"));
            }
            let mut bytes = [0u8; 16];
            bytes.copy_from_slice(&data[16..32]);
            Ok(ScVal::I128(i128::from_be_bytes(bytes)))
        }
        "uint256" => {
            if data.len() < 32 {
                return Err(anyhow!("Uint256 data too short"));
            }
            let mut limbs = [0u64; 4];
            for i in 0..4 {
                let mut bytes = [0u8; 8];
                bytes.copy_from_slice(&data[i * 8..(i + 1) * 8]);
                limbs[i] = u64::from_be_bytes(bytes);
            }
            Ok(ScVal::U256(limbs))
        }
        "int256" => {
            if data.len() < 32 {
                return Err(anyhow!("Int256 data too short"));
            }
            let mut limbs = [0u64; 4];
            for i in 0..4 {
                let mut bytes = [0u8; 8];
                bytes.copy_from_slice(&data[i * 8..(i + 1) * 8]);
                limbs[i] = u64::from_be_bytes(bytes);
            }
            Ok(ScVal::I256(limbs))
        }
        "bytes" => {
            Ok(ScVal::Bytes(data.to_vec()))
        }
        "string" => {
            let s = String::from_utf8(data.to_vec())
                .unwrap_or_else(|_| hex::encode(data));
            Ok(ScVal::Str(s))
        }
        t if t.starts_with("bytes") && t.len() > 5 => {
            // bytesN (fixed-size bytes)
            let n: usize = t[5..].parse().unwrap_or(32);
            let end = n.min(data.len());
            Ok(ScVal::Bytes(data[..end].to_vec()))
        }
        _ => {
            // Default: treat as U256
            if data.len() >= 32 {
                let mut limbs = [0u64; 4];
                for i in 0..4 {
                    let mut bytes = [0u8; 8];
                    bytes.copy_from_slice(&data[i * 8..(i + 1) * 8]);
                    limbs[i] = u64::from_be_bytes(bytes);
                }
                Ok(ScVal::U256(limbs))
            } else {
                Ok(ScVal::Bytes(data.to_vec()))
            }
        }
    }
}

/// Convert a ScVal back to ABI-encoded bytes based on the expected ABI type.
pub fn scval_to_abi_bytes(scval: &ScVal, param: &AbiParam) -> Result<Vec<u8>> {
    let mut result = vec![0u8; 32]; // Most ABI values are 32 bytes

    match scval {
        ScVal::Bool(v) => {
            result[31] = *v as u8;
        }
        ScVal::U32(v) => {
            result[28..32].copy_from_slice(&v.to_be_bytes());
        }
        ScVal::I32(v) => {
            // Sign-extend for negative values
            if *v < 0 {
                result = vec![0xffu8; 32];
            }
            result[28..32].copy_from_slice(&v.to_be_bytes());
        }
        ScVal::U64(v) => {
            result[24..32].copy_from_slice(&v.to_be_bytes());
        }
        ScVal::I64(v) => {
            if *v < 0 {
                result = vec![0xffu8; 32];
            }
            result[24..32].copy_from_slice(&v.to_be_bytes());
        }
        ScVal::U128(v) => {
            result[16..32].copy_from_slice(&v.to_be_bytes());
        }
        ScVal::I128(v) => {
            if *v < 0 {
                result = vec![0xffu8; 32];
            }
            result[16..32].copy_from_slice(&v.to_be_bytes());
        }
        ScVal::U256(limbs) => {
            for (i, limb) in limbs.iter().enumerate() {
                result[i * 8..(i + 1) * 8].copy_from_slice(&limb.to_be_bytes());
            }
        }
        ScVal::I256(limbs) => {
            for (i, limb) in limbs.iter().enumerate() {
                result[i * 8..(i + 1) * 8].copy_from_slice(&limb.to_be_bytes());
            }
        }
        ScVal::Address(addr) => {
            match addr {
                StellarAddress::Account(key) | StellarAddress::Contract(key) => {
                    // Place 20 bytes of address at offset 12
                    result[12..32].copy_from_slice(&key[12..32]);
                }
            }
        }
        ScVal::Bytes(data) => {
            if param.param_type == "bytes" {
                // Dynamic type: return length-prefixed
                return Ok(data.clone());
            }
            // Fixed bytesN
            let len = data.len().min(32);
            result[..len].copy_from_slice(&data[..len]);
        }
        ScVal::Str(s) => {
            return Ok(s.as_bytes().to_vec());
        }
        ScVal::Void => {
            // Return zero-filled 32 bytes
        }
        _ => {
            // Default encoding
        }
    }

    Ok(result)
}

/// Convert a raw XDR ScVal result (from simulateTransaction) to ABI-encoded return bytes.
pub fn decode_scval_xdr_to_abi(xdr_base64: &str, output_types: &[AbiParam]) -> Result<Vec<u8>> {
    let xdr_bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        xdr_base64,
    )
    .map_err(|e| anyhow!("Failed to decode base64 XDR: {}", e))?;

    // Parse the ScVal from XDR
    let scval = parse_scval_from_xdr(&xdr_bytes)?;

    // If there is one output type, encode directly
    if output_types.len() == 1 {
        return scval_to_abi_bytes(&scval, &output_types[0]);
    }

    // Multiple outputs: expect a Vec/Tuple ScVal
    if let ScVal::Vec(items) = &scval {
        let mut result = Vec::new();
        let default_param = AbiParam {
            name: String::new(),
            param_type: "uint256".to_string(),
            indexed: false,
            components: None,
        };
        for (i, item) in items.iter().enumerate() {
            let param = output_types.get(i).unwrap_or(&default_param);
            result.extend(scval_to_abi_bytes(item, param)?);
        }
        return Ok(result);
    }

    // Single value, single output
    if output_types.is_empty() {
        return Ok(Vec::new());
    }

    scval_to_abi_bytes(&scval, &output_types[0])
}

/// Parse a ScVal from raw XDR bytes.
pub fn parse_scval_from_xdr(data: &[u8]) -> Result<ScVal> {
    if data.len() < 4 {
        return Err(anyhow!("XDR too short for ScVal discriminant"));
    }

    let mut bytes = [0u8; 4];
    bytes.copy_from_slice(&data[0..4]);
    let disc = u32::from_be_bytes(bytes) as i32;

    match disc {
        0 => {
            // Bool
            if data.len() < 8 {
                return Err(anyhow!("XDR too short for Bool value"));
            }
            let mut vb = [0u8; 4];
            vb.copy_from_slice(&data[4..8]);
            Ok(ScVal::Bool(u32::from_be_bytes(vb) != 0))
        }
        1 => {
            // Void
            Ok(ScVal::Void)
        }
        3 => {
            // U32
            if data.len() < 8 {
                return Err(anyhow!("XDR too short for U32"));
            }
            let mut vb = [0u8; 4];
            vb.copy_from_slice(&data[4..8]);
            Ok(ScVal::U32(u32::from_be_bytes(vb)))
        }
        4 => {
            // I32
            if data.len() < 8 {
                return Err(anyhow!("XDR too short for I32"));
            }
            let mut vb = [0u8; 4];
            vb.copy_from_slice(&data[4..8]);
            Ok(ScVal::I32(i32::from_be_bytes(vb)))
        }
        5 => {
            // U64
            if data.len() < 12 {
                return Err(anyhow!("XDR too short for U64"));
            }
            let mut vb = [0u8; 8];
            vb.copy_from_slice(&data[4..12]);
            Ok(ScVal::U64(u64::from_be_bytes(vb)))
        }
        6 => {
            // I64
            if data.len() < 12 {
                return Err(anyhow!("XDR too short for I64"));
            }
            let mut vb = [0u8; 8];
            vb.copy_from_slice(&data[4..12]);
            Ok(ScVal::I64(i64::from_be_bytes(vb)))
        }
        9 => {
            // U128: hi(u64) + lo(u64)
            if data.len() < 20 {
                return Err(anyhow!("XDR too short for U128"));
            }
            let mut hi_bytes = [0u8; 8];
            let mut lo_bytes = [0u8; 8];
            hi_bytes.copy_from_slice(&data[4..12]);
            lo_bytes.copy_from_slice(&data[12..20]);
            let hi = u64::from_be_bytes(hi_bytes) as u128;
            let lo = u64::from_be_bytes(lo_bytes) as u128;
            Ok(ScVal::U128((hi << 64) | lo))
        }
        10 => {
            // I128
            if data.len() < 20 {
                return Err(anyhow!("XDR too short for I128"));
            }
            let mut hi_bytes = [0u8; 8];
            let mut lo_bytes = [0u8; 8];
            hi_bytes.copy_from_slice(&data[4..12]);
            lo_bytes.copy_from_slice(&data[12..20]);
            let hi = i64::from_be_bytes(hi_bytes) as i128;
            let lo = u64::from_be_bytes(lo_bytes) as i128;
            Ok(ScVal::I128((hi << 64) | lo))
        }
        11 => {
            // U256: 4x u64
            if data.len() < 36 {
                return Err(anyhow!("XDR too short for U256"));
            }
            let mut limbs = [0u64; 4];
            for i in 0..4 {
                let mut lb = [0u8; 8];
                lb.copy_from_slice(&data[4 + i * 8..12 + i * 8]);
                limbs[i] = u64::from_be_bytes(lb);
            }
            Ok(ScVal::U256(limbs))
        }
        13 => {
            // Bytes
            if data.len() < 8 {
                return Err(anyhow!("XDR too short for Bytes length"));
            }
            let mut lb = [0u8; 4];
            lb.copy_from_slice(&data[4..8]);
            let len = u32::from_be_bytes(lb) as usize;
            let end = 8 + len;
            if data.len() < end {
                return Err(anyhow!("XDR too short for Bytes data"));
            }
            Ok(ScVal::Bytes(data[8..end].to_vec()))
        }
        14 => {
            // String
            if data.len() < 8 {
                return Err(anyhow!("XDR too short for String length"));
            }
            let mut lb = [0u8; 4];
            lb.copy_from_slice(&data[4..8]);
            let len = u32::from_be_bytes(lb) as usize;
            let end = 8 + len;
            if data.len() < end {
                return Err(anyhow!("XDR too short for String data"));
            }
            let s = String::from_utf8(data[8..end].to_vec())
                .unwrap_or_else(|_| hex::encode(&data[8..end]));
            Ok(ScVal::Str(s))
        }
        15 => {
            // Symbol
            if data.len() < 8 {
                return Err(anyhow!("XDR too short for Symbol length"));
            }
            let mut lb = [0u8; 4];
            lb.copy_from_slice(&data[4..8]);
            let len = u32::from_be_bytes(lb) as usize;
            let end = 8 + len;
            if data.len() < end {
                return Err(anyhow!("XDR too short for Symbol data"));
            }
            let s = String::from_utf8(data[8..end].to_vec())
                .unwrap_or_else(|_| hex::encode(&data[8..end]));
            Ok(ScVal::Symbol(s))
        }
        _ => {
            // Unknown type: return as raw bytes
            debug!("Unknown ScVal discriminant: {}, returning as bytes", disc);
            Ok(ScVal::Bytes(data.to_vec()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_u32_roundtrip() {
        let scval = ScVal::U32(42);
        let xdr = scval.to_xdr();
        let decoded = parse_scval_from_xdr(&xdr).unwrap();
        if let ScVal::U32(v) = decoded {
            assert_eq!(v, 42);
        } else {
            panic!("Expected U32");
        }
    }

    #[test]
    fn test_bool_roundtrip() {
        let scval = ScVal::Bool(true);
        let xdr = scval.to_xdr();
        let decoded = parse_scval_from_xdr(&xdr).unwrap();
        if let ScVal::Bool(v) = decoded {
            assert!(v);
        } else {
            panic!("Expected Bool");
        }
    }

    #[test]
    fn test_abi_to_scval_uint256() {
        let mut data = [0u8; 32];
        data[31] = 100; // value = 100
        let param = AbiParam {
            name: "amount".to_string(),
            param_type: "uint256".to_string(),
            indexed: false,
            components: None,
        };
        let scval = abi_param_to_scval(&data, &param).unwrap();
        if let ScVal::U256(limbs) = scval {
            assert_eq!(limbs[3], 100);
            assert_eq!(limbs[0], 0);
        } else {
            panic!("Expected U256");
        }
    }
}
