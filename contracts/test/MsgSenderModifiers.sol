// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/// @title MsgSenderModifiers
/// @notice Test contract for modifier-based msg.sender patterns.
/// @dev Tests the preprocessor's ability to transform onlyOwner-style modifiers
///      into Soroban requireAuth() patterns.
contract MsgSenderModifiers {
    address public owner;
    address public admin;
    uint256 public value;
    bool public locked;

    event ValueChanged(uint256 newValue);
    event AdminChanged(address newAdmin);

    // Modifier pattern: onlyOwner
    modifier onlyOwner() {
        require(msg.sender == owner, "caller is not owner");
        _;
    }

    // Modifier pattern: onlyAdmin
    modifier onlyAdmin() {
        require(msg.sender == admin, "caller is not admin");
        _;
    }

    // Modifier without msg.sender (should not be transformed)
    modifier whenNotLocked() {
        require(!locked, "contract is locked");
        _;
    }

    constructor() {
        owner = msg.sender;
        admin = msg.sender;
    }

    // Function using onlyOwner modifier
    function setValue(uint256 _value) public onlyOwner {
        value = _value;
        emit ValueChanged(_value);
    }

    // Function using onlyAdmin modifier
    function setAdmin(address newAdmin) public onlyAdmin {
        admin = newAdmin;
        emit AdminChanged(newAdmin);
    }

    // Function using multiple modifiers (one with msg.sender, one without)
    function setValueLocked(uint256 _value) public onlyOwner whenNotLocked {
        value = _value;
        locked = true;
        emit ValueChanged(_value);
    }

    // Function with both modifier and direct msg.sender usage
    function ownerTransfer(address to) public onlyOwner {
        // This function uses msg.sender directly AND has onlyOwner
        emit AdminChanged(msg.sender);
    }

    // Function with onlyAdmin and msg.sender in body
    function adminAction(uint256 newValue) public onlyAdmin {
        require(msg.sender != address(0), "zero address");
        value = newValue;
    }

    // Transfer ownership - uses msg.sender in require
    function transferOwnership(address newOwner) public {
        require(msg.sender == owner, "not owner");
        owner = newOwner;
    }
}
