pragma solidity 0;

/**
 * @title ISubnetFactory
 * @notice Interface for SubnetFactory contract
 */
interface ISubnetFactory {
    function subnet_exists(bytes32 subnet_id) external view returns (bool);
    function is_asset_whitelisted(bytes32 subnet_id, string memory asset_code, bytes32 issuer) external view returns (bool);
    
    struct Asset {
        string code;
        bytes32 issuer;
    }
    
    struct Subnet {
        bytes32 admin;
        bytes32[] auditors;
        uint32 threshold;
        Asset[] assets;
        address treasury;
        bool active;
    }
    
    function get_subnet(bytes32 subnet_id) external view returns (
        bytes32 admin,
        bytes32[] memory auditors,
        uint32 threshold,
        Asset[] memory assets,
        address treasury,
        bool active
    );
}

