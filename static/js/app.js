const state = { data: null, soundEnabled: false, dismissedAlarm: false, alarmCount: 0 };
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const money = value => "$" + Number(value || 0).toLocaleString("en-US");
const dateLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
  month: "short", day: "numeric"
});
const timeAgo = value => {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} hr ago`;
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function projectColors(index) {
  return [
    ["#edf3eb", "#65846a", "⌂"],
    ["#f0eef8", "#8378b4", "▧"],
    ["#fbf0e8", "#c7835d", "⌑"]
  ][index % 3];
}

function renderProjects() {
  const host = $("#projectList");
  host.innerHTML = state.data.projects.map((project, index) => {
    const [background, color, icon] = projectColors(index);
    const milestones = [["Planning", 15], ["Foundation", 35], ["Structure", 65], ["Finishing", 88]]
      .map(([label, threshold]) => {
        const milestoneState = project.progress >= threshold ? "complete" :
          (project.progress >= threshold - 20 ? "current" : "");
        return `<span class="milestone ${milestoneState}"><i></i>${label}</span>`;
      }).join("");
    return `<div class="project-row">
      <div class="project-symbol" style="background:${background};color:${color}">${icon}</div>
      <div class="project-info"><strong>${escapeHtml(project.name)}</strong><span>${escapeHtml(project.location)} · ${project.team_size} on site</span></div>
      <div class="project-progress"><div class="progress-label"><span>Progress</span><b>${project.progress}%</b></div><div class="progress-track"><div class="progress-fill" style="width:${project.progress}%"></div></div></div>
      <div class="project-due">${dateLabel(project.due_date)}</div>
      <div class="project-milestones">${milestones}</div>
    </div>`;
  }).join("");
}

function renderActivity() {
  const host = $("#activityList");
  const colors = [["#eaf0fa", "#617da4"], ["#f9eee8", "#b77557"], ["#eaf3eb", "#64866a"]];
  host.innerHTML = state.data.logs.slice(0, 3).map((log, index) => {
    const worker = log.worker.split(" ");
    const initials = `${worker[0][0]}${worker[worker.length - 1][0]}`;
    const [background, color] = colors[index % colors.length];
    return `<div class="activity-item"><div class="activity-avatar" style="background:${background};color:${color}">${escapeHtml(initials)}</div><div class="activity-message"><strong>${escapeHtml(log.worker)}</strong> posted an update for ${escapeHtml(log.project)}<span>${escapeHtml(log.task)} · ${timeAgo(log.created_at)}</span>${log.issue ? `<span class="activity-alert">⚑ ${escapeHtml(log.issue)}</span>` : ""}</div></div>`;
  }).join("") || `<div class="activity-item"><div class="activity-message">No site updates yet.</div></div>`;
}

function renderOrders() {
  const host = $("#orderRows");
  host.innerHTML = state.data.orders.slice(0, 4).map(order => {
    const urgent = order.pickup_date === tomorrowIso();
    const orderBuyerChoices = state.data.workers.filter(worker =>
      worker.is_active && worker.project_id === order.project_id
    ).map(worker =>
      `<option value="${worker.id}" ${worker.id === order.buyer_worker_id ? "selected" : ""}>${escapeHtml(worker.name)}</option>`
    ).join("");
    const message = [
      `BuildPro pickup instructions — ${order.reference}`,
      `Buyer: ${order.buyer || ""}`,
      `Supplier: ${order.supplier}`,
      `Item: ${order.item} (${order.quantity})`,
      `Project: ${order.project}`,
      `Pickup date: ${order.pickup_date}`,
      `Total: ${money(order.total_cost)}`,
    ].join("\n");
    const buyerPhone = state.data.workers.find(worker => worker.id === order.buyer_worker_id)?.phone || "";
    const phoneDigits = buyerPhone.replace(/\D/g, "");
    const whatsappHref = phoneDigits
      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`
      : "";
    const statusOptions = ["Pending Pickup", "Picked Up", "Delivered to Site"].map(status =>
      `<option value="${status}" ${status === order.status ? "selected" : ""}>${status}</option>`
    ).join("");
    return `<tr><td><span class="order-reference">${escapeHtml(order.reference)}</span></td><td>${escapeHtml(order.supplier)}</td><td>${escapeHtml(order.item)} <span style="color:#a2a69f">· ${escapeHtml(order.quantity)}</span></td><td class="project-cell">${escapeHtml(order.project)}</td><td class="${urgent ? "date-urgent" : ""}">${urgent ? "Tomorrow · " : ""}${dateLabel(order.pickup_date)}</td><td><span class="status-pill ${order.status === "Delivered to Site" ? "status-ready" : urgent ? "" : "status-ready"}">${escapeHtml(order.status)}</span><select class="order-status-select" data-order-status="${order.id}" aria-label="Update order status">${statusOptions}</select></td><td><select class="order-buyer-select" data-order-buyer="${order.id}" aria-label="Assign order buyer"><option value="">Select buyer</option>${orderBuyerChoices}</select><div class="order-action-links"><a class="order-dispatch-link ${whatsappHref ? "" : "hidden"}" data-order-whatsapp="${order.id}" href="${escapeHtml(whatsappHref)}" target="_blank" rel="noopener noreferrer">WhatsApp</a><button class="order-save-button" data-save-order="${order.id}">Save</button></div></td></tr>`;
  }).join("");
}

