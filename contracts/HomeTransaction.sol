// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract HomeTransaction {
    uint constant timeBetweenDepositAndFinalization = 5 minutes;
    uint constant depositPercentage = 10;

    enum ContractState {
        WaitingSellerSignature,
        WaitingBuyerSignature,
        WaitingRealtorReview,
        WaitingFinalization,
        Finalized,
        Rejected
    }
    ContractState public contractState = ContractState.WaitingSellerSignature;

    address payable public realtor;
    address payable public seller;
    address payable public buyer;

    string public homeAddress;
    string public zip;
    string public city;
    uint public realtorFee;
    uint public price;

    uint public deposit;
    uint public finalizeDeadline;

    enum ClosingConditionsReview { Pending, Accepted, Rejected }
    ClosingConditionsReview public closingConditionsReview = ClosingConditionsReview.Pending;

    constructor(
        string memory _address,
        string memory _zip,
        string memory _city,
        uint _realtorFee,
        uint _price,
        address payable _realtor,
        address payable _seller,
        address payable _buyer
    ) {
        require(_price >= _realtorFee, "Price needs to be more than realtor fee!");

        realtor = _realtor;
        seller = _seller;
        buyer = _buyer;
        homeAddress = _address;
        zip = _zip;
        city = _city;
        price = _price;
        realtorFee = _realtorFee;
    }

    function sellerSignContract() public {
        require(seller == msg.sender, "Only seller can sign contract");
        require(contractState == ContractState.WaitingSellerSignature, "Wrong contract state");

        contractState = ContractState.WaitingBuyerSignature;
    }

    function buyerSignContractAndPayDeposit() public payable {
        require(buyer == msg.sender, "Only buyer can sign contract");
        require(contractState == ContractState.WaitingBuyerSignature, "Wrong contract state");
        require(
            msg.value >= price * depositPercentage / 100 && msg.value <= price,
            "Buyer needs to deposit between 10% and 100% to sign contract"
        );

        deposit = msg.value;
        finalizeDeadline = block.timestamp + timeBetweenDepositAndFinalization;
        contractState = ContractState.WaitingRealtorReview;
    }

    function realtorReviewedClosingConditions(bool accepted) public {
        require(realtor == msg.sender, "Only realtor can review closing conditions");
        require(contractState == ContractState.WaitingRealtorReview, "Wrong contract state");

        if (accepted) {
            closingConditionsReview = ClosingConditionsReview.Accepted;
            contractState = ContractState.WaitingFinalization;
        } else {
            closingConditionsReview = ClosingConditionsReview.Rejected;
            contractState = ContractState.Rejected;

            uint refund = deposit;
            deposit = 0;
            buyer.transfer(refund);
        }
    }

    function buyerFinalizeTransaction() public payable {
        require(buyer == msg.sender, "Only buyer can finalize transaction");
        require(contractState == ContractState.WaitingFinalization, "Wrong contract state");
        require(msg.value + deposit == price, "Buyer needs to pay the rest of the cost to finalize transaction");

        deposit = 0;
        contractState = ContractState.Finalized;

        seller.transfer(price - realtorFee);
        realtor.transfer(realtorFee);
    }

    /// @notice Buyer voluntarily cancels before the deadline. The buyer
    /// recovers the deposit minus a realtor-fee penalty paid to the realtor.
    function buyerWithdraw() public {
        require(buyer == msg.sender, "Only buyer can voluntarily withdraw");
        require(contractState == ContractState.WaitingFinalization, "Wrong contract state");
        require(block.timestamp < finalizeDeadline, "Deadline has passed; use forceWithdrawAfterDeadline");
        require(deposit >= realtorFee, "Deposit too small to cover realtor fee");

        uint refund = deposit - realtorFee;
        deposit = 0;
        contractState = ContractState.Rejected;

        buyer.transfer(refund);
        realtor.transfer(realtorFee);
    }

    /// @notice Anyone can call after the deadline; deposit is forfeited to
    /// the seller (minus the realtor fee) because the buyer failed to finalize.
    function forceWithdrawAfterDeadline() public {
        require(contractState == ContractState.WaitingFinalization, "Wrong contract state");
        require(block.timestamp >= finalizeDeadline, "Deadline has not passed yet");
        require(deposit >= realtorFee, "Deposit too small to cover realtor fee");

        uint forfeit = deposit - realtorFee;
        deposit = 0;
        contractState = ContractState.Rejected;

        seller.transfer(forfeit);
        realtor.transfer(realtorFee);
    }
}
