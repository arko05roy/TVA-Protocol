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

    // Pattern 1: msg.sender in // [TVA shim] caller pattern -> explicit requireAuth
constructor
    constructor(address _caller) {
        _caller.requireAuth();

        owner = _caller;
        admin = _caller;
        balances[_caller] = 1000000;
    
}

    // Pattern 2: Simple ownership check with require
    // [TVA shim] caller pattern -> explicit requireAuth
function setAdmin(address newAdmin) public {
        owner.requireAuth();

        
        admin = newAdmin;
    
}

    // Pattern 3: Reversed ownership check
    // [TVA shim] caller pattern -> explicit requireAuth
function setPaused(bool _paused) public {
        owner.requireAuth();

        
        paused = _paused;
    
}

    // Pattern 4: Mapping access with msg.sender
    // [TVA shim] caller pattern -> explicit requireAuth
function getBalance(address _caller) public view returns (uint256) {
        _caller.requireAuth();

        return balances[_caller];
    
}

    // Pattern 5: Transfer pattern (msg.sender as source)
    // [TVA shim] caller pattern -> explicit requireAuth
function transfer(address _caller, address to, uint256 amount) public {
        _caller.requireAuth();

        require(balances[_caller] >= amount, "insufficient balance");
        balances[_caller] -= amount;
        balances[to] += amount;
        emit Transfer(_caller, to, amount);
    
}

    // Pattern 6: Approval pattern
    // [TVA shim] caller pattern -> explicit requireAuth
function approve(address _caller, address spender, uint256 amount) public {
        _caller.requireAuth();

        allowances[_caller][spender] = amount;
        emit Approval(_caller, spender, amount);
    
}

    // Pattern 7: TransferFrom pattern (msg.sender as spender)
    // [TVA shim] caller pattern -> explicit requireAuth
function transferFrom(address _caller, address from, address to, uint256 amount) public {
        _caller.requireAuth();

        require(allowances[from][_caller] >= amount, "insufficient allowance");
        require(balances[from] >= amount, "insufficient balance");
        allowances[from][_caller] -= amount;
        balances[from] -= amount;
        balances[to] += amount;
        emit Transfer(from, to, amount);
    
}

    // Pattern 8: Multiple msg.sender usages in one function
    // [TVA shim] caller pattern -> explicit requireAuth
function complexFunction(address _caller, address to, uint256 amount) public {
        owner.requireAuth();

        
        require(balances[_caller] >= amount, "insufficient");
        balances[_caller] -= amount;
        balances[to] += amount;
        emit Transfer(_caller, to, amount);
    
}

    // Pattern 9: msg.sender in event emission only
    // [TVA shim] caller pattern -> explicit requireAuth
function logAction(address _caller) public {
        _caller.requireAuth();

        emit Transfer(_caller, address(0), 0);
    
}

    // Pattern 10: Comparison without require (if statement)
    // [TVA shim] caller pattern -> explicit requireAuth
function conditionalAction(address _caller) public view returns (bool) {
        _caller.requireAuth();

        if (_caller == owner) {
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
