# Design

## Context

Value adjustments (`transactions/adjustments.py`) already do the hard
part. An adjustment row stores the value it holds
(`adjustment_value_cents`), and `recompute_adjustments` resets every
adjustment's amount whenever anything earlier in the account changes. It
runs from save/delete signals, or is called directly after bulk writes.
Adjustments are already left out of reports, Review, categorization,
duplicate detection and transfer matching through `is_adjustment`.

Transfers (`transactions/transfers.py`) already match "opposite amount
within `TRANSFER_MATCH_DAYS` = 5, closest date, lowest id breaks ties",
with split transactions and adjustments excluded.

The app has no background jobs, so anything that "happens on a date" has
to happen on a request.

## Goals / Non-Goals

**Goals:**
- The schedule is a pure function of the terms. Nothing about it is
  stored except what was actually posted.
- A single sync function brings a loan up to date. It is idempotent and
  safe to call on every read.
- Posting and unposting go through the existing adjustment machinery,
  so balances, exclusions and backups need no new rules.

**Non-Goals:**
- Storing several rate periods. The terms are their own model so that
  revisions can be added later as more rows or a child model, without
  reshaping `Transaction`.
- Rendering the schedule server-side or caching it.

## Decisions

### `accounts.Loan` holds the terms; the schedule is computed
`Loan` is one-to-one with a loan `Account` (`on_delete=CASCADE`). It
holds:

- `principal_cents`
- `annual_rate`: `DecimalField(max_digits=7, decimal_places=4)`, as a
  percentage, so `3.0000`
- `term_months`
- `first_payment_date`
- `paid_from`: FK to `Account`, `PROTECT`
- `payment_category`: nullable FK to `Category`, `SET_NULL`
- `setup_date`

`setup_date` is set on create and kept on edit, so a repost lines up on
the same day.

`transactions/loans.py:schedule(loan)` returns a list of installments
(`number`, `date`, `payment_cents`, `interest_cents`, `principal_cents`,
`balance_after_cents`). The arithmetic uses `Decimal` with
`ROUND_HALF_UP` to the cent:

- monthly rate `i = (1 + r/100) ** (Decimal(1) / 12) - 1`, at the default
  28-digit precision
- payment `P·i / (1 - (1+i)^-n)`, or `P / n` when `r = 0`
- each month: `interest = round(balance·i)` and
  `principal = payment - interest`
- the last month: `principal = balance` and
  `payment = interest + balance`

Dates are `first_payment_date + relativedelta(months=k)`, always counted
from the first date and not chained, so 31 January gives 28 February and
then 31 March, not 28 March.

Storing the table was the alternative. It was rejected because it can't
disagree with the terms if it is never stored, and 600 rows compute in
well under a millisecond.

### Scheduled adjustments are marked on `Transaction`
Three nullable fields and a flag:

- `loan`: FK to `Loan`, `SET_NULL`. Set means "posted by a schedule".
- `loan_installment`: positive integer, with `0` for the line-up.
- `loan_payment`: one-to-one to `Transaction`, `CASCADE`, the matched
  payment. Its reverse name is `loan_adjustment`.
- `loan_linked_by_hand`: boolean, default false. True for a payment the
  user linked with "Link payment".

Constraints:

- A conditional `UniqueConstraint(loan, loan_installment)` where `loan`
  is not null. It stops two concurrent reads from posting the same
  installment twice. The loser's `IntegrityError` is caught, and the
  sync moves on.
- The one-to-one on `loan_payment` stops a payment from matching twice.

Why these choices:

- `CASCADE` on `loan_payment` makes "payment deleted → adjustment
  removed" free. The adjustment's `post_delete` then runs
  `recompute_adjustments` through the existing signal.
- `SET_NULL` on `loan` makes "remove setup → adjustments become
  ordinary" free. The remove endpoint also clears `loan_installment` so
  the rows really look ordinary.

A separate `LoanPosting` join model was the alternative. It was rejected
because it adds a model to back up and join, for four columns.

### One sync function, called on reads and after imports
`sync_loan(loan, today)`:

1. **Drop stale matches.** For each of the loan's adjustments with a
   `loan_payment`, delete the adjustment if the payment is now a
   transfer or now split. For automatic matches only, also delete it if
   the payment moved out of `paid_from` or its amount no longer equals
   minus the installment's payment. Hand links survive those, because
   the user chose them knowing the amount. Deleting a payment needs
   nothing here, because the CASCADE already took the adjustment with
   it.
2. **Match due installments.** For each installment dated on or after
   `setup_date` and on or before `today + 5 days` that has no adjustment,
   look for its payment with the transfer-style lookup:
   - in `paid_from`, `counted_rows().ledger_rows().excluding_adjustments()`
   - `transfer_counterpart` null
   - not already a `loan_payment`
   - exact amount, within ±5 days
   - closest date, then lowest id

   A payment can be booked a few days before the installment date, so
   installments up to five days ahead are checked too.
