import os
from functools import wraps
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()


class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    client = db.Column(db.String(120), nullable=False)
    location = db.Column(db.String(160), nullable=False)
    status = db.Column(db.String(32), nullable=False, default="In progress")
    progress = db.Column(db.Integer, nullable=False, default=0)
    budget = db.Column(db.Integer, nullable=False, default=0)
    spent = db.Column(db.Integer, nullable=False, default=0)
    due_date = db.Column(db.Date, nullable=False)


class Worker(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(32), nullable=False, unique=True)
    worker_code = db.Column(db.String(32), nullable=False, unique=True)
    role = db.Column(db.String(64), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False)
    daily_wage = db.Column(db.Integer, nullable=False)
    pay_type = db.Column(db.String(16), nullable=False, default="Daily")
    monthly_salary = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    supervisor_name = db.Column(db.String(120), nullable=False)
    supervisor_phone = db.Column(db.String(32), nullable=False)
    project = db.relationship("Project")


class WageLedgerEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    worker_id = db.Column(db.Integer, db.ForeignKey("worker.id"), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False)
    entry_type = db.Column(db.String(16), nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    entry_date = db.Column(db.Date, nullable=False, default=date.today)
    note = db.Column(db.String(240), nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    worker = db.relationship("Worker")
    project = db.relationship("Project")


class PurchaseOrder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    reference = db.Column(db.String(32), nullable=False, unique=True)
    supplier = db.Column(db.String(120), nullable=False)
    item = db.Column(db.String(120), nullable=False)
    quantity = db.Column(db.String(80), nullable=False)
    pickup_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(32), nullable=False, default="Ready for pickup")
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False)
    project = db.relationship("Project")


class WorkLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False)
    worker_id = db.Column(db.Integer, db.ForeignKey("worker.id"), nullable=False)
    task = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(32), nullable=False)
    completion = db.Column(db.Integer, nullable=False)
    issue = db.Column(db.String(500), nullable=False, default="")
    photo_name = db.Column(db.String(255), nullable=False, default="")
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    worker = db.relationship("Worker")
    project = db.relationship("Project")


class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False)
    description = db.Column(db.String(160), nullable=False)
    category = db.Column(db.String(64), nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    expense_date = db.Column(db.Date, nullable=False, default=date.today)
    project = db.relationship("Project")


class LoginAccount(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(16), nullable=False)
    worker_id = db.Column(db.Integer, db.ForeignKey("worker.id"), nullable=True, unique=True)
    worker = db.relationship("Worker")


class AssignedTask(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(180), nullable=False)
    description = db.Column(db.String(500), nullable=False, default="")
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False)
    worker_id = db.Column(db.Integer, db.ForeignKey("worker.id"), nullable=False)
    due_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(24), nullable=False, default="Assigned")
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    project = db.relationship("Project")
    worker = db.relationship("Worker")


class InventoryItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sku = db.Column(db.String(32), nullable=False, unique=True)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(64), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    unit = db.Column(db.String(24), nullable=False)
    reorder_level = db.Column(db.Integer, nullable=False)
    location = db.Column(db.String(120), nullable=False)


