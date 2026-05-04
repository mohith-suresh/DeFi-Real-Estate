// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../HomeTransaction.sol";

/// Minimal contract wallet whose `receive` does enough work that the
/// 2300-gas stipend of `transfer`/`send` would not cover it. Used to
/// prove HomeTransaction's payouts work for contract-wallet recipients.
contract ContractWallet {
    uint public received;
    mapping(uint => uint) public log;
    uint public count;

    receive() external payable {
        received += msg.value;
        log[count] = msg.value;
        count += 1;
    }

    function callBuyerSign(HomeTransaction tx_, uint amount) external payable {
        tx_.buyerSignContractAndPayDeposit{value: amount}();
    }

    function callBuyerFinalize(HomeTransaction tx_, uint amount) external payable {
        tx_.buyerFinalizeTransaction{value: amount}();
    }

    function callBuyerWithdraw(HomeTransaction tx_) external {
        tx_.buyerWithdraw();
    }

    function callSellerSign(HomeTransaction tx_) external {
        tx_.sellerSignContract();
    }

    function callRealtorReview(HomeTransaction tx_, bool accepted) external {
        tx_.realtorReviewedClosingConditions(accepted);
    }

    function claimFrom(HomeTransaction tx_) external {
        tx_.claim();
    }
}

/// Recipient that always reverts on receive. Funded at deploy time via
/// the payable constructor, since its receive() rejects all incoming value.
/// Forwards a deposit via `forwardSign` so we don't need RPC impersonation.
contract RevertingWallet {
    constructor() payable {}

    receive() external payable {
        revert("nope");
    }

    function forwardSign(HomeTransaction tx_, uint amount) external {
        tx_.buyerSignContractAndPayDeposit{value: amount}();
    }

    function forwardSellerSign(HomeTransaction tx_) external {
        tx_.sellerSignContract();
    }

    function claimFrom(HomeTransaction tx_) external {
        tx_.claim();
    }
}

/// Recipient that attempts to re-enter HomeTransaction during payout.
/// Should fail because of the nonReentrant guard. Funded at deploy.
contract ReentrantWallet {
    HomeTransaction public target;

    constructor() payable {}

    function setTarget(HomeTransaction t) external {
        target = t;
    }

    function forwardSign(HomeTransaction tx_, uint amount) external {
        tx_.buyerSignContractAndPayDeposit{value: amount}();
    }

    function forwardSellerSign(HomeTransaction tx_) external {
        tx_.sellerSignContract();
    }

    function claimFrom(HomeTransaction tx_) external {
        tx_.claim();
    }

    receive() external payable {
        if (address(target) != address(0)) {
            // Re-enter the contract during a claim payout.
            target.claim();
        }
    }
}
