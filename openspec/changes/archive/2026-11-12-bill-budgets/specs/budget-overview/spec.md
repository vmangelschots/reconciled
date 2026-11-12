# Spec Delta

## MODIFIED Requirements

### Requirement: Needs a look
The page SHALL list the monthly, yearly and bill warnings of the Overview's
Needs attention panel for the viewed month, with the same rules, order and wording,
and SHALL leave the section out when there are none. Clicking an item SHALL
open that budget's sheet. Rows in the list SHALL keep their place.

#### Scenario: Over and due soon
- **WHEN** on 24 October "Transport" is 20.00 over and "Property tax" is due
  on 1 November
- **THEN** Needs a look lists both, and both also stay in their place in the
  list

#### Scenario: A missed bill
- **WHEN** on 28 November Spotify, due on the 21st, was missed
- **THEN** Needs a look lists "Spotify missed", and the headline counts it

#### Scenario: Nothing to show
- **WHEN** nothing needs a look
- **THEN** the section isn't shown

### Requirement: One list of budgets
The page SHALL list monthly, yearly, yearly-on-a-date and Bills budgets in
one list in category order, with subcategories under their parent whatever
their kind. A subcategory whose parent isn't listed SHALL read "Parent /
Sub". Tab groups and tabs SHALL NOT be listed.

#### Scenario: Mixed kinds under one parent
- **WHEN** "Car" has the monthly subcategory "Fuel", the yearly "Repairs" and
  the on-a-date "Insurance"
- **THEN** all three are listed under "Car"

#### Scenario: A Bills subcategory
- **WHEN** "Home" has the monthly subcategory "Energy" and the Bills
  subcategory "Internet"
- **THEN** both are listed under "Home"

#### Scenario: Rows don't move with spending
- **WHEN** "Groceries" goes over its limit
- **THEN** it stays in its place in the list

#### Scenario: Changing kind doesn't move a row
- **WHEN** the user switches "Clothing" from monthly to yearly
- **THEN** it stays in its place in the list

#### Scenario: Yearly categories outside the budgeted period
- **WHEN** the start month is October 2026 and the user views September 2026
- **THEN** monthly budgets are listed, and a note says budgeting by year
  starts in October 2026 and offers to go there, instead of the yearly budgets

### Requirement: Pace on rows
For the current month, each monthly and yearly bar SHALL show a pace marker.
Bills rows SHALL NOT show one. A budget listed in Needs a look for being
ahead of pace SHALL be shown in the warning colour. Other months SHALL show
no marker.

#### Scenario: Monthly warning agrees with the Overview
- **WHEN** on 24 October "Utilities" has spent 90% of its limit
- **THEN** its bar is amber, and it is listed in Needs a look

#### Scenario: A Bills row has no marker
- **WHEN** the user views the current month and "Streaming" is a Bills
  category
- **THEN** its bar has no pace marker

#### Scenario: A past month has no pace
- **WHEN** the user views September
- **THEN** no bar has a pace marker
