pragma solidity 0;

import "../ExecutionCore.sol";
import "../SubnetFactory.sol";

/**
 * @title TestPhase5
 * @notice Tests for Phase 5: Commitment Contract
 * @dev Tests commit_state() function with all validation rules
 */
contract TestPhase5 {
    ExecutionCore public executionCore;
    SubnetFactory public subnetFactory;
    
    address public testAdmin;
    bytes32 public testSubnetId;
    bytes32[] public testAuditors;
    uint32 public testThreshold;
    
    // Test results
    event TestResult(string testName, bool passed, string message);
    
    /**
     * @notice Constructor - sets up test environment
     * @param _testAdmin Admin address for testing
     */
    constructor(address _testAdmin) {
        testAdmin = _testAdmin;
        
        // Deploy SubnetFactory
        subnetFactory = new SubnetFactory(_testAdmin);
        
        // Deploy ExecutionCore
        executionCore = new ExecutionCore(_testAdmin, address(subnetFactory));
        
        // Setup test subnet
        _setupTestSubnet();
    }
    
    /**
     * @notice Sets up a test subnet with auditors
     */
    function _setupTestSubnet() internal {
        // Create test auditors (3 auditors, threshold = 2)
        testAuditors = new bytes32[](3);
        testAuditors[0] = keccak256("auditor1");
        testAuditors[1] = keccak256("auditor2");
        testAuditors[2] = keccak256("auditor3");
        testThreshold = 2;
        
        // Create asset
        SubnetFactory.Asset[] memory assets = new SubnetFactory.Asset[](1);
        assets[0] = SubnetFactory.Asset({
            code: "USDC",
            issuer: keccak256("issuer")
        });
        
        // Create subnet
        subnetFactory.create_subnet(
            keccak256("admin"),
            testAuditors,
            testThreshold,
            assets
        );
        
        // Get subnet ID (it's keccak256 of creation params)
        testSubnetId = keccak256(abi.encodePacked(
            keccak256("admin"),
            testAuditors,
            testThreshold,
            assets
        ));
        
        // Register treasury (mock address)
        subnetFactory.register_treasury(testSubnetId, address(0x1234));
    }
    
    /**
     * @notice Test: Successful commit with valid PoM
     */
    function test_commit_state_success() public returns (bool) {
        // Setup: Credit some balances and create withdrawals
        bytes32 user1 = keccak256("user1");
        executionCore.credit(testSubnetId, user1, "USDC", keccak256("issuer"), 1000000);
        
        bytes32 destination = keccak256("destination");
        executionCore.request_withdrawal(
            testSubnetId,
            user1,
            "USDC",
            keccak256("issuer"),
            500000,
            destination
        );
        
        // Compute state root
        bytes32 stateRoot = executionCore.compute_state_root(testSubnetId);
        
        // Prepare treasury snapshot (sufficient balance)
        bytes32[] memory treasuryAssetIds = new bytes32[](1);
        treasuryAssetIds[0] = keccak256(abi.encodePacked("USDC", keccak256("issuer")));
        
        int128[] memory treasuryBalances = new int128[](1);
        treasuryBalances[0] = 2000000; // More than withdrawal amount
        
        bytes32[] memory treasurySigners = new bytes32[](3);
        treasurySigners[0] = testAuditors[0];
        treasurySigners[1] = testAuditors[1];
        treasurySigners[2] = testAuditors[2];
        uint32 treasuryThreshold = 2;
        
        // Auditor signers (2 out of 3, meets threshold)
        bytes32[] memory auditorSigners = new bytes32[](2);
        auditorSigners[0] = testAuditors[0];
        auditorSigners[1] = testAuditors[1];
        
        // Commit state (block 1)
        executionCore.commit_state(
            testSubnetId,
            1,
            stateRoot,
            auditorSigners,
            treasuryAssetIds,
            treasuryBalances,
            treasurySigners,
            treasuryThreshold
        );
        
        // Verify commit was stored
        bytes32 storedRoot = executionCore.get_commit(testSubnetId, 1);
        require(storedRoot == stateRoot, "State root not stored correctly");
        
        // Verify last committed block
        uint64 lastBlock = executionCore.get_last_committed_block(testSubnetId);
        require(lastBlock == 1, "Last committed block not updated");
        
        emit TestResult("test_commit_state_success", true, "Commit successful");
        return true;
    }
    
    /**
     * @notice Test: Block number monotonicity enforcement
     */
    function test_commit_state_monotonicity() public returns (bool) {
        // Setup state
        bytes32 user1 = keccak256("user1");
        executionCore.credit(testSubnetId, user1, "USDC", keccak256("issuer"), 1000000);
        
        bytes32 stateRoot = executionCore.compute_state_root(testSubnetId);
        
        bytes32[] memory treasuryAssetIds = new bytes32[](1);
        treasuryAssetIds[0] = keccak256(abi.encodePacked("USDC", keccak256("issuer")));
        int128[] memory treasuryBalances = new int128[](1);
        treasuryBalances[0] = 2000000;
        
        bytes32[] memory treasurySigners = new bytes32[](3);
        treasurySigners[0] = testAuditors[0];
        treasurySigners[1] = testAuditors[1];
        treasurySigners[2] = testAuditors[2];
        
        bytes32[] memory auditorSigners = new bytes32[](2);
        auditorSigners[0] = testAuditors[0];
        auditorSigners[1] = testAuditors[1];
        
        // Commit block 1
        executionCore.commit_state(
            testSubnetId,
            1,
            stateRoot,
            auditorSigners,
            treasuryAssetIds,
            treasuryBalances,
            treasurySigners,
            2
        );
        
        // Try to commit block 1 again (should fail)
        bool reverted = false;
        try executionCore.commit_state(
            testSubnetId,
            1, // Same block number
            stateRoot,
            auditorSigners,
            treasuryAssetIds,
            treasuryBalances,
            treasurySigners,
            2
        ) {
            reverted = false;
        } catch {
            reverted = true;
        }
        
        require(reverted, "Should reject duplicate block number");
        
        // Try to commit block 0 (should fail - less than last block)
        reverted = false;
        try executionCore.commit_state(
            testSubnetId,
            0, // Less than last block (1)
            stateRoot,
            auditorSigners,
            treasuryAssetIds,
            treasuryBalances,
            treasurySigners,
            2
        ) {
            reverted = false;
        } catch {
            reverted = true;
        }
        
        require(reverted, "Should reject non-monotonic block number");
        
        // Commit block 2 (should succeed)
        executionCore.commit_state(
            testSubnetId,
            2,
            stateRoot,
            auditorSigners,
            treasuryAssetIds,
            treasuryBalances,
            treasurySigners,
            2
        );
        
        emit TestResult("test_commit_state_monotonicity", true, "Monotonicity enforced");
        return true;
    }
    
    /**
     * @notice Test: Insufficient auditor signatures
     */
    function test_commit_state_insufficient_signatures() public returns (bool) {
        bytes32 user1 = keccak256("user1");
        executionCore.credit(testSubnetId, user1, "USDC", keccak256("issuer"), 1000000);
        
        bytes32 stateRoot = executionCore.compute_state_root(testSubnetId);
        
        bytes32[] memory treasuryAssetIds = new bytes32[](1);
        treasuryAssetIds[0] = keccak256(abi.encodePacked("USDC", keccak256("issuer")));
        int128[] memory treasuryBalances = new int128[](1);
        treasuryBalances[0] = 2000000;
        
        bytes32[] memory treasurySigners = new bytes32[](3);
        treasurySigners[0] = testAuditors[0];
        treasurySigners[1] = testAuditors[1];
        treasurySigners[2] = testAuditors[2];
        
        // Only 1 auditor signer (threshold is 2)
        bytes32[] memory auditorSigners = new bytes32[](1);
        auditorSigners[0] = testAuditors[0];
        
        bool reverted = false;
        try executionCore.commit_state(
            testSubnetId,
            1,
            stateRoot,
            auditorSigners,
            treasuryAssetIds,
            treasuryBalances,
            treasurySigners,
            2
        ) {
            reverted = false;
        } catch {
            reverted = true;
        }
        
        require(reverted, "Should reject insufficient signatures");
        
        emit TestResult("test_commit_state_insufficient_signatures", true, "Insufficient signatures rejected");
        return true;
    }
    
    /**
     * @notice Test: PoM failure causes revert
     */
    function test_commit_state_pom_failure() public returns (bool) {
        bytes32 user1 = keccak256("user1");
        executionCore.credit(testSubnetId, user1, "USDC", keccak256("issuer"), 1000000);
        
        bytes32 destination = keccak256("destination");
        executionCore.request_withdrawal(
            testSubnetId,
            user1,
            "USDC",
            keccak256("issuer"),
            500000,
            destination
        );
        
        bytes32 stateRoot = executionCore.compute_state_root(testSubnetId);
        
        // Treasury has insufficient balance (less than withdrawal)
        bytes32[] memory treasuryAssetIds = new bytes32[](1);
        treasuryAssetIds[0] = keccak256(abi.encodePacked("USDC", keccak256("issuer")));
        int128[] memory treasuryBalances = new int128[](1);
        treasuryBalances[0] = 100000; // Less than withdrawal (500000)
        
        bytes32[] memory treasurySigners = new bytes32[](3);
        treasurySigners[0] = testAuditors[0];
        treasurySigners[1] = testAuditors[1];
        treasurySigners[2] = testAuditors[2];
        
        bytes32[] memory auditorSigners = new bytes32[](2);
        auditorSigners[0] = testAuditors[0];
        auditorSigners[1] = testAuditors[1];
        
        // Should revert due to PoM failure (insolvent)
        bool reverted = false;
        try executionCore.commit_state(
            testSubnetId,
            1,
            stateRoot,
            auditorSigners,
            treasuryAssetIds,
            treasuryBalances,
            treasurySigners,
            2
        ) {
            reverted = false;
        } catch {
            reverted = true;
        }
        
        require(reverted, "Should reject commit when PoM fails");
        
        emit TestResult("test_commit_state_pom_failure", true, "PoM failure causes revert");
        return true;
    }
    
    /**
     * @notice Test: Invalid auditor signer (not in auditor list)
     */
    function test_commit_state_invalid_auditor() public returns (bool) {
        bytes32 user1 = keccak256("user1");
        executionCore.credit(testSubnetId, user1, "USDC", keccak256("issuer"), 1000000);
        
        bytes32 stateRoot = executionCore.compute_state_root(testSubnetId);
        
        bytes32[] memory treasuryAssetIds = new bytes32[](1);
        treasuryAssetIds[0] = keccak256(abi.encodePacked("USDC", keccak256("issuer")));
        int128[] memory treasuryBalances = new int128[](1);
        treasuryBalances[0] = 2000000;
        
        bytes32[] memory treasurySigners = new bytes32[](3);
        treasurySigners[0] = testAuditors[0];
        treasurySigners[1] = testAuditors[1];
        treasurySigners[2] = testAuditors[2];
        
        // Invalid auditor (not in subnet's auditor list)
        bytes32[] memory auditorSigners = new bytes32[](2);
        auditorSigners[0] = testAuditors[0];
        auditorSigners[1] = keccak256("invalid_auditor");
        
        bool reverted = false;
        try executionCore.commit_state(
            testSubnetId,
            1,
            stateRoot,
            auditorSigners,
            treasuryAssetIds,
            treasuryBalances,
            treasurySigners,
            2
        ) {
            reverted = false;
        } catch {
            reverted = true;
        }
        
        require(reverted, "Should reject invalid auditor signer");
        
        emit TestResult("test_commit_state_invalid_auditor", true, "Invalid auditor rejected");
        return true;
    }
    
    /**
     * @notice Test: Zero state root rejection
     */
    function test_commit_state_zero_root() public returns (bool) {
        bytes32[] memory treasuryAssetIds = new bytes32[](1);
        treasuryAssetIds[0] = keccak256(abi.encodePacked("USDC", keccak256("issuer")));
        int128[] memory treasuryBalances = new int128[](1);
        treasuryBalances[0] = 2000000;
        
        bytes32[] memory treasurySigners = new bytes32[](3);
        treasurySigners[0] = testAuditors[0];
        treasurySigners[1] = testAuditors[1];
        treasurySigners[2] = testAuditors[2];
        
        bytes32[] memory auditorSigners = new bytes32[](2);
        auditorSigners[0] = testAuditors[0];
        auditorSigners[1] = testAuditors[1];
        
        // Try to commit zero state root
        bool reverted = false;
        try executionCore.commit_state(
            testSubnetId,
            1,
            bytes32(0), // Zero state root
            auditorSigners,
            treasuryAssetIds,
            treasuryBalances,
            treasurySigners,
            2
        ) {
            reverted = false;
        } catch {
            reverted = true;
        }
        
        require(reverted, "Should reject zero state root");
        
        emit TestResult("test_commit_state_zero_root", true, "Zero state root rejected");
        return true;
    }
    
    /**
     * @notice Run all Phase 5 tests
     */
    function run_all_tests() public returns (bool) {
        bool allPassed = true;
        
        try this.test_commit_state_success() {
            // Test passed
        } catch {
            allPassed = false;
        }
        
        try this.test_commit_state_monotonicity() {
            // Test passed
        } catch {
            allPassed = false;
        }
        
        try this.test_commit_state_insufficient_signatures() {
            // Test passed
        } catch {
            allPassed = false;
        }
        
        try this.test_commit_state_pom_failure() {
            // Test passed
        } catch {
            allPassed = false;
        }
        
        try this.test_commit_state_invalid_auditor() {
            // Test passed
        } catch {
            allPassed = false;
        }
        
        try this.test_commit_state_zero_root() {
            // Test passed
        } catch {
            allPassed = false;
        }
        
        emit TestResult("run_all_tests", allPassed, allPassed ? "All tests passed" : "Some tests failed");
        return allPassed;
    }
}

