# Proposal

## Why

Every imported transaction lands in "Uncategorized", so after each import
the user categorizes every row by hand in the ledger, even for payees
they've categorized the same way many times before. The app already knows
those answers from the user's own history. Categorizing should be almost
automatic, with the user only checking and correcting the guesses.

## What Changes

- **Auto-categorization from history:** when an import is committed, each
  new transaction whose payee the user has categorized before gets that
  category. Payees are compared after normalization (case, digits, card
  and reference noise removed), so `CARREFOUR MARKET 1234` and
  `Carrefour Market 0987` count as the same payee. Inflows and outflows
  are matched separately.
- **Confirmed vs unconfirmed categories:** a category the categorizer sets
  is *unconfirmed* and remembers its source (`history`). A category the
  user picks or accepts is *confirmed*. An unconfirmed category counts
  toward budgets and the dashboard exactly like a confirmed
  one, so the numbers are roughly right before the user reviews them.
- **Learns only from confirmed categories:** history uses only categories
  the user confirmed, so a wrong guess never reinforces itself.
- **A Review page, not a step in the import:**
  - it lists every unconfirmed transaction across all accounts, grouped by
    payee and guessed category, largest group first;
  - each group shows its evidence ("7 of 8 earlier payments to Carrefour
    Market were Groceries");
  - one Enter confirms a group, and picking another category corrects the
    whole group;
  - a group expands to its rows, so one transaction from a mixed-use payee
    can be fixed on its own;
  - after each group, focus moves to the next one, so a whole import can
    be reviewed with a handful of key presses.
- **Visible in the rest of the app:**
  - the navigation shows a "Review" count;
  - the import summary says how many rows were categorized and links to
    the Review page (text only, so the import gets no new interaction);
  - ledger rows mark guesses with a source icon, and re-picking the
    category confirms it.
- **Backfill:** when there's nothing to review, the Review page offers to
  guess categories for existing uncategorized transactions from history.
  This covers transactions imported before this change, and it's where the
  AI fallback will plug in later.
- **Never overwrites:** the categorizer only fills empty categories. It
  never touches a categorized row (confirmed or not) or a transfer.
- **Migration:** every existing categorized transaction is marked
  confirmed.

The import wizard itself doesn't change: no new step and no category
column in the preview. Only its final summary gains one line.

Not in scope:
- The AI fallback for payees with no history. That's a separate follow-up
  change, and running it in the background is issue #2.
- User-defined rules ("payee contains X -> category Y").
- Auto-categorizing manually added transactions: the user picks those
  categories themselves.
- Fuzzy matching beyond normalization (e.g. `CARREFOUR MKT` vs
  `CARREFOUR MARKET`).

## Capabilities

### New Capabilities
- `auto-categorization`: how the system guesses a category from history,
  the confirmed/unconfirmed state, how guesses are marked, and the Review
  page (groups, evidence, confirm and correct, navigation count,
  backfill).

### Modified Capabilities
- `transactions`: assigning a category by hand, including saving the edit
  form, marks it confirmed.
- `transaction-import`: committing an import auto-categorizes the
  transactions it creates, and the summary links to the Review page.

## Impact

- **Backend:**
  - A migration on `Transaction` adds `category_confirmed` and
    `category_source`, and marks existing categorized rows confirmed.
  - A new categorizer module handles payee normalization, history lookup
    and applying guesses.
  - Import commit calls the categorizer on created rows and returns
    `categorized_count`.
  - The transactions API gets endpoints for review groups, the review
    count, confirming or correcting a set of transactions, and
    categorizing uncategorized ones.
  - Writing `category` through the API confirms it.
- **Frontend:**
  - A new Review page and a "Review" entry in the navigation, with a
    count.
  - Ledger rows mark guesses with a source icon inside the existing
    picker.
  - The import summary gains one line with a link.
- No new dependencies. Budgets and reports need no changes, because they
  already count every assigned category.
