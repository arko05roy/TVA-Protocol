pragma solidity 0;

import "../SubnetFactory.sol";

/**
 * @title TestSubnetFactory
 * @notice Test contract for SubnetFactory
 */
contract TestSubnetFactory {
    SubnetFactory public factory;
    address public testAdmin;

    // Test data
    bytes32 public constant TEST_ADMIN = 0x0000000000000000000000000000000000000000000000000000000000000001;
    bytes32 public constant AUDITOR_1 = 0x1111111111111111111111111111111111111111111111111111111111111111;
    bytes32 public constant AUDITOR_2 = 0x2222222222222222222222222222222222222222222222222222222222222222;
    bytes32 public constant AUDITOR_3 = 0x3333333333333333331111111111111111111111111111111111111111111111;
    bytes32 public constant AUDITOR_4 = 0x4444444444444444444444444444444444444444444444444444444444444444;
    
    bytes32 public constant NATIVE_ISSUER = 0x4E41544956450000000000000000000000000000000000000000000000000000; // "NATIVE"
    bytes32 public constant USDC_ISSUER = 0x55534443000000000000000000000000000000000000000000000000000000; // Placeholder

    event TestResult(string testName, bool passed);

    constructor(address _testAdmin) {
        testAdmin = _testAdmin;
        factory = new SubnetFactory(testAdmin);
    }

    /**
     * @notice Test creating a subnet with valid parameters
     */
    function test_create_subnet_valid() public returns (bool) {
        bytes32[] memory auditors = new bytes32[](3);
        auditors[0] = AUDITOR_1;
        auditors[1] = AUDITOR_2;
        auditors[2] = AUDITOR_3;

        SubnetFactory.Asset[] memory assets = new SubnetFactory.Asset[](2);
        assets[0] = SubnetFactory.Asset({code: "XLM", issuer: NATIVE_ISSUER});
        assets[1] = SubnetFactory.Asset({code: "USDC", issuer: USDC_ISSUER});

        bytes32 subnet_id = factory.create_subnet(TEST_ADMIN, auditors, 2, assets);

        // Verify subnet was created
        bool exists = factory.subnet_exists(subnet_id);
        require(exists, "Subnet should exist");

        // Verify subnet is not active yet
        (, , , , address treasury, bool active) = factory.get_subnet(subnet_id);
        require(!active, "Subnet should not be active");
        require(treasury == address(0), "Treasury should be zero");

        emit TestResult("test_create_subnet_valid", true);
        return true;
    }

    /**
     * @notice Test creating subnet with too few auditors (should fail)
     */
    function test_create_subnet_too_few_auditors() public returns (bool) {
        bytes32[] memory auditors = new bytes32[](2); // Only 2 auditors
        auditors[0] = AUDITOR_1;
        auditors[1] = AUDITOR_2;

        SubnetFactory.Asset[] memory assets = new SubnetFactory.Asset[](1);
        assets[0] = SubnetFactory.Asset({code: "XLM", issuer: NATIVE_ISSUER});

        bool reverted = false;
        try factory.create_subnet(TEST_ADMIN, auditors, 2, assets) {
            // Should not reach here
        } catch {
            reverted = true;
        }

        require(reverted, "Should revert with too few auditors");
        emit TestResult("test_create_subnet_too_few_auditors", true);
        return true;
    }

    /**
     * @notice Test creating subnet with threshold too low (should fail)
     */
    function test_create_subnet_threshold_too_low() public returns (bool) {
        bytes32[] memory auditors = new bytes32[](5);
        auditors[0] = AUDITOR_1;
        auditors[1] = AUDITOR_2;
        auditors[2] = AUDITOR_3;
        auditors[3] = AUDITOR_4;
        auditors[4] = 0x5555555555555555555555555555555555555555555555555555555555555555;

        SubnetFactory.Asset[] memory assets = new SubnetFactory.Asset[](1);
        assets[0] = SubnetFactory.Asset({code: "XLM", issuer: NATIVE_ISSUER});

        // Threshold of 2 is too low for 5 auditors (needs at least 3)
        bool reverted = false;
        try factory.create_subnet(TEST_ADMIN, auditors, 2, assets) {
            // Should not reach here
        } catch {
            reverted = true;
        }

        require(reverted, "Should revert with threshold too low");
        emit TestResult("test_create_subnet_threshold_too_low", true);
        return true;
    }

    /**
     * @notice Test creating subnet with no assets (should fail)
     */
    function test_create_subnet_no_assets() public returns (bool) {
        bytes32[] memory auditors = new bytes32[](3);
        auditors[0] = AUDITOR_1;
        auditors[1] = AUDITOR_2;
        auditors[2] = AUDITOR_3;

        SubnetFactory.Asset[] memory assets = new SubnetFactory.Asset[](0); // Empty

        bool reverted = false;
        try factory.create_subnet(TEST_ADMIN, auditors, 2, assets) {
            // Should not reach here
        } catch {
            reverted = true;
        }

        require(reverted, "Should revert with no assets");
        emit TestResult("test_create_subnet_no_assets", true);
        return true;
    }

    /**
     * @notice Test registering treasury
     */
    function test_register_treasury() public returns (bool) {
        // First create a subnet
        bytes32[] memory auditors = new bytes32[](3);
        auditors[0] = AUDITOR_1;
        auditors[1] = AUDITOR_2;
        auditors[2] = AUDITOR_3;

        SubnetFactory.Asset[] memory assets = new SubnetFactory.Asset[](1);
        assets[0] = SubnetFactory.Asset({code: "XLM", issuer: NATIVE_ISSUER});

        bytes32 subnet_id = factory.create_subnet(TEST_ADMIN, auditors, 2, assets);

        // Register treasury (testAdmin is the factory admin)
        address treasury = address(0x1234567890123456789012345678901234567890);
        factory.register_treasury(subnet_id, treasury);

        // Verify subnet is now active
        (, , , , address registeredTreasury, bool active) = factory.get_subnet(subnet_id);
        require(active, "Subnet should be active");
        require(registeredTreasury == treasury, "Treasury should be set");

        emit TestResult("test_register_treasury", true);
        return true;
    }

    /**
     * @notice Test asset whitelist check
     */
    function test_is_asset_whitelisted() public returns (bool) {
        // Create subnet with XLM and USDC
        bytes32[] memory auditors = new bytes32[](3);
        auditors[0] = AUDITOR_1;
        auditors[1] = AUDITOR_2;
        auditors[2] = AUDITOR_3;

        SubnetFactory.Asset[] memory assets = new SubnetFactory.Asset[](2);
        assets[0] = SubnetFactory.Asset({code: "XLM", issuer: NATIVE_ISSUER});
        assets[1] = SubnetFactory.Asset({code: "USDC", issuer: USDC_ISSUER});

        bytes32 subnet_id = factory.create_subnet(TEST_ADMIN, auditors, 2, assets);

        // Check XLM is whitelisted
        bool xlmWhitelisted = factory.is_asset_whitelisted(subnet_id, "XLM", NATIVE_ISSUER);
        require(xlmWhitelisted, "XLM should be whitelisted");

        // Check USDC is whitelisted
        bool usdcWhitelisted = factory.is_asset_whitelisted(subnet_id, "USDC", USDC_ISSUER);
        require(usdcWhitelisted, "USDC should be whitelisted");

        // Check non-whitelisted asset
        bytes32 btcIssuer = 0x4254430000000000000000000000000000000000000000000000000000000000;
        bool btcWhitelisted = factory.is_asset_whitelisted(subnet_id, "BTC", btcIssuer);
        require(!btcWhitelisted, "BTC should not be whitelisted");

        emit TestResult("test_is_asset_whitelisted", true);
        return true;
    }

    /**
     * @notice Run all tests
     */
    function run_all_tests() public returns (bool) {
        test_create_subnet_valid();
        test_create_subnet_too_few_auditors();
        test_create_subnet_threshold_too_low();
        test_create_subnet_no_assets();
        test_register_treasury();
        test_is_asset_whitelisted();
        return true;
    }
}

