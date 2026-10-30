# Forecasting Specification

## Purpose

Forecasting projects an account's future balance forward in time from its
current balance and the user's defined recurring transactions, so the
user can see upcoming cash flow before it happens.

## Requirements

### Requirement: Define recurring transaction
The system SHALL allow the user to define a recurring transaction with an
account, an amount, a payee or description, an optional category, a
frequency (weekly, biweekly, monthly, or yearly), a start date, and an
optional end date.

#### Scenario: Define a monthly bill
- **WHEN** the user defines a recurring transaction for "Rent" of
  -1500.00 on "Main Checking", monthly, starting the 1st of next month,
  with no end date
- **THEN** the system creates the recurring definition and includes it in
  future forecasts for that account

#### Scenario: End date stops future occurrences
- **WHEN** a recurring transaction has an end date in the past relative
  to the forecast horizon
- **THEN** no occurrences of it appear in the forecast beyond that end
  date

### Requirement: Edit and delete recurring transaction
The system SHALL allow the user to edit a recurring transaction's amount,
frequency, category, or end date, and to delete it.

#### Scenario: Update a recurring amount
- **WHEN** the user changes a recurring "Rent" transaction's amount from
  -1500.00 to -1550.00
- **THEN** forecasts generated after the change use -1550.00 for all
  future occurrences

#### Scenario: Delete a recurring transaction
- **WHEN** the user deletes a recurring transaction
- **THEN** no further occurrences of it appear in any forecast, and past
  actual transactions already in the ledger are unaffected

### Requirement: Project account balance forward
The system SHALL generate a forecast for an account that projects its
balance forward over a user-selected horizon by applying the current
balance plus every scheduled occurrence of its recurring transactions
after today and within that horizon, in date order. An occurrence due
today SHALL NOT be applied, since it may already be in the balance.

#### Scenario: Forecast with a single recurring bill
- **WHEN** an account has a current balance of 2000.00 and a single
  monthly recurring transaction of -1500.00 due in 10 days, and the user
  requests a 30-day forecast
- **THEN** the forecast shows the balance unchanged for the next 10 days,
  dropping to 500.00 on the due date, and remaining 500.00 through day 30

#### Scenario: Forecast combines multiple recurring transactions
- **WHEN** an account has multiple recurring transactions (bills and
  income) with occurrences falling inside the forecast horizon
- **THEN** the forecast applies every occurrence in date order and
  reflects their cumulative effect on the balance at each point

#### Scenario: An occurrence due today is left out
- **WHEN** an account has a balance of 2000.00 and a monthly recurring
  transaction of -1500.00 due today
- **THEN** the forecast stays at 2000.00 today and applies the next
  occurrence next month

### Requirement: Forecast is a projection, not a reconciliation
The system SHALL treat forecast occurrences as projected only. An actual
transaction later recorded in the ledger (manually or via import) SHALL
NOT be automatically matched or merged with a projected recurring
occurrence.

#### Scenario: Actual transaction does not remove a projected occurrence
- **WHEN** the user records an actual "Rent" transaction for a date that
  a recurring definition had projected
- **THEN** that projected occurrence is not automatically removed from
  the recurring definition's schedule, and the next forecast continues to
  project future occurrences from the recurring definition

### Requirement: Recurring-transaction form uses the searchable category picker
The form for defining and editing a recurring transaction SHALL use the
searchable category picker (see the `category-picker` capability) for its
optional category. Its "no category" option is "Uncategorized", and
subcategories are shown with their parent. The form SHALL NOT offer to
create a category.

#### Scenario: Pick a recurring transaction's category by typing
- **WHEN** the user defines a recurring "Rent" transaction, types "hous"
  in the category field, presses Tab and submits
- **THEN** the recurring definition is saved with the "Housing" category

#### Scenario: Leave a recurring transaction uncategorized
- **WHEN** the user opens the category field without typing and chooses
  "Uncategorized"
- **THEN** the recurring definition is saved with no category

### Requirement: A loan is projected along its schedule
The forecast of a loan account with a loan setup SHALL start from its
current balance and, on each installment date after today within the
horizon, take minus that installment's balance after. Recurring
transactions on that loan account SHALL NOT be applied. A loan account
without a setup SHALL be forecast like any other account.

#### Scenario: The mortgage over the next months
- **WHEN** "Mortgage" stands at -199,549.03 on 12 November, and its next
  installments on 2 December and 2 January leave 199,096.95 and
  198,643.76, and the user asks for a 90-day forecast
- **THEN** the forecast shows -199,549.03 until 1 December, -199,096.95
  from 2 December and -198,643.76 from 2 January

#### Scenario: After the last installment
- **WHEN** the last installment falls inside the horizon
- **THEN** the forecast shows 0.00 from that date on

#### Scenario: A loan without a setup
- **WHEN** a loan account has no setup and a recurring transaction of
  +500.00 a month
- **THEN** its forecast applies the recurring transaction as for any
  account

### Requirement: A loan's installments leave its paying account
The forecast of an account that pays a loan SHALL take each installment's
payment on its date, after today and within the horizon. A recurring
transaction on that account with the loan's payment category, or for
exactly the payment's amount, SHALL count as that payment, so it is
applied only once.

#### Scenario: Installment on the paying account
- **WHEN** "Checking" pays a loan with a 900.00 installment in 10 days and
  has no recurring transaction for it
- **THEN** its forecast drops by 900.00 on that date

#### Scenario: A recurring transaction already covers it
- **WHEN** "Checking" also has a monthly recurring transaction of -900.00
- **THEN** its forecast drops by 900.00 once a month, not twice