3. **Post the match.** Create the adjustment (date = payment's date,
   `adjustment_value_cents = -balance_after`, `loan`, `loan_installment`,
   `loan_payment`), and apply the payment category (next decision).
   Then call `recompute_adjustments(loan.account_id)` once at the end.

`sync_loans(today)` runs `sync_loan` for every loan whose account is
active. Each loan is synced in its own `atomic` block.

Call sites:

- the overview view
- `TransactionViewSet.list` (any ledger)
- the loan endpoint's GET
- the end of the import `commit` action

These are the reads the spec names. The writes that can unmatch a
payment (edit, split, transfer marking) don't call sync themselves: the
next read fixes it, and every page that shows the loan is one of those
reads. That keeps sync out of every write path, at the cost of a stale
row in API responses until the next read. Calling sync from the
transaction save signal was the alternative. It was rejected because the
signal also fires inside imports, restores and the sync itself.

### The line-up is installment 0, posted by setup and by repost
Setup creates `Loan`, then posts installment 0 on `setup_date` with
value `-balance_after` of the last installment dated before
`setup_date`, or `-principal` if there is none. Then it runs
`sync_loan`.

If an ordinary adjustment already sits on `setup_date` (from Set value),
the line-up replaces it, the same way Set value replaces on the same
day. A value set by hand that day is superseded by the schedule.

**Edit** compares the new terms with the old ones.

- If only `payment_category` or `paid_from` changed, it saves and syncs.
  Existing matches stay. Future matches look in the new paying account.
- Otherwise it is a repost:
  1. Delete every automatic adjustment with `loan = this`, the line-up
     included.
  2. Save the terms.
  3. Post the line-up again.
  4. For each hand-linked adjustment, update its value to the new
     schedule's `-balance_after`. Delete it if its installment no longer
     exists because the term got shorter.
  5. Sync. Payments that no longer equal the new payment simply don't
     match.

The edit form gets its warning from the preview endpoint (below), which
dry-runs the repost: the number of installments that will be reposted,
and how many current automatic matches would fail the new amount.

### Categorizing the matched payment is confirmed, not a guess
The exploration said "auto, like the existing guesses". An unconfirmed
guess would put the mortgage in Review every month, though, and the
match is stronger evidence than any history guess: an exact amount, on
the account named in the setup, on the scheduled date. So a matched
payment with no category, or an unconfirmed one, gets
`category = payment_category`, `category_confirmed = True`,
`category_source = manual`. A confirmed category is never touched. The
payment category can't be a tab group. The existing category validation
already rejects that.

### Guards
- `TransactionViewSet.destroy` rejects a row with `loan` set: "This
  adjustment belongs to the loan schedule. Change the loan's terms
  instead."
- `set_value` raises `AdjustmentError` when the date's existing
  adjustment has `loan` set.
- The existing "an adjustment can't be edited / split / categorized"
  guards already cover scheduled ones.
- The serializer exposes `loan_installment` and `loan_term_months`, so
  the ledger can say "Installment 24 of 300" or "Schedule start". For a
  matched payment it exposes `loan_match`
  (`{loan_account_id, loan_account_name, installment}`) through the
  `loan_adjustment` reverse relation, for the tag on the payment's row.
- `link_transfer` raises `TransferError` when the target account has a
  loan whose `paid_from` is the transaction's account. The category
  picker gets the same rule from a `loan_paid_from` id on each account
  in the accounts payload, which also carries `has_loan` for the ledger
  header.

### Missed payments come with the overview
The overview's attention data gains
`missed_loans: [{account_id, name, date, installment, term_months,
payment_cents, paid_from_name}]`, which fills the item's second
line. For each loan, after sync,
it takes the latest installment with `date < today - 5 days` and
`date ≥ setup_date`. The loan is listed when that installment has no
adjustment. Only the latest one is checked, which gives the spec's "a
later match clears it".

### The loan endpoints
`/api/accounts/{id}/loan/`:

- `GET`: syncs first. Returns the terms (or 404 when there is no setup)
  and `installments` with `state ∈ {before_setup, posted, due, missed,
  upcoming}`. Posted installments carry the payment's id, date and
  account, and whether the link was made by hand.
- `PUT`: creates or edits.
- `DELETE`: removes.

`POST /api/accounts/{id}/loan/preview/` takes the same body as `PUT` and
saves nothing. It returns:

- `payment_cents`
- the next installment's number and date
- `schedule_balance_today_cents` next to the account's
  `current_balance_cents`
- `found_payments`: up to three outflows of exactly the payment in
  `paid_from` over the last 90 days
- for an existing setup, the repost counts

The form calls it, debounced, as the user types.

`/api/accounts/{id}/loan/installments/{n}/`:

