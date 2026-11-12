# Repayment Tabs Specification

## Purpose
Tabs track money that leaves the joint account only for a while: what a
friend, an employer or the user themselves owes back. A tab is a
category in a tab group, and its balance comes from the rows assigned
to it.

## Requirements

### Requirement: A tab is a category in a tab group
Each subcategory of a tab group SHALL be a tab. A subcategory SHALL get
its kind from its parent, so moving it in or out of a tab group makes it
a tab or a normal category. A tab group itself SHALL NOT be given to a
transaction or a split part.

#### Scenario: A subcategory of a tab group is a tab
- **WHEN** "Tabs" is a tab group and the user adds the subcategory "Jan"
  under it
- **THEN** "Tabs / Jan" is a tab

#### Scenario: Moving a category out of a tab group
- **WHEN** the user re-parents "Tabs / Jan" under "Gifts", a normal group
- **THEN** "Gifts / Jan" is a normal category and its rows count in
  reports again

#### Scenario: A tab group can't be assigned
- **WHEN** the user tries to give the category "Tabs" itself to a
  transaction or a split part
- **THEN** the system rejects it and nothing changes

### Requirement: Tab balance
A tab's balance SHALL be the negated sum of its rows: every transaction
and split part with that category, in any account. Money out to a tab
raises what the person owes; money in lowers it. A balance of zero SHALL
mean the tab is settled.

#### Scenario: Half a dinner to a tab
- **WHEN** a -60.00 dinner is split into -30.00 "Restaurants" and -30.00
  "Tabs / Jan"
- **THEN** the "Jan" tab's balance is 30.00

#### Scenario: A repayment settles the tab
- **WHEN** "Tabs / Jan" has a -30.00 part and a +30.00 transaction from
  "JAN PEETERS" is categorized "Tabs / Jan"
- **THEN** the "Jan" tab's balance is 0.00 and the tab is settled

#### Scenario: Partial and lump-sum repayments
- **WHEN** "Tabs / Jan" has -30.00 and -45.00 rows and repayments of
  +20.00 and +40.00
- **THEN** the "Jan" tab's balance is 15.00

#### Scenario: Overpaying
- **WHEN** "Tabs / Jan" has a -30.00 row and a +35.00 repayment
- **THEN** the "Jan" tab's balance is -5.00

#### Scenario: A reimbursement inside a salary
- **WHEN** "Tabs / Employer" has a -150.00 work expense, and a +3,000.00
  salary is split into +2,850.00 "Income" and +150.00 "Tabs / Employer"
- **THEN** the "Employer" tab is settled

### Requirement: Balances are worded, never signed
Wherever the app shows a tab's balance, it SHALL show a sentence and not
a signed number: "<Tab> owes you <amount>" for a positive balance, "You
owe <Tab> <amount>" for a negative one, and "Settled" at zero. A tab
owed to the user SHALL NOT be shown in the colour used for income.

#### Scenario: Positive balance
- **WHEN** the "Jan" tab's balance is 30.00
- **THEN** it reads "Jan owes you €30.00"

#### Scenario: Negative balance
- **WHEN** the "Jan" tab's balance is -5.00
- **THEN** it reads "You owe Jan €5.00", in the warning colour

#### Scenario: Zero balance
- **WHEN** the "Jan" tab's balance is 0.00
- **THEN** it reads "Settled", muted, with a check

### Requirement: Open since
An open tab SHALL show the date it has been open since: the date of its
first row after the last time its balance was zero, or of its first row
if it never was. The date SHALL be shown in the warning colour once it
is more than 30 days ago.

#### Scenario: Open since the first row after settling
- **WHEN** "Tabs / Jan" has -30.00 on 1 Sep, +30.00 on 5 Sep and -45.00
  on 12 Oct
- **THEN** the tab is open since 12 Oct

#### Scenario: A partial repayment doesn't reset the date
- **WHEN** "Tabs / Employer" has -150.00 on 12 Sep and +100.00 on 30 Sep
- **THEN** the tab is open since 12 Sep

#### Scenario: An old open tab stands out
- **WHEN** today is 24 Oct and a tab is open since 12 Sep
- **THEN** "open since 12 Sep" is shown in the warning colour

### Requirement: Open tabs card on the dashboard
The overview SHALL show an "Open tabs" panel beside needs attention,
listing each open tab with its balance sentence and open-since date,
largest balance first. Settled tabs SHALL be collapsed behind "N settled
tabs", which expands them. When no tab is open the panel SHALL say all
tabs are settled. When no tab exists the panel SHALL NOT be shown. Each
tab in the panel SHALL open its tab page.

