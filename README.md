# DeFi Real Estate - Take-Home Assessment

Thank you for your interest in joining our team!  
This is a short take-home task to evaluate your skills with backend and smart contract code.

---

## Objective

Your goal is to review asmart contract small codebase, fix bugs, and improve testing for the backend API and smart contracts related to property transactions.

This task should take approximately **40 minutes**.

---

## What to Do

1. **Set Up**

   - Clone the provided code repository (or access the codebase files)
   - Setup the node version:
     ```bash
     nvm install 20
     nvm use 20
     ```
   - Install dependencies with:
     ```bash
     npm install
     ```
   - Run the project locally:
     ```bash
     npm start
     ```
   - The app will be available at `http://localhost:3000` (if applicable)

2. **Review & Fix**

   - Check the backend code (Node.js) for bugs or issues
   - Review the smart contract code (Solidity) for bugs or missing features
   - Fix identified bugs
   - Add simple tests if missing (e.g., basic unit tests for smart contracts or API endpoints)

3. **Submit**

   - Push your changes via a pull request or share the updated code package
   - Briefly describe what you fixed or changed

---

## Focus Areas

- Backend API (Node.js)
- Smart contracts (Solidity)
- Basic tests (if any are missing or incomplete)

---

## Notes

- Keep your changes simple and clear
- Focus on high-impact bugs or issues
- You can use test networks or mock data as needed
- Remember, the goal is to demonstrate your problem-solving skills quickly

---

## Good luck!  
We look forward to reviewing your submission.

---

## Submission notes

This branch (`main`) is the ~40-minute, scope-faithful submission: just the high-impact bugs plus minimal tests. For the deeper iterative work (auth middleware, pull-payment escrow, upload hardening, ~111 tests, etc.), see the [`extended-fixes`](https://github.com/mohith-suresh/DeFi-Real-Estate/tree/extended-fixes) branch.

### High-impact bugs fixed

1. `server/app.js` — `body-parser` was required but never mounted; `mongoose.connect()` was never called. Server couldn't serve a request. Mounted JSON parser, connected Mongo, registered notFound + error middleware, exported `app` for tests.
2. `server/middleware/errorHandler.js` + `server/controllers/auth.controller.js` — the original `errorHandler` used `new Function.constructor(...)` to execute a string fetched at startup from a third-party URL (the base64'd `publicKey` in `config.js`). RCE/SSRF sink. Removed both the sink and the startup fetch; rewrote `errorHandler` as a normal Express error middleware.
3. `server/config/config.js` — JWT secret hardcoded. Moved to `process.env.JWT_SECRET`; dropped `publicKey`.
4. `contracts/HomeTransaction.sol` — `anyWithdrawFromTransaction` sent the buyer's deposit to the seller in *both* the buyer-cancels and deadline-expires cases, so the buyer could never recover anything. Split into `buyerWithdraw` (refund minus realtor fee) and `forceWithdrawAfterDeadline` (forfeit to seller minus realtor fee). Pragma bumped from `0.4.25` to `0.8.20`, `now` → `block.timestamp`.
5. Tests: 4 Jest backend (register, login good, login bad, 404) + 5 Hardhat (deposit-floor, happy-path, `buyerWithdraw` regression, `forceWithdrawAfterDeadline` before/after deadline). All 9 pass.

One small collateral fix: `server/routes/property.js` had a broken `mongoose.mongo.GridFsStorage` block that threw on connection open — the test suite couldn't even start without dropping it.

### Run

```bash
nvm use 20
npm install
npm run test:server     # Jest, in-memory MongoDB
npm run test:contract   # Hardhat
```