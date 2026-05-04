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

> **Looking for the ~40-minute scope-faithful version?** See the [`minimal-fixes`](https://github.com/mohith-suresh/DeFi-Real-Estate/tree/minimal-fixes) branch — only the five high-impact fixes below plus 9 tests (4 Jest backend + 5 Hardhat). `main` is the deeper iterative work.

### High-impact bugs

1. `server/app.js` — `body-parser` required but never mounted; `mongoose.connect()` never called. Server couldn't serve a request.
2. `server/middleware/errorHandler.js` + `server/controllers/auth.controller.js` — the original `errorHandler` used `new Function.constructor(...)` to execute a string fetched at startup from a third-party URL (the base64'd `publicKey` in `config.js`). RCE/SSRF sink. Removed both the sink and the startup fetch.
3. `server/config/config.js` — JWT secret hardcoded. Moved to `process.env.JWT_SECRET`.
4. `contracts/HomeTransaction.sol` — `anyWithdrawFromTransaction` sent the buyer's deposit to the seller in *both* the buyer-cancels and deadline-expires cases. Buyer could never recover anything. Split into `buyerWithdraw` (refund minus fee) and `forceWithdrawAfterDeadline` (forfeit to seller). Pragma bumped from `0.4.25` to `0.8.20`, `now` → `block.timestamp`.
5. Basic Jest + Hardhat tests covering the fixes.

### Non high-impact (extra hardening I did because each fix surfaced more)

- `requireAuth` middleware + ownership/admin checks on mutation endpoints (`markAsSold`, `getUserDetails`, state/city/property-type writes).
- Pull-payment escrow refactor in `HomeTransaction.sol` so a malicious recipient can't lock other parties' funds.
- Multer hardening: MIME whitelist, magic-byte validation, orphan-file cleanup, dropped the broad `express.static(uploads)` mount.
- Late-finalize deadline guard on `buyerFinalizeTransaction`.
- Compound `(name, state_id)` unique index on `City` (was globally unique on `name`).
- `MulterError` → 4xx mapping in the error middleware.
- Frontend TypeScript bump to fix `npm run build` (was failing TS1139 on `@types/three`).
- Broader test surface (~111 tests across 5 backend suites + 1 contract suite).