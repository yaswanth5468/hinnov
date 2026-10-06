const section = document.body.dataset.section;
const sectionHost = document.querySelector("#sectionFeedback");
let sectionData = null;
const escapeSection = value => String(value ?? "").replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
);
const sectionDate = value => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const sectionMoney = value => "$" + Number(value).toLocaleString("en-US");
const orderStatuses = ["Pending Pickup", "Picked Up", "Delivered to Site"];

function orderWhatsAppHref(order, buyer) {
  const phone = String(buyer?.phone || "").replace(/\D/g, "");
  if (!phone) return "";
  const message = [
    `BuildPro pickup instructions — ${order.reference}`,
    `Buyer: ${buyer.name}`,
    `Supplier: ${order.supplier}`,
    `Item: ${order.item} (${order.quantity})`,
    `Project: ${order.project}`,
    `Pickup date: ${order.pickup_date}`,
    `Total: ${sectionMoney(order.total_cost)}`,
  ].join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

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
  if (section === "orders") bodyRows("orderRows", data.orders.map(order => {
    const eligibleBuyers = data.workers.filter(worker =>
      worker.is_active && worker.project_id === order.project_id
    );
    const buyer = data.workers.find(worker => worker.id === order.buyer_worker_id);
    const href = orderWhatsAppHref(order, buyer);
    const buyerOptions = eligibleBuyers.map(worker =>
      `<option value="${worker.id}" ${worker.id === order.buyer_worker_id ? "selected" : ""}>${escapeSection(worker.name)}</option>`
    ).join("");
    const statusOptions = orderStatuses.map(status =>
      `<option value="${status}" ${status === order.status ? "selected" : ""}>${status}</option>`
    ).join("");
    return `<tr><td><strong class="order-reference">${escapeSection(order.reference)}</strong></td><td>${escapeSection(order.supplier)}</td><td>${escapeSection(order.item)} · ${escapeSection(order.quantity)}</td><td>${escapeSection(order.project)}</td><td>${sectionDate(order.pickup_date)}</td><td><strong>${sectionMoney(order.total_cost)}</strong></td><td><span class="status-pill ${order.status === "Delivered to Site" ? "status-ready" : ""}">${escapeSection(order.status)}</span><select class="order-status-select" data-order-status="${order.id}" aria-label="Update order status">${statusOptions}</select></td><td><select class="order-buyer-select" data-order-buyer="${order.id}" aria-label="Assign order buyer"><option value="">Select buyer</option>${buyerOptions}</select><div class="order-action-links"><a class="order-dispatch-link ${href ? "" : "hidden"}" data-order-whatsapp="${order.id}" href="${escapeSection(href)}" target="_blank" rel="noopener noreferrer">WhatsApp</a><button class="order-save-button" data-save-order="${order.id}">Save</button></div></td></tr>`;
  }).join(""));
  if (section === "team") {
    bodyRows("workerRows", data.workers.map(worker =>
      `<tr><td><strong>${escapeSection(worker.name)}</strong></td><td>${escapeSection(worker.role)}</td><td><span class="order-reference">${escapeSection(worker.code)}</span></td><td>${escapeSection(projects.get(worker.project_id))}</td><td><a class="directory-phone" href="tel:${escapeSection(worker.phone)}">${escapeSection(worker.phone)}</a></td><td>${sectionMoney(worker.pay_rate)} / ${worker.pay_type === "Daily" ? "day" : "month"}</td><td><span class="status-pill ${worker.is_active ? "status-ready" : ""}">${worker.is_active ? "Active" : "Inactive"}</span></td><td><button class="button button-secondary worker-status-button" data-worker-id="${worker.id}" data-next-active="${!worker.is_active}">${worker.is_active ? "Deactivate" : "Reactivate"}</button></td></tr>`
    ).join(""));
    bodyRows("taskRows", data.tasks.map(task =>
      `<tr><td><strong>${escapeSection(task.title)}</strong><br><span class="subtle-cell">${escapeSection(task.description)}</span></td><td>${escapeSection(task.worker)}</td><td>${escapeSection(task.project)}</td><td>${sectionDate(task.due_date)}</td><td><span class="status-pill ${task.status === "Complete" ? "status-ready" : ""}">${escapeSection(task.status)}</span></td></tr>`
    ).join(""));
    const projectSelect = document.querySelector("#assignProject");
    const workerSelect = document.querySelector("#assignWorker");
    const workerProject = document.querySelector("#workerProject");
    const wageWorker = document.querySelector("#wageWorker");
    projectSelect.innerHTML = data.projects.map(project => `<option value="${project.id}">${escapeSection(project.name)}</option>`).join("");
    workerProject.innerHTML = projectSelect.innerHTML;
    const activeWorkers = data.workers.filter(worker => worker.is_active);
    wageWorker.innerHTML = activeWorkers.map(worker =>
      `<option value="${worker.id}">${escapeSection(worker.name)} · ${escapeSection(worker.code)}</option>`
    ).join("");
    function filterWorkers() {
      const projectId = Number(projectSelect.value);
      workerSelect.innerHTML = activeWorkers.filter(worker => worker.project_id === projectId)
        .map(worker => `<option value="${worker.id}">${escapeSection(worker.name)} · ${escapeSection(worker.role)}</option>`).join("");
    }
    projectSelect.onchange = filterWorkers;
    filterWorkers();
  }
  if (section === "activity") bodyRows("activityRows", data.logs.map(log =>
    `<tr><td><strong>${escapeSection(log.task)}</strong>${log.photo_url ? `<br><a class="subtle-cell" href="${escapeSection(log.photo_url)}" target="_blank" rel="noopener">📷 ${escapeSection(log.photo_name || "View photo")}</a>` : ""}</td><td>${escapeSection(log.worker)}</td><td>${escapeSection(log.project)}</td><td><span class="status-pill ${log.status === "Complete" ? "status-ready" : ""}">${escapeSection(log.status)}</span></td><td>${log.completion}%</td><td>${escapeSection(log.issue || "—")}</td><td>${sectionDate(log.created_at.slice(0, 10))}</td></tr>`
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
      `<tr><td><span class="order-reference">${escapeSection(item.sku)}</span></td><td><strong>${escapeSection(item.name)}</strong></td><td>${escapeSection(item.category)}</td><td><strong>${item.quantity} ${escapeSection(item.unit)}</strong></td><td>${item.available} available · ${item.checked_out} out</td><td>${item.reorder_level} ${escapeSection(item.unit)}</td><td>${escapeSection(item.location)}</td><td><span class="status-pill ${item.low_stock ? "" : "status-ready"}">${item.low_stock ? "Reorder" : "In stock"}</span></td></tr>`
    ).join(""));
  }
}

