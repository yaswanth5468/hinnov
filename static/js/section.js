const section = document.body.dataset.section;
const sectionHost = document.querySelector("#sectionFeedback");
const escapeSection = value => String(value ?? "").replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
);
const sectionDate = value => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const sectionMoney = value => "$" + Number(value).toLocaleString("en-US");

async function sectionRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json();
  if (response.status === 401) {
    window.location.assign("/");
    throw new Error("Your session ended. Sign in again.");
  }
  if (!response.ok) throw new Error(data.error || "Unable to complete that action.");
  return data;
}

function feedback(message, error = false) {
  sectionHost.textContent = message;
  sectionHost.classList.toggle("error", error);
  sectionHost.classList.remove("hidden");
  clearTimeout(feedback.timer);
  feedback.timer = setTimeout(() => sectionHost.classList.add("hidden"), 3500);
}

function renderSection(data) {
  const projects = new Map(data.projects.map(project => [project.id, project.name]));
  const workers = new Map(data.workers.map(worker => [worker.id, worker.name]));
  const bodyRows = (id, rows) => {
    const target = document.querySelector(`#${id}`);
    if (target) target.innerHTML = rows || `<tr><td colspan="7">Nothing to show yet.</td></tr>`;
  };
  if (section === "projects") bodyRows("projectRows", data.projects.map(project =>
    `<tr><td><strong>${escapeSection(project.name)}</strong></td><td>${escapeSection(project.client)}</td><td>${escapeSection(project.location)}</td><td><div class="section-progress"><b>${project.progress}%</b><span class="progress-track"><span class="progress-fill" style="width:${project.progress}%"></span></span></div></td><td>${sectionMoney(project.budget)}</td><td>${sectionMoney(project.spent)}</td><td>${sectionDate(project.due_date)}</td></tr>`
  ).join(""));
  if (section === "orders") bodyRows("orderRows", data.orders.map(order =>
    `<tr><td><strong class="order-reference">${escapeSection(order.reference)}</strong></td><td>${escapeSection(order.supplier)}</td><td>${escapeSection(order.item)} · ${escapeSection(order.quantity)}</td><td>${escapeSection(order.project)}</td><td>${sectionDate(order.pickup_date)}</td><td><span class="status-pill ${order.pickup_date === new Date(Date.now() + 86400000).toISOString().slice(0, 10) ? "" : "status-ready"}">${escapeSection(order.status)}</span></td></tr>`
  ).join(""));
  if (section === "team") {
    bodyRows("workerRows", data.workers.map(worker =>
      `<tr><td><strong>${escapeSection(worker.name)}</strong></td><td>${escapeSection(worker.role)}</td><td><span class="order-reference">${escapeSection(worker.code)}</span></td><td>${escapeSection(projects.get(worker.project_id))}</td><td><a class="directory-phone" href="tel:${escapeSection(worker.phone)}">${escapeSection(worker.phone)}</a></td></tr>`
    ).join(""));
    bodyRows("taskRows", data.tasks.map(task =>
      `<tr><td><strong>${escapeSection(task.title)}</strong><br><span class="subtle-cell">${escapeSection(task.description)}</span></td><td>${escapeSection(task.worker)}</td><td>${escapeSection(task.project)}</td><td>${sectionDate(task.due_date)}</td><td><span class="status-pill ${task.status === "Complete" ? "status-ready" : ""}">${escapeSection(task.status)}</span></td></tr>`
    ).join(""));
    const projectSelect = document.querySelector("#assignProject");
    const workerSelect = document.querySelector("#assignWorker");
    projectSelect.innerHTML = data.projects.map(project => `<option value="${project.id}">${escapeSection(project.name)}</option>`).join("");
    function filterWorkers() {
      const projectId = Number(projectSelect.value);
      workerSelect.innerHTML = data.workers.filter(worker => worker.project_id === projectId)
        .map(worker => `<option value="${worker.id}">${escapeSection(worker.name)} · ${escapeSection(worker.role)}</option>`).join("");
    }
    projectSelect.addEventListener("change", filterWorkers);
    filterWorkers();
  }
  if (section === "activity") bodyRows("activityRows", data.logs.map(log =>
    `<tr><td><strong>${escapeSection(log.task)}</strong>${log.photo_name ? `<br><span class="subtle-cell">📷 ${escapeSection(log.photo_name)}</span>` : ""}</td><td>${escapeSection(log.worker)}</td><td>${escapeSection(log.project)}</td><td><span class="status-pill ${log.status === "Complete" ? "status-ready" : ""}">${escapeSection(log.status)}</span></td><td>${log.completion}%</td><td>${escapeSection(log.issue || "—")}</td><td>${sectionDate(log.created_at.slice(0, 10))}</td></tr>`
  ).join(""));
  if (section === "expenses") bodyRows("expenseRows", data.expenses.map(expense =>
    `<tr><td><strong>${escapeSection(expense.description)}</strong></td><td>${escapeSection(expense.category)}</td><td>${escapeSection(expense.project)}</td><td>${sectionDate(expense.date)}</td><td><strong>${sectionMoney(expense.amount)}</strong></td></tr>`
  ).join(""));
  if (section === "inventory") {
    const lowStock = data.inventory.filter(item => item.low_stock).length;
    document.querySelector("#inventorySummary").innerHTML = `
      <article class="inventory-stat"><span>Tracked items</span><strong>${data.inventory.length}</strong></article>
      <article class="inventory-stat"><span>Below reorder point</span><strong class="${lowStock ? "inventory-alert-number" : ""}">${lowStock}</strong></article>
      <article class="inventory-stat"><span>Stocked locations</span><strong>${new Set(data.inventory.map(item => item.location)).size}</strong></article>`;
    bodyRows("inventoryRows", data.inventory.map(item =>
      `<tr><td><span class="order-reference">${escapeSection(item.sku)}</span></td><td><strong>${escapeSection(item.name)}</strong></td><td>${escapeSection(item.category)}</td><td><strong>${item.quantity} ${escapeSection(item.unit)}</strong></td><td>${item.reorder_level} ${escapeSection(item.unit)}</td><td>${escapeSection(item.location)}</td><td><span class="status-pill ${item.low_stock ? "" : "status-ready"}">${item.low_stock ? "Reorder" : "In stock"}</span></td></tr>`
    ).join(""));
  }
}

