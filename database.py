# ============================================================
# database.py — 实验小助手 SQLite 数据存储与账户认证
# ============================================================

import contextvars
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "lab_data.db")
DEFAULT_OWNER = "admin"
_CURRENT_OWNER = contextvars.ContextVar("lab_current_owner", default=DEFAULT_OWNER)


def set_current_owner(owner_id):
    """设置当前请求的数据归属账户。"""
    return _CURRENT_OWNER.set(owner_id or DEFAULT_OWNER)


def reset_current_owner(token):
    if token is not None:
        _CURRENT_OWNER.reset(token)


def get_current_owner():
    return _CURRENT_OWNER.get() or DEFAULT_OWNER


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return salt, digest.hex()


def _verify_password(password, salt, digest):
    _, candidate = _hash_password(password, salt)
    return hmac.compare_digest(candidate, digest)


def _init_db():
    """初始化数据库，创建账户表和按用户隔离的 key-value 存储。"""
    conn = _connect()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS store (
            owner_id TEXT NOT NULL,
            key TEXT NOT NULL,
            data TEXT NOT NULL,
            updated_at TEXT,
            PRIMARY KEY (owner_id, key)
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            password_salt TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            is_admin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def ensure_admin_user():
    _init_db()
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute("SELECT username FROM users WHERE username = ?", (DEFAULT_OWNER,))
    exists = cursor.fetchone()
    if not exists:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        salt, digest = _hash_password("admin123")
        cursor.execute(
            """
            INSERT INTO users (username, password_salt, password_hash, display_name, is_admin, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (DEFAULT_OWNER, salt, digest, "管理员", 1, now, now),
        )
        conn.commit()
    conn.close()


def serialize_user(row):
    if not row:
        return None
    return {
        "username": row["username"],
        "display_name": row["display_name"] or row["username"],
        "is_admin": bool(row["is_admin"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def authenticate_user(username, password):
    ensure_admin_user()
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    if not row or not _verify_password(password, row["password_salt"], row["password_hash"]):
        return None
    return serialize_user(row)


def create_session(username, days=7):
    ensure_admin_user()
    token = secrets.token_urlsafe(32)
    now = datetime.now()
    expires = now + timedelta(days=days)
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, username, now.strftime("%Y-%m-%d %H:%M:%S"), expires.strftime("%Y-%m-%d %H:%M:%S")),
    )
    conn.commit()
    conn.close()
    return token, expires


def delete_session(token):
    if not token:
        return
    ensure_admin_user()
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


def get_user_by_session(token):
    if not token:
        return None
    ensure_admin_user()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
    cursor.execute(
        """
        SELECT u.* FROM sessions s
        JOIN users u ON u.username = s.username
        WHERE s.token = ? AND s.expires_at >= ?
        """,
        (token, now),
    )
    row = cursor.fetchone()
    conn.commit()
    conn.close()
    return serialize_user(row)


def list_users():
    ensure_admin_user()
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users ORDER BY created_at ASC")
    rows = cursor.fetchall()
    conn.close()
    return [serialize_user(row) for row in rows]


def create_user(username, password, display_name="", is_admin=False):
    ensure_admin_user()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    salt, digest = _hash_password(password)
    conn = _connect()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO users (username, password_salt, password_hash, display_name, is_admin, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (username, salt, digest, display_name or username, 1 if is_admin else 0, now, now),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return None
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    return serialize_user(row)


def change_password(username, old_password, new_password, require_old=True):
    ensure_admin_user()
    conn = _connect()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
    if require_old and not _verify_password(old_password or "", row["password_salt"], row["password_hash"]):
        conn.close()
        return False
    salt, digest = _hash_password(new_password)
    cursor.execute(
        "UPDATE users SET password_salt = ?, password_hash = ?, updated_at = ? WHERE username = ?",
        (salt, digest, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), username),
    )
    cursor.execute("DELETE FROM sessions WHERE username = ?", (username,))
    conn.commit()
    conn.close()
    return True


def load_data(key, default_val=None, owner_id=None):
    """从数据库读取当前账户的 JSON 数据。"""
    if default_val is None:
        default_val = []
    ensure_admin_user()
    owner = owner_id or get_current_owner()
    try:
        conn = _connect()
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM store WHERE owner_id = ? AND key = ?", (owner, key))
        row = cursor.fetchone()
        conn.close()
        if row:
            return json.loads(row["data"])
    except Exception as e:
        print(f"Error loading {key}: {e}")
    return default_val


def save_data(key, data, owner_id=None):
    """将 JSON 数据写入当前账户空间。"""
    ensure_admin_user()
    owner = owner_id or get_current_owner()
    try:
        conn = _connect()
        cursor = conn.cursor()
        data_str = json.dumps(data, ensure_ascii=False)
        cursor.execute(
            """
            INSERT INTO store (owner_id, key, data, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(owner_id, key) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
            """,
            (owner, key, data_str, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error saving {key}: {e}")


def load_cell_db(owner_id=None):
    """加载细胞档案数据库。"""
    db_dict = load_data("cell_db", {}, owner_id=owner_id)
    if db_dict:
        return db_dict
    return {
        "示例细胞_10%FBS": {
            "params": {"name": "示例细胞", "base_media": "DMEM", "fbs": "10%", "others": ""},
            "data": [{"N0": 33.0, "t": 24.0, "Nt": 80.0,
                       "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}],
            "r": 0.08,
            "pre_passage_records": [],
        }
    }


def save_cell_db(cell_db, owner_id=None):
    """保存细胞档案数据库。"""
    save_data("cell_db", cell_db, owner_id=owner_id)
