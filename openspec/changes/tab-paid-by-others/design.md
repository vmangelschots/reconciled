# Design

## Context

- **Tabs.** A tab is a subcategory of a tab group. `transactions/tabs.py`
  computes its balance as the negated sum of `counted_rows()` in that
  category, and walks them oldest first for the running balance and
  "open since".
- **Reports and budgets** sum `counted_transactions()`
  (`reports/spending.py`). That excludes tab rows (`outside_tabs()`),
  transfers and adjustments, and limits rows to non-archived accounts.
- **Every row needs an account** (`Transaction.account` is non-null). An
  account's balance is its starting balance plus its `ledger_rows()`.
- **Account lists** are built from `Account.objects` at about a dozen call
  sites. There is no shared "visible accounts" helper.
- **Splits** require parts with the same sign as their transaction
  (`transactions/splits.py`).
- **UI building blocks.** `components/SplitEditor.jsx` already has the
  inline-form pattern this change reuses: a € prefix on the amount, a
  live `role="status"` line, the inline `confirmUnsplit` confirm, and
  Cancel/Save buttons. The app has no dropdown-menu component.

## Goals / Non-Goals

**Goals:**
- Model a covered entry so that the existing tab, report and budget
  queries count it correctly without changes.
- Make the off-bank storage invisible as an account.

**Non-Goals:**
- A general "virtual accounts" feature.
- Reworking splits to allow mixed signs.
- An undo toast. The toast has no action support today.

## Decisions

### 1. A covered entry is two linked transactions in one off-bank account

Each entry is two ordinary `Transaction` rows in the household's off-bank
account, on the same date and with the same payee:

- **Cost half:** `-amount` in the chosen category.
- **Tab half:** `+amount` in the tab.

The cost half has a new
`covered_tab_row = OneToOneField("self", CASCADE, related_name="covered_cost")`
pointing at the tab half. Deleting the tab half takes the cost half with
it, and every write goes through `transactions/covered.py`.

Why this works with no other changes:
- `counted_transactions()` already counts the cost half as spending and
  skips the tab half (`outside_tabs()`).
- `tab_rows()` already finds the tab half.
- The off-bank account's balance is always 0.
- Both halves are confirmed manual categories, so the review and
  uncategorized queues ignore them.

Alternatives considered:
- **A zero-amount split with a −/+ part pair.** Rejected. It breaks two
  split invariants (non-zero amount, same sign), and every split-aware
  display would show "part of €0.00".
- **A `CoveredEntry` table with amounts outside `Transaction`.** Rejected.
  Every report and budget query would need a union.
- **Reusing `transfer_counterpart`.** Rejected. Transfers are excluded
  from reports, and the cost has to count as spending.

### 2. The off-bank account is a flagged `Account`

- Add `is_off_bank = BooleanField(default=False)`: one account per
  household, type `other`, name "Paid by others", starting balance 0.
- `covered.py` creates it lazily with `get_or_create` on the first
  covered entry.
- A new `AccountQuerySet.visible()` (`exclude(is_off_bank=True)`) is used
  at every call site that lists, offers or looks up an account for the
  user:
  - `AccountViewSet.get_queryset`. A retrieve then returns 404, so the
    ledger address falls back with a notice.
  - Overview accounts and stale imports (`reports/views.py:321`).
  - The tier list (`reports/views.py:105`).
  - `reports/balances.py` tiers.
  - Import account choices and the active set (`imports/views.py`).
  - Bank sync choices (`banksync/views.py`).
  - Forecast lookup (`forecasting/views.py`).
  - The transfer target and account fields in `transactions/serializers.py`.
  - The manual add path in `transactions/views.py`.
- The flag isn't hidden in the default manager. Backups, integrity checks
  and the tab and report queries must still see the account's rows.
- **Alternative:** a new account type `off_bank`. Rejected. It would leak
  into the type picker, `TYPE_TIERS` and tier ordering.

### 3. API on the tab resource

- `POST /tabs/{id}/covered/` with `{date, payee, amount_cents (>0),
  category, notes?}` creates both halves atomically.
- `PATCH /tabs/{id}/covered/{tab_row_id}/` changes both.
- `DELETE /tabs/{id}/covered/{tab_row_id}/` removes both.
- The category must not be a tab or a tab group. The error text reuses
  `TAB_GROUP_ERROR`'s style.
- Tab detail rows gain:
  - `kind`: `"lent"`, `"repaid"` or `"covered"`.
  - For covered rows: `covered_category` (id and label) and `notes`.

### 4. Guards that keep the pair consistent

- **Recategorizing.** The generic transaction update, bulk categorize and
  split paths reject changing the category of a row that is either half
  of a covered entry, except for moving the tab half to another tab. The
  supported way to change an entry is through `covered.py`.
- **Re-parenting.** `CategorySerializer.validate_parent` rejects moving a
  tab out of its tab group while it has covered tab halves.
