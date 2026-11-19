import re

def norm(value):
    text = str(value).strip().strip("'\"`").lower()
    if text in {"true", "false", "none", "null"}:
        return text if text != "null" else "none"
    if re.fullmatch(r"[+-]?\d+\.\d+", text):
        try:
            return str(int(float(text))) if float(text).is_integer() else text
        except ValueError:
            pass
    if re.fullmatch(r"[+-]?\d+", text):
        return str(int(text))
    seconds = re.fullmatch(r"([+-]?\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)", text)
    if seconds:
        try:
            number = float(seconds.group(1))
            return str(int(number)) if number.is_integer() else str(number)
        except ValueError:
            pass
    return text

def equal_values(documented, actual):
    return norm(documented) == norm(actual)

def severity_for(claim, finding_type):
    doc = str(claim.get("file", "")).lower()
    text = str(claim.get("text", "")).lower()
    public = not finding_type.startswith("missing_internal")
    main_doc = doc.startswith("readme") or "/readme" in doc or "/docs/" not in doc and doc.endswith((".md", ".rst", ".txt"))
    if finding_type == "missing_function" or (finding_type == "default_value" and main_doc and public):
        return "critical", "Public documentation in a main README or usage section contradicts or references missing API behavior."
    if finding_type == "default_value" and ("docs/" in doc or "/docs/" in doc):
        return "high", "A wrong public function default appears in the documentation tree."
    if "/examples/" in doc or "example" in doc:
        return "low", "The mismatch comes from an examples area, where illustrative values may be intentionally different."
    if "internal" in text or finding_type == "missing_internal":
        return "medium", "The finding concerns a private or internal name in secondary documentation."
    return "medium", "The value mismatch is meaningful but appears outside the main public README section."

def compute_confidence(claim, evidence):
    score = 25
    reasons = []
    if evidence.get("doc_quote"):
        score += 20; reasons.append("The documentation quote is present at the cited line.")
    if evidence.get("code_evidence"):
        score += 25; reasons.append("Concrete code evidence exists at the cited location.")
    if evidence.get("specific"):
        score += 15; reasons.append("The claim identifies a specific function or setting.")
    if evidence.get("unique_candidate"):
        score += 15; reasons.append("Exactly one plausible code candidate was found.")
    if evidence.get("ambiguous"):
        score -= 35; reasons.append("Multiple plausible candidates make the claim ambiguous.")
    if evidence.get("weak"):
        score -= 20; reasons.append("The repository search is incomplete or weak.")
    score = max(0, min(100, score))
    return score, reasons

def health_score(claims_statuses, findings=None):
    findings = findings or []
    checked = [s for s in claims_statuses if s in {"VERIFIED", "DRIFT DETECTED"}]
    if len(checked) < 5:
        return None, "Not enough checkable claims", len(checked)
    penalties = {"critical": 1.0, "high": 0.7, "medium": 0.4, "low": 0.15}
    total = sum(penalties.get(str(f.get("severity", "low")).lower(), 0.15) for f in findings)
    score = max(0, min(100, round(100 * (1 - total / len(checked)))))
    return score, "Documentation health uses verified and drifted claims", len(checked)

def generate_fix(finding):
    actual = finding.get("actual_value")
    text = finding.get("claim_text") or finding.get("doc_quote") or ""
    if finding.get("type") != "default_value" or actual is None:
        return None
    original = text
    documented = finding.get("documented_value")
    if documented is None or str(documented) not in text:
        return None
    proposed = text.replace(str(documented), str(actual), 1)
    return {
        "id": "fix-" + finding["id"].split("-", 1)[-1],
        "finding_id": finding["id"], "findingId": finding["id"],
        "doc_file": finding["doc_file"], "docFile": finding["doc_file"],
        "doc_line": finding["doc_line"], "docLine": finding["doc_line"],
        "original_content": original, "originalContent": original,
        "proposed_content": proposed, "proposedContent": proposed,
        "description": f"Replace documented value {documented} with code-confirmed value {actual}.",
        "reason": f"Replace documented value {documented} with code-confirmed value {actual}.",
        "status": "pending"
    }

