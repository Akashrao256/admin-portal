import os
import sqlite3
from functools import wraps

from flask import Flask, g, jsonify, request, session
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, "app.db")


app = Flask(__name__)
CORS(app, supports_credentials=True)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = 60 * 60 * 24 * 30


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_error):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DATABASE_PATH)
    db.execute("PRAGMA foreign_keys = ON")
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS opportunities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admin_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            duration TEXT NOT NULL,
            start_date TEXT NOT NULL,
            description TEXT NOT NULL,
            skills_text TEXT NOT NULL,
            category TEXT NOT NULL,
            future_opportunities TEXT NOT NULL,
            max_applicants INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
        )
        """
    )
    db.commit()
    db.close()


def row_to_admin(row):
    return {
        "id": row["id"],
        "full_name": row["full_name"],
        "email": row["email"],
    }


def row_to_opportunity(row):
    return {
        "id": row["id"],
        "admin_id": row["admin_id"],
        "name": row["name"],
        "duration": row["duration"],
        "start_date": row["start_date"],
        "description": row["description"],
        "skills_text": row["skills_text"],
        "category": row["category"],
        "future_opportunities": row["future_opportunities"],
        "max_applicants": row["max_applicants"],
        "created_at": row["created_at"],
    }


def get_current_admin():
    admin_id = session.get("admin_id")
    if not admin_id:
        return None

    db = get_db()
    return db.execute(
        "SELECT id, full_name, email FROM admins WHERE id = ?",
        (admin_id,),
    ).fetchone()


def login_required(view_func):
    @wraps(view_func)
    def wrapped_view(*args, **kwargs):
        admin = get_current_admin()
        if admin is None:
            return jsonify({"message": "Unauthorized"}), 401
        return view_func(admin, *args, **kwargs)

    return wrapped_view


@app.get("/")
def index():
    return jsonify({"message": "Backend is running"})


@app.post("/api/auth/signup")
def signup():
    data = request.get_json(silent=True) or {}

    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    confirm_password = data.get("confirm_password") or ""

    if not full_name or not email or not password:
        return jsonify({"message": "full_name, email, and password are required"}), 400

    if confirm_password and password != confirm_password:
        return jsonify({"message": "Passwords do not match"}), 400

    db = get_db()
    existing_admin = db.execute(
        "SELECT id FROM admins WHERE email = ?",
        (email,),
    ).fetchone()
    if existing_admin is not None:
        return jsonify({"message": "Account already exists"}), 409

    password_hash = generate_password_hash(password)
    cursor = db.execute(
        """
        INSERT INTO admins (full_name, email, password_hash)
        VALUES (?, ?, ?)
        """,
        (full_name, email, password_hash),
    )
    db.commit()

    admin = db.execute(
        "SELECT id, full_name, email FROM admins WHERE id = ?",
        (cursor.lastrowid,),
    ).fetchone()

    return jsonify(
        {
            "message": "Account created successfully",
            "admin": row_to_admin(admin),
        }
    ), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    remember_me = bool(data.get("remember_me"))

    if not email or not password:
        return jsonify({"message": "Email and password are required"}), 400

    db = get_db()
    admin = db.execute(
        "SELECT * FROM admins WHERE email = ?",
        (email,),
    ).fetchone()

    if admin is None or not check_password_hash(admin["password_hash"], password):
        return jsonify({"message": "Invalid email or password"}), 401

    session.clear()
    session["admin_id"] = admin["id"]
    session.permanent = remember_me

    return jsonify(
        {
            "message": "Login successful",
            "admin": row_to_admin(admin),
        }
    )


@app.get("/api/auth/me")
@login_required
def me(admin):
    return jsonify({"admin": row_to_admin(admin)})


@app.post("/api/opportunities")
@login_required
def create_opportunity(admin):
    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip()
    duration = (data.get("duration") or "").strip()
    start_date = (data.get("start_date") or "").strip()
    description = (data.get("description") or "").strip()
    skills_text = (data.get("skills_text") or "").strip()
    category = (data.get("category") or "").strip()
    future_opportunities = (data.get("future_opportunities") or "").strip()
    max_applicants = data.get("max_applicants")

    required_values = [
        name,
        duration,
        start_date,
        description,
        skills_text,
        category,
        future_opportunities,
    ]
    if any(not value for value in required_values):
        return jsonify({"message": "Missing required opportunity fields"}), 400

    if max_applicants in ("", None):
        max_applicants = None

    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO opportunities (
            admin_id, name, duration, start_date, description,
            skills_text, category, future_opportunities, max_applicants
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            admin["id"],
            name,
            duration,
            start_date,
            description,
            skills_text,
            category,
            future_opportunities,
            max_applicants,
        ),
    )
    db.commit()

    opportunity = db.execute(
        "SELECT * FROM opportunities WHERE id = ?",
        (cursor.lastrowid,),
    ).fetchone()

    return jsonify(
        {
            "message": "Opportunity created successfully",
            "opportunity": row_to_opportunity(opportunity),
        }
    ), 201


@app.get("/api/opportunities")
@login_required
def list_opportunities(admin):
    db = get_db()
    rows = db.execute(
        """
        SELECT * FROM opportunities
        WHERE admin_id = ?
        ORDER BY id DESC
        """,
        (admin["id"],),
    ).fetchall()

    return jsonify(
        {
            "opportunities": [row_to_opportunity(row) for row in rows],
        }
    )


init_db()


if __name__ == "__main__":
    app.run(debug=False)
