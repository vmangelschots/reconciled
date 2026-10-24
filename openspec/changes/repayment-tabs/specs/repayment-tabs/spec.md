# Spec Delta

## Purpose

Tabs track money that leaves the joint account only for a while: what a
friend, an employer or the user themselves owes back. A tab is a
category in a tab group, and its balance comes from the rows assigned
to it.

## ADDED Requirements

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
The dashboard SHALL show an "Open tabs" card first, listing each open
tab with its balance sentence and open-since date, largest balance
first. Settled tabs SHALL be collapsed behind "N settled tabs", which
expands them. When no tab is open the card SHALL say all tabs are
settled. When no tab exists the card SHALL NOT be shown. Each tab in the
card SHALL open its tab page.

#### Scenario: Open tabs are listed
- **WHEN** "Employer" is owed 412.50 and "Jan" 30.00, and "Piet" is
  settled
- **THEN** the card lists "Employer owes you €412.50" then "Jan owes you
  €30.00", each with its open-since date, and "1 settled tab"

#### Scenario: Everything settled
- **WHEN** every tab is settled
- **THEN** the card says all tabs are settled and offers to show them

#### Scenario: No tabs
- **WHEN** no tab group has a subcategory
- **THEN** the dashboard shows no tabs card

#### Scenario: Open a tab
- **WHEN** the user selects "Jan" in the card
- **THEN** the "Jan" tab page opens

### Requirement: Tab page
A tab page SHALL show the tab's balance sentence and its rows oldest
first, each with its date, payee, "lent" for money out or "repaid" for
money in, its amount without a sign, and the running balance after it.
A split part SHALL be marked as part of its transaction, with that
transaction's full amount. Where the running balance reaches zero, the
page SHALL show a "Settled" divider. Only the latest stretch of rows
SHALL show until the user expands the earlier ones.

#### Scenario: Rows with a running balance
- **WHEN** "Tabs / Jan" has a -30.00 part of a -60.00 "Pizzeria" dinner on
  3 Oct and +30.00 from "JAN PEETERS" on 12 Oct
- **THEN** the page lists "Pizzeria" (part of €60.00), lent, €30.00,
  balance €30.00, then "JAN PEETERS", repaid, €30.00, balance €0.00,
  followed by a "Settled" divider

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
