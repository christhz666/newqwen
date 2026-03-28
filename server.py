#!/usr/bin/env python3
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
from datetime import datetime, timedelta
import json
import os
import sqlite3
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
from uuid import uuid4

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "web"
DB_PATH = BASE_DIR / "mediflow.db"
DB_LOCK = threading.Lock()
SESSION_TTL_HOURS = 12

DEFAULT_PERMISSIONS = {
    "super_admin": [
        "billing:create",
        "results:view",
        "results:release",
        "payments:register",
        "admin:manage",
        "audit:view",
    ],
    "admin": ["billing:create", "results:view", "payments:register", "admin:manage", "audit:view"],
    "recepcion": ["billing:create", "results:view", "payments:register"],
    "doctor": ["results:view"],
    "laboratorio": ["results:view", "results:release"],
}


def now_iso():
    return datetime.utcnow().isoformat() + "Z"


def hash_password(password: str, salt: str | None = None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored_hash: str):
    try:
        salt, digest = stored_hash.split("$", 1)
    except ValueError:
        return False
    calc = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return hmac.compare_digest(calc, digest)

DB_LOCK = threading.Lock()


def db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with DB_LOCK:
        conn = db_conn()
        cur = conn.cursor()
        cur.executescript(
            """
            PRAGMA foreign_keys=ON;

            CREATE TABLE IF NOT EXISTS roles(name TEXT PRIMARY KEY);
            CREATE TABLE IF NOT EXISTS role_permissions(
              role_name TEXT NOT NULL,
              permission TEXT NOT NULL,
              PRIMARY KEY(role_name, permission),
              FOREIGN KEY(role_name) REFERENCES roles(name)
            );

            CREATE TABLE IF NOT EXISTS branches(
            CREATE TABLE IF NOT EXISTS roles (
              name TEXT PRIMARY KEY
            );

            CREATE TABLE IF NOT EXISTS branches (
              id TEXT PRIMARY KEY,
              code TEXT NOT NULL UNIQUE,
              name TEXT NOT NULL,
              active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS users(
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              username TEXT NOT NULL UNIQUE,
              role_name TEXT NOT NULL,
              branch_id TEXT,
              password_hash TEXT NOT NULL,
              must_change_password INTEGER NOT NULL DEFAULT 0,
              active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              FOREIGN KEY(role_name) REFERENCES roles(name),
              FOREIGN KEY(branch_id) REFERENCES branches(id)
            );

            CREATE TABLE IF NOT EXISTS sessions(
              token TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS studies(
            CREATE TABLE IF NOT EXISTS studies (
              code TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              price REAL NOT NULL,
              department TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS patients(
            CREATE TABLE IF NOT EXISTS patients (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              dob TEXT NOT NULL,
              document TEXT NOT NULL,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS invoices(
            CREATE TABLE IF NOT EXISTS invoices (
              id TEXT PRIMARY KEY,
              branch_id TEXT NOT NULL,
              patient_id TEXT NOT NULL,
              branch_invoice_number TEXT NOT NULL,
              insurance_plan TEXT NOT NULL,
              gross REAL NOT NULL,
              coverage REAL NOT NULL,
              total REAL NOT NULL,
              payment REAL NOT NULL,
              balance REAL NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              created_at TEXT NOT NULL,
              UNIQUE(branch_id, branch_invoice_number),
              FOREIGN KEY(branch_id) REFERENCES branches(id),
              FOREIGN KEY(patient_id) REFERENCES patients(id)
            );

            CREATE TABLE IF NOT EXISTS payments(
              id TEXT PRIMARY KEY,
              invoice_id TEXT NOT NULL,
              amount REAL NOT NULL,
              method TEXT NOT NULL,
              created_by_user_id TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(invoice_id) REFERENCES invoices(id),
              FOREIGN KEY(created_by_user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS orders(
            CREATE TABLE IF NOT EXISTS orders (
              id TEXT PRIMARY KEY,
              invoice_id TEXT NOT NULL,
              branch_id TEXT NOT NULL,
              patient_id TEXT NOT NULL,
              barcode TEXT NOT NULL UNIQUE,
              qr_token TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL,
              FOREIGN KEY(invoice_id) REFERENCES invoices(id),
              FOREIGN KEY(branch_id) REFERENCES branches(id),
              FOREIGN KEY(patient_id) REFERENCES patients(id)
            );

            CREATE TABLE IF NOT EXISTS order_items(
            CREATE TABLE IF NOT EXISTS order_items (
              id TEXT PRIMARY KEY,
              order_id TEXT NOT NULL,
              study_code TEXT NOT NULL,
              study_name TEXT NOT NULL,
              department TEXT NOT NULL,
              status TEXT NOT NULL,
              result_text TEXT NOT NULL,
              FOREIGN KEY(order_id) REFERENCES orders(id)
            );

            CREATE TABLE IF NOT EXISTS app_config(key TEXT PRIMARY KEY, value TEXT NOT NULL);

            CREATE TABLE IF NOT EXISTS audit_logs(
              id TEXT PRIMARY KEY,
              actor_user_id TEXT,
              action TEXT NOT NULL,
              entity_type TEXT NOT NULL,
              entity_id TEXT,
              payload TEXT,
              created_at TEXT NOT NULL
            );
            """
        )

        for role in DEFAULT_PERMISSIONS:
            cur.execute("INSERT OR IGNORE INTO roles(name) VALUES(?)", (role,))
            for perm in DEFAULT_PERMISSIONS[role]:
                cur.execute(
                    "INSERT OR IGNORE INTO role_permissions(role_name, permission) VALUES(?,?)",
                    (role, perm),
                )

        cur.executemany(
            "INSERT OR IGNORE INTO branches(id,code,name,active) VALUES(?,?,?,?)",
            [
                ("b1", "STO", "Sucursal Santo Domingo", 1),
                ("b2", "SDE", "Sucursal Este", 1),
            ],
        )

        cur.executemany(
            "INSERT OR IGNORE INTO studies(code,name,price,department) VALUES(?,?,?,?)",
            [
                ("LAB-ORINA", "Orina", 450, "LIS"),
                ("LAB-COPRO", "Coprológico", 650, "LIS"),
                ("LAB-HEMO", "Hemograma", 500, "LIS"),
                ("IMG-RXTX", "Rayos X Tórax", 1500, "PACS"),
            ],
            CREATE TABLE IF NOT EXISTS app_config (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            """
        )

        default_roles = ["super_admin", "admin", "recepcion", "doctor", "laboratorio"]
        cur.executemany("INSERT OR IGNORE INTO roles(name) VALUES(?)", [(r,) for r in default_roles])

        branches = [
            ("b1", "STO", "Sucursal Santo Domingo", 1),
            ("b2", "SDE", "Sucursal Este", 1),
        ]
        cur.executemany(
            "INSERT OR IGNORE INTO branches(id, code, name, active) VALUES(?,?,?,?)", branches
        )

        studies = [
            ("LAB-ORINA", "Orina", 450, "LIS"),
            ("LAB-COPRO", "Coprológico", 650, "LIS"),
            ("LAB-HEMO", "Hemograma", 500, "LIS"),
            ("IMG-RXTX", "Rayos X Tórax", 1500, "PACS"),
        ]
        cur.executemany(
            "INSERT OR IGNORE INTO studies(code,name,price,department) VALUES(?,?,?,?)", studies
        )

        brand = {
            "title": "MediFlow OSS",
            "subtitle": "Hospital Core · LIS · PACS · Billing",
            "logo": "https://dummyimage.com/40x40/2563eb/ffffff&text=M",
        }
        cur.execute(
            "INSERT OR IGNORE INTO app_config(key,value) VALUES('brand',?)",
            (json.dumps(brand),),
        )

        root = cur.execute("SELECT id FROM users WHERE username='root'").fetchone()
        if not root:
            cur.execute(
                """
                INSERT INTO users(id,username,role_name,branch_id,password_hash,must_change_password,active,created_at)
                VALUES(?,?,?,?,?,?,?,?)
                """,
                (
                    str(uuid4()),
                    "root",
                    "super_admin",
                    "b1",
                    hash_password("root1234!"),
                    1,
                    1,
                    now_iso(),
                ),
            )
            "INSERT OR IGNORE INTO app_config(key,value) VALUES('brand',?)", (json.dumps(brand),)
        )

        cur.execute(
            "INSERT OR IGNORE INTO users(id,username,role_name,branch_id,created_at) VALUES(?,?,?,?,?)",
            (str(uuid4()), "root", "super_admin", "b1", now_iso()),
        )

        conn.commit()
        conn.close()


def now_iso():
    return datetime.utcnow().isoformat() + "Z"


def json_response(handler, data, status=200):
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def parse_body(handler):
    length = int(handler.headers.get("Content-Length", 0))
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
    if not raw:
        return {}
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        return {}


def insurance_pct(plan):
    return {"none": 0, "basic": 0.4, "premium": 0.7}.get(plan, 0)


def generate_invoice_number(cur, branch_id):
    for n in range(1000, 100000):
        candidate = str(n)
        row = cur.execute(
            "SELECT 1 FROM invoices WHERE branch_id=? AND branch_invoice_number=?",
            (branch_id, candidate),
        ).fetchone()
        if not row:
            return candidate
    raise RuntimeError("No hay IDs disponibles")
    raise RuntimeError("No hay IDs de factura disponibles para la sucursal")


def random_token(prefix):
    return f"{prefix}-{uuid4()}"


def fetch_brand(cur):
    row = cur.execute("SELECT value FROM app_config WHERE key='brand'").fetchone()
    return json.loads(row["value"]) if row else {}


def get_permissions(cur, role_name):
    rows = cur.execute(
        "SELECT permission FROM role_permissions WHERE role_name=? ORDER BY permission", (role_name,)
    ).fetchall()
    return [r["permission"] for r in rows]


def audit(cur, actor_user_id, action, entity_type, entity_id=None, payload=None):
    cur.execute(
        "INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,payload,created_at) VALUES(?,?,?,?,?,?,?)",
        (
            str(uuid4()),
            actor_user_id,
            action,
            entity_type,
            entity_id,
            json.dumps(payload or {}),
            now_iso(),
        ),
    )


def order_to_payload(cur, order_row):
    invoice = cur.execute("SELECT * FROM invoices WHERE id=?", (order_row["invoice_id"],)).fetchone()
    patient = cur.execute("SELECT * FROM patients WHERE id=?", (order_row["patient_id"],)).fetchone()
    branch = cur.execute("SELECT * FROM branches WHERE id=?", (order_row["branch_id"],)).fetchone()
    items = cur.execute("SELECT * FROM order_items WHERE order_id=?", (order_row["id"],)).fetchall()

    return {
        "order_id": order_row["id"],
        "invoice_id": invoice["id"],
        "invoice_number": invoice["branch_invoice_number"],
        "patient": {"id": patient["id"], "name": patient["name"], "document": patient["document"]},
        "patient": {
            "id": patient["id"],
            "name": patient["name"],
            "document": patient["document"],
        },
        "branch": {"id": branch["id"], "code": branch["code"], "name": branch["name"]},
        "barcode": order_row["barcode"],
        "qr_token": order_row["qr_token"],
        "balance": invoice["balance"],
        "status": invoice["status"],
        "created_at": order_row["created_at"],
        "items": [
            {
                "code": item["study_code"],
                "name": item["study_name"],
                "department": item["department"],
                "status": item["status"],
                "result": item["result_text"],
            }
            for item in items
        ],
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.handle_api_get(parsed)
        return self.serve_static(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            return json_response(self, {"error": "Not found"}, 404)
        return self.handle_api_post(parsed)

    def log_message(self, fmt, *args):
        return

    def serve_static(self, path):
        if path in ["/", ""]:
            path = "/index.html"
        file_path = (WEB_DIR / unquote(path.lstrip("/"))).resolve()
        if not str(file_path).startswith(str(WEB_DIR.resolve())):
            return json_response(self, {"error": "invalid path"}, 400)
        if not file_path.exists() or not file_path.is_file():
            return json_response(self, {"error": "Not found"}, 404)

        mime = "text/plain"
        if file_path.suffix == ".html":
            mime = "text/html; charset=utf-8"
        elif file_path.suffix == ".css":
            mime = "text/css; charset=utf-8"
        elif file_path.suffix == ".js":
            mime = "application/javascript; charset=utf-8"

        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def auth_user(self, cur):
        token = self.headers.get("X-Session-Token", "").strip()
        if not token:
            return None
        session = cur.execute("SELECT * FROM sessions WHERE token=?", (token,)).fetchone()
        if not session:
            return None
        if datetime.fromisoformat(session["expires_at"].replace("Z", "")) < datetime.utcnow():
            cur.execute("DELETE FROM sessions WHERE token=?", (token,))
            return None
        user = cur.execute("SELECT * FROM users WHERE id=? AND active=1", (session["user_id"],)).fetchone()
        if not user:
            return None
        perms = get_permissions(cur, user["role_name"])
        return {"token": token, "user": user, "permissions": perms}

    def require_permission(self, auth, perm):
        return auth and (perm in auth["permissions"] or auth["user"]["role_name"] == "super_admin")

    def handle_api_get(self, parsed):
        qs = parse_qs(parsed.query)
        with DB_LOCK:
            conn = db_conn()
            cur = conn.cursor()

            if parsed.path == "/api/auth/me":
                auth = self.auth_user(cur)
                conn.commit()
                conn.close()
                if not auth:
                    return json_response(self, {"authenticated": False})
                user = auth["user"]
                return json_response(
                    self,
                    {
                        "authenticated": True,
                        "user": {
                            "id": user["id"],
                            "username": user["username"],
                            "role": user["role_name"],
                            "branch_id": user["branch_id"],
                            "must_change_password": bool(user["must_change_password"]),
                            "permissions": auth["permissions"],
                        },
                    },
                )

            auth = self.auth_user(cur)
            if not auth:
                conn.commit()
                conn.close()
                return json_response(self, {"error": "No autenticado"}, 401)

            if parsed.path == "/api/bootstrap":
                roles = [r["name"] for r in cur.execute("SELECT name FROM roles ORDER BY name").fetchall()]
                branches = [dict(r) for r in cur.execute("SELECT * FROM branches ORDER BY code").fetchall()]
                studies = [dict(r) for r in cur.execute("SELECT * FROM studies ORDER BY name").fetchall()]
                users = [dict(u) for u in cur.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()]
                if not self.require_permission(auth, "admin:manage"):
                    users = []
                invoice_count = cur.execute("SELECT COUNT(*) as c FROM invoices").fetchone()["c"]
                patient_count = cur.execute("SELECT COUNT(*) as c FROM patients").fetchone()["c"]
                unpaid_count = cur.execute("SELECT COUNT(*) as c FROM invoices WHERE balance > 0").fetchone()["c"]
                invoice_count = cur.execute("SELECT COUNT(*) as c FROM invoices").fetchone()["c"]
                patient_count = cur.execute("SELECT COUNT(*) as c FROM patients").fetchone()["c"]
                unpaid_count = cur.execute(
                    "SELECT COUNT(*) as c FROM invoices WHERE balance > 0"
                ).fetchone()["c"]
                recent = [
                    dict(r)
                    for r in cur.execute(
                        """
                        SELECT i.branch_invoice_number, i.balance, i.created_at,
                               b.code AS branch_code, p.name AS patient_name
                        FROM invoices i
                        JOIN branches b ON b.id = i.branch_id
                        JOIN patients p ON p.id = i.patient_id
                        ORDER BY i.created_at DESC LIMIT 8
                        """
                    ).fetchall()
                ]
                user = auth["user"]
                conn.close()
                        ORDER BY i.created_at DESC
                        LIMIT 8
                        """
                    ).fetchall()
                ]
                return json_response(
                    self,
                    {
                        "roles": roles,
                        "branches": branches,
                        "studies": studies,
                        "users": users,
                        "brand": fetch_brand(cur),
                        "stats": {
                            "patients": patient_count,
                            "invoices": invoice_count,
                            "unpaid": unpaid_count,
                            "recent": recent,
                        },
                        "me": {
                            "id": user["id"],
                            "username": user["username"],
                            "role": user["role_name"],
                            "branch_id": user["branch_id"],
                            "permissions": auth["permissions"],
                        },
                    },
                )

            if parsed.path == "/api/patients/search":
                if not self.require_permission(auth, "billing:create"):
                    conn.close()
                    return json_response(self, {"error": "Sin permiso"}, 403)
                q = (qs.get("q", [""])[0]).strip().lower()
                if not q:
                    conn.close()
                    return json_response(self, {"items": []})
                rows = cur.execute(
                    "SELECT * FROM patients WHERE lower(name) LIKE ? OR lower(document) LIKE ? ORDER BY created_at DESC LIMIT 10",
                    (f"%{q}%", f"%{q}%"),
                ).fetchall()
                conn.close()
                return json_response(self, {"items": [dict(r) for r in rows]})

            if parsed.path == "/api/results/by-invoice":
                if not self.require_permission(auth, "results:view"):
                    conn.close()
                    return json_response(self, {"error": "Sin permiso"}, 403)
                q = (qs.get("q", [""])[0]).strip().lower()
                if not q:
                    return json_response(self, {"items": []})
                rows = cur.execute(
                    """
                    SELECT * FROM patients
                    WHERE lower(name) LIKE ? OR lower(document) LIKE ?
                    ORDER BY created_at DESC LIMIT 10
                    """,
                    (f"%{q}%", f"%{q}%"),
                ).fetchall()
                return json_response(self, {"items": [dict(r) for r in rows]})

            if parsed.path == "/api/results/by-invoice":
                branch_id = qs.get("branch_id", [""])[0]
                invoice_number = qs.get("invoice_number", [""])[0]
                invoice = cur.execute(
                    "SELECT * FROM invoices WHERE branch_id=? AND branch_invoice_number=?",
                    (branch_id, invoice_number),
                ).fetchone()
                if not invoice:
                    conn.close()
                    return json_response(self, {"item": None})
                order = cur.execute("SELECT * FROM orders WHERE invoice_id=?", (invoice["id"],)).fetchone()
                conn.close()
                return json_response(self, {"item": order_to_payload(cur, order) if order else None})

            if parsed.path == "/api/results/by-name":
                if not self.require_permission(auth, "results:view"):
                    conn.close()
                    return json_response(self, {"error": "Sin permiso"}, 403)
                q = qs.get("name", [""])[0].strip().lower()
                rows = cur.execute(
                    """
                    SELECT o.* FROM orders o
                    JOIN patients p ON p.id=o.patient_id
                    return json_response(self, {"item": None})
                order = cur.execute("SELECT * FROM orders WHERE invoice_id=?", (invoice["id"],)).fetchone()
                if not order:
                    return json_response(self, {"item": None})
                return json_response(self, {"item": order_to_payload(cur, order)})

            if parsed.path == "/api/results/by-name":
                q = qs.get("name", [""])[0].strip().lower()
                rows = cur.execute(
                    """
                    SELECT o.*
                    FROM orders o
                    JOIN patients p ON p.id = o.patient_id
                    WHERE lower(p.name) LIKE ?
                    ORDER BY o.created_at DESC
                    """,
                    (f"%{q}%",),
                ).fetchall()
                conn.close()
                return json_response(self, {"items": [order_to_payload(cur, r) for r in rows]})

            if parsed.path == "/api/results/by-token":
                if not self.require_permission(auth, "results:view"):
                    conn.close()
                    return json_response(self, {"error": "Sin permiso"}, 403)
                token = qs.get("token", [""])[0].strip()
                row = cur.execute("SELECT * FROM orders WHERE barcode=? OR qr_token=?", (token, token)).fetchone()
                conn.close()
                return json_response(self, {"item": order_to_payload(cur, row) if row else None})

            if parsed.path == "/api/audit/recent":
                if not self.require_permission(auth, "audit:view"):
                    conn.close()
                    return json_response(self, {"error": "Sin permiso"}, 403)
                rows = cur.execute(
                    "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50"
                ).fetchall()
                conn.close()
                return json_response(self, {"items": [dict(r) for r in rows]})

            conn.close()
            return json_response(self, {"error": "Not found"}, 404)
                return json_response(self, {"items": [order_to_payload(cur, r) for r in rows]})

            if parsed.path == "/api/results/by-token":
                token = qs.get("token", [""])[0].strip()
                row = cur.execute(
                    "SELECT * FROM orders WHERE barcode=? OR qr_token=?", (token, token)
                ).fetchone()
                return json_response(self, {"item": order_to_payload(cur, row) if row else None})

            conn.close()

        return json_response(self, {"error": "Not found"}, 404)

    def handle_api_post(self, parsed):
        payload = parse_body(self)
        with DB_LOCK:
            conn = db_conn()
            cur = conn.cursor()

            if parsed.path == "/api/auth/login":
                username = payload.get("username", "").strip()
                password = payload.get("password", "")
                user = cur.execute(
                    "SELECT * FROM users WHERE username=? AND active=1", (username,)
                ).fetchone()
                if not user or not verify_password(password, user["password_hash"]):
                    conn.close()
                    return json_response(self, {"error": "Credenciales inválidas"}, 401)

                token = secrets.token_urlsafe(36)
                expires = (datetime.utcnow() + timedelta(hours=SESSION_TTL_HOURS)).isoformat() + "Z"
                cur.execute(
                    "INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES(?,?,?,?)",
                    (token, user["id"], expires, now_iso()),
                )
                audit(cur, user["id"], "auth.login", "session", token)
                conn.commit()
                perms = get_permissions(cur, user["role_name"])
                conn.close()
                return json_response(
                    self,
                    {
                        "token": token,
                        "user": {
                            "id": user["id"],
                            "username": user["username"],
                            "role": user["role_name"],
                            "branch_id": user["branch_id"],
                            "must_change_password": bool(user["must_change_password"]),
                            "permissions": perms,
                        },
                    },
                )

            auth = self.auth_user(cur)
            if not auth:
                conn.commit()
                conn.close()
                return json_response(self, {"error": "No autenticado"}, 401)

            user = auth["user"]

            if parsed.path == "/api/auth/logout":
                cur.execute("DELETE FROM sessions WHERE token=?", (auth["token"],))
                audit(cur, user["id"], "auth.logout", "session", auth["token"])
                conn.commit()
                conn.close()
                return json_response(self, {"ok": True})

            if parsed.path == "/api/admin/user/password":
                if not self.require_permission(auth, "admin:manage"):
                    conn.close()
                    return json_response(self, {"error": "Sin permiso"}, 403)
                target = payload.get("username", "").strip()
                new_password = payload.get("new_password", "").strip()
                if len(new_password) < 8:
                    conn.close()
                    return json_response(self, {"error": "Contraseña mínima 8 caracteres"}, 400)
                cur.execute(
                    "UPDATE users SET password_hash=?, must_change_password=0 WHERE username=?",
                    (hash_password(new_password), target),
                )
                audit(cur, user["id"], "admin.password_reset", "user", target)
                conn.commit()
                conn.close()
                return json_response(self, {"ok": True})

            if parsed.path == "/api/invoices/create":
                if not self.require_permission(auth, "billing:create"):
                    conn.close()
                    return json_response(self, {"error": "Sin permiso"}, 403)
            if parsed.path == "/api/invoices/create":
                try:
                    name = payload.get("name", "").strip()
                    dob = payload.get("dob", "").strip()
                    document = payload.get("document", "").strip() or "MENOR"
                    branch_id = payload.get("branch_id", "").strip() or user["branch_id"]
                    branch_id = payload.get("branch_id", "").strip()
                    study_codes = payload.get("study_codes", [])
                    insurance_plan = payload.get("insurance_plan", "none")
                    payment = float(payload.get("payment", 0))

                    if not name or not dob or not branch_id or not study_codes:
                        raise ValueError("Datos incompletos")

                    patient = cur.execute(
                        "SELECT * FROM patients WHERE lower(name)=lower(?) AND document=?",
                        (name, document),
                    ).fetchone()
                    patient_id = patient["id"] if patient else str(uuid4())
                    if not patient:
                    if not patient:
                        patient_id = str(uuid4())
                        cur.execute(
                            "INSERT INTO patients(id,name,dob,document,created_at) VALUES(?,?,?,?,?)",
                            (patient_id, name, dob, document, now_iso()),
                        )

                    studies = cur.execute(
                        f"SELECT * FROM studies WHERE code IN ({','.join(['?'] * len(study_codes))})",
                    else:
                        patient_id = patient["id"]

                    studies = cur.execute(
                        f"SELECT * FROM studies WHERE code IN ({','.join(['?']*len(study_codes))})",
                        study_codes,
                    ).fetchall()
                    if not studies:
                        raise ValueError("No hay estudios válidos")

                    gross = sum(s["price"] for s in studies)
                    coverage = gross * insurance_pct(insurance_plan)
                    total = gross - coverage
                    balance = max(0, total - payment)
                    status = "paid" if balance == 0 else "pending"

                    invoice_id = str(uuid4())
                    invoice_number = generate_invoice_number(cur, branch_id)
                    created_at = now_iso()
                    cur.execute(
                        """
                        INSERT INTO invoices(id,branch_id,patient_id,branch_invoice_number,insurance_plan,gross,coverage,total,payment,balance,status,created_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
                        INSERT INTO invoices(id,branch_id,patient_id,branch_invoice_number,insurance_plan,gross,coverage,total,payment,balance,created_at)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?)
                        """,
                        (
                            invoice_id,
                            branch_id,
                            patient_id,
                            invoice_number,
                            insurance_plan,
                            gross,
                            coverage,
                            total,
                            payment,
                            balance,
                            status,
                            created_at,
                        ),
                    )

                    if payment > 0:
                        cur.execute(
                            "INSERT INTO payments(id,invoice_id,amount,method,created_by_user_id,created_at) VALUES(?,?,?,?,?,?)",
                            (str(uuid4()), invoice_id, payment, "cash", user["id"], created_at),
                        )

                    order_id = str(uuid4())
                    barcode = f"BC-{uuid4()}"
                    qr_token = f"QR-{uuid4()}"
                    order_id = str(uuid4())
                    barcode = random_token("BC")
                    qr_token = random_token("QR")
                    cur.execute(
                        "INSERT INTO orders(id,invoice_id,branch_id,patient_id,barcode,qr_token,created_at) VALUES(?,?,?,?,?,?,?)",
                        (order_id, invoice_id, branch_id, patient_id, barcode, qr_token, created_at),
                    )

                    for s in studies:
                        cur.execute(
                            "INSERT INTO order_items(id,order_id,study_code,study_name,department,status,result_text) VALUES(?,?,?,?,?,?,?)",
                            """
                            INSERT INTO order_items(id,order_id,study_code,study_name,department,status,result_text)
                            VALUES(?,?,?,?,?,?,?)
                            """,
                            (
                                str(uuid4()),
                                order_id,
                                s["code"],
                                s["name"],
                                s["department"],
                                "finalizado",
                                f"Resultado {s['name']}: dentro de parámetros.",
                            ),
                        )

                    audit(
                        cur,
                        user["id"],
                        "billing.invoice_created",
                        "invoice",
                        invoice_id,
                        {"branch_invoice_number": invoice_number, "total": total, "balance": balance},
                    )
                    conn.commit()
                    order = cur.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
                    response = order_to_payload(cur, order)
                    response["financial"] = {
                        "gross": gross,
                        "coverage": coverage,
                        "total": total,
                        "payment": payment,
                        "balance": balance,
                    }
                    conn.close()
                    return json_response(self, response, 201)
                except Exception as exc:
                    conn.rollback()
                    conn.close()
                    return json_response(self, {"error": str(exc)}, 400)

            if parsed.path == "/api/invoices/pay":
                if not self.require_permission(auth, "payments:register"):
                    conn.close()
                    return json_response(self, {"error": "Sin permiso"}, 403)
                invoice_id = payload.get("invoice_id", "").strip()
                amount = float(payload.get("amount", 0))
                method = payload.get("method", "cash").strip().lower()
                if amount <= 0:
                    conn.close()
                    return json_response(self, {"error": "Monto inválido"}, 400)
                invoice = cur.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone()
                if not invoice:
                    conn.close()
                    return json_response(self, {"error": "Factura no encontrada"}, 404)

                new_payment = invoice["payment"] + amount
                new_balance = max(0, invoice["total"] - new_payment)
                status = "paid" if new_balance == 0 else "pending"
                cur.execute(
                    "UPDATE invoices SET payment=?, balance=?, status=? WHERE id=?",
                    (new_payment, new_balance, status, invoice_id),
                )
                cur.execute(
                    "INSERT INTO payments(id,invoice_id,amount,method,created_by_user_id,created_at) VALUES(?,?,?,?,?,?)",
                    (str(uuid4()), invoice_id, amount, method, user["id"], now_iso()),
                )
                audit(
                    cur,
                    user["id"],
                    "billing.payment_registered",
                    "invoice",
                    invoice_id,
                    {"amount": amount, "method": method, "balance": new_balance},
                )
                conn.commit()
                conn.close()
                return json_response(self, {"ok": True, "balance": new_balance, "status": status})

            if parsed.path == "/api/results/release-check":
                if not self.require_permission(auth, "results:release") and not self.require_permission(
                    auth, "results:view"
                ):
                    conn.close()
                    return json_response(self, {"error": "Sin permiso"}, 403)
            if parsed.path == "/api/results/release-check":
                order_id = payload.get("order_id", "").strip()
                row = cur.execute("SELECT invoice_id FROM orders WHERE id=?", (order_id,)).fetchone()
                if not row:
                    conn.close()
                    return json_response(self, {"ok": False, "message": "Orden no encontrada"}, 404)
                invoice = cur.execute("SELECT balance FROM invoices WHERE id=?", (row["invoice_id"],)).fetchone()
                if invoice["balance"] > 0:
                    conn.close()
                conn.close()
                if invoice["balance"] > 0:
                    return json_response(
                        self,
                        {
                            "ok": False,
                            "message": f"No se puede entregar. Saldo pendiente DOP {invoice['balance']:.2f}.",
                        },
                    )
                audit(cur, user["id"], "results.released", "order", order_id)
                conn.commit()
                conn.close()
                return json_response(self, {"ok": True, "message": "Entrega autorizada."})

            if parsed.path == "/api/admin/branch":
                if not self.require_permission(auth, "admin:manage"):
                    conn.close()
                    return json_response(self, {"error": "Sin permiso"}, 403)
                return json_response(self, {"ok": True, "message": "Entrega autorizada."})

            if parsed.path == "/api/admin/branch":
                name = payload.get("name", "").strip()
                code = payload.get("code", "").strip().upper()
                if not name or not code:
                    conn.close()
                    return json_response(self, {"error": "Nombre y código requeridos"}, 400)
                try:
                    branch_id = str(uuid4())
                    cur.execute(
                        "INSERT INTO branches(id,code,name,active) VALUES(?,?,?,1)",
                        (branch_id, code, name),
                    )
                    audit(cur, user["id"], "admin.branch_created", "branch", branch_id)
                    cur.execute(
                        "INSERT INTO branches(id,code,name,active) VALUES(?,?,?,1)",
                        (str(uuid4()), code, name),
                    )
                    conn.commit()
                    conn.close()
                    return json_response(self, {"ok": True}, 201)
                except sqlite3.IntegrityError:
                    conn.rollback()
                    conn.close()
                    return json_response(self, {"error": "Código ya existe"}, 400)

            if parsed.path == "/api/admin/role":
                if not self.require_permission(auth, "admin:manage"):
                    conn.close()
                    return json_response(self, {"error": "Sin permiso"}, 403)
                role = payload.get("name", "").strip().lower()
                permissions = payload.get("permissions", [])
                role = payload.get("name", "").strip().lower()
                if not role:
                    conn.close()
                    return json_response(self, {"error": "Rol requerido"}, 400)
                cur.execute("INSERT OR IGNORE INTO roles(name) VALUES(?)", (role,))
                cur.execute("DELETE FROM role_permissions WHERE role_name=?", (role,))
                for perm in permissions:
                    cur.execute(
                        "INSERT OR IGNORE INTO role_permissions(role_name,permission) VALUES(?,?)",
                        (role, perm),
                    )
                audit(cur, user["id"], "admin.role_saved", "role", role, {"permissions": permissions})
                conn.commit()
                conn.close()
                return json_response(self, {"ok": True}, 201)

            if parsed.path == "/api/admin/user":
                if not self.require_permission(auth, "admin:manage"):
                    conn.close()
                    return json_response(self, {"error": "Sin permiso"}, 403)
                username = payload.get("username", "").strip()
                role = payload.get("role", "").strip().lower()
                branch_id = payload.get("branch_id", "").strip()
                temp_password = payload.get("temp_password", "Temp1234!").strip()
                username = payload.get("username", "").strip()
                role = payload.get("role", "").strip().lower()
                branch_id = payload.get("branch_id", "").strip()
                if not username or not role:
                    conn.close()
                    return json_response(self, {"error": "Usuario y rol requeridos"}, 400)
                try:
                    new_id = str(uuid4())
                    cur.execute(
                        """
                        INSERT INTO users(id,username,role_name,branch_id,password_hash,must_change_password,active,created_at)
                        VALUES(?,?,?,?,?,?,?,?)
                        """,
                        (
                            new_id,
                            username,
                            role,
                            branch_id or None,
                            hash_password(temp_password),
                            1,
                            1,
                            now_iso(),
                        ),
                    )
                    audit(cur, user["id"], "admin.user_created", "user", new_id, {"username": username})
                    conn.commit()
                    conn.close()
                    return json_response(self, {"ok": True, "temp_password": temp_password}, 201)
                    cur.execute(
                        "INSERT INTO users(id,username,role_name,branch_id,created_at) VALUES(?,?,?,?,?)",
                        (str(uuid4()), username, role, branch_id or None, now_iso()),
                    )
                    conn.commit()
                    conn.close()
                    return json_response(self, {"ok": True}, 201)
                except sqlite3.IntegrityError:
                    conn.rollback()
                    conn.close()
                    return json_response(self, {"error": "Usuario duplicado o rol inválido"}, 400)

            if parsed.path == "/api/admin/branding":
                if not self.require_permission(auth, "admin:manage"):
                    conn.close()
                    return json_response(self, {"error": "Sin permiso"}, 403)
                brand = {
                    "title": payload.get("title", "MediFlow OSS"),
                    "subtitle": payload.get("subtitle", ""),
                    "logo": payload.get("logo", ""),
                }
                cur.execute(
                    "INSERT INTO app_config(key,value) VALUES('brand',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (json.dumps(brand),),
                )
                audit(cur, user["id"], "admin.branding_updated", "config", "brand", brand)
                conn.commit()
                conn.close()
                return json_response(self, {"ok": True})

            conn.close()
            return json_response(self, {"error": "Not found"}, 404)
                conn.commit()
                conn.close()
                return json_response(self, {"ok": True}, 201)

            conn.close()
        return json_response(self, {"error": "Not found"}, 404)


def run_server(port=8080):
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"MediFlow running on http://localhost:{port}")
    print("Usuario inicial: root | contraseña inicial: root1234!")
    print(f"MediFlow server running on http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server(int(os.environ.get("PORT", "8080")))
    port = int(os.environ.get("PORT", "8080"))
    run_server(port)
