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

    /// @dev Pull-payment ledger. State transitions credit recipients here
    /// instead of pushing funds; recipients call `claim()` to withdraw.
    /// This isolates a malicious or broken recipient (whose `receive`
    /// reverts) so it can no longer block other parties' funds.
    mapping(address => uint) public pendingWithdrawals;

    event StateChanged(ContractState newState);
    event DepositPaid(address indexed from, uint amount);
    event Finalized(uint sellerProceeds, uint realtorFee);
    event Credited(address indexed to, uint amount, string reason);
    event Claimed(address indexed by, uint amount);

    uint8 private _reentrancyStatus = 1;
    modifier nonReentrant() {
        require(_reentrancyStatus == 1, "Reentrant call");
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

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
        require(_realtor != address(0) && _seller != address(0) && _buyer != address(0), "Zero address");
        require(_seller != _buyer, "Seller and buyer must differ");

        realtor = _realtor;
        seller = _seller;
        buyer = _buyer;
        homeAddress = _address;
        zip = _zip;
        city = _city;
        price = _price;
        realtorFee = _realtorFee;
    }

    function _credit(address to, uint amount, string memory reason) private {
        if (amount == 0) return;
        pendingWithdrawals[to] += amount;
        emit Credited(to, amount, reason);
    }

    /// @notice Pull a credited balance. A reverting recipient only blocks
    /// itself — other parties' credits remain claimable.
    function claim() external nonReentrant {
        uint amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No funds to claim");
        pendingWithdrawals[msg.sender] = 0;
        emit Claimed(msg.sender, amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Claim transfer failed");
    }

    function sellerSignContract() public {
        require(seller == msg.sender, "Only seller can sign contract");
        require(contractState == ContractState.WaitingSellerSignature, "Wrong contract state");

        contractState = ContractState.WaitingBuyerSignature;
        emit StateChanged(contractState);
    }

    function buyerSignContractAndPayDeposit() public payable {
        require(buyer == msg.sender, "Only buyer can sign contract");
        require(contractState == ContractState.WaitingBuyerSignature, "Wrong contract state");

        uint percentFloor = price * depositPercentage / 100;
        uint floor = realtorFee > percentFloor ? realtorFee : percentFloor;
        require(
            msg.value >= floor && msg.value <= price,
            "Deposit must be between max(10% of price, realtorFee) and 100% of price"
        );

        deposit = msg.value;
        contractState = ContractState.WaitingRealtorReview;

        emit DepositPaid(msg.sender, msg.value);
        emit StateChanged(contractState);
    }

    function realtorReviewedClosingConditions(bool accepted) public {
        require(realtor == msg.sender, "Only realtor can review closing conditions");
        require(contractState == ContractState.WaitingRealtorReview, "Wrong contract state");

        if (accepted) {
            closingConditionsReview = ClosingConditionsReview.Accepted;
            contractState = ContractState.WaitingFinalization;
            finalizeDeadline = block.timestamp + timeBetweenDepositAndFinalization;
            emit StateChanged(contractState);
        } else {
            closingConditionsReview = ClosingConditionsReview.Rejected;
            contractState = ContractState.Rejected;

            uint refund = deposit;
            deposit = 0;
            emit StateChanged(contractState);
            _credit(buyer, refund, "realtor rejected closing conditions");
        }
    }

    function buyerFinalizeTransaction() public payable {
        require(buyer == msg.sender, "Only buyer can finalize transaction");
        require(contractState == ContractState.WaitingFinalization, "Wrong contract state");
        require(block.timestamp < finalizeDeadline, "Deadline has passed; finalize no longer allowed");
        require(msg.value + deposit == price, "Buyer needs to pay the rest of the cost to finalize transaction");

        deposit = 0;
        contractState = ContractState.Finalized;

        uint sellerProceeds = price - realtorFee;
        emit Finalized(sellerProceeds, realtorFee);
        emit StateChanged(contractState);

        _credit(seller, sellerProceeds, "sale finalized");
        _credit(realtor, realtorFee, "realtor fee");
    }

    /// @notice Buyer voluntarily cancels before the finalization deadline.
    /// Buyer recovers the deposit minus a realtor-fee penalty paid to the realtor.
    function buyerWithdraw() public {
        require(buyer == msg.sender, "Only buyer can voluntarily withdraw");
        require(contractState == ContractState.WaitingFinalization, "Wrong contract state");
        require(block.timestamp < finalizeDeadline, "Deadline has passed; use forceWithdrawAfterDeadline");
        require(deposit >= realtorFee, "Deposit too small to cover realtor fee");

        uint refund = deposit - realtorFee;
        deposit = 0;
        contractState = ContractState.Rejected;

        emit StateChanged(contractState);
        _credit(buyer, refund, "buyer cancelled");
        _credit(realtor, realtorFee, "buyer-cancel penalty");
    }

    /// @notice Anyone can call after the deadline has passed; deposit is forfeited
    /// to the seller (minus realtor fee) because the buyer failed to finalize.
    function forceWithdrawAfterDeadline() public {
        require(contractState == ContractState.WaitingFinalization, "Wrong contract state");
        require(block.timestamp >= finalizeDeadline, "Deadline has not passed yet");
        require(deposit >= realtorFee, "Deposit too small to cover realtor fee");

        uint forfeit = deposit - realtorFee;
        deposit = 0;
        contractState = ContractState.Rejected;

        emit StateChanged(contractState);
        _credit(seller, forfeit, "buyer defaulted past deadline");
        _credit(realtor, realtorFee, "realtor fee");
    }
}
