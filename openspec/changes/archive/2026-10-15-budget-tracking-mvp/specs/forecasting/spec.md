# Spec Delta

## Purpose

Forecasting projects an account's future balance forward in time from its
current balance and the user's defined recurring transactions, so the
user can see upcoming cash flow before it happens.

## ADDED Requirements

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
within that horizon, in date order.

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
