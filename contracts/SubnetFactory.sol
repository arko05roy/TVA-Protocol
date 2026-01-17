pragma solidity 0;

/**
 * @title SubnetFactory
 * @notice Creates and manages subnet configurations for ASTRAEUS
 * @dev Each subnet represents an isolated execution environment with its own auditors and assets
 */
contract SubnetFactory {
    // Instance storage - contract-wide configuration
    address public instance factoryAdmin;

    // Persistent storage - subnet registry
    mapping(bytes32 => Subnet) public persistent subnets;

    // Counter for generating unique subnet IDs
    uint64 public persistent subnetCounter;

    // Data Structures
    struct Asset {
        string code;      // Asset code (1-12 chars per Stellar spec)
        bytes32 issuer;   // Ed25519 public key or "NATIVE" for XLM
    }

    struct Subnet {
        bytes32 admin;              // Subnet admin (bytes32 user_id)
        bytes32[] auditors;         // Array of auditor public keys
        uint32 threshold;           // M-of-N threshold for auditor signatures
        Asset[] assets;             // Whitelisted assets
        address treasury;           // Stellar treasury address (set later by Arko)
        bool active;                // Whether subnet is active (requires treasury)
    }

    // Events
    event SubnetCreated(bytes32 indexed subnet_id, bytes32 admin, uint32 threshold, uint32 auditor_count);
    event TreasuryRegistered(bytes32 indexed subnet_id, address treasury);

    /**
     * @notice Constructor - sets the factory admin
     * @param _factoryAdmin Address of the factory administrator
     */
    constructor(address _factoryAdmin) {
        factoryAdmin = _factoryAdmin;
    }

    /**
     * @notice Creates a new subnet with specified configuration
     * @param admin Subnet admin identifier (bytes32 user_id)
     * @param auditors Array of auditor public keys (bytes32 each)
     * @param threshold M-of-N threshold for auditor signatures
     * @param assets Array of whitelisted assets
     * @return subnet_id Unique identifier for the created subnet
     */
    function create_subnet(
        bytes32 admin,
        bytes32[] memory auditors,
        uint32 threshold,
        Asset[] memory assets
    ) public returns (bytes32) {
        // Validation: auditors must be at least 3
        require(auditors.length >= 3, "SubnetFactory: At least 3 auditors required");

        // Validation: threshold must be at least floor(n/2)+1
        uint32 minThreshold = uint32((auditors.length / 2) + 1);
        require(threshold >= minThreshold, "SubnetFactory: Threshold too low");

        // Validation: assets must be non-empty
        require(assets.length > 0, "SubnetFactory: At least one asset required");

        // Generate unique subnet_id using keccak256
        // Combine admin, counter, and block data for uniqueness
        subnetCounter += 1;
        bytes32 subnet_id = keccak256(abi.encodePacked(
            admin,
            subnetCounter,
            block.timestamp
        ));

        // Ensure subnet doesn't already exist (extremely unlikely but check anyway)
        require(subnets[subnet_id].admin == bytes32(0), "SubnetFactory: Subnet ID collision");

        // Create subnet struct
        Subnet storage subnet = subnets[subnet_id];
        subnet.admin = admin;
        subnet.threshold = threshold;
        subnet.active = false;  // Not active until treasury is registered
        subnet.treasury = address(0);

        // Copy auditors array
        for (uint i = 0; i < auditors.length; i++) {
            subnet.auditors.push(auditors[i]);
        }

        // Copy assets array
        for (uint i = 0; i < assets.length; i++) {
            subnet.assets.push(assets[i]);
        }

        // Extend TTL for subnet storage
        subnets[subnet_id].extendTtl(100, 5000);
        subnetCounter.extendTtl(100, 5000);

        // Emit event
        emit SubnetCreated(subnet_id, admin, threshold, uint32(auditors.length));

        return subnet_id;
    }

    /**
     * @notice Registers a treasury address for a subnet and activates it
     * @dev Only factory admin can call this function
     * @param subnet_id The subnet to register treasury for
     * @param treasury_address The Stellar treasury address
     */
    function register_treasury(bytes32 subnet_id, address treasury_address) public {
        // Only factory admin can register treasury
        factoryAdmin.requireAuth();

        // Validate subnet exists
        require(subnets[subnet_id].admin != bytes32(0), "SubnetFactory: Subnet does not exist");

        // Validate treasury address is not zero
        require(treasury_address != address(0), "SubnetFactory: Invalid treasury address");

        // Validate subnet is not already active
        require(!subnets[subnet_id].active, "SubnetFactory: Subnet already active");

        // Set treasury and activate subnet
        subnets[subnet_id].treasury = treasury_address;
        subnets[subnet_id].active = true;

        // Extend TTL
        subnets[subnet_id].extendTtl(100, 5000);

        // Emit event
        emit TreasuryRegistered(subnet_id, treasury_address);
    }

    /**
     * @notice Gets subnet configuration
     * @param subnet_id The subnet identifier
     * @return subnet The subnet struct
     */
    function get_subnet(bytes32 subnet_id) public view returns (
        bytes32 admin,
        bytes32[] memory auditors,
        uint32 threshold,
        Asset[] memory assets,
        address treasury,
        bool active
    ) {
        Subnet storage subnet = subnets[subnet_id];
        require(subnet.admin != bytes32(0), "SubnetFactory: Subnet does not exist");

        return (
            subnet.admin,
            subnet.auditors,
            subnet.threshold,
            subnet.assets,
            subnet.treasury,
            subnet.active
        );
    }

    /**
     * @notice Checks if a subnet exists
     * @param subnet_id The subnet identifier
     * @return exists True if subnet exists
     */
    function subnet_exists(bytes32 subnet_id) public view returns (bool) {
        return subnets[subnet_id].admin != bytes32(0);
    }

    /**
     * @notice Checks if an asset is whitelisted for a subnet
     * @param subnet_id The subnet identifier
     * @param asset_code The asset code to check
     * @param issuer The asset issuer (or "NATIVE" for XLM)
     * @return isWhitelisted True if asset is whitelisted
     */
    function is_asset_whitelisted(
        bytes32 subnet_id,
        string memory asset_code,
        bytes32 issuer
    ) public view returns (bool) {
        Subnet storage subnet = subnets[subnet_id];
        
        // Check if subnet exists
        if (subnet.admin == bytes32(0)) {
            return false;
        }

        // Check each asset in whitelist
        for (uint i = 0; i < subnet.assets.length; i++) {
            if (
                keccak256(bytes(subnet.assets[i].code)) == keccak256(bytes(asset_code)) &&
                subnet.assets[i].issuer == issuer
            ) {
                return true;
            }
        }

        return false;
    }
}

