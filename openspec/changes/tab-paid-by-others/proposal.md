# Proposal

## Why

Today a tab only changes when money moves through one of the user's own
accounts. When the person on a tab pays for something for the user (Sarah
buys the takeout), nothing reaches the user's bank, so there is no row to
record it on. The tab keeps saying "Sarah owes you €10" while the user
actually owes her €5. The takeout also never shows up in budgets or
reports.

## What Changes

- On a tab page the user can record that the tab's person paid for
  something: "Sarah paid for…", with an amount, what it was, a category
  and a date. This is a **covered entry**. It is two halves that net to
  zero:
  - the cost, in the chosen category, which counts as spending on its date
  - an equal amount on the tab, which lowers what the person owes (or
    makes the user owe them)
- The tab's existing balance, running balance, "open since" and Open tabs
  panel net the entry automatically, so nothing needs to be "erased".
- A covered row on the tab page reads "covered" (next to "lent" and
  "repaid") and shows its category. It can be edited and deleted on the
  tab page only. Deleting it removes both halves.
- The entry form opens inline at the bottom of the rows list. It shows
  the balance after the entry while the user types ("→ You'll owe Sarah
  €5.00").
- Both halves are stored in a hidden off-bank account. Its balance is
  always zero, and it never appears as an account anywhere (accounts
  list, sidebar, pills, transfer targets, import and sync choices, the
  Overview's Accounts tile, import reminders, net worth tiers).
- Outside the tab page, the cost shows "Paid by Sarah" where an account
  name would go (Overview recent transactions and the transaction sheets
  of reports and budgets). The tab half is never listed there.
- A tab that has covered entries stays a tab. It can't be moved out of
  its tab group, and the tab half of an entry can only sit on a tab.

Issue: none yet. Create one before the PR (`enhancement`).

Out of scope:
- Shared bills in the form (Sarah pays €30, your share is €15). For now,
  enter your share.
- Creating a new tab from the overview.
- Mixed-sign splits of bank transactions (the "settle with a split"
  alternative we discussed).

## Capabilities

### New Capabilities

None. Covered entries belong to `repayment-tabs`.

### Modified Capabilities

- `repayment-tabs`: adds recording, editing and deleting covered
  entries. The tab page gets a "covered" row kind. Covered entries are
  shown as "Paid by <Tab>" outside the tab page. A tab that has covered
  entries stays a tab.
- `accounts`: the off-bank account that holds covered entries is never
  listed, offered or shown as an account.
- `overview`: Recent transactions shows a covered entry's cost with
  "Paid by <Tab>" in place of the account name, and never lists its tab
  half.

## Impact

- **Backend:**
  - `accounts/models.py`: an `is_off_bank` flag and a queryset helper
    that leaves the off-bank account out.
  - `transactions/models.py`: a self-link from the cost half to the tab
    half.
  - A new `transactions/covered.py` for create, edit and delete.
  - Tab API (`transactions/views.py`): endpoints for covered entries, and
    a row kind and category in the tab rows.
  - Account-listing call sites: `accounts/views.py`, `reports/views.py`,
    `reports/balances.py`, `imports/views.py`, `banksync/views.py`,
    `forecasting/views.py`, and the transaction serializers.
  - The category re-parent rule in `budgets/serializers.py`, and the
    category-change guard in `transactions/views.py` and
    `transactions/serializers.py`.
  - Two migrations.
- **Frontend:**
  - `pages/TabPage.jsx`: header action, an inline form at the end of the
    list, covered rows, inline edit and delete.
  - A new `components/CoveredEntryForm.jsx`.
  - `lib/tabs.js`: future-tense balance sentences for the preview.
  - `pages/OverviewPage.jsx`: recent transaction rows.
  - The transaction sheets of reports and budgets.
- **Backup:** the backup format already carries every concrete field and
  self link, so it picks up the new fields. A round-trip test confirms
  it.
