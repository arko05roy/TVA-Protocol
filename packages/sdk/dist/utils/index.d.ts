/**
 * TVA Protocol Utility Functions
 */
/**
 * Converts a hex string to Uint8Array
 */
declare function hexToBytes(hex: string): Uint8Array;
/**
 * Converts Uint8Array to hex string
 */
declare function bytesToHex(bytes: Uint8Array, prefix?: boolean): string;
/**
 * Computes keccak256 hash
 */
declare function keccak256(data: Uint8Array | string): string;
/**
 * Pads a hex string to a specific length
 */
declare function padHex(hex: string, length: number, side?: 'left' | 'right'): string;
/**
 * Formats a bigint as a decimal string with specified decimals
 */
declare function formatUnits(value: bigint, decimals: number): string;
/**
 * Parses a decimal string to bigint with specified decimals
 */
declare function parseUnits(value: string, decimals: number): bigint;
/**
 * Formats XLM (7 decimals) for display
 */
declare function formatXlm(stroops: bigint): string;
/**
 * Parses XLM string to stroops
 */
declare function parseXlm(xlm: string): bigint;
/**
 * Formats ETH-style value (18 decimals) for display
 */
declare function formatEth(wei: bigint): string;
/**
 * Parses ETH string to wei
 */
declare function parseEth(eth: string): bigint;
/**
 * Validates an EVM address format
 */
declare function isValidEvmAddress(address: string): boolean;
/**
 * Validates a Stellar G-address format
 */
declare function isValidStellarAddress(address: string): boolean;
/**
 * Validates a Soroban C-address format
 */
declare function isValidContractId(address: string): boolean;
/**
 * Checksums an EVM address (EIP-55)
 */
declare function checksumAddress(address: string): string;
/**
 * Validates a checksummed EVM address (EIP-55)
 */
declare function isValidChecksumAddress(address: string): boolean;
/**
 * Sleep for a specified number of milliseconds
 */
declare function sleep(ms: number): Promise<void>;
/**
 * Retry a function with exponential backoff
 */
declare function retry<T>(fn: () => Promise<T>, options?: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
}): Promise<T>;
/**
 * Creates a deferred promise
 */
declare function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
};
/**
 * Chunks an array into smaller arrays
 */
declare function chunk<T>(array: T[], size: number): T[][];

export { bytesToHex, checksumAddress, chunk, deferred, formatEth, formatUnits, formatXlm, hexToBytes, isValidChecksumAddress, isValidContractId, isValidEvmAddress, isValidStellarAddress, keccak256, padHex, parseEth, parseUnits, parseXlm, retry, sleep };