#### Scenario: Open tabs are listed
- **WHEN** "Employer" is owed 412.50 and "Jan" 30.00, and "Piet" is
  settled
- **THEN** the panel lists "Employer owes you €412.50" then "Jan owes you
  €30.00", each with its open-since date, and "1 settled tab"

#### Scenario: Everything settled
- **WHEN** every tab is settled
- **THEN** the panel says all tabs are settled and offers to show them

#### Scenario: No tabs
- **WHEN** no tab group has a subcategory
- **THEN** the overview shows no tabs panel

#### Scenario: Open a tab
- **WHEN** the user selects "Jan" in the panel
- **THEN** the "Jan" tab page opens

### Requirement: Tab page
A tab page SHALL show the tab's balance sentence and its rows oldest
first, each with its date, payee, "lent" for money out, "repaid" for
money in or "covered" for a covered entry, its amount without a sign, and
the running balance after it. A split part SHALL be marked as part of its
transaction, with that transaction's full amount. Where the running
balance reaches zero, the page SHALL show a "Settled" divider. Only the
latest stretch of rows SHALL show until the user expands the earlier
ones.

#### Scenario: Rows with a running balance
- **WHEN** "Tabs / Jan" has a -30.00 part of a -60.00 "Pizzeria" dinner on
  3 Oct and +30.00 from "JAN PEETERS" on 12 Oct
- **THEN** the page lists "Pizzeria" (part of €60.00), lent, €30.00,
  balance €30.00, then "JAN PEETERS", repaid, €30.00, balance €0.00,
  followed by a "Settled" divider

#### Scenario: A covered entry among bank rows
- **WHEN** "Tabs / Sarah" has a -10.00 part on 3 Oct and a 15.00 covered
  entry "Sushi Palace" on 11 Nov
- **THEN** the page lists the part, lent, €10.00, running balance "owes €10.00", then
  "Sushi Palace", covered, €15.00, running balance "you owe €5.00"

#### Scenario: Older settled stretches are collapsed
- **WHEN** the tab settled on 5 Sep and has open rows since 12 Oct
- **THEN** only the rows since 12 Oct are shown, with a control to show
  the earlier ones

#### Scenario: Unknown tab
- **WHEN** the user opens a tab page for a category that is not a tab
- **THEN** the page says the tab was not found

### Requirement: Settle a row outside the account
On a tab page, each lent row after the last "Settled" divider SHALL
offer "Settled outside the account…", which opens the category picker
for that row; rows already settled SHALL NOT offer it. Choosing a
category SHALL move the row to it, so the tab's balance drops by the
row's amount.

#### Scenario: Paid back in cash
- **WHEN** Jan paid back the 30.00 dinner part in cash, and the user
  chooses "Settled outside the account…" on it and picks "Restaurants"
- **THEN** the part's category is "Restaurants", the "Jan" tab's balance
  drops by 30.00, and the row leaves the tab page

### Requirement: Record what the tab's person paid for
A tab page SHALL let the user record a covered entry: something the tab's
person paid for on the user's behalf, outside the user's accounts. It has
an amount above zero entered without a sign, a payee, a category and a
date. Saving it SHALL add the amount to the chosen category as spending on
that date, and add the same amount to the tab as money in, so the tab's
balance drops by the amount.

#### Scenario: Takeout netted against an open tab
- **WHEN** the "Sarah" tab's balance is 10.00 and the user records that
  Sarah paid 15.00 for "Sushi Palace" in "Takeout" on 11 Nov
- **THEN** the "Sarah" tab reads "You owe Sarah €5.00", and "Takeout" has
  15.00 more spending in November

#### Scenario: Covered on a settled tab
- **WHEN** the "Sarah" tab is settled and the user records that Sarah paid
  20.00 for groceries
- **THEN** the tab reads "You owe Sarah €20.00" and is open since that
  entry's date

#### Scenario: Repaying a covered entry
- **WHEN** the "Sarah" tab reads "You owe Sarah €5.00" and a -5.00 bank
  transaction is categorized "Tabs / Sarah"
- **THEN** the tab is settled

#### Scenario: Missing amount or category
- **WHEN** the user tries to save a covered entry without an amount above
  zero, or without a category
- **THEN** nothing is saved and the field that is missing says so

### Requirement: A covered entry's category is not a tab
A covered entry's category SHALL be a category the user can assign that
is not a tab. The form's category picker SHALL NOT offer tabs or tab
groups, and the system SHALL reject a covered entry whose category is
one.

#### Scenario: Tabs are not offered
- **WHEN** the user opens the category picker in the covered entry form
- **THEN** "Tabs / Sarah", other tabs and tab groups are not listed

