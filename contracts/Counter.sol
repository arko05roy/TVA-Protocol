pragma solidity 0;

/**
 * @title Counter
 * @notice Basic counter contract demonstrating TVA Protocol compilation pipeline.
 *         Showcases persistent/instance storage, requireAuth, and TTL management.
 * @dev Compiles to Soroban WASM via: solang compile Counter.sol --target soroban
 *
 * Key Soroban patterns demonstrated:
 * - Persistent storage for durable state (count)
 * - Instance storage for contract-level config (admin)
 * - requireAuth() for access control (replaces msg.sender)
 * - extendTtl() on persistent variables for state archival management
 * - extendInstanceTtl() for contract lifetime extension
 *
 * NOTE: Events are not yet supported on Solang's Soroban target.
 *       Once supported, this contract should emit Incremented/Decremented/Reset events.
 */
contract Counter {
    /// Persistent storage - survives across invocations, TTL-managed
    uint64 public persistent count = 0;

    /// Instance storage - admin tied to contract instance lifetime
    address public instance admin;

    /// @notice Constructor - sets admin (becomes init() on Soroban)
    constructor(address _admin) {
        admin = _admin;
    }

    /// @notice Increment the counter by 1
    /// @return The new count value
    function increment() public returns (uint64) {
        count += 1;
        count.extendTtl(100, 5000);
        return count;
    }

    /// @notice Increment the counter by a specified amount
    /// @param amount The value to add to the counter
    /// @return The new count value
    function increment_by(uint64 amount) public returns (uint64) {
        count += amount;
        count.extendTtl(100, 5000);
        return count;
    }

    /// @notice Decrement the counter by 1 (reverts on underflow)
    /// @return The new count value
    function decrement() public returns (uint64) {
        require(count > 0, "Counter: cannot decrement below zero");
        count -= 1;
        count.extendTtl(100, 5000);
        return count;
    }

    /// @notice Reset counter to zero (admin only, requires admin authorization)
    function reset() public {
        admin.requireAuth();
        count = 0;
        count.extendTtl(100, 5000);
    }

    /// @notice Set counter to a specific value (admin only)
    /// @param value The new counter value
    function set(uint64 value) public {
        admin.requireAuth();
        count = value;
        count.extendTtl(100, 5000);
    }

    /// @notice Get current count value (read-only)
    /// @return Current count value
    function get() public view returns (uint64) {
        return count;
    }

    /// @notice Get the admin address
    /// @return The admin address
    function get_admin() public view returns (address) {
        return admin;
    }

    /// @notice Extend TTL for the persistent count variable
    /// @return The new TTL value
    function extend_count_ttl() public returns (int64) {
        return count.extendTtl(1000, 50000);
    }

    /// @notice Extend TTL for the entire contract instance
    /// @return The new TTL value
    function extend_instance_ttl() public returns (int64) {
        return extendInstanceTtl(1000, 50000);
    }
}
