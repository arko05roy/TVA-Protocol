// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Greeter {
    string public greeting;

    event GreetingSet(string newGreeting);

    constructor(string memory _greeting) {
        greeting = _greeting;
    }

    function setGreeting(string memory _newGreeting) public {
        greeting = _newGreeting;
        emit GreetingSet(_newGreeting);
    }

    function greet() public view returns (string memory) {
        return greeting;
    }
}
