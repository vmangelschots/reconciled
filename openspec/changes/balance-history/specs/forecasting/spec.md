# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
