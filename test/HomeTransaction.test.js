const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time, loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

const PRICE = ethers.parseEther('100');
const REALTOR_FEE = ethers.parseEther('1');
const DEPOSIT = ethers.parseEther('10');
const FIVE_MINUTES = 5 * 60;

async function deployFixture() {
  const [realtor, seller, buyer, stranger] = await ethers.getSigners();
  const Tx = await ethers.getContractFactory('HomeTransaction');
  const tx = await Tx.connect(realtor).deploy(
    '1 Main St', '90210', 'Beverly Hills',
    REALTOR_FEE, PRICE,
    realtor.address, seller.address, buyer.address
  );
  return { tx, realtor, seller, buyer, stranger };
}

async function pastReview() {
  const ctx = await loadFixture(deployFixture);
  await ctx.tx.connect(ctx.seller).sellerSignContract();
  await ctx.tx.connect(ctx.buyer).buyerSignContractAndPayDeposit({ value: DEPOSIT });
  await ctx.tx.connect(ctx.realtor).realtorReviewedClosingConditions(true);
  return ctx;
}

describe('HomeTransaction', () => {
  it('rejects a deposit below 10%', async () => {
    const { tx, seller, buyer } = await loadFixture(deployFixture);
    await tx.connect(seller).sellerSignContract();
    await expect(
      tx.connect(buyer).buyerSignContractAndPayDeposit({ value: ethers.parseEther('1') })
    ).to.be.revertedWith('Buyer needs to deposit between 10% and 100% to sign contract');
  });

  it('happy path: pays seller (price - fee) and realtor (fee)', async () => {
    const { tx, seller, realtor, buyer } = await pastReview();
    const sellerBefore = await ethers.provider.getBalance(seller.address);
    const realtorBefore = await ethers.provider.getBalance(realtor.address);

    await tx.connect(buyer).buyerFinalizeTransaction({ value: PRICE - DEPOSIT });

    expect(await ethers.provider.getBalance(seller.address)).to.equal(
      sellerBefore + (PRICE - REALTOR_FEE)
    );
    expect(await ethers.provider.getBalance(realtor.address)).to.equal(realtorBefore + REALTOR_FEE);
    expect(await ethers.provider.getBalance(await tx.getAddress())).to.equal(0n);
  });

  it('buyerWithdraw returns deposit minus realtor fee to buyer (the regression)', async () => {
    const { tx, realtor, buyer } = await pastReview();
    const realtorBefore = await ethers.provider.getBalance(realtor.address);
    await tx.connect(buyer).buyerWithdraw();
    expect(await ethers.provider.getBalance(realtor.address)).to.equal(realtorBefore + REALTOR_FEE);
    expect(await ethers.provider.getBalance(await tx.getAddress())).to.equal(0n);
  });

  it('forceWithdrawAfterDeadline reverts before the deadline', async () => {
    const { tx, stranger } = await pastReview();
    await expect(tx.connect(stranger).forceWithdrawAfterDeadline()).to.be.revertedWith(
      'Deadline has not passed yet'
    );
  });

  it('forceWithdrawAfterDeadline forfeits to seller after the deadline', async () => {
    const { tx, seller, stranger } = await pastReview();
    const sellerBefore = await ethers.provider.getBalance(seller.address);
    await time.increase(FIVE_MINUTES + 1);
    await tx.connect(stranger).forceWithdrawAfterDeadline();
    expect(await ethers.provider.getBalance(seller.address)).to.equal(
      sellerBefore + (DEPOSIT - REALTOR_FEE)
    );
  });
});