def _seed_accounts():
    if not LoginAccount.query.filter_by(username="admin").first():
        db.session.add(LoginAccount(
            username="admin",
            password_hash=generate_password_hash(os.getenv("DEMO_ADMIN_PASSWORD", "admin123")),
            role="admin",
        ))
    demo_worker_codes = {"WK-2048", "WK-2051", "WK-1986", "WK-1972"}
    for worker in Worker.query.filter(Worker.worker_code.in_(demo_worker_codes), Worker.is_active.is_(True)).all():
        if not LoginAccount.query.filter_by(username=worker.worker_code).first():
            db.session.add(LoginAccount(
                username=worker.worker_code,
                password_hash=generate_password_hash(
                    os.getenv("DEMO_WORKER_PASSWORD", "worker123")
                ),
                role="worker",
                worker_id=worker.id,
            ))
    if not InventoryItem.query.first():
        db.session.add_all([
            InventoryItem(sku="MAT-STEEL-01", name="Reinforcement bars", category="Materials", quantity=2400, unit="kg", reorder_level=500, location="Harbor Point · Yard A"),
            InventoryItem(sku="MAT-SHEET-02", name="Metal sheets", category="Materials", quantity=180, unit="sheets", reorder_level=40, location="Cedar & Stone · Store B"),
            InventoryItem(sku="TOOL-DRILL-03", name="Cordless drill kits", category="Tools", quantity=12, unit="kits", reorder_level=5, location="Westlake Hub · Tool cage"),
            InventoryItem(sku="SAFE-HARN-04", name="Safety harnesses", category="Safety", quantity=8, unit="units", reorder_level=10, location="Harbor Point · Safety locker"),
            InventoryItem(sku="MAT-CEMENT-05", name="Rapid-set cement", category="Materials", quantity=320, unit="bags", reorder_level=60, location="Cedar & Stone · Store A"),
        ])
    if not AssignedTask.query.first():
        first_worker = Worker.query.order_by(Worker.id).first()
        if first_worker:
            db.session.add(AssignedTask(
                title="Complete level 4 steel reinforcement",
                description="Finish the east-side reinforcement and post a progress update.",
                project_id=first_worker.project_id,
                worker_id=first_worker.id,
                due_date=date.today(),
            ))
    db.session.commit()


def _seed_data():
    if Project.query.first():
        return

    today = date.today()
    projects = [
        Project(
            name="Harbor Point Residences",
            client="Northline Developments",
            location="Pier 7, San Francisco",
            progress=72,
            budget=2480000,
            spent=1763200,
            due_date=today + timedelta(days=38),
        ),
        Project(
            name="Cedar & Stone Offices",
            client="Cedar Works",
            location="Mission District, San Francisco",
            progress=46,
            budget=1850000,
            spent=912400,
            due_date=today + timedelta(days=64),
        ),
        Project(
            name="Westlake Community Hub",
            client="Westlake Council",
            location="Oakland, California",
            progress=88,
            budget=960000,
            spent=824600,
            due_date=today + timedelta(days=18),
        ),
    ]
    db.session.add_all(projects)
    db.session.flush()

    workers = [
        Worker(
            full_name="Marcus Rivera", phone="+1 415 555 0184", worker_code="WK-2048",
            role="Steel fixer", project_id=projects[0].id, daily_wage=280,
            supervisor_name="Elena Brooks", supervisor_phone="+1 415 555 0120",
        ),
        Worker(
            full_name="Aisha Patel", phone="+1 415 555 0162", worker_code="WK-2051",
            role="Site electrician", project_id=projects[0].id, daily_wage=310,
            supervisor_name="Elena Brooks", supervisor_phone="+1 415 555 0120",
        ),
        Worker(
            full_name="Daniel Kim", phone="+1 510 555 0149", worker_code="WK-1986",
            role="Carpenter", project_id=projects[1].id, daily_wage=265,
            supervisor_name="Theo Martin", supervisor_phone="+1 510 555 0113",
        ),
        Worker(
            full_name="Sofia Bennett", phone="+1 510 555 0175", worker_code="WK-1972",
            role="Site supervisor", project_id=projects[2].id, daily_wage=340,
            supervisor_name="Sofia Bennett", supervisor_phone="+1 510 555 0175",
        ),
    ]
    db.session.add_all(workers)
    db.session.flush()
    db.session.add_all([
        PurchaseOrder(
            reference="PO-2841", supplier="Pacific Steel Co.", item="Reinforcement bars",
            quantity="2.4 tons", pickup_date=today + timedelta(days=1), project_id=projects[0].id,
        ),
        PurchaseOrder(
            reference="PO-2846", supplier="Bay Building Supply", item="Metal sheets",
            quantity="180 sheets", pickup_date=today + timedelta(days=1), project_id=projects[1].id,
        ),
        PurchaseOrder(
            reference="PO-2833", supplier="Golden Gate Tools", item="Cordless tool kits",
            quantity="12 kits", pickup_date=today + timedelta(days=3), project_id=projects[2].id,
        ),
    ])
    db.session.add_all([
        WorkLog(
            project_id=projects[0].id, worker_id=workers[0].id, task="Level 4 — steel reinforcement",
            status="In progress", completion=82, issue="", photo_name="",
            created_at=datetime.now(timezone.utc) - timedelta(minutes=24),
        ),
        WorkLog(
            project_id=projects[1].id, worker_id=workers[2].id, task="East wing — formwork",
            status="Needs attention", completion=54, issue="Two support beams need replacement.",
            photo_name="", created_at=datetime.now(timezone.utc) - timedelta(minutes=48),
        ),
    ])
    db.session.commit()
    db.session.add_all([
        Expense(project_id=projects[0].id, description="Safety harness replacement", category="Equipment", amount=640, expense_date=today),
        Expense(project_id=projects[1].id, description="Concrete delivery surcharge", category="Materials", amount=1280, expense_date=today - timedelta(days=1)),
    ])
    db.session.commit()