#### Scenario: A tab is rejected
- **WHEN** a covered entry is saved with the category "Tabs / Jan"
- **THEN** the system rejects it and nothing changes

### Requirement: Covered entry form
The tab page SHALL offer "<Tab> paid for…" in its header and as the last
line of its rows. Both SHALL open one inline form at the end of the rows,
with the amount focused, then payee, category, and a date that defaults
to today. While the form has an amount, it SHALL show the balance
sentence the tab will have after saving. Enter SHALL save, unless the
category picker is open, and Escape SHALL cancel.

#### Scenario: Open from the header
- **WHEN** the user selects "Sarah paid for…" in the header of a long tab
- **THEN** the form opens at the end of the rows, scrolled into view, with
  the amount focused, and the header action is hidden while it is open

#### Scenario: Preview while typing
- **WHEN** the "Sarah" tab's balance is 10.00 and the user types 15 as the
  amount
- **THEN** the form shows "→ You'll owe Sarah €5.00" in the warning colour

#### Scenario: Preview reaching zero
- **WHEN** the "Sarah" tab's balance is 10.00 and the user types 10 as the
  amount
- **THEN** the form shows "→ Settled", muted, with a check

#### Scenario: Empty tab
- **WHEN** a tab has no rows
- **THEN** the page says nothing is on the tab yet and offers "<Tab> paid
  for…" as its last line

### Requirement: Covered rows on the tab page
A covered entry SHALL be listed on its tab page as one row with its date,
payee, "covered" and its amount without a sign, its category, and a mark
that tells it apart from bank rows, in the same running balance as the
tab's other rows. It SHALL NOT offer "Settled outside the account…".

#### Scenario: A covered row
- **WHEN** Sarah paid 15.00 for "Sushi Palace" in "Takeout" on 11 Nov and
  the balance before it was 10.00
- **THEN** the row reads "Sushi Palace", "Takeout", covered, €15.00, and
  its running balance reads "you owe €5.00"

#### Scenario: A backdated entry is shown
- **WHEN** the user saves a covered entry dated before the last "Settled"
  divider
- **THEN** the earlier rows are expanded and the new row is highlighted

### Requirement: Edit and delete a covered entry
Selecting a covered row on its tab page SHALL turn it into the covered
entry form, filled in with the row's details. The preview SHALL count
from the balance without the row. Saving SHALL change both halves of the
entry. The form SHALL offer Delete, which first asks to confirm inline
and then removes both halves. Only one form SHALL be open on the page at
a time.

#### Scenario: Change the amount
- **WHEN** the user edits the 15.00 "Sushi Palace" entry to 12.00
- **THEN** "Takeout" has 12.00 for it and the tab's balance rises by 3.00

#### Scenario: Delete both halves
- **WHEN** the user deletes the "Sushi Palace" entry and confirms
- **THEN** the row leaves the tab page, the tab's balance rises by 15.00,
  and "Takeout" no longer counts it

#### Scenario: Keep on second thought
- **WHEN** the user selects Delete and then Keep
- **THEN** nothing changes and the form stays open

### Requirement: Covered entries elsewhere
Outside its tab page, a covered entry SHALL be listed only by its cost
half, with "Paid by <Tab>" where an account name goes, named after the
tab's current name and linking to the tab page. It SHALL NOT be shown as
part of a split and SHALL NOT be editable there.

#### Scenario: In a report's transactions
- **WHEN** the user opens the November "Takeout" cell in the spending
  report
- **THEN** the sheet lists "Sushi Palace" -15.00 with "Paid by Sarah", and
  no row for the tab half

#### Scenario: Renaming the tab
- **WHEN** the user renames the tab "Sarah" to "Sarah V."
- **THEN** the entry shows "Paid by Sarah V." everywhere

### Requirement: A tab with covered entries stays a tab
A tab that has covered entries SHALL NOT be moved out of its tab group,
and the tab half of a covered entry SHALL NOT be given a category that is
not a tab. Like any category with rows, such a tab SHALL only be deleted
once its covered entries are gone.

#### Scenario: Moving it out is refused
- **WHEN** the "Sarah" tab has a covered entry and the user re-parents it
  under "Gifts"
- **THEN** the system rejects the move and says the tab has covered
  entries

#### Scenario: The tab half stays on a tab
- **WHEN** a request gives the tab half of a covered entry the category
  "Restaurants"
- **THEN** the system rejects it and nothing changes

#### Scenario: Deleting the tab
- **WHEN** the user deletes the "Sarah" tab while it has a covered entry
- **THEN** the system refuses, as for any category with rows, until the
  entry is deleted
