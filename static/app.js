const MONTH_STORAGE_KEY = "householdBudgetSelectedMonth";

const state = {
  categories: [],
  expenses: [],
  income: [],
  month: "",
  editingIncomeId: null,
  expandedCategories: new Set(),
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonth() {
  return localToday().slice(0, 7);
}

function validMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value || "")) return false;
  const monthNumber = Number(value.slice(5, 7));
  return monthNumber >= 1 && monthNumber <= 12;
}

function savedMonthOrCurrent() {
  const saved = localStorage.getItem(MONTH_STORAGE_KEY);
  return validMonth(saved) ? saved : currentMonth();
}

function setSelectedMonth(month) {
  state.month = validMonth(month) ? month : currentMonth();
  localStorage.setItem(MONTH_STORAGE_KEY, state.month);
  document.querySelector("#monthPicker").value = state.month;
}

function defaultDateForSelectedMonth() {
  if (!state.month || state.month === currentMonth()) {
    return localToday();
  }
  return `${state.month}-01`;
}

function setIncomeMessage(message = "", type = "") {
  const element = document.querySelector("#incomeFormMessage");
  element.textContent = message;
  element.className = `form-message ${type ? `form-message-${type}` : ""}`;
}

function setExpenseMessage(message = "", type = "") {
  const element = document.querySelector("#expenseFormMessage");
  element.textContent = message;
  element.className = `form-message ${type ? `form-message-${type}` : ""}`;
}

function ownerClass(owner) {
  if (owner === "Me") return "me";
  if (owner === "Wife") return "wife";
  return "shared";
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data;
}

async function loadAll() {
  const month = state.month;

  const [categories, expenses, income] = await Promise.all([
    api("/api/categories"),
    api(`/api/expenses?month=${encodeURIComponent(month)}`),
    api(`/api/income?month=${encodeURIComponent(month)}`),
  ]);

  state.categories = categories;
  state.expenses = expenses;
  state.income = income;

  renderEverything();
}

function renderEverything() {
  renderSummary();
  renderIncome();
  renderCategories();
}

function renderSummary() {
  const incomeTotal = state.income.reduce((sum, item) => sum + Number(item.amount), 0);
  const expenseTotal = state.expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const remaining = incomeTotal - expenseTotal;

  document.querySelector("#incomeTotal").textContent = money.format(incomeTotal);
  document.querySelector("#expenseTotal").textContent = money.format(expenseTotal);
  document.querySelector("#remainingTotal").textContent = money.format(remaining);
  document.querySelector("#incomeSectionTotal").textContent = money.format(incomeTotal);

  const ownerTotals = { Me: 0, Wife: 0, Shared: 0 };
  for (const expense of state.expenses) {
    ownerTotals[expense.owner] += Number(expense.amount);
  }

  document.querySelector("#meExpenseTotal").textContent = money.format(ownerTotals.Me);
  document.querySelector("#wifeExpenseTotal").textContent = money.format(ownerTotals.Wife);
  document.querySelector("#sharedExpenseTotal").textContent = money.format(ownerTotals.Shared);
}

function renderIncome() {
  const tbody = document.querySelector("#incomeRows");
  tbody.innerHTML = "";

  if (!state.income.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No income entered for this month.</td></tr>`;
    return;
  }

  for (const item of state.income) {
    const row = document.createElement("tr");
    row.className = `row-${ownerClass(item.owner)}`;
    row.innerHTML = `
      <td>${escapeHtml(item.date)}</td>
      <td>${escapeHtml(item.source)}</td>
      <td><span class="owner-badge owner-${ownerClass(item.owner)}">${escapeHtml(item.owner)}</span></td>
      <td>${money.format(item.amount)}</td>
      <td>
        <div class="row-actions">
          <button class="edit-button" data-edit-income-id="${item.id}">Edit</button>
          <button class="delete-button" data-income-id="${item.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(row);
  }

  tbody.querySelectorAll("[data-edit-income-id]").forEach((button) => {
    button.addEventListener("click", () => beginIncomeEdit(Number(button.dataset.editIncomeId)));
  });

  tbody.querySelectorAll("[data-income-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this income entry?")) return;

      try {
        await api(`/api/income/${button.dataset.incomeId}`, { method: "DELETE" });
        if (state.editingIncomeId === Number(button.dataset.incomeId)) {
          cancelIncomeEdit();
        }
        await loadAll();
      } catch (error) {
        setIncomeMessage(error.message, "error");
      }
    });
  });
}