def _project_data(project):
    return {
        "id": project.id,
        "name": project.name,
        "client": project.client,
        "location": project.location,
        "status": project.status,
        "progress": project.progress,
        "budget": project.budget,
        "spent": project.spent,
        "due_date": project.due_date.isoformat(),
        "team_size": Worker.query.filter_by(project_id=project.id).count(),
    }


def _order_data(order):
    return {
        "id": order.id,
        "reference": order.reference,
        "supplier": order.supplier,
        "item": order.item,
        "quantity": order.quantity,
        "pickup_date": order.pickup_date.isoformat(),
        "status": order.status,
        "project_id": order.project_id,
        "project": order.project.name,
    }


def _log_data(log):
    return {
        "id": log.id,
        "project_id": log.project_id,
        "project": log.project.name,
        "worker": log.worker.full_name,
        "task": log.task,
        "status": log.status,
        "completion": log.completion,
        "issue": log.issue,
        "photo_name": log.photo_name,
        "created_at": log.created_at.isoformat() + "Z",
    }


def _task_data(task):
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "project_id": task.project_id,
        "project": task.project.name,
        "worker_id": task.worker_id,
        "worker": task.worker.full_name,
        "due_date": task.due_date.isoformat(),
        "status": task.status,
    }


def _inventory_data(item):
    return {
        "id": item.id,
        "sku": item.sku,
        "name": item.name,
        "category": item.category,
        "quantity": item.quantity,
        "unit": item.unit,
        "reorder_level": item.reorder_level,
        "location": item.location,
        "low_stock": item.quantity <= item.reorder_level,
    }


FINANCIAL_CATEGORIES = (
    "Materials",
    "Worker Wages & Salaries",
    "Food & Allowances",
    "Tool & Equipment",
    "Other",
)


def _financial_category(category):
    normalized = category.strip().lower()
    if normalized in {"material", "materials"}:
        return "Materials"
    if normalized in {"labor", "labour", "wage", "wages", "salary", "salaries", "worker wages & salaries"}:
        return "Worker Wages & Salaries"
    if normalized in {"food", "allowance", "allowances", "food & allowances"}:
        return "Food & Allowances"
    if normalized in {"tool", "tools", "equipment", "tool & equipment"}:
        return "Tool & Equipment"
    return "Other"


def _upgrade_schema():
    worker_columns = {column["name"] for column in inspect(db.engine).get_columns("worker")}
    additions = {
        "pay_type": "VARCHAR(16) NOT NULL DEFAULT 'Daily'",
        "monthly_salary": "INTEGER NOT NULL DEFAULT 0",
        "is_active": "BOOLEAN NOT NULL DEFAULT 1",
    }
    for column, definition in additions.items():
        if column not in worker_columns:
            db.session.execute(text(f"ALTER TABLE worker ADD COLUMN {column} {definition}"))
    db.session.commit()


def _worker_data(worker):
    return {
        "id": worker.id,
        "name": worker.full_name,
        "phone": worker.phone,
        "code": worker.worker_code,
        "role": worker.role,
        "project_id": worker.project_id,
        "project": worker.project.name,
        "pay_type": worker.pay_type,
        "pay_rate": worker.daily_wage if worker.pay_type == "Daily" else worker.monthly_salary,
        "daily_wage": worker.daily_wage,
        "monthly_salary": worker.monthly_salary,
        "is_active": worker.is_active,
    }


def _wage_entry_data(entry):
    return {
        "id": entry.id,
        "worker_id": entry.worker_id,
        "worker": entry.worker.full_name,
        "project_id": entry.project_id,
        "project": entry.project.name,
        "entry_type": entry.entry_type,
        "amount": entry.amount,
        "date": entry.entry_date.isoformat(),
        "note": entry.note,
    }


