const workerContent = document.querySelector("#workerContent");
const workerEscape = value => String(value ?? "").replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
);
const workerMoney = amount => "$" + Number(amount).toLocaleString("en-US");
const workerDate = value => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
  month: "short", day: "numeric", year: "numeric"
});

async function workerRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const payload = await response.json();
  if (response.status === 401) {
    window.location.assign("/");
    throw new Error("Your session has ended. Sign in again.");
  }
  if (!response.ok) throw new Error(payload.error || "Unable to complete that action.");
  return payload;
}

function renderWorkerPortal(worker) {
  document.querySelector("#workerGreeting").textContent = `Good morning, ${worker.name.split(" ")[0]}.`;
  document.querySelector("#workerToday").textContent = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric"
  });
  workerContent.innerHTML = `
    <div class="worker-summary-grid">
      <article class="worker-data-card worker-project-card"><div class="worker-card-eyebrow">YOUR ASSIGNED PROJECT</div><h2>${workerEscape(worker.project.name)}</h2><p>${workerEscape(worker.project.location)}</p><div class="worker-large-progress"><div><span>Project progress</span><b>${worker.project.progress}%</b></div><div class="progress-track"><div class="progress-fill" style="width:${worker.project.progress}%"></div></div></div></article>
      <article class="worker-data-card worker-pay-card"><div class="worker-card-eyebrow">${worker.pay_type === "Monthly" ? "MONTHLY SALARY" : "DAILY WAGE"}</div><strong>${workerMoney(worker.pay_rate ?? worker.daily_wage)}</strong><span>${worker.pay_type === "Monthly" ? "Monthly rate" : "Daily rate"} · ${workerEscape(worker.role)}</span><div class="worker-id-chip">${workerEscape(worker.code)}</div></article>
      <article class="worker-data-card"><div class="worker-card-eyebrow">SITE SUPERVISOR</div><h2 class="supervisor-name">${workerEscape(worker.supervisor_name)}</h2><p>${workerEscape(worker.supervisor_phone)}</p><a class="button button-secondary" href="tel:${workerEscape(worker.supervisor_phone)}">Call your supervisor ↗</a></article>
    </div>
    <div class="worker-section-grid">
      <section class="worker-data-card"><div class="worker-section-heading"><div><h2>Tasks assigned to you</h2><p>Update a task as you work through it.</p></div><span class="task-count">${worker.assigned_tasks.length}</span></div>
        ${worker.assigned_tasks.length ? `<div class="worker-assigned-tasks">${worker.assigned_tasks.map(task => `<article class="assigned-task"><div class="assigned-task-copy"><strong>${workerEscape(task.title)}</strong><span>${workerEscape(task.project)} · Due ${workerDate(task.due_date)}</span>${task.description ? `<p>${workerEscape(task.description)}</p>` : ""}</div><label class="task-status-label">STATUS<select class="task-status-select" data-task-id="${task.id}"><option ${task.status === "Assigned" ? "selected" : ""}>Assigned</option><option ${task.status === "In progress" ? "selected" : ""}>In progress</option><option ${task.status === "Complete" ? "selected" : ""}>Complete</option></select></label></article>`).join("")}</div>` : `<div class="worker-empty">No tasks have been assigned to you yet.</div>`}
      </section>
      <section class="worker-data-card"><div class="worker-section-heading"><div><h2>Today's schedule</h2><p>Your day on site</p></div></div><div class="worker-schedule"><div class="schedule-item done"><span>✓</span><div><strong>Morning safety briefing</strong><small>7:00 AM</small></div></div><div class="schedule-item"><span>2</span><div><strong>Assigned site work</strong><small>8:00 AM · ${worker.assigned_tasks.length} tasks</small></div></div><div class="schedule-item"><span>3</span><div><strong>Afternoon progress check-in</strong><small>2:30 PM</small></div></div><div class="schedule-item"><span>4</span><div><strong>Site close and sign-out</strong><small>4:30 PM</small></div></div></div></section>
    </div>
    <section class="worker-data-card worker-worklog"><div class="worker-section-heading"><div><h2>Share a progress update</h2><p>Let your supervisor know how the work is going.</p></div></div><form id="workerLogForm"><div class="form-columns"><label>Task or work area<input name="task" placeholder="What did you work on?" required></label><label>Completion<input name="completion" type="number" min="0" max="100" value="50" required></label></div><div class="form-columns"><label>Site photo<input name="photo" type="file" accept="image/*"><span class="field-note">Upload simulation: only the selected filename is recorded.</span></label><label>Report an issue<input name="issue" placeholder="Optional blocker or safety issue"></label></div><div class="form-error hidden" id="workerLogError"></div><button class="button button-primary">Post today's update</button></form></section>
    <section class="worker-data-card worker-recent-logs"><div class="worker-section-heading"><div><h2>Recent work updates</h2><p>Your latest submitted progress reports</p></div></div>${worker.logs.length ? worker.logs.map(log => `<div class="worker-log-row"><span class="live-dot"></span><div><strong>${workerEscape(log.task)}</strong><small>${log.completion}% complete · ${workerEscape(log.status)}${log.issue ? ` · ${workerEscape(log.issue)}` : ""}</small></div></div>`).join("") : `<div class="worker-empty">No work updates submitted yet.</div>`}</section>`;

  document.querySelectorAll(".task-status-select").forEach(select => {
    select.addEventListener("change", async event => {
      event.target.disabled = true;
      try {
        await workerRequest(`/api/tasks/${event.target.dataset.taskId}`, {
          method: "PATCH", body: JSON.stringify({ status: event.target.value })
        });
        showWorkerToast("Task status updated.");
      } catch (error) {
        showWorkerToast(error.message, true);
      } finally {
        event.target.disabled = false;
      }
    });
  });

  document.querySelector("#workerLogForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      task: form.get("task"), completion: form.get("completion"),
      issue: form.get("issue"), photo_name: event.currentTarget.elements.photo.files[0]?.name || ""
    };
    try {
      await workerRequest("/api/work-logs", { method: "POST", body: JSON.stringify(payload) });
      renderWorkerPortal(await workerRequest("/api/worker/me"));
      showWorkerToast("Progress update sent to your supervisor.");
    } catch (error) {
      const errorBox = document.querySelector("#workerLogError");
      if (errorBox) {
        errorBox.textContent = error.message;
        errorBox.classList.remove("hidden");
      } else showWorkerToast(error.message, true);
    }
  });
}

function showWorkerToast(message, error = false) {
  const toast = document.querySelector("#workerToast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.remove("hidden");
  clearTimeout(showWorkerToast.timer);
  showWorkerToast.timer = setTimeout(() => toast.classList.add("hidden"), 3000);
}

document.querySelectorAll("[data-logout]").forEach(button => button.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.assign("/");
}));

workerRequest("/api/worker/me").then(renderWorkerPortal).catch(error => {
  workerContent.innerHTML = `<div class="form-error">${workerEscape(error.message)}</div>`;
});
