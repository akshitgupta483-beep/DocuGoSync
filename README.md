# PythaDoc

**Keep your Python docs as true as your code.**

PythaDoc is a Python/Flask documentation drift detector for public GitHub repositories. It extracts focused documentation claims, compares them with Python AST facts, and presents evidence-backed findings in a live dashboard.

## Features

- Documented Python default values compared with AST defaults
- Backticked function and method reference checks
- Module constants and explicitly documented configuration checks
- Drift, verified, unverified, and needs-review claim states
- Evidence verification, severity, confidence, and suggested corrections
- Documentation health score
- SQLite scan history
- Preserved Dashboard, Drift Findings, Claims Ledger, and Suggested Fixes pages

## Technology

- Python 3.10+
- Flask
- Vanilla JavaScript, HTML, and CSS
- Python `ast`
- SQLite
- Git CLI

## Installation on Windows

```bat
cd /d C:\Users\user\Desktop\DocuGoSync_Integrated
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
python run.py
```

Open http://127.0.0.1:5000.

## Scanning

Enter an HTTPS GitHub URL such as `https://github.com/pallets/requests` and choose **Scan Repository**. PythaDoc clones shallowly, temporarily analyzes files, and never modifies the repository.

## API

- `GET /api/health`
- `POST /api/scan` with `{"repository_url":"https://github.com/owner/repo"}`
- `GET /api/results/<scan_id>`
- `GET /api/scans`

## Claim statuses

- **VERIFIED**: source evidence supports the documented claim.
- **DRIFT DETECTED**: source evidence contradicts the documented claim.
- **UNVERIFIED**: the claim could not be checked reliably.
- **NEEDS REVIEW**: multiple plausible source candidates exist or the interpretation is ambiguous.

Absence findings are never automatically marked as VERIFIED.

## Severity

- **CRITICAL**: public README or usage documentation references missing API behavior or a wrong public default.
- **HIGH**: wrong default or configuration value in public documentation.
- **MEDIUM**: secondary-document mismatch or private/internal issue.
- **LOW**: ambiguous or examples-only documentation.

Every finding includes a `severity_reason`.

## Confidence

Confidence is a 0–100 score derived from positive evidence such as a matching documentation quote, concrete code evidence, claim specificity, and exactly one candidate. Ambiguity and weak evidence reduce it. The result includes `confidence_reasons`.

## Documentation health

The formula is:

`Score = 100 × (1 - total_penalty / checked_claims)`

Penalties:

- CRITICAL: 1.0
- HIGH: 0.7
- MEDIUM: 0.4
- LOW: 0.15

Only VERIFIED and DRIFT DETECTED claims are checked claims. Fewer than five checked claims displays **“Not enough checkable claims”** rather than a misleading 100 score.

Grade bands are Excellent (90–100), Good (75–89), Needs Attention (50–74), and Poor (below 50).

## Suggested fixes

The Suggested Fixes page displays preview and copy actions only for drift findings with a safe value replacement. PythaDoc does not edit repositories or apply patches.

## Scan history

The application creates `pythadoc.db` automatically. It stores scan metadata and summary statistics. `pythadoc.db` is excluded by `.gitignore`.

## Tests

```bat
python -m unittest discover -s tests -t . -v
```

Tests use local temporary source and documentation. No internet connection is needed.

## Scanning limits

- 180-second clone timeout
- 1,500 Python and documentation files
- 1 MB maximum individual source file
- Vendor, test, build, dist, virtual-environment, node_modules, and changelog paths are ignored

## Limitations

PythaDoc uses deterministic extraction and AST analysis, not general natural-language understanding. It may miss prose, unusual syntax, generated documentation, or dynamically defined behavior. Findings require human review. Private, missing, malformed, or unsupported repositories can fail or remain unverified. Scan history is local SQLite.
