/**
 * DocuGoSync – Documentation Drift Detector
 * js/mockData.js
 *
 * Synthetic demo data for frontend prototyping prior to Flask backend integration.
 *
 * DISCLAIMER:
 * All data in this file is synthetic and generated for design/testing purposes only.
 * It does NOT reflect the results of an actual GitHub repository scan.
 */

(function () {
  'use strict';

  // ───────────────────────────────────────────────────────────────────────────
  // 3. REALISTIC DOCUMENTATION FINDINGS (Python Ecosystem)
  // ───────────────────────────────────────────────────────────────────────────
  const findings = [
    {
      id: 'F-101',
      title: 'Incorrect default HTTP request timeout documented',
      severity: 'critical',
      confidence: 98,
      status: 'pending',
      docFile: 'docs/api/client.md',
      docLine: 42,
      docClaim: 'Default client timeout is 30.0 seconds when omitted.',
      docEvidence: '```markdown\n## Client Configuration\n\nBy default, `HttpClient()` initializes with a request timeout of `30.0` seconds:\n\n```python\nclient = HttpClient(api_key="sk_live_123")  # timeout defaults to 30.0s\n```\n```',
      codeFile: 'src/gateway/client.py',
      codeLine: 86,
      actualCodeEvidence: '```python\nclass HttpClient:\n    """Synchronous gateway client with resilient backoff."""\n\n    def __init__(\n        self,\n        api_key: str,\n        timeout: float = 10.0,  # Changed from 30.0 to 10.0 in v2.4\n        max_retries: int = 3,\n    ) -> None:\n        self.api_key = api_key\n        self.timeout = timeout\n        self.max_retries = max_retries\n```',
      explanation: 'Documentation claims the default timeout is 30.0s, but implementation in src/gateway/client.py defaults timeout to 10.0s to fail fast under high concurrency.',
      suggestedCorrection: 'Update docs/api/client.md line 42 to state `10.0` seconds instead of `30.0` seconds.',
      fixId: 'FIX-101',
      fix: {
        id: 'FIX-101',
        findingId: 'F-101',
        status: 'pending',
        docFile: 'docs/api/client.md',
        docLine: 42,
        fileReference: 'docs/api/client.md · Line 42',
        confidence: 98,
        description: 'Function HttpClient() default timeout in documentation does not match the implementation (documented 30.0s vs actual 10.0s).',
        originalContent: '- client = HttpClient(api_key="sk_live_123")  # timeout defaults to 30.0s',
        proposedContent: '+ client = HttpClient(api_key="sk_live_123")  # timeout defaults to 10.0s'
      },
      detectedAt: '2026-11-18 22:30:15 UTC'
    },
    {
      id: 'F-102',
      title: 'Renamed user profile retrieval method',
      severity: 'high',
      confidence: 96,
      status: 'pending',
      docFile: 'docs/guides/user_management.md',
      docLine: 88,
      docClaim: 'Call client.fetch_user_profile(user_id) to retrieve account profile.',
      docEvidence: '```markdown\n### Retrieving Account Details\n\nTo fetch a user account, call `fetch_user_profile`:\n\n```python\nprofile = client.fetch_user_profile(user_id="usr_8820")\nprint(profile.email)\n```\n```',
      codeFile: 'src/services/users.py',
      codeLine: 134,
      actualCodeEvidence: '```python\n    # Method was renamed from fetch_user_profile to get_user_profile in PR #142\n    def get_user_profile(self, user_id: str) -> UserProfile:\n        """Fetch full user profile record by UUID."""\n        record = self._db.query(UserModel).filter_by(id=user_id).one_or_none()\n        if record is None:\n            raise UserNotFoundError(f"User {user_id} not found")\n        return UserProfile.from_orm(record)\n```',
      explanation: 'Documentation instructs callers to use fetch_user_profile(), which was renamed to get_user_profile() in PR #142. Calling the documented method raises AttributeError at runtime.',
      suggestedCorrection: 'Replace `client.fetch_user_profile(...)` with `client.get_user_profile(...)` in docs/guides/user_management.md.',
      fixId: 'FIX-102',
      fix: {
        id: 'FIX-102',
        findingId: 'F-102',
        status: 'pending',
        docFile: 'docs/guides/user_management.md',
        docLine: 88,
        fileReference: 'docs/guides/user_management.md · Line 88',
        confidence: 96,
        description: 'Method fetch_user_profile() was renamed to get_user_profile() in implementation.',
        originalContent: '- profile = client.fetch_user_profile(user_id="usr_8820")',
        proposedContent: '+ profile = client.get_user_profile(user_id="usr_8820")'
      },
      detectedAt: '2026-11-18 22:30:15 UTC'
    },
    {
      id: 'F-103',
      title: 'Removed legacy configuration flag `enable_legacy_auth`',
      severity: 'high',
      confidence: 94,
      status: 'pending',
      docFile: 'docs/configuration/settings.md',
      docLine: 115,
      docClaim: 'ServerConfig accepts enable_legacy_auth: bool = False.',
      docEvidence: '```markdown\n| Option | Type | Default | Description |\n| `enable_legacy_auth` | `bool` | `false` | Enable legacy API token support |\n```',
      codeFile: 'src/config/settings.py',
      codeLine: 54,
      actualCodeEvidence: '```python\nclass ServerConfig(BaseSettings):\n    """Runtime service configuration schema."""\n    host: str = "0.0.0.0"\n    port: int = 8080\n    jwt_issuer: str = "https://auth.company.internal"\n    jwt_audience: str = "service-api"\n    # Removed enable_legacy_auth in v3.0 breaking release;\n    # OIDC is now strictly enforced via auth_mode.\n    auth_mode: Literal["strict_jwt", "mTLS"] = "strict_jwt"\n```',
      explanation: 'Documentation tables list enable_legacy_auth as a valid boolean setting. The option was dropped in the v3.0 settings refactor, causing pydantic.ValidationError if passed in configuration files.',
      suggestedCorrection: 'Remove `enable_legacy_auth` row from docs/configuration/settings.md and document `auth_mode` alternatives.',
      fixId: 'FIX-103',
      fix: {
        id: 'FIX-103',
        findingId: 'F-103',
        status: 'pending',
        docFile: 'docs/configuration/settings.md',
        docLine: 115,
        fileReference: 'docs/configuration/settings.md · Line 115',
        confidence: 94,
        description: 'Deprecated configuration option enable_legacy_auth was removed in favor of auth_mode.',
        originalContent: '- | `enable_legacy_auth` | `bool` | `false` | Enable legacy API token support |',
        proposedContent: '+ | `auth_mode` | `str` | `"strict_jwt"` | Authentication mode (`"strict_jwt"` or `"mTLS"`) |'
      },
      detectedAt: '2026-11-18 22:30:15 UTC'
    },
    {
      id: 'F-104',
      title: 'Outdated function parameter in `parse_response`',
      severity: 'medium',
      confidence: 92,
      status: 'pending',
      docFile: 'docs/api/parser.md',
      docLine: 63,
      docClaim: 'parse_response accepts boolean strict_mode: bool = False.',
      docEvidence: '```markdown\n```python\npayload = parse_response(raw_bytes, strict_mode=True)\n```\n```',
      codeFile: 'src/parsers/response.py',
      codeLine: 29,
      actualCodeEvidence: '```python\nclass ValidationLevel(str, Enum):\n    STRICT = "strict"\n    LENIENT = "lenient"\n    DISABLED = "disabled"\n\ndef parse_response(\n    payload: bytes,\n    validation_level: ValidationLevel = ValidationLevel.LENIENT,\n) -> ParsedResponse:\n    """Parse incoming gateway response body."""\n```',
      explanation: 'The function signature replaced binary strict_mode: bool with validation_level: ValidationLevel enum. Passing strict_mode=True triggers TypeError: unexpected keyword argument.',
      suggestedCorrection: 'Change example from `strict_mode=True` to `validation_level=ValidationLevel.STRICT`.',
      fixId: 'FIX-104',
      fix: {
        id: 'FIX-104',
        findingId: 'F-104',
        status: 'pending',
        docFile: 'docs/api/parser.md',
        docLine: 63,
        fileReference: 'docs/api/parser.md · Line 63',
        confidence: 92,
        description: 'Parameter strict_mode: bool replaced with validation_level: ValidationLevel enum.',
        originalContent: '- payload = parse_response(raw_bytes, strict_mode=True)',
        proposedContent: '+ payload = parse_response(raw_bytes, validation_level=ValidationLevel.STRICT)'
      },
      detectedAt: '2026-11-18 22:30:15 UTC'
    },
    {
      id: 'F-105',
      title: 'Synchronous context manager example documented for async client',
      severity: 'low',
      confidence: 89,
      status: 'applied',
      docFile: 'README.md',
      docLine: 57,
      docClaim: 'README Quickstart demonstrates `with DatabaseSession() as db:`.',
      docEvidence: '```markdown\n```python\nwith DatabaseSession(dsn=DB_DSN) as db:\n    results = db.execute("SELECT id FROM users")\n```\n```',
      codeFile: 'src/database/session.py',
      codeLine: 91,
      actualCodeEvidence: '```python\nclass DatabaseSession:\n    """Asyncpg connection pool context manager."""\n\n    async def __aenter__(self) -> "DatabaseSession":\n        self._conn = await self._pool.acquire()\n        return self\n\n    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:\n        await self._pool.release(self._conn)\n```',
      explanation: 'README quickstart demonstrates synchronous `with DatabaseSession():` block, but DatabaseSession only implements async `__aenter__` and `__aexit__`. This example fails with AttributeError: __enter__.',
      suggestedCorrection: 'Update README quickstart to use `async with DatabaseSession(dsn=DB_DSN) as db:`.',
      fixId: 'FIX-105',
      fix: {
        id: 'FIX-105',
        findingId: 'F-105',
        status: 'applied',
        docFile: 'README.md',
        docLine: 57,
        fileReference: 'README.md · Line 57',
        confidence: 89,
        description: 'Context manager is asynchronous and requires `async with` instead of `with`.',
        originalContent: '- with DatabaseSession(dsn=DB_DSN) as db:\n-     results = db.execute("SELECT id FROM users")',
        proposedContent: '+ async with DatabaseSession(dsn=DB_DSN) as db:\n+     results = await db.execute("SELECT id FROM users")'
      },
      detectedAt: '2026-11-18 22:30:15 UTC'
    }
  ];

  // Top-level fixes array derived from findings for fixes.js convenience
  const fixes = findings.map(f => f.fix);

  // ───────────────────────────────────────────────────────────────────────────
  // 4. CLAIMS LEDGER (Exactly 18 Claims: 11 Verified, 5 Drifted, 2 Unverified)
  // ───────────────────────────────────────────────────────────────────────────
  const claims = [
    // ── 5 Drifted Claims (corresponds to Findings F-101 through F-105) ──────
    {
      id: 'CLM-001',
      type: 'function',
      docFile: 'docs/api/client.md',
      docLine: 42,
      docLocation: 'docs/api/client.md:42',
      codeFile: 'src/gateway/client.py',
      codeLine: 86,
      codeLocation: 'src/gateway/client.py:86',
      claimText: 'HttpClient() parameter `timeout` has a default value of 30.0 seconds.',
      status: 'drifted',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'Code sets timeout = 10.0; differs from documented 30.0s.'
    },
    {
      id: 'CLM-002',
      type: 'function',
      docFile: 'docs/guides/user_management.md',
      docLine: 88,
      docLocation: 'docs/guides/user_management.md:88',
      codeFile: 'src/services/users.py',
      codeLine: 134,
      codeLocation: 'src/services/users.py:134',
      claimText: 'Service exposes `fetch_user_profile(user_id: str)` returning user profile.',
      status: 'drifted',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'Method name in code is get_user_profile; fetch_user_profile does not exist.'
    },
    {
      id: 'CLM-003',
      type: 'config',
      docFile: 'docs/configuration/settings.md',
      docLine: 115,
      docLocation: 'docs/configuration/settings.md:115',
      codeFile: 'src/config/settings.py',
      codeLine: 54,
      codeLocation: 'src/config/settings.py:54',
      claimText: 'ServerConfig accepts boolean `enable_legacy_auth` configuration attribute.',
      status: 'drifted',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'Attribute removed in favor of auth_mode enum.'
    },
    {
      id: 'CLM-004',
      type: 'function',
      docFile: 'docs/api/parser.md',
      docLine: 63,
      docLocation: 'docs/api/parser.md:63',
      codeFile: 'src/parsers/response.py',
      codeLine: 29,
      codeLocation: 'src/parsers/response.py:29',
      claimText: '`parse_response()` accepts keyword argument `strict_mode: bool`.',
      status: 'drifted',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'Parameter was renamed to validation_level and converted to an Enum.'
    },
    {
      id: 'CLM-005',
      type: 'schema',
      docFile: 'README.md',
      docLine: 57,
      docLocation: 'README.md:57',
      codeFile: 'src/database/session.py',
      codeLine: 91,
      codeLocation: 'src/database/session.py:91',
      claimText: '`DatabaseSession` can be used with synchronous Python `with` statement.',
      status: 'drifted',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'Class implements __aenter__/__aexit__ only, requiring async with.'
    },

    // ── 11 Verified Claims ──────────────────────────────────────────────────
    {
      id: 'CLM-006',
      type: 'endpoint',
      docFile: 'docs/api/routes.md',
      docLine: 24,
      docLocation: 'docs/api/routes.md:24',
      codeFile: 'src/api/health.py',
      codeLine: 18,
      codeLocation: 'src/api/health.py:18',
      claimText: 'GET `/healthz` returns JSON object `{"status": "ok", "version": str}` with HTTP 200.',
      status: 'verified',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'Route handler implementation matches documented HTTP method, path, and return schema.'
    },
    {
      id: 'CLM-007',
      type: 'function',
      docFile: 'docs/api/crypto.md',
      docLine: 51,
      docLocation: 'docs/api/crypto.md:51',
      codeFile: 'src/security/tokens.py',
      codeLine: 40,
      codeLocation: 'src/security/tokens.py:40',
      claimText: '`generate_api_key()` returns 32-character url-safe string with prefix `ak_`.',
      status: 'verified',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'Implementation uses secrets.token_urlsafe(32) with ak_ prefix as documented.'
    },
    {
      id: 'CLM-008',
      type: 'config',
      docFile: 'docs/configuration/database.md',
      docLine: 19,
      docLocation: 'docs/configuration/database.md:19',
      codeFile: 'src/config/db.py',
      codeLine: 22,
      codeLocation: 'src/config/db.py:22',
      claimText: 'Environment variable `DATABASE_POOL_SIZE` defaults to 10 connections.',
      status: 'verified',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'os.getenv("DATABASE_POOL_SIZE", "10") correctly sets default pool capacity to 10.'
    },
    {
      id: 'CLM-010',
      type: 'function',
      docFile: 'docs/api/pagination.md',
      docLine: 35,
      docLocation: 'docs/api/pagination.md:35',
      codeFile: 'src/utils/pagination.py',
      codeLine: 28,
      codeLocation: 'src/utils/pagination.py:28',
      claimText: '`paginate_query()` accepts default arguments `page: int = 1` and `page_size: int = 20`.',
      status: 'verified',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'Function signature and default parameter values match documentation exactly.'
    },
    {
      id: 'CLM-011',
      type: 'endpoint',
      docFile: 'docs/api/routes.md',
      docLine: 45,
      docLocation: 'docs/api/routes.md:45',
      codeFile: 'src/api/auth.py',
      codeLine: 52,
      codeLocation: 'src/api/auth.py:52',
      claimText: 'POST `/api/v1/auth/token` accepts OAuth2 form-data with `username` and `password`.',
      status: 'verified',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'Route handler parses OAuth2PasswordRequestForm matching documented schema.'
    },
    {
      id: 'CLM-012',
      type: 'config',
      docFile: 'docs/configuration/cors.md',
      docLine: 18,
      docLocation: 'docs/configuration/cors.md:18',
      codeFile: 'src/config/cors.py',
      codeLine: 14,
      codeLocation: 'src/config/cors.py:14',
      claimText: '`CORS_ALLOW_CREDENTIALS` setting defaults to boolean `True`.',
      status: 'verified',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'Configuration initialization sets allow_credentials = True as documented.'
    },
    {
      id: 'CLM-013',
      type: 'schema',
      docFile: 'docs/schemas/user.md',
      docLine: 22,
      docLocation: 'docs/schemas/user.md:22',
      codeFile: 'src/models/user.py',
      codeLine: 34,
      codeLocation: 'src/models/user.py:34',
      claimText: '`UserResponse` model contains fields `id: UUID`, `email: EmailStr`, and `created_at: datetime`.',
      status: 'verified',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'Pydantic model fields and type annotations strictly match documented specification.'
    },
    {
      id: 'CLM-014',
      type: 'function',
      docFile: 'docs/utils/hashing.md',
      docLine: 15,
      docLocation: 'docs/utils/hashing.md:15',
      codeFile: 'src/security/hash.py',
      codeLine: 19,
      codeLocation: 'src/security/hash.py:19',
      claimText: '`verify_password(plain: str, hashed: str)` uses Argon2id algorithm for hash comparison.',
      status: 'verified',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'PasswordHasher instance uses argon2.Type.ID as documented.'
    },
    {
      id: 'CLM-015',
      type: 'endpoint',
      docFile: 'docs/api/routes.md',
      docLine: 80,
      docLocation: 'docs/api/routes.md:80',
      codeFile: 'src/api/users.py',
      codeLine: 95,
      codeLocation: 'src/api/users.py:95',
      claimText: 'DELETE `/api/v1/users/{id}` returns HTTP 204 No Content on successful deletion.',
      status: 'verified',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'Route handler specifies status_code=status.HTTP_204_NO_CONTENT with empty body.'
    },
    {
      id: 'CLM-016',
      type: 'config',
      docFile: 'docs/configuration/logging.md',
      docLine: 29,
      docLocation: 'docs/configuration/logging.md:29',
      codeFile: 'src/config/log.py',
      codeLine: 33,
      codeLocation: 'src/config/log.py:33',
      claimText: '`LOG_LEVEL` environment variable defaults to string `"INFO"`.',
      status: 'verified',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'Default fallback value in os.getenv matches documented "INFO".'
    },
    {
      id: 'CLM-017',
      type: 'schema',
      docFile: 'docs/schemas/error.md',
      docLine: 14,
      docLocation: 'docs/schemas/error.md:14',
      codeFile: 'src/models/error.py',
      codeLine: 12,
      codeLocation: 'src/models/error.py:12',
      claimText: 'Standard error response contains `code: str`, `message: str`, and optional `details: list`.',
      status: 'verified',
      lastVerified: '2026-11-18 22:30 UTC',
      details: 'ErrorResponse model definition matches documented fields and optionality.'
    },

    // ── 2 Unverified Claims ─────────────────────────────────────────────────
    {
      id: 'CLM-009',
      type: 'endpoint',
      docFile: 'docs/api/metrics.md',
      docLine: 12,
      docLocation: 'docs/api/metrics.md:12',
      codeFile: 'src/api/metrics.py',
      codeLine: 15,
      codeLocation: 'src/api/metrics.py:15',
      claimText: 'Metrics endpoint `/metrics` exposes Prometheus exposition format text.',
      status: 'unverified',
      lastVerified: '2026-11-17 14:00 UTC',
      details: 'Dynamic Prometheus collector output requires active runtime inspection to verify.'
    },
    {
      id: 'CLM-018',
      type: 'schema',
      docFile: 'docs/schemas/events.md',
      docLine: 62,
      docLocation: 'docs/schemas/events.md:62',
      codeFile: 'src/events/publisher.py',
      codeLine: 45,
      codeLocation: 'src/events/publisher.py:45',
      claimText: 'CloudEvents v1.0 payload format is strictly validated on Kafka message publication.',
      status: 'unverified',
      lastVerified: '2026-11-17 14:00 UTC',
      details: 'Event schema is dynamically resolved via external schema registry at runtime.'
    }
  ];

  /**
   * Global MockData store
   */
  const MockData = {
    // ─────────────────────────────────────────────────────────────────────────
    // METADATA & DISCLAIMER
    // ─────────────────────────────────────────────────────────────────────────
    meta: {
      isSyntheticDemo: true,
      generatedAt: '2026-11-18T22:30:00Z',
      version: '0.1.0-alpha',
      notice: 'Synthetic demo data — not from a live GitHub scan.'
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 1. REPOSITORY INFORMATION
    // ─────────────────────────────────────────────────────────────────────────
    repository: {
      name: 'pallets/flask-microservices-template',
      url: 'https://github.com/pallets/flask-microservices-template',
      branch: 'main',
      commitHash: 'a7c3e91',
      lastScanTime: '2026-11-18 22:30:15 UTC',
      documentationHealthScore: 68, // 0-100 scale (higher = healthier docs)
      driftScore: 32,               // 100 - healthScore (32% drift)
      status: 'drift_detected'
    },

    // ─────────────────────────────────────────────────────────────────────────
    // 2. SUMMARY STATISTICS
    // ─────────────────────────────────────────────────────────────────────────
    statistics: {
      filesScanned: 42,
      totalClaims: 18,
      verifiedClaims: 11,
      outdatedClaims: 5,
      unverifiedClaims: 2,
      totalFindings: 5,
      criticalFindings: 1,
      highFindings: 2,
      mediumFindings: 1,
      minorFindings: 1,
      suggestedFixes: 5,
      pendingFixes: 4,
      appliedFixes: 1,
      severityCounts: {
        critical: 1,
        high: 2,
        medium: 1,
        low: 1
      }
    },

    // 3. Findings list
    findings,

    // 4. Claims ledger (18 entries)
    claims,

    // 5. Suggested fixes (derived from findings for fixes.js convenience)
    fixes,

    // 6. Recent scan activity log
    recentActivity: [
      {
        id: 'ACT-001',
        type: 'scan_complete',
        message: 'Scan completed for pallets/flask-microservices-template: 5 drift findings detected.',
        time: 'Just now'
      },
      {
        id: 'ACT-002',
        type: 'fix_applied',
        message: 'Applied suggested fix #FIX-105 for DatabaseSession async usage in README.md.',
        time: '2 mins ago'
      },
      {
        id: 'ACT-003',
        type: 'verification',
        message: 'Verified claim #CLM-006: GET /healthz response matches documented schema.',
        time: '5 mins ago'
      },
      {
        id: 'ACT-004',
        type: 'claims_extracted',
        message: 'Extracted 18 documentation claims across 42 markdown and docstring sources.',
        time: '7 mins ago'
      }
    ],

    // Convenience accessor helpers
    getFindings: () => [...findings],
    getClaims: () => [...claims],
    getFixes: () => [...fixes],
    getStatistics: () => ({ ...MockData.statistics }),
    getRepository: () => ({ ...MockData.repository })
  };

  // ───────────────────────────────────────────────────────────────────────────
  // EXPORT TO GLOBAL WINDOW OBJECT
  // ───────────────────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.MockData = MockData;
  }

  // CommonJS export support for automated unit test harnesses
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MockData;
  }
})();
