from pathlib import Path
from urllib.parse import urlparse
import re
import subprocess
import tempfile
import shutil

def validate_github_url(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.netloc.lower() not in {"github.com", "www.github.com"}:
        raise ValueError("Please provide an HTTPS GitHub repository URL.")
    parts = [p for p in parsed.path.strip("/").split("/") if p]
    if len(parts) < 2:
        raise ValueError("URL must look like https://github.com/owner/repository")
    owner, repo = parts[0], re.sub(r"\.git$", "", parts[1])
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", owner) or not re.fullmatch(r"[A-Za-z0-9_.-]+", repo):
        raise ValueError("Invalid GitHub repository URL.")
    return f"https://github.com/{owner}/{repo}.git", repo

def clone_repo(url, destination):
    safe_url, repo_name = validate_github_url(url)
    try:
        result = subprocess.run(
            ["git", "clone", "--depth", "1", "--filter=blob:none", safe_url, str(destination)],
            capture_output=True, text=True, timeout=180
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("Repository clone timed out after 180 seconds.")
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "git clone failed").strip()
        raise RuntimeError(message[-1200:])
    return repo_name

def discover_files(root):
    ignored = {".git", ".venv", "venv", "node_modules", "__pycache__", "build", "dist",
               "vendor", "vendors", "test", "tests", "changelog", "changes", "history"}
    py, docs = [], []
    for path in root.rglob("*"):
        if not path.is_file() or any(part in ignored for part in path.parts):
            continue
        name = path.name.lower()
        if name.startswith(("changelog", "changes", "history")):
            continue
        try:
            rel = path.relative_to(root)
        except ValueError:
            continue
        if path.suffix.lower() == ".py":
            if path.stat().st_size > 1024 * 1024:
                continue
            py.append(rel)
        elif path.suffix.lower() in {".md", ".rst", ".txt"} or path.name.lower() == "readme":
            docs.append(rel)
    py = sorted(py)[:1500]
    docs = sorted(docs)[:1500]
    return py, docs
