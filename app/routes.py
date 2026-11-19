import threading
import uuid
from flask import Blueprint, jsonify, request
from .services.scanner import run_scan
from .services.store import STORE, lock
from .services.store import list_history

api = Blueprint("api", __name__, url_prefix="/api")

@api.get("/health")
def health():
    return jsonify({"status": "ok", "service": "PythaDoc", "tagline": "Keep your Python docs as true as your code."})

@api.post("/scan")
def start_scan():
    body = request.get_json(silent=True) or {}
    repo_url = body.get("repository_url", "")
    if not isinstance(repo_url, str) or not repo_url.strip():
        return jsonify({"error": "repository_url is required"}), 400
    scan_id = uuid.uuid4().hex
    with lock:
        STORE[scan_id] = {
            "scan_id": scan_id, "status": "queued", "progress": 0,
            "stage": "Queued", "result": None, "error": None
        }
    thread = threading.Thread(target=run_scan, args=(scan_id, repo_url.strip()), daemon=True)
    thread.start()
    return jsonify({"scan_id": scan_id, "status": "queued"}), 202

@api.get("/results/<scan_id>")
def get_results(scan_id):
    with lock:
        item = STORE.get(scan_id)
        if item is None:
            return jsonify({"error": "Scan not found"}), 404
        return jsonify(item)

@api.get("/scans")
def get_scans():
    return jsonify({"scans": list_history()})
