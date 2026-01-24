pragma solidity 0;

/**
 * @title AccountRegistry
 * @notice Maps EVM-derived accounts to Stellar accounts for the TVA Protocol
 *         address translation layer. Enables the RPC layer to resolve
 *         Ethereum-originated addresses to corresponding Stellar accounts.
 *
 * @dev Design decisions for Solang/Soroban compatibility:
 * - Uses 'address' type for all account references (Soroban-native addressing)
 * - EVM addresses are represented by their mapped Soroban address in the registry
 * - The RPC layer maintains the off-chain mapping from raw 20-byte EVM addresses
 *   to their corresponding Soroban address identifiers
 * - requireAuth() for ownership verification (replaces msg.sender)
 * - Events emitted for registration, update, and deregistration operations
 * - Only uint64 persistent variables support extendTtl()
 *
 * Registration flow:
 * 1. User generates a Stellar keypair
 * 2. RPC layer maps their EVM address to a Soroban address identifier
 * 3. User calls register() with both addresses, proving Stellar ownership
 * 4. Bidirectional lookup is stored on-chain
 *
 * Compile: solang compile AccountRegistry.sol --target soroban
 */
contract AccountRegistry {
    /// @notice Emitted when a new account is registered
    event AccountRegistered(address indexed evmAccount, address indexed stellarAccount);
    /// @notice Emitted when a registration is updated
    event RegistrationUpdated(address indexed evmAccount, address indexed newStellarAccount);
    /// @notice Emitted when a registration is removed
    event AccountDeregistered(address indexed evmAccount);
    /// @notice Emitted when admin is changed
    event AdminChanged(address indexed newAdmin);

    // Instance storage - contract configuration
    address public instance registryAdmin;

    // Persistent storage - registration counter (supports extendTtl)
    uint64 public persistent registrationCount = 0;

    // Mappings for bidirectional address lookup (default to persistent)
    // evmAccount: the Soroban address derived from the EVM address
    // stellarAccount: the native Stellar/Soroban address
    mapping(address => address) public evmToStellar;
    mapping(address => address) public stellarToEvm;
    mapping(address => bool) public isRegistered;

    /// @notice Constructor (becomes init() on Soroban)
    /// @param _admin The admin address for the registry
    constructor(address _admin) {
        registryAdmin = _admin;
        registrationCount = 0;
    }

    /// @notice Register a new EVM-to-Stellar address mapping
    /// @dev The Stellar account holder must authorize this registration
    ///      via requireAuth, proving ownership of the Stellar address.
    ///      The evmAccount is the Soroban address representation of the EVM address.
    /// @param evmAccount The Soroban address derived from the EVM address
    /// @param stellarAccount The native Stellar/Soroban account address
    function register(address evmAccount, address stellarAccount) public {
        // The Stellar account must prove ownership
        stellarAccount.requireAuth();

        // Ensure the EVM account is not already registered
        require(!isRegistered[evmAccount], "AccountRegistry: already registered");

        // Store the mapping (both directions)
        evmToStellar[evmAccount] = stellarAccount;
        stellarToEvm[stellarAccount] = evmAccount;
        isRegistered[evmAccount] = true;

        // Increment registration count and extend its TTL
        registrationCount += 1;
        registrationCount.extendTtl(1000, 100000);

        emit AccountRegistered(evmAccount, stellarAccount);
    }

    /// @notice Update an existing registration (admin only)
    /// @dev Used for key rotation scenarios. Only the registry admin can do this.
    /// @param evmAccount The Soroban address derived from the EVM address
    /// @param newStellarAccount The new Stellar/Soroban account address
    function update_registration(address evmAccount, address newStellarAccount) public {
        registryAdmin.requireAuth();

        require(isRegistered[evmAccount], "AccountRegistry: not registered");

        address oldStellarAccount = evmToStellar[evmAccount];

        // Clear old reverse mapping
        stellarToEvm[oldStellarAccount] = address(0);

        // Set new mapping
        evmToStellar[evmAccount] = newStellarAccount;
        stellarToEvm[newStellarAccount] = evmAccount;

        emit RegistrationUpdated(evmAccount, newStellarAccount);
    }

    /// @notice Remove a registration (admin only)
    /// @dev Clears both directions of the mapping
    /// @param evmAccount The Soroban address derived from the EVM address
    function deregister(address evmAccount) public {
        registryAdmin.requireAuth();

        require(isRegistered[evmAccount], "AccountRegistry: not registered");

        address stellarAccount = evmToStellar[evmAccount];

        // Clear both mappings
        evmToStellar[evmAccount] = address(0);
        stellarToEvm[stellarAccount] = address(0);
        isRegistered[evmAccount] = false;

        emit AccountDeregistered(evmAccount);
    }

    // ========== Query Functions ==========

    /// @notice Look up Stellar address for a given EVM-derived account
    /// @param evmAccount The Soroban address derived from the EVM address
    /// @return The corresponding Stellar account address
    function get_stellar_address(address evmAccount) public view returns (address) {
        return evmToStellar[evmAccount];
    }

    /// @notice Look up EVM-derived account for a given Stellar address
    /// @param stellarAccount The Stellar/Soroban account address
    /// @return The corresponding EVM-derived account address
    function get_evm_address(address stellarAccount) public view returns (address) {
        return stellarToEvm[stellarAccount];
    }

    /// @notice Check if an EVM-derived account is registered
    /// @param evmAccount The address to check
    /// @return True if the address is registered
    function is_account_registered(address evmAccount) public view returns (bool) {
        return isRegistered[evmAccount];
    }

    /// @notice Get total registration count
    /// @return The number of registered accounts
    function get_registration_count() public view returns (uint64) {
        return registrationCount;
    }

    // ========== Admin Functions ==========

    /// @notice Transfer admin role to a new address (admin only)
    /// @param newAdmin The new admin address
    function set_admin(address newAdmin) public {
        registryAdmin.requireAuth();
        registryAdmin = newAdmin;
        emit AdminChanged(newAdmin);
    }

    // ========== TTL Management ==========

    /// @notice Extend TTL for the persistent registration count
    /// @return The new TTL value
    function extend_count_ttl() public returns (int64) {
        return registrationCount.extendTtl(2000, 100000);
    }

    /// @notice Extend contract instance TTL
    /// @return The new TTL value
    function extend_instance_ttl() public returns (int64) {
        return extendInstanceTtl(2000, 100000);
    }
}
