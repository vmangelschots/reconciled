# Spec Delta

## Purpose

Lets AI assistants and other MCP clients read a household's budget,
transactions and reports through a Model Context Protocol endpoint, with the
same figures the app's pages show and no way to change anything.

## ADDED Requirements

### Requirement: An MCP endpoint
The app SHALL offer an MCP server at `/mcp` on its own host, using MCP's
Streamable HTTP transport. A client SHALL be able to initialize, list the
tools and call them, with each request answered on its own. The server SHALL
NOT open event streams and SHALL NOT keep sessions between requests.

#### Scenario: Connecting a client
- **WHEN** an MCP client configured with the endpoint URL and a valid token
  initializes
- **THEN** the server answers with its name, version and tool support, and
  the client can list and call the tools

#### Scenario: Asking for an event stream
- **WHEN** a client asks the endpoint for an event stream
- **THEN** the request is refused as not supported, and the client carries
  on with plain requests

### Requirement: Protocol version
The server SHALL answer an initialize request with the protocol version the
client asked for when the server supports it, and otherwise with the newest
version it supports.

#### Scenario: A supported version
- **WHEN** a client initializes asking for a protocol version the server
  supports
- **THEN** the server answers with that version

#### Scenario: An unknown version
- **WHEN** a client asks for a version the server doesn't know
- **THEN** the server answers with the newest version it supports

### Requirement: Requests need a token
Every request to the endpoint SHALL carry a valid personal access token as a
bearer token (see access-tokens). Without one, or with a revoked or unknown
token, the request SHALL be refused as unauthorized before anything is read,
and the answer SHALL say a bearer token is expected.

#### Scenario: No token
- **WHEN** a client calls the endpoint without an Authorization header
- **THEN** it is refused as unauthorized and nothing is read

#### Scenario: A signed-in browser session
- **WHEN** a request carries a signed-in session cookie but no token
- **THEN** it is refused as unauthorized

### Requirement: Foreign web pages can't use the endpoint
A request that comes from a web page on another site SHALL be refused, even
with a valid token. Requests from MCP clients that don't send an Origin, and
from the app's own origin, SHALL be accepted.

#### Scenario: A page on another site
- **WHEN** a request with a valid token carries an Origin header from a site
  other than the app's own
- **THEN** it is refused and nothing is read

### Requirement: Nothing can be changed through the endpoint
The server SHALL offer only tools that read. No tool call SHALL create,
change or delete anything the household entered or set up. The app's own
catch-up of due loan installments SHALL run before a tool reads, the same as
when a page loads, so tools and pages agree.

#### Scenario: Listing tools
- **WHEN** a client lists the tools
- **THEN** every tool is marked read-only, and none of them adds, edits,
  categorizes or deletes anything

#### Scenario: An installment fell due
- **WHEN** a loan installment fell due today and nobody has opened the app
  since, and a client asks for the account balances
- **THEN** the installment is booked as it would be on a page load, and the
  balances match what the Accounts page will show

### Requirement: One household per request
Every tool SHALL read only the household of the token used. Nothing from any
other household SHALL be returned, including through ids.

#### Scenario: An id from another household
- **WHEN** a client using a token for one household asks for a transaction
  by an id that belongs to another household
- **THEN** the tool answers that the transaction doesn't exist, as for an id
  that never existed

### Requirement: Amounts, dates and months
Tools SHALL give amounts as decimal strings with the currency code, with a
minus for money going out (for example "-42.50 EUR"). Dates SHALL be ISO
dates ("2026-11-19") and months "YYYY-MM". Tools that take a month SHALL use
the current month when none is given.

#### Scenario: An expense
- **WHEN** a tool returns a transaction of 42.50 euro going out
- **THEN** its amount reads "-42.50 EUR"

#### Scenario: No month given
- **WHEN** a client asks for the budget without a month in November 2026
- **THEN** the tool returns November 2026's budget

### Requirement: Clear errors
A tool call with invalid arguments, an unknown tool or an id that doesn't
exist SHALL return an error result with a short message saying what was
wrong, so the assistant can correct its call. Nothing SHALL be read for a
call with invalid arguments.

#### Scenario: A bad month
- **WHEN** a client asks for the budget of month "2026-13"
- **THEN** the call returns an error saying the month must be a valid
  "YYYY-MM"

#### Scenario: An unknown tool
- **WHEN** a client calls a tool that doesn't exist
- **THEN** the server answers that the tool is unknown

