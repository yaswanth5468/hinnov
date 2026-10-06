# Fieldwork

A responsive construction-operations portal with an admin dashboard, worker lookup portal, daily site updates, purchase orders, and pickup reminders.

## Run locally

Requires Python 3.10 or newer.

New users can create an account from `/signup` before signing in. Worker accounts are linked to an existing worker ID in the seeded directory; admin accounts can also be created directly from the signup page.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000>. On first run, the app creates and seeds a local SQLite database so the sample portal works immediately. The demo includes purchase orders scheduled for tomorrow; their pickup alarms are calculated from the current date.

## Use MySQL

Install and start MySQL, create a database, then set `DATABASE_URL` before starting the app:

```powershell
$env:DATABASE_URL = "mysql+pymysql://fieldwork:your-password@localhost:3306/fieldwork?charset=utf8mb4"
python app.py
```

The application creates its tables and demo rows on first run. Existing databases are not reseeded. Keep credentials in environment variables; do not commit them.

## Portals and sample worker

- Sign in at `/`. Demo admin: `admin` / `admin123`. Demo worker: `WK-2048` / `worker123`. Demo accounts are for local evaluation only; configure `DEMO_ADMIN_PASSWORD` and `DEMO_WORKER_PASSWORD` before first seed, and set a random `SECRET_KEY` outside development.
- The **Admin portal** has separate pages at `/admin/overview`, `/admin/projects`, `/admin/orders`, `/admin/team`, `/admin/activity`, `/admin/expenses`, and `/admin/inventory`.
- Admins can assign tasks to workers on the same project; workers can view their own tasks and update task status in their separate `/worker` portal.
- Inventory tracks item SKU, category, quantity, unit, reorder threshold, and site location, and flags items at or below their reorder level.
- The notification bell lists urgent pickups scheduled for tomorrow. The alarm toggle plays a short Tone.js chime after a user gesture.
- Admins can post work logs, record expenses against project budgets, inspect the worker directory, and export a project CSV. Workers can post their own logs and simulated site-photo filenames.
- Admins can register workers with a daily wage or monthly salary, assign a project, and deactivate/reactivate worker portal access. Government ID, address, and bank information are not collected.
- The team directory includes a wage ledger for wages earned, payments, and advances. Outstanding balance is calculated as earned wages less payments and advances. Earned wages are added to the project's labor expenses; payments and advances are ledger settlements and are not double-counted as project costs.
- Purchase orders can name an active buyer assigned to the same project, include an order total, and move through Pending Pickup, Picked Up, and Delivered to Site. The order page provides a WhatsApp link with the voucher, supplier, item, project, pickup date, and total for the buyer.
- The expenses page summarizes the complete expense ledger by project and cost category, compares project spending with budgets, exports all ledger rows as CSV, and provides a print-to-PDF report.

## API

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` — session-based portal sign-in.
- `GET /api/dashboard` — admin-only project, team, inventory, assignment, expense, work-log, order, metric, and alarm data.
- `GET /api/financial-report` — admin-only complete expense ledger and per-project/category financial aggregates.
- `GET /api/worker/me` — signed-in worker's own assignment, tasks, supervisor details, wage, and updates.
- `POST /api/workers` and `PATCH /api/workers/<id>` — admin-only worker registration and active-status management.
- `GET /api/payroll` and `POST /api/wage-ledger` — admin-only wage balances and wage/advance ledger entries.
- `POST /api/tasks` — admin-only worker task assignment.
- `PATCH /api/tasks/<id>` — allow the assigned worker to update their own task status.
- `POST /api/inventory` — admin-only create/update stock by SKU.
- `POST /api/work-logs` — admin or signed-in worker daily task update; worker accounts can only post for themselves.
- `POST /api/orders` and `POST /api/expenses` — admin-only procurement and project finance updates.
- `PATCH /api/orders/<id>` — admin-only buyer assignment and purchase order status update.

Site-photo selection is simulated by recording the selected filename; image storage is not configured. This is a starter/demo authentication flow; add HTTPS, rotate demo credentials, set a strong secret key, and review production security before public deployment.
