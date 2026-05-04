// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./HomeTransaction.sol";

contract Factory {
    HomeTransaction[] private contracts;

    event TransactionCreated(address indexed instance, address indexed realtor, address indexed seller);

    function create(
        string memory _address,
        string memory _zip,
        string memory _city,
        uint _realtorFee,
        uint _price,
        address payable _seller,
        address payable _buyer
    ) public returns (HomeTransaction homeTransaction) {
        homeTransaction = new HomeTransaction(
            _address,
            _zip,
            _city,
            _realtorFee,
            _price,
            payable(msg.sender),
            _seller,
            _buyer
        );
        contracts.push(homeTransaction);
        emit TransactionCreated(address(homeTransaction), msg.sender, _seller);
    }

    function getInstance(uint index) public view returns (HomeTransaction instance) {
        require(index < contracts.length, "index out of range");
        instance = contracts[index];
    }

    function getInstances() public view returns (HomeTransaction[] memory instances) {
        instances = contracts;
    }

    function getInstanceCount() public view returns (uint count) {
        count = contracts.length;
    }
}