### Requirement: Tools describe themselves
Each tool SHALL have a description and an input schema that tell an
assistant what it returns, which arguments it takes, and how the figures are
counted (for example that a parent's budget covers its subcategories). The
descriptions SHALL use the app's own terms.

#### Scenario: Reading the tool list
- **WHEN** a client lists the tools
- **THEN** each tool has a description and a schema for its arguments,
  including which are optional and their formats

### Requirement: Accounts
A tool SHALL list the household's accounts with name, type, current balance,
and whether it is archived. It SHALL leave out archived accounts unless asked
to include them.

#### Scenario: Listing accounts
- **WHEN** a client asks for the accounts
- **THEN** each open account is returned with its name, type and the
  balance the Accounts page shows

#### Scenario: Including archived accounts
- **WHEN** a client asks for the accounts including archived ones
- **THEN** archived accounts are returned too, marked as archived

### Requirement: Categories
A tool SHALL list the household's categories as a tree: each category with
its parent, its budget kind (monthly, yearly, yearly on a date, or bills),
and whether it is a tab or tab group.

#### Scenario: A parent with subcategories
- **WHEN** "Groceries" has subcategories "Supermarket" and "Market"
- **THEN** both are returned under "Groceries"

### Requirement: A month's budget
A tool SHALL return a month's budget with the same figures as the Budgets
page: per budgeted category its limit, spent, left and whether it is over,
with bills' paid and unpaid state, plus the month's totals. For the current
month it SHALL also give the expected pace by today.

#### Scenario: Current month
- **WHEN** a client asks for this month's budget
- **THEN** each budgeted category's limit, spent and left match the Budgets
  page, along with the totals and where spending is expected to be by today

#### Scenario: A parent covers its subcategories
- **WHEN** "Groceries" has a limit and its subcategories have spending
- **THEN** the subcategories' spending counts in "Groceries" and isn't
  counted a second time in the totals

#### Scenario: Yearly budgets
- **WHEN** the household has yearly budgets
- **THEN** each one is returned with its year amount and what has been spent
  of it so far this year

### Requirement: Search transactions
A tool SHALL search the household's transactions by date range, account,
category (including its subcategories), uncategorized only, payee or notes
text, and amount range. Results SHALL be newest first, each with date,
amount, payee, account, category and notes, and marked when split or a
transfer.

#### Scenario: Searching by payee
- **WHEN** a client searches for "albert heijn" in October 2026
- **THEN** every October transaction whose payee contains "Albert Heijn" is
  returned, ignoring case, newest first

#### Scenario: Uncategorized
- **WHEN** a client searches for uncategorized transactions
- **THEN** only transactions without a category are returned

### Requirement: Search results come in pages
A search SHALL return at most 50 transactions by default and at most 200 when
asked for more. When more match, it SHALL return a cursor that fetches the
next page, and the total number of matches.

#### Scenario: Many matches
- **WHEN** 320 transactions match a search
- **THEN** the first 50 are returned, with the total of 320 and a cursor for
  the next page

#### Scenario: The last page
- **WHEN** a client fetches the page that holds the last match
- **THEN** no cursor is returned

### Requirement: One transaction
A tool SHALL return one transaction by id with everything the search gives,
plus its split parts (each with amount and category), its transfer
counterpart's account, and whether its category was confirmed or guessed.

#### Scenario: A split transaction
- **WHEN** a client asks for a supermarket payment split into groceries and
  household goods
- **THEN** the transaction is returned with both parts and their amounts

### Requirement: The month overview
A tool SHALL return a month's overview with the same figures as the Overview
page: balances, money in and out, budget progress, bills, and what needs
attention.

#### Scenario: The current month
- **WHEN** a client asks for this month's overview
- **THEN** its figures match the Overview page for this month

### Requirement: Spending report
A tool SHALL return the spending report for a range of months: per category
and month what went out, with totals, income and the averages the Reports
page shows.

#### Scenario: A year of spending
- **WHEN** a client asks for spending from 2026-01 to 2026-10
- **THEN** each category's spending per month is returned with the totals
  and averages the Reports page shows for that range

#### Scenario: A range too long
- **WHEN** a client asks for a range longer than the Reports page allows
- **THEN** the call returns an error saying how long a range can be

### Requirement: Forecast and what's coming up
A tool SHALL return the Everyday forecast for a number of days ahead (90 when
not given): the projected balance by day and the items coming up, each with
date, amount, name and whether it is late.

#### Scenario: Coming up
- **WHEN** a client asks for the forecast
- **THEN** the projected balances and the bills, installments, expected items
  and budgets coming up are returned, the same as the Forecast page

### Requirement: Year plan against actuals
A tool SHALL return a year's Current budget plan with, per budget, its year
total and what was actually spent, plus planned income, the year totals and
where the year is heading, as the Year view shows. Drafts SHALL NOT be
returned.

#### Scenario: This year
- **WHEN** a client asks for the 2026 plan
- **THEN** each budget's year total and actual spending are returned, with
  the year totals and where the year is heading

### Requirement: Net worth history
A tool SHALL return net worth at the end of each month for a number of months
back (12 when not given), in total and per tier, as the net worth report
shows. The current month SHALL report today's figure.

#### Scenario: The last year
- **WHEN** a client asks for net worth history without a number of months
- **THEN** net worth at each of the last 12 month ends is returned, the
  current month as of today

#### Scenario: Less history than asked
- **WHEN** the household's first transaction is from 5 months ago and a
  client asks for 12 months
- **THEN** the 6 months there is data for are returned

### Requirement: Loans
A tool SHALL list the household's loans with the account, principal,
interest rate, installment, the balance still owed, the next installment's
date and the last installment's date.

#### Scenario: A mortgage
- **WHEN** the household has a mortgage with a schedule
- **THEN** it is returned with what is still owed and when the next and last
  installments fall

### Requirement: Tabs
A tool SHALL list the household's tabs with their balance, worded as who owes
whom rather than signed, and since when each is open.

#### Scenario: Someone owes us
- **WHEN** a friend's tab shows they owe 30 euro since 3 November
- **THEN** the tab is returned as "owes you 30.00 EUR", open since
  2026-11-03