function renderEquipment(data) {
  const itemSelect = document.querySelector("#equipmentItem");
  const projectSelect = document.querySelector("#equipmentProject");
  const workerSelect = document.querySelector("#equipmentWorker");
  itemSelect.innerHTML = data.equipment.map(item =>
    `<option value="${item.id}" data-available="${item.available}" data-unit="${escapeSection(item.unit)}">${escapeSection(item.name)} · ${item.available} ${escapeSection(item.unit)} available</option>`
  ).join("") || `<option value="">No shared equipment tracked</option>`;
  projectSelect.innerHTML = data.projects.map(project =>
    `<option value="${project.id}">${escapeSection(project.name)}</option>`
  ).join("");
  const workersForProject = projectId => data.workers.filter(worker =>
    worker.is_active && worker.project_id === Number(projectId)
  );
  const refreshWorkers = () => {
    workerSelect.innerHTML = workersForProject(projectSelect.value).map(worker =>
      `<option value="${worker.id}">${escapeSection(worker.name)} · ${escapeSection(worker.role)}</option>`
    ).join("");
  };
  projectSelect.onchange = refreshWorkers;
  refreshWorkers();
  const quantityInput = document.querySelector('#equipmentForm [name="quantity"]');
  const checkoutButton = document.querySelector("#equipmentForm button");
  const refreshAvailability = () => {
    const available = Number(itemSelect.selectedOptions[0]?.dataset.available || 0);
    quantityInput.max = String(available);
    quantityInput.disabled = available === 0;
    checkoutButton.disabled = available === 0;
  };
  itemSelect.onchange = refreshAvailability;
  refreshAvailability();

  const checkedOutQuantity = data.checkouts.reduce((total, checkout) => total + checkout.quantity, 0);
  document.querySelector("#equipmentSummary").innerHTML = `
    <article class="inventory-stat"><span>Shared equipment types</span><strong>${data.equipment.length}</strong></article>
    <article class="inventory-stat"><span>Checked out</span><strong>${checkedOutQuantity}</strong></article>
    <article class="inventory-stat"><span>Overdue returns</span><strong class="${data.checkouts.some(checkout => checkout.overdue) ? "inventory-alert-number" : ""}">${data.checkouts.filter(checkout => checkout.overdue).length}</strong></article>`;

  document.querySelector("#equipmentCheckoutRows").innerHTML = data.checkouts.map(checkout => {
    const eligibleProjects = data.projects.filter(project => project.id !== checkout.project_id);
    const projectOptions = eligibleProjects.map((project, index) =>
      `<option value="${project.id}" ${index === 0 ? "selected" : ""}>${escapeSection(project.name)}</option>`
    ).join("");
    const workerOptions = workersForProject(eligibleProjects[0]?.id).map(worker =>
      `<option value="${worker.id}">${escapeSection(worker.name)}</option>`
    ).join("");
    const returnCell = checkout.overdue
      ? `<span class="equipment-overdue">${sectionDate(checkout.expected_return)} · overdue</span>`
      : sectionDate(checkout.expected_return);
    return `<tr><td><strong>${escapeSection(checkout.item)}</strong><br><span class="subtle-cell">${escapeSection(checkout.sku)}</span></td><td>${checkout.quantity} ${escapeSection(data.equipment.find(item => item.id === checkout.item_id)?.unit || "")}</td><td>${escapeSection(checkout.project)}</td><td>${escapeSection(checkout.worker)}</td><td>${returnCell}</td><td><div class="equipment-actions"><select data-transfer-project="${checkout.id}" aria-label="Transfer destination">${projectOptions}</select><select data-transfer-worker="${checkout.id}" aria-label="Transfer responsible worker">${workerOptions}</select><button class="button button-secondary" data-transfer-checkout="${checkout.id}">Transfer</button><button class="button button-secondary" data-return-checkout="${checkout.id}">Check in</button></div></td></tr>`;
  }).join("") || `<tr><td colspan="6">No equipment is currently checked out.</td></tr>`;

  document.querySelector("#equipmentHistoryRows").innerHTML = data.history.map(movement =>
    `<tr><td>${sectionDate(movement.happened_at.slice(0, 10))}</td><td><strong>${escapeSection(movement.item)}</strong><br><span class="subtle-cell">${escapeSection(movement.sku)}</span></td><td>${escapeSection(movement.action)}</td><td>${movement.quantity}</td><td>${escapeSection(movement.from_project)}</td><td>${escapeSection(movement.to_project)}</td><td>${escapeSection(movement.worker)}</td></tr>`
  ).join("") || `<tr><td colspan="7">No equipment movements recorded yet.</td></tr>`;
}