function beginIncomeEdit(incomeId) {
  const item = state.income.find((entry) => Number(entry.id) === Number(incomeId));
  if (!item) return;

  state.editingIncomeId = Number(incomeId);

  document.querySelector("#incomeDate").value = item.date;
  document.querySelector("#incomeSource").value = item.source;
  document.querySelector("#incomeAmount").value = Number(item.amount).toFixed(2);
  document.querySelector("#incomeOwner").value = item.owner;
  document.querySelector("#incomeNotes").value = item.notes || "";

  document.querySelector("#addIncomeButton").textContent = "Save Changes";
  document.querySelector("#cancelIncomeEditButton").classList.remove("hidden");
  setIncomeMessage("Editing income entry.", "editing");

  document.querySelector("#incomeSource").focus();
}

function cancelIncomeEdit() {
  state.editingIncomeId = null;
  const form = document.querySelector("#incomeForm");
  form.reset();

  document.querySelector("#incomeDate").value = defaultDateForSelectedMonth();
  document.querySelector("#incomeOwner").value = "Me";
  document.querySelector("#addIncomeButton").textContent = "Add Income";
  document.querySelector("#cancelIncomeEditButton").classList.add("hidden");
  setIncomeMessage();
}

function renderCategories() {
  const container = document.querySelector("#categoriesContainer");
  container.innerHTML = "";

  for (const category of state.categories) {
    const categoryExpenses = state.expenses.filter(
      (expense) => Number(expense.category_id) === Number(category.id)
    );

    const categoryTotal = categoryExpenses.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0
    );

    const isExpanded = state.expandedCategories.has(Number(category.id));

    const card = document.createElement("section");
    card.className = "category-card";

    card.innerHTML = `
      <button class="category-toggle ${isExpanded ? "" : "collapsed"}" data-category-toggle="${category.id}">
        <div>
          <span class="chevron">▾</span>
          <strong>${escapeHtml(category.name)}</strong>
        </div>
        <span>${money.format(categoryTotal)}</span>
      </button>

      <div class="category-content ${isExpanded ? "" : "hidden"}" id="category-${category.id}">
        <div class="category-toolbar">
          <button class="button button-primary button-small" data-add-expense="${category.id}">
            + Add Expense
          </button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Owner</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${
                categoryExpenses.length
                  ? categoryExpenses.map(expenseRowHtml).join("")
                  : `<tr><td colspan="5" class="empty-state">No expenses in this category for this month.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.appendChild(card);
  }

  container.querySelectorAll("[data-category-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const categoryId = Number(button.dataset.categoryToggle);
      const target = document.querySelector(`#category-${categoryId}`);
      const opening = target.classList.contains("hidden");

      button.classList.toggle("collapsed", !opening);
      target.classList.toggle("hidden", !opening);

      if (opening) {
        state.expandedCategories.add(categoryId);
      } else {
        state.expandedCategories.delete(categoryId);
      }
    });
  });

  container.querySelectorAll("[data-add-expense]").forEach((button) => {
    button.addEventListener("click", () => openExpenseDialogForAdd(Number(button.dataset.addExpense)));
  });

  container.querySelectorAll("[data-edit-expense-id]").forEach((button) => {
    button.addEventListener("click", () => openExpenseDialogForEdit(Number(button.dataset.editExpenseId)));
  });

  container.querySelectorAll("[data-expense-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this expense entry?")) return;

      try {
        await api(`/api/expenses/${button.dataset.expenseId}`, { method: "DELETE" });
        await loadAll();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function expenseRowHtml(expense) {
  return `
    <tr class="row-${ownerClass(expense.owner)}">
      <td>${escapeHtml(expense.date)}</td>
      <td>${escapeHtml(expense.description)}</td>
      <td><span class="owner-badge owner-${ownerClass(expense.owner)}">${escapeHtml(expense.owner)}</span></td>
      <td>${money.format(expense.amount)}</td>
      <td>
        <div class="row-actions">
          <button class="edit-button" data-edit-expense-id="${expense.id}">Edit</button>
          <button class="delete-button" data-expense-id="${expense.id}">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

function populateExpenseCategoryOptions(selectedCategoryId) {
  const select = document.querySelector("#expenseCategorySelect");

  select.innerHTML = state.categories
    .map((category) => `
      <option value="${category.id}" ${Number(category.id) === Number(selectedCategoryId) ? "selected" : ""}>
        ${escapeHtml(category.name)}
      </option>
    `)
    .join("");
}

function openExpenseDialogForAdd(categoryId) {
  const category = state.categories.find((item) => Number(item.id) === Number(categoryId));
  if (!category) return;

  document.querySelector("#expenseEditId").value = "";
  populateExpenseCategoryOptions(categoryId);

  document.querySelector("#expenseDate").value = defaultDateForSelectedMonth();
  document.querySelector("#expenseDescription").value = "";
  document.querySelector("#expenseAmount").value = "";
  document.querySelector("#expenseNotes").value = "";
  document.querySelector('input[name="expenseOwner"][value="Me"]').checked = true;

  document.querySelector("#expenseDialogEyebrow").textContent = "New expense";
  document.querySelector("#expenseDialogTitle").textContent = `Add Expense — ${category.name}`;
  document.querySelector("#expenseSubmitButton").textContent = "Save Expense";
  setExpenseMessage();

  document.querySelector("#expenseDialog").showModal();
}

function openExpenseDialogForEdit(expenseId) {
  const expense = state.expenses.find((item) => Number(item.id) === Number(expenseId));
  if (!expense) return;

  document.querySelector("#expenseEditId").value = expense.id;
  populateExpenseCategoryOptions(expense.category_id);

  document.querySelector("#expenseDate").value = expense.date;
  document.querySelector("#expenseDescription").value = expense.description;
  document.querySelector("#expenseAmount").value = Number(expense.amount).toFixed(2);
  document.querySelector("#expenseNotes").value = expense.notes || "";

  const ownerRadio = document.querySelector(`input[name="expenseOwner"][value="${expense.owner}"]`);
  if (ownerRadio) ownerRadio.checked = true;

  document.querySelector("#expenseDialogEyebrow").textContent = "Edit expense";
  document.querySelector("#expenseDialogTitle").textContent = "Edit Expense";
  document.querySelector("#expenseSubmitButton").textContent = "Save Changes";
  setExpenseMessage();

  document.querySelector("#expenseDialog").showModal();
}

async function generateReport() {
  const report = await api(`/api/report?month=${encodeURIComponent(state.month)}`);

  const [year, month] = report.month.split("-");
  const monthLabel = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  document.querySelector("#reportTitle").textContent = `${monthLabel} Report`;

  document.querySelector("#reportSummary").innerHTML = `
    <div class="report-metric">
      <span>Total Income</span>
      <strong>${money.format(report.total_income)}</strong>
    </div>
    <div class="report-metric">
      <span>Total Expenses</span>
      <strong>${money.format(report.total_expenses)}</strong>
    </div>
    <div class="report-metric">
      <span>Income - Expenses</span>
      <strong>${money.format(report.net)}</strong>
    </div>
  `;

  const rows = report.categories.filter((category) => category.total > 0);

  document.querySelector("#reportRows").innerHTML = rows.length
    ? rows.map((category) => `
        <tr>
          <td>${escapeHtml(category.name)}</td>
          <td>${money.format(category.me)}</td>
          <td>${money.format(category.wife)}</td>
          <td>${money.format(category.shared)}</td>
          <td><strong>${money.format(category.total)}</strong></td>
        </tr>
      `).join("")
    : `<tr><td colspan="5" class="empty-state">No expenses entered for this month.</td></tr>`;

  document.querySelector("#reportDialog").showModal();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelector("#incomeForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.querySelector("#addIncomeButton");
  const editingIncomeId = state.editingIncomeId;

  const payload = {
    date: document.querySelector("#incomeDate").value.trim(),
    source: document.querySelector("#incomeSource").value.trim(),
    amount: document.querySelector("#incomeAmount").value.trim(),
    owner: document.querySelector("#incomeOwner").value,
    notes: document.querySelector("#incomeNotes").value.trim(),
  };

  setIncomeMessage();

  if (!payload.date) {
    setIncomeMessage("Choose a date for this income entry.", "error");
    document.querySelector("#incomeDate").focus();
    return;
  }

  if (!payload.source) {
    setIncomeMessage("Enter an income source.", "error");
    document.querySelector("#incomeSource").focus();
    return;
  }

  const numericAmount = Number(payload.amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    setIncomeMessage("Enter an income amount greater than $0.00.", "error");
    document.querySelector("#incomeAmount").focus();
    return;
  }

  button.disabled = true;
  button.textContent = editingIncomeId ? "Saving..." : "Adding...";

  try {
    if (editingIncomeId) {
      await api(`/api/income/${editingIncomeId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await api("/api/income", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }

    cancelIncomeEdit();
    await loadAll();
    setIncomeMessage(editingIncomeId ? "Income updated successfully." : "Income added successfully.", "success");
  } catch (error) {
    console.error("Income save failed:", error);
    setIncomeMessage(error.message || "Could not save income.", "error");
  } finally {
    button.disabled = false;
    button.textContent = state.editingIncomeId ? "Save Changes" : "Add Income";
  }
});

