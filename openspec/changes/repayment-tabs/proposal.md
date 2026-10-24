# Proposal

## Why

Some money leaves the joint account only for a while:
- a work cost the employer pays back, often as part of the salary;
- a dinner where a friend owes half;
- a personal purchase made from the joint account by mistake, which the
  user pays back.

Today these count as household spending, and their repayments count as
income, so budgets and the dashboard are wrong both times. Nothing shows
who still owes what. In Actual the user kept these in an out-of-budget
"temp payments" category group. Splits (#5) shipped the groundwork: a
friend's half of a bill can now be its own part.

## What Changes

- **A tab is a category in a tab group.** A top-level category can be
  marked as a tab group, for example "Tabs". Each of its subcategories is
  a tab: "Tabs / Jan", "Tabs / Employer", "Tabs / Vincent". Adding a
  person means adding a subcategory. The group itself can't be given to
  a transaction.
- **Balance from the rows.** Money out to a tab means that person owes
  it; money in on the same tab is a repayment. The balance is the
  negated sum of the tab's rows, which can be whole transactions or split
  parts. Partial repayments, lump sums and overpayments therefore need no
  matching: an overpaid tab reads "You owe Jan €5".
- **Tabs stay out of reports**, the same way transfers do:
  - budgets list no tab categories and take no limits for them;
  - the dashboard's money in/out and category spending leave tab rows
    out, and the in vs out chart says "Excludes transfers and tabs";
  - the AI categorizer is never offered a tab. History still learns
    whole transactions, so "JAN PEETERS +30 → Tabs / Jan" comes for free.
- **Balances are sentences, never signed numbers:**
  - "Jan owes you €30", in normal text and never green;
  - "You owe Jan €5", in the warning colour;
  - "Settled", muted with a check.

  Each open tab shows "open since <date>", which turns to the warning
  colour after 30 days, so a reimbursement that never came stands out.
- **Open tabs card on the dashboard.** It lists each open tab with its
  sentence and age, plus "N settled tabs" to show the rest. When no tab
  exists, there is no card.
- **Tab page (`/tabs/:id`)**, opened from the card:
  - the balance sentence;
  - the tab's rows oldest first, each marked "lent" or "repaid", with a
    running balance;
  - a "Settled" divider wherever the balance reaches zero, with stretches
    before the last one collapsed;
  - on a lent row, "Settled outside the account…" opens the category
    picker, so a debt paid in cash, or forgiven, can move to a normal
    category.
- **Category picker:** tabs are listed in their own "Tabs" group after
  the categories, the way transfer targets are, with a small hand-and-coins
  icon. The ledger cell shows the same icon next to "Tabs / Jan".
- **Category settings:** a top-level category gets a "Budget | Tab"
  switch. Subcategories show the kind they inherit. Switching a group
  with rows asks for confirmation, because it moves those rows in or out
  of the reports. Tab groups show balances in place of limits.

Not in scope:
- A one-step "half to a tab" split shortcut. The split editor already
  fills in the other half; revisit if it proves tedious.
- Tab entries with no joint-account line, such as cash lent from a
  personal wallet.
- Partly settling a single row outside the account (edit the split in
  the ledger instead).
- Prompting to split a salary when an employer tab is open.
- A nav item or a list page for tabs; the dashboard card is the entry
  point.

## Capabilities

### New Capabilities
- `repayment-tabs`: tab groups and tabs, tab balances and how they are
  worded, the open tabs card, the tab page and settling a row outside
  the account.

### Modified Capabilities
- `budgets`: a top-level category can be a tab group; tab categories
  are left out of the budget summary and take no limits.
- `dashboard`: money in/out and category spending leave tab rows out,
  and the in vs out chart says so.
- `auto-categorization`: the AI guesser is never offered a tab
  category or a tab group.
- `category-picker`: tabs are listed in their own group, and tab groups
  are not offered where a transaction's category is picked.

## Impact

- **Backend:**
  - A migration adds `Category.is_tab_group`.
  - Category serializer and validation: only top-level categories can be
    tab groups; a group with transactions of its own can't become one;
    no transaction or part gets a tab group as its category.
  - Report filters in `reports/views.py` and `budgets/views.py`.
  - `transactions/categorize.py` leaves tabs out of the AI's categories.
  - A new `/api/tabs/` endpoint (balances and open-since) and
    `/api/tabs/{id}/` (rows with a running balance).
- **Frontend:**
  - `CategoryCombobox` gets a Tabs group.
  - `BudgetsPage` gets the kind switch and the tab rows.
  - `DashboardPage` gets the open tabs card and the chart footnote.
  - A new `TabPage` and route.
  - New `api/tabs.js` calls.
- No new dependencies.