- **Deleting a tab.** The existing "transactions still assigned" check
  already blocks it.

### 5. Listing outside the tab page

- One helper, `account_label(txn)`, returns `"Paid by <tab name>"` and the
  tab id for a cost half, and the account name otherwise. It is used by:
  - `_recent_row`
  - the spending cell view (rows and the header's `accounts`)
  - the budget sheet's endpoint
- Recent transactions exclude rows that have `covered_cost`, so the tab
  half never shows. Covered rows always show the label.
- The frontend renders the label as a link to `/tabs/<id>`. It shows no
  edit affordance and never shows "part of".

### 6. UX (from the UI Designer and UX Architect reviews)

```
 Sarah                                         [ + Sarah paid for... ]   <- outline sm, hidden while form open
 You owe Sarah €5.00
 open since 3 Oct
+--------------------------------------------------------------------+
| 3 Oct   Pizzeria                              lent     €10.00      |
|         part of €20.00                        owes €10.00          |
| 11 Nov  Sushi Palace                [rcpt]    covered  €15.00      |
|         Takeout                               you owe €5.00        |
|- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - |
| + Sarah paid for something                    <- dashed ghost row  |
+--------------------------------------------------------------------+

 form, wide:                               form, phone:
 [€  15.00] [Sushi Palace......] [11 Nov]  [€  15.00 ] [11 Nov     ]
 [Takeout v.............]                  [Sushi Palace...........]
 → You'll owe Sarah €5.00                  [Takeout v..............]
 [Delete]            [Cancel] [Add]        → You'll owe Sarah €5.00
                                           [Delete]   [Cancel] [Add]
```

- **One form, two triggers.**
  - The form lives inside the rows card, after the list, in a
    `border-t border-border pt-3` block. It doesn't nest a second
    bordered box.
  - The header button (`Button variant="outline" size="sm"` with `Plus`)
    scrolls to it and opens it. On wide screens the button sits right of
    the header; on a phone it wraps below "open since".
- **Field order and defaults.**
  - Amount comes first and has focus. It is unsigned, with the € prefix
    from `SplitEditor`.
  - Then payee, then the category (`CategoryCombobox` with assignable
    categories minus tabs, no default), then the date (defaults to today).
- **Preview line.**
  - A `role="status"` line: "→ " plus a future-tense sentence ("You'll
    owe Sarah €5.00", "Sarah will owe you €5.00", "Settled"), coloured
    with `TONE_CLASS`.
  - It is empty until an amount is typed.
  - It comes from a new `tabPreviewSentence` in `lib/tabs.js`.
- **Keyboard.** Enter saves when the picker is closed. Escape closes the
  picker first, then cancels the form.
- **Covered row.**
  - The verb is "covered". "paid" and "repaid" look too alike, and "Sarah
    paid" would repeat the name.
  - The subtitle is the category, plus notes when there are any.
  - A small muted `Receipt` icon marks the row. There is no tint and no
    income colour.
  - The row has no "Settled outside…" control.
- **Edit and delete.**
  - Clicking a covered row swaps it for the same form, prefilled, with
    Save in place of Add.
  - The preview counts from the balance without the row.
  - Delete sits bottom-left and uses the inline confirm from
    `confirmUnsplit`: "Delete this and its Takeout expense?" with
    [Delete] (destructive) and [Keep] (ghost).
  - Only one form is open at a time.
- **After a save.**
  - Reload the tab with `load()` and show `toast.success`.
  - If the new row falls into a collapsed stretch, expand the earlier
    rows and briefly highlight it.
- **Errors.**
  - Field errors appear inline (amount above zero, category required),
    and Save stays disabled until both are valid.
  - On a server error, keep everything typed and show a toast.

### 7. Balance tile

The cost half counts as money out in the overview's month change, like
the restaurant half of a split already does. The tile shows the month's
economics, not only bank movement. No spec change is needed:
`counted_transactions()` already includes it.

## Risks / Trade-offs

- **A new account-listing call site forgets `.visible()`, and "Paid by
  others" leaks into a list.** → A test per listing endpoint asserts the
  off-bank account is absent, and a comment on `Account.is_off_bank`
  names the rule.
- **A generic endpoint edits half of a pair.** → The guards in decision 4
  are covered by tests on update, bulk categorize and split.
- **Archiving or deleting the off-bank account through the admin.** → Not
  offered in the UI. `covered.py` re-creates the account if it is
  missing, but entries inside a deleted account cascade away. The admin
  is out of scope.
- **Restoring a backup** carries `is_off_bank` and the self link through
  the generic field copying in `backup/format.py`. A round-trip test
  confirms it.

## Migration Plan

- Two additive migrations: `accounts` (`is_off_bank`) and `transactions`
  (`covered_tab_row`). There is no data migration; the account is created
  on first use.
- Rollback: delete any covered entries first, then reverse the
  migrations.