def detect(claims, facts):
    functions = {}
    flags = {}
    names = set()
    for fn in facts.get("functions", []):
        functions.setdefault(fn["name"], []).append(fn)
    for flag in facts.get("config_flags", []):
        flags.setdefault(flag["name"], []).append(flag)
    names.update(functions)
    names.update(fn["name"] for fn in facts.get("functions", []))
    names.update(facts.get("imports", []))
    names.update(item["name"] for item in facts.get("classes", []))

    findings = []
    for claim in claims:
        kind, name = claim["type"], claim["name"]
        base = {
            "type": kind, "title": "", "message": "",
            "documented_value": claim.get("documented_value"),
            "doc_file": claim["file"], "doc_line": claim["line"],
            "doc_quote": claim["text"], "claim_text": claim["text"],
            "code_file": None, "code_line": None, "actual_value": None,
            "status": "UNVERIFIED", "evidence_verified": False,
            "confidence_reasons": []
        }
        if kind == "default_value":
            requested_function = claim.get("function_name")
            if requested_function:
                candidates = [f for f in functions.get(requested_function, []) if name in f["defaults"]]
            else:
                candidates = [f for fn_name, fs in functions.items() for f in fs if name in f["defaults"]]

            if len(candidates) == 0:
                base["status"] = "UNVERIFIED"
                base["title"] = f"Default could not be verified: {name}"
                base["message"] = "No sufficiently specific function candidate was found for this parameter."
            elif len(candidates) > 1:
                base["status"] = "NEEDS REVIEW"
                base["title"] = f"Ambiguous default: {name}"
                base["message"] = "Multiple functions contain this parameter with potentially different defaults."
                base["evidence_verified"] = False
            else:
                fn = candidates[0]
                actual = fn["defaults"][name]
                base.update({
                    "code_file": fn["file"], "code_line": actual["line"],
                    "actual_value": str(actual["value"]),
                    "actual_code_evidence": str(actual["value"]),
                    "evidence_verified": True
                })
                if equal_values(claim["documented_value"], actual["value"]):
                    base["status"] = "VERIFIED"
                    base["title"] = f"Default verified: {name}"
                    base["message"] = "The documentation value matches the Python AST default."
                else:
                    base["status"] = "DRIFT DETECTED"
                    base["title"] = f"Default value mismatch: {name}"
                    base["message"] = f"Documentation says {claim['documented_value']}, but code sets the default to {actual['value']}."
                    base["severity"], base["severity_reason"] = severity_for(claim, kind)
                    findings.append(base)
        elif kind == "function_existence":
            exists = name in names
            base.update({"actual_code_evidence": name if exists else "No matching function, method, class, or import found"})
            if exists:
                base["status"] = "VERIFIED"
                base["title"] = f"Function reference verified: {name}"
                base["message"] = "The referenced name exists in Python source, as a function, method, class, or import."
                base["evidence_verified"] = True
            else:
                base["status"] = "DRIFT DETECTED"
                base["title"] = f"Documented function not found: {name}"
                base["message"] = f"Documentation references {name}(), but no sufficiently complete source match was found."
                base["severity"], base["severity_reason"] = severity_for(claim, "missing_function")
                findings.append(base)
        elif kind == "config_flag":
            candidates = flags.get(name, [])
            if not candidates:
                base["status"] = "UNVERIFIED"
                base["title"] = f"Configuration setting could not be confirmed: {name}"
                base["message"] = "The setting was not found in confirmed source declarations."
            elif len(candidates) > 1:
                base["status"] = "NEEDS REVIEW"
                base["title"] = f"Ambiguous configuration setting: {name}"
                base["message"] = "Multiple declarations for this setting were found."
            else:
                actual = candidates[0]
                base.update({
                    "code_file": actual["file"], "code_line": actual["line"],
                    "actual_value": str(actual["value"]),
                    "actual_code_evidence": str(actual["value"]),
                    "evidence_verified": True
                })
                if equal_values(claim["documented_value"], actual["value"]):
                    base["status"] = "VERIFIED"
                    base["title"] = f"Configuration value verified: {name}"
                    base["message"] = "The documented setting matches the source declaration."
                else:
                    base["status"] = "DRIFT DETECTED"
                    base["title"] = f"Configuration value mismatch: {name}"
                    base["message"] = f"Documentation says {claim['documented_value']}, but code sets {actual['value']}."
                    base["severity"], base["severity_reason"] = severity_for(claim, kind)
                    findings.append(base)

        evidence = {
            "doc_quote": bool(claim.get("text")),
            "code_evidence": bool(base.get("code_file") and base.get("code_line")),
            "specific": bool(kind != "default_value" or claim.get("function_name")),
            "unique_candidate": base["status"] != "NEEDS REVIEW",
            "ambiguous": base["status"] == "NEEDS REVIEW",
            "weak": base["status"] == "UNVERIFIED"
        }
        base["confidence"], base["confidence_reasons"] = compute_confidence(claim, evidence)
        base["id"] = ""
    for index, finding in enumerate(findings, 1):
        finding["id"] = f"finding-{index}"
    return findings
