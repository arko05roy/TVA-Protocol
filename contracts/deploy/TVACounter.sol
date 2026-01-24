pragma solidity 0;

/**
 * @title TVACounter
 * @notice Simple counter contract to verify Solang Soroban compilation and deployment
 * @dev Events removed - Soroban event codegen is not yet implemented in Solang pre-alpha
 */
contract TVACounter {
    uint64 public persistent count;
    address public instance admin;

    constructor(address _admin) {
        admin = _admin;
        count = 0;
    }

    function increment() public returns (uint64) {
        admin.requireAuth();
        count += 1;
        count.extendTtl(100, 5000);
        return count;
    }

    function decrement() public returns (uint64) {
        admin.requireAuth();
        require(count > 0, "Cannot decrement below zero");
        count -= 1;
        count.extendTtl(100, 5000);
        return count;
    }

    function get() public view returns (uint64) {
        return count;
    }

    function reset() public {
        admin.requireAuth();
        count = 0;
        count.extendTtl(100, 5000);
    }
}
