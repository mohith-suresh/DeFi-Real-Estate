const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time, loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

const PRICE = ethers.parseEther('100');
const REALTOR_FEE = ethers.parseEther('1');
const DEPOSIT = ethers.parseEther('10'); // exactly 10%
const FIVE_MINUTES = 5 * 60;

const STATE = {
  WaitingSellerSignature: 0,
  WaitingBuyerSignature: 1,
  WaitingRealtorReview: 2,
  WaitingFinalization: 3,
  Finalized: 4,
  Rejected: 5,
};

async function deployFixture() {
  const [realtor, seller, buyer, stranger] = await ethers.getSigners();
  const Tx = await ethers.getContractFactory('HomeTransaction');
  const tx = await Tx.connect(realtor).deploy(
    '1 Main St',
    '90210',
    'Beverly Hills',
    REALTOR_FEE,
    PRICE,
    realtor.address,
    seller.address,
    buyer.address
  );
  return { tx, realtor, seller, buyer, stranger };
}

async function signedAndDeposited() {
  const ctx = await loadFixture(deployFixture);
  await ctx.tx.connect(ctx.seller).sellerSignContract();
  await ctx.tx.connect(ctx.buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT });
  return ctx;
}

async function pastReview() {
  const ctx = await signedAndDeposited();
  await ctx.tx.connect(ctx.realtor).realtorReviewedClosingConditions(true);
  return ctx;
}

