from pathlib import Path
import tempfile
import shutil
import time
from .store import update, record_history
from .repository import clone_repo, discover_files
from .ast_facts import analyze_file
from .claims import extract_claims
from .detector import detect
from .verify import verify_findings
from .detector import generate_fix, health_score

def run_scan(scan_id, repo_url):
    workdir = Path(tempfile.mkdtemp(prefix="pythadoc_"))
    repo_dir = workdir / "repository"
    started = time.monotonic()
    repo_name = "Unknown repository"
    try:
        update(scan_id, status="running", stage="Cloning repository", progress=5)
        repo_name = clone_repo(repo_url, repo_dir)
        py_files, doc_files = discover_files(repo_dir)
        if not py_files:
            raise RuntimeError("No Python source files were found in this repository.")
        update(scan_id, stage="Analyzing Python source", progress=15)
        facts = {"functions": [], "config_flags": [], "imports": [], "classes": []}
        for index, rel in enumerate(py_files, 1):
            try:
                source = (repo_dir / rel).read_text(encoding="utf-8", errors="replace")
                result = analyze_file(source, rel)
                facts["functions"].extend(result["functions"])
                facts["config_flags"].extend(result["config_flags"])
                facts["imports"].extend(result["imports"])
                facts["classes"].extend(result["classes"])
            except OSError:
                continue

        claims = []
        total = max(len(doc_files), 1)
        for index, rel in enumerate(doc_files, 1):
            try:
                text = (repo_dir / rel).read_text(encoding="utf-8", errors="replace")
                claims.extend(extract_claims(text, rel))
            except OSError:
                continue
            progress = 20 + int(55 * index / total)
            update(scan_id, stage=f"Extracting documentation claims ({index}/{total})", progress=progress)

        update(scan_id, stage="Comparing documentation with code", progress=80)
        findings = detect(claims, facts)
        findings = verify_findings(findings, repo_dir)

        claim_statuses = {}
        for claim in claims:
            matches = [f for f in findings if f["doc_file"] == claim["file"] and f["doc_line"] == claim["line"] and f["claim_text"] == claim["text"]]
            if matches:
                claim_statuses[id(claim)] = matches[0]["status"]
            elif claim["type"] == "default_value":
                candidates = []
                for fn in facts["functions"]:
                    if claim.get("function_name") in (None, fn["name"]) and claim["name"] in fn["defaults"]:
                        candidates.append(fn)
                if len(candidates) == 1:
                    claim_statuses[id(claim)] = "VERIFIED"
                elif len(candidates) > 1:
                    claim_statuses[id(claim)] = "NEEDS REVIEW"
                else:
                    claim_statuses[id(claim)] = "UNVERIFIED"
            elif claim["type"] == "config_flag":
                candidates = [f for f in facts["config_flags"] if f["name"] == claim["name"]]
                claim_statuses[id(claim)] = "VERIFIED" if len(candidates) == 1 else ("NEEDS REVIEW" if len(candidates) > 1 else "UNVERIFIED")
            else:
                names = set(fn["name"] for fn in facts["functions"])
                names.update(fn["name"] for fn in facts["classes"])
                names.update(facts["imports"])
                claim_statuses[id(claim)] = "VERIFIED" if claim["name"] in names else "DRIFT DETECTED"

        for index, finding in enumerate(findings, 1):
            finding["id"] = f"finding-{index}"
            finding["doc_file"] = finding.get("doc_file", "")
            finding["doc_line"] = finding.get("doc_line", 0)
            finding["doc_claim"] = finding.get("claim_text", "")
            finding["doc_evidence"] = finding.get("claim_text", "")
            finding["actual_code_evidence"] = finding.get("actual_value") or finding.get("message", "")
            finding["explanation"] = finding.get("message", "")
            finding["status"] = finding.get("status", "UNVERIFIED").upper()
            finding["confidence"] = finding.get("confidence", 0)
            fix = generate_fix(finding)
            finding["fix"] = fix
            finding["suggested_correction"] = fix["proposed_content"] if fix else "No safe automatic correction"

        frontend_claims = []
        for index, claim in enumerate(claims, 1):
            status = claim_statuses.get(id(claim), "UNVERIFIED")
            matching = next((f for f in findings if f["doc_file"] == claim["file"] and f["doc_line"] == claim["line"]), None)
            code_file = matching["code_file"] if matching else None
            code_line = matching["code_line"] if matching else None
            confidence = matching["confidence"] if matching else (45 if status == "UNVERIFIED" else 70)
            frontend_claims.append({
                **claim,
                "id": f"claim-{index}",
                "claim_text": claim.get("text", ""),
                "claimText": claim.get("text", ""),
                "doc_file": claim.get("file", ""),
                "doc_line": claim.get("line", 0),
                "code_file": code_file, "code_line": code_line,
                "status": status,
                "confidence": confidence,
                "details": matching["message"] if matching else "Claim extracted; source evidence was insufficient or no contradiction was found."
            })

        fixes = [finding["fix"] for finding in findings if finding.get("fix")]
        verified = sum(1 for claim in frontend_claims if claim["status"] == "VERIFIED")

        severity_counts = {}
        for finding in findings:
            sev = str(finding.get("severity", "medium")).lower()
            severity_counts[sev] = severity_counts.get(sev, 0) + 1

        total_files = len(set(py_files + doc_files))
        score, score_label, checked_claims = health_score(
            [claim["status"] for claim in frontend_claims], findings
        )
        result = {
            "repo_name": repo_name,
            "repository": {"name": repo_name, "url": repo_url},
            "repository_url": repo_url,
            "findings": findings,
            "claims": frontend_claims,
            "fixes": fixes,
            "statistics": {
                "python_files": len(py_files),
                "documentation_files": len(doc_files),
                "files_scanned": total_files,
                "filesScanned": total_files,
                "functions_found": len(facts["functions"]),
                "config_flags_found": len(facts["config_flags"]),
                "claims_extracted": len(claims),
                "total_claims": len(claims),
                "verified_claims": verified,
                "drift_findings": len(findings),
                "total_findings": len(findings),
                "verified_findings": verified,
                "severity_counts": severity_counts,
                "severityCounts": severity_counts,
                "health_score": score,
                "healthScore": score,
                "health_score_label": score_label,
                "checked_claims": checked_claims,
                "suggested_fixes": len(fixes)
            },
            "notice": "Deterministic pattern-based claim extraction; Python source and Markdown/RST/TXT documentation. Findings require human review. No repository files are modified."
        }
        update(scan_id, status="completed", stage="Scan complete", progress=100, result=result)
        record_history(scan_id, repo_url, repo_name, "completed", result,
                       duration=time.monotonic() - started)
    except Exception as exc:
        message = str(exc)
        update(scan_id, status="failed", stage="Scan failed", error=f"{type(exc).__name__}: {message}", progress=100)
        record_history(scan_id, repo_url, repo_name, "failed",
                       duration=time.monotonic() - started)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