function renderWorkers() {
  const projectNames = new Map(state.data.projects.map(project => [project.id, project.name]));
  $("#workerRows").innerHTML = state.data.workers.map((worker, index) => {
    const initials = worker.name.split(" ").map(part => part[0]).slice(0, 2).join("");
    return `<tr><td><span class="directory-worker"><span class="directory-avatar directory-color-${index % 3}">${escapeHtml(initials)}</span><strong>${escapeHtml(worker.name)}</strong></span></td><td>${escapeHtml(worker.role)}</td><td><span class="order-reference">${escapeHtml(worker.code)}</span></td><td>${escapeHtml(projectNames.get(worker.project_id) || "—")}</td><td><a class="directory-phone" href="tel:${escapeHtml(worker.phone)}">${escapeHtml(worker.phone)}</a></td></tr>`;
  }).join("");
}

function renderExpenses() {
  $("#expenseList").innerHTML = state.data.expenses.map(expense =>
    `<div class="expense-row"><span class="expense-icon">${escapeHtml(expense.category[0])}</span><span class="expense-description"><strong>${escapeHtml(expense.description)}</strong><small>${escapeHtml(expense.project)} · ${dateLabel(expense.date)}</small></span><b>${money(expense.amount)}</b></div>`
  ).join("") || `<div class="expense-empty">No expenses logged yet.</div>`;
}

function renderNotifications() {
  const alarms = state.data.alarms;
  const badge = $("#bellBadge");
  badge.textContent = alarms.length;
  badge.classList.toggle("hidden", alarms.length === 0);
  $("#alarmCount").textContent = alarms.length;
  $("#orderNavCount").textContent = alarms.length;
  $("#notificationSummary").textContent = alarms.length
    ? `${alarms.length} pickup${alarms.length === 1 ? "" : "s"} need your attention`
    : "You’re all caught up";
  const banner = $("#alarmBanner");
  banner.classList.toggle("hidden", state.dismissedAlarm || alarms.length === 0);
  $("#notificationList").innerHTML = alarms.length ? alarms.map(order =>
    `<div class="notification-item"><div class="notification-icon">⚠</div><div><strong>${escapeHtml(order.reference)} pickup tomorrow</strong><span>${escapeHtml(order.item)} · ${escapeHtml(order.supplier)}</span><time>${escapeHtml(order.project)} · ${dateLabel(order.pickup_date)}</time></div></div>`
  ).join("") : `<div class="notification-item"><div class="notification-icon">✓</div><div><strong>No urgent pickups</strong><span>New alerts will appear here.</span></div></div>`;
}

