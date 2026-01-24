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
    // [TVA shim] Modifier 'onlyOwner' transformed:
// Original caller check replaced with owner.requireAuth() in function bodies


 // Modifier pattern: 
 // [TVA shim] Modifier '' transformed:
// Original caller check replaced with admin.requireAuth() in function bodies


 // Modifier without msg.sender (should not be transformed)
 modifier whenNotLocked() {
        admin.requireAuth();

        require(!locked, "contract is locked");
        _;
    }

    // [TVA shim] caller pattern -> explicit requireAuth
constructor(address _caller) {
        _caller.requireAuth();

        owner = _caller;
        admin = _caller;
    
}

    // Function using onlyOwner modifier
    function setValue(uint256 _value) public {
        owner.requireAuth();

        value = _value;
        emit ValueChanged(_value);
    }

    // Function using onlyAdmin modifier
    function setAdmin(address newAdmin) public {
        admin.requireAuth();

        admin = newAdmin;
        emit AdminChanged(newAdmin);
    }

    // Function using multiple modifiers (one with msg.sender, one without)
    function setValueLocked(uint256 _value) public whenNotLocked {
        owner.requireAuth();

        value = _value;
        locked = true;
        emit ValueChanged(_value);
    }

    // Function with both modifier and direct msg.sender usage
    // [TVA shim] caller pattern -> explicit requireAuth
function ownerTransfer(address _caller, address to) public {
        owner.requireAuth();

        _caller.requireAuth();

        // This function uses _caller directly AND has onlyOwner
        emit AdminChanged(_caller);
    
}

    // Function with onlyAdmin and msg.sender in body
    // [TVA shim] caller pattern -> explicit requireAuth
function adminAction(uint256 newValue) public {
        admin.requireAuth();

        require(_caller != address(0), "zero address");
        value = newValue;
    
}

    // Transfer ownership - uses msg.sender in require
    // [TVA shim] caller pattern -> explicit requireAuth
function transferOwnership(address newOwner) public {
        owner.requireAuth();

        
        owner = newOwner;
    
}
}
