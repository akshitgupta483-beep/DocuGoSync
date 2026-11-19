(function () {
  'use strict';

  const VALID_SECTIONS = ['dashboard', 'findings', 'ledger', 'fixes'];
  const SECTION_TITLES = {
    dashboard: 'Dashboard',
    findings: 'Findings',
    ledger: 'Claims Ledger',
    fixes: 'Suggested Fixes'
  };

  let initialized = false;
  let scanInProgress = false;
  let scanGeneration = 0;
  let progressTimer = null;
  let activeScanController = null;
  let modalPreviousFocus = null;
  let modalKeydownHandler = null;

  function getElement(id) {
    return document.getElementById(id);
  }

  function safeCall(moduleName, methodName, argument) {
    const module = window[moduleName];
    if (!module || typeof module[methodName] !== 'function') {
      console.warn(`[PythaDoc] ${moduleName}.${methodName} is unavailable.`);
      return false;
    }

    try {
      module[methodName](argument);
      return true;
    } catch (error) {
      console.error(`[PythaDoc] ${moduleName}.${methodName} failed.`, error);
      return false;
    }
  }

  function setStatus(message, state) {
    const dot = getElement('status-dot');
    const text = getElement('status-text');

    if (dot) {
      dot.className = 'topbar__status-dot';
      dot.classList.add(`topbar__status-dot--${state || 'idle'}`);
    }
    if (text) {
      text.textContent = message;
    }
  }

  function showToast(message, type = 'info', title) {
    const container = getElement('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icons = { success: '✓', error: '!', warning: '!', info: 'i' };
    const icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = icons[type] || icons.info;

    const body = document.createElement('div');
    body.className = 'toast__body';

    const heading = document.createElement('div');
    heading.className = 'toast__title';
    heading.textContent = title || ({
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
      info: 'Information'
    }[type] || 'Information');

    const copy = document.createElement('div');
    copy.className = 'toast__message';
    copy.textContent = String(message || '');

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast__close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '×';

    const timer = document.createElement('div');
    timer.className = 'toast__timer';
    timer.style.animationDuration = '5000ms';

    body.appendChild(heading);
    body.appendChild(copy);
    toast.appendChild(icon);
    toast.appendChild(body);
    toast.appendChild(close);
    toast.appendChild(timer);
    container.appendChild(toast);

    let dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      toast.classList.add('toast--dismissing');
      window.setTimeout(() => toast.remove(), 180);
    }

    close.addEventListener('click', dismiss);
    window.setTimeout(dismiss, 5000);
  }

  function openSidebar() {
    const sidebar = getElement('sidebar');
    const backdrop = getElement('sidebar-backdrop');
    const toggle = getElement('sidebar-toggle');

    if (sidebar) sidebar.classList.add('sidebar--open');
    if (backdrop) {
      backdrop.classList.add('sidebar-backdrop--visible');
      backdrop.setAttribute('aria-hidden', 'false');
    }
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    const sidebar = getElement('sidebar');
    const backdrop = getElement('sidebar-backdrop');
    const toggle = getElement('sidebar-toggle');

    if (sidebar) sidebar.classList.remove('sidebar--open');
    if (backdrop) {
      backdrop.classList.remove('sidebar-backdrop--visible');
      backdrop.setAttribute('aria-hidden', 'true');
    }
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  function navigateTo(section) {
    const normalized = VALID_SECTIONS.includes(section) ? section : 'dashboard';

    document.querySelectorAll('.sidebar__nav-link').forEach(link => {
      const active = link.getAttribute('data-section') === normalized;
      link.classList.toggle('sidebar__nav-link--active', active);
      if (active) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    document.querySelectorAll('.content-section').forEach(panel => {
      panel.classList.toggle(
        'content-section--active',
        panel.getAttribute('data-section') === normalized
      );
    });

    const title = getElement('page-title');
    if (title) title.textContent = SECTION_TITLES[normalized];

    const hash = `#section-${normalized}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }

    closeSidebar();
  }

  function initializeModules() {
    const dashboard = window.Dashboard;
    const findings = window.Findings;
    const ledger = window.Ledger;
    const fixes = window.Fixes;

    if (dashboard && typeof dashboard.init === 'function') {
      safeCall('Dashboard', 'init');
      safeCall('Dashboard', 'clear');
    } else {
      console.warn('[PythaDoc] Dashboard module or init method is unavailable.');
    }

    if (findings && typeof findings.init === 'function') {
      safeCall('Findings', 'init');
      safeCall('Findings', 'render', []);
    } else {
      console.warn('[PythaDoc] Findings module or init method is unavailable.');
    }

    if (ledger && typeof ledger.init === 'function') {
      safeCall('Ledger', 'init', []);
      safeCall('Ledger', 'reset');
    } else {
      console.warn('[PythaDoc] Ledger module or init method is unavailable.');
    }

    if (fixes && typeof fixes.init === 'function') {
      safeCall('Fixes', 'init', []);
      safeCall('Fixes', 'reset');
    } else {
      console.warn('[PythaDoc] Fixes module or init method is unavailable.');
    }

    setStatus('Ready', 'idle');
  }

  function bindNavigation() {
    document.querySelectorAll('.sidebar__nav-link[data-section]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        navigateTo(link.getAttribute('data-section'));
      });
    });

    const toggle = getElement('sidebar-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const sidebar = getElement('sidebar');
        if (sidebar && sidebar.classList.contains('sidebar--open')) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });
    }

    const backdrop = getElement('sidebar-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    window.addEventListener('hashchange', () => {
      const match = window.location.hash.match(/^#section-(dashboard|findings|ledger|fixes)$/);
      navigateTo(match ? match[1] : 'dashboard');
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeSidebar();
      }
    });

    const hashMatch = window.location.hash.match(/^#section-(dashboard|findings|ledger|fixes)$/);
    navigateTo(hashMatch ? hashMatch[1] : 'dashboard');
  }

  function validateRepositoryUrl(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return { valid: false, message: 'Enter a repository URL.' };

    let parsed;
    try {
      parsed = new URL(value);
    } catch (error) {
      return { valid: false, message: 'Enter a complete repository URL.' };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, message: 'Repository URL must use HTTP or HTTPS.' };
    }
    if (!parsed.hostname) {
      return { valid: false, message: 'Repository URL must include a valid host.' };
    }
    if (parsed.username || parsed.password) {
      return { valid: false, message: 'Repository URL must not contain credentials.' };
    }
    if (!parsed.pathname || parsed.pathname === '/') {
      return { valid: false, message: 'Enter a repository URL, not a website root.' };
    }

    return { valid: true, value: parsed.href };
  }

  function setValidationError(message) {
    const input = getElement('repo-url-input');
    const error = getElement('repo-url-error');

    if (input) {
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
    if (error) {
      error.textContent = message || '';
      if (message) {
        error.removeAttribute('hidden');
      } else {
        error.setAttribute('hidden', '');
      }
    }
  }

  function setOverlayLoading(isLoading, message) {
    const overlay = getElement('scan-overlay');
    const overlayBox = overlay ? overlay.querySelector('.overlay__box') : null;
    const progress = getElement('scan-progress-fill');
    const progressLabel = getElement('scan-progress-label');
    const progressBar = getElement('scan-progress-bar-container');
    const overlayMessage = getElement('scan-overlay-message');

    if (overlay) {
      if (isLoading) {
        if (!modalPreviousFocus) {
          modalPreviousFocus = document.activeElement;
        }
        overlay.removeAttribute('hidden');
        if (overlayMessage) overlayMessage.textContent = message || 'Initializing scan…';
        if (progress) progress.style.width = '12%';
        if (progressLabel) progressLabel.textContent = '12%';
        if (progressBar) progressBar.setAttribute('aria-valuenow', '12');

        if (!modalKeydownHandler && overlayBox) {
          modalKeydownHandler = event => {
            if (event.key === 'Escape') {
              cancelScan();
              event.preventDefault();
              return;
            }
            if (event.key !== 'Tab') return;

            const focusable = Array.from(overlayBox.querySelectorAll(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter(element => !element.hasAttribute('hidden'));

            if (focusable.length === 0) {
              event.preventDefault();
              overlayBox.focus();
              return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === overlayBox)) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          };
          overlayBox.addEventListener('keydown', modalKeydownHandler);
        }

        if (overlayBox && typeof overlayBox.focus === 'function') overlayBox.focus();
      } else {
        overlay.setAttribute('hidden', '');
        if (overlayBox && modalKeydownHandler) {
          overlayBox.removeEventListener('keydown', modalKeydownHandler);
          modalKeydownHandler = null;
        }
        if (modalPreviousFocus && typeof modalPreviousFocus.focus === 'function') {
          modalPreviousFocus.focus();
        }
        modalPreviousFocus = null;
      }
    }
  }

  function setLoadingState(isLoading) {
    const button = getElement('scan-btn');
    const input = getElement('repo-url-input');

    scanInProgress = isLoading;
    if (button) {
      button.disabled = isLoading;
      button.setAttribute('aria-busy', isLoading ? 'true' : 'false');
      if (isLoading) {
        button.dataset.originalText = button.textContent;
        button.textContent = 'Scanning…';
      } else if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
    if (input) input.readOnly = isLoading;
  }

  function updateProgress(percent, message) {
    const progress = getElement('scan-progress-fill');
    const progressLabel = getElement('scan-progress-label');
    const progressBar = getElement('scan-progress-bar-container');
    const overlayMessage = getElement('scan-overlay-message');
    const bounded = Math.min(100, Math.max(0, percent));

    if (progress) progress.style.width = `${bounded}%`;
    if (progressLabel) progressLabel.textContent = `${bounded}%`;
    if (progressBar) progressBar.setAttribute('aria-valuenow', String(bounded));
    if (overlayMessage && message) overlayMessage.textContent = message;
  }

  function cancelScan() {
    if (!scanInProgress) return;

    scanGeneration++;
    scanInProgress = false;
    if (activeScanController) {
      activeScanController.abort();
      activeScanController = null;
    }
    if (progressTimer) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }

    setLoadingState(false);
    setOverlayLoading(false);
    setStatus('Scan cancelled', 'idle');
    showToast('The scan request was cancelled. Any late response will be ignored.', 'warning', 'Scan cancelled');
    const button = getElement('scan-btn');
    if (button) button.focus();
  }

  function firstDefined(source, names) {
    if (!source || typeof source !== 'object') return undefined;
    for (let index = 0; index < names.length; index++) {
      if (source[names[index]] !== undefined && source[names[index]] !== null) {
        return source[names[index]];
      }
    }
    return undefined;
  }

  function copyArray(value) {
    return Array.isArray(value) ? value.map(item => (
      item && typeof item === 'object' ? { ...item } : item
    )) : [];
  }

  function extractScanData(response) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      throw new Error('Malformed scan response: expected an object containing scan results.');
    }

    const data = response.data && typeof response.data === 'object' && !Array.isArray(response.data)
      ? response.data
      : response;

    const recognizedContainer = firstDefined(data, ['repository', 'repo', 'statistics', 'stats', 'findings', 'driftFindings', 'drift_findings', 'claims', 'claimsLedger', 'claims_ledger', 'ledger', 'fixes', 'suggestedFixes', 'suggested_fixes']);
    if (recognizedContainer === undefined) {
      throw new Error('Malformed scan response: recognized scan-results container is missing.');
    }

    const findingsValue = firstDefined(data, ['findings', 'driftFindings', 'drift_findings']);
    const claimsValue = firstDefined(data, ['claims', 'claimsLedger', 'claims_ledger']);
    let fixesValue = firstDefined(data, ['fixes', 'suggestedFixes', 'suggested_fixes']);

    if (!Array.isArray(findingsValue)) {
      throw new Error('Malformed scan response: findings must be an array.');
    }
    if (!Array.isArray(claimsValue) && !Array.isArray(data.ledger)) {
      throw new Error('Malformed scan response: claims must be an array.');
    }
    if (!Array.isArray(fixesValue) && !Array.isArray(data.fixList)) {
      throw new Error('Malformed scan response: fixes must be an array.');
    }

    const findings = copyArray(findingsValue);

    let claims = copyArray(claimsValue);
    if (!claimsValue && Array.isArray(data.ledger)) claims = copyArray(data.ledger);

    let fixes = copyArray(fixesValue);
    if (!fixesValue && Array.isArray(data.fixList)) fixes = copyArray(data.fixList);
    if (fixes.length === 0 && findings.length > 0) {
      fixes = findings
        .filter(finding => finding.fix || finding.fixId || finding.fix_id)
        .map(finding => {
          const nested = finding.fix && typeof finding.fix === 'object' ? { ...finding.fix } : {};
          return {
            ...nested,
            findingId: nested.findingId || nested.finding_id || finding.id,
            docFile: nested.docFile || nested.doc_file || finding.docFile || finding.doc_file,
            docLine: nested.docLine || nested.doc_line || finding.docLine || finding.doc_line,
            confidence: nested.confidence !== undefined ? nested.confidence : finding.confidence,
            description: nested.description || finding.suggestedCorrection || finding.suggested_correction || finding.explanation,
            originalContent: nested.originalContent || nested.original_content || finding.docClaim || finding.doc_claim,
            proposedContent: nested.proposedContent || nested.proposed_content || finding.suggestedCorrection || finding.suggested_correction
          };
        });
    }

    const repositorySource = firstDefined(data, ['repository', 'repo']) || {};
    const repository = { ...repositorySource };
    const statisticsSource = firstDefined(data, ['statistics', 'stats']) || {};
    const statistics = { ...statisticsSource };

    const statisticNumber = names => {
      const value = firstDefined(statistics, names);
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    };

    const explicitFilesScanned = statisticNumber(['filesScanned', 'files_scanned']);
    const explicitHealthScore = statisticNumber(['healthScore', 'health_score']);

    const normalizedClaimStatus = claim => {
      const status = String(claim.status || claim.verificationStatus || claim.verification_status || '').toLowerCase();
      return status === 'verified' || status === 'valid' || status === 'sync' || status === 'synced';
    };
    const pendingFixCount = fixes.filter(fix => {
      const status = String(fix.status || 'pending').toLowerCase();
      return status === 'pending';
    }).length;

    const totalFindings = findings.length;
    const totalClaims = claims.length;
    const verifiedClaims = claims.filter(normalizedClaimStatus).length;
    const suggestedFixes = pendingFixCount;
    const filesScanned = explicitFilesScanned !== null ? explicitFilesScanned : 0;

    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    findings.forEach(finding => {
      const severity = String(finding.severity || 'low').toLowerCase();
      const normalizedSeverity = severity === 'major' ? 'high' : (severity === 'minor' ? 'low' : severity);
      if (Object.prototype.hasOwnProperty.call(severityCounts, normalizedSeverity)) {
        severityCounts[normalizedSeverity]++;
      } else {
        severityCounts.low++;
      }
    });

    const dashboardView = {
      repository,
      findings,
      claims,
      fixes,
      statistics: {
        filesScanned,
        totalFindings,
        verifiedClaims,
        totalClaims,
        suggestedFixes,
        severityCounts
      },
      recentActivity: copyArray(firstDefined(data, ['recentActivity', 'activities', 'recent_activity']))
    };
    if (explicitHealthScore !== null) {
      dashboardView.repository = {
        ...dashboardView.repository,
        documentationHealthScore: explicitHealthScore
      };
    }

    return { findings, claims, fixes, dashboardView, repository };
  }

  function getScanId(startResponse) {
    if (!startResponse || typeof startResponse !== 'object') return null;
    return firstDefined(startResponse, ['scanId', 'scan_id', 'id']);
  }

  function startProgressAnimation() {
    if (progressTimer) window.clearInterval(progressTimer);
    let progress = 12;
    progressTimer = window.setInterval(() => {
      if (!scanInProgress) return;
      progress = Math.min(88, progress + 7);
      updateProgress(progress, progress < 45
        ? 'Scanning repository structure…'
        : progress < 75
          ? 'Comparing documentation claims with source code…'
          : 'Preparing scan results…');
    }, 650);
  }

  async function scanRepository(repositoryUrl) {
    if (scanInProgress) return;

    const validation = validateRepositoryUrl(repositoryUrl);
    if (!validation.valid) {
      setValidationError(validation.message);
      setStatus('Validation error', 'idle');
      showToast(validation.message, 'error', 'Invalid repository URL');
      const input = getElement('repo-url-input');
      if (input) input.focus();
      return;
    }

    setValidationError('');
    scanInProgress = true;
    const generation = ++scanGeneration;
    setLoadingState(true);
    setOverlayLoading(true, 'Starting repository scan…');
    setStatus('Scanning', 'running');
    startProgressAnimation();

    activeScanController = new AbortController();

    try {
      if (!window.API || typeof window.API.startScan !== 'function' || typeof window.API.getResults !== 'function') {
        throw new Error('The API module is unavailable or does not expose startScan/getResults.');
      }

      const startResponse = await window.API.startScan(validation.value, { signal: activeScanController.signal });
      if (generation !== scanGeneration) return;

      const scanId = getScanId(startResponse);
      if (!scanId) {
        throw new Error('The scan started but no scan ID was returned.');
      }

      let resultsResponse = null;
      const pollStartedAt = Date.now();
      while (Date.now() - pollStartedAt < 10 * 60 * 1000) {
        if (generation !== scanGeneration) return;
        resultsResponse = await window.API.getResults(scanId, { signal: activeScanController.signal });
        const scanStatus = String(resultsResponse.status || '').toLowerCase();
        const progress = Number(resultsResponse.progress || 0);
        updateProgress(Math.min(95, Math.max(10, progress)), resultsResponse.stage || 'Analyzing repository…');
        if (scanStatus === 'completed') break;
        if (scanStatus === 'failed') {
          throw new Error(resultsResponse.error || 'The repository scan failed.');
        }
        await new Promise((resolve, reject) => {
          const timer = window.setTimeout(resolve, 1200);
          activeScanController.signal.addEventListener('abort', () => {
            window.clearTimeout(timer);
            reject(new Error('Scan cancelled'));
          }, { once: true });
        });
      }
      if (!resultsResponse || resultsResponse.status !== 'completed') {
        throw new Error('Scan timed out while waiting for the backend.');
      }
      if (generation !== scanGeneration) return;

      const scanData = extractScanData(resultsResponse.result || resultsResponse);

      const startHealth = firstDefined(startResponse, ['healthScore', 'health_score']);
      if (startHealth !== undefined) {
        scanData.repository.documentationHealthScore = startHealth;
        scanData.dashboardView.repository.documentationHealthScore = startHealth;
      }
      const startRepositoryUrl = firstDefined(startResponse, ['repositoryUrl', 'repository_url']);
      if (startRepositoryUrl) {
        scanData.repository.url = startRepositoryUrl;
        scanData.dashboardView.repository.url = startRepositoryUrl;
      }

      safeCall('Dashboard', 'refresh', scanData.dashboardView);
      safeCall('Findings', 'render', scanData.findings);
      safeCall('Ledger', 'render', scanData.claims);
      safeCall('Fixes', 'render', scanData.fixes);

      const lastScanTime = getElement('last-scan-time');
      if (lastScanTime) {
        const now = new Date();
        lastScanTime.textContent = now.toLocaleString();
        lastScanTime.setAttribute('datetime', now.toISOString());
      }

      updateProgress(100, 'Scan complete');
      setStatus('Scan complete', 'success');
      showToast(
        `Found ${scanData.findings.length} findings across ${scanData.claims.length} claims.`,
        'success',
        'Scan complete'
      );
    } catch (error) {
      if (generation !== scanGeneration) return;

      const cancelled = error && (
        error.name === 'AbortError' ||
        error.statusText === 'Cancelled' ||
        error.status === 0 && /cancel/i.test(error.message || '')
      );
      if (cancelled) {
        setStatus('Scan cancelled', 'idle');
        showToast('The scan request was cancelled.', 'warning', 'Scan cancelled');
        return;
      }

      const message = error && error.message ? error.message : 'The repository scan could not be completed.';
      setStatus('Scan failed', 'error');
      showToast(message, 'error', 'Scan failed');
      console.error('[PythaDoc] Scan failed:', error);
    } finally {
      if (generation === scanGeneration) {
        if (progressTimer) {
          window.clearInterval(progressTimer);
          progressTimer = null;
        }
        setLoadingState(false);
        setOverlayLoading(false);
        activeScanController = null;
        const button = getElement('scan-btn');
        if (button) button.focus();
      }
    }
  }

  function bindScanForm() {
    const form = getElement('scan-form');
    const input = getElement('repo-url-input');

    if (form) {
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (scanInProgress) return;
        const value = input ? input.value : '';
        scanRepository(value).catch(error => {
          console.error('[PythaDoc] Unhandled scan error:', error);
        });
      });
    }

    if (input) {
      input.addEventListener('input', () => setValidationError(''));
    }

    const cancelButton = getElement('cancel-scan-btn');
    if (cancelButton) cancelButton.addEventListener('click', cancelScan);
  }

  function init() {
    if (initialized) return;
    initialized = true;

    initializeModules();
    bindNavigation();
    bindScanForm();

    const backdrop = getElement('sidebar-backdrop');
    if (backdrop) backdrop.setAttribute('aria-hidden', 'true');
  }

  window.App = {
    init,
    navigateTo,
    scanRepository,
    cancelScan,
    openSidebar,
    closeSidebar,
    showToast,
    showStatus: setStatus
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
