pragma solidity 0;

/**
 * @title ExecutionLedger
 * @notice Core financial ledger for ASTRAEUS subnets (Soroban-compatible)
 * @dev Solang pre-alpha Soroban backend workarounds:
 *      - Single-level mapping with caller-computed keys (multi-level maps have slot bugs)
 *      - Keys passed as params (computed keys lose Val encoding)
 *      - Only uint64 mapping values
 *      - No events, keccak256, arrays, bool maps, or enums
 *      - Auth via parameter address
 *      Key scheme: caller computes key = subnet*1000000 + user*1000 + asset
 *      and passes it as the `key` parameter.
 */
contract ExecutionLedger {
    // Single-level balance mapping: key (pre-computed by caller) => amount in stroops
    mapping(uint64 => uint64) public persistent balances;

    // Nonce per subnet
    mapping(uint64 => uint64) public persistent nonces;

    // Subnet status (1=active, 0=inactive)
    mapping(uint64 => uint64) public persistent subnetStatus;

    // Global counter
    uint64 public persistent subnetCount;

    constructor() {
        subnetCount = 0;
    }

    // ===== SUBNET MANAGEMENT =====

    function activate_subnet(address caller, uint64 subnet_id) public {
        caller.requireAuth();
        require(subnetStatus[subnet_id] == 0, "Already active");
        subnetStatus[subnet_id] = 1;
        subnetCount += 1;
        subnetCount.extendTtl(100, 5000);
    }

    function deactivate_subnet(address caller, uint64 subnet_id) public {
        caller.requireAuth();
        require(subnetStatus[subnet_id] == 1, "Not active");
        subnetStatus[subnet_id] = 0;
    }

    // ===== FINANCIAL OPERATIONS =====
    // `key` parameter: pre-computed by caller as subnet*1000000 + user*1000 + asset

    function credit(address caller, uint64 subnet_id, uint64 key, uint64 amount) public {
        caller.requireAuth();
        require(amount > 0, "Amount must be positive");
        require(subnetStatus[subnet_id] == 1, "Subnet not active");
        balances[key] += amount;
    }

    function debit(address caller, uint64 subnet_id, uint64 key, uint64 amount) public {
        caller.requireAuth();
        require(amount > 0, "Amount must be positive");
        require(subnetStatus[subnet_id] == 1, "Subnet not active");
        require(balances[key] >= amount, "Insufficient balance");
        balances[key] -= amount;
    }

    function transfer(address caller, uint64 subnet_id, uint64 from_key, uint64 to_key, uint64 amount) public {
        caller.requireAuth();
        require(amount > 0, "Amount must be positive");
        require(from_key != to_key, "Cannot self-transfer");
        require(subnetStatus[subnet_id] == 1, "Subnet not active");
        require(balances[from_key] >= amount, "Insufficient balance");
        balances[from_key] -= amount;
        balances[to_key] += amount;
    }

    function request_withdrawal(address caller, uint64 subnet_id, uint64 key, uint64 amount) public returns (uint64) {
        caller.requireAuth();
        require(amount > 0, "Amount must be positive");
        require(subnetStatus[subnet_id] == 1, "Subnet not active");
        require(balances[key] >= amount, "Insufficient balance");
        balances[key] -= amount;
        nonces[subnet_id] += 1;
        return nonces[subnet_id];
    }

    // ===== QUERY FUNCTIONS =====

    function get_balance(uint64 key) public view returns (uint64) {
        return balances[key];
    }

    function get_nonce(uint64 subnet_id) public view returns (uint64) {
        return nonces[subnet_id];
    }

    function is_active(uint64 subnet_id) public view returns (uint64) {
        return subnetStatus[subnet_id];
    }

    function get_subnet_count() public view returns (uint64) {
        return subnetCount;
    }
}