describe('HomeTransaction', () => {
  describe('constructor', () => {
    it('reverts when price < realtor fee', async () => {
      const [realtor, seller, buyer] = await ethers.getSigners();
      const Tx = await ethers.getContractFactory('HomeTransaction');
      await expect(
        Tx.deploy('a', 'b', 'c', PRICE, REALTOR_FEE, realtor.address, seller.address, buyer.address)
      ).to.be.revertedWith('Price needs to be more than realtor fee!');
    });

    it('reverts when seller == buyer', async () => {
      const [realtor, seller] = await ethers.getSigners();
      const Tx = await ethers.getContractFactory('HomeTransaction');
      await expect(
        Tx.deploy('a', 'b', 'c', REALTOR_FEE, PRICE, realtor.address, seller.address, seller.address)
      ).to.be.revertedWith('Seller and buyer must differ');
    });
  });

  describe('signing flow', () => {
    it('only the seller can sign first', async () => {
      const { tx, buyer } = await loadFixture(deployFixture);
      await expect(tx.connect(buyer).sellerSignContract()).to.be.revertedWith(
        'Only seller can sign contract'
      );
    });

    it('rejects deposit below 10%', async () => {
      const { tx, seller, buyer } = await loadFixture(deployFixture);
      await tx.connect(seller).sellerSignContract();
      const tooSmall = ethers.parseEther('1');
      await expect(
        tx.connect(buyer).buyerSignContractAndPayDeposit({ value: tooSmall })
      ).to.be.revertedWith('Deposit must be between max(10% of price, realtorFee) and 100% of price');
    });

    it('advances state on a valid deposit, but does not start the finalize timer until acceptance', async () => {
      const { tx, seller, buyer } = await loadFixture(deployFixture);
      await tx.connect(seller).sellerSignContract();
      await tx.connect(buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT });
      expect(await tx.contractState()).to.equal(STATE.WaitingRealtorReview);
      expect(await tx.deposit()).to.equal(DEPOSIT);
      // Deadline is unset (zero) until the realtor accepts.
      expect(await tx.finalizeDeadline()).to.equal(0n);
    });
  });

  describe('slow realtor review (timing edge)', () => {
    it('gives the buyer a fresh window even if review took longer than the timeout', async () => {
      const { tx, seller, realtor, buyer, stranger } = await loadFixture(deployFixture);
      await tx.connect(seller).sellerSignContract();
      await tx.connect(buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT });

      // Realtor takes ten minutes to approve — twice the configured timeout.
      await time.increase(FIVE_MINUTES * 2);
      await tx.connect(realtor).realtorReviewedClosingConditions(true);

      // The deadline must restart from acceptance time, not be already-elapsed.
      await expect(tx.connect(stranger).forceWithdrawAfterDeadline()).to.be.revertedWith(
        'Deadline has not passed yet'
      );

      // Buyer can still finalize within the (post-acceptance) window.
      await tx.connect(buyer).buyerFinalizeTransaction({ value: PRICE - DEPOSIT });
      expect(await tx.contractState()).to.equal(STATE.Finalized);
    });
  });

  describe('happy path: realtor accepts and buyer finalizes', () => {
    it('credits seller (price - fee) and realtor (fee), and reaches Finalized', async () => {
      const { tx, seller, realtor, buyer } = await pastReview();

      const remaining = PRICE - DEPOSIT;
      await expect(tx.connect(buyer).buyerFinalizeTransaction({ value: remaining }))
        .to.emit(tx, 'Finalized')
        .withArgs(PRICE - REALTOR_FEE, REALTOR_FEE);

      expect(await tx.contractState()).to.equal(STATE.Finalized);
      expect(await tx.deposit()).to.equal(0n);
      expect(await tx.pendingWithdrawals(seller.address)).to.equal(PRICE - REALTOR_FEE);
      expect(await tx.pendingWithdrawals(realtor.address)).to.equal(REALTOR_FEE);

      // Funds are pulled, not pushed. The contract holds them until each
      // party calls claim().
      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const sellerClaim = await tx.connect(seller).claim();
      const sellerReceipt = await sellerClaim.wait();
      const sellerGas = sellerReceipt.gasUsed * sellerReceipt.gasPrice;
      expect(await ethers.provider.getBalance(seller.address)).to.equal(
        sellerBefore + (PRICE - REALTOR_FEE) - sellerGas
      );
      await tx.connect(realtor).claim();
      expect(await ethers.provider.getBalance(await tx.getAddress())).to.equal(0n);
    });
  });

  describe('realtor rejects closing conditions', () => {
    it('credits the buyer with the full deposit and zeroes the deposit field', async () => {
      const { tx, realtor, buyer } = await signedAndDeposited();

      await tx.connect(realtor).realtorReviewedClosingConditions(false);

      expect(await tx.contractState()).to.equal(STATE.Rejected);
      expect(await tx.deposit()).to.equal(0n);
      expect(await tx.pendingWithdrawals(buyer.address)).to.equal(DEPOSIT);

      const before = await ethers.provider.getBalance(buyer.address);
      const claim = await tx.connect(buyer).claim();
      const r = await claim.wait();
      expect(await ethers.provider.getBalance(buyer.address)).to.equal(
        before + DEPOSIT - r.gasUsed * r.gasPrice
      );
    });
  });

  describe('buyerWithdraw (the bug under test)', () => {
    it('credits buyer (deposit - fee) and realtor (fee)', async () => {
      const { tx, realtor, buyer } = await pastReview();
      const expectedRefund = DEPOSIT - REALTOR_FEE;

      await expect(tx.connect(buyer).buyerWithdraw())
        .to.emit(tx, 'Credited')
        .withArgs(buyer.address, expectedRefund, 'buyer cancelled');

      expect(await tx.contractState()).to.equal(STATE.Rejected);
      expect(await tx.deposit()).to.equal(0n);
      expect(await tx.pendingWithdrawals(buyer.address)).to.equal(expectedRefund);
      expect(await tx.pendingWithdrawals(realtor.address)).to.equal(REALTOR_FEE);

      await tx.connect(buyer).claim();
      await tx.connect(realtor).claim();
      expect(await ethers.provider.getBalance(await tx.getAddress())).to.equal(0n);
    });

    it('only the buyer can call it', async () => {
      const { tx, stranger } = await pastReview();
      await expect(tx.connect(stranger).buyerWithdraw()).to.be.revertedWith(
        'Only buyer can voluntarily withdraw'
      );
    });

    it('cannot be called past the deadline', async () => {
      const { tx, buyer } = await pastReview();
      await time.increase(FIVE_MINUTES + 1);
      await expect(tx.connect(buyer).buyerWithdraw()).to.be.revertedWith(
        'Deadline has passed; use forceWithdrawAfterDeadline'
      );
    });
  });

  describe('buyerFinalizeTransaction deadline', () => {
    it('reverts when called after the finalize deadline', async () => {
      const { tx, buyer } = await pastReview();
      await time.increase(FIVE_MINUTES + 1);
      await expect(
        tx.connect(buyer).buyerFinalizeTransaction({ value: PRICE - DEPOSIT })
      ).to.be.revertedWith('Deadline has passed; finalize no longer allowed');
    });

    it('still succeeds within the window (just before the deadline)', async () => {
      const { tx, buyer } = await pastReview();
      // advance to deadline - 2s, finalize should still work
      await time.increase(FIVE_MINUTES - 2);
      await tx.connect(buyer).buyerFinalizeTransaction({ value: PRICE - DEPOSIT });
      expect(await tx.contractState()).to.equal(STATE.Finalized);
    });
  });

  describe('forceWithdrawAfterDeadline', () => {
    it('credits seller (deposit - fee) and realtor (fee) after the deadline', async () => {
      const { tx, seller, realtor, stranger } = await pastReview();

      await time.increase(FIVE_MINUTES + 1);
      await tx.connect(stranger).forceWithdrawAfterDeadline();

      expect(await tx.contractState()).to.equal(STATE.Rejected);
      expect(await tx.pendingWithdrawals(seller.address)).to.equal(DEPOSIT - REALTOR_FEE);
      expect(await tx.pendingWithdrawals(realtor.address)).to.equal(REALTOR_FEE);

      await tx.connect(seller).claim();
      await tx.connect(realtor).claim();
      expect(await ethers.provider.getBalance(await tx.getAddress())).to.equal(0n);
    });

    it('cannot be called before the deadline', async () => {
      const { tx, stranger } = await pastReview();
      await expect(tx.connect(stranger).forceWithdrawAfterDeadline()).to.be.revertedWith(
        'Deadline has not passed yet'
      );
    });
  });

  describe('edge cases', () => {
    it('accepts a 100% deposit, then a zero-value finalize', async () => {
      const { tx, seller, realtor, buyer } = await loadFixture(deployFixture);
      await tx.connect(seller).sellerSignContract();
      await tx.connect(buyer).buyerSignContractAndPayDeposit({ value: PRICE });
      await tx.connect(realtor).realtorReviewedClosingConditions(true);

      await tx.connect(buyer).buyerFinalizeTransaction({ value: 0 });

      expect(await tx.contractState()).to.equal(STATE.Finalized);
      expect(await tx.pendingWithdrawals(seller.address)).to.equal(PRICE - REALTOR_FEE);
      expect(await tx.pendingWithdrawals(realtor.address)).to.equal(REALTOR_FEE);
    });

    it('rejects a deposit greater than the price', async () => {
      const { tx, seller, buyer } = await loadFixture(deployFixture);
      await tx.connect(seller).sellerSignContract();
      await expect(
        tx.connect(buyer).buyerSignContractAndPayDeposit({ value: PRICE + 1n })
      ).to.be.revertedWith('Deposit must be between max(10% of price, realtorFee) and 100% of price');
    });

    it('rejects a finalize with the wrong total amount', async () => {
      const { tx, buyer } = await pastReview();
      const wrong = PRICE - DEPOSIT - 1n;
      await expect(
        tx.connect(buyer).buyerFinalizeTransaction({ value: wrong })
      ).to.be.revertedWith('Buyer needs to pay the rest of the cost to finalize transaction');
    });

    it('rejects a second sellerSignContract', async () => {
      const { tx, seller } = await loadFixture(deployFixture);
      await tx.connect(seller).sellerSignContract();
      await expect(tx.connect(seller).sellerSignContract()).to.be.revertedWith('Wrong contract state');
    });

    it('rejects buyer-signing before seller has signed', async () => {
      const { tx, buyer } = await loadFixture(deployFixture);
      await expect(
        tx.connect(buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT })
      ).to.be.revertedWith('Wrong contract state');
    });

    it('rejects realtor-review when not in WaitingRealtorReview', async () => {
      const { tx, realtor } = await loadFixture(deployFixture);
      await expect(
        tx.connect(realtor).realtorReviewedClosingConditions(true)
      ).to.be.revertedWith('Wrong contract state');
    });

    it('rejects forceWithdrawAfterDeadline before deposit', async () => {
      const { tx, stranger } = await loadFixture(deployFixture);
      await expect(tx.connect(stranger).forceWithdrawAfterDeadline()).to.be.revertedWith(
        'Wrong contract state'
      );
    });

    it('rejects buyerWithdraw after Finalized', async () => {
      const { tx, buyer } = await pastReview();
      await tx.connect(buyer).buyerFinalizeTransaction({ value: PRICE - DEPOSIT });
      await expect(tx.connect(buyer).buyerWithdraw()).to.be.revertedWith('Wrong contract state');
    });

    // When realtorFee > 10% of price, the deposit floor is realtorFee — not 10%.
    // This prevents the stuck-cancel state where deposit < realtorFee but the contract
    // is already past WaitingFinalization. Both halves of the invariant are tested:
    //   (a) deposit < realtorFee reverts at deposit time, not later;
    //   (b) when the buyer pays at least realtorFee, withdraw works.
    it('rejects deposit below realtorFee when fee > 10%', async () => {
      const [realtor, seller, buyer] = await ethers.getSigners();
      const Tx = await ethers.getContractFactory('HomeTransaction');
      const fatFee = ethers.parseEther('20'); // > 10% of PRICE
      const tx = await Tx.connect(realtor).deploy(
        '1 Main St',
        '90210',
        'Beverly Hills',
        fatFee,
        PRICE,
        realtor.address,
        seller.address,
        buyer.address
      );
      await tx.connect(seller).sellerSignContract();
      await expect(
        tx.connect(buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT }) // 10 ETH < 20 fee
      ).to.be.revertedWith(
        'Deposit must be between max(10% of price, realtorFee) and 100% of price'
      );
    });

    it('allows withdraw when deposit covers realtorFee even though fee > 10%', async () => {
      const [realtor, seller, buyer] = await ethers.getSigners();
      const Tx = await ethers.getContractFactory('HomeTransaction');
      const fatFee = ethers.parseEther('20');
      const sufficientDeposit = ethers.parseEther('25'); // >= fatFee, <= price
      const tx = await Tx.connect(realtor).deploy(
        '1 Main St',
        '90210',
        'Beverly Hills',
        fatFee,
        PRICE,
        realtor.address,
        seller.address,
        buyer.address
      );
      await tx.connect(seller).sellerSignContract();
      await tx.connect(buyer).buyerSignContractAndPayDeposit({ value: sufficientDeposit });
      await tx.connect(realtor).realtorReviewedClosingConditions(true);
      await tx.connect(buyer).buyerWithdraw();

      expect(await tx.contractState()).to.equal(STATE.Rejected);
      expect(await tx.deposit()).to.equal(0n);
      expect(await tx.pendingWithdrawals(buyer.address)).to.equal(sufficientDeposit - fatFee);
      expect(await tx.pendingWithdrawals(realtor.address)).to.equal(fatFee);

      await tx.connect(buyer).claim();
      await tx.connect(realtor).claim();
      expect(await ethers.provider.getBalance(await tx.getAddress())).to.equal(0n);
    });

    it('emits StateChanged on every transition along the happy path', async () => {
      const { tx, seller, realtor, buyer } = await loadFixture(deployFixture);
      await expect(tx.connect(seller).sellerSignContract())
        .to.emit(tx, 'StateChanged')
        .withArgs(STATE.WaitingBuyerSignature);
      await expect(tx.connect(buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT }))
        .to.emit(tx, 'StateChanged')
        .withArgs(STATE.WaitingRealtorReview);
      await expect(tx.connect(realtor).realtorReviewedClosingConditions(true))
        .to.emit(tx, 'StateChanged')
        .withArgs(STATE.WaitingFinalization);
      await expect(tx.connect(buyer).buyerFinalizeTransaction({ value: PRICE - DEPOSIT }))
        .to.emit(tx, 'StateChanged')
        .withArgs(STATE.Finalized);
    });

    it('zeroes the contract balance after every terminal path is fully claimed', async () => {
      const paths = [
        async () => {
          const ctx = await loadFixture(deployFixture);
          await ctx.tx.connect(ctx.seller).sellerSignContract();
          await ctx.tx.connect(ctx.buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT });
          await ctx.tx.connect(ctx.realtor).realtorReviewedClosingConditions(true);
          await ctx.tx.connect(ctx.buyer).buyerFinalizeTransaction({ value: PRICE - DEPOSIT });
          await ctx.tx.connect(ctx.seller).claim();
          await ctx.tx.connect(ctx.realtor).claim();
          return ctx;
        },
        async () => {
          const ctx = await loadFixture(deployFixture);
          await ctx.tx.connect(ctx.seller).sellerSignContract();
          await ctx.tx.connect(ctx.buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT });
          await ctx.tx.connect(ctx.realtor).realtorReviewedClosingConditions(false);
          await ctx.tx.connect(ctx.buyer).claim();
          return ctx;
        },
        async () => {
          const ctx = await loadFixture(deployFixture);
          await ctx.tx.connect(ctx.seller).sellerSignContract();
          await ctx.tx.connect(ctx.buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT });
          await ctx.tx.connect(ctx.realtor).realtorReviewedClosingConditions(true);
          await ctx.tx.connect(ctx.buyer).buyerWithdraw();
          await ctx.tx.connect(ctx.buyer).claim();
          await ctx.tx.connect(ctx.realtor).claim();
          return ctx;
        },
        async () => {
          const ctx = await loadFixture(deployFixture);
          await ctx.tx.connect(ctx.seller).sellerSignContract();
          await ctx.tx.connect(ctx.buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT });
          await ctx.tx.connect(ctx.realtor).realtorReviewedClosingConditions(true);
          await time.increase(FIVE_MINUTES + 1);
          await ctx.tx.connect(ctx.stranger).forceWithdrawAfterDeadline();
          await ctx.tx.connect(ctx.seller).claim();
          await ctx.tx.connect(ctx.realtor).claim();
          return ctx;
        },
      ];
      for (const run of paths) {
        const { tx } = await run();
        expect(await ethers.provider.getBalance(await tx.getAddress())).to.equal(0n);
        expect(await tx.deposit()).to.equal(0n);
      }
    });
  });

  describe('pull-payment isolation (contract-wallet recipients)', () => {
    it('credits a contract-wallet seller and realtor; they claim independently', async () => {
      const [deployer, buyer] = await ethers.getSigners();
      const Wallet = await ethers.getContractFactory('ContractWallet');
      const sellerWallet = await Wallet.deploy();
      const realtorWallet = await Wallet.deploy();
      const Tx = await ethers.getContractFactory('HomeTransaction');
      const tx = await Tx.connect(deployer).deploy(
        '1 Main', '90210', 'BH',
        REALTOR_FEE, PRICE,
        await realtorWallet.getAddress(),
        await sellerWallet.getAddress(),
        buyer.address
      );
      await sellerWallet.callSellerSign(await tx.getAddress());
      await tx.connect(buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT });
      await realtorWallet.callRealtorReview(await tx.getAddress(), true);
      await tx.connect(buyer).buyerFinalizeTransaction({ value: PRICE - DEPOSIT });

      expect(await tx.contractState()).to.equal(STATE.Finalized);
      expect(await tx.pendingWithdrawals(await sellerWallet.getAddress())).to.equal(PRICE - REALTOR_FEE);
      expect(await tx.pendingWithdrawals(await realtorWallet.getAddress())).to.equal(REALTOR_FEE);

      await sellerWallet.claimFrom(await tx.getAddress());
      await realtorWallet.claimFrom(await tx.getAddress());
      expect(await sellerWallet.received()).to.equal(PRICE - REALTOR_FEE);
      expect(await realtorWallet.received()).to.equal(REALTOR_FEE);
      expect(await ethers.provider.getBalance(await tx.getAddress())).to.equal(0n);
    });

    it('credits a contract-wallet buyer on realtor reject; buyer claims', async () => {
      const [deployer, seller, realtor] = await ethers.getSigners();
      const Wallet = await ethers.getContractFactory('ContractWallet');
      const buyerWallet = await Wallet.deploy();
      const Tx = await ethers.getContractFactory('HomeTransaction');
      const tx = await Tx.connect(deployer).deploy(
        '1 Main', '90210', 'BH',
        REALTOR_FEE, PRICE,
        realtor.address, seller.address,
        await buyerWallet.getAddress()
      );
      await tx.connect(seller).sellerSignContract();
      await deployer.sendTransaction({ to: await buyerWallet.getAddress(), value: DEPOSIT });
      const beforeClaim = await buyerWallet.received();

      await buyerWallet.callBuyerSign(await tx.getAddress(), DEPOSIT);
      await tx.connect(realtor).realtorReviewedClosingConditions(false);

      expect(await tx.contractState()).to.equal(STATE.Rejected);
      expect(await tx.pendingWithdrawals(await buyerWallet.getAddress())).to.equal(DEPOSIT);

      await buyerWallet.claimFrom(await tx.getAddress());
      expect((await buyerWallet.received()) - beforeClaim).to.equal(DEPOSIT);
    });

    it('isolates a malicious recipient: their claim reverts, others are unaffected', async () => {
      const [deployer, buyer] = await ethers.getSigners();
      const Wallet = await ethers.getContractFactory('ContractWallet');
      const Reverter = await ethers.getContractFactory('RevertingWallet');
      const goodRealtor = await Wallet.deploy();
      const badSeller = await Reverter.deploy({ value: 0 });

      const Tx = await ethers.getContractFactory('HomeTransaction');
      const tx = await Tx.connect(deployer).deploy(
        '1 Main', '90210', 'BH',
        REALTOR_FEE, PRICE,
        await goodRealtor.getAddress(),
        await badSeller.getAddress(),
        buyer.address
      );
      await badSeller.forwardSellerSign(await tx.getAddress());
      await tx.connect(buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT });
      await goodRealtor.callRealtorReview(await tx.getAddress(), true);
      await tx.connect(buyer).buyerFinalizeTransaction({ value: PRICE - DEPOSIT });

      // Both recipients are credited correctly.
      expect(await tx.pendingWithdrawals(await badSeller.getAddress())).to.equal(PRICE - REALTOR_FEE);
      expect(await tx.pendingWithdrawals(await goodRealtor.getAddress())).to.equal(REALTOR_FEE);

      // Bad seller's own claim reverts inside their receive() — but that
      // does NOT block the realtor.
      await expect(badSeller.claimFrom(await tx.getAddress())).to.be.reverted;
      await goodRealtor.claimFrom(await tx.getAddress());
      expect(await goodRealtor.received()).to.equal(REALTOR_FEE);

      // The realtor's claim has been drained; the bad seller's credit is
      // still on the ledger (un-pullable by them, but unstuck for everyone else).
      expect(await tx.pendingWithdrawals(await goodRealtor.getAddress())).to.equal(0n);
      expect(await tx.pendingWithdrawals(await badSeller.getAddress())).to.equal(PRICE - REALTOR_FEE);
    });

    it('blocks reentrancy via the claim() nonReentrant modifier', async () => {
      const [deployer, buyer] = await ethers.getSigners();
      const Wallet = await ethers.getContractFactory('ContractWallet');
      const goodRealtor = await Wallet.deploy();
      const Reentrant = await ethers.getContractFactory('ReentrantWallet');
      const reentrantSeller = await Reentrant.deploy({ value: 0 });

      const Tx = await ethers.getContractFactory('HomeTransaction');
      const tx = await Tx.connect(deployer).deploy(
        '1 Main', '90210', 'BH',
        REALTOR_FEE, PRICE,
        await goodRealtor.getAddress(),
        await reentrantSeller.getAddress(),
        buyer.address
      );
      await reentrantSeller.setTarget(await tx.getAddress());
      await reentrantSeller.forwardSellerSign(await tx.getAddress());
      await tx.connect(buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT });
      await goodRealtor.callRealtorReview(await tx.getAddress(), true);
      await tx.connect(buyer).buyerFinalizeTransaction({ value: PRICE - DEPOSIT });

      // Seller's claim → triggers receive() → tries to call target.claim().
      // The outer claim() is nonReentrant, so the re-entry reverts.
      await expect(reentrantSeller.claimFrom(await tx.getAddress())).to.be.reverted;
    });
  });

  describe('Factory', () => {
    it('creates a HomeTransaction and tracks it', async () => {
      const [realtor, seller, buyer] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory('Factory');
      const factory = await Factory.connect(realtor).deploy();

      await expect(
        factory.create(
          '1 Main St',
          '90210',
          'Beverly Hills',
          REALTOR_FEE,
          PRICE,
          seller.address,
          buyer.address
        )
      ).to.emit(factory, 'TransactionCreated');

      expect(await factory.getInstanceCount()).to.equal(1n);
      const instanceAddr = await factory.getInstance(0);
      const instance = await ethers.getContractAt('HomeTransaction', instanceAddr);
      expect(await instance.realtor()).to.equal(realtor.address);
      expect(await instance.seller()).to.equal(seller.address);
      expect(await instance.buyer()).to.equal(buyer.address);
    });

    it('reverts getInstance when index out of range', async () => {
      const [realtor] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory('Factory');
      const factory = await Factory.connect(realtor).deploy();
      await expect(factory.getInstance(0)).to.be.revertedWith('index out of range');
    });

    it('returns all instances via getInstances()', async () => {
      const [realtor, seller, buyer] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory('Factory');
      const factory = await Factory.connect(realtor).deploy();
      await factory.create('a', 'b', 'c', REALTOR_FEE, PRICE, seller.address, buyer.address);
      await factory.create('d', 'e', 'f', REALTOR_FEE, PRICE, seller.address, buyer.address);
      const all = await factory.getInstances();
      expect(all).to.have.length(2);
    });
  });
});
