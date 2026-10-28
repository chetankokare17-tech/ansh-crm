# Amfico MIS
TallyPrime -> division-wise P&L desktop app (Electron). Status: **M1 only** (skeleton + Tally connection).

## Run
- `npm install`, then `npm start` (or `RUN_WITHOUT_BUILD.bat`)
- `CHECKTALLY.bat [url]` / `node checktally.js [url]` writes `checktally.txt`
- `npm test` runs unit tests against a fake local Tally server

## Open questions (not guessed)
1. Cost centre -> division mapping for ~211 reporting cost centres.
2. COMMON rules: turnover definition, per-period vs YTD, heads, rounding.
3. Opening/Closing stock per division.
4. Near-duplicate partner pairs / single-member categories: merge or keep.
