from flask import Flask, render_template, request, jsonify
import sqlite3
from pathlib import Path
from datetime import datetime

app = Flask(__name__)
DB_PATH = Path(__file__).with_name("budget.db")

DEFAULT_CATEGORIES = [
    "Recurring Expenses",
    "Groceries",
    "Gas",
    "Credit Card Debt Payments",
    "Dining",
    "Auto",
    "Shopping",
    "Entertainment",
    "Savings",
    "Miscellaneous",
]

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL CHECK(amount >= 0),
            category_id INTEGER NOT NULL,
            owner TEXT NOT NULL CHECK(owner IN ('Me', 'Wife', 'Shared')),
            notes TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(category_id) REFERENCES categories(id)
        );

        CREATE TABLE IF NOT EXISTS income (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            source TEXT NOT NULL,
            amount REAL NOT NULL CHECK(amount >= 0),
            owner TEXT NOT NULL CHECK(owner IN ('Me', 'Wife', 'Shared')),
            notes TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """
    )

    for category in DEFAULT_CATEGORIES:
        conn.execute(
            "INSERT OR IGNORE INTO categories(name) VALUES (?)",
            (category,)
        )

    conn.commit()
    conn.close()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/categories", methods=["GET", "POST"])
def categories():
    conn = get_db()

    if request.method == "POST":
        data = request.get_json(force=True)
        name = (data.get("name") or "").strip()

        if not name:
            conn.close()
            return jsonify({"error": "Category name is required."}), 400

        try:
            cursor = conn.execute(
                "INSERT INTO categories(name) VALUES (?)",
                (name,)
            )
            conn.commit()
            category = conn.execute(
                "SELECT id, name FROM categories WHERE id = ?",
                (cursor.lastrow,)
            ).fetchone()
            result = dict(category)
            conn.close()
            return jsonify(result), 201
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({"error": "That category already exists."}), 409

    rows = conn.execute(
        "SELECT id, name FROM categories ORDER BY id"
    ).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route("/api/expenses", methods=["GET", "POST"])
def expenses():
    conn = get_db()

    if request.method == "POST":
        data = request.get_json(force=True)

        required = ["date", "description", "amount", "category_id", "owner"]
        missing = [field for field in required if data.get(field) in (None, "")]
        if missing:
            conn.close()
            return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

        try:
            amount = float(data["amount"])
            if amount < 0:
                raise ValueError
        except (TypeError, ValueError):
            conn.close()
            return jsonify({"error": "Amount must be a positive number."}), 400

        if data["owner"] not in {"Me", "Wife", "Shared"}:
            conn.close()
            return jsonify({"error": "Invalid owner."}), 400

        cursor = conn.execute(
            """
            INSERT INTO expenses(date, description, amount, category_id, owner, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                data["date"],
                data["description"].strip(),
                amount,
                int(data["category_id"]),
                data["owner"],
                (data.get("notes") or "").strip(),
            )
        )
        conn.commit()

        row = conn.execute(
            """
            SELECT e.id, e.date, e.description, e.amount, e.owner, e.notes,
                   c.id AS category_id, c.name AS category_name
            FROM expenses e
            JOIN categories c ON c.id = e.category_id
            WHERE e.id = ?
            """,
            (cursor.lastrow,)
        ).fetchone()
        conn.close()
        return jsonify(dict(row)), 201

    month = request.args.get("month")
    params = []
    where = ""
    if month:
        where = "WHERE substr(e.date, 1, 7) = ?"
        params.append(month)

    rows = conn.execute(
        f"""
        SELECT e.id, e.date, e.description, e.amount, e.owner, e.notes,
               c.id AS category_id, c.name AS category_name
        FROM expenses e
        JOIN categories c ON c.id = e.category_id
        {where}
        ORDER BY e.date DESC, e.id DESC
        """,
        params
    ).fetchall()

    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route("/api/expenses/<int:expense_id>", methods=["DELETE"])
def delete_expense(expense_id):
    conn = get_db()
    conn.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/api/income", methods=["GET", "POST"])
