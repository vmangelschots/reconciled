# Spec Delta

## ADDED Requirements

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
