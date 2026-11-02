# Spec Delta

## Purpose

The category settings are the one place to add, rename, move and delete
categories, and to see tabs and yearly history.

## ADDED Requirements

### Requirement: Category settings page
The system SHALL offer the category settings at /categories, with the form to
add a category and the tree of categories with their rename and delete
actions. The Budgets page SHALL NOT include them, and SHALL link here from its
header.

#### Scenario: From Budgets
- **WHEN** the user clicks Categories in the Budgets header
- **THEN** /categories opens with every category listed

#### Scenario: Budgets stays about budgets
- **WHEN** the user opens Budgets
- **THEN** there is no form to add a category and no rename or delete action

### Requirement: Category settings show what they did
The category settings SHALL keep showing a category's budget summary, tab
balances, the change-of-kind confirmation and yearly history, as the budgets,
repayment-tabs and yearly-budgets capabilities describe.

#### Scenario: Tab balances
- **WHEN** the user opens /categories and "Jan" is owed 30.00
- **THEN** "Tabs / Jan" is marked as a tab and shows "Jan owes you €30.00"

#### Scenario: Yearly history
- **WHEN** "Clothing" has two years of history
- **THEN** its history can be opened from its line
