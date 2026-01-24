// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/// @title MsgSenderERC20
/// @notice A minimal ERC20 implementation using msg.sender patterns.
/// @dev This demonstrates a realistic ERC20 token that needs preprocessing
///      for Soroban deployment. After transformation, the output should be
///      compatible with Solang's Soroban target.
contract MsgSenderERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);

    // [TVA shim] Modifier 'onlyOwner' transformed:
// Original caller check replaced with owner.requireAuth() in function bodies


    // [TVA shim] caller pattern -> explicit requireAuth
constructor(address _caller, string memory _name, string memory _symbol, uint8 _decimals) {
        _caller.requireAuth();

        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        owner = _caller;
    
}

    // [TVA shim] caller pattern -> explicit requireAuth
function transfer(address _caller, address to, uint256 value) public returns (bool) {
        _caller.requireAuth();

        require(to != address(0), "ERC20: zero address");
        require(balanceOf[_caller] >= value, "ERC20: insufficient balance");

        balanceOf[_caller] -= value;
        balanceOf[to] += value;
        emit Transfer(_caller, to, value);
        return true;
    
}

    // [TVA shim] caller pattern -> explicit requireAuth
function approve(address _caller, address spender, uint256 value) public returns (bool) {
        _caller.requireAuth();

        allowance[_caller][spender] = value;
        emit Approval(_caller, spender, value);
        return true;
    
}

    // [TVA shim] caller pattern -> explicit requireAuth
function transferFrom(address _caller, address from, address to, uint256 value) public returns (bool) {
        _caller.requireAuth();

        require(to != address(0), "ERC20: zero address");
        require(balanceOf[from] >= value, "ERC20: insufficient balance");
        require(allowance[from][_caller] >= value, "ERC20: insufficient allowance");

        allowance[from][_caller] -= value;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    
}

    function mint(address to, uint256 amount) public {
        owner.requireAuth();

        require(to != address(0), "ERC20: zero address");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Mint(to, amount);
        emit Transfer(address(0), to, amount);
    }

    // [TVA shim] caller pattern -> explicit requireAuth
function burn(address _caller, uint256 amount) public {
        _caller.requireAuth();

        require(balanceOf[_caller] >= amount, "ERC20: insufficient balance");
        balanceOf[_caller] -= amount;
        totalSupply -= amount;
        emit Burn(_caller, amount);
        emit Transfer(_caller, address(0), amount);
    
}

    // [TVA shim] caller pattern -> explicit requireAuth
function increaseAllowance(address _caller, address spender, uint256 addedValue) public returns (bool) {
        _caller.requireAuth();

        allowance[_caller][spender] += addedValue;
        emit Approval(_caller, spender, allowance[_caller][spender]);
        return true;
    
}

    // [TVA shim] caller pattern -> explicit requireAuth
function decreaseAllowance(address _caller, address spender, uint256 subtractedValue) public returns (bool) {
        _caller.requireAuth();

        uint256 currentAllowance = allowance[_caller][spender];
        require(currentAllowance >= subtractedValue, "ERC20: decreased below zero");
        allowance[_caller][spender] = currentAllowance - subtractedValue;
        emit Approval(_caller, spender, allowance[_caller][spender]);
        return true;
    
}

    // [TVA shim] caller pattern -> explicit requireAuth
function transferOwnership(address newOwner) public {
        owner.requireAuth();

        
        require(newOwner != address(0), "ERC20: zero address");
        owner = newOwner;
    
}
}
