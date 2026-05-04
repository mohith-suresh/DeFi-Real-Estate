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

This is the ~40-minute submission — high-impact bugs only, plus 9 tests.
For the deeper iterative work, see the [`extended-fixes`](https://github.com/mohith-suresh/DeFi-Real-Estate/tree/extended-fixes) branch.

### Bugs fixed

| # | Where | Bug → Fix |
|---|---|---|
| 1 | `server/app.js` | `body-parser` required but never mounted; `mongoose.connect()` never called — server couldn't serve a request. Mounted JSON parser, connected Mongo, registered notFound + error middleware. |
| 2 | `server/middleware/errorHandler.js` + `auth.controller.js:7` | Startup line `axios.get(atob(publicKey))…errorHandler(res.data.cookie)` was an RCE/SSRF sink — `errorHandler` used `new Function.constructor` to `eval` a string fetched from a third-party URL. Removed both, rewrote `errorHandler` as a normal Express error middleware. |
| 3 | `server/config/config.js` | JWT secret was hardcoded. Moved to `process.env.JWT_SECRET`; dropped `publicKey`. |
| 4 | `contracts/HomeTransaction.sol` | `anyWithdrawFromTransaction` sent the deposit to the **seller** in *both* "buyer cancels" and "deadline expires" cases — buyer could never recover anything. Split into `buyerWithdraw` (refund minus fee) and `forceWithdrawAfterDeadline` (forfeit to seller). Pragma `0.4.25` → `0.8.20`, `now` → `block.timestamp`. |

Plus one collateral fix in `server/routes/property.js` — a broken `mongoose.mongo.GridFsStorage` init threw on connection open and blocked the test suite from starting.

### Tests (9 passing)

- **Jest** (`npm run test:server`) — register, login good, login bad, 404 handler
- **Hardhat** (`npm run test:contract`) — deposit-floor, happy-path payout, `buyerWithdraw` regression, `forceWithdrawAfterDeadline` before/after deadline

### Run

```bash
nvm use 20
npm install
npm run test:server
npm run test:contract
```