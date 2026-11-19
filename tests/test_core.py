import tempfile
import unittest
from pathlib import Path
from app.services.ast_facts import analyze_file
from app.services.claims import extract_claims
from app.services.detector import detect
from app.services.verify import verify_findings

class CoreTests(unittest.TestCase):
    def test_detect_default_mismatch(self):
        facts = analyze_file("def connect(timeout=30):\n    pass\n", "src/client.py")
        claims = extract_claims("The timeout defaults to 10.\n", "README.md")
        findings = detect(claims, facts)
        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0]["actual_value"], "30")

    def test_matching_default_has_no_finding(self):
        facts = analyze_file("def connect(timeout=10):\n    pass\n", "src/client.py")
        claims = extract_claims("The timeout defaults to 10.\n", "README.md")
        self.assertEqual(detect(claims, facts), [])

    def test_missing_function(self):
        facts = analyze_file("def present():\n    pass\n", "src/a.py")
        claims = extract_claims("Call `missing()` to start.\n", "README.md")
        self.assertEqual(detect(claims, facts)[0]["type"], "function_existence")

    def test_evidence_verification(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "README.md").write_text("The timeout defaults to 10.\n", encoding="utf-8")
            (root / "client.py").write_text("def connect(timeout=30):\n    pass\n", encoding="utf-8")
            facts = analyze_file((root / "client.py").read_text(), "client.py")
            claims = extract_claims((root / "README.md").read_text(), "README.md")
            findings = detect(claims, facts)
            checked = verify_findings(findings, root)
            self.assertTrue(checked[0]["evidence_verified"])

if __name__ == "__main__":
    unittest.main()
