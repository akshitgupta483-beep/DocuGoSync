/**
 * PythaDoc – Python Documentation Drift Detector
 * js/ledger.js
 *
 * Claims Ledger management, filtering, search, pagination, detail inspection,
 * and CSV export.
 * Renders all extracted documentation claims alongside their code evidence references.
 */

(function (window, document) {
  'use strict';

  // ───────────────────────────────────────────────────────────────────────────
  // STATE MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────
  let allClaims = [];
  let filteredClaims = [];
  let currentSort = { column: 'id', direction: 'asc' };
  let currentFilters = { status: 'all', type: 'all', search: '' };
  let currentPage = 1;
  const itemsPerPage = 8;
  let expandedClaimId = null;
  let isEventsBound = false;

  /**
   * Safe HTML entity escaper to prevent XSS from repository content.
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
   * Normalizes claim status to standard values ('verified', 'drifted', 'unverified').
   * Maps synonymous terms:
   * - 'outdated' -> 'drifted'
   * - 'uncertain' / 'pending' -> 'unverified'
   *
   * @param {string} status
   * @returns {string}
   */
  function normalizeStatus(status) {
    if (!status) return 'unverified';
    const s = String(status).toLowerCase().trim();
    if (s === 'outdated' || s === 'drift' || s === 'drifted') {
      return 'drifted';
    }
    if (s === 'verified' || s === 'valid' || s === 'sync' || s === 'synced') {
      return 'verified';
    }
    if (s === 'uncertain' || s === 'unverified' || s === 'unknown' || s === 'pending') {
      return 'unverified';
    }
    return s;
  }

  /**
   * Normalizes claim object properties supporting both camelCase and snake_case backend payloads.
   *
   * @param {Object} raw
   * @returns {Object}
   */
  function normalizeClaim(raw) {
    if (!raw || typeof raw !== 'object') return {};

    const id = raw.id || raw.claimId || raw.claim_id || 'CLM-???';
    const type = (raw.type || raw.claimType || raw.claim_type || 'claim').toLowerCase();
    const docFile = raw.docFile || raw.doc_file || raw.docLocation || raw.doc_location || '—';
    const docLine = raw.docLine !== undefined ? raw.docLine : (raw.doc_line !== undefined ? raw.doc_line : null);
    const codeFile = raw.codeFile || raw.code_file || raw.codeLocation || raw.code_location || '—';
    const codeLine = raw.codeLine !== undefined ? raw.codeLine : (raw.code_line !== undefined ? raw.code_line : null);
    const claimText = raw.claimText || raw.claim_text || raw.text || raw.claim || 'No claim description provided';
    const status = normalizeStatus(raw.status || raw.verificationStatus || raw.verification_status);
    const lastVerified = raw.lastVerified || raw.last_verified || raw.verifiedAt || raw.verified_at || 'Recently';
    const details = raw.details || raw.explanation || raw.mismatchExplanation || '';
    const confidence = raw.confidence !== undefined ? raw.confidence : (status === 'verified' ? 98 : (status === 'drifted' ? 94 : 65));

    return {
      id,
      type,
      docFile,
      docLine,
      codeFile,
      codeLine,
      claimText,
      status,
      lastVerified,
      details,
      confidence
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FILTERING, SEARCHING & SORTING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Applies active status, type, and text search filters.
   */
  function applyFilters() {
    filteredClaims = allClaims.filter(claim => {
      // 1. Status filter
      if (currentFilters.status !== 'all') {
        const targetStatus = normalizeStatus(currentFilters.status);
        if (claim.status !== targetStatus) {
          return false;
        }
      }

      // 2. Type filter
      if (currentFilters.type !== 'all') {
        if (claim.type !== currentFilters.type.toLowerCase()) {
          return false;
        }
      }

      // 3. Search query filter
      if (currentFilters.search) {
        const query = currentFilters.search.toLowerCase().trim();
        const matchesId = (claim.id || '').toLowerCase().includes(query);
        const matchesText = (claim.claimText || '').toLowerCase().includes(query);
        const matchesDoc = (claim.docFile || '').toLowerCase().includes(query);
        const matchesCode = (claim.codeFile || '').toLowerCase().includes(query);
        const matchesDetails = (claim.details || '').toLowerCase().includes(query);

        if (!matchesId && !matchesText && !matchesDoc && !matchesCode && !matchesDetails) {
          return false;
        }
      }

      return true;
    });

    applySorting();
    currentPage = 1;
    renderTable();
    updatePagination();
  }

  /**
   * Sorts filtered claims by current sort column and direction.
   */
  function applySorting() {
    const { column, direction } = currentSort;
    const modifier = direction === 'desc' ? -1 : 1;

    filteredClaims.sort((a, b) => {
      let valA = a[column];
      let valB = b[column];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'string') {
        return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * modifier;
      }

      if (valA < valB) return -1 * modifier;
      if (valA > valB) return 1 * modifier;
      return 0;
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TABLE & ACCORDION RENDERING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Generates the badge HTML for claim verification status.
   *
   * @param {string} status
   * @returns {string}
   */
  function renderStatusBadge(status) {
    const norm = normalizeStatus(status);
    let label = 'Unverified';
    let chipClass = 'status-chip--unverified';

    if (norm === 'verified') {
      label = 'Verified';
      chipClass = 'status-chip--verified';
    } else if (norm === 'drifted') {
      label = 'Drifted';
      chipClass = 'status-chip--drifted';
    }

    return `<span class="status-chip ${chipClass}">${label}</span>`;
  }

  /**
   * Generates the badge HTML for claim type.
   *
   * @param {string} type
   * @returns {string}
   */
  function renderTypeBadge(type) {
    const t = (type || 'claim').toLowerCase();
    return `<span class="type-chip">${escapeHtml(t)}</span>`;
  }

  /**
   * Formats a file reference with line number if available.
   *
   * @param {string} file
   * @param {number|string|null} line
   * @returns {string}
   */
  function formatFileRef(file, line) {
    if (!file || file === '—') return '—';
    if (line !== null && line !== undefined && line !== '') {
      return `${file}:${line}`;
    }
    return file;
  }

  /**
   * Toggles the detail accordion row for a claim.
   *
   * @param {string} claimId
   */
  function toggleClaimDetail(claimId) {
    if (expandedClaimId === claimId) {
      expandedClaimId = null;
    } else {
      expandedClaimId = claimId;
    }
    renderTable();
  }

  /**
   * Renders claims rows in #ledger-tbody based on current pagination slice.
   */
  function renderTable() {
    const tbody = document.getElementById('ledger-tbody');
    if (!tbody) return;

    if (filteredClaims.length === 0) {
      const isFiltered = currentFilters.status !== 'all' || currentFilters.type !== 'all' || currentFilters.search !== '';
      tbody.innerHTML = `
        <tr class="data-table__row data-table__row--placeholder">
          <td colspan="7" class="data-table__empty-cell">
            ${isFiltered
              ? 'No documentation claims match the current filter criteria.'
              : 'No claims extracted yet. Run a repository scan to populate the claims ledger.'}
          </td>
        </tr>
      `;
      return;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedItems = filteredClaims.slice(startIndex, startIndex + itemsPerPage);

    let html = '';

    paginatedItems.forEach(claim => {
      const isExpanded = expandedClaimId === claim.id;
      const docRef = formatFileRef(claim.docFile, claim.docLine);
      const codeRef = formatFileRef(claim.codeFile, claim.codeLine);
      const isVerified = claim.status === 'verified';
      const isDrifted = claim.status === 'drifted';

      html += `
        <tr class="data-table__row ${isExpanded ? 'data-table__row--selected' : ''}"
            data-claim-id="${escapeHtml(claim.id)}"
            tabindex="0"
            role="button"
            aria-expanded="${isExpanded ? 'true' : 'false'}"
            aria-label="Toggle details for claim ${escapeHtml(claim.id)}">
          <td class="data-table__cell">
            <strong class="mono" style="color: var(--clr-accent);">${escapeHtml(claim.id)}</strong>
          </td>
          <td class="data-table__cell">
            ${renderTypeBadge(claim.type)}
          </td>
          <td class="data-table__cell">
            <span class="file-path" title="${escapeHtml(docRef)}">${escapeHtml(docRef)}</span>
          </td>
          <td class="data-table__cell" style="max-width: 340px;">
            <div style="font-weight: 500; color: var(--clr-text-primary); line-height: 1.4;">
              ${escapeHtml(claim.claimText)}
            </div>
          </td>
          <td class="data-table__cell">
            ${renderStatusBadge(claim.status)}
          </td>
          <td class="data-table__cell">
            <span class="text-muted mono" style="font-size: var(--fs-xs);">${escapeHtml(claim.lastVerified)}</span>
          </td>
          <td class="data-table__cell" style="white-space: nowrap;">
            <button type="button"
                    class="btn btn--secondary btn--sm btn-inspect-claim"
                    data-claim-id="${escapeHtml(claim.id)}"
                    aria-label="${isExpanded ? 'Collapse' : 'Inspect'} claim ${escapeHtml(claim.id)}">
              ${isExpanded ? 'Hide' : 'Inspect'}
            </button>
          </td>
        </tr>
      `;

      // Expandable reference details row
      if (isExpanded) {
        html += `
          <tr class="data-table__row data-table__row--detail" data-detail-for="${escapeHtml(claim.id)}">
            <td colspan="7" style="padding: 0; background: var(--clr-surface-2); border-bottom: 2px solid var(--clr-border);">
              <div style="padding: var(--gap-lg); border-left: 3px solid ${isVerified ? 'var(--clr-success)' : (isDrifted ? 'var(--clr-danger)' : 'var(--clr-border-strong)')};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--gap-md); margin-bottom: var(--gap-md);">
                  <div>
                    <h4 style="font-size: var(--fs-sm); font-weight: 700; color: var(--clr-text-primary); margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.05em;">
                      Claim Verification Details — <span class="mono" style="color: var(--clr-accent);">${escapeHtml(claim.id)}</span>
                    </h4>
                    <p style="margin: 0; font-size: var(--fs-xs); color: var(--clr-text-secondary);">
                      Verification confidence score: <strong class="mono" style="color: var(--clr-text-primary);">${claim.confidence}%</strong>
                    </p>
                  </div>
                  <button type="button"
                          class="btn btn--ghost btn--sm btn-close-claim-detail"
                          data-claim-id="${escapeHtml(claim.id)}"
                          aria-label="Close detail panel">
                    ✕ Close
                  </button>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--gap-md); margin-bottom: var(--gap-md);">
                  <div style="background: var(--clr-surface-1); padding: var(--gap-md); border-radius: var(--radius-md); border: 1px solid var(--clr-border);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                      <span style="font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; color: var(--clr-text-secondary); letter-spacing: 0.05em;">
                        Documentation Reference
                      </span>
                      <span class="file-path">${escapeHtml(docRef)}</span>
                    </div>
                    <p style="margin: 0; font-size: var(--fs-sm); color: var(--clr-text-primary); line-height: 1.45;">
                      ${escapeHtml(claim.claimText)}
                    </p>
                  </div>

                  <div style="background: var(--clr-surface-1); padding: var(--gap-md); border-radius: var(--radius-md); border: 1px solid var(--clr-border);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                      <span style="font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase; color: var(--clr-text-secondary); letter-spacing: 0.05em;">
                        Implementation Reference
                      </span>
                      <span class="file-path">${escapeHtml(codeRef)}</span>
                    </div>
                    <p style="margin: 0; font-size: var(--fs-sm); color: var(--clr-text-primary); line-height: 1.45;">
                      ${claim.details ? escapeHtml(claim.details) : (isVerified ? 'Code implementation matches documented claim specification.' : 'Verification pending scan confirmation.')}
                    </p>
                  </div>
                </div>

                ${isDrifted ? `
                  <div style="display: flex; justify-content: flex-end; align-items: center; gap: var(--gap-sm); padding-top: var(--gap-xs);">
                    <span style="font-size: var(--fs-xs); color: var(--clr-danger); font-weight: 600;">
                      ⚠ Documentation drift detected for this claim.
                    </span>
                    <button type="button"
                            class="btn btn--primary btn--sm btn-jump-finding"
                            data-claim-id="${escapeHtml(claim.id)}"
                            aria-label="View drift finding in findings section">
                      View Finding Evidence →
                    </button>
                  </div>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }
    });

    tbody.innerHTML = html;

    // Attach row click listeners for expanding/collapsing details
    tbody.querySelectorAll('tr.data-table__row:not(.data-table__row--detail)').forEach(row => {
      const claimId = row.getAttribute('data-claim-id');

      row.addEventListener('click', (e) => {
        // Prevent toggle if clicking inspect button directly
        if (e.target.closest('.btn-inspect-claim')) return;
        if (claimId) toggleClaimDetail(claimId);
      });

      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (claimId) toggleClaimDetail(claimId);
        }
      });
    });

    // Inspect buttons
    tbody.querySelectorAll('.btn-inspect-claim').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const claimId = btn.getAttribute('data-claim-id');
        if (claimId) toggleClaimDetail(claimId);
      });
    });

    // Close detail buttons
    tbody.querySelectorAll('.btn-close-claim-detail').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        expandedClaimId = null;
        renderTable();
      });
    });

    // Jump to finding button if drifted
    tbody.querySelectorAll('.btn-jump-finding').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const claimId = btn.getAttribute('data-claim-id');
        if (window.App && typeof window.App.navigateTo === 'function') {
          window.App.navigateTo('findings');
        } else {
          const findingsNav = document.querySelector('[data-nav="findings"]');
          if (findingsNav) findingsNav.click();
        }
      });
    });
  }

  /**
   * Updates pagination buttons and page info.
   */
  function updatePagination() {
    const totalItems = filteredClaims.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    const prevBtn = document.getElementById('ledger-prev');
    const nextBtn = document.getElementById('ledger-next');
    const pageInfo = document.getElementById('ledger-page-info');

    if (pageInfo) {
      pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalItems} claims)`;
    }

    if (prevBtn) {
      prevBtn.disabled = currentPage <= 1;
    }

    if (nextBtn) {
      nextBtn.disabled = currentPage >= totalPages;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CSV EXPORT
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Exports the currently filtered claims ledger as a CSV file.
   */
  function exportCsv() {
    if (filteredClaims.length === 0) {
      if (typeof window.App !== 'undefined' && typeof window.App.showToast === 'function') {
        window.App.showToast('No claims available to export.', 'warning');
      } else {
        alert('No claims available to export.');
      }
      return;
    }

    const headers = ['ClaimID', 'Type', 'Status', 'Confidence', 'DocFile', 'DocLine', 'CodeFile', 'CodeLine', 'ClaimText', 'Details', 'LastVerified'];
    const rows = filteredClaims.map(c => [
      `"${c.id || ''}"`,
      `"${c.type || ''}"`,
      `"${c.status || ''}"`,
      `"${c.confidence || ''}%"`,
      `"${c.docFile || ''}"`,
      c.docLine !== null && c.docLine !== undefined ? c.docLine : '',
      `"${c.codeFile || ''}"`,
      c.codeLine !== null && c.codeLine !== undefined ? c.codeLine : '',
      `"${(c.claimText || '').replace(/"/g, '""')}"`,
      `"${(c.details || '').replace(/"/g, '""')}"`,
      `"${c.lastVerified || ''}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `docugosync_claims_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // EVENT BINDINGS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Binds toolbar controls, filters, pagination, and export buttons.
   */
  function bindEvents() {
    if (isEventsBound) return;
    isEventsBound = true;

    // Status filter
    const statusFilter = document.getElementById('filter-ledger-status');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        currentFilters.status = e.target.value;
        applyFilters();
      });
    }

    // Type filter
    const typeFilter = document.getElementById('filter-ledger-type');
    if (typeFilter) {
      typeFilter.addEventListener('change', (e) => {
        currentFilters.type = e.target.value;
        applyFilters();
      });
    }

    // Search input (with debounce)
    const searchInput = document.getElementById('search-ledger');
    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          currentFilters.search = e.target.value;
          applyFilters();
        }, 200);
      });
    }

    // Pagination previous
    const prevBtn = document.getElementById('ledger-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderTable();
          updatePagination();
        }
      });
    }

    // Pagination next
    const nextBtn = document.getElementById('ledger-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredClaims.length / itemsPerPage);
        if (currentPage < totalPages) {
          currentPage++;
          renderTable();
          updatePagination();
        }
      });
    }

    // CSV export
    const exportBtn = document.getElementById('export-ledger-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportCsv);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Renders the claims ledger with provided data or falls back to window.MockData.
   *
   * @param {Array<Object>|Object} [data]
   */
  function render(data = null) {
    let rawList = [];

    if (Array.isArray(data)) {
      rawList = data;
    } else if (data && Array.isArray(data.claims)) {
      rawList = data.claims;
    }

    allClaims = rawList.map(normalizeClaim);
    expandedClaimId = null;
    applyFilters();
  }

  /**
   * Refreshes the ledger view with fresh data.
   *
   * @param {Array<Object>|Object} [data]
   */
  function refresh(data = null) {
    render(data);
  }

  /**
   * Resets the ledger view to empty initial state.
   */
  function reset() {
    allClaims = [];
    filteredClaims = [];
    expandedClaimId = null;
    currentPage = 1;
    currentFilters = { status: 'all', type: 'all', search: '' };

    const statusFilter = document.getElementById('filter-ledger-status');
    if (statusFilter) statusFilter.value = 'all';

    const typeFilter = document.getElementById('filter-ledger-type');
    if (typeFilter) typeFilter.value = 'all';

    const searchInput = document.getElementById('search-ledger');
    if (searchInput) searchInput.value = '';

    renderTable();
    updatePagination();
  }

  /**
   * Programmatically opens a claim detail inspection row.
   *
   * @param {string} claimId
   */
  function showClaim(claimId) {
    if (!claimId) return;
    expandedClaimId = claimId;

    // Switch page if necessary to bring item into view
    const index = filteredClaims.findIndex(c => c.id === claimId);
    if (index !== -1) {
      currentPage = Math.floor(index / itemsPerPage) + 1;
    }

    renderTable();
    updatePagination();

    const targetRow = document.querySelector(`tr[data-claim-id="${claimId}"]`);
    if (targetRow && typeof targetRow.scrollIntoView === 'function') {
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /**
   * Initializes the ledger module, binds listeners, and renders data.
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
  const LedgerModule = {
    init,
    render,
    refresh,
    reset,
    showClaim,
    exportCsv,
    getClaims: () => [...allClaims],
    getFilteredClaims: () => [...filteredClaims]
  };

  if (typeof window !== 'undefined') {
    window.Ledger = LedgerModule;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LedgerModule;
  }

})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : {});