document.querySelector("#cancelIncomeEditButton").addEventListener("click", cancelIncomeEdit);

document.querySelector("#expenseForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const editId = document.querySelector("#expenseEditId").value;
  const button = document.querySelector("#expenseSubmitButton");
  const owner = document.querySelector('input[name="expenseOwner"]:checked')?.value;

  const payload = {
    date: document.querySelector("#expenseDate").value.trim(),
    description: document.querySelector("#expenseDescription").value.trim(),
    amount: document.querySelector("#expenseAmount").value.trim(),
    category_id: document.querySelector("#expenseCategorySelect").value,
    owner,
    notes: document.querySelector("#expenseNotes").value.trim(),
  };

  setExpenseMessage();

  if (!payload.date) {
    setExpenseMessage("Choose a date for this expense.", "error");
    return;
  }

  if (!payload.description) {
    setExpenseMessage("Enter an expense description.", "error");
    return;
  }

  const numericAmount = Number(payload.amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    setExpenseMessage("Enter an expense amount greater than $0.00.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "Saving...";

  try {
    if (editId) {
      await api(`/api/expenses/${editId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await api("/api/expenses", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }

    document.querySelector("#expenseDialog").close();
    await loadAll();
  } catch (error) {
    console.error("Expense save failed:", error);
    setExpenseMessage(error.message || "Could not save expense.", "error");
  } finally {
    button.disabled = false;
    button.textContent = editId ? "Save Changes" : "Save Expense";
  }
});

document.querySelector("#categoryForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await api("/api/categories", {
      method: "POST",
      body: JSON.stringify({
        name: document.querySelector("#categoryName").value,
      }),
    });

    document.querySelector("#categoryDialog").close();
    document.querySelector("#categoryName").value = "";
    await loadAll();
  } catch (error) {
    alert(error.message);
  }
});

document.querySelector("#monthPicker").addEventListener("change", async (event) => {
  setSelectedMonth(event.target.value || currentMonth());
  cancelIncomeEdit();
  document.querySelector("#expenseDialog").close();
  setIncomeMessage();
  await loadAll();
});

document.querySelectorAll(".section-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.querySelector(`#${button.dataset.target}`);
    button.classList.toggle("collapsed");
    target.classList.toggle("hidden");
  });
});

document.querySelector("#reportButton").addEventListener("click", generateReport);

document.querySelector("#addCategoryButton").addEventListener("click", () => {
  document.querySelector("#categoryDialog").showModal();
});

document.querySelector("#closeExpenseDialog").addEventListener("click", () => {
  document.querySelector("#expenseDialog").close();
});

document.querySelector("#closeCategoryDialog").addEventListener("click", () => {
  document.querySelector("#categoryDialog").close();
});

document.querySelector("#closeReportDialog").addEventListener("click", () => {
  document.querySelector("#reportDialog").close();
});

async function start() {
  setSelectedMonth(savedMonthOrCurrent());
  document.querySelector("#incomeDate").value = defaultDateForSelectedMonth();
  document.querySelector("#incomeOwner").value = "Me";
  await loadAll();
}

start().catch((error) => {
  console.error(error);
  alert(error.message);
});
