pragma solidity 0;

/**
 * @title SubnetFactory
 * @notice Creates and manages subnet configurations for ASTRAEUS (Soroban-compatible)
 * @dev Fixed for Soroban: removed block.timestamp (not available on Soroban)
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

    /**
     * @notice Constructor - sets the factory admin
     * @param _factoryAdmin Address of the factory administrator
     */
    constructor(address _factoryAdmin) {
        factoryAdmin = _factoryAdmin;
        subnetCounter = 0;
    }

    /**
     * @notice Creates a new subnet with specified configuration
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
        // Use admin + counter for deterministic uniqueness (no block.timestamp on Soroban)
        subnetCounter += 1;
        bytes32 subnet_id = keccak256(abi.encodePacked(
            admin,
            subnetCounter
        ));

        // Ensure subnet doesn't already exist
        require(subnets[subnet_id].admin == bytes32(0), "SubnetFactory: Subnet ID collision");

        // Create subnet struct
        Subnet storage subnet = subnets[subnet_id];
        subnet.admin = admin;
        subnet.threshold = threshold;
        subnet.active = false;
        subnet.treasury = address(0);

        // Copy auditors array
        for (uint i = 0; i < auditors.length; i++) {
            subnet.auditors.push(auditors[i]);
        }

        // Copy assets array
        for (uint i = 0; i < assets.length; i++) {
            subnet.assets.push(assets[i]);
        }

        // Extend TTL for subnet counter
        subnetCounter.extendTtl(100, 5000);

        return subnet_id;
    }

    /**
     * @notice Registers a treasury address for a subnet and activates it
     */
    function register_treasury(bytes32 subnet_id, address treasury_address) public {
        factoryAdmin.requireAuth();

        require(subnets[subnet_id].admin != bytes32(0), "SubnetFactory: Subnet does not exist");
        require(treasury_address != address(0), "SubnetFactory: Invalid treasury address");
        require(!subnets[subnet_id].active, "SubnetFactory: Subnet already active");

        subnets[subnet_id].treasury = treasury_address;
        subnets[subnet_id].active = true;
    }

    /**
     * @notice Gets subnet configuration
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
     */
    function subnet_exists(bytes32 subnet_id) public view returns (bool) {
        return subnets[subnet_id].admin != bytes32(0);
    }

    /**
     * @notice Checks if an asset is whitelisted for a subnet
     */
    function is_asset_whitelisted(
        bytes32 subnet_id,
        string memory asset_code,
        bytes32 issuer
    ) public view returns (bool) {
        Subnet storage subnet = subnets[subnet_id];

        if (subnet.admin == bytes32(0)) {
            return false;
        }

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
