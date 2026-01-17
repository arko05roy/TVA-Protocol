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

    // Persistent storage - track balance entries for state root computation
    // Maps subnet_id => array of (user_id, asset_key) pairs
    struct BalanceEntry {
        bytes32 user_id;
        bytes32 asset_key;
        string asset_code;
        bytes32 issuer;
    }
    mapping(bytes32 => BalanceEntry[]) public persistent balanceEntries;

    // Phase 5: Commitment storage
    // Maps subnet_id => block_number => state_root
    mapping(bytes32 => mapping(uint64 => bytes32)) public persistent commits;
    
    // Phase 5: Track last committed block per subnet (for monotonicity check)
    mapping(bytes32 => uint64) public persistent lastCommittedBlock;

    // PoM Result enum
    enum PomResult {
        Ok,
        Insolvent,
        NonConstructible,
        Unauthorized
    }

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

    // Phase 3 Events
    event StateRootComputed(
        bytes32 indexed subnet_id,
        bytes32 state_root,
        uint64 nonce
    );

    // Phase 4 Events
    event PomValidated(
        bytes32 indexed subnet_id,
        uint8 result  // 0=Ok, 1=Insolvent, 2=NonConstructible, 3=Unauthorized
    );

    // Phase 5 Events
    event StateCommitted(
        bytes32 indexed subnet_id,
        uint64 indexed block_number,
        bytes32 state_root
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

        // Track balance entry if it's new (for state root computation)
        _track_balance_entry(subnet_id, user_id, asset_key, asset_code, issuer);

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

        // Track balance entries (for state root computation)
        _track_balance_entry(subnet_id, from_user, asset_key, asset_code, issuer);
        _track_balance_entry(subnet_id, to_user, asset_key, asset_code, issuer);

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

    /**
     * @notice Internal helper to track balance entries for state root computation
     */
    function _track_balance_entry(
        bytes32 subnet_id,
        bytes32 user_id,
        bytes32 asset_key,
        string memory asset_code,
        bytes32 issuer
    ) internal {
        // Check if entry already exists
        BalanceEntry[] storage entries = balanceEntries[subnet_id];
        for (uint i = 0; i < entries.length; i++) {
            if (entries[i].user_id == user_id && entries[i].asset_key == asset_key) {
                return; // Already tracked
            }
        }

        // Add new entry
        entries.push(BalanceEntry({
            user_id: user_id,
            asset_key: asset_key,
            asset_code: asset_code,
            issuer: issuer
        }));
        balanceEntries[subnet_id].extendTtl(100, 5000);
    }

    // ========== PHASE 3: STATE ROOT COMPUTATION ==========

    /**
     * @notice Computes a balance leaf hash
     * @dev Uses keccak256 (Solang limitation - documented deviation from SHA-256 spec)
     */
    function _compute_balance_leaf(
        bytes32 user_id,
        string memory asset_code,
        bytes32 issuer,
        int128 balance
    ) internal pure returns (bytes32) {
        // Note: Using keccak256 instead of SHA-256 due to Solang limitation
        // This is a documented deviation from interfaces.md
        bytes memory input = abi.encodePacked(
            "BAL",
            user_id,
            asset_code,
            issuer,
            balance
        );
        return keccak256(input);
    }

    /**
     * @notice Computes a withdrawal leaf hash
     * @dev Uses keccak256 (Solang limitation - documented deviation from SHA-256 spec)
     */
    function _compute_withdrawal_leaf(Withdrawal memory withdrawal) internal pure returns (bytes32) {
        // Note: Using keccak256 instead of SHA-256 due to Solang limitation
        bytes memory input = abi.encodePacked(
            "WD",
            withdrawal.withdrawal_id,
            withdrawal.user_id,
            withdrawal.asset_code,
            withdrawal.issuer,
            withdrawal.amount,
            withdrawal.destination
        );
        return keccak256(input);
    }

    /**
     * @notice Sorts an array of bytes32 values lexicographically
     */
    function _sort_bytes32_array(bytes32[] memory arr) internal pure returns (bytes32[] memory) {
        // Simple bubble sort for small arrays (will optimize if needed)
        bytes32[] memory sorted = new bytes32[](arr.length);
        for (uint i = 0; i < arr.length; i++) {
            sorted[i] = arr[i];
        }

        for (uint i = 0; i < sorted.length; i++) {
            for (uint j = i + 1; j < sorted.length; j++) {
                if (sorted[i] > sorted[j]) {
                    bytes32 temp = sorted[i];
                    sorted[i] = sorted[j];
                    sorted[j] = temp;
                }
            }
        }
        return sorted;
    }

    /**
     * @notice Builds a Merkle tree from sorted leaves
     */
    function _build_merkle_tree(bytes32[] memory sortedLeaves) internal pure returns (bytes32) {
        if (sortedLeaves.length == 0) {
            return bytes32(0);
        }
        if (sortedLeaves.length == 1) {
            return sortedLeaves[0];
        }

        // Build tree level by level
        bytes32[] memory currentLevel = sortedLeaves;
        
        while (currentLevel.length > 1) {
            uint nextLevelLength = (currentLevel.length + 1) / 2;
            bytes32[] memory nextLevel = new bytes32[](nextLevelLength);
            
            for (uint i = 0; i < currentLevel.length; i += 2) {
                bytes32 left = currentLevel[i];
                bytes32 right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : currentLevel[i];
                nextLevel[i / 2] = keccak256(abi.encodePacked(left, right));
            }
            
            currentLevel = nextLevel;
        }
        
        return currentLevel[0];
    }

    /**
     * @notice Computes the state root for a subnet
     * @dev Phase 3: State Root Computation
     * @param subnet_id The subnet identifier
     * @return state_root The computed state root (bytes32)
     */
    function compute_state_root(bytes32 subnet_id) public view returns (bytes32) {
        // Validate subnet exists
        require(subnetFactory.subnet_exists(subnet_id), "ExecutionCore: Subnet does not exist");

        // Step 1: Collect balance leaves (only non-zero balances)
        BalanceEntry[] storage entries = balanceEntries[subnet_id];
        
        // First pass: count non-zero balances
        uint nonZeroCount = 0;
        for (uint i = 0; i < entries.length; i++) {
            BalanceEntry storage entry = entries[i];
            int128 balance = balances[subnet_id][entry.user_id][entry.asset_key];
            if (balance != 0) {
                nonZeroCount++;
            }
        }

        // Second pass: collect non-zero balance leaves
        bytes32[] memory balanceLeaves = new bytes32[](nonZeroCount);
        uint leafIndex = 0;
        for (uint i = 0; i < entries.length; i++) {
            BalanceEntry storage entry = entries[i];
            int128 balance = balances[subnet_id][entry.user_id][entry.asset_key];
            if (balance != 0) {
                balanceLeaves[leafIndex] = _compute_balance_leaf(
                    entry.user_id,
                    entry.asset_code,
                    entry.issuer,
                    balance
                );
                leafIndex++;
            }
        }

        // Step 2: Collect withdrawal leaves
        Withdrawal[] storage withdrawals = withdrawalQueues[subnet_id];
        bytes32[] memory withdrawalLeaves = new bytes32[](withdrawals.length);
        
        for (uint i = 0; i < withdrawals.length; i++) {
            withdrawalLeaves[i] = _compute_withdrawal_leaf(withdrawals[i]);
        }

        // Step 3: Sort leaves lexicographically
        bytes32[] memory sortedBalanceLeaves = _sort_bytes32_array(balanceLeaves);
        bytes32[] memory sortedWithdrawalLeaves = _sort_bytes32_array(withdrawalLeaves);

        // Step 4: Build separate Merkle trees
        bytes32 balances_root = _build_merkle_tree(sortedBalanceLeaves);
        bytes32 withdrawals_root = _build_merkle_tree(sortedWithdrawalLeaves);

        // Step 5: Compute final state root
        uint64 nonce = nonces[subnet_id];
        bytes memory stateRootInput = abi.encodePacked(
            balances_root,
            withdrawals_root,
            nonce
        );
        bytes32 state_root = keccak256(stateRootInput);
        
        // Emit event
        emit StateRootComputed(subnet_id, state_root, nonce);
        
        return state_root;
    }

    // ========== PHASE 4: PROOF OF MONEY (PoM) ==========

    /**
     * @notice Computes net outflow from withdrawal queue, grouped by asset
     * @dev Phase 4: PoM - Net Outflow Computation
     * @param subnet_id The subnet identifier
     * @return asset_ids Array of asset IDs (bytes32)
     * @return amounts Array of net outflow amounts (int128)
     */
    function compute_net_outflow(bytes32 subnet_id) public view returns (
        bytes32[] memory asset_ids,
        int128[] memory amounts
    ) {
        Withdrawal[] storage withdrawals = withdrawalQueues[subnet_id];
        
        // Use a mapping-like structure (we'll use arrays since mappings can't be returned)
        // For simplicity, we'll create arrays and deduplicate
        bytes32[] memory uniqueAssetIds = new bytes32[](withdrawals.length);
        int128[] memory uniqueAmounts = new int128[](withdrawals.length);
        uint uniqueCount = 0;

        for (uint i = 0; i < withdrawals.length; i++) {
            Withdrawal storage w = withdrawals[i];
            bytes32 asset_id = keccak256(abi.encodePacked(w.asset_code, w.issuer));
            
            // Find or create entry
            bool found = false;
            for (uint j = 0; j < uniqueCount; j++) {
                if (uniqueAssetIds[j] == asset_id) {
                    uniqueAmounts[j] += w.amount;
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                uniqueAssetIds[uniqueCount] = asset_id;
                uniqueAmounts[uniqueCount] = w.amount;
                uniqueCount++;
            }
        }

        // Trim arrays to actual size
        bytes32[] memory resultAssetIds = new bytes32[](uniqueCount);
        int128[] memory resultAmounts = new int128[](uniqueCount);
        
        for (uint i = 0; i < uniqueCount; i++) {
            resultAssetIds[i] = uniqueAssetIds[i];
            resultAmounts[i] = uniqueAmounts[i];
        }

        return (resultAssetIds, resultAmounts);
    }

    /**
     * @notice Checks if treasury has sufficient balance to cover net outflow
     * @dev Phase 4: PoM - Solvency Check
     * @param subnet_id The subnet identifier
     * @param treasury_balances Map of asset_id => balance (passed as arrays)
     * @return isSolvent True if treasury can cover all withdrawals
     */
    function check_solvency(
        bytes32 subnet_id,
        bytes32[] memory treasury_asset_ids,
        int128[] memory treasury_balances
    ) public view returns (bool) {
        (bytes32[] memory outflow_asset_ids, int128[] memory outflow_amounts) = compute_net_outflow(subnet_id);

        // For each outflow asset, check treasury balance
        for (uint i = 0; i < outflow_asset_ids.length; i++) {
            bytes32 asset_id = outflow_asset_ids[i];
            int128 outflow = outflow_amounts[i];

            // Find treasury balance for this asset
            int128 treasury_balance = 0;
            for (uint j = 0; j < treasury_asset_ids.length; j++) {
                if (treasury_asset_ids[j] == asset_id) {
                    treasury_balance = treasury_balances[j];
                    break;
                }
            }

            // Check solvency
            if (treasury_balance < outflow) {
                return false; // Insolvent
            }
        }

        return true; // Solvent
    }

    /**
     * @notice Checks if all withdrawals are constructible (valid destinations)
     * @dev Phase 4: PoM - Constructibility Check
     * @param subnet_id The subnet identifier
     * @return isConstructible True if all withdrawals have valid destinations
     */
    function check_constructibility(bytes32 subnet_id) public view returns (bool) {
        Withdrawal[] storage withdrawals = withdrawalQueues[subnet_id];

        for (uint i = 0; i < withdrawals.length; i++) {
            Withdrawal storage w = withdrawals[i];
            
            // Check destination is not zero
            if (w.destination == bytes32(0)) {
                return false;
            }

            // Check amount is positive
            if (w.amount <= 0) {
                return false;
            }

            // Check asset_code is not empty
            bytes memory assetCodeBytes = bytes(w.asset_code);
            if (assetCodeBytes.length == 0 || assetCodeBytes.length > 12) {
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Checks if auditors are authorized signers of the treasury
     * @dev Phase 4: PoM - Authorization Check
     * @param subnet_id The subnet identifier
     * @param treasury_signers Array of treasury signer public keys
     * @param treasury_threshold The treasury threshold
     * @return isAuthorized True if auditors can meet threshold
     */
    function check_authorization(
        bytes32 subnet_id,
        bytes32[] memory treasury_signers,
        uint32 treasury_threshold
    ) public view returns (bool) {
        // Get subnet auditors
        (, bytes32[] memory auditors, uint32 subnet_threshold, , , ) = subnetFactory.get_subnet(subnet_id);

        // Count how many auditors are in treasury signers
        uint32 matchingCount = 0;
        for (uint i = 0; i < auditors.length; i++) {
            for (uint j = 0; j < treasury_signers.length; j++) {
                if (auditors[i] == treasury_signers[j]) {
                    matchingCount++;
                    break;
                }
            }
        }

        // Check if matching auditors can meet threshold
        // We need: matchingCount >= treasury_threshold AND matchingCount >= subnet_threshold
        return (matchingCount >= treasury_threshold && matchingCount >= subnet_threshold);
    }

    /**
     * @notice Validates Proof of Money (PoM) for a subnet
     * @dev Phase 4: PoM - Complete Validation
     * @param subnet_id The subnet identifier
     * @param treasury_asset_ids Array of asset IDs in treasury
     * @param treasury_balances Array of balances for each asset
     * @param treasury_signers Array of treasury signer public keys
     * @param treasury_threshold The treasury threshold
     * @return result PomResult enum indicating validation result
     */
    function pom_validate(
        bytes32 subnet_id,
        bytes32[] memory treasury_asset_ids,
        int128[] memory treasury_balances,
        bytes32[] memory treasury_signers,
        uint32 treasury_threshold
    ) public view returns (PomResult) {
        // Check constructibility
        if (!check_constructibility(subnet_id)) {
            emit PomValidated(subnet_id, uint8(PomResult.NonConstructible));
            return PomResult.NonConstructible;
        }

        // Check solvency
        if (!check_solvency(subnet_id, treasury_asset_ids, treasury_balances)) {
            emit PomValidated(subnet_id, uint8(PomResult.Insolvent));
            return PomResult.Insolvent;
        }

        // Check authorization
        if (!check_authorization(subnet_id, treasury_signers, treasury_threshold)) {
            emit PomValidated(subnet_id, uint8(PomResult.Unauthorized));
            return PomResult.Unauthorized;
        }

        emit PomValidated(subnet_id, uint8(PomResult.Ok));
        return PomResult.Ok;
    }

    // ========== PHASE 5: COMMITMENT CONTRACT ==========

    /**
     * @notice Commits a state root for a subnet after PoM validation
     * @dev Phase 5: Commitment Contract
     * @param subnet_id The subnet identifier
     * @param block_number The block number (must be monotonic)
     * @param state_root The computed state root
     * @param auditor_signers Array of auditor public keys who signed (must meet threshold)
     * @param treasury_asset_ids Array of asset IDs in treasury snapshot
     * @param treasury_balances Array of balances for each asset
     * @param treasury_signers Array of treasury signer public keys
     * @param treasury_threshold The treasury threshold
     */
    function commit_state(
        bytes32 subnet_id,
        uint64 block_number,
        bytes32 state_root,
        bytes32[] memory auditor_signers,
        bytes32[] memory treasury_asset_ids,
        int128[] memory treasury_balances,
        bytes32[] memory treasury_signers,
        uint32 treasury_threshold
    ) public {
        // Validate subnet exists and is active
        _validate_subnet(subnet_id);

        // Validate state_root is non-zero
        require(state_root != bytes32(0), "ExecutionCore: State root cannot be zero");

        // Validate block_number is monotonic
        uint64 lastBlock = lastCommittedBlock[subnet_id];
        require(block_number > lastBlock, "ExecutionCore: Block number must be monotonic");

        // Verify auditor signatures (check that signers are valid auditors and meet threshold)
        (, bytes32[] memory auditors, uint32 subnet_threshold, , , ) = subnetFactory.get_subnet(subnet_id);
        
        // Count how many auditor_signers are valid auditors
        uint32 validSignerCount = 0;
        for (uint i = 0; i < auditor_signers.length; i++) {
            for (uint j = 0; j < auditors.length; j++) {
                if (auditor_signers[i] == auditors[j]) {
                    validSignerCount++;
                    break;
                }
            }
        }

        // Verify threshold is met
        require(
            validSignerCount >= subnet_threshold,
            "ExecutionCore: Insufficient auditor signatures"
        );

        // Verify auditor signers are authorized treasury signers
        require(
            check_authorization(subnet_id, treasury_signers, treasury_threshold),
            "ExecutionCore: Auditors not authorized for treasury"
        );

        // Run PoM validation (CRITICAL: if PoM fails, revert)
        PomResult pomResult = pom_validate(
            subnet_id,
            treasury_asset_ids,
            treasury_balances,
            treasury_signers,
            treasury_threshold
        );
        
        require(
            pomResult == PomResult.Ok,
            "ExecutionCore: PoM validation failed"
        );

        // Store the commit
        commits[subnet_id][block_number] = state_root;
        
        // Update last committed block
        lastCommittedBlock[subnet_id] = block_number;

        // Extend TTL for commit storage
        commits[subnet_id][block_number].extendTtl(100, 5000);
        lastCommittedBlock[subnet_id].extendTtl(100, 5000);

        // Emit StateCommitted event (Arko listens to this)
        emit StateCommitted(subnet_id, block_number, state_root);
    }

    /**
     * @notice Gets the committed state root for a subnet at a specific block
     * @param subnet_id The subnet identifier
     * @param block_number The block number
     * @return state_root The committed state root (bytes32(0) if not committed)
     */
    function get_commit(bytes32 subnet_id, uint64 block_number) public view returns (bytes32) {
        return commits[subnet_id][block_number];
    }

    /**
     * @notice Gets the last committed block number for a subnet
     * @param subnet_id The subnet identifier
     * @return block_number The last committed block number (0 if none)
     */
    function get_last_committed_block(bytes32 subnet_id) public view returns (uint64) {
        return lastCommittedBlock[subnet_id];
    }
}

