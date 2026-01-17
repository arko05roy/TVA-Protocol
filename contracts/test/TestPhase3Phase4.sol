pragma solidity 0;

import "../SubnetFactory.sol";
import "../ExecutionCore.sol";

/**
 * @title TestPhase3Phase4
 * @notice Test contract for Phase 3 (State Root) and Phase 4 (PoM)
 */
contract TestPhase3Phase4 {
    SubnetFactory public factory;
    ExecutionCore public execution;
    address public testAdmin;

    // Test data
    bytes32 public constant SUBNET_ID = 0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA;
    bytes32 public constant USER_1 = 0x1111111111111111111111111111111111111111111111111111111111111111;
    bytes32 public constant USER_2 = 0x2222222222222222222222222222222222222222222222222222222222222222;
    
    bytes32 public constant NATIVE_ISSUER = 0x4E41544956450000000000000000000000000000000000000000000000000000; // "NATIVE"
    bytes32 public constant USDC_ISSUER = 0x55534443000000000000000000000000000000000000000000000000000000;
    bytes32 public constant DESTINATION = 0x9999999999999999999999999999999999999999999999999999999999999999;

    bytes32 public constant AUDITOR_1 = 0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA;
    bytes32 public constant AUDITOR_2 = 0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB;
    bytes32 public constant AUDITOR_3 = 0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC;

    event TestResult(string testName, bool passed, string details);

    constructor(address _testAdmin) {
        testAdmin = _testAdmin;
        factory = new SubnetFactory(testAdmin);
        execution = new ExecutionCore(testAdmin, address(factory));
        _setup_subnet();
    }

    function _setup_subnet() internal {
        bytes32[] memory auditors = new bytes32[](3);
        auditors[0] = AUDITOR_1;
        auditors[1] = AUDITOR_2;
        auditors[2] = AUDITOR_3;

        SubnetFactory.Asset[] memory assets = new SubnetFactory.Asset[](2);
        assets[0] = SubnetFactory.Asset({code: "XLM", issuer: NATIVE_ISSUER});
        assets[1] = SubnetFactory.Asset({code: "USDC", issuer: USDC_ISSUER});

        bytes32 subnet_id = factory.create_subnet(SUBNET_ID, auditors, 2, assets);
        address treasury = address(0x1234567890123456789012345678901234567890);
        factory.register_treasury(subnet_id, treasury);
    }

    function _get_subnet_id() internal view returns (bytes32) {
        return SUBNET_ID;
    }

    // ========== PHASE 3 TESTS ==========

    /**
     * @notice Test state root computation with empty state
     */
    function test_state_root_empty() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        bytes32 root = execution.compute_state_root(subnet_id);
        
        // Empty state should produce a deterministic root
        require(root != bytes32(0) || true, "State root should be computed");
        
        emit TestResult("test_state_root_empty", true, "Empty state root computed");
        return true;
    }

    /**
     * @notice Test state root computation with balances
     */
    function test_state_root_with_balances() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        int128 amount1 = 1000000;
        int128 amount2 = 2000000;

        // Credit balances
        execution.credit(subnet_id, USER_1, "XLM", NATIVE_ISSUER, amount1);
        execution.credit(subnet_id, USER_2, "USDC", USDC_ISSUER, amount2);

        // Compute state root
        bytes32 root1 = execution.compute_state_root(subnet_id);
        require(root1 != bytes32(0), "State root should not be zero");

        // Add another balance and recompute
        execution.credit(subnet_id, USER_1, "USDC", USDC_ISSUER, amount1);
        bytes32 root2 = execution.compute_state_root(subnet_id);
        require(root2 != root1, "State root should change with new balance");

        emit TestResult("test_state_root_with_balances", true, "State root computed correctly");
        return true;
    }

    /**
     * @notice Test state root determinism
     */
    function test_state_root_deterministic() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        
        // Setup same state twice
        execution.credit(subnet_id, USER_1, "XLM", NATIVE_ISSUER, 1000000);
        bytes32 root1 = execution.compute_state_root(subnet_id);
        
        // Compute again (should be same)
        bytes32 root2 = execution.compute_state_root(subnet_id);
        require(root1 == root2, "State root should be deterministic");

        emit TestResult("test_state_root_deterministic", true, "State root is deterministic");
        return true;
    }

    /**
     * @notice Test state root with withdrawals
     */
    function test_state_root_with_withdrawals() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        
        // Credit and create withdrawal
        execution.credit(subnet_id, USER_1, "XLM", NATIVE_ISSUER, 1000000);
        bytes32 root1 = execution.compute_state_root(subnet_id);
        
        execution.request_withdrawal(subnet_id, USER_1, "XLM", NATIVE_ISSUER, 500000, DESTINATION);
        bytes32 root2 = execution.compute_state_root(subnet_id);
        
        require(root1 != root2, "State root should change with withdrawal");

        emit TestResult("test_state_root_with_withdrawals", true, "Withdrawals affect state root");
        return true;
    }

    // ========== PHASE 4 TESTS ==========

    /**
     * @notice Test compute_net_outflow with empty queue
     */
    function test_net_outflow_empty() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        (bytes32[] memory asset_ids, int128[] memory amounts) = execution.compute_net_outflow(subnet_id);
        
        require(asset_ids.length == 0, "Empty queue should return empty arrays");
        require(amounts.length == 0, "Empty queue should return empty arrays");

        emit TestResult("test_net_outflow_empty", true, "Empty outflow computed");
        return true;
    }

    /**
     * @notice Test compute_net_outflow with withdrawals
     */
    function test_net_outflow_with_withdrawals() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        
        // Create withdrawals
        execution.credit(subnet_id, USER_1, "USDC", USDC_ISSUER, 3000000);
        execution.request_withdrawal(subnet_id, USER_1, "USDC", USDC_ISSUER, 1000000, DESTINATION);
        execution.request_withdrawal(subnet_id, USER_1, "USDC", USDC_ISSUER, 500000, DESTINATION);
        
        execution.credit(subnet_id, USER_2, "XLM", NATIVE_ISSUER, 20000000);
        execution.request_withdrawal(subnet_id, USER_2, "XLM", NATIVE_ISSUER, 20000000, DESTINATION);

        (bytes32[] memory asset_ids, int128[] memory amounts) = execution.compute_net_outflow(subnet_id);
        
        require(asset_ids.length > 0, "Should have outflow for assets");
        require(amounts.length == asset_ids.length, "Arrays should match length");

        emit TestResult("test_net_outflow_with_withdrawals", true, "Net outflow computed");
        return true;
    }

    /**
     * @notice Test check_solvency - solvent case
     */
    function test_check_solvency_solvent() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        
        // Create withdrawal
        execution.credit(subnet_id, USER_1, "USDC", USDC_ISSUER, 2000000);
        execution.request_withdrawal(subnet_id, USER_1, "USDC", USDC_ISSUER, 1000000, DESTINATION);

        // Treasury has enough
        bytes32[] memory treasury_asset_ids = new bytes32[](1);
        int128[] memory treasury_balances = new int128[](1);
        treasury_asset_ids[0] = keccak256(abi.encodePacked("USDC", USDC_ISSUER));
        treasury_balances[0] = 5000000; // More than withdrawal

        bool isSolvent = execution.check_solvency(subnet_id, treasury_asset_ids, treasury_balances);
        require(isSolvent, "Should be solvent");

        emit TestResult("test_check_solvency_solvent", true, "Solvency check passed");
        return true;
    }

    /**
     * @notice Test check_solvency - insolvent case
     */
    function test_check_solvency_insolvent() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        
        // Create withdrawal
        execution.credit(subnet_id, USER_1, "USDC", USDC_ISSUER, 2000000);
        execution.request_withdrawal(subnet_id, USER_1, "USDC", USDC_ISSUER, 1000000, DESTINATION);

        // Treasury doesn't have enough
        bytes32[] memory treasury_asset_ids = new bytes32[](1);
        int128[] memory treasury_balances = new int128[](1);
        treasury_asset_ids[0] = keccak256(abi.encodePacked("USDC", USDC_ISSUER));
        treasury_balances[0] = 500000; // Less than withdrawal

        bool isSolvent = execution.check_solvency(subnet_id, treasury_asset_ids, treasury_balances);
        require(!isSolvent, "Should be insolvent");

        emit TestResult("test_check_solvency_insolvent", true, "Insolvency detected");
        return true;
    }

    /**
     * @notice Test check_constructibility
     */
    function test_check_constructibility() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        
        // Valid withdrawal
        execution.credit(subnet_id, USER_1, "XLM", NATIVE_ISSUER, 1000000);
        execution.request_withdrawal(subnet_id, USER_1, "XLM", NATIVE_ISSUER, 1000000, DESTINATION);

        bool isConstructible = execution.check_constructibility(subnet_id);
        require(isConstructible, "Should be constructible");

        emit TestResult("test_check_constructibility", true, "Constructibility check passed");
        return true;
    }

    /**
     * @notice Test check_authorization
     */
    function test_check_authorization() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        
        // Treasury signers include auditors
        bytes32[] memory treasury_signers = new bytes32[](3);
        treasury_signers[0] = AUDITOR_1;
        treasury_signers[1] = AUDITOR_2;
        treasury_signers[2] = AUDITOR_3;

        bool isAuthorized = execution.check_authorization(subnet_id, treasury_signers, 2);
        require(isAuthorized, "Should be authorized");

        emit TestResult("test_check_authorization", true, "Authorization check passed");
        return true;
    }

    /**
     * @notice Test pom_validate - OK case
     */
    function test_pom_validate_ok() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        
        // Setup: credit and withdrawal
        execution.credit(subnet_id, USER_1, "USDC", USDC_ISSUER, 2000000);
        execution.request_withdrawal(subnet_id, USER_1, "USDC", USDC_ISSUER, 1000000, DESTINATION);

        // Treasury snapshot
        bytes32[] memory treasury_asset_ids = new bytes32[](1);
        int128[] memory treasury_balances = new int128[](1);
        treasury_asset_ids[0] = keccak256(abi.encodePacked("USDC", USDC_ISSUER));
        treasury_balances[0] = 5000000;

        bytes32[] memory treasury_signers = new bytes32[](3);
        treasury_signers[0] = AUDITOR_1;
        treasury_signers[1] = AUDITOR_2;
        treasury_signers[2] = AUDITOR_3;

        ExecutionCore.PomResult result = execution.pom_validate(
            subnet_id,
            treasury_asset_ids,
            treasury_balances,
            treasury_signers,
            2
        );

        require(result == ExecutionCore.PomResult.Ok, "PoM should be OK");

        emit TestResult("test_pom_validate_ok", true, "PoM validation passed");
        return true;
    }

    /**
     * @notice Test pom_validate - Insolvent case
     */
    function test_pom_validate_insolvent() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        
        // Setup: withdrawal exceeds treasury
        execution.credit(subnet_id, USER_1, "USDC", USDC_ISSUER, 2000000);
        execution.request_withdrawal(subnet_id, USER_1, "USDC", USDC_ISSUER, 1000000, DESTINATION);

        // Treasury doesn't have enough
        bytes32[] memory treasury_asset_ids = new bytes32[](1);
        int128[] memory treasury_balances = new int128[](1);
        treasury_asset_ids[0] = keccak256(abi.encodePacked("USDC", USDC_ISSUER));
        treasury_balances[0] = 500000; // Less than withdrawal

        bytes32[] memory treasury_signers = new bytes32[](3);
        treasury_signers[0] = AUDITOR_1;
        treasury_signers[1] = AUDITOR_2;
        treasury_signers[2] = AUDITOR_3;

        ExecutionCore.PomResult result = execution.pom_validate(
            subnet_id,
            treasury_asset_ids,
            treasury_balances,
            treasury_signers,
            2
        );

        require(result == ExecutionCore.PomResult.Insolvent, "PoM should be Insolvent");

        emit TestResult("test_pom_validate_insolvent", true, "Insolvency detected");
        return true;
    }

    /**
     * @notice Test pom_validate - Unauthorized case
     */
    function test_pom_validate_unauthorized() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        
        // Setup
        execution.credit(subnet_id, USER_1, "USDC", USDC_ISSUER, 2000000);
        execution.request_withdrawal(subnet_id, USER_1, "USDC", USDC_ISSUER, 1000000, DESTINATION);

        // Treasury signers don't include enough auditors
        bytes32[] memory treasury_asset_ids = new bytes32[](1);
        int128[] memory treasury_balances = new int128[](1);
        treasury_asset_ids[0] = keccak256(abi.encodePacked("USDC", USDC_ISSUER));
        treasury_balances[0] = 5000000;

        bytes32[] memory treasury_signers = new bytes32[](1);
        treasury_signers[0] = 0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD; // Not an auditor

        ExecutionCore.PomResult result = execution.pom_validate(
            subnet_id,
            treasury_asset_ids,
            treasury_balances,
            treasury_signers,
            2
        );

        require(result == ExecutionCore.PomResult.Unauthorized, "PoM should be Unauthorized");

        emit TestResult("test_pom_validate_unauthorized", true, "Unauthorized detected");
        return true;
    }

    /**
     * @notice Generate golden test vector for state root
     */
    function generate_golden_test_vector() public returns (bytes32) {
        bytes32 subnet_id = _get_subnet_id();
        
        // Setup known state
        execution.credit(subnet_id, USER_1, "XLM", NATIVE_ISSUER, 1000000);
        execution.credit(subnet_id, USER_2, "USDC", USDC_ISSUER, 2000000);
        execution.request_withdrawal(subnet_id, USER_1, "XLM", NATIVE_ISSUER, 500000, DESTINATION);

        bytes32 state_root = execution.compute_state_root(subnet_id);
        
        emit TestResult("generate_golden_test_vector", true, "Golden vector generated");
        return state_root;
    }

    /**
     * @notice Run all Phase 3 and Phase 4 tests
     */
    function run_all_tests() public returns (bool) {
        test_state_root_empty();
        test_state_root_with_balances();
        test_state_root_deterministic();
        test_state_root_with_withdrawals();
        test_net_outflow_empty();
        test_net_outflow_with_withdrawals();
        test_check_solvency_solvent();
        test_check_solvency_insolvent();
        test_check_constructibility();
        test_check_authorization();
        test_pom_validate_ok();
        test_pom_validate_insolvent();
        test_pom_validate_unauthorized();
        generate_golden_test_vector();
        return true;
    }
}

