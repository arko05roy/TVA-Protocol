// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/// Test contract for A-2: extendTtl on various types
contract TestExtendTtl {
    uint64 persistent myUint64;
    int64 persistent myInt64;
    uint32 persistent myUint32;
    uint128 persistent myUint128;
    int128 persistent myInt128;
    bool persistent myBool;
    address persistent myAddress;
    string persistent myString;
    bytes32 persistent myBytes32;

    // Temporary storage variables
    uint64 temporary tmpUint64;
    int128 temporary tmpInt128;

    function extendAllTtls() public {
        // Extend TTL for each persistent variable type
        myUint64.extendTtl(100, 1000);
        myInt64.extendTtl(100, 1000);
        myUint32.extendTtl(100, 1000);
        myUint128.extendTtl(100, 1000);
        myInt128.extendTtl(100, 1000);
        myBool.extendTtl(100, 1000);
        myAddress.extendTtl(100, 1000);
        myString.extendTtl(100, 1000);
        myBytes32.extendTtl(100, 1000);
    }

    function extendTemporary() public {
        // Extend TTL for temporary variables
        tmpUint64.extendTtl(50, 500);
        tmpInt128.extendTtl(50, 500);
    }

    function setValues() public {
        myUint64 = 42;
        myInt64 = -100;
        myUint32 = 999;
        myUint128 = 123456789;
        myInt128 = -987654321;
        myBool = true;
    }
}