- `GET candidates/` lists outflows within ±15 days in any active
  non-loan account. Transfers, splits, adjustments and other loans'
  payments are left out. They are ordered by
  `|amount + payment|`, then by date distance.
- `POST link/ {transaction}` posts the installment with
  `loan_linked_by_hand = True`. It is rejected when the installment is
  already posted or before setup, or the transaction isn't a candidate.
- `DELETE link/` unlinks a hand link and removes its adjustment.
  Automatic matches can't be unlinked, because they would rematch on
  the next read.

Validation for `PUT` and `preview/`:

- the account must be an active loan
- `paid_from` must be active, not a loan and not this account
- `principal > 0`, `rate ≥ 0`, `1 ≤ term ≤ 600`

### The schedule page
A route `transactions/:accountId/schedule` with `LoanSchedulePage`. It
follows the TabPage layout: a back link to the ledger, the loan's name,
then "€199,549 still owed" large and a muted terms line, with Edit as an
outline button.

**Setup and edit.** These use a Panel, not a Dialog, because there are
six fields plus the preview. The parts:

- a "%" suffix on the rate field
- the term shown as "300 months (25 years)"
- the category picker for the payment category
- the paying account defaulting to the only everyday account when there
  is just one
- the live preview block, and in edit mode the repost warning
- Remove: a ghost button inside the edit form, with a confirm dialog
  saying the posted adjustments stay as ordinary ones

**Table.** From `sm` up, the columns are Date · Interest · Principal ·
Balance after · State. The payment is in the header, and only the last
installment shows its own. Below `sm`, each installment is a two-line
row in the style of `TabRow`: date and state on the left, balance after
with "interest · principal" on the right.

States use the existing tokens, never the money colours:

- Posted: a `Check` icon in `text-ink-secondary` with "Posted 4 Nov",
  and "Unlink" for a hand link
- Due: a `Clock` icon in `text-ink-muted`, on the current row, which
  also gets `bg-surface-2` and the ledger's inset accent bar
- Missed: an `AlertTriangle` icon with "Missed" in `text-warning`, and
  "Link payment"
- upcoming rows: blank

The rows before setup sit muted behind a `SettledDivider`-style "Set up
20 Oct" line.

"Link payment" is offered on Due and Missed rows. It opens a small list
of candidates, each showing date, payee, account and amount.

Windowing is client-side over the full list: the last 2 posted rows, the
current row and the next 12, with "Show earlier (N installments)" above
and "Show all (N more, to Nov 2049)" below. The Needs attention link
passes `?installment=N` so that row is in the window.

**Ledger header.** A loan without a setup shows "Set value" and an
outline "Set up schedule". With a setup it shows only "Schedule".

**Rows.** A scheduled adjustment shows "Installment 24 of 300" or
"Schedule start" in the category cell, as a link. A matched payment gets
a small muted "Mortgage · installment 24" tag next to its payee.

### The forecast swaps the recurring path for the schedule
`generate_forecast` checks `hasattr(account, "loan")`. If the account
has a loan, it builds `balance_by_date` from installments after `today`:
starting from `current_balance_cents`, the running balance becomes
`-balance_after` on each installment date. Recurring transactions on the
account are ignored in that case. The response shape stays the same,
with installments listed as occurrences (payee "Installment N of M"), so
`ForecastingPage` needs no change.

### Backup
`accounts.Loan` goes into `BACKED_UP_MODELS`. The new `Transaction`
fields are nullable with defaults, so older backups load unchanged and
`FORMAT_VERSION` stays 1. Restore deserializes raw, so no signals or
sync run during it. The unique constraint makes sure a later sync can't
post an installment twice.

## Risks / Trade-offs

- **Our schedule differs from the bank's by a cent** → the exact-amount
  match fails. The setup preview shows this before saving: no payments
  found. If it slips through anyway, "Link payment" posts the month, and
  the hand link survives the amount difference. The 200,000.00 / 3.00% /
  300 example must match a real Belgian table in the tests.
- **Two loans paid from one account with the same payment** → each
  payment matches the first loan's installment it finds. With one
  mortgage this doesn't arise. It is documented, not handled.
- **The sync runs on every ledger and overview read** → the cost is one
  schedule computation plus a few small queries per loan. It's fine for
  a household with one or two loans.
- **An unmatched payment edit isn't reflected until the next read** →
  every view that shows the loan is a sync point, so the user never sees
  the stale state on screen.
- **A payment that never arrives within the window** (paid late or by
  hand) → the installment shows "Missed" with "Link payment". Even
  without a link, the next matched installment sets the loan back to the
  schedule's balance, because adjustments hold absolute values.

## Migration Plan

Two additive migrations: `accounts` (Loan) and `transactions` (three
nullable fields, a flag and the constraint). No data migration. Rolling back
means removing the setup first. Otherwise reverting the migration drops
the link fields, and the scheduled adjustments are left behind as
ordinary ones.