function renderDashboard(data) {
  const newAlarm = data.alarms.length > state.alarmCount;
  state.data = data;
  state.alarmCount = data.alarms.length;
  $("#activeMetric").textContent = data.metrics.active_projects;
  $("#workerMetric").textContent = data.metrics.workers_on_site;
  $("#issueMetric").textContent = data.metrics.open_issues;
  const budget = data.projects.reduce((sum, project) => sum + project.budget, 0);
  const spent = data.projects.reduce((sum, project) => sum + project.spent, 0);
  $("#budgetMetric").textContent = budget ? `${(spent / budget * 100).toFixed(1)}%` : "0%";
  $("#projectNavCount").textContent = data.projects.length;
  renderProjects();
  renderActivity();
  renderOrders();
  renderWorkers();
  renderExpenses();
  renderNotifications();
  const projectOptions = data.projects.map(project =>
    `<option value="${project.id}">${escapeHtml(project.name)}</option>`
  ).join("");
  $("#orderProject").innerHTML = projectOptions;
  $("#expenseProject").innerHTML = projectOptions;
  const activeWorkers = data.workers.filter(worker => worker.is_active);
  const orderBuyerSelect = $("#orderBuyer");
  function updateOrderBuyers() {
    const projectId = Number($("#orderProject").value);
    orderBuyerSelect.innerHTML = activeWorkers.filter(worker => worker.project_id === projectId)
      .map(worker => `<option value="${worker.id}">${escapeHtml(worker.name)} · ${escapeHtml(worker.role)}</option>`)
      .join("");
  }
  $("#orderProject").onchange = updateOrderBuyers;
  updateOrderBuyers();
  $("#logWorker").innerHTML = data.workers.map(worker =>
    `<option value="${worker.id}">${escapeHtml(worker.name)} · ${escapeHtml(worker.role)}</option>`
  ).join("");
  if (newAlarm) {
    state.dismissedAlarm = false;
    if (state.soundEnabled) playAlarm();
  }
}

function tomorrowIso() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const offset = tomorrow.getTimezoneOffset();
  return new Date(tomorrow.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function showToast(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 3000);
}

async function loadDashboard() {
  try {
    renderDashboard(await requestJson("/api/dashboard"));
  } catch (error) {
    if (error.message.includes("authorized account") || error.message.includes("Sign in")) {
      window.location.assign("/");
      return;
    }
    showToast(error.message, true);
  }
}

