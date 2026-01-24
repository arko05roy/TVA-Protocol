/**
 * Explorer Constants
 */

// TVA Chain ID: "TVA\0" = 0x54564100 = 1414676736
export const TVA_CHAIN_ID = 1414676736;

// Stellar testnet explorer base URL
export const STELLAR_EXPERT_BASE = "https://stellar.expert/explorer/testnet";

// Polling intervals
export const BLOCK_POLL_INTERVAL = 5000; // 5 seconds - Stellar block time

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 10;
export const BLOCKS_PER_PAGE = 10;
export const TXS_PER_PAGE = 20;

// Display limits
export const MAX_RECENT_BLOCKS = 5;
export const MAX_RECENT_TXS = 10;
export const HASH_TRUNCATE_LENGTH = 8;

// Address prefixes
export const EVM_ADDRESS_PREFIX = "0x";
export const STELLAR_ACCOUNT_PREFIX = "G";
export const SOROBAN_CONTRACT_PREFIX = "C";

// RPC URL (can be overridden via env)
export const DEFAULT_RPC_URL = process.env.NEXT_PUBLIC_TVA_RPC_URL || "http://localhost:8545";
