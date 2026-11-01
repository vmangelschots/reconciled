# portfolio-value-import Specification

## Purpose

Lets the user set an investment account's value from a Portfolio Performance
export, so net worth stays current without Reconciled tracking the portfolio.

## Requirements

### Requirement: Import a portfolio on an investment account
An active investment account SHALL offer "Import portfolio" beside "Set value",
taking an XML export from Portfolio Performance. Other account types and
archived accounts SHALL NOT offer it, and the system SHALL reject an import
for them.

#### Scenario: Offered on an investment account
- **WHEN** the user opens the ledger of "Portfolio" (investment)
- **THEN** the header offers "Set value" and "Import portfolio"

#### Scenario: Not offered on a house
- **WHEN** the user opens the ledger of "House" (property)
- **THEN** the header offers "Set value" and no "Import portfolio"

#### Scenario: Not offered on an archived account
- **WHEN** the user opens the ledger of an archived investment account
- **THEN** there is no "Import portfolio"

#### Scenario: Rejected on another type
- **WHEN** a portfolio import is requested for a checking account
- **THEN** the system rejects the request and the account is unchanged

### Requirement: Value worked out from the file
The system SHALL work out each holding's shares from every portfolio's
transactions and value them at the holding's latest price, rounding each
holding to the cent, and SHALL work out each cash account's balance from its
transactions. Holdings with no shares left SHALL NOT count.

#### Scenario: Two holdings and a cash account
- **WHEN** a file shows 10 shares of "World" priced 100.00 and 4 of "Emerging"
  priced 50.00, and "Broker" holding 40.75 in cash
- **THEN** the holdings total 1,200.00 and "Broker" is listed with 40.75

#### Scenario: Shares bought and sold
- **WHEN** a holding was bought 10 times 2 shares, and 5 shares were sold and
  3 moved to another portfolio in the same file
- **THEN** it counts 15 shares

#### Scenario: Everything in a holding was sold
- **WHEN** every share of "Old fund" was sold and it has no price
- **THEN** it doesn't count and the file is read normally

#### Scenario: Latest price is the newest one
- **WHEN** a holding's newest price, 30 October, is held apart from its
  price history, which ends on 29 October
- **THEN** the 30 October price is used

#### Scenario: Two prices on the same date
- **WHEN** a holding's separate newest price and its price history both have an
  entry for 30 October, at different prices
- **THEN** the separate newest price is used

#### Scenario: An account first named inside a transfer
- **WHEN** a cash account is only described in the file inside a transfer from
  another account
- **THEN** it is listed with its balance like any other cash account

### Requirement: Preview before saving
After a file is read, the system SHALL show the holdings total, each cash
account with a non-zero balance and a checkbox, the newest and oldest price
dates of the holdings, the resulting value and the account's current balance.
Nothing SHALL be saved until the user confirms.

#### Scenario: Preview of a file
- **WHEN** the file holds 20,000.00 in holdings priced from 29 October to 1
  November, "Broker" holds 40.75, and the account's balance is 18,000.00
- **THEN** the preview shows those figures, the value 20,040.75, and that the
  value will be dated 1 November

#### Scenario: Unticking changes the value
- **WHEN** the user unticks a cash account of 5,000.00 in the preview
- **THEN** the value shown drops by 5,000.00

#### Scenario: A cash account with nothing in it
- **WHEN** "Old broker" has a balance of 0.00
- **THEN** it is not listed

#### Scenario: Closing the preview
- **WHEN** the user closes the preview without saving
- **THEN** the account and its ledger are unchanged

### Requirement: Saving sets the account's value
Confirming SHALL set the account's value as a value adjustment, dated the
newest price date of the holdings, or today when the file has no holdings or
that date is in the future. It SHALL follow "Set an account's value", including
replacing an adjustment on the same date.

#### Scenario: Value dated by its prices
- **WHEN** the newest price is from 1 November and the user confirms on 3
  November with a value of 20,040.75
- **THEN** a value adjustment dated 1 November set to 20,040.75 is recorded

#### Scenario: Uploading twice
- **WHEN** the user imports a file, then imports another with the same newest
  price date and a different value
- **THEN** the ledger has one adjustment on that date, set to the second value

#### Scenario: An older file
- **WHEN** the account has a value set on 15 October and the user imports a
  file whose newest price is from 1 October
- **THEN** the preview says a later value keeps the balance as it is, and
  saving records the 1 October value and leaves the balance unchanged

### Requirement: Cash accounts left out are remembered
The system SHALL remember, per Reconciled account, which cash accounts in the
file the user left out, and SHALL untick them in the next preview. A cash
account not seen before SHALL be ticked. A backup SHALL carry this choice.

#### Scenario: The next upload
- **WHEN** the user unticked "Savings" on the last import and uploads a
  newer export
- **THEN** "Savings" is listed unticked and not in the value

#### Scenario: A renamed cash account
- **WHEN** "Savings" was renamed in Portfolio Performance since the last
  import
- **THEN** it is still unticked

#### Scenario: A new cash account
- **WHEN** the newer export has a cash account not in the last one
- **THEN** it is listed ticked

#### Scenario: Remembered only on saving
- **WHEN** the user unticks a cash account and closes the preview without saving
- **THEN** the next preview shows it as it was before

### Requirement: Files that can't be read in full are refused
The system SHALL refuse a file it can't account for completely, saying why, and
SHALL NOT offer a value for it. That covers a file that isn't a Portfolio
Performance XML export, a format version older than 70, a transaction of an
unknown type, a transaction outside every portfolio and cash account, and a
holding left with negative shares.

#### Scenario: An encrypted file
- **WHEN** the user uploads a password-encrypted `.portfolio` file
- **THEN** the system says it can only read XML and to save the file as XML in
  Portfolio Performance first

#### Scenario: An unknown transaction type
- **WHEN** the file has a transaction of a type the system doesn't know
- **THEN** the file is refused, naming the type

#### Scenario: A transaction left out
- **WHEN** the file has a transaction in no portfolio or cash account
- **THEN** the file is refused and no value is offered

#### Scenario: Too large
- **WHEN** the file is larger than 25 MB
- **THEN** the file is refused before it is read

### Requirement: Only euro values
The system SHALL refuse a file whose base currency isn't euro, or that has a
holding or a cash account with a balance in another currency, naming it.

#### Scenario: A dollar holding
- **WHEN** a held security is priced in USD
- **THEN** the file is refused, naming that holding

#### Scenario: A sold dollar holding
- **WHEN** a security priced in USD has no shares left
- **THEN** the file is read normally

### Requirement: A holding without a price is refused
The system SHALL refuse a file in which a holding with shares has no price,
naming the holding.

#### Scenario: No price yet
- **WHEN** a holding with 4 shares has no price in the file
- **THEN** the file is refused, naming that holding

### Requirement: The file is not kept
The system SHALL NOT store an uploaded file or anything read from it, other than
the value set and the ids of the cash accounts left out. A file SHALL be read
as data only: it SHALL NOT be able to load other files or reach the network.

#### Scenario: After an import
- **WHEN** an import is saved
- **THEN** no holding, trade, price or copy of the file remains in the system,
  and the ledger shows one value adjustment

#### Scenario: A file pointing outside itself
- **WHEN** a file declares an external entity pointing at a server file
- **THEN** the file is refused and nothing from that server file is read

### Requirement: Imports stay within the household
A portfolio import SHALL only reach accounts of the user's own household.

#### Scenario: Another household's account
- **WHEN** a user requests an import for an account of another household
- **THEN** the system answers as if the account doesn't exist
