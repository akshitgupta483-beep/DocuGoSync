from pathlib import Path
from threading import Lock
import sqlite3
from datetime import datetime, timezone
import json

ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = ROOT / "pythadoc.db"
STORE = {}
lock = Lock()

def init_db():
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS scan_history (
                scan_id TEXT PRIMARY KEY,
                repository_url TEXT NOT NULL,
                repository_name TEXT NOT NULL,
                scan_timestamp TEXT NOT NULL,
                scan_status TEXT NOT NULL,
                files_scanned INTEGER NOT NULL,
                claims_extracted INTEGER NOT NULL,
                verified_claims INTEGER NOT NULL,
                findings_count INTEGER NOT NULL,
                severity_counts TEXT NOT NULL,
                health_score TEXT NOT NULL,
                scan_duration REAL NOT NULL
            )
        """)

def update(scan_id, **values):
    with lock:
        if scan_id in STORE:
            STORE[scan_id].update(values)

def record_history(scan_id, repository_url, repository_name, status, result=None,
                   duration=0.0, error=None):
    result = result or {}
    statistics = result.get("statistics", {})
    severity = statistics.get("severity_counts", {})
    health = statistics.get("health_score")
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute("""
            INSERT OR REPLACE INTO scan_history
            (scan_id, repository_url, repository_name, scan_timestamp, scan_status,
             files_scanned, claims_extracted, verified_claims, findings_count,
             severity_counts, health_score, scan_duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            scan_id, repository_url, repository_name,
            datetime.now(timezone.utc).isoformat(), status,
            int(statistics.get("files_scanned", 0)),
            int(statistics.get("claims_extracted", 0)),
            int(statistics.get("verified_claims", 0)),
            int(statistics.get("drift_findings", 0)),
            json.dumps(severity),
            "Not enough checkable claims" if health is None else str(health),
            float(duration)
        ))

def list_history(limit=50):
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            "SELECT * FROM scan_history ORDER BY scan_timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
        output = []
        for row in rows:
            item = dict(row)
            item["severity_counts"] = json.loads(item["severity_counts"])
            output.append(item)
        return output

init_db()
