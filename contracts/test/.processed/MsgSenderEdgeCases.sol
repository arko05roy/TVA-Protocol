// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/// @title MsgSenderEdgeCases
/// @notice Edge case tests for the msg.sender preprocessor.
/// @dev Covers nested mappings, multiple msg.sender in one expression,
///      msg.sender in string contexts, and various formatting styles.
contract MsgSenderEdgeCases {
    address public owner;

    mapping(address => mapping(address => uint256)) public nested;
    mapping(address => uint256) public balances;
    mapping(address => bool) public authorized;

    // Edge case: nested mapping with msg.sender at different positions
    // [TVA shim] caller pattern -> explicit requireAuth
function nestedAccess(address _caller, address other) public view returns (uint256) {
        _caller.requireAuth();

        return nested[_caller][other];
    
}

    // Edge case: msg.sender as second key in nested mapping
    // [TVA shim] caller pattern -> explicit requireAuth
function nestedAccessReversed(address _caller, address other) public view returns (uint256) {
        _caller.requireAuth();

        return nested[other][_caller];
    
}

    // Edge case: msg.sender used in multiple mappings in one function
    // [TVA shim] caller pattern -> explicit requireAuth
function multiMapping(address _caller, address to, uint256 amount) public {
        _caller.requireAuth();

        require(authorized[_caller], "not authorized");
        balances[_caller] -= amount;
        balances[to] += amount;
    
}

    // Edge case: msg.sender compared to non-variable expression
    // [TVA shim] caller pattern -> explicit requireAuth
function checkComplex() public view returns (bool) {
        address(this.requireAuth();

        require(_caller == address(this), "not self");
        return true;
    
}

    // Edge case: msg.sender in ternary expression
    // [TVA shim] caller pattern -> explicit requireAuth
function ternaryUse(address _caller) public view returns (address) {
        _caller.requireAuth();

        return balances[_caller] > 0 ? _caller : address(0);
    
}

    // Edge case: msg.sender passed as function argument
    // [TVA shim] caller pattern -> explicit requireAuth
function passAsCaller(address _caller) public {
        _caller.requireAuth();

        _internalAction(_caller, 100);
    
}

    function _internalAction(address caller, uint256 amount) internal {
        balances[caller] += amount;
    }

    // Edge case: msg.sender in require with complex condition
    // [TVA shim] caller pattern -> explicit requireAuth
function complexRequire(address _caller, uint256 minBalance) public view returns (bool) {
        _caller.requireAuth();

        require(balances[_caller] >= minBalance && _caller != address(0), "invalid");
        return true;
    
}

    // Edge case: function with no parameters that uses msg.sender
    // [TVA shim] caller pattern -> explicit requireAuth
function whoAmI(address _caller) public view returns (address) {
        _caller.requireAuth();

        return _caller;
    
}

    // Edge case: msg.sender in array/struct initialization
    // [TVA shim] caller pattern -> explicit requireAuth
function recordCaller(address _caller) public returns (address) {
        _caller.requireAuth();

        address caller = _caller;
        authorized[caller] = true;
        return caller;
    
}

    // Edge case: Multiple require statements with msg.sender
    // [TVA shim] caller pattern -> explicit requireAuth
function doubleCheck(address _caller, uint256 amount) public {
        owner.requireAuth();

        
        require(balances[_caller] >= amount, "insufficient");
        balances[_caller] -= amount;
    
}

    // Edge case: msg.sender in comparison operators other than ==
    // [TVA shim] caller pattern -> explicit requireAuth
function notEqual() public view returns (bool) {
        require(_caller != address(0), "zero addr");
        return true;
    
}

    // Function without msg.sender (should pass through unchanged)
    function helper(uint256 x) public pure returns (uint256) {
        return x * 2;
    }
}
