"""SQLite persistence for analyses (replaces the browser localStorage store)."""

from __future__ import annotations

import json
import os
import sqlite3
from typing import Any

DB_PATH = os.environ.get("CROWDVISION_DB", os.path.join(os.path.dirname(__file__), "..", "crowdvision.db"))


def _conn() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db() -> None:
    with _conn() as con:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS analyses (
                id          TEXT PRIMARY KEY,
                created_at  TEXT NOT NULL,
                file_name   TEXT NOT NULL,
                risk        TEXT NOT NULL,
                people      INTEGER NOT NULL,
                cpri        INTEGER,
                payload     TEXT NOT NULL,
                thumbnail   TEXT
            )
            """
        )
        con.execute("CREATE INDEX IF NOT EXISTS idx_created ON analyses(created_at DESC)")


def save_analysis(a: dict[str, Any], thumbnail: str | None = None) -> None:
    with _conn() as con:
        con.execute(
            "INSERT OR REPLACE INTO analyses "
            "(id, created_at, file_name, risk, people, cpri, payload, thumbnail) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (a["id"], a["createdAt"], a["fileName"], a["risk"], a["peopleCount"],
             a.get("cpri"), json.dumps(a), thumbnail),
        )


def list_analyses(limit: int = 200) -> list[dict]:
    with _conn() as con:
        rows = con.execute(
            "SELECT payload, thumbnail FROM analyses ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    out = []
    for r in rows:
        item = json.loads(r["payload"])
        item["thumbnail"] = r["thumbnail"]
        out.append(item)
    return out


def get_analysis(analysis_id: str) -> dict | None:
    with _conn() as con:
        row = con.execute(
            "SELECT payload, thumbnail FROM analyses WHERE id = ?", (analysis_id,)
        ).fetchone()
    if not row:
        return None
    item = json.loads(row["payload"])
    item["thumbnail"] = row["thumbnail"]
    return item


def delete_analysis(analysis_id: str) -> None:
    with _conn() as con:
        con.execute("DELETE FROM analyses WHERE id = ?", (analysis_id,))


def clear_all() -> None:
    with _conn() as con:
        con.execute("DELETE FROM analyses")
