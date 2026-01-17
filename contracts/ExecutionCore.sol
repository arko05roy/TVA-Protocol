pragma solidity 0;

import "./interfaces/ISubnetFactory.sol";

/**
 * @title ExecutionCore
 * @notice Handles all financial operations for ASTRAEUS subnets
 * @dev Maintains deterministic state with balances, withdrawal queues, and nonces
 */
contract ExecutionCore {
    // Instance storage - contract-wide configuration
    address public instance executionAdmin;
    ISubnetFactory public instance subnetFactory;  // SubnetFactory contract interface

    // Persistent storage - balances: subnet_id => user_id => asset_key => balance
    mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => int128))) public persistent balances;

    // Persistent storage - withdrawal queues per subnet
    mapping(bytes32 => Withdrawal[]) public persistent withdrawalQueues;

    // Persistent storage - nonce per subnet (block number)
    mapping(bytes32 => uint64) public persistent nonces;

    // Data Structures
    struct Withdrawal {
        bytes32 withdrawal_id;  // Unique identifier
        bytes32 user_id;        // User requesting withdrawal
        string asset_code;      // Asset code
        bytes32 issuer;         // Asset issuer (or "NATIVE" for XLM)
        int128 amount;          // Amount in stroops
        bytes32 destination;    // Stellar address (Ed25519 public key)
    }

    // Events
    event Credited(
        bytes32 indexed subnet_id,
        bytes32 indexed user_id,
        string asset_code,
        bytes32 issuer,
        int128 amount
    );

    event Debited(
        bytes32 indexed subnet_id,
        bytes32 indexed user_id,
        string asset_code,
        bytes32 issuer,
        int128 amount
    );

    event Transferred(
        bytes32 indexed subnet_id,
        bytes32 indexed from,
        bytes32 indexed to,
        string asset_code,
        bytes32 issuer,
        int128 amount
    );

    event WithdrawalRequested(
        bytes32 indexed subnet_id,
        bytes32 indexed withdrawal_id,
        bytes32 indexed user_id,
        string asset_code,
        bytes32 issuer,
        int128 amount,
        bytes32 destination
    );

    /**
     * @notice Constructor - sets execution admin and subnet factory address
     * @param _executionAdmin Address of the execution administrator
     * @param _subnetFactory Address of the SubnetFactory contract
     */
    constructor(address _executionAdmin, address _subnetFactory) {
        executionAdmin = _executionAdmin;
        subnetFactory = ISubnetFactory(_subnetFactory);
    }

    /**
     * @notice Internal function to compute asset key from asset code and issuer
     * @param asset_code The asset code
     * @param issuer The asset issuer (or "NATIVE" for XLM)
     * @return asset_key The computed asset key (keccak256 hash)
     */
    function _compute_asset_key(string memory asset_code, bytes32 issuer) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(asset_code, issuer));
    }

    /**
     * @notice Internal function to validate subnet exists and is active
     * @param subnet_id The subnet identifier
     */
    function _validate_subnet(bytes32 subnet_id) internal view {
        // Check if subnet exists
        require(subnetFactory.subnet_exists(subnet_id), "ExecutionCore: Subnet does not exist");
        
        // Get subnet details to check if active
        (, , , , address treasury, bool active) = subnetFactory.get_subnet(subnet_id);
        require(active, "ExecutionCore: Subnet is not active");
        require(treasury != address(0), "ExecutionCore: Subnet treasury not registered");
    }

    /**
     * @notice Internal function to check if asset is whitelisted
     * @param subnet_id The subnet identifier
     * @param asset_code The asset code
     * @param issuer The asset issuer
     * @return isWhitelisted True if asset is whitelisted
     */
    function _is_asset_whitelisted(
        bytes32 subnet_id,
        string memory asset_code,
        bytes32 issuer
    ) internal view returns (bool) {
        return subnetFactory.is_asset_whitelisted(subnet_id, asset_code, issuer);
    }

    /**
     * @notice Credits an amount to a user's balance
     * @param subnet_id The subnet identifier
     * @param user_id The user identifier
     * @param asset_code The asset code
     * @param issuer The asset issuer (or "NATIVE" for XLM)
     * @param amount The amount to credit (in stroops)
     */
    function credit(
        bytes32 subnet_id,
        bytes32 user_id,
        string memory asset_code,
        bytes32 issuer,
        int128 amount
    ) public {
        // Validate amount is positive
        require(amount > 0, "ExecutionCore: Amount must be positive");

        // Validate subnet exists and is active
        _validate_subnet(subnet_id);

        // Validate asset is whitelisted
        require(_is_asset_whitelisted(subnet_id, asset_code, issuer), "ExecutionCore: Asset not whitelisted");

        // Compute asset key
        bytes32 asset_key = _compute_asset_key(asset_code, issuer);

        // Credit balance
        balances[subnet_id][user_id][asset_key] += amount;

        // Extend TTL for balance entry
        balances[subnet_id][user_id][asset_key].extendTtl(100, 5000);

        // Emit event
        emit Credited(subnet_id, user_id, asset_code, issuer, amount);
    }

    /**
     * @notice Debits an amount from a user's balance
     * @param subnet_id The subnet identifier
     * @param user_id The user identifier
     * @param asset_code The asset code
     * @param issuer The asset issuer (or "NATIVE" for XLM)
     * @param amount The amount to debit (in stroops)
     */
    function debit(
        bytes32 subnet_id,
        bytes32 user_id,
        string memory asset_code,
        bytes32 issuer,
        int128 amount
    ) public {
        // Validate amount is positive
        require(amount > 0, "ExecutionCore: Amount must be positive");

        // Validate subnet exists and is active
        _validate_subnet(subnet_id);

        // Validate asset is whitelisted
        require(_is_asset_whitelisted(subnet_id, asset_code, issuer), "ExecutionCore: Asset not whitelisted");

        // Compute asset key
        bytes32 asset_key = _compute_asset_key(asset_code, issuer);

        // Validate sufficient balance (prevent negative balances)
        require(
            balances[subnet_id][user_id][asset_key] >= amount,
            "ExecutionCore: Insufficient balance"
        );

        // Debit balance
        balances[subnet_id][user_id][asset_key] -= amount;

        // Extend TTL for balance entry
        balances[subnet_id][user_id][asset_key].extendTtl(100, 5000);

        // Emit event
        emit Debited(subnet_id, user_id, asset_code, issuer, amount);
    }

    /**
     * @notice Transfers an amount from one user to another
     * @param subnet_id The subnet identifier
     * @param from_user The sender user identifier
     * @param to_user The recipient user identifier
     * @param asset_code The asset code
     * @param issuer The asset issuer (or "NATIVE" for XLM)
     * @param amount The amount to transfer (in stroops)
     */
    function transfer(
        bytes32 subnet_id,
        bytes32 from_user,
        bytes32 to_user,
        string memory asset_code,
        bytes32 issuer,
        int128 amount
    ) public {
        // Validate amount is positive
        require(amount > 0, "ExecutionCore: Amount must be positive");

        // Validate from and to are different
        require(from_user != to_user, "ExecutionCore: Cannot transfer to self");

        // Validate subnet exists and is active
        _validate_subnet(subnet_id);

        // Validate asset is whitelisted
        require(_is_asset_whitelisted(subnet_id, asset_code, issuer), "ExecutionCore: Asset not whitelisted");

        // Compute asset key
        bytes32 asset_key = _compute_asset_key(asset_code, issuer);

        // Validate sufficient balance
        require(
            balances[subnet_id][from_user][asset_key] >= amount,
            "ExecutionCore: Insufficient balance"
        );

        // Atomic transfer: debit from_user, credit to_user
        balances[subnet_id][from_user][asset_key] -= amount;
        balances[subnet_id][to_user][asset_key] += amount;

        // Extend TTL for both balance entries
        balances[subnet_id][from_user][asset_key].extendTtl(100, 5000);
        balances[subnet_id][to_user][asset_key].extendTtl(100, 5000);

        // Emit event
        emit Transferred(subnet_id, from_user, to_user, asset_code, issuer, amount);
    }

    /**
     * @notice Requests a withdrawal - debits balance and adds to withdrawal queue
     * @dev Money does not move on L1 until settlement engine processes it
     * @param subnet_id The subnet identifier
     * @param user_id The user identifier
     * @param asset_code The asset code
     * @param issuer The asset issuer (or "NATIVE" for XLM)
     * @param amount The amount to withdraw (in stroops)
     * @param destination The Stellar destination address (Ed25519 public key)
     * @return withdrawal_id The unique withdrawal identifier
     */
    function request_withdrawal(
        bytes32 subnet_id,
        bytes32 user_id,
        string memory asset_code,
        bytes32 issuer,
        int128 amount,
        bytes32 destination
    ) public returns (bytes32) {
        // Validate amount is positive
        require(amount > 0, "ExecutionCore: Amount must be positive");

        // Validate subnet exists and is active
        _validate_subnet(subnet_id);

        // Validate asset is whitelisted
        require(_is_asset_whitelisted(subnet_id, asset_code, issuer), "ExecutionCore: Asset not whitelisted");

        // Validate destination is not zero
        require(destination != bytes32(0), "ExecutionCore: Invalid destination");

        // Compute asset key
        bytes32 asset_key = _compute_asset_key(asset_code, issuer);

        // Validate sufficient balance
        require(
            balances[subnet_id][user_id][asset_key] >= amount,
            "ExecutionCore: Insufficient balance"
        );

        // Debit balance immediately (money doesn't move yet, but balance is reduced)
        balances[subnet_id][user_id][asset_key] -= amount;

        // Generate unique withdrawal_id
        uint64 currentNonce = nonces[subnet_id];
        bytes32 withdrawal_id = keccak256(abi.encodePacked(
            subnet_id,
            currentNonce,
            user_id,
            amount,
            destination
        ));

        // Create withdrawal struct
        Withdrawal memory withdrawal = Withdrawal({
            withdrawal_id: withdrawal_id,
            user_id: user_id,
            asset_code: asset_code,
            issuer: issuer,
            amount: amount,
            destination: destination
        });

        // Add to withdrawal queue
        withdrawalQueues[subnet_id].push(withdrawal);

        // Increment nonce
        nonces[subnet_id] = currentNonce + 1;

        // Extend TTL for balance, withdrawal queue, and nonce
        balances[subnet_id][user_id][asset_key].extendTtl(100, 5000);
        withdrawalQueues[subnet_id].extendTtl(100, 5000);
        nonces[subnet_id].extendTtl(100, 5000);

        // Emit event
        emit WithdrawalRequested(
            subnet_id,
            withdrawal_id,
            user_id,
            asset_code,
            issuer,
            amount,
            destination
        );

        return withdrawal_id;
    }

    /**
     * @notice Gets the balance for a user and asset
     * @param subnet_id The subnet identifier
     * @param user_id The user identifier
     * @param asset_code The asset code
     * @param issuer The asset issuer (or "NATIVE" for XLM)
     * @return balance The current balance (in stroops)
     */
    function get_balance(
        bytes32 subnet_id,
        bytes32 user_id,
        string memory asset_code,
        bytes32 issuer
    ) public view returns (int128) {
        bytes32 asset_key = _compute_asset_key(asset_code, issuer);
        return balances[subnet_id][user_id][asset_key];
    }

    /**
     * @notice Gets the withdrawal queue for a subnet
     * @dev This is the format Arko needs for settlement
     * @param subnet_id The subnet identifier
     * @return withdrawals Array of withdrawal structs
     */
    function get_withdrawal_queue(bytes32 subnet_id) public view returns (Withdrawal[] memory) {
        return withdrawalQueues[subnet_id];
    }

    /**
     * @notice Gets the current nonce for a subnet
     * @param subnet_id The subnet identifier
     * @return nonce The current nonce value
     */
    function get_nonce(bytes32 subnet_id) public view returns (uint64) {
        return nonces[subnet_id];
    }

    /**
     * @notice Gets the length of the withdrawal queue for a subnet
     * @param subnet_id The subnet identifier
     * @return length The number of withdrawals in the queue
     */
    function get_withdrawal_queue_length(bytes32 subnet_id) public view returns (uint256) {
        return withdrawalQueues[subnet_id].length;
    }
}

