pragma solidity 0;

/**
 * @title ExecutionCore
 * @notice Handles all financial operations for ASTRAEUS subnets (Soroban-compatible)
 * @dev Standalone version: no cross-contract calls (Soroban pre-alpha limitation)
 *      Subnet validation is done internally via stored subnet data.
 *      Fixed: removed emit from view functions, removed block.timestamp
 */
contract ExecutionCore {
    // Instance storage - contract-wide configuration
    address public instance executionAdmin;

    // ===== INLINE SUBNET REGISTRY (replaces cross-contract call to SubnetFactory) =====
    struct Asset {
        string code;
        bytes32 issuer;
    }

    struct SubnetConfig {
        bytes32 admin;
        bytes32[] auditors;
        uint32 threshold;
        Asset[] assets;
        address treasury;
        bool active;
    }

    mapping(bytes32 => SubnetConfig) public persistent subnetConfigs;
    uint64 public persistent subnetCounter;

    // ===== EXECUTION STATE =====
    // balances: subnet_id => user_id => asset_key => balance
    mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => int128))) public persistent balances;

    // Withdrawal queues per subnet
    struct Withdrawal {
        bytes32 withdrawal_id;
        bytes32 user_id;
        string asset_code;
        bytes32 issuer;
        int128 amount;
        bytes32 destination;
    }
    mapping(bytes32 => Withdrawal[]) public persistent withdrawalQueues;

    // Nonce per subnet (block number)
    mapping(bytes32 => uint64) public persistent nonces;

    // Balance entry tracking for state root computation
    struct BalanceEntry {
        bytes32 user_id;
        bytes32 asset_key;
        string asset_code;
        bytes32 issuer;
    }
    mapping(bytes32 => BalanceEntry[]) public persistent balanceEntries;

    // Phase 5: Commitment storage (subnet_id => block_number => state_root)
    mapping(bytes32 => mapping(uint64 => bytes32)) public persistent commits;
    mapping(bytes32 => uint64) public persistent lastCommittedBlock;

    // PoM Result enum
    enum PomResult {
        Ok,
        Insolvent,
        NonConstructible,
        Unauthorized
    }

    constructor(address _executionAdmin) {
        executionAdmin = _executionAdmin;
        subnetCounter = 0;
    }

    // ===== SUBNET MANAGEMENT =====

    function create_subnet(
        bytes32 admin,
        bytes32[] memory auditors,
        uint32 threshold,
        Asset[] memory assets
    ) public returns (bytes32) {
        executionAdmin.requireAuth();
        require(auditors.length >= 3, "At least 3 auditors required");
        uint32 minThreshold = uint32((auditors.length / 2) + 1);
        require(threshold >= minThreshold, "Threshold too low");
        require(assets.length > 0, "At least one asset required");

        subnetCounter += 1;
        bytes32 subnet_id = keccak256(abi.encodePacked(admin, subnetCounter));

        require(subnetConfigs[subnet_id].admin == bytes32(0), "Subnet ID collision");

        SubnetConfig storage subnet = subnetConfigs[subnet_id];
        subnet.admin = admin;
        subnet.threshold = threshold;
        subnet.active = false;
        subnet.treasury = address(0);

        for (uint i = 0; i < auditors.length; i++) {
            subnet.auditors.push(auditors[i]);
        }
        for (uint i = 0; i < assets.length; i++) {
            subnet.assets.push(assets[i]);
        }

        subnetCounter.extendTtl(100, 5000);
        return subnet_id;
    }

    function register_treasury(bytes32 subnet_id, address treasury_address) public {
        executionAdmin.requireAuth();
        require(subnetConfigs[subnet_id].admin != bytes32(0), "Subnet does not exist");
        require(treasury_address != address(0), "Invalid treasury address");
        require(!subnetConfigs[subnet_id].active, "Subnet already active");

        subnetConfigs[subnet_id].treasury = treasury_address;
        subnetConfigs[subnet_id].active = true;
    }

    // ===== INTERNAL HELPERS =====

    function _compute_asset_key(string memory asset_code, bytes32 issuer) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(asset_code, issuer));
    }

    function _validate_subnet(bytes32 subnet_id) internal view {
        require(subnetConfigs[subnet_id].admin != bytes32(0), "Subnet does not exist");
        require(subnetConfigs[subnet_id].active, "Subnet is not active");
        require(subnetConfigs[subnet_id].treasury != address(0), "Treasury not registered");
    }

    function _is_asset_whitelisted(bytes32 subnet_id, string memory asset_code, bytes32 issuer) internal view returns (bool) {
        SubnetConfig storage subnet = subnetConfigs[subnet_id];
        for (uint i = 0; i < subnet.assets.length; i++) {
            if (keccak256(bytes(subnet.assets[i].code)) == keccak256(bytes(asset_code)) && subnet.assets[i].issuer == issuer) {
                return true;
            }
        }
        return false;
    }

    function _track_balance_entry(bytes32 subnet_id, bytes32 user_id, bytes32 asset_key, string memory asset_code, bytes32 issuer) internal {
        BalanceEntry[] storage entries = balanceEntries[subnet_id];
        for (uint i = 0; i < entries.length; i++) {
            if (entries[i].user_id == user_id && entries[i].asset_key == asset_key) {
                return;
            }
        }
        entries.push(BalanceEntry({user_id: user_id, asset_key: asset_key, asset_code: asset_code, issuer: issuer}));
    }

    // ===== FINANCIAL OPERATIONS =====

    function credit(bytes32 subnet_id, bytes32 user_id, string memory asset_code, bytes32 issuer, int128 amount) public {
        executionAdmin.requireAuth();
        require(amount > 0, "Amount must be positive");
        _validate_subnet(subnet_id);
        require(_is_asset_whitelisted(subnet_id, asset_code, issuer), "Asset not whitelisted");

        bytes32 asset_key = _compute_asset_key(asset_code, issuer);
        balances[subnet_id][user_id][asset_key] += amount;
        _track_balance_entry(subnet_id, user_id, asset_key, asset_code, issuer);
    }

    function debit(bytes32 subnet_id, bytes32 user_id, string memory asset_code, bytes32 issuer, int128 amount) public {
        executionAdmin.requireAuth();
        require(amount > 0, "Amount must be positive");
        _validate_subnet(subnet_id);
        require(_is_asset_whitelisted(subnet_id, asset_code, issuer), "Asset not whitelisted");

        bytes32 asset_key = _compute_asset_key(asset_code, issuer);
        require(balances[subnet_id][user_id][asset_key] >= amount, "Insufficient balance");
        balances[subnet_id][user_id][asset_key] -= amount;
    }

    function transfer(bytes32 subnet_id, bytes32 from_user, bytes32 to_user, string memory asset_code, bytes32 issuer, int128 amount) public {
        executionAdmin.requireAuth();
        require(amount > 0, "Amount must be positive");
        require(from_user != to_user, "Cannot transfer to self");
        _validate_subnet(subnet_id);
        require(_is_asset_whitelisted(subnet_id, asset_code, issuer), "Asset not whitelisted");

        bytes32 asset_key = _compute_asset_key(asset_code, issuer);
        require(balances[subnet_id][from_user][asset_key] >= amount, "Insufficient balance");

        balances[subnet_id][from_user][asset_key] -= amount;
        balances[subnet_id][to_user][asset_key] += amount;
        _track_balance_entry(subnet_id, from_user, asset_key, asset_code, issuer);
        _track_balance_entry(subnet_id, to_user, asset_key, asset_code, issuer);
    }

    function request_withdrawal(bytes32 subnet_id, bytes32 user_id, string memory asset_code, bytes32 issuer, int128 amount, bytes32 destination) public returns (bytes32) {
        executionAdmin.requireAuth();
        require(amount > 0, "Amount must be positive");
        _validate_subnet(subnet_id);
        require(_is_asset_whitelisted(subnet_id, asset_code, issuer), "Asset not whitelisted");
        require(destination != bytes32(0), "Invalid destination");

        bytes32 asset_key = _compute_asset_key(asset_code, issuer);
        require(balances[subnet_id][user_id][asset_key] >= amount, "Insufficient balance");

        balances[subnet_id][user_id][asset_key] -= amount;

        uint64 currentNonce = nonces[subnet_id];
        bytes32 withdrawal_id = keccak256(abi.encodePacked(subnet_id, currentNonce, user_id, amount, destination));

        withdrawalQueues[subnet_id].push(Withdrawal({
            withdrawal_id: withdrawal_id,
            user_id: user_id,
            asset_code: asset_code,
            issuer: issuer,
            amount: amount,
            destination: destination
        }));

        nonces[subnet_id] = currentNonce + 1;
        nonces[subnet_id].extendTtl(100, 5000);

        return withdrawal_id;
    }

    // ===== QUERY FUNCTIONS =====

    function get_balance(bytes32 subnet_id, bytes32 user_id, string memory asset_code, bytes32 issuer) public view returns (int128) {
        bytes32 asset_key = _compute_asset_key(asset_code, issuer);
        return balances[subnet_id][user_id][asset_key];
    }

    function get_withdrawal_queue(bytes32 subnet_id) public view returns (Withdrawal[] memory) {
        return withdrawalQueues[subnet_id];
    }

    function get_nonce(bytes32 subnet_id) public view returns (uint64) {
        return nonces[subnet_id];
    }

    function get_withdrawal_queue_length(bytes32 subnet_id) public view returns (uint256) {
        return withdrawalQueues[subnet_id].length;
    }

    function subnet_exists(bytes32 subnet_id) public view returns (bool) {
        return subnetConfigs[subnet_id].admin != bytes32(0);
    }

    function get_subnet(bytes32 subnet_id) public view returns (
        bytes32 admin,
        bytes32[] memory auditors,
        uint32 threshold,
        Asset[] memory assets,
        address treasury,
        bool active
    ) {
        SubnetConfig storage subnet = subnetConfigs[subnet_id];
        require(subnet.admin != bytes32(0), "Subnet does not exist");
        return (subnet.admin, subnet.auditors, subnet.threshold, subnet.assets, subnet.treasury, subnet.active);
    }

    // ===== PHASE 3: STATE ROOT COMPUTATION =====

    function _compute_balance_leaf(bytes32 user_id, string memory asset_code, bytes32 issuer, int128 balance) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("BAL", user_id, asset_code, issuer, balance));
    }

    function _compute_withdrawal_leaf(Withdrawal memory withdrawal) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("WD", withdrawal.withdrawal_id, withdrawal.user_id, withdrawal.asset_code, withdrawal.issuer, withdrawal.amount, withdrawal.destination));
    }

    function _sort_bytes32_array(bytes32[] memory arr) internal pure returns (bytes32[] memory) {
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

    function _build_merkle_tree(bytes32[] memory sortedLeaves) internal pure returns (bytes32) {
        if (sortedLeaves.length == 0) return bytes32(0);
        if (sortedLeaves.length == 1) return sortedLeaves[0];

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
     */
    function compute_state_root(bytes32 subnet_id) public view returns (bytes32) {
        require(subnetConfigs[subnet_id].admin != bytes32(0), "Subnet does not exist");

        BalanceEntry[] storage entries = balanceEntries[subnet_id];

        // Count non-zero balances
        uint nonZeroCount = 0;
        for (uint i = 0; i < entries.length; i++) {
            int128 bal = balances[subnet_id][entries[i].user_id][entries[i].asset_key];
            if (bal != 0) nonZeroCount++;
        }

        // Collect balance leaves
        bytes32[] memory balanceLeaves = new bytes32[](nonZeroCount);
        uint leafIndex = 0;
        for (uint i = 0; i < entries.length; i++) {
            int128 bal = balances[subnet_id][entries[i].user_id][entries[i].asset_key];
            if (bal != 0) {
                balanceLeaves[leafIndex] = _compute_balance_leaf(entries[i].user_id, entries[i].asset_code, entries[i].issuer, bal);
                leafIndex++;
            }
        }

        // Collect withdrawal leaves
        Withdrawal[] storage withdrawals = withdrawalQueues[subnet_id];
        bytes32[] memory withdrawalLeaves = new bytes32[](withdrawals.length);
        for (uint i = 0; i < withdrawals.length; i++) {
            withdrawalLeaves[i] = _compute_withdrawal_leaf(withdrawals[i]);
        }

        // Sort and build Merkle trees
        bytes32 balances_root = _build_merkle_tree(_sort_bytes32_array(balanceLeaves));
        bytes32 withdrawals_root = _build_merkle_tree(_sort_bytes32_array(withdrawalLeaves));

        // Compute final state root
        uint64 nonce = nonces[subnet_id];
        bytes32 state_root = keccak256(abi.encodePacked(balances_root, withdrawals_root, nonce));

        return state_root;
    }

    // ===== PHASE 4: PROOF OF MONEY =====

    function compute_net_outflow(bytes32 subnet_id) public view returns (bytes32[] memory, int128[] memory) {
        Withdrawal[] storage withdrawals = withdrawalQueues[subnet_id];

        bytes32[] memory uniqueAssetIds = new bytes32[](withdrawals.length);
        int128[] memory uniqueAmounts = new int128[](withdrawals.length);
        uint uniqueCount = 0;

        for (uint i = 0; i < withdrawals.length; i++) {
            bytes32 asset_id = keccak256(abi.encodePacked(withdrawals[i].asset_code, withdrawals[i].issuer));
            bool found = false;
            for (uint j = 0; j < uniqueCount; j++) {
                if (uniqueAssetIds[j] == asset_id) {
                    uniqueAmounts[j] += withdrawals[i].amount;
                    found = true;
                    break;
                }
            }
            if (!found) {
                uniqueAssetIds[uniqueCount] = asset_id;
                uniqueAmounts[uniqueCount] = withdrawals[i].amount;
                uniqueCount++;
            }
        }

        bytes32[] memory resultIds = new bytes32[](uniqueCount);
        int128[] memory resultAmounts = new int128[](uniqueCount);
        for (uint i = 0; i < uniqueCount; i++) {
            resultIds[i] = uniqueAssetIds[i];
            resultAmounts[i] = uniqueAmounts[i];
        }
        return (resultIds, resultAmounts);
    }

    function check_solvency(bytes32 subnet_id, bytes32[] memory treasury_asset_ids, int128[] memory treasury_balances) public view returns (bool) {
        (bytes32[] memory outflow_ids, int128[] memory outflow_amounts) = compute_net_outflow(subnet_id);
        for (uint i = 0; i < outflow_ids.length; i++) {
            int128 treasury_balance = 0;
            for (uint j = 0; j < treasury_asset_ids.length; j++) {
                if (treasury_asset_ids[j] == outflow_ids[i]) {
                    treasury_balance = treasury_balances[j];
                    break;
                }
            }
            if (treasury_balance < outflow_amounts[i]) return false;
        }
        return true;
    }

    function check_constructibility(bytes32 subnet_id) public view returns (bool) {
        Withdrawal[] storage withdrawals = withdrawalQueues[subnet_id];
        for (uint i = 0; i < withdrawals.length; i++) {
            if (withdrawals[i].destination == bytes32(0)) return false;
            if (withdrawals[i].amount <= 0) return false;
            bytes memory code = bytes(withdrawals[i].asset_code);
            if (code.length == 0 || code.length > 12) return false;
        }
        return true;
    }

    function check_authorization(bytes32 subnet_id, bytes32[] memory treasury_signers, uint32 treasury_threshold) public view returns (bool) {
        SubnetConfig storage subnet = subnetConfigs[subnet_id];
        uint32 matchingCount = 0;
        for (uint i = 0; i < subnet.auditors.length; i++) {
            for (uint j = 0; j < treasury_signers.length; j++) {
                if (subnet.auditors[i] == treasury_signers[j]) {
                    matchingCount++;
                    break;
                }
            }
        }
        return (matchingCount >= treasury_threshold && matchingCount >= subnet.threshold);
    }

    /**
     * @notice Full PoM validation
     */
    function pom_validate(bytes32 subnet_id, bytes32[] memory treasury_asset_ids, int128[] memory treasury_balances, bytes32[] memory treasury_signers, uint32 treasury_threshold) public view returns (PomResult) {
        if (!check_constructibility(subnet_id)) {
            return PomResult.NonConstructible;
        }
        if (!check_solvency(subnet_id, treasury_asset_ids, treasury_balances)) {
            return PomResult.Insolvent;
        }
        if (!check_authorization(subnet_id, treasury_signers, treasury_threshold)) {
            return PomResult.Unauthorized;
        }
        return PomResult.Ok;
    }

    // ===== PHASE 5: COMMITMENT =====

    function commit_state(bytes32 subnet_id, uint64 block_number, bytes32 state_root, bytes32[] memory auditor_signers, bytes32[] memory treasury_asset_ids, int128[] memory treasury_balances, bytes32[] memory treasury_signers, uint32 treasury_threshold) public {
        executionAdmin.requireAuth();
        _validate_subnet(subnet_id);

        require(state_root != bytes32(0), "State root cannot be zero");
        require(block_number > lastCommittedBlock[subnet_id], "Block number must be monotonic");

        // Verify auditor signatures meet subnet threshold
        SubnetConfig storage subnet = subnetConfigs[subnet_id];
        uint32 validSignerCount = 0;
        for (uint i = 0; i < auditor_signers.length; i++) {
            for (uint j = 0; j < subnet.auditors.length; j++) {
                if (auditor_signers[i] == subnet.auditors[j]) {
                    validSignerCount++;
                    break;
                }
            }
        }
        require(validSignerCount >= subnet.threshold, "Insufficient auditor signatures");

        // Verify authorization
        require(check_authorization(subnet_id, treasury_signers, treasury_threshold), "Auditors not authorized for treasury");

        // Run PoM validation
        PomResult pomResult = pom_validate(subnet_id, treasury_asset_ids, treasury_balances, treasury_signers, treasury_threshold);
        require(pomResult == PomResult.Ok, "PoM validation failed");

        // Store commit
        commits[subnet_id][block_number] = state_root;
        lastCommittedBlock[subnet_id] = block_number;
        lastCommittedBlock[subnet_id].extendTtl(100, 5000);
    }

    function get_commit(bytes32 subnet_id, uint64 block_number) public view returns (bytes32) {
        return commits[subnet_id][block_number];
    }

    function get_last_committed_block(bytes32 subnet_id) public view returns (uint64) {
        return lastCommittedBlock[subnet_id];
    }
}