def income():
    conn = get_db()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        date = str(data.get("date") or "").strip()
        source = str(data.get("source") or "").strip()
        owner = str(data.get("owner") or "").strip()
        notes = str(data.get("notes") or "").strip()
        raw_amount = data.get("amount")

        if not date:
            conn.close()
            return jsonify({"error": "Income date is required."}), 400

        if not source:
            conn.close()
            return jsonify({"error": "Income source is required."}), 400

        try:
            amount = round(float(raw_amount), 2)
            if amount <= 0:
                raise ValueError
        except (TypeError, ValueError):
            conn.close()
            return jsonify({"error": "Income amount must be greater than $0.00."}), 400

        if owner not in {"Me", "Wife", "Shared"}:
            conn.close()
            return jsonify({"error": "Choose Me, Wife, or Shared for the income owner."}), 400

        try:
            cursor = conn.execute(
                """
                INSERT INTO income(date, source, amount, owner, notes)
                VALUES (?, ?, ?, ?, ?)
                """,
                (date, source, amount, owner, notes)
            )
            conn.commit()

            row = conn.execute(
                """
                SELECT id, date, source, amount, owner, notes
                FROM income
                WHERE id = ?
                """,
                (cursor.lastrow,)
            ).fetchone()

            result = dict(row)
            conn.close()
            return jsonify(result), 201

        except sqlite3.Error as exc:
            conn.rollback()
            conn.close()
            app.logger.exception("Failed to save income")
            return jsonify({"error": f"Could not save income: {exc}"}), 500

    month = request.args.get("month")
    params = []
    where = ""

    if month:
        where = "WHERE substr(date, 1, 7) = ?"
        params.append(month)

    rows = conn.execute(
        f"""
        SELECT id, date, source, amount, owner, notes
        FROM income
        {where}
        ORDER BY date DESC, id DESC
        """,
        params
    ).fetchall()

    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route("/api/income/<int:income_id>", methods=["DELETE"])
def delete_income(income_id):
    conn = get_db()
    conn.execute("DELETE FROM income WHERE id = ?", (income_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/api/report")
def report():
    month = request.args.get("month")
    if not month:
        return jsonify({"error": "month is required in YYYY-MM format"}), 400

    conn = get_db()

    income_rows = conn.execute(
        """
        SELECT owner, SUM(amount) AS total
        FROM income
        WHERE substr(date, 1, 7) = ?
        GROUP BY owner
        """,
        (month,)
    ).fetchall()

    expense_owner_rows = conn.execute(
        """
        SELECT owner, SUM(amount) AS total
        FROM expenses
        WHERE substr(date, 1, 7) = ?
        GROUP BY owner
        """,
        (month,)
    ).fetchall()

    category_rows = conn.execute(
        """
        SELECT c.id, c.name,
               COALESCE(SUM(e.amount), 0) AS total,
               COALESCE(SUM(CASE WHEN e.owner = 'Me' THEN e.amount ELSE 0 END), 0) AS me,
               COALESCE(SUM(CASE WHEN e.owner = 'Wife' THEN e.amount ELSE 0 END), 0) AS wife,
               COALESCE(SUM(CASE WHEN e.owner = 'Shared' THEN e.amount ELSE 0 END), 0) AS shared
        FROM categories c
        LEFT JOIN expenses e
          ON e.category_id = c.id
         AND substr(e.date, 1, 7) = ?
        GROUP BY c.id, c.name
        ORDER BY c.id
        """,
        (month,)
    ).fetchall()

    income_by_owner = {"Me": 0, "Wife": 0, "Shared": 0}
    expense_by_owner = {"Me": 0, "Wife": 0, "Shared": 0}

    for row in income_rows:
        income_by_owner[row["owner"]] = round(row["total"] or 0, 2)

    for row in expense_owner_rows:
        expense_by_owner[row["owner"]] = round(row["total"] or 0, 2)

    total_income = round(sum(income_by_owner.values()), 2)
    total_expenses = round(sum(expense_by_owner.values()), 2)

    conn.close()

    return jsonify({
        "month": month,
        "income_by_owner": income_by_owner,
        "expense_by_owner": expense_by_owner,
        "categories": [
            {
                "id": row["id"],
                "name": row["name"],
                "total": round(row["total"] or 0, 2),
                "me": round(row["me"] or 0, 2),
                "wife": round(row["wife"] or 0, 2),
                "shared": round(row["shared"] or 0, 2),
            }
            for row in category_rows
        ],
        "total_income": total_income,
        "total_expenses": total_expenses,
        "net": round(total_income - total_expenses, 2),
    })

# Ensure the SQLite schema exists before the first request.
init_db()

if __name__ == "__main__":
    app.run(debug=True)
