# Proposal

## Why

CSV import currently assumes a comma-delimited file and guesses the date
format by trying `MM/DD/YYYY` before `DD/MM/YYYY`. Real bank exports break
both assumptions: the user's Crelan (Belgian bank) export is
semicolon-delimited, and tracing the existing date parser against its
actual dates confirms it silently produces wrong dates for any day ≤ 12
(e.g. `01/10/2026` parses as January 10 instead of October 1) - the
day/month guess only "self-corrects" by accident when the day exceeds 12.
Fixing only the delimiter would still leave imported transactions dated
wrong on most rows.

## What Changes

- Auto-detect the CSV delimiter (comma, semicolon, tab, or pipe) instead
  of assuming comma, so semicolon-delimited exports (and others) parse
  correctly. Falls back to comma if detection is inconclusive, so
  existing comma-delimited imports are unaffected.
- Replace date-format guessing with an explicit choice: the CSV mapping
  step now requires the user to select the date column's format from a
  fixed list (`YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `DD-MM-YYYY`,
  `MM-DD-YYYY`, `DD.MM.YYYY`) rather than the system guessing. This is a
  **BREAKING** change to the mapping request shape: date format is now a
  required field alongside date/description/amount.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `transaction-import`: the "Map CSV columns" requirement gains explicit
  delimiter auto-detection and a required date-format selection replacing
  format guessing.

## Impact

- Backend only: `imports/utils.py` (delimiter detection, date parsing)
  and `imports/views.py` (the `map` action's accepted request fields). No
  model/migration changes.
- Frontend: the CSV mapping form (`ImportPage.jsx`) gains a required
  "date format" selector.
- Breaking for any in-flight CSV mapping request that doesn't yet send a
  date format - acceptable since this is pre-release, self-hosted,
  single-user software with no versioned API consumers.