function renderPayroll(data) {
  const totals = data.workers.reduce((summary, worker) => ({
    earned: summary.earned + worker.earned,
    paid: summary.paid + worker.paid,
    advances: summary.advances + worker.advances,
    due: summary.due + worker.balance_due,
  }), { earned: 0, paid: 0, advances: 0, due: 0 });
  document.querySelector("#payrollSummary").innerHTML = `
    <article class="finance-stat"><span>Total wages earned</span><strong>${sectionMoney(totals.earned)}</strong></article>
    <article class="finance-stat"><span>Paid / advanced</span><strong>${sectionMoney(totals.paid + totals.advances)}</strong><small>Payments ${sectionMoney(totals.paid)} · advances ${sectionMoney(totals.advances)}</small></article>
    <article class="finance-stat"><span>Net outstanding</span><strong>${sectionMoney(totals.due)}</strong></article>`;
  const rows = data.entries.map(entry =>
    `<tr><td>${sectionDate(entry.date)}</td><td><strong>${escapeSection(entry.worker)}</strong></td><td>${escapeSection(entry.project)}</td><td>${escapeSection(entry.entry_type)}</td><td>${escapeSection(entry.note || "—")}</td><td><strong>${sectionMoney(entry.amount)}</strong></td></tr>`
  ).join("");
  document.querySelector("#wageRows").innerHTML = rows || `<tr><td colspan="6">No wage entries recorded yet.</td></tr>`;
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
    sectionData = data;
    renderSection(data);
    if (section === "expenses") {
      renderFinancialReport(await sectionRequest("/api/financial-report"));
    }
    if (section === "team") {
      renderPayroll(await sectionRequest("/api/payroll"));
    }
    if (section === "inventory") {
      renderEquipment(await sectionRequest("/api/equipment"));
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
document.querySelector("#openWorkerForm")?.addEventListener("click", () => {
  const panel = document.querySelector("#workerFormPanel");
  panel.classList.toggle("hidden");
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
});
document.querySelector("#jumpWageLedger")?.addEventListener("click", () =>
  document.querySelector("#wageLedgerPanel").scrollIntoView({ behavior: "smooth" })
);
document.querySelector("#workerPayType")?.addEventListener("change", event => {
  document.querySelector("#workerPayHint").textContent =
    event.target.value === "Daily" ? "Amount per work day" : "Amount per month";
});
document.querySelector("#workerRows")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-worker-id]");
  if (!button) return;
  button.disabled = true;
  try {
    await sectionRequest(`/api/workers/${button.dataset.workerId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: button.dataset.nextActive === "true" }),
    });
    await loadSection();
    feedback(button.dataset.nextActive === "true" ? "Worker reactivated." : "Worker deactivated.");
  } catch (error) {
    button.disabled = false;
    feedback(error.message, true);
  }
});
document.querySelector("#workerForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const errorBox = document.querySelector("#workerError");
  errorBox.classList.add("hidden");
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    await sectionRequest("/api/workers", { method: "POST", body: JSON.stringify(payload) });
    event.currentTarget.reset();
    document.querySelector("#workerPayHint").textContent = "Amount per work day";
    await loadSection();
    feedback("Worker registered. They can create their portal account using the worker ID.");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  }
});
if (document.querySelector("#wageDate")) {
  document.querySelector("#wageDate").value = new Date().toISOString().slice(0, 10);
}
document.querySelector("#wageForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const errorBox = document.querySelector("#wageError");
  errorBox.classList.add("hidden");
  try {
    await sectionRequest("/api/wage-ledger", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())),
    });
    const today = new Date().toISOString().slice(0, 10);
    event.currentTarget.reset();
    document.querySelector("#wageDate").value = today;
    await loadSection();
    feedback("Wage ledger entry recorded.");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  }
});
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

if (document.querySelector("#equipmentReturnDate")) {
  document.querySelector("#equipmentReturnDate").value = new Date().toISOString().slice(0, 10);
}
document.querySelector("#equipmentProject")?.addEventListener("change", event => {
  const workerSelect = document.querySelector("#equipmentWorker");
  if (!sectionData) return;
  workerSelect.innerHTML = sectionData.workers.filter(worker =>
    worker.project_id === Number(event.target.value)
  ).map(worker =>
    `<option value="${worker.id}">${escapeSection(worker.name)} · ${escapeSection(worker.role)}</option>`
  ).join("");
});
document.querySelector("#equipmentForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const errorBox = document.querySelector("#equipmentError");
  errorBox.classList.add("hidden");
  try {
    await sectionRequest("/api/equipment/checkouts", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())),
    });
    event.currentTarget.reset();
    document.querySelector("#equipmentReturnDate").value = new Date().toISOString().slice(0, 10);
    await loadSection();
    feedback("Equipment checked out and movement recorded.");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  }
});
document.querySelector("#equipmentCheckoutRows")?.addEventListener("change", event => {
  const projectSelect = event.target.closest("[data-transfer-project]");
  if (!projectSelect || !sectionData) return;
  const workerSelect = document.querySelector(`[data-transfer-worker="${projectSelect.dataset.transferProject}"]`);
  workerSelect.innerHTML = sectionData.workers.filter(worker =>
    worker.project_id === Number(projectSelect.value)
  ).map(worker =>
    `<option value="${worker.id}">${escapeSection(worker.name)} · ${escapeSection(worker.role)}</option>`
  ).join("");
});
document.querySelector("#equipmentCheckoutRows")?.addEventListener("click", async event => {
  const returnButton = event.target.closest("[data-return-checkout]");
  const transferButton = event.target.closest("[data-transfer-checkout]");
  if (!returnButton && !transferButton) return;
  const checkoutId = Number(returnButton ? returnButton.dataset.returnCheckout : transferButton.dataset.transferCheckout);
  const button = returnButton || transferButton;
  button.disabled = true;
  try {
    if (returnButton) {
      await sectionRequest(`/api/equipment/checkouts/${checkoutId}/return`, { method: "POST" });
    } else {
      const projectId = document.querySelector(`[data-transfer-project="${checkoutId}"]`).value;
      const workerId = document.querySelector(`[data-transfer-worker="${checkoutId}"]`).value;
      await sectionRequest(`/api/equipment/checkouts/${checkoutId}/transfer`, {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, worker_id: workerId }),
      });
    }
    await loadSection();
    feedback(returnButton ? "Equipment checked in." : "Equipment transfer recorded.");
  } catch (error) {
    button.disabled = false;
    feedback(error.message, true);
  }
});

document.querySelector("#orderRows")?.addEventListener("change", event => {
  const select = event.target.closest("[data-order-buyer]");
  if (!select) return;
  const orderId = Number(select.dataset.orderBuyer);
  const order = sectionData?.orders?.find(item => item.id === orderId);
  const buyer = sectionData?.workers?.find(worker => worker.id === Number(select.value));
  const link = document.querySelector(`[data-order-whatsapp="${orderId}"]`);
  const href = order && orderWhatsAppHref(order, buyer);
  if (!link) return;
  link.href = href || "";
  link.classList.toggle("hidden", !href);
});
document.querySelector("#orderRows")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-save-order]");
  if (!button) return;
  const orderId = Number(button.dataset.saveOrder);
  const status = document.querySelector(`[data-order-status="${orderId}"]`).value;
  const buyerWorkerId = document.querySelector(`[data-order-buyer="${orderId}"]`).value;
  button.disabled = true;
  try {
    await sectionRequest(`/api/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, buyer_worker_id: buyerWorkerId || null }),
    });
    await loadSection();
    feedback("Purchase order updated.");
  } catch (error) {
    button.disabled = false;
    feedback(error.message, true);
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
