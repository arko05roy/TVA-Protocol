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
    function nestedAccess(address other) public view returns (uint256) {
        return nested[msg.sender][other];
    }

    // Edge case: msg.sender as second key in nested mapping
    function nestedAccessReversed(address other) public view returns (uint256) {
        return nested[other][msg.sender];
    }

    // Edge case: msg.sender used in multiple mappings in one function
    function multiMapping(address to, uint256 amount) public {
        require(authorized[msg.sender], "not authorized");
        balances[msg.sender] -= amount;
        balances[to] += amount;
    }

    // Edge case: msg.sender compared to non-variable expression
    function checkComplex() public view returns (bool) {
        require(msg.sender == address(this), "not self");
        return true;
    }

    // Edge case: msg.sender in ternary expression
    function ternaryUse() public view returns (address) {
        return balances[msg.sender] > 0 ? msg.sender : address(0);
    }

    // Edge case: msg.sender passed as function argument
    function passAsCaller() public {
        _internalAction(msg.sender, 100);
    }

    function _internalAction(address caller, uint256 amount) internal {
        balances[caller] += amount;
    }

    // Edge case: msg.sender in require with complex condition
    function complexRequire(uint256 minBalance) public view returns (bool) {
        require(balances[msg.sender] >= minBalance && msg.sender != address(0), "invalid");
        return true;
    }

    // Edge case: function with no parameters that uses msg.sender
    function whoAmI() public view returns (address) {
        return msg.sender;
    }

    // Edge case: msg.sender in array/struct initialization
    function recordCaller() public returns (address) {
        address caller = msg.sender;
        authorized[caller] = true;
        return caller;
    }

    // Edge case: Multiple require statements with msg.sender
    function doubleCheck(uint256 amount) public {
        require(msg.sender == owner, "not owner");
        require(balances[msg.sender] >= amount, "insufficient");
        balances[msg.sender] -= amount;
    }

    // Edge case: msg.sender in comparison operators other than ==
    function notEqual() public view returns (bool) {
        require(msg.sender != address(0), "zero addr");
        return true;
    }

    // Function without msg.sender (should pass through unchanged)
    function helper(uint256 x) public pure returns (uint256) {
        return x * 2;
    }
}
