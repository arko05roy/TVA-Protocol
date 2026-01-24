// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/// Test contract for A-3: Fixed-byte types as mapping keys
contract TestBytesMapping {
    // bytes20 as mapping key (e.g., Ethereum-style addresses)
    mapping(bytes20 => uint64) public balances20;

    // bytes32 as mapping key (e.g., hashes)
    mapping(bytes32 => uint64) public records32;

    // Persistent bytes variable
    bytes32 persistent lastHash;

    function setBalance20(bytes20 key, uint64 value) public returns (uint64) {
        balances20[key] = value;
        return value;
    }

    function getBalance20(bytes20 key) public view returns (uint64) {
        return balances20[key];
    }

    function setRecord32(bytes32 key, uint64 value) public returns (uint64) {
        records32[key] = value;
        return value;
    }

    function getRecord32(bytes32 key) public view returns (uint64) {
        return records32[key];
    }

    function setLastHash(bytes32 h) public {
        lastHash = h;
    }
}
