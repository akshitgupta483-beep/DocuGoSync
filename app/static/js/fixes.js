/**
 * PythaDoc – Python Documentation Drift Detector
 * js/fixes.js
 *
 * Suggested Fixes management, diff card rendering, side-by-side fix preview,
 * local patch acceptance/rejection (without mutating remote repository),
 * and filter/search pipeline.
 */

(function (window, document) {
  'use strict';

  // ───────────────────────────────────────────────────────────────────────────
  // STATE MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────
  let allFixes = [];
  let filteredFixes = [];
  let currentFilters = { status: 'all', search: '' };
  let isEventsBound = false;
  let activePreviewFixId = null;

  /**
   * Safe HTML entity escaper to eliminate XSS vulnerabilities.
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
   * Normalizes fix status ('pending', 'applied', 'dismissed').
   *
   * @param {string} status
   * @returns {string}
   */
  function normalizeStatus(status) {
    if (!status) return 'pending';
    const s = String(status).toLowerCase().trim();
    if (s === 'applied' || s === 'accepted') return 'applied';
    if (s === 'dismissed' || s === 'rejected' || s === 'ignored') return 'dismissed';
    return 'pending';
  }

  /**
   * Normalizes fix objects whether sourced from MockData or backend API payloads.
   *
   * @param {Object} raw
   * @returns {Object}
   */
  function normalizeFix(raw) {
    if (!raw || typeof raw !== 'object') return {};

    const id = raw.id || raw.fixId || raw.fix_id || 'FIX-???';
    const findingId = raw.findingId || raw.finding_id || '';
    const status = normalizeStatus(raw.status);
    const docFile = raw.docFile || raw.doc_file || raw.fileReference || 'docs/README.md';
    const docLine = raw.docLine !== undefined ? raw.docLine : (raw.doc_line !== undefined ? raw.doc_line : 1);
    const codeFile = raw.codeFile || raw.code_file || '';
    const codeLine = raw.codeLine !== undefined ? raw.codeLine : (raw.code_line !== undefined ? raw.code_line : 1);
    const confidence = raw.confidence !== undefined ? raw.confidence : 90;
    const description = raw.description || raw.reason || raw.explanation || 'Documentation drift correction';
    const originalContent = raw.originalContent || raw.original_content || raw.docClaim || '—';
    const proposedContent = raw.proposedContent || raw.proposed_content || raw.suggestedCorrection || '—';
    const codeEvidence = raw.codeEvidence || raw.code_evidence || raw.actualCodeEvidence || raw.actual_code_evidence || '';

    return {
      id,
      findingId,
      status,
      docFile,
      docLine,
      codeFile,
      codeLine,
      confidence,
      description,
      originalContent,
      proposedContent,
      codeEvidence
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FILTERING & SEARCH
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Applies active status filter and search query.
   */
  function applyFilters() {
    filteredFixes = allFixes.filter(fix => {
      // Status filter
      if (currentFilters.status !== 'all') {
        const target = normalizeStatus(currentFilters.status);
        if (fix.status !== target) {
          return false;
        }
      }

      // Search query
      if (currentFilters.search) {
        const q = currentFilters.search.toLowerCase().trim();
        const matchesId = (fix.id || '').toLowerCase().includes(q);
        const matchesFinding = (fix.findingId || '').toLowerCase().includes(q);
        const matchesDesc = (fix.description || '').toLowerCase().includes(q);
        const matchesFile = (fix.docFile || '').toLowerCase().includes(q);
        const matchesOrig = (fix.originalContent || '').toLowerCase().includes(q);
        const matchesProp = (fix.proposedContent || '').toLowerCase().includes(q);

        if (!matchesId && !matchesFinding && !matchesDesc && !matchesFile && !matchesOrig && !matchesProp) {
          return false;
        }
      }

      return true;
    });

    renderList();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CARD RENDERING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Renders the status badge HTML for a fix card.
   *
   * @param {string} status
   * @returns {string}
   */
  function renderBadge(status) {
    const s = normalizeStatus(status);
    let label = 'Pending';
    let badgeClass = 'fix-card__badge--pending';

    if (s === 'applied') {
      label = 'Applied Locally';
      badgeClass = 'fix-card__badge--applied';
    } else if (s === 'dismissed') {
      label = 'Dismissed';
      badgeClass = 'fix-card__badge--dismissed';
    }

    return `<span class="fix-card__badge ${badgeClass}">${label}</span>`;
  }

  /**
   * Renders diff preview lines for a fix card.
   *
   * @param {string} original
   * @param {string} proposed
   * @returns {string}
   */
  function renderDiff(original, proposed) {
    const origLines = (original || '').split('\n');
    const propLines = (proposed || '').split('\n');

    let html = '<div class="fix-card__diff" role="region" aria-label="Documentation patch diff">';

    origLines.forEach(line => {
      const clean = line.startsWith('- ') ? line.slice(2) : line;
      html += `
        <pre class="diff diff--remove" aria-label="Original line"><code>- ${escapeHtml(clean)}</code></pre>
      `;
    });

    propLines.forEach(line => {
      const clean = line.startsWith('+ ') ? line.slice(2) : line;
      html += `
        <pre class="diff diff--add" aria-label="Proposed corrected line"><code>+ ${escapeHtml(clean)}</code></pre>
      `;
    });

    html += '</div>';
    return html;
  }

  /**
   * Renders the list of suggested fixes in #fixes-list.
   */
  function renderList() {
    const container = document.getElementById('fixes-list');
    const emptyState = document.getElementById('fixes-empty');
    if (!container) return;

    if (filteredFixes.length === 0) {
      if (emptyState) {
        emptyState.removeAttribute('hidden');
        emptyState.querySelector('p').textContent = allFixes.length === 0
          ? 'No suggested fixes available. Run a scan to generate fix suggestions.'
          : 'No suggested fixes match the current filter criteria.';
      }
      // Remove any previously rendered cards but keep the empty container
      container.querySelectorAll('article.fix-card').forEach(el => el.remove());
      return;
    }

    if (emptyState) {
      emptyState.setAttribute('hidden', '');
    }

    // Remove old cards
    container.querySelectorAll('article.fix-card').forEach(el => el.remove());

    const fragment = document.createDocumentFragment();

    filteredFixes.forEach(fix => {
      const card = document.createElement('article');
      card.className = `fix-card ${fix.status === 'applied' ? 'fix-card--applied' : (fix.status === 'dismissed' ? 'fix-card--dismissed' : '')}`;
      card.setAttribute('data-fix-id', fix.id);
      if (fix.findingId) {
        card.setAttribute('data-finding-id', fix.findingId);
      }
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', `Suggested fix ${fix.id}`);

      const fileRef = fix.docLine ? `${fix.docFile} · Line ${fix.docLine}` : fix.docFile;
      const isPending = fix.status === 'pending';
      const isApplied = fix.status === 'applied';

      card.innerHTML = `
        <header class="fix-card__header">
          <span class="fix-card__id">${escapeHtml(fix.id)}</span>
          ${renderBadge(fix.status)}
          <span class="fix-card__file">${escapeHtml(fileRef)}</span>
        </header>

        <div class="fix-card__body">
          <p class="fix-card__description">
            <strong>Reason for correction:</strong> ${escapeHtml(fix.description)}
          </p>
          ${renderDiff(fix.originalContent, fix.proposedContent)}
        </div>

        <footer class="fix-card__footer">
          <div class="fix-card__meta">
            ${fix.findingId ? `Finding: <span class="fix-card__link">#${escapeHtml(fix.findingId)}</span> · ` : ''}
            Confidence: <strong class="mono" style="color: var(--clr-text-primary);">${fix.confidence}%</strong>
            <span style="display: block; font-size: 10px; color: var(--clr-text-muted); margin-top: 2px;">
              ${isApplied ? '✔ Applied to local session (external repository unmodified)' : 'Proposed change (local preview)'}
            </span>
          </div>

          <div class="fix-card__actions">
            <button type="button"
                    class="btn btn--secondary btn--sm btn-preview-fix"
                    data-fix-id="${escapeHtml(fix.id)}"
                    aria-label="Preview fix ${escapeHtml(fix.id)} side by side">
              Preview Fix
            </button>

            ${isPending ? `
              <button type="button"
                      class="btn btn--primary btn--sm btn-accept-fix"
                      data-fix-id="${escapeHtml(fix.id)}"
                      aria-label="Accept fix ${escapeHtml(fix.id)} into local preview">
                ✔ Accept Fix
              </button>
              <button type="button"
                      class="btn btn--ghost btn--sm btn-reject-fix"
                      data-fix-id="${escapeHtml(fix.id)}"
                      aria-label="Reject fix suggestion ${escapeHtml(fix.id)}">
                ✕ Reject
              </button>
            ` : (isApplied ? `
              <button type="button"
                      class="btn btn--ghost btn--sm btn-revert-fix"
                      data-fix-id="${escapeHtml(fix.id)}"
                      aria-label="Revert local fix ${escapeHtml(fix.id)} to pending">
                ↩ Revert Local
              </button>
            ` : `
              <button type="button"
                      class="btn btn--ghost btn--sm btn-reopen-fix"
                      data-fix-id="${escapeHtml(fix.id)}"
                      aria-label="Re-evaluate rejected fix ${escapeHtml(fix.id)}">
                Re-evaluate
              </button>
            `)}
          </div>
        </footer>
      `;

      fragment.appendChild(card);
    });

    container.appendChild(fragment);
    bindCardActions(container);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CARD ACTIONS & EVENT DELEGATION
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Binds click handlers to buttons within the rendered cards.
   *
   * @param {HTMLElement} container
   */
  function bindCardActions(container) {
    // Preview buttons
    container.querySelectorAll('.btn-preview-fix').forEach(btn => {
      btn.addEventListener('click', () => {
        const fixId = btn.getAttribute('data-fix-id');
        openPreview(fixId);
      });
    });

    // Accept Fix buttons
    container.querySelectorAll('.btn-accept-fix').forEach(btn => {
      btn.addEventListener('click', () => {
        const fixId = btn.getAttribute('data-fix-id');
        acceptFix(fixId);
      });
    });

    // Reject Fix buttons
    container.querySelectorAll('.btn-reject-fix').forEach(btn => {
      btn.addEventListener('click', () => {
        const fixId = btn.getAttribute('data-fix-id');
        rejectFix(fixId);
      });
    });

    // Revert button
    container.querySelectorAll('.btn-revert-fix').forEach(btn => {
      btn.addEventListener('click', () => {
        const fixId = btn.getAttribute('data-fix-id');
        setFixStatus(fixId, 'pending');
        notifyUser(`Fix #${fixId} reverted to pending status.`, 'info');
      });
    });

    // Re-evaluate button
    container.querySelectorAll('.btn-reopen-fix').forEach(btn => {
      btn.addEventListener('click', () => {
        const fixId = btn.getAttribute('data-fix-id');
        setFixStatus(fixId, 'pending');
        notifyUser(`Fix #${fixId} restored to pending queue.`, 'info');
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SIDE-BY-SIDE FIX PREVIEW MODAL / PANEL
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Opens the side-by-side preview panel populated with the fix data.
   *
   * @param {string} fixId
   */
  function openPreview(fixId) {
    const fix = allFixes.find(f => f.id === fixId);
    if (!fix) return;

    activePreviewFixId = fixId;

    const panel = document.getElementById('fix-preview-panel');
    if (!panel) return;

    panel.setAttribute('data-fix-id', fix.id);
    if (fix.findingId) {
      panel.setAttribute('data-finding-id', fix.findingId);
    }

    // Label & confidence
    const labelEl = document.getElementById('fix-preview-fix-label');
    if (labelEl) {
      labelEl.textContent = `#${fix.id} (${fix.docFile || 'Documentation'})`;
    }

    const confEl = document.getElementById('fix-preview-confidence');
    if (confEl) {
      confEl.textContent = `Confidence: ${fix.confidence}% · Local Preview Only`;
    }

    // Original documentation side
    const origContentEl = document.getElementById('fix-preview-original-content');
    if (origContentEl) {
      origContentEl.textContent = fix.originalContent || '—';
    }

    // Proposed corrected documentation side
    const propContentEl = document.getElementById('fix-preview-proposed-content');
    if (propContentEl) {
      propContentEl.textContent = fix.proposedContent || '—';
    }

    // Action button states in the preview panel
    const applyBtn = document.getElementById('fix-preview-apply-btn');
    if (applyBtn) {
      if (fix.status === 'applied') {
        applyBtn.textContent = '✔ Already Applied Locally';
        applyBtn.disabled = true;
      } else {
        applyBtn.textContent = '✔ Apply This Fix (Local)';
        applyBtn.disabled = false;
      }
    }

    const dismissBtn = document.getElementById('fix-preview-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.textContent = fix.status === 'dismissed' ? 'Dismissed' : '✕ Dismiss Fix';
      dismissBtn.disabled = fix.status === 'dismissed';
    }

    // Reveal panel
    panel.removeAttribute('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Closes the fix preview panel.
   */
  function closePreview() {
    activePreviewFixId = null;
    const panel = document.getElementById('fix-preview-panel');
    if (panel) {
      panel.setAttribute('hidden', '');
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FIX STATUS MUTATIONS (LOCAL ONLY - NEVER MUTATES GITHUB REPO)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Accepts a fix into the local preview / session state.
   * Explicitly informs the user that external repo has NOT been modified.
   *
   * @param {string} fixId
   */
  function acceptFix(fixId) {
    const fix = allFixes.find(f => f.id === fixId);
    if (!fix) return;

    fix.status = 'applied';

    // Synchronize connected finding status if available
    syncFindingStatus(fix.findingId, 'applied');

    // Re-render and update UI
    applyFilters();
    closePreview();
    updateDashboardStats();

    notifyUser(
      `Fix #${fixId} accepted in local preview. External repository was NOT modified. No pull request created.`,
      'success'
    );
  }

  /**
   * Dismisses / rejects a fix suggestion.
   *
   * @param {string} fixId
   */
  function rejectFix(fixId) {
    const fix = allFixes.find(f => f.id === fixId);
    if (!fix) return;

    fix.status = 'dismissed';

    applyFilters();
    closePreview();
    updateDashboardStats();

    notifyUser(`Fix suggestion #${fixId} rejected.`, 'info');
  }

  /**
   * Updates a fix's status programmatically.
   *
   * @param {string} fixId
   * @param {string} newStatus
   */
  function setFixStatus(fixId, newStatus) {
    const fix = allFixes.find(f => f.id === fixId);
    if (!fix) return;

    fix.status = normalizeStatus(newStatus);
    applyFilters();
    updateDashboardStats();
  }

  /**
   * Applies all pending fixes locally with user confirmation.
   */
  function applyAllPending() {
    const pending = allFixes.filter(f => f.status === 'pending');
    if (pending.length === 0) {
      notifyUser('No pending fixes to apply.', 'warning');
      return;
    }

    const confirmed = window.confirm(
      `Apply ${pending.length} pending fixes to your local preview?\n\n` +
      `Safety Notice:\n` +
      `- This will update your local application state only.\n` +
      `- The external GitHub repository will NOT be touched.\n` +
      `- No pull request or commit will be created.`
    );

    if (!confirmed) return;

    pending.forEach(f => {
      f.status = 'applied';
      syncFindingStatus(f.findingId, 'applied');
    });

    applyFilters();
    closePreview();
    updateDashboardStats();

    notifyUser(
      `Applied ${pending.length} fixes to local preview. External repository remains untouched.`,
      'success'
    );
  }

  /**
   * Dismisses all pending fixes with user confirmation.
   */
  function dismissAllPending() {
    const pending = allFixes.filter(f => f.status === 'pending');
    if (pending.length === 0) {
      notifyUser('No pending fixes to dismiss.', 'warning');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to dismiss all ${pending.length} pending fix suggestions?`
    );

    if (!confirmed) return;

    pending.forEach(f => {
      f.status = 'dismissed';
    });

    applyFilters();
    closePreview();
    updateDashboardStats();

    notifyUser(`Dismissed ${pending.length} pending fix suggestions.`, 'info');
  }

  /**
   * Synchronizes findings status with fixes module.
   *
   * @param {string} findingId
   * @param {string} status
   */
  function syncFindingStatus(findingId, status) {
    if (!findingId) return;

    // If findings.js is active and has findings array
    if (window.Findings && typeof window.Findings.getFindings === 'function') {
      const findings = window.Findings.getFindings();
      const match = findings.find(f => f.id === findingId);
      if (match) {
        match.status = status;
        if (typeof window.Findings.refresh === 'function') {
          window.Findings.refresh(findings);
        }
      }
    }
  }

  /**
   * Updates dashboard suggested fix counts if Dashboard module is present.
   */
  function updateDashboardStats() {
    const pendingCount = allFixes.filter(f => f.status === 'pending').length;
    const appliedCount = allFixes.filter(f => f.status === 'applied').length;

    // Update stat card and sidebar badge if present
    const statEl = document.getElementById('stat-suggested-fixes');
    if (statEl) {
      statEl.textContent = String(pendingCount);
    }

    const badgeEl = document.getElementById('badge-fixes');
    if (badgeEl) {
      badgeEl.textContent = String(pendingCount);
      badgeEl.setAttribute('aria-label', `${pendingCount} suggested fixes`);
    }

    // Refresh mock data statistics if active
    if (window.MockData && window.MockData.statistics) {
      window.MockData.statistics.pendingFixes = pendingCount;
      window.MockData.statistics.appliedFixes = appliedCount;
      window.MockData.statistics.suggestedFixes = pendingCount;
    }
  }

  /**
   * Dispatches user notification toast or browser alert.
   *
   * @param {string} msg
   * @param {'info'|'success'|'warning'|'error'} type
   */
  function notifyUser(msg, type = 'info') {
    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast(msg, type);
    } else {
      console.log(`[DocuGoSync Fixes] [${type.toUpperCase()}] ${msg}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // EVENT BINDINGS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Binds toolbar controls, global actions, and preview panel listeners.
   */
  function bindEvents() {
    if (isEventsBound) return;
    isEventsBound = true;

    // Status filter dropdown
    const statusSelect = document.getElementById('filter-fixes-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        currentFilters.status = e.target.value;
        applyFilters();
      });
    }

    // Search input (debounced)
    const searchInput = document.getElementById('search-fixes');
    if (searchInput) {
      let timer = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          currentFilters.search = e.target.value;
          applyFilters();
        }, 200);
      });
    }

    // Apply All Pending button
    const applyAllBtn = document.getElementById('apply-all-fixes-btn');
    if (applyAllBtn) {
      applyAllBtn.addEventListener('click', applyAllPending);
    }

    // Dismiss All Pending button
    const dismissAllBtn = document.getElementById('dismiss-all-fixes-btn');
    if (dismissAllBtn) {
      dismissAllBtn.addEventListener('click', dismissAllPending);
    }

    // Fix Preview Panel buttons
    const previewClose = document.getElementById('fix-preview-close');
    if (previewClose) {
      previewClose.addEventListener('click', closePreview);
    }

    const previewApply = document.getElementById('fix-preview-apply-btn');
    if (previewApply) {
      previewApply.addEventListener('click', () => {
        if (activePreviewFixId) {
          acceptFix(activePreviewFixId);
        }
      });
    }

    const previewDismiss = document.getElementById('fix-preview-dismiss-btn');
    if (previewDismiss) {
      previewDismiss.addEventListener('click', () => {
        if (activePreviewFixId) {
          rejectFix(activePreviewFixId);
        }
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Main render function accepting fix objects or falling back to MockData.
   *
   * @param {Array<Object>|Object} [data]
   */
  function render(data = null) {
    let rawList = [];

    if (Array.isArray(data)) {
      rawList = data;
    } else if (data && Array.isArray(data.fixes)) {
      rawList = data.fixes;
    } else if (data && Array.isArray(data.findings)) {
      // Extract fixes from findings collection
      rawList = data.findings.map(f => f.fix || {
        id: f.fixId || `FIX-${f.id.replace('F-', '')}`,
        findingId: f.id,
        status: f.status || 'pending',
        docFile: f.docFile || f.doc_file,
        docLine: f.docLine || f.doc_line,
        confidence: f.confidence || 90,
        description: f.suggestedCorrection || f.explanation,
        originalContent: f.docClaim,
        proposedContent: f.suggestedCorrection
      });
    }

    allFixes = rawList.map(normalizeFix);
    applyFilters();
    updateDashboardStats();
  }

  /**
   * Refreshes fixes view with new data.
   *
   * @param {Array<Object>|Object} [data]
   */
  function refresh(data = null) {
    render(data);
  }

  /**
   * Resets the fixes view to its initial empty state.
   */
  function reset() {
    allFixes = [];
    filteredFixes = [];
    activePreviewFixId = null;
    currentFilters = { status: 'all', search: '' };

    const statusSelect = document.getElementById('filter-fixes-status');
    if (statusSelect) statusSelect.value = 'all';

    const searchInput = document.getElementById('search-fixes');
    if (searchInput) searchInput.value = '';

    closePreview();
    renderList();
    updateDashboardStats();
  }

  /**
   * Initializes the fixes module, binds listeners, and renders data.
   *
   * @param {Array<Object>|Object} [initialData]
   */
  function init(initialData = null) {
    bindEvents();
    render(initialData);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // WINDOW EXPORT
  // ───────────────────────────────────────────────────────────────────────────
  const FixesModule = {
    init,
    render,
    refresh,
    reset,
    openPreview,
    closePreview,
    acceptFix,
    rejectFix,
    applyAllPending,
    dismissAllPending,
    getFixes: () => [...allFixes],
    getFilteredFixes: () => [...filteredFixes]
  };

  if (typeof window !== 'undefined') {
    window.Fixes = FixesModule;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FixesModule;
  }

})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : {});
