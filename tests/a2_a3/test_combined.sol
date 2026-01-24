// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/// Combined test for A-2 and A-3: extendTtl on bytes types + bytes as mapping keys
contract TestCombined {
    // bytes types as persistent storage
    bytes1 persistent flag;
    bytes4 persistent selector;
    bytes20 persistent ethAddr;
    bytes32 persistent hash;

    // Mapping with bytes keys
    mapping(bytes32 => uint64) persistent hashToValue;
    mapping(bytes20 => bool) persistent addrRegistered;

    // Temporary bytes
    bytes32 temporary tmpHash;

    function setHash(bytes32 h) public {
        hash = h;
    }

    function getHash() public view returns (bytes32) {
        return hash;
    }

    function setEthAddr(bytes20 addr) public {
        ethAddr = addr;
    }

    function registerAddr(bytes20 addr) public {
        addrRegistered[addr] = true;
    }

    function setHashValue(bytes32 key, uint64 val) public {
        hashToValue[key] = val;
    }

    function getHashValue(bytes32 key) public view returns (uint64) {
        return hashToValue[key];
    }

    // Test extendTtl on bytes types
    function extendBytesTtls() public {
        flag.extendTtl(100, 1000);
        selector.extendTtl(100, 1000);
        ethAddr.extendTtl(100, 1000);
        hash.extendTtl(100, 1000);
        tmpHash.extendTtl(50, 500);
    }
}
