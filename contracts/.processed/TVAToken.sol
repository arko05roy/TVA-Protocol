pragma solidity 0;

/**
 * @title TVAToken
 * @notice ERC20-compatible token for Soroban via Solang.
 *         Demonstrates how standard token patterns translate to the Soroban VM.
 *
 * @dev Key differences from EVM ERC20:
 * - No msg.sender: uses requireAuth() for caller identity verification
 * - Storage types: instance for config (name, symbol, admin), persistent for supply counter
 * - Mappings: used for balances and allowances (Soroban contract data entries)
 * - int128 amounts: matches Soroban's native token interface standard
 * - Events: Transfer, Approval, Mint, Burn emitted for all state changes
 * - TTL: extendInstanceTtl for contract lifetime, extendTtl on uint64 persistent vars
 *
 * NOTE: extendTtl() only works on uint64 persistent/temporary variables in current Solang.
 *       For the totalSupply (int128), TTL is managed via extendInstanceTtl.
 *
 * Compile: solang compile TVAToken.sol --target soroban
 */
contract TVAToken {
    /// @notice Emitted on token transfer
    event Transfer(address indexed from, address indexed to, int128 amount);
    /// @notice Emitted on approval change
    event Approval(address indexed owner, address indexed spender, int128 amount);
    /// @notice Emitted when tokens are minted
    event Mint(address indexed to, int128 amount);
    /// @notice Emitted when tokens are burned
    event Burn(address indexed from, int128 amount);
    /// @notice Emitted when contract is paused/unpaused
    event PauseStateChanged(bool indexed newState);
    /// @notice Emitted when admin is changed
    event AdminChanged(address indexed newAdmin);

    // Instance storage - contract configuration (lives with contract instance)
    string public instance name;
    string public instance symbol;
    uint32 public instance decimals;
    address public instance admin;
    bool public instance paused;

    // Persistent storage - supply tracking
    // NOTE: Using uint64 for supply counter that supports extendTtl
    uint64 public persistent supplyCounter = 0;

    // Mappings for balances and allowances (default to persistent storage)
    mapping(address => int128) public balances;
    mapping(address => mapping(address => int128)) public allowances;

    /// @notice Initialize token (becomes init() on Soroban)
    /// @param _admin Admin address for token management
    /// @param _name Token name (e.g., "TVA Token")
    /// @param _symbol Token symbol (e.g., "TVA")
    /// @param _decimals Decimal places (typically 7 for Stellar compatibility)
    constructor(
        address _admin,
        string memory _name,
        string memory _symbol,
        uint32 _decimals
    ) {
        admin = _admin;
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        paused = false;
        supplyCounter = 0;
    }

    // ========== Core Token Functions ==========

    /// @notice Transfer tokens from one account to another
    /// @dev The 'from' address must authorize this call via requireAuth.
    ///      This replaces EVM's msg.sender pattern.
    /// @param from Source address (must authorize)
    /// @param to Destination address
    /// @param amount Number of tokens to transfer (must be non-negative)
    function transfer(address from, address to, int128 amount) public {
        require(!paused, "TVAToken: paused");
        require(amount >= 0, "TVAToken: negative amount");
        from.requireAuth();

        int128 fromBal = balances[from];
        require(fromBal >= amount, "TVAToken: insufficient balance");

        balances[from] = fromBal - amount;
        balances[to] = balances[to] + amount;
        emit Transfer(from, to, amount);
    }

    /// @notice Approve a spender to transfer tokens on behalf of owner
    /// @dev The owner must authorize this call
    /// @param owner Token owner (must authorize)
    /// @param spender Address being granted allowance
    /// @param amount Allowance amount (must be non-negative)
    function approve(address owner, address spender, int128 amount) public {
        require(amount >= 0, "TVAToken: negative amount");
        owner.requireAuth();
        allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    /// @notice Transfer tokens using a pre-approved allowance
    /// @dev The spender must authorize this call
    /// @param spender Address spending the allowance (must authorize)
    /// @param from Token owner whose balance is debited
    /// @param to Destination address
    /// @param amount Number of tokens to transfer
    function transfer_from(address spender, address from, address to, int128 amount) public {
        require(!paused, "TVAToken: paused");
        require(amount >= 0, "TVAToken: negative amount");
        spender.requireAuth();

        int128 allowed = allowances[from][spender];
        require(allowed >= amount, "TVAToken: insufficient allowance");

        int128 fromBal = balances[from];
        require(fromBal >= amount, "TVAToken: insufficient balance");

        allowances[from][spender] = allowed - amount;
        balances[from] = fromBal - amount;
        balances[to] = balances[to] + amount;
        emit Transfer(from, to, amount);
    }

    // ========== Query Functions ==========

    /// @notice Get balance of an account
    /// @param account Address to query
    /// @return The token balance
    function balance(address account) public view returns (int128) {
        return balances[account];
    }

    /// @notice Get allowance granted from owner to spender
    /// @param owner Token owner address
    /// @param spender Spender address
    /// @return The remaining allowance
    function allowance(address owner, address spender) public view returns (int128) {
        return allowances[owner][spender];
    }

    /// @notice Get current total supply (from counter)
    /// @return Total tokens minted minus burned (as uint64 counter)
    function get_total_supply() public view returns (uint64) {
        return supplyCounter;
    }

    // ========== Admin Functions ==========

    /// @notice Mint new tokens to an address (admin only)
    /// @dev Admin must authorize. Increases supplyCounter and recipient balance.
    /// @param to Recipient address
    /// @param amount Number of tokens to mint
    function mint(address to, int128 amount) public {
        require(amount >= 0, "TVAToken: negative amount");
        admin.requireAuth();
        require(!paused, "TVAToken: paused");

        balances[to] = balances[to] + amount;
        supplyCounter += 1;
        supplyCounter.extendTtl(100, 10000);
        emit Mint(to, amount);
    }

    /// @notice Burn tokens from a holder's balance
    /// @dev The holder must authorize the burn. Decreases balance.
    /// @param from Address to burn from (must authorize)
    /// @param amount Number of tokens to burn
    function burn(address from, int128 amount) public {
        require(amount >= 0, "TVAToken: negative amount");
        require(!paused, "TVAToken: paused");
        from.requireAuth();

        int128 fromBal = balances[from];
        require(fromBal >= amount, "TVAToken: insufficient balance");

        balances[from] = fromBal - amount;
        emit Burn(from, amount);
    }

    /// @notice Burn tokens from a holder using spender allowance
    /// @dev The spender must authorize. Decreases allowance and balance.
    /// @param spender Address spending the allowance (must authorize)
    /// @param from Token owner whose balance is debited
    /// @param amount Number of tokens to burn
    function burn_from(address spender, address from, int128 amount) public {
        require(amount >= 0, "TVAToken: negative amount");
        require(!paused, "TVAToken: paused");
        spender.requireAuth();

        int128 fromBal = balances[from];
        require(fromBal >= amount, "TVAToken: insufficient balance");
        int128 allowed = allowances[from][spender];
        require(allowed >= amount, "TVAToken: insufficient allowance");

        balances[from] = fromBal - amount;
        allowances[from][spender] = allowed - amount;
        emit Burn(from, amount);
    }

    /// @notice Pause all transfers and minting (admin only)
    function pause() public {
        admin.requireAuth();
        paused = true;
        emit PauseStateChanged(true);
    }

    /// @notice Unpause transfers and minting (admin only)
    function unpause() public {
        admin.requireAuth();
        paused = false;
        emit PauseStateChanged(false);
    }

    /// @notice Transfer admin role to a new address (admin only)
    /// @param newAdmin The new admin address
    function set_admin(address newAdmin) public {
        admin.requireAuth();
        admin = newAdmin;
        emit AdminChanged(newAdmin);
    }

    // ========== TTL Management ==========

    /// @notice Extend TTL for persistent supply counter
    /// @return The new TTL value
    function extend_supply_ttl() public returns (int64) {
        return supplyCounter.extendTtl(1000, 50000);
    }

    /// @notice Extend contract instance TTL (keeps contract and instance storage alive)
    /// @return The new TTL value
    function extend_instance_ttl() public returns (int64) {
        return extendInstanceTtl(1000, 50000);
    }
}
