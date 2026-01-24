pragma solidity 0;

/**
 * @title TVAToken
 * @notice ERC20-compatible token for Soroban via Solang
 * @dev Demonstrates how standard token patterns translate to Soroban
 *
 * Key differences from EVM ERC20:
 * - No msg.sender: uses requireAuth() pattern
 * - Storage types: persistent for balances, instance for config
 * - TTL management: extends TTL on every write
 * - Constructor becomes init() on deployment
 *
 * Compile: solang compile TVAToken.sol --target soroban
 */
contract TVAToken {
    // Instance storage - contract configuration (lives with contract instance)
    string public instance name;
    string public instance symbol;
    uint32 public instance decimals;
    address public instance admin;
    bool public instance paused;

    // Persistent storage - user data (TTL-managed, survives archival)
    uint256 public persistent totalSupply;
    mapping(address => uint256) public persistent balances;
    mapping(address => mapping(address => uint256)) public persistent allowances;

    // Events (standard ERC20 events)
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    /// @notice Initialize token (becomes init() on Soroban)
    constructor(
        string memory _name,
        string memory _symbol,
        uint32 _decimals,
        address _admin
    ) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        admin = _admin;
        paused = false;
        totalSupply = 0;
    }

    // ========== Modifiers ==========

    modifier whenNotPaused() {
        require(!paused, "TVAToken: paused");
        _;
    }

    modifier onlyAdmin() {
        admin.requireAuth();
        _;
    }

    // ========== Core ERC20 Functions ==========

    /// @notice Transfer tokens (caller must authorize as 'from')
    /// @dev On Soroban, caller proves identity via requireAuth, not msg.sender
    function transfer(
        address from,
        address to,
        uint256 amount
    ) public whenNotPaused returns (bool) {
        from.requireAuth();

        require(balances[from] >= amount, "TVAToken: insufficient balance");
        require(to != address(0), "TVAToken: zero address");

        balances[from] -= amount;
        balances[to] += amount;

        // Extend TTL for modified storage entries
        balances[from].extendTtl(100, 10000);
        balances[to].extendTtl(100, 10000);

        emit Transfer(from, to, amount);
        return true;
    }

    /// @notice Approve spender allowance
    function approve(
        address owner,
        address spender,
        uint256 amount
    ) public returns (bool) {
        owner.requireAuth();

        allowances[owner][spender] = amount;
        allowances[owner][spender].extendTtl(100, 10000);

        emit Approval(owner, spender, amount);
        return true;
    }

    /// @notice Transfer from allowance (spender must authorize)
    function transferFrom(
        address spender,
        address from,
        address to,
        uint256 amount
    ) public whenNotPaused returns (bool) {
        spender.requireAuth();

        require(allowances[from][spender] >= amount, "TVAToken: insufficient allowance");
        require(balances[from] >= amount, "TVAToken: insufficient balance");

        allowances[from][spender] -= amount;
        balances[from] -= amount;
        balances[to] += amount;

        allowances[from][spender].extendTtl(100, 10000);
        balances[from].extendTtl(100, 10000);
        balances[to].extendTtl(100, 10000);

        emit Transfer(from, to, amount);
        return true;
    }

    // ========== Query Functions ==========

    /// @notice Get balance of account
    function balanceOf(address account) public view returns (uint256) {
        return balances[account];
    }

    /// @notice Get allowance
    function allowance(address owner, address spender) public view returns (uint256) {
        return allowances[owner][spender];
    }

    // ========== Admin Functions ==========

    /// @notice Mint new tokens (admin only)
    function mint(address to, uint256 amount) public onlyAdmin whenNotPaused {
        totalSupply += amount;
        balances[to] += amount;

        balances[to].extendTtl(100, 10000);

        emit Mint(to, amount);
        emit Transfer(address(0), to, amount);
    }

    /// @notice Burn tokens (holder must authorize)
    function burn(address from, uint256 amount) public whenNotPaused {
        from.requireAuth();

        require(balances[from] >= amount, "TVAToken: insufficient balance");

        balances[from] -= amount;
        totalSupply -= amount;

        balances[from].extendTtl(100, 10000);

        emit Burn(from, amount);
        emit Transfer(from, address(0), amount);
    }

    /// @notice Pause all transfers (admin only)
    function pause() public onlyAdmin {
        paused = true;
        emit Paused(admin);
    }

    /// @notice Unpause transfers (admin only)
    function unpause() public onlyAdmin {
        paused = false;
        emit Unpaused(admin);
    }

    // ========== TTL Management ==========

    /// @notice Extend contract instance TTL
    function extendContractTtl() public returns (int64) {
        return extendInstanceTtl(1000, 50000);
    }
}
