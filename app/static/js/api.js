/**
 * PythaDoc – Python Documentation Drift Detector
 * js/api.js
 *
 * Backend integration client for communicating with the Flask backend API.
 * Handles HTTP requests, response normalization, error parsing, and optional mock mode.
 */

(function () {
  'use strict';

  // Default Flask backend address
  const DEFAULT_BACKEND_URL = 'http://127.0.0.1:5000';
  const DEFAULT_TIMEOUT_MS = 30000;

  /**
   * Custom error class representing API & HTTP failures with structured context.
   */
  class ApiError extends Error {
    constructor(message, status = 0, statusText = '', data = null) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.statusText = statusText;
      this.data = data;
      this.isNetworkError = status === 0;
    }
  }

  /**
   * Internal client state configuration
   */
  const config = {
    baseUrl: (typeof window !== 'undefined' && window.API_BASE_URL)
      ? window.API_BASE_URL
      : DEFAULT_BACKEND_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    mockMode: false, // Default is live mode (no silent fallback)
    defaultHeaders: {
      'Accept': 'application/json'
    }
  };

  /**
   * Converts a snake_case string to camelCase.
   *
   * @param {string} str
   * @returns {string}
   */
  function snakeToCamel(str) {
    return str.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  }

  /**
   * Recursively normalizes snake_case keys in backend responses to camelCase.
   * Retains the original snake_case keys as non-destructive aliases.
   *
   * @param {any} data
   * @returns {any}
   */
  function normalizeToCamelCase(data) {
    if (data === null || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(normalizeToCamelCase);
    }

    const normalized = {};
    for (const [key, value] of Object.entries(data)) {
      const camelKey = snakeToCamel(key);
      normalized[camelKey] = normalizeToCamelCase(value);
      // Retain original key as alias if different so existing code won't break
      if (camelKey !== key && !(key in normalized)) {
        normalized[key] = normalized[camelKey];
      }
    }
    return normalized;
  }

  /**
   * Helper to normalize URLs avoiding double or missing slashes.
   *
   * @param {string} base
   * @param {string} path
   * @returns {string}
   */
  function buildUrl(base, path) {
    const trimmedBase = base.replace(/\/+$/, '');
    const trimmedPath = path.replace(/^\/+/, '');
    return `${trimmedBase}/${trimmedPath}`;
  }

  /**
   * Accesses window.MockData if available.
   *
   * @returns {Object|null}
   */
  function getMockData() {
    if (typeof window !== 'undefined' && window.MockData) {
      return window.MockData;
    }
    return null;
  }

  /**
   * Core request dispatcher with timeout, JSON serialization, and error normalization.
   *
   * @param {string} endpoint - API endpoint relative to baseUrl (e.g., '/api/health')
   * @param {Object} options - Fetch options (method, headers, body, timeout, etc.)
   * @returns {Promise<any>} Parsed and camelCase-normalized response payload
   */
  async function request(endpoint, options = {}) {
    const url = buildUrl(config.baseUrl, endpoint);
    const method = (options.method || 'GET').toUpperCase();
    const timeout = options.timeoutMs || config.timeoutMs;

    const controller = new AbortController();
    const externalSignal = options.signal;
    let externallyCancelled = false;
    let externalAbortHandler = null;

    if (externalSignal) {
      if (externalSignal.aborted) {
        externallyCancelled = true;
        controller.abort();
      } else {
        externalAbortHandler = () => {
          externallyCancelled = true;
          controller.abort();
        };
        externalSignal.addEventListener('abort', externalAbortHandler, { once: true });
      }
    }

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const headers = {
      ...config.defaultHeaders,
      ...(options.headers || {})
    };

    let body = options.body;
    if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Attempt to parse response body as JSON
      let responseData = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          responseData = await response.json();
        } catch (jsonErr) {
          responseData = null;
        }
      } else {
        responseData = await response.text();
      }

      // Handle non-2xx HTTP status codes
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status} (${response.statusText || 'Error'})`;

        if (responseData && typeof responseData === 'object') {
          errorMessage = responseData.message || responseData.error || responseData.detail || errorMessage;
        } else if (typeof responseData === 'string' && responseData.trim()) {
          errorMessage = responseData.trim();
        }

        throw new ApiError(errorMessage, response.status, response.statusText, responseData);
      }

      // Normalize keys from snake_case to camelCase
      return normalizeToCamelCase(responseData);
    } catch (err) {

      if (err instanceof ApiError) {
        throw err;
      }

      if (err.name === 'AbortError') {
        if (externallyCancelled) {
          throw new ApiError('The request was cancelled.', 0, 'Cancelled');
        }
        throw new ApiError(
          `Request to ${endpoint} timed out after ${timeout / 1000} seconds. Please verify the Flask backend is responsive.`,
          0,
          'Timeout'
        );
      }

      // Network failures, CORS blocks, offline mode, DNS resolution failure
      const networkMessage = (typeof navigator !== 'undefined' && !navigator.onLine)
        ? 'Network offline. Please check your internet connection.'
        : `Unable to connect to Flask backend at ${config.baseUrl}. Please verify the server is running and CORS is enabled.`;

      throw new ApiError(networkMessage, 0, 'NetworkError', { originalError: err.message });
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal && externalAbortHandler) {
        externalSignal.removeEventListener('abort', externalAbortHandler);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // API SERVICE METHODS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 1. startScan
   * Initiates a documentation drift scan for the provided Git repository URL.
   *
   * @param {string} repositoryUrl - Full URL to the repository (e.g., https://github.com/owner/repo)
   * @returns {Promise<Object>} Backend response containing scan metadata (e.g., { scanId, status })
   */
  async function startScan(repositoryUrl, options = {}) {
    if (!repositoryUrl || typeof repositoryUrl !== 'string' || !repositoryUrl.trim()) {
      throw new ApiError('A valid repository URL is required to start a scan.', 400, 'Bad Request');
    }

    // Explicit mock mode check
    if (config.mockMode) {
      const mock = getMockData();
      return normalizeToCamelCase({
        scan_id: 'mock-scan-' + Date.now(),
        repository_url: repositoryUrl.trim(),
        status: 'completed',
        message: 'Scan completed using synthetic mock data.',
        health_score: mock ? mock.repository.documentationHealthScore : 68,
        findings_count: mock ? mock.findings.length : 5
      });
    }

    const payload = {
      repository_url: repositoryUrl.trim()
    };

    return await request('/api/scan', {
      method: 'POST',
      body: payload,
      signal: options.signal
    });
  }

  /**
   * 2. getResults
   * Fetches the structured drift detection results for a specific scan execution.
   *
   * @param {string|number} scanId - The unique scan ID returned by startScan
   * @returns {Promise<Object>} Structured scan findings, claims ledger, and statistics
   */
  async function getResults(scanId, options = {}) {
    if (!scanId) {
      throw new ApiError('A valid scanId is required to retrieve scan results.', 400, 'Bad Request');
    }

    // Explicit mock mode check
    if (config.mockMode) {
      const mock = getMockData();
      if (!mock) {
        throw new ApiError('MockData is not available on window.MockData.', 500, 'MockDataNotFound');
      }
      return normalizeToCamelCase(mock);
    }

    const endpoint = `/api/results/${encodeURIComponent(String(scanId).trim())}`;
    return await request(endpoint, {
      method: 'GET',
      signal: options.signal
    });
  }

  /**
   * 3. generateFix
   * Requests an AI-suggested documentation patch/correction for a specific drift finding.
   *
   * @param {string|number} findingId - Unique ID of the finding (e.g., '123' or 'finding_abc')
   * @param {Object} [options] - Optional additional parameters (e.g. style preferences, custom prompt)
   * @returns {Promise<Object>} Object containing original content, proposed fix, diff, and confidence
   */
  async function generateFix(findingId, options = {}) {
    if (!findingId) {
      throw new ApiError('A valid findingId is required to generate a fix.', 400, 'Bad Request');
    }

    // Explicit mock mode check
    if (config.mockMode) {
      const mock = getMockData();
      if (!mock || !Array.isArray(mock.findings)) {
        throw new ApiError('MockData findings are not loaded.', 500, 'MockDataNotFound');
      }
      const match = mock.findings.find(f => f.id === String(findingId).trim() || f.fixId === String(findingId).trim());
      if (!match || !match.fix) {
        throw new ApiError(`Finding with ID "${findingId}" not found in mock data.`, 404, 'Not Found');
      }
      return normalizeToCamelCase(match.fix);
    }

    const payload = {
      finding_id: String(findingId).trim(),
      ...options
    };

    return await request('/api/fix', {
      method: 'POST',
      body: payload
    });
  }

  /**
   * 4. checkHealth
   * Probes the backend server to ensure the service is running and accessible.
   *
   * @returns {Promise<Object>} Backend health status payload (e.g., { status: "ok" })
   */
  async function checkHealth() {
    // Explicit mock mode check
    if (config.mockMode) {
      return {
        status: 'mock',
        message: 'Running in simulated mock mode',
        timestamp: new Date().toISOString()
      };
    }

    return await request('/api/health', {
      method: 'GET',
      timeoutMs: 5000 // Shorter timeout for quick health probe
    });
  }

  async function getScans(options = {}) {
    return await request('/api/scans', {
      method: 'GET',
      timeoutMs: options.timeoutMs || 5000,
      signal: options.signal
    });
  }

  /**
   * Configuration helpers
   */
  function setBaseUrl(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('Base URL must be a non-empty string');
    }
    config.baseUrl = url.trim();
  }

  function getBaseUrl() {
    return config.baseUrl;
  }

  function setTimeoutMs(ms) {
    const parsed = parseInt(ms, 10);
    if (!isNaN(parsed) && parsed > 0) {
      config.timeoutMs = parsed;
    }
  }

  function setMockMode(enable) {
    config.mockMode = Boolean(enable);
  }

  function isMockMode() {
    return config.mockMode;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PUBLIC API INTERFACE
  // ───────────────────────────────────────────────────────────────────────────
  const ApiClient = {
    // Core methods
    startScan,
    getResults,
    generateFix,
    checkHealth,
    getScans,

    // Low-level dispatcher & normalizer
    request,
    normalizeToCamelCase,

    // Configuration & Mock mode controls
    setBaseUrl,
    getBaseUrl,
    setTimeoutMs,
    setMockMode,
    isMockMode,
    getMockData,

    // Error class export
    ApiError,

    // Default constants
    DEFAULT_BACKEND_URL
  };

  // Export to window for browser scripts (api.js, dashboard.js, etc.)
  if (typeof window !== 'undefined') {
    window.ApiClient = ApiClient;
    window.API = ApiClient; // Convenient shorthand alias
  }

  // CommonJS export for testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ApiClient;
  }
})();
