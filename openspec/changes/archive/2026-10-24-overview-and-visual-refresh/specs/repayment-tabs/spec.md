# Spec Delta

## MODIFIED Requirements

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
