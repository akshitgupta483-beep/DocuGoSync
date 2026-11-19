from pathlib import Path

def verify_findings(findings, repo_root):
    root = Path(repo_root).resolve()
    for finding in findings:
        try:
            doc = (root / finding["doc_file"]).resolve()
            if root not in doc.parents or not doc.is_file():
                continue
            doc_lines = doc.read_text(encoding="utf-8", errors="replace").splitlines()
            doc_ok = 1 <= finding["doc_line"] <= len(doc_lines)
            quote = str(finding.get("doc_quote") or finding.get("claim_text") or "")
            doc_quote_ok = doc_ok and bool(quote) and quote in doc_lines[finding["doc_line"] - 1]
            if not doc_ok:
                continue
            if finding["code_file"] and finding["code_line"]:
                code = (root / finding["code_file"]).resolve()
                if root not in code.parents or not code.is_file():
                    continue
                code_lines = code.read_text(encoding="utf-8", errors="replace").splitlines()
                code_ok = 1 <= finding["code_line"] <= len(code_lines)
                code_quote = str(finding.get("actual_value") or finding.get("actual_code_evidence") or "")
                code_support_ok = code_ok and bool(code_quote) and code_quote.lower() in code_lines[finding["code_line"] - 1].lower()
                finding["evidence_verified"] = bool(doc_quote_ok and code_support_ok)
            else:
                # Absence findings must never be marked as verified evidence.
                finding["evidence_verified"] = False
        except (OSError, ValueError):
            finding["evidence_verified"] = False
    return findings