function renderFinancialReport(report) {
  const totalBudget = report.projects.reduce((total, project) => total + project.budget, 0);
  const totalSpent = report.projects.reduce((total, project) => total + project.spent, 0);
  const recordedExpenses = report.expenses.reduce((total, expense) => total + expense.amount, 0);
  const utilization = totalBudget ? totalSpent / totalBudget * 100 : 0;
  document.querySelector("#reportDate").textContent = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  document.querySelector("#financeSummary").innerHTML = `
    <article class="finance-stat"><span>Portfolio budget</span><strong>${sectionMoney(totalBudget)}</strong></article>
    <article class="finance-stat"><span>Project spend</span><strong>${sectionMoney(totalSpent)}</strong><small>${utilization.toFixed(1)}% of budget</small></article>
    <article class="finance-stat"><span>Recorded expenses</span><strong>${sectionMoney(recordedExpenses)}</strong><small>${report.expenses.length} ledger entries</small></article>`;

  const categoryHost = document.querySelector("#financeCategories");
  categoryHost.innerHTML = Object.entries(report.categories).map(([category, amount]) => {
    const share = recordedExpenses ? amount / recordedExpenses * 100 : 0;
    return `<article class="finance-category">
      <div><span>${escapeSection(category)}</span><strong>${sectionMoney(amount)}</strong></div>
      <div class="finance-meter"><span style="width:${share}%"></span></div>
      <small>${share.toFixed(1)}% of recorded expenses</small>
    </article>`;
  }).join("");

  const projectHost = document.querySelector("#financeProjects");
  projectHost.innerHTML = report.projects.map(project => {
    const budgetUsed = project.budget ? project.spent / project.budget * 100 : 0;
    return `<article class="finance-project">
      <div class="finance-project-heading"><strong>${escapeSection(project.name)}</strong><span>${budgetUsed.toFixed(1)}% used</span></div>
      <div class="finance-meter finance-budget-meter"><span class="${budgetUsed > 100 ? "over-budget" : ""}" style="width:${Math.min(100, budgetUsed)}%"></span></div>
      <div class="finance-project-foot"><span>Spent ${sectionMoney(project.spent)} of ${sectionMoney(project.budget)}</span><span>${sectionMoney(project.expense_total)} recorded expenses</span></div>
    </article>`;
  }).join("") || `<div class="finance-empty">No projects to report.</div>`;

  const rows = report.expenses.map(expense =>
    `<tr><td><strong>${escapeSection(expense.description)}</strong></td><td>${escapeSection(expense.report_category)}</td><td>${escapeSection(expense.project)}</td><td>${escapeSection(expense.client)}</td><td>${sectionDate(expense.date)}</td><td><strong>${sectionMoney(expense.amount)}</strong></td></tr>`
  ).join("");
  const target = document.querySelector("#expenseRows");
  target.innerHTML = rows || `<tr><td colspan="6">No expenses recorded yet.</td></tr>`;
}

async function loadSection() {
  try {
    const data = await sectionRequest("/api/dashboard");
    renderSection(data);
    if (section === "expenses") {
      renderFinancialReport(await sectionRequest("/api/financial-report"));
    }
  } catch (error) {
    feedback(error.message, true);
  }
}

document.querySelectorAll("[data-logout]").forEach(button => button.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.assign("/");
}));

const mobileMenu = document.querySelector("#mobileMenu");
mobileMenu?.addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));

document.querySelector("#jumpAssign")?.addEventListener("click", () =>
  document.querySelector("#assignPanel").scrollIntoView({ behavior: "smooth" })
);
document.querySelector("#openInventoryForm")?.addEventListener("click", () => {
  const panel = document.querySelector("#inventoryFormPanel");
  panel.classList.toggle("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
});

document.querySelector("#assignForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const errorBox = document.querySelector("#assignError");
  errorBox.classList.add("hidden");
  try {
    await sectionRequest("/api/tasks", {
      method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries()))
    });
    event.currentTarget.reset();
    await loadSection();
    feedback("Task assigned to the worker.");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  }
});

document.querySelector("#inventoryForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const errorBox = document.querySelector("#inventoryError");
  errorBox.classList.add("hidden");
  try {
    await sectionRequest("/api/inventory", {
      method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries()))
    });
    event.currentTarget.reset();
    await loadSection();
    feedback("Inventory item saved.");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  }
});

document.querySelector("#exportExpensesCsv")?.addEventListener("click", async () => {
  try {
    const report = await sectionRequest("/api/financial-report");
    const csv = [
      ["Project", "Client", "Description", "Category", "Date", "Amount (USD)"],
      ...report.expenses.map(expense => [
        expense.project, expense.client, expense.description, expense.report_category, expense.date, expense.amount,
      ]),
    ].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "buildpro-expense-report.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    feedback(error.message, true);
  }
});
document.querySelector("#exportExpensesPdf")?.addEventListener("click", () => window.print());

loadSection();
