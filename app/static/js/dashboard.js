/**
 * PythaDoc – Python Documentation Drift Detector
 * js/dashboard.js
 *
 * Dashboard rendering and state synchronization module.
 * Updates repository metrics, health/drift scores, finding counts by severity,
 * and summary statistics from either window.MockData or live backend scan results.
 */

(function () {
  'use strict';

  /**
   * Safe HTML entity escaper to prevent XSS during dynamic string interpolation.
   *
   * @param {any} val
   * @returns {string}
   */
  function escapeHtml(val) {
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Safe integer parser with fallback.
   *
   * @param {any} val
   * @param {number} fallback
   * @returns {number}
   */
  function safeInt(val, fallback = 0) {
    const num = parseInt(val, 10);
    return isNaN(num) ? fallback : num;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. REPOSITORY INFORMATION & LAST SCAN
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Updates repository details (URL, last scan timestamp, branch).
   *
   * @param {Object} [repo] - Repository metadata object
   */
  function updateRepositoryInfo(repo) {
    if (!repo || typeof repo !== 'object') {
      return;
    }

    const lastScanTimeEl = document.getElementById('last-scan-time');
    const repoInputEl = document.getElementById('repo-url-input');

    const lastScan = repo.lastScanTime || repo.last_scan_time || repo.scannedAt || repo.scanned_at;
    if (lastScanTimeEl && lastScan) {
      lastScanTimeEl.textContent = lastScan;
      lastScanTimeEl.setAttribute('datetime', String(lastScan));
    }

    const repoUrl = repo.url || repo.repositoryUrl || repo.repository_url;
    if (repoInputEl && repoUrl && !repoInputEl.value.trim()) {
      repoInputEl.value = repoUrl;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. DOCUMENTATION HEALTH SCORE & DRIFT GAUGE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Updates the documentation health and drift score gauge.
   *
   * @param {number|null} healthScore - Documentation health score (0-100)
   * @param {number|null} [driftScore] - Drift score percentage (0-100)
   */
  function updateHealthScore(healthScore, driftScore = null) {
    const valueEl = document.getElementById('drift-score-value');
    const gaugeEl = document.getElementById('drift-score-gauge');
    const badgeEl = document.getElementById('drift-score-badge');

    // Handle null/uncalculated state
    if (healthScore === null && driftScore === null) {
      if (valueEl) valueEl.textContent = '—';
      if (gaugeEl) {
        gaugeEl.style.background = 'conic-gradient(var(--clr-accent) 0%, var(--clr-surface-3) 0%)';
        gaugeEl.setAttribute('aria-label', 'Drift score: not yet calculated');
      }
      if (badgeEl) {
        badgeEl.textContent = 'Not yet scanned';
        badgeEl.className = 'panel__badge panel__badge--warning';
      }
      return;
    }

    // Calculate complement if only one is supplied
    let health = safeInt(healthScore, -1);
    let drift = safeInt(driftScore, -1);

    if (drift === -1 && health !== -1) {
      drift = Math.max(0, 100 - health);
    } else if (health === -1 && drift !== -1) {
      health = Math.max(0, 100 - drift);
    }

    drift = Math.min(100, Math.max(0, drift));
    health = Math.min(100, Math.max(0, health));

    // Update gauge text
    if (valueEl) {
      valueEl.textContent = `${drift}%`;
    }

    // Update circular conic-gradient meter
    if (gaugeEl) {
      let meterColor = 'var(--clr-accent)';
      if (drift >= 50) {
        meterColor = 'var(--clr-critical)';
      } else if (drift >= 25) {
        meterColor = 'var(--clr-medium)';
      } else {
        meterColor = 'var(--clr-low)';
      }

      gaugeEl.style.background = `conic-gradient(${meterColor} ${drift}%, var(--clr-surface-3) 0%)`;
      gaugeEl.setAttribute('aria-label', `Documentation drift score: ${drift}% (Health score: ${health}%)`);
    }

    // Update status badge
    if (badgeEl) {
      if (drift === 0) {
        badgeEl.textContent = '100% In Sync';
        badgeEl.className = 'panel__badge panel__badge--success';
      } else if (drift <= 25) {
        badgeEl.textContent = `Low Drift (${health}% Health)`;
        badgeEl.className = 'panel__badge panel__badge--success';
      } else if (drift <= 50) {
        badgeEl.textContent = `Moderate Drift (${health}% Health)`;
        badgeEl.className = 'panel__badge panel__badge--warning';
      } else {
        badgeEl.textContent = `High Drift (${health}% Health)`;
        badgeEl.className = 'panel__badge panel__badge--danger';
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. FINDINGS BY SEVERITY (Critical, High, Medium, Minor/Low)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Updates finding counts and renders animated severity breakdown meters.
   *
   * @param {Object} [severityCounts] - Map of counts: { critical, high, medium, low }
   * @param {number} [totalFindings] - Total findings count for percentage track width
   */
  function updateFindingCounts(severityCounts = {}, totalFindings = 0) {
    const severities = ['critical', 'high', 'medium', 'low'];
    const counts = {
      critical: safeInt(severityCounts.critical ?? severityCounts.CRITICAL),
      high: safeInt(severityCounts.high ?? severityCounts.HIGH),
      medium: safeInt(severityCounts.medium ?? severityCounts.MEDIUM),
      low: safeInt(severityCounts.low ?? severityCounts.minor ?? severityCounts.LOW ?? severityCounts.MINOR)
    };

    const total = totalFindings > 0 ? totalFindings : (counts.critical + counts.high + counts.medium + counts.low);

    severities.forEach(level => {
      const countEl = document.getElementById(`count-${level}`);
      const fillEl = document.getElementById(`severity-${level}`);
      const count = counts[level] || 0;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;

      if (countEl) {
        countEl.textContent = String(count);
      }

      if (fillEl) {
        fillEl.style.width = `${pct}%`;
        const meterBar = fillEl.closest('.severity-bar');
        if (meterBar) {
          meterBar.setAttribute('aria-valuenow', String(pct));
        }
      }
    });

    // Update summary stat card and sidebar badge for findings
    const statFindingsEl = document.getElementById('stat-findings');
    const badgeFindingsEl = document.getElementById('badge-findings');

    if (statFindingsEl) {
      statFindingsEl.textContent = String(total);
    }

    if (badgeFindingsEl) {
      badgeFindingsEl.textContent = String(total);
      badgeFindingsEl.setAttribute('aria-label', `${total} findings`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. SUMMARY STATISTICS CARDS (Files, Claims Verified, Suggested Fixes)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Renders the 4 top-level overview statistic cards and navigation badges.
   *
   * @param {Object} [stats] - Statistics container from MockData or backend
   */
  function renderStatistics(stats = {}) {
    const filesScanned = safeInt(stats.filesScanned ?? stats.files_scanned);
    const totalFindings = safeInt(stats.totalFindings ?? stats.total_findings);
    const verifiedClaims = safeInt(stats.verifiedClaims ?? stats.verified_claims);
    const totalClaims = safeInt(stats.totalClaims ?? stats.total_claims);
    const suggestedFixes = safeInt(stats.suggestedFixes ?? stats.suggested_fixes ?? stats.pendingFixes ?? stats.pending_fixes);

    // 1. Files Scanned
    const filesEl = document.getElementById('stat-files-scanned');
    if (filesEl) {
      filesEl.textContent = String(filesScanned);
    }

    // 2. Total Findings
    const findingsEl = document.getElementById('stat-findings');
    if (findingsEl) {
      findingsEl.textContent = String(totalFindings);
    }

    // 3. Claims Verified
    const claimsEl = document.getElementById('stat-claims-verified');
    if (claimsEl) {
      if (totalClaims > 0) {
        claimsEl.textContent = `${verifiedClaims} / ${totalClaims}`;
        claimsEl.title = `${verifiedClaims} verified out of ${totalClaims} total claims`;
      } else {
        claimsEl.textContent = String(verifiedClaims);
      }
    }

    // 4. Suggested Fixes
    const fixesEl = document.getElementById('stat-suggested-fixes');
    if (fixesEl) {
      fixesEl.textContent = String(suggestedFixes);
    }

    // Update sidebar navigation badges
    const badgeFindings = document.getElementById('badge-findings');
    if (badgeFindings) {
      badgeFindings.textContent = String(totalFindings);
      badgeFindings.setAttribute('aria-label', `${totalFindings} findings`);
    }

    const badgeFixes = document.getElementById('badge-fixes');
    if (badgeFixes) {
      badgeFixes.textContent = String(suggestedFixes);
      badgeFixes.setAttribute('aria-label', `${suggestedFixes} suggested fixes`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. RECENT ACTIVITY LIST
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Renders the recent activity feed in the dashboard activity panel.
   *
   * @param {Array<Object>} [activities] - Array of activity log items
   */
  function updateRecentActivity(activities = []) {
    const listEl = document.getElementById('activity-list');
    if (!listEl) return;

    if (!Array.isArray(activities) || activities.length === 0) {
      listEl.innerHTML = `
        <li class="activity-list__item activity-list__item--empty">
          No scan activity yet. Enter a repository URL and click <strong>Scan Repository</strong>.
        </li>
      `;
      return;
    }

    listEl.innerHTML = activities.map(item => `
      <li class="activity-list__item" role="listitem">
        <span class="activity-list__dot" aria-hidden="true"></span>
        <span class="activity-list__message">${escapeHtml(item.message || item.text || item.title)}</span>
        <time class="activity-list__time">${escapeHtml(item.time || item.timestamp || item.formattedTime || 'Recently')}</time>
      </li>
    `).join('');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. MAIN REFRESH DISPATCHER
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Refreshes all dashboard elements using the provided dataset.
   * If no dataset is provided, gracefully falls back to window.MockData.
   *
   * @param {Object} [data] - Full results object (backend or MockData)
   */
  function refresh(data = null) {
    const source = data;

    if (!source || typeof source !== 'object') {
      clear();
      return;
    }

    // 1. Repository metadata
    const repo = source.repository || source.repo || {};
    updateRepositoryInfo(repo);

    // 2. Health and drift scores
    const healthScore = repo.documentationHealthScore ?? repo.healthScore ?? repo.health_score ?? null;
    const driftScore = repo.driftScore ?? repo.drift_score ?? null;
    updateHealthScore(healthScore, driftScore);

    // 3. Statistics & summary cards
    const stats = source.statistics || source.stats || {};
    renderStatistics(stats);

    // 4. Severity breakdown counts
    const severityCounts = stats.severityCounts || stats.severities || stats.severity_counts || {};
    const totalFindings = safeInt(stats.totalFindings ?? stats.total_findings ?? (Array.isArray(source.findings) ? source.findings.length : 0));
    updateFindingCounts(severityCounts, totalFindings);

    // 5. Recent activity log
    const activities = source.recentActivity || source.activities || source.recent_activity || [];
    updateRecentActivity(activities);
  }

  /**
   * Resets all dashboard elements to zero/empty baseline states.
   */
  function clear() {
    updateRepositoryInfo({});
    updateHealthScore(null, null);
    renderStatistics({
      filesScanned: 0,
      totalFindings: 0,
      verifiedClaims: 0,
      totalClaims: 0,
      suggestedFixes: 0
    });
    updateFindingCounts({ critical: 0, high: 0, medium: 0, low: 0 }, 0);
    updateRecentActivity([]);

    const lastScanTimeEl = document.getElementById('last-scan-time');
    if (lastScanTimeEl) {
      lastScanTimeEl.textContent = 'Never';
      lastScanTimeEl.removeAttribute('datetime');
    }
  }

  /**
   * Initializes the dashboard with MockData if available, or zero state.
   */
  function init() {
    clear();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PUBLIC DASHBOARD API
  // ───────────────────────────────────────────────────────────────────────────
  const Dashboard = {
    init,
    refresh,
    clear,
    renderStatistics,
    updateHealthScore,
    updateFindingCounts,
    updateRepositoryInfo,
    updateRecentActivity
  };

  // Export to global window object
  if (typeof window !== 'undefined') {
    window.Dashboard = Dashboard;
  }

  // CommonJS export support for tests
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Dashboard;
  }
})();