def require_role(*roles):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if session.get("role") not in roles:
                return jsonify({"error": "Sign in with an authorized account to continue."}), 401
            if session.get("role") == "worker":
                worker = db.session.get(Worker, session.get("worker_id"))
                if not worker or not worker.is_active:
                    session.clear()
                    return jsonify({"error": "This worker account is inactive. Contact an administrator."}), 403
            return view(*args, **kwargs)
        return wrapped
    return decorator


def create_app(database_url=None):
    app = Flask(__name__)
    app.secret_key = os.getenv("SECRET_KEY", "development-only-change-me")
    app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")
    default_db = "sqlite:///" + str(Path(app.instance_path) / "siteflow.db").replace("\\", "/")
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url or os.getenv("DATABASE_URL", default_db)
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    db.init_app(app)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)

    with app.app_context():
        db.create_all()
        _upgrade_schema()
        _seed_data()
        _seed_accounts()

    @app.get("/")
    def index():
        if session.get("role") == "admin":
            return redirect(url_for("admin_page", section="overview"))
        if session.get("role") == "worker":
            return redirect(url_for("worker_page"))
        return render_template("login.html")

    @app.get("/signup")
    def signup_page():
        if session.get("role") == "admin":
            return redirect(url_for("admin_page", section="overview"))
        if session.get("role") == "worker":
            return redirect(url_for("worker_page"))
        return render_template("signup.html")

    @app.post("/api/auth/signup")
    def signup():
        data = request.get_json(silent=True) or request.form.to_dict()
        role = str(data.get("role", "")).strip().lower()
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", ""))
        confirm_password = str(data.get("confirm_password", ""))
        full_name = str(data.get("full_name", "")).strip()
        phone = str(data.get("phone", "")).strip()

        if not role or not username or not password or password != confirm_password:
            return jsonify({"error": "Complete every field and confirm the password before continuing."}), 400
        if len(password) < 6:
            return jsonify({"error": "Choose a password with at least 6 characters."}), 400

        if role == "admin":
            if LoginAccount.query.filter_by(username=username).first():
                return jsonify({"error": "That username is already in use. Pick another one."}), 409
            account = LoginAccount(
                username=username,
                password_hash=generate_password_hash(password),
                role="admin",
            )
            db.session.add(account)
            db.session.commit()
            session.clear()
            session["account_id"] = account.id
            session["role"] = account.role
            return jsonify({"role": account.role, "redirect": "/admin/overview"}), 201

        candidate = username.strip().upper()
        worker = Worker.query.filter_by(worker_code=candidate).first()
        if not worker:
            return jsonify({"error": "We could not match that worker ID. Use the code from your team profile."}), 404
        if not worker.is_active:
            return jsonify({"error": "This worker profile is inactive. Contact an administrator."}), 403
        if phone and worker.phone and phone != worker.phone:
            return jsonify({"error": "That phone number does not match the worker record for this ID."}), 400
        if full_name and worker.full_name and full_name.lower() != worker.full_name.lower():
            return jsonify({"error": "That name does not match the worker record for this ID."}), 400
        if LoginAccount.query.filter_by(username=candidate).first():
            return jsonify({"error": "This worker account already exists. Sign in instead."}), 409

        account = LoginAccount(
            username=candidate,
            password_hash=generate_password_hash(password),
            role="worker",
            worker_id=worker.id,
        )
        db.session.add(account)
        db.session.commit()
        session.clear()
        session["account_id"] = account.id
        session["role"] = account.role
        session["worker_id"] = worker.id
        return jsonify({"role": account.role, "redirect": "/worker"}), 201

    @app.get("/admin/<section>")
    def admin_page(section):
        sections = {
            "overview": ("Overview", "index.html"),
            "projects": ("Projects", "section.html"),
            "orders": ("Purchase orders", "section.html"),
            "team": ("Team directory", "section.html"),
            "activity": ("Site activity", "section.html"),
            "expenses": ("Expenses", "section.html"),
            "inventory": ("Inventory", "section.html"),
        }
        if section not in sections:
            return render_template("section.html", section="not-found", title="Page not found"), 404
        if session.get("role") != "admin":
            return redirect(url_for("index"))
        title, template = sections[section]
        return render_template(template, section=section, title=title)

    @app.get("/worker")
    def worker_page():
        if session.get("role") != "worker":
            return redirect(url_for("index"))
        return render_template("worker.html")

    @app.post("/api/auth/login")
    def login():
        data = request.get_json(silent=True) or {}
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", ""))
        role = str(data.get("role", ""))
        account = LoginAccount.query.filter_by(username=username).first()
        if not account or account.role != role or not check_password_hash(account.password_hash, password):
            return jsonify({"error": "Check your login details and selected portal."}), 401
        if account.worker and not account.worker.is_active:
            return jsonify({"error": "This worker profile is inactive. Contact an administrator."}), 403
        session.clear()
        session["account_id"] = account.id
        session["role"] = account.role
        session["worker_id"] = account.worker_id
        return jsonify({"role": account.role, "redirect": "/admin/overview" if role == "admin" else "/worker"})

    @app.get("/api/auth/me")
    def current_user():
        account = db.session.get(LoginAccount, session.get("account_id"))
        if not account:
            return jsonify({"error": "Please sign in."}), 401
        return jsonify({
            "username": account.username,
            "role": account.role,
            "name": account.worker.full_name if account.worker else "Jordan Davis",
        })

    @app.post("/api/auth/logout")
    def logout():
        session.clear()
        return jsonify({"redirect": "/"})

    @app.get("/api/dashboard")
    @require_role("admin")
    def dashboard():
        projects = Project.query.order_by(Project.due_date).all()
        orders = PurchaseOrder.query.order_by(PurchaseOrder.pickup_date).all()
        expenses = Expense.query.order_by(Expense.expense_date.desc(), Expense.id.desc()).limit(8).all()
        logs = WorkLog.query.order_by(WorkLog.created_at.desc()).limit(12).all()
        workers = Worker.query.order_by(Worker.full_name).all()
        tomorrow = date.today() + timedelta(days=1)
        alarms = [
            {**_order_data(order), "alarm": True}
            for order in orders
            if order.pickup_date == tomorrow and order.status != "Picked up"
        ]
        return jsonify({
            "projects": [_project_data(project) for project in projects],
            "orders": [_order_data(order) for order in orders],
            "expenses": [{
                "id": expense.id, "project": expense.project.name,
                "project_id": expense.project_id, "description": expense.description,
                "category": expense.category, "amount": expense.amount,
                "date": expense.expense_date.isoformat(),
            } for expense in expenses],
            "logs": [_log_data(log) for log in logs],
            "tasks": [_task_data(task) for task in AssignedTask.query.order_by(AssignedTask.due_date, AssignedTask.id).all()],
            "inventory": [_inventory_data(item) for item in InventoryItem.query.order_by(InventoryItem.name).all()],
            "workers": [_worker_data(worker) for worker in workers],
            "alarms": alarms,
            "metrics": {
                "active_projects": len([p for p in projects if p.status == "In progress"]),
                "workers_on_site": sum(worker.is_active for worker in workers),
                "open_issues": WorkLog.query.filter_by(status="Needs attention").count(),
                "due_tomorrow": len(alarms),
            },
        })

    @app.get("/api/payroll")
    @require_role("admin")
    def payroll():
        workers = Worker.query.order_by(Worker.full_name).all()
        entries = WageLedgerEntry.query.order_by(
            WageLedgerEntry.entry_date.desc(), WageLedgerEntry.id.desc()
        ).all()
        balances = {worker.id: {"earned": 0, "paid": 0, "advances": 0} for worker in workers}
        for entry in entries:
            totals = balances[entry.worker_id]
            if entry.entry_type == "Earned":
                totals["earned"] += entry.amount
            elif entry.entry_type == "Paid":
                totals["paid"] += entry.amount
            else:
                totals["advances"] += entry.amount
        return jsonify({
            "workers": [
                {
                    **_worker_data(worker),
                    **balances[worker.id],
                    "balance_due": balances[worker.id]["earned"] - balances[worker.id]["paid"] - balances[worker.id]["advances"],
                }
                for worker in workers
            ],
            "entries": [_wage_entry_data(entry) for entry in entries],
        })

    @app.post("/api/workers")
    @require_role("admin")
    def create_worker():
        data = request.get_json(silent=True) or {}
        name = str(data.get("name", "")).strip()
        phone = str(data.get("phone", "")).strip()
        code = str(data.get("code", "")).strip().upper()
        role = str(data.get("role", "")).strip()
        pay_type = str(data.get("pay_type", "")).strip()
        supervisor_name = str(data.get("supervisor_name", "")).strip()
        supervisor_phone = str(data.get("supervisor_phone", "")).strip()
        try:
            project_id = int(data.get("project_id"))
            pay_rate = int(data.get("pay_rate"))
        except (TypeError, ValueError):
            return jsonify({"error": "Choose a project and enter a valid whole-dollar pay rate."}), 400
        if not all((name, phone, code, role)) or len(code) > 32:
            return jsonify({"error": "Complete the worker name, phone, ID, and role fields."}), 400
        if pay_type not in {"Daily", "Monthly"} or pay_rate <= 0:
            return jsonify({"error": "Choose daily or monthly pay and enter a rate greater than zero."}), 400
        if not db.session.get(Project, project_id):
            return jsonify({"error": "The selected project does not exist."}), 400
        worker = Worker(
            full_name=name,
            phone=phone,
            worker_code=code,
            role=role,
            project_id=project_id,
            daily_wage=pay_rate if pay_type == "Daily" else 0,
            pay_type=pay_type,
            monthly_salary=pay_rate if pay_type == "Monthly" else 0,
            supervisor_name=supervisor_name or "Project administrator",
            supervisor_phone=supervisor_phone,
        )
        db.session.add(worker)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return jsonify({"error": "That worker ID or phone number is already registered."}), 409
        return jsonify(_worker_data(worker)), 201

    @app.patch("/api/workers/<int:worker_id>")
    @require_role("admin")
    def update_worker_status(worker_id):
        worker = db.session.get(Worker, worker_id)
        is_active = (request.get_json(silent=True) or {}).get("is_active")
        if not worker:
            return jsonify({"error": "Worker not found."}), 404
        if not isinstance(is_active, bool):
            return jsonify({"error": "Specify whether the worker profile should be active."}), 400
        worker.is_active = is_active
        db.session.commit()
        return jsonify(_worker_data(worker))

    @app.post("/api/wage-ledger")
    @require_role("admin")
    def create_wage_entry():
        data = request.get_json(silent=True) or {}
        entry_type = str(data.get("entry_type", "")).strip()
        note = str(data.get("note", "")).strip()
        try:
            worker_id = int(data.get("worker_id"))
            amount = int(data.get("amount"))
            entry_date = date.fromisoformat(data.get("date", date.today().isoformat()))
        except (TypeError, ValueError):
            return jsonify({"error": "Choose a worker and enter a valid whole-dollar amount and date."}), 400
        worker = db.session.get(Worker, worker_id)
        if not worker:
            return jsonify({"error": "The selected worker does not exist."}), 400
        if entry_type not in {"Earned", "Paid", "Advance"} or amount <= 0:
            return jsonify({"error": "Choose earned wages, wage payment, or advance and enter an amount greater than zero."}), 400
        entry = WageLedgerEntry(
            worker_id=worker.id,
            project_id=worker.project_id,
            entry_type=entry_type,
            amount=amount,
            entry_date=entry_date,
            note=note,
        )
        if entry_type == "Earned":
            db.session.add(Expense(
                project_id=worker.project_id,
                description=f"Wages earned · {worker.full_name}",
                category="Worker Wages & Salaries",
                amount=amount,
                expense_date=entry_date,
            ))
            worker.project.spent += amount
        db.session.add(entry)
        db.session.commit()
        return jsonify(_wage_entry_data(entry)), 201

    @app.get("/api/financial-report")
    @require_role("admin")
    def financial_report():
        projects = Project.query.order_by(Project.due_date).all()
        expenses = Expense.query.order_by(Expense.expense_date.desc(), Expense.id.desc()).all()
        category_totals = {category: 0 for category in FINANCIAL_CATEGORIES}
        project_totals = {
            project.id: {
                "id": project.id,
                "name": project.name,
                "budget": project.budget,
                "spent": project.spent,
                "expense_total": 0,
                "categories": {category: 0 for category in FINANCIAL_CATEGORIES},
            }
            for project in projects
        }
        expense_data = []
        for expense in expenses:
            category = _financial_category(expense.category)
            category_totals[category] += expense.amount
            project_totals[expense.project_id]["categories"][category] += expense.amount
            project_totals[expense.project_id]["expense_total"] += expense.amount
            expense_data.append({
                "id": expense.id,
                "project": expense.project.name,
                "client": expense.project.client,
                "project_id": expense.project_id,
                "description": expense.description,
                "category": expense.category,
                "report_category": category,
                "amount": expense.amount,
                "date": expense.expense_date.isoformat(),
            })
        return jsonify({
            "categories": category_totals,
            "projects": list(project_totals.values()),
            "expenses": expense_data,
        })

    @app.get("/api/worker/me")
    @require_role("worker")
    def worker_portal():
        worker = db.session.get(Worker, session["worker_id"])
        if not worker:
            session.clear()
            return jsonify({"error": "Worker account is no longer available. Sign in again."}), 401
        logs = (
            WorkLog.query.filter_by(worker_id=worker.id)
            .order_by(WorkLog.created_at.desc()).limit(5).all()
        )
        return jsonify({
            "id": worker.id,
            "name": worker.full_name,
            "phone": worker.phone,
            "code": worker.worker_code,
            "role": worker.role,
            "daily_wage": worker.daily_wage,
            "pay_type": worker.pay_type,
            "monthly_salary": worker.monthly_salary,
            "pay_rate": worker.daily_wage if worker.pay_type == "Daily" else worker.monthly_salary,
            "project": _project_data(worker.project),
            "supervisor_name": worker.supervisor_name,
            "supervisor_phone": worker.supervisor_phone,
            "today_tasks": [
                {"name": "Morning safety briefing", "time": "7:00 AM", "done": True},
                {"name": "Assigned site work", "time": "8:00 AM", "done": False},
                {"name": "Afternoon progress check-in", "time": "2:30 PM", "done": False},
            ],
            "logs": [_log_data(log) for log in logs],
            "assigned_tasks": [_task_data(task) for task in AssignedTask.query.filter_by(worker_id=worker.id).order_by(AssignedTask.due_date).all()],
        })

    @app.post("/api/work-logs")
    @require_role("admin", "worker")
    def create_work_log():
        data = request.get_json(silent=True) or {}
        task = str(data.get("task", "")).strip()
        issue = str(data.get("issue", "")).strip()
        photo_name = str(data.get("photo_name", "")).strip()
        try:
            completion = int(data.get("completion"))
            worker_id = int(session["worker_id"]) if session["role"] == "worker" else int(data.get("worker_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "Choose a worker and enter a valid completion percentage."}), 400
        worker = db.session.get(Worker, worker_id)
        if not worker or not worker.is_active or not task or not 0 <= completion <= 100:
            return jsonify({"error": "Choose a valid worker, task, and completion percentage from 0 to 100."}), 400
        status = "Needs attention" if issue else (
            "Complete" if completion == 100 else "In progress"
        )
        log = WorkLog(
            worker_id=worker.id, project_id=worker.project_id, task=task,
            status=status, completion=completion, issue=issue, photo_name=photo_name,
        )
        db.session.add(log)
        db.session.commit()
        return jsonify(_log_data(log)), 201

    @app.post("/api/orders")
    @require_role("admin")
    def create_order():
        data = request.get_json(silent=True) or {}
        required = ("reference", "supplier", "item", "quantity", "pickup_date")
        if any(not str(data.get(field, "")).strip() for field in required):
            return jsonify({"error": "Complete all purchase order fields."}), 400
        try:
            project_id = int(data.get("project_id"))
            pickup_date = date.fromisoformat(data["pickup_date"])
        except (TypeError, ValueError):
            return jsonify({"error": "Choose a valid project and pickup date."}), 400
        if not db.session.get(Project, project_id):
            return jsonify({"error": "The selected project does not exist."}), 400
        order = PurchaseOrder(
            reference=str(data["reference"]).strip().upper(),
            supplier=str(data["supplier"]).strip(),
            item=str(data["item"]).strip(),
            quantity=str(data["quantity"]).strip(),
            pickup_date=pickup_date,
            project_id=project_id,
        )
        db.session.add(order)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return jsonify({"error": "That purchase order reference is already in use."}), 409
        return jsonify(_order_data(order)), 201

    @app.post("/api/expenses")
    @require_role("admin")
    def create_expense():
        data = request.get_json(silent=True) or {}
        description = str(data.get("description", "")).strip()
        category = str(data.get("category", "")).strip()
        try:
            project_id = int(data.get("project_id"))
            amount = int(data.get("amount"))
            expense_date = date.fromisoformat(data.get("date", date.today().isoformat()))
        except (TypeError, ValueError):
            return jsonify({"error": "Enter a valid project, whole-dollar amount, and date."}), 400
        project = db.session.get(Project, project_id)
        if not project or not description or not category or amount <= 0:
            return jsonify({"error": "Enter a description, category, valid project, and amount greater than zero."}), 400
        expense = Expense(
            project_id=project_id, description=description, category=category,
            amount=amount, expense_date=expense_date,
        )
        project.spent += amount
        db.session.add(expense)
        db.session.commit()
        return jsonify({
            "id": expense.id, "project": project.name, "description": expense.description,
            "category": expense.category, "amount": expense.amount,
            "date": expense.expense_date.isoformat(),
        }), 201

    @app.post("/api/tasks")
    @require_role("admin")
    def create_task():
        data = request.get_json(silent=True) or {}
        title = str(data.get("title", "")).strip()
        description = str(data.get("description", "")).strip()
        try:
            project_id = int(data.get("project_id"))
            worker_id = int(data.get("worker_id"))
            due_date = date.fromisoformat(data.get("due_date", ""))
        except (TypeError, ValueError):
            return jsonify({"error": "Choose a valid project, worker, and due date."}), 400
        project = db.session.get(Project, project_id)
        worker = db.session.get(Worker, worker_id)
        if not title or not project or not worker or not worker.is_active or worker.project_id != project.id:
            return jsonify({"error": "Choose a title and a worker assigned to the selected project."}), 400
        task = AssignedTask(
            title=title, description=description, project_id=project.id,
            worker_id=worker.id, due_date=due_date,
        )
        db.session.add(task)
        db.session.commit()
        return jsonify(_task_data(task)), 201

    @app.patch("/api/tasks/<int:task_id>")
    @require_role("worker")
    def update_task(task_id):
        task = db.session.get(AssignedTask, task_id)
        if not task or task.worker_id != session["worker_id"]:
            return jsonify({"error": "That task is not assigned to your account."}), 404
        status = str((request.get_json(silent=True) or {}).get("status", ""))
        if status not in {"Assigned", "In progress", "Complete"}:
            return jsonify({"error": "Choose Assigned, In progress, or Complete."}), 400
        task.status = status
        db.session.commit()
        return jsonify(_task_data(task))

    @app.post("/api/inventory")
    @require_role("admin")
    def save_inventory_item():
        data = request.get_json(silent=True) or {}
        sku = str(data.get("sku", "")).strip().upper()
        name = str(data.get("name", "")).strip()
        category = str(data.get("category", "")).strip()
        unit = str(data.get("unit", "")).strip()
        location = str(data.get("location", "")).strip()
        try:
            quantity = int(data.get("quantity"))
            reorder_level = int(data.get("reorder_level"))
        except (TypeError, ValueError):
            return jsonify({"error": "Enter whole-number quantity and reorder level."}), 400
        if not all((sku, name, category, unit, location)) or quantity < 0 or reorder_level < 0:
            return jsonify({"error": "Complete all fields and use non-negative stock quantities."}), 400
        item = InventoryItem.query.filter_by(sku=sku).first()
        if item:
            item.name, item.category = name, category
            item.quantity, item.unit = quantity, unit
            item.reorder_level, item.location = reorder_level, location
        else:
            item = InventoryItem(
                sku=sku, name=name, category=category, quantity=quantity,
                unit=unit, reorder_level=reorder_level, location=location,
            )
            db.session.add(item)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return jsonify({"error": "Could not save this inventory item."}), 409
        return jsonify(_inventory_data(item)), 201

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")
