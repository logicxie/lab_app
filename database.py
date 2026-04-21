# ============================================================
# database.py — 实验小助手 SQLite 数据存储
# ============================================================

import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "lab_data.db")


def _init_db():
    """初始化数据库，创建 key-value 存储表"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE IF NOT EXISTS store (key TEXT PRIMARY KEY, data TEXT)")
    conn.commit()
    conn.close()


def load_data(key, default_val=None):
    """从数据库读取 JSON 数据"""
    if default_val is None:
        default_val = []
    if not os.path.exists(DB_PATH):
        _init_db()
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT data FROM store WHERE key = ?", (key,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return json.loads(row[0])
    except Exception as e:
        print(f"Error loading {key}: {e}")
    return default_val


def save_data(key, data):
    """将 JSON 数据写入数据库"""
    if not os.path.exists(DB_PATH):
        _init_db()
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        data_str = json.dumps(data, ensure_ascii=False)
        cursor.execute(
            "INSERT INTO store (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
            (key, data_str),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error saving {key}: {e}")


def load_cell_db():
    """加载细胞档案数据库"""
    db_dict = load_data("cell_db", {})
    if db_dict:
        return db_dict
    # 返回默认示例档案
    return {
        "示例细胞_10%FBS": {
            "data": [{"N0": 33.0, "t": 24.0, "Nt": 80.0,
                       "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}],
            "r": 0.08,
            "pre_passage_records": [],
        }
    }


def save_cell_db(cell_db):
    """保存细胞档案数据库"""
    save_data("cell_db", cell_db)
