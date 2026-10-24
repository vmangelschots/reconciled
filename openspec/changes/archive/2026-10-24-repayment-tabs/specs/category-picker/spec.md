# Spec Delta

## ADDED Requirements

### Requirement: Tabs are listed in their own group
The picker SHALL list tabs after the categories, in a group headed by
their tab group's name, showing each tab by its own name, and SHALL NOT
list them among the categories. While the search is non-empty, the group SHALL list only
tabs whose label contains the search text. A tab group SHALL NOT be
offered where a transaction's or a part's category is picked. A chosen
tab SHALL be shown as "<Group> / <Tab>" with a tab icon, on the picker
and in the ledger's category cell.

#### Scenario: Tabs come after the categories
- **WHEN** the user opens the picker with an empty search and has
  "Groceries", "Restaurants" and "Tabs / Jan"
- **THEN** "Groceries" and "Restaurants" are listed, followed by a "Tabs"
  group listing "Jan", and "Tabs" itself is not an option

#### Scenario: Typing finds a tab
- **WHEN** the user types "jan"
- **THEN** the "Tabs" group lists "Jan" and it is highlighted when no
  category matches

#### Scenario: A chosen tab is marked
- **WHEN** a transaction's category is "Tabs / Jan"
- **THEN** its category cell shows "Tabs / Jan" with the tab icon
