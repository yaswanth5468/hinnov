import unittest
from datetime import date, timedelta

from app import LoginAccount, Worker, create_app, db


class PortalApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app("sqlite://")
        self.client = self.app.test_client()
        self.sign_in("admin", "admin", "admin123")

    def sign_in(self, role, username, password):
        return self.client.post("/api/auth/login", json={
            "role": role, "username": username, "password": password,
        })

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.engine.dispose()

    def test_dashboard_seeds_tomorrow_pickups_and_projects(self):
        response = self.client.get("/api/dashboard")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(len(payload["projects"]), 3)
        self.assertEqual(len(payload["alarms"]), 2)
        self.assertTrue(all(
            order["pickup_date"] == (date.today() + timedelta(days=1)).isoformat()
            for order in payload["alarms"]
        ))
        self.assertEqual(payload["metrics"]["due_tomorrow"], 2)

    def test_worker_lookup_returns_assignment_and_schedule(self):
        self.client.post("/api/auth/logout")
        self.assertEqual(self.sign_in("worker", "WK-2048", "worker123").status_code, 200)
        response = self.client.get("/api/worker/me")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["name"], "Marcus Rivera")
        self.assertEqual(payload["daily_wage"], 280)
        self.assertEqual(len(payload["assigned_tasks"]), 1)

    def test_login_rejects_invalid_credentials_and_role_mismatch(self):
        self.client.post("/api/auth/logout")
        response = self.sign_in("admin", "admin", "wrong-password")
        self.assertEqual(response.status_code, 401)
        role_mismatch = self.sign_in("admin", "WK-2048", "worker123")
        self.assertEqual(role_mismatch.status_code, 401)

    def test_sign_up_creates_worker_account_for_existing_worker_record(self):
        with self.app.app_context():
            worker = Worker(
                full_name="Nia Brooks",
                phone="+1 415 555 0911",
                worker_code="WK-9038",
                role="General labor",
                project_id=1,
                daily_wage=260,
                supervisor_name="Jordan Davis",
                supervisor_phone="+1 415 555 0100",
            )
            db.session.add(worker)
            db.session.commit()

        response = self.client.post("/api/auth/signup", json={
            "role": "worker",
            "username": "WK-9038",
            "full_name": "Nia Brooks",
            "phone": "+1 415 555 0911",
            "password": "secure-pass",
            "confirm_password": "secure-pass",
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["redirect"], "/worker")
        with self.app.app_context():
            self.assertIsNotNone(LoginAccount.query.filter_by(username="WK-9038").first())

    def test_admin_registers_daily_and_monthly_workers(self):
        daily = self.client.post("/api/workers", json={
            "name": "Nia Brooks",
            "phone": "+1 415 555 0911",
            "code": "wk-9038",
            "role": "General labor",
            "project_id": 1,
            "pay_type": "Daily",
            "pay_rate": 260,
        })
        self.assertEqual(daily.status_code, 201)
        self.assertEqual(daily.get_json()["code"], "WK-9038")
        self.assertEqual(daily.get_json()["pay_rate"], 260)
        self.assertTrue(daily.get_json()["is_active"])

        monthly = self.client.post("/api/workers", json={
            "name": "Omar Lee",
            "phone": "+1 415 555 0912",
            "code": "WK-9039",
            "role": "Site coordinator",
            "project_id": 2,
            "pay_type": "Monthly",
            "pay_rate": 5200,
        })
        self.assertEqual(monthly.status_code, 201)
        self.assertEqual(monthly.get_json()["pay_type"], "Monthly")
        self.assertEqual(monthly.get_json()["monthly_salary"], 5200)
        self.assertEqual(monthly.get_json()["daily_wage"], 0)
        duplicate = self.client.post("/api/workers", json={
            "name": "Duplicate worker",
            "phone": "+1 415 555 0911",
            "code": "WK-9040",
            "role": "General labor",
            "project_id": 1,
            "pay_type": "Daily",
            "pay_rate": 260,
        })
        self.assertEqual(duplicate.status_code, 409)

    def test_wage_ledger_tracks_earned_paid_advance_and_project_expense(self):
        worker_id = self.client.get("/api/dashboard").get_json()["workers"][0]["id"]
        for entry_type, amount in (("Earned", 1000), ("Paid", 600), ("Advance", 100)):
            response = self.client.post("/api/wage-ledger", json={
                "worker_id": worker_id,
                "entry_type": entry_type,
                "amount": amount,
                "date": date.today().isoformat(),
                "note": f"{entry_type} test",
            })
            self.assertEqual(response.status_code, 201)

        report = self.client.get("/api/payroll")
        self.assertEqual(report.status_code, 200)
        worker = next(item for item in report.get_json()["workers"] if item["id"] == worker_id)
        self.assertEqual(worker["earned"], 1000)
        self.assertEqual(worker["paid"], 600)
        self.assertEqual(worker["advances"], 100)
        self.assertEqual(worker["balance_due"], 300)
        self.assertEqual(len(report.get_json()["entries"]), 3)
        project = next(
            project for project in self.client.get("/api/dashboard").get_json()["projects"]
            if project["id"] == worker["project_id"]
        )
        self.assertEqual(project["spent"], 1764200)
        self.assertEqual(
            self.client.get("/api/dashboard").get_json()["expenses"][0]["category"],
            "Worker Wages & Salaries",
        )

    def test_worker_management_and_payroll_are_admin_only(self):
        self.client.post("/api/auth/logout")
        self.sign_in("worker", "WK-2048", "worker123")
        self.assertEqual(self.client.get("/api/payroll").status_code, 401)
        self.assertEqual(self.client.post("/api/workers", json={}).status_code, 401)
        self.assertEqual(self.client.post("/api/wage-ledger", json={}).status_code, 401)

    def test_deactivated_worker_cannot_sign_in_or_post_updates(self):
        self.assertEqual(self.client.patch("/api/workers/1", json={"is_active": False}).status_code, 200)
        self.client.post("/api/auth/logout")
        self.assertEqual(self.sign_in("worker", "WK-2048", "worker123").status_code, 403)
        self.sign_in("admin", "admin", "admin123")
        update = self.client.patch("/api/workers/1", json={"is_active": True})
        self.assertEqual(update.status_code, 200)
        self.assertTrue(update.get_json()["is_active"])

    def test_sign_in_routes_to_dedicated_role_pages(self):
        self.client.post("/api/auth/logout")
        self.assertEqual(self.client.get("/").status_code, 200)
        self.assertEqual(self.client.get("/admin/inventory").status_code, 302)
        self.sign_in("admin", "admin", "admin123")
        for section in ("overview", "projects", "orders", "team", "activity", "expenses", "inventory"):
            self.assertEqual(self.client.get(f"/admin/{section}").status_code, 200, section)
        self.assertIn(b"Materials & equipment", self.client.get("/admin/inventory").data)
        self.client.post("/api/auth/logout")
        self.sign_in("worker", "WK-2048", "worker123")
        self.assertEqual(self.client.get("/worker").status_code, 200)
        self.assertEqual(self.client.get("/admin/inventory").status_code, 302)

    def test_role_protection_keeps_worker_and_admin_data_separate(self):
        self.client.post("/api/auth/logout")
        self.assertEqual(self.client.get("/api/dashboard").status_code, 401)
        self.assertEqual(self.client.get("/api/worker/me").status_code, 401)
        self.sign_in("worker", "WK-2048", "worker123")
        self.assertEqual(self.client.get("/api/dashboard").status_code, 401)
        response = self.client.get("/api/worker/me")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["code"], "WK-2048")

    def test_work_log_records_issue_and_photo_filename(self):
        response = self.client.post("/api/work-logs", json={
            "worker_id": 1,
            "task": "Install level 5 reinforcement",
            "completion": 65,
            "issue": "Awaiting additional safety rails",
            "photo_name": "site-progress.jpg",
        })
        self.assertEqual(response.status_code, 201)
        payload = response.get_json()
        self.assertEqual(payload["status"], "Needs attention")
        self.assertEqual(payload["photo_name"], "site-progress.jpg")
        dashboard = self.client.get("/api/dashboard").get_json()
        self.assertEqual(dashboard["metrics"]["open_issues"], 2)
        self.assertEqual(dashboard["logs"][0]["task"], "Install level 5 reinforcement")

    def test_work_log_rejects_invalid_completion(self):
        response = self.client.post("/api/work-logs", json={
            "worker_id": 1,
            "task": "Invalid progress",
            "completion": 120,
        })
        self.assertEqual(response.status_code, 400)

    def test_order_with_tomorrow_pickup_triggers_alarm(self):
        buyer = self.client.get("/api/dashboard").get_json()["workers"][0]
        response = self.client.post("/api/orders", json={
            "reference": "PO-2850",
            "supplier": "Demo supplier",
            "item": "Fasteners",
            "quantity": "30 boxes",
            "pickup_date": (date.today() + timedelta(days=1)).isoformat(),
            "project_id": buyer["project_id"],
            "buyer_worker_id": buyer["id"],
        })
        self.assertEqual(response.status_code, 201)
        alarms = self.client.get("/api/dashboard").get_json()["alarms"]
        self.assertIn("PO-2850", [order["reference"] for order in alarms])

    def test_purchase_order_dispatch_details_and_status_lifecycle(self):
        buyer = self.client.get("/api/dashboard").get_json()["workers"][0]
        response = self.client.post("/api/orders", json={
            "reference": "PO-2860",
            "supplier": "Pacific Steel Co.",
            "item": "Reinforcement bars",
            "quantity": "120 kg",
            "total_cost": 840,
            "pickup_date": (date.today() + timedelta(days=1)).isoformat(),
            "project_id": buyer["project_id"],
            "buyer_worker_id": buyer["id"],
        })
        self.assertEqual(response.status_code, 201)
        order = response.get_json()
        self.assertEqual(order["status"], "Pending Pickup")
        self.assertEqual(order["buyer"], buyer["name"])
        self.assertEqual(order["buyer_phone"], buyer["phone"])
        self.assertEqual(order["total_cost"], 840)
        self.assertIn("PO-2860", [alarm["reference"] for alarm in self.client.get("/api/dashboard").get_json()["alarms"]])

        updated = self.client.patch(f"/api/orders/{order['id']}", json={"status": "Picked Up"})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.get_json()["status"], "Picked Up")
        self.assertNotIn("PO-2860", [alarm["reference"] for alarm in self.client.get("/api/dashboard").get_json()["alarms"]])

        delivered = self.client.patch(f"/api/orders/{order['id']}", json={"status": "Delivered to Site"})
        self.assertEqual(delivered.status_code, 200)
        self.assertEqual(delivered.get_json()["status"], "Delivered to Site")
        backwards = self.client.patch(f"/api/orders/{order['id']}", json={"status": "Picked Up"})
        self.assertEqual(backwards.status_code, 409)

    def test_order_buyer_must_be_active_and_assigned_to_order_project(self):
        self.assertEqual(
            self.client.patch("/api/orders/1", json={"status": "Picked Up"}).status_code,
            400,
        )
        order = {
            "reference": "PO-2861",
            "supplier": "Demo supplier",
            "item": "Fasteners",
            "quantity": "30 boxes",
            "pickup_date": date.today().isoformat(),
            "project_id": 1,
        }
        self.assertEqual(self.client.post("/api/orders", json=order).status_code, 400)
        order["buyer_worker_id"] = 3
        response = self.client.post("/api/orders", json=order)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.post("/api/auth/logout").status_code, 200)
        self.sign_in("worker", "WK-2048", "worker123")
        self.assertEqual(self.client.patch("/api/orders/1", json={"status": "Picked Up"}).status_code, 401)

    def test_order_rejects_duplicate_reference(self):
        buyer = self.client.get("/api/dashboard").get_json()["workers"][0]
        order = {
            "reference": "PO-2850",
            "supplier": "Demo supplier",
            "item": "Fasteners",
            "quantity": "30 boxes",
            "pickup_date": (date.today() + timedelta(days=1)).isoformat(),
            "project_id": buyer["project_id"],
            "buyer_worker_id": buyer["id"],
        }
        self.assertEqual(self.client.post("/api/orders", json=order).status_code, 201)
        duplicate = self.client.post("/api/orders", json=order)
        self.assertEqual(duplicate.status_code, 409)

    def test_expense_updates_project_spending(self):
        response = self.client.post("/api/expenses", json={
            "description": "Temporary site lighting",
            "category": "Equipment",
            "amount": 375,
            "project_id": 1,
            "date": date.today().isoformat(),
        })
        self.assertEqual(response.status_code, 201)
        dashboard = self.client.get("/api/dashboard").get_json()
        project = next(project for project in dashboard["projects"] if project["id"] == 1)
        self.assertEqual(project["spent"], 1763575)
        self.assertEqual(dashboard["expenses"][0]["description"], "Temporary site lighting")

    def test_financial_report_aggregates_all_expenses_by_project_and_category(self):
        for category, description, amount in (
            ("Worker Wages & Salaries", "Wages", 1200),
            ("Food & Allowances", "Meals", 180),
            ("Tool & Equipment", "Tool rental", 450),
            ("Transport", "Delivery", 90),
        ):
            response = self.client.post("/api/expenses", json={
                "description": description,
                "category": category,
                "amount": amount,
                "project_id": 1,
                "date": date.today().isoformat(),
            })
            self.assertEqual(response.status_code, 201)
        for index in range(9):
            response = self.client.post("/api/expenses", json={
                "description": f"Additional cost {index}",
                "category": "Materials",
                "amount": 10,
                "project_id": 2,
                "date": date.today().isoformat(),
            })
            self.assertEqual(response.status_code, 201)

        report_response = self.client.get("/api/financial-report")
        self.assertEqual(report_response.status_code, 200)
        report = report_response.get_json()
        self.assertEqual(len(report["expenses"]), 15)
        self.assertEqual(report["categories"]["Materials"], 1370)
        self.assertEqual(report["categories"]["Worker Wages & Salaries"], 1200)
        self.assertEqual(report["categories"]["Food & Allowances"], 180)
        self.assertEqual(report["categories"]["Tool & Equipment"], 1090)
        self.assertEqual(report["categories"]["Other"], 90)
        project = next(project for project in report["projects"] if project["id"] == 1)
        self.assertEqual(project["expense_total"], 2560)
        self.assertEqual(project["categories"]["Food & Allowances"], 180)
        self.assertEqual(project["categories"]["Other"], 90)

    def test_financial_report_requires_admin_role(self):
        self.client.post("/api/auth/logout")
        self.assertEqual(self.client.get("/api/financial-report").status_code, 401)
        self.sign_in("worker", "WK-2048", "worker123")
        self.assertEqual(self.client.get("/api/financial-report").status_code, 401)

    def test_admin_assigns_task_and_worker_can_update_own_status(self):
        assignment = self.client.post("/api/tasks", json={
            "title": "Inspect the east scaffold",
            "description": "Check the platform before the morning briefing.",
            "worker_id": 1,
            "project_id": 1,
            "due_date": date.today().isoformat(),
        })
        self.assertEqual(assignment.status_code, 201)
        task_id = assignment.get_json()["id"]
        self.client.post("/api/auth/logout")
        self.sign_in("worker", "WK-2048", "worker123")
        updated = self.client.patch(f"/api/tasks/{task_id}", json={"status": "In progress"})
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.get_json()["status"], "In progress")
        denied = self.client.patch(f"/api/tasks/{task_id + 900}", json={"status": "Complete"})
        self.assertEqual(denied.status_code, 404)

    def test_worker_cannot_post_a_work_log_for_another_worker(self):
        self.client.post("/api/auth/logout")
        self.sign_in("worker", "WK-2048", "worker123")
        response = self.client.post("/api/work-logs", json={
            "worker_id": 2, "task": "Worker's own update", "completion": 40,
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()["worker"], "Marcus Rivera")

    def test_inventory_seed_and_admin_stock_update(self):
        dashboard = self.client.get("/api/dashboard").get_json()
        self.assertGreaterEqual(len(dashboard["inventory"]), 5)
        response = self.client.post("/api/inventory", json={
            "sku": "SAFE-HARN-04", "name": "Safety harnesses",
            "category": "Safety", "quantity": 8, "unit": "units",
            "reorder_level": 10, "location": "Harbor Point · Safety locker",
        })
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.get_json()["low_stock"])
        self.client.post("/api/auth/logout")
        self.sign_in("worker", "WK-2048", "worker123")
        denied = self.client.post("/api/inventory", json={
            "sku": "NEW-01", "name": "Not authorized", "category": "Tools",
            "quantity": 1, "unit": "unit", "reorder_level": 1, "location": "Site",
        })
        self.assertEqual(denied.status_code, 401)


if __name__ == "__main__":
    unittest.main()
