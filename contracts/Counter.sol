pragma solidity 0;

/**
 * @title Counter
 * @notice Basic counter contract demonstrating TVA Protocol compilation pipeline
 * @dev Compiles to Soroban WASM via: solang compile Counter.sol --target soroban
 */
contract Counter {
    /// Persistent storage - survives across invocations, TTL-managed
    uint64 public persistent count = 0;

    /// Instance storage - admin tied to contract lifetime
    address public instance admin;

    /// Events
    event Incremented(uint64 newValue);
    event Decremented(uint64 newValue);
    event Reset(address indexed by);

    /// @notice Constructor - sets admin (becomes init() on Soroban)
    constructor(address _admin) {
        admin = _admin;
    }

    /// @notice Increment the counter
    /// @return The new count value
    function increment() public returns (uint64) {
        count += 1;
        count.extendTtl(100, 5000);
        emit Incremented(count);
        return count;
    }

    /// @notice Decrement the counter (reverts on underflow)
    /// @return The new count value
    function decrement() public returns (uint64) {
        require(count > 0, "Counter: cannot decrement below zero");
        count -= 1;
        count.extendTtl(100, 5000);
        emit Decremented(count);
        return count;
    }

    /// @notice Reset counter to zero (admin only)
    function reset() public {
        admin.requireAuth();
        count = 0;
        count.extendTtl(100, 5000);
        emit Reset(admin);
    }

    /// @notice Get current count
    /// @return Current count value
    function get() public view returns (uint64) {
        return count;
    }

    /// @notice Extend TTL for contract storage
    function extendTtl() public returns (int64) {
        return count.extendTtl(1000, 50000);
    }
}
