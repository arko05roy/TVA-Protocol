// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/// @title MsgSenderTest
/// @notice Test contract exercising all msg.sender patterns for the TVA preprocessor.
/// @dev This contract uses standard EVM patterns that need to be transformed
///      for Soroban compatibility by the msg-sender-shim preprocessor.
contract MsgSenderTest {
    // State variables
    address public owner;
    address public admin;
    bool public paused;

    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowances;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    // Pattern 1: msg.sender in constructor
    constructor() {
        owner = msg.sender;
        admin = msg.sender;
        balances[msg.sender] = 1000000;
    }

    // Pattern 2: Simple ownership check with require
    function setAdmin(address newAdmin) public {
        require(msg.sender == owner, "not owner");
        admin = newAdmin;
    }

    // Pattern 3: Reversed ownership check
    function setPaused(bool _paused) public {
        require(owner == msg.sender, "not owner");
        paused = _paused;
    }

    // Pattern 4: Mapping access with msg.sender
    function getBalance() public view returns (uint256) {
        return balances[msg.sender];
    }

    // Pattern 5: Transfer pattern (msg.sender as source)
    function transfer(address to, uint256 amount) public {
        require(balances[msg.sender] >= amount, "insufficient balance");
        balances[msg.sender] -= amount;
        balances[to] += amount;
        emit Transfer(msg.sender, to, amount);
    }

    // Pattern 6: Approval pattern
    function approve(address spender, uint256 amount) public {
        allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
    }

    // Pattern 7: TransferFrom pattern (msg.sender as spender)
    function transferFrom(address from, address to, uint256 amount) public {
        require(allowances[from][msg.sender] >= amount, "insufficient allowance");
        require(balances[from] >= amount, "insufficient balance");
        allowances[from][msg.sender] -= amount;
        balances[from] -= amount;
        balances[to] += amount;
        emit Transfer(from, to, amount);
    }

    // Pattern 8: Multiple msg.sender usages in one function
    function complexFunction(address to, uint256 amount) public {
        require(msg.sender == owner, "not owner");
        require(balances[msg.sender] >= amount, "insufficient");
        balances[msg.sender] -= amount;
        balances[to] += amount;
        emit Transfer(msg.sender, to, amount);
    }

    // Pattern 9: msg.sender in event emission only
    function logAction() public {
        emit Transfer(msg.sender, address(0), 0);
    }

    // Pattern 10: Comparison without require (if statement)
    function conditionalAction() public view returns (bool) {
        if (msg.sender == owner) {
            return true;
        }
        return false;
    }

    // No msg.sender - should remain unchanged
    function pureFunction(uint256 a, uint256 b) public pure returns (uint256) {
        return a + b;
    }

    // No msg.sender - should remain unchanged
    function viewBalance(address account) public view returns (uint256) {
        return balances[account];
    }
}
