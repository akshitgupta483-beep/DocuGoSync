import tempfile
import unittest
from pathlib import Path

from app import create_app
from app.services.ast_facts import analyze_file
from app.services.claims import extract_claims
from app.services.detector import detect, equal_values, severity_for, generate_fix, health_score, compute_confidence
from app.services.verify import verify_findings


class PythaDocTests(unittest.TestCase):
    def test_correct_default_verified(self):
        facts = analyze_file("def connect(timeout=10):\n    pass\n", "client.py")
        claims = extract_claims("connect(timeout=10)\n", "README.md")
        findings = detect(claims, facts)
        self.assertEqual(len(findings), 0)

    def test_incorrect_default_drift(self):
        facts = analyze_file("def connect(timeout=30):\n    pass\n", "client.py")
        claims = extract_claims("connect(timeout=10)\n", "README.md")
        findings = detect(claims, facts)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["status"], "DRIFT DETECTED")
        self.assertEqual(findings[0]["actual_value"], "30")

    def test_missing_function(self):
        facts = analyze_file("def present():\n    pass\n", "client.py")
        claims = extract_claims("Call `missing()` now.\n", "README.md")
        finding = detect(claims, facts)[0]
        self.assertEqual(finding["type"], "function_existence")
        self.assertFalse(finding["evidence_verified"])

    def test_config_mismatch(self):
        facts = analyze_file("DEBUG = False\n", "settings.py")
        claims = extract_claims("Configuration: `DEBUG` = True\n", "README.md")
        findings = detect(claims, facts)
        self.assertEqual(findings[0]["status"], "DRIFT DETECTED")

    def test_fenced_placeholders_ignored(self):
        text = "```text\nNAME=PAGER\nPAGER=100\nTODO=1\n```\n"
        claims = extract_claims(text, "README.md")
        self.assertEqual(claims, [])

    def test_placeholder_filtering(self):
        claims = extract_claims("Configuration: `VALUE` = 3\nConfiguration: NAME=foo\n", "README.md")
        self.assertEqual(claims, [])

    def test_value_comparison(self):
        self.assertTrue(equal_values("10", "10.0"))
        self.assertTrue(equal_values("True", "true"))
        self.assertTrue(equal_values("None", "null"))
        self.assertTrue(equal_values("10 seconds", "10"))

    def test_ambiguous_parameters_need_review(self):
        facts = analyze_file("def one(timeout=10): pass\ndef two(timeout=20): pass\n", "client.py")
        claims = extract_claims("The timeout defaults to 10.\n", "README.md")
        findings = detect(claims, facts)
        self.assertEqual(findings, [])
        self.assertTrue(all(facts["functions"]))

    def test_severity_and_confidence(self):
        claim = {"file": "README.md", "text": "connect(timeout=10)", "name": "timeout"}
        severity, reason = severity_for(claim, "default_value")
        self.assertIn(severity, {"critical", "high", "medium", "low"})
        self.assertTrue(reason)
        score, reasons = compute_confidence(claim, {
            "doc_quote": True, "code_evidence": True, "specific": True,
            "unique_candidate": True, "ambiguous": False, "weak": False
        })
        self.assertGreater(score, 50)
        self.assertTrue(reasons)

    def test_health_score_and_not_enough_claims(self):
        score, label, count = health_score(["VERIFIED", "DRIFT DETECTED"])
        self.assertIsNone(score)
        self.assertEqual(count, 2)
        self.assertEqual(label, "Not enough checkable claims")

    def test_suggested_fix(self):
        finding = {
            "id": "finding-1", "type": "default_value",
            "claim_text": "connect(timeout=10)", "documented_value": "10",
            "actual_value": "30", "doc_file": "README.md", "doc_line": 1
        }
        fix = generate_fix(finding)
        self.assertEqual(fix["proposed_content"], "connect(timeout=30)")

    def test_evidence_verification(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "README.md").write_text("connect(timeout=10)\n", encoding="utf-8")
            (root / "client.py").write_text("def connect(timeout=30):\n    pass\n", encoding="utf-8")
            facts = analyze_file((root / "client.py").read_text(), "client.py")
            claims = extract_claims((root / "README.md").read_text(), "README.md")
            findings = verify_findings(detect(claims, facts), root)
            self.assertTrue(findings[0]["evidence_verified"])

    def test_api_health_and_scan_validation(self):
        app = create_app()
        app.config["TESTING"] = True
        client = app.test_client()
        health = client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.get_json()["service"], "PythaDoc")
        missing = client.post("/api/scan", json={})
        self.assertEqual(missing.status_code, 400)
        not_found = client.get("/api/results/not-a-scan")
        self.assertEqual(not_found.status_code, 404)
        history = client.get("/api/scans")
        self.assertEqual(history.status_code, 200)
        self.assertIn("scans", history.get_json())


if __name__ == "__main__":
    unittest.main()
