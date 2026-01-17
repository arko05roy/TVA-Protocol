pragma solidity 0;

import "../SubnetFactory.sol";
import "../ExecutionCore.sol";

/**
 * @title TestExecutionCore
 * @notice Test contract for ExecutionCore
 */
contract TestExecutionCore {
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

    event TestResult(string testName, bool passed);

    constructor(address _testAdmin) {
        testAdmin = _testAdmin;
        factory = new SubnetFactory(testAdmin);
        execution = new ExecutionCore(testAdmin, address(factory));

        // Setup: Create a subnet and register treasury
        _setup_subnet();
    }

    /**
     * @notice Setup a test subnet
     */
    function _setup_subnet() internal {
        bytes32[] memory auditors = new bytes32[](3);
        auditors[0] = 0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA;
        auditors[1] = 0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB;
        auditors[2] = 0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC;

        SubnetFactory.Asset[] memory assets = new SubnetFactory.Asset[](2);
        assets[0] = SubnetFactory.Asset({code: "XLM", issuer: NATIVE_ISSUER});
        assets[1] = SubnetFactory.Asset({code: "USDC", issuer: USDC_ISSUER});

        bytes32 subnet_id = factory.create_subnet(SUBNET_ID, auditors, 2, assets);
        // Note: subnet_id may differ from SUBNET_ID due to keccak256 generation

        address treasury = address(0x1234567890123456789012345678901234567890);
        factory.register_treasury(subnet_id, treasury);
    }

    /**
     * @notice Test credit function
     */
    function test_credit() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        int128 amount = 1000000; // 1 XLM in stroops

        // Credit to USER_1
        execution.credit(subnet_id, USER_1, "XLM", NATIVE_ISSUER, amount);

        // Verify balance
        int128 balance = execution.get_balance(subnet_id, USER_1, "XLM", NATIVE_ISSUER);
        require(balance == amount, "Balance should match credited amount");

        emit TestResult("test_credit", true);
        return true;
    }

    /**
     * @notice Test debit function
     */
    function test_debit() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        int128 creditAmount = 2000000;
        int128 debitAmount = 1000000;

        // First credit
        execution.credit(subnet_id, USER_1, "XLM", NATIVE_ISSUER, creditAmount);

        // Then debit
        execution.debit(subnet_id, USER_1, "XLM", NATIVE_ISSUER, debitAmount);

        // Verify balance
        int128 balance = execution.get_balance(subnet_id, USER_1, "XLM", NATIVE_ISSUER);
        require(balance == creditAmount - debitAmount, "Balance should be reduced");

        emit TestResult("test_debit", true);
        return true;
    }

    /**
     * @notice Test debit with insufficient balance (should fail)
     */
    function test_debit_insufficient_balance() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        int128 creditAmount = 1000000;
        int128 debitAmount = 2000000; // More than credited

        // Credit some amount
        execution.credit(subnet_id, USER_1, "USDC", USDC_ISSUER, creditAmount);

        // Try to debit more (should fail)
        bool reverted = false;
        try execution.debit(subnet_id, USER_1, "USDC", USDC_ISSUER, debitAmount) {
            // Should not reach here
        } catch {
            reverted = true;
        }

        require(reverted, "Should revert with insufficient balance");
        emit TestResult("test_debit_insufficient_balance", true);
        return true;
    }

    /**
     * @notice Test transfer function
     */
    function test_transfer() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        int128 amount = 500000;

        // Credit to USER_1
        execution.credit(subnet_id, USER_1, "XLM", NATIVE_ISSUER, amount * 2);

        // Transfer from USER_1 to USER_2
        execution.transfer(subnet_id, USER_1, USER_2, "XLM", NATIVE_ISSUER, amount);

        // Verify balances
        int128 balance1 = execution.get_balance(subnet_id, USER_1, "XLM", NATIVE_ISSUER);
        int128 balance2 = execution.get_balance(subnet_id, USER_2, "XLM", NATIVE_ISSUER);

        require(balance1 == amount, "USER_1 balance should be reduced");
        require(balance2 == amount, "USER_2 balance should be increased");

        emit TestResult("test_transfer", true);
        return true;
    }

    /**
     * @notice Test request_withdrawal
     */
    function test_request_withdrawal() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        int128 amount = 1000000;

        // Credit to USER_1
        execution.credit(subnet_id, USER_1, "XLM", NATIVE_ISSUER, amount);

        // Request withdrawal
        bytes32 withdrawal_id = execution.request_withdrawal(
            subnet_id,
            USER_1,
            "XLM",
            NATIVE_ISSUER,
            amount,
            DESTINATION
        );

        // Verify balance is debited
        int128 balance = execution.get_balance(subnet_id, USER_1, "XLM", NATIVE_ISSUER);
        require(balance == 0, "Balance should be zero after withdrawal");

        // Verify withdrawal is in queue
        ExecutionCore.Withdrawal[] memory queue = execution.get_withdrawal_queue(subnet_id);
        require(queue.length > 0, "Withdrawal queue should not be empty");
        require(queue[queue.length - 1].withdrawal_id == withdrawal_id, "Withdrawal ID should match");

        // Verify nonce incremented
        uint64 nonce = execution.get_nonce(subnet_id);
        require(nonce > 0, "Nonce should be incremented");

        emit TestResult("test_request_withdrawal", true);
        return true;
    }

    /**
     * @notice Test withdrawal queue format
     */
    function test_withdrawal_queue_format() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        int128 amount1 = 1000000;
        int128 amount2 = 2000000;

        // Create two withdrawals
        execution.credit(subnet_id, USER_1, "XLM", NATIVE_ISSUER, amount1 + amount2);
        
        bytes32 withdrawal_id1 = execution.request_withdrawal(
            subnet_id, USER_1, "XLM", NATIVE_ISSUER, amount1, DESTINATION
        );

        bytes32 withdrawal_id2 = execution.request_withdrawal(
            subnet_id, USER_1, "XLM", NATIVE_ISSUER, amount2, DESTINATION
        );

        // Get queue
        ExecutionCore.Withdrawal[] memory queue = execution.get_withdrawal_queue(subnet_id);
        require(queue.length == 2, "Queue should have 2 withdrawals");

        // Verify first withdrawal
        require(queue[0].withdrawal_id == withdrawal_id1, "First withdrawal ID should match");
        require(queue[0].user_id == USER_1, "User ID should match");
        require(queue[0].amount == amount1, "Amount should match");

        // Verify second withdrawal
        require(queue[1].withdrawal_id == withdrawal_id2, "Second withdrawal ID should match");
        require(queue[1].amount == amount2, "Amount should match");

        emit TestResult("test_withdrawal_queue_format", true);
        return true;
    }

    /**
     * @notice Test credit with negative amount (should fail)
     */
    function test_credit_negative_amount() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        int128 negativeAmount = -1000000;

        bool reverted = false;
        try execution.credit(subnet_id, USER_1, "XLM", NATIVE_ISSUER, negativeAmount) {
            // Should not reach here
        } catch {
            reverted = true;
        }

        require(reverted, "Should revert with negative amount");
        emit TestResult("test_credit_negative_amount", true);
        return true;
    }

    /**
     * @notice Test transfer to self (should fail)
     */
    function test_transfer_to_self() public returns (bool) {
        bytes32 subnet_id = _get_subnet_id();
        int128 amount = 1000000;

        execution.credit(subnet_id, USER_1, "XLM", NATIVE_ISSUER, amount);

        bool reverted = false;
        try execution.transfer(subnet_id, USER_1, USER_1, "XLM", NATIVE_ISSUER, amount) {
            // Should not reach here
        } catch {
            reverted = true;
        }

        require(reverted, "Should revert when transferring to self");
        emit TestResult("test_transfer_to_self", true);
        return true;
    }

    /**
     * @notice Helper to get subnet ID (creates one if needed)
     */
    function _get_subnet_id() internal returns (bytes32) {
        // Create a subnet if none exists
        bytes32[] memory auditors = new bytes32[](3);
        auditors[0] = 0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA;
        auditors[1] = 0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB;
        auditors[2] = 0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC;

        SubnetFactory.Asset[] memory assets = new SubnetFactory.Asset[](2);
        assets[0] = SubnetFactory.Asset({code: "XLM", issuer: NATIVE_ISSUER});
        assets[1] = SubnetFactory.Asset({code: "USDC", issuer: USDC_ISSUER});

        bytes32 subnet_id = factory.create_subnet(SUBNET_ID, auditors, 2, assets);
        
        // Register treasury if not already registered
        (, , , , address treasury, bool active) = factory.get_subnet(subnet_id);
        if (!active) {
            address treasuryAddr = address(0x1234567890123456789012345678901234567890);
            factory.register_treasury(subnet_id, treasuryAddr);
        }

        return subnet_id;
    }

    /**
     * @notice Run all tests
     */
    function run_all_tests() public returns (bool) {
        test_credit();
        test_debit();
        test_debit_insufficient_balance();
        test_transfer();
        test_request_withdrawal();
        test_withdrawal_queue_format();
        test_credit_negative_amount();
        test_transfer_to_self();
        return true;
    }
}

