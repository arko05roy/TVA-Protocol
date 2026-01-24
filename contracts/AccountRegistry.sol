pragma solidity 0;

/**
 * @title AccountRegistry
 * @notice Maps EVM addresses (20 bytes) to Stellar addresses (32 bytes)
 * @dev Core infrastructure contract for TVA Protocol's address translation layer
 *
 * This contract enables the RPC layer to resolve Ethereum-style addresses
 * to their corresponding Stellar accounts and vice versa.
 *
 * Compile: solang compile AccountRegistry.sol --target soroban
 */
contract AccountRegistry {
    // Instance storage - contract configuration
    address public instance registryAdmin;
    uint64 public instance registrationCount;

    // Persistent storage - address mappings
    // EVM address (as bytes20) -> Stellar address (as bytes32)
    mapping(bytes20 => bytes32) public persistent evmToStellar;
    // Stellar address (as bytes32) -> EVM address (as bytes20)
    mapping(bytes32 => bytes20) public persistent stellarToEvm;
    // Track registration status
    mapping(bytes20 => bool) public persistent isRegistered;

    // Events
    event AccountRegistered(
        bytes20 indexed evmAddress,
        bytes32 indexed stellarAddress
    );
    event AccountUpdated(
        bytes20 indexed evmAddress,
        bytes32 indexed oldStellarAddress,
        bytes32 indexed newStellarAddress
    );

    /// @notice Constructor (becomes init() on Soroban)
    constructor(address _admin) {
        registryAdmin = _admin;
        registrationCount = 0;
    }

    /// @notice Register a new EVM-to-Stellar address mapping
    /// @dev The Stellar account holder must authorize this registration
    /// @param evmAddr The 20-byte Ethereum address
    /// @param stellarAddr The 32-byte Stellar Ed25519 public key
    function register(bytes20 evmAddr, bytes32 stellarAddr) public {
        // The Stellar account must prove ownership
        address stellarAccount = address(stellarAddr);
        stellarAccount.requireAuth();

        // Ensure the EVM address is not already registered
        require(!isRegistered[evmAddr], "AccountRegistry: already registered");

        // Ensure neither address is zero
        require(evmAddr != bytes20(0), "AccountRegistry: zero EVM address");
        require(stellarAddr != bytes32(0), "AccountRegistry: zero Stellar address");

        // Store the mapping (both directions)
        evmToStellar[evmAddr] = stellarAddr;
        stellarToEvm[stellarAddr] = evmAddr;
        isRegistered[evmAddr] = true;

        // Increment registration count
        registrationCount += 1;

        // Extend TTL for all written storage
        evmToStellar[evmAddr].extendTtl(1000, 100000);
        stellarToEvm[stellarAddr].extendTtl(1000, 100000);
        isRegistered[evmAddr].extendTtl(1000, 100000);

        emit AccountRegistered(evmAddr, stellarAddr);
    }

    /// @notice Update an existing registration (admin only)
    /// @dev Used for key rotation scenarios
    /// @param evmAddr The 20-byte Ethereum address
    /// @param newStellarAddr The new 32-byte Stellar address
    function updateRegistration(bytes20 evmAddr, bytes32 newStellarAddr) public {
        registryAdmin.requireAuth();

        require(isRegistered[evmAddr], "AccountRegistry: not registered");
        require(newStellarAddr != bytes32(0), "AccountRegistry: zero address");

        bytes32 oldStellarAddr = evmToStellar[evmAddr];

        // Clear old reverse mapping
        stellarToEvm[oldStellarAddr] = bytes20(0);

        // Set new mapping
        evmToStellar[evmAddr] = newStellarAddr;
        stellarToEvm[newStellarAddr] = evmAddr;

        // Extend TTL
        evmToStellar[evmAddr].extendTtl(1000, 100000);
        stellarToEvm[newStellarAddr].extendTtl(1000, 100000);

        emit AccountUpdated(evmAddr, oldStellarAddr, newStellarAddr);
    }

    // ========== Query Functions ==========

    /// @notice Look up Stellar address for a given EVM address
    function getStellarAddress(bytes20 evmAddr) public view returns (bytes32) {
        return evmToStellar[evmAddr];
    }

    /// @notice Look up EVM address for a given Stellar address
    function getEvmAddress(bytes32 stellarAddr) public view returns (bytes20) {
        return stellarToEvm[stellarAddr];
    }

    /// @notice Check if an EVM address is registered
    function isAccountRegistered(bytes20 evmAddr) public view returns (bool) {
        return isRegistered[evmAddr];
    }

    /// @notice Get total registration count
    function getRegistrationCount() public view returns (uint64) {
        return registrationCount;
    }

    // ========== TTL Management ==========

    /// @notice Extend contract instance TTL
    function extendContractTtl() public returns (int64) {
        return extendInstanceTtl(2000, 100000);
    }
}
