# Household Budget MVP v1.1

A small local household budgeting application built with Flask, SQLite, HTML, CSS, and vanilla JavaScript.

## MVP features

- Persistent SQLite database
- Monthly filtering
- Income tracking
- Expense tracking
- Color-coded ownership:
  - Me
  - Wife
  - Shared
- Independent collapsible section for every expense category
- Default categories:
  - Recurring Expenses
  - Groceries
  - Gas
  - Credit Card Debt Payments
  - Dining
  - Auto
  - Shopping
  - Entertainment
  - Savings
  - Miscellaneous
- Add custom categories
- Monthly dashboard totals
- Monthly report showing:
  - Total income
  - Total expenses
  - Income minus expenses
  - Category totals
  - Category spending split by Me / Wife / Shared
- Delete income and expense entries

## Run the app

### Windows

Open PowerShell inside this folder:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
py app.py
```

Then open:

http://127.0.0.1:5000

### macOS

Open Terminal inside this folder:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 app.py
```

Then open:

http://127.0.0.1:5000

## Data storage

The first time the app runs, it creates:

`budget.db`

That SQLite file contains your categories, income, and expenses.

Do not delete `budget.db` unless you intentionally want to reset the application's stored data.

## Suggested next additions

1. Edit transactions instead of delete/re-add.
2. Rename household members in Settings.
3. Recurring expense templates.
4. Account balances for checking, savings, and credit cards.
5. Budget targets by category.
6. Month-over-month reporting and charts.
7. PDF/Excel report export.
8. Authentication if the app is deployed online.


## v1.1 income-entry fix

- Hardened the `/api/income` POST endpoint.
- Added visible validation/error messages.
- Added a successful-save confirmation.
- Income date now follows the month currently being viewed.
- Database initialization now happens whenever the Flask application starts.
