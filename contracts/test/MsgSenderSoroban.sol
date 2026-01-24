// SPDX-License-Identifier: Apache-2.0
pragma solidity 0;

/// @title MsgSenderSoroban
/// @notice A Soroban-compatible test contract that originally uses msg.sender patterns.
/// @dev After preprocessing, this should compile directly with Solang --target soroban.
///      Uses int128 for amounts (Soroban convention) and pragma solidity 0.
contract MsgSenderSoroban {
    address public instance owner;
    mapping(address => int128) public balances;

    event Transfer(address indexed from, address indexed to, int128 amount);
    event OwnerChanged(address indexed newOwner);

    constructor() {
        owner = msg.sender;
    }

    function transfer(address to, int128 amount) public {
        require(amount >= 0, "negative amount");
        require(balances[msg.sender] >= amount, "insufficient");
        balances[msg.sender] -= amount;
        balances[to] += amount;
        emit Transfer(msg.sender, to, amount);
    }

    function mint(address to, int128 amount) public {
        require(msg.sender == owner, "not owner");
        require(amount >= 0, "negative amount");
        balances[to] += amount;
    }

    function balance(address account) public view returns (int128) {
        return balances[account];
    }

    function setOwner(address newOwner) public {
        require(msg.sender == owner, "not owner");
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }
}