$("#todayLabel").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "2-digit" }).toUpperCase();
$$("[data-logout]").forEach(button => button.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.assign("/");
}));
$("#notificationTrigger").addEventListener("click", () => $("#notificationPopover").classList.toggle("hidden"));
$("#orderRows").addEventListener("change", event => {
  const buyerSelect = event.target.closest("[data-order-buyer]");
  if (!buyerSelect) return;
  const order = state.data.orders.find(item => item.id === Number(buyerSelect.dataset.orderBuyer));
  const buyer = state.data.workers.find(worker => worker.id === Number(buyerSelect.value));
  const link = $(`[data-order-whatsapp="${buyerSelect.dataset.orderBuyer}"]`);
  if (!order || !buyer || !link) {
    link?.classList.add("hidden");
    return;
  }
  const phoneDigits = buyer.phone.replace(/\D/g, "");
  const message = [
    `BuildPro pickup instructions — ${order.reference}`,
    `Buyer: ${buyer.name}`,
    `Supplier: ${order.supplier}`,
    `Item: ${order.item} (${order.quantity})`,
    `Project: ${order.project}`,
    `Pickup date: ${order.pickup_date}`,
    `Total: ${money(order.total_cost)}`,
  ].join("\n");
  link.href = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
  link.classList.toggle("hidden", !phoneDigits);
});
$("#orderRows").addEventListener("click", async event => {
  const button = event.target.closest("[data-save-order]");
  if (!button) return;
  const orderId = Number(button.dataset.saveOrder);
  const status = $(`[data-order-status="${orderId}"]`).value;
  const buyerWorkerId = $(`[data-order-buyer="${orderId}"]`).value;
  button.disabled = true;
  try {
    await requestJson(`/api/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, buyer_worker_id: buyerWorkerId || null }),
    });
    await loadDashboard();
    showToast("Purchase order updated");
  } catch (error) {
    button.disabled = false;
    showToast(error.message, true);
  }
});
$("#dismissBanner").addEventListener("click", () => {
  state.dismissedAlarm = true;
  $("#alarmBanner").classList.add("hidden");
});
$("#markRead").addEventListener("click", () => {
  state.dismissedAlarm = true;
  $("#notificationPopover").classList.add("hidden");
  $("#alarmBanner").classList.add("hidden");
});
$("#soundToggle").addEventListener("click", async () => {
  state.soundEnabled = !state.soundEnabled;
  const toggle = $("#soundToggle");
  toggle.setAttribute("aria-checked", String(state.soundEnabled));
  if (state.soundEnabled) {
    if (!window.Tone) {
      state.soundEnabled = false;
      toggle.setAttribute("aria-checked", "false");
      showToast("Alarm audio is unavailable. Check your connection and try again.", true);
      return;
    }
    try {
      await Tone.start();
    } catch (error) {
      state.soundEnabled = false;
      toggle.setAttribute("aria-checked", "false");
      showToast("Could not start alarm audio. Please try again.", true);
      return;
    }
    playAlarm();
    showToast("Alarm chime enabled");
  } else showToast("Alarm chime disabled");
});
function playAlarm() {
  if (!window.Tone || !state.soundEnabled) return;
  const synth = new Tone.Synth().toDestination();
  synth.triggerAttackRelease("A5", "8n");
  setTimeout(() => synth.triggerAttackRelease("E6", "8n"), 140);
  setTimeout(() => synth.dispose(), 1000);
}
$("#newOrderButton").addEventListener("click", () => {
  $("#orderError").classList.add("hidden");
  $("#orderModal").classList.remove("hidden");
  $("#orderForm").elements.pickup_date.value = tomorrowIso();
  $("#orderProject").dispatchEvent(new Event("change"));
});
function openExpenseForm() {
  $("#expenseError").classList.add("hidden");
  $("#expenseModal").classList.remove("hidden");
  $("#expenseDate").value = new Date().toISOString().slice(0, 10);
}
$("#newExpenseButton").addEventListener("click", openExpenseForm);
$("#panelExpenseButton").addEventListener("click", openExpenseForm);
$("#newLogButton").addEventListener("click", () => {
  $("#logError").classList.add("hidden");
  $("#logModal").classList.remove("hidden");
});
$$("[data-close-modal]").forEach(button => button.addEventListener("click", () => button.closest(".modal-backdrop").classList.add("hidden")));
$("#orderModal").addEventListener("click", event => {
  if (event.target === $("#orderModal")) $("#orderModal").classList.add("hidden");
});
$("#logModal").addEventListener("click", event => {
  if (event.target === $("#logModal")) $("#logModal").classList.add("hidden");
});
$("#completionRange").addEventListener("input", event => {
  $("#completionValue").textContent = `${event.target.value}%`;
});
$("#orderForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  try {
    await requestJson("/api/orders", { method: "POST", body: JSON.stringify(payload) });
    $("#orderModal").classList.add("hidden");
    event.currentTarget.reset();
    $("#orderProject").dispatchEvent(new Event("change"));
    await loadDashboard();
    showToast("Purchase order created");
  } catch (error) {
    $("#orderError").textContent = error.message;
    $("#orderError").classList.remove("hidden");
  }
});
$("#expenseForm").addEventListener("submit", async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    await requestJson("/api/expenses", { method: "POST", body: JSON.stringify(payload) });
    $("#expenseModal").classList.add("hidden");
    event.currentTarget.reset();
    await loadDashboard();
    showToast("Expense added to project budget");
  } catch (error) {
    $("#expenseError").textContent = error.message;
    $("#expenseError").classList.remove("hidden");
  }
});
$("#logForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = {
    worker_id: form.get("worker_id"),
    task: form.get("task"),
    completion: form.get("completion"),
    issue: form.get("issue"),
    photo_name: $("#photoInput").files[0]?.name || ""
  };
  try {
    await requestJson("/api/work-logs", { method: "POST", body: JSON.stringify(payload) });
    $("#logModal").classList.add("hidden");
    event.currentTarget.reset();
    $("#completionValue").textContent = "50%";
    await loadDashboard();
    showToast("Daily work log posted");
  } catch (error) {
    $("#logError").textContent = error.message;
    $("#logError").classList.remove("hidden");
  }
});
$("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#exportButton").addEventListener("click", () => {
  if (!state.data) return;
  const csv = [
    ["Project", "Client", "Location", "Progress", "Budget", "Spent", "Due date"],
    ...state.data.projects.map(project => [project.name, project.client, project.location, `${project.progress}%`, project.budget, project.spent, project.due_date])
  ].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "fieldwork-project-report.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Project report exported");
});

loadDashboard();
setInterval(loadDashboard, 60000);
