/**
 * PythaDoc – Python Documentation Drift Detector
 * js/findings.js
 *
 * Findings management, filtering, evidence comparison, and fix preview integration.
 * Renders all drift findings with side-by-side evidence inspection (documentation vs actual code).
 */

(function () {
  'use strict';

  // Local state
  let allFindings = [];
  let filteredFindings = [];
  let currentSort = { column: 'id', direction: 'asc' };
  let currentFilters = { severity: 'all', file: 'all', search: '' };
  let currentPage = 1;
  const itemsPerPage = 6;
  let activeFindingId = null;

  /**
   * Safe HTML entity escaper to prevent XSS from repository strings.
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
   * Cleans code block strings removing markdown wrapping fences if present.
   *
   * @param {string} raw
   * @returns {string}
   */
  function cleanCodeSnippet(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let cleaned = raw.trim();
    // Strip leading ```lang and trailing ```
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\n?/, '');
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/\n?```$/, '');
    }
    return cleaned;
  }

  /**
   * Normalizes severity levels for filtering (handles major/high, minor/low).
   *
   * @param {string} severity
   * @returns {string} normalized level ('critical', 'high', 'medium', 'low')
   */
  function normalizeSeverity(severity) {
    if (!severity) return 'low';
    const s = String(severity).toLowerCase();
    if (s === 'major') return 'high';
    if (s === 'minor') return 'low';
    return s;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. FILTERING, SEARCHING & SORTING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Applies active severity, file, and text search filters.
   */
  function applyFilters() {
    filteredFindings = allFindings.filter(finding => {
      // 1. Severity filter (supports critical, high/major, medium, low/minor)
      if (currentFilters.severity !== 'all') {
        const itemSev = normalizeSeverity(finding.severity);
        const targetSev = normalizeSeverity(currentFilters.severity);
        if (itemSev !== targetSev) {
          return false;
        }
      }

      // 2. File filter
      if (currentFilters.file !== 'all') {
        const docFile = finding.docFile || finding.doc_file || '';
        const codeFile = finding.codeFile || finding.code_file || '';
        if (docFile !== currentFilters.file && codeFile !== currentFilters.file) {
          return false;
        }
      }

      // 3. Search query filter (matches title, explanation, claim, files)
      if (currentFilters.search) {
        const query = currentFilters.search.toLowerCase();
        const title = (finding.title || '').toLowerCase();
        const explanation = (finding.explanation || '').toLowerCase();
        const docClaim = (finding.docClaim || finding.doc_claim || '').toLowerCase();
        const docFile = (finding.docFile || finding.doc_file || '').toLowerCase();
        const codeFile = (finding.codeFile || finding.code_file || '').toLowerCase();
        const id = (finding.id || '').toLowerCase();

        const matches = title.includes(query) ||
                        explanation.includes(query) ||
                        docClaim.includes(query) ||
                        docFile.includes(query) ||
                        codeFile.includes(query) ||
                        id.includes(query);

        if (!matches) {
          return false;
        }
      }

      return true;
    });

    // Reset to page 1 on filter modification
    currentPage = 1;
    applySorting();
    renderTable();
    updatePagination();
  }

  /**
   * Sorts filtered findings by currentSort column and direction.
   */
  function applySorting() {
    filteredFindings.sort((a, b) => {
      let valA = a[currentSort.column];
      let valB = b[currentSort.column];

      if (currentSort.column === 'severity') {
        const rank = { critical: 4, high: 3, medium: 2, low: 1 };
        valA = rank[normalizeSeverity(a.severity)] || 0;
        valB = rank[normalizeSeverity(b.severity)] || 0;
      } else if (currentSort.column === 'detected') {
        valA = a.detectedAt || a.detected_at || '';
        valB = b.detectedAt || b.detected_at || '';
      } else {
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
      if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  /**
   * Dynamically populates the File filter dropdown with unique files.
   */
  function populateFileFilter() {
    const fileSelect = document.getElementById('filter-file');
    if (!fileSelect) return;

    const files = new Set();
    allFindings.forEach(f => {
      if (f.docFile) files.add(f.docFile);
      if (f.doc_file) files.add(f.doc_file);
      if (f.codeFile) files.add(f.codeFile);
      if (f.code_file) files.add(f.code_file);
    });

    const currentVal = fileSelect.value;
    fileSelect.innerHTML = '<option value="all">All files</option>';

    Array.from(files).sort().forEach(file => {
      const opt = document.createElement('option');
      opt.value = file;
      opt.textContent = file;
      fileSelect.appendChild(opt);
    });

    if (files.has(currentVal)) {
      fileSelect.value = currentVal;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. TABLE RENDERING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Renders findings rows in #findings-tbody based on current pagination slice.
   */
  function renderTable() {
    const tbody = document.getElementById('findings-tbody');
    if (!tbody) return;

    if (filteredFindings.length === 0) {
      tbody.innerHTML = `
        <tr class="data-table__row data-table__row--placeholder">
          <td colspan="7" class="data-table__empty-cell">
            ${allFindings.length === 0
              ? 'Run a repository scan to populate findings.'
              : 'No findings match the current filter criteria.'}
          </td>
        </tr>
      `;
      return;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedItems = filteredFindings.slice(startIndex, startIndex + itemsPerPage);

    tbody.innerHTML = paginatedItems.map(finding => {
      const id = finding.id || 'F-???';
      const title = finding.title || 'Untitled drift finding';
      const rawSeverity = normalizeSeverity(finding.severity);
      const severityDisplay = rawSeverity.charAt(0).toUpperCase() + rawSeverity.slice(1);
      const confidence = finding.confidence !== undefined ? `${finding.confidence}%` : '—';
      const docFile = finding.docFile || finding.doc_file || 'docs/README.md';
      const docLine = finding.docLine || finding.doc_line || 1;
      const codeFile = finding.codeFile || finding.code_file || 'src/main.py';
      const codeLine = finding.codeLine || finding.code_line || 1;
      const docClaim = finding.docClaim || finding.doc_claim || title;
      const explanation = finding.explanation || '';
      const status = finding.status || 'pending';
      const statusClass = status === 'applied' ? 'status-chip--verified' : 'status-chip--drifted';
      const isSelected = activeFindingId === id;

      return `
        <tr class="data-table__row ${isSelected ? 'data-table__row--selected' : ''}"
            data-finding-id="${escapeHtml(id)}"
            tabindex="0"
            role="button"
            aria-label="View evidence for finding ${escapeHtml(id)}: ${escapeHtml(title)}">
          <td class="data-table__cell">
            <strong class="mono" style="color: var(--clr-accent);">${escapeHtml(id)}</strong>
          </td>
          <td class="data-table__cell">
            <span class="severity-chip severity-chip--${escapeHtml(rawSeverity)}">${escapeHtml(severityDisplay)}</span>
            <span class="mono text-muted" style="font-size: var(--fs-xs); margin-left: 4px;">${escapeHtml(confidence)}</span>
          </td>
          <td class="data-table__cell">
            <span class="file-path">${escapeHtml(docFile)}:${escapeHtml(docLine)}</span>
          </td>
          <td class="data-table__cell" style="max-width: 320px;">
            <div style="font-weight: 600; color: var(--clr-text-primary); margin-bottom: 2px;">
              ${escapeHtml(title)}
            </div>
            <div class="text-muted" style="font-size: var(--fs-xs); line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(explanation || docClaim)}">
              ${escapeHtml(docClaim)}
            </div>
          </td>
          <td class="data-table__cell">
            <span class="file-path">${escapeHtml(codeFile)}:${escapeHtml(codeLine)}</span>
          </td>
          <td class="data-table__cell">
            <span class="status-chip ${statusClass}">${escapeHtml(status)}</span>
          </td>
          <td class="data-table__cell" style="white-space: nowrap;">
            <button type="button"
                    class="btn btn--secondary btn--sm btn-inspect-evidence"
                    data-finding-id="${escapeHtml(id)}"
                    aria-label="Inspect evidence for ${escapeHtml(id)}">
              Evidence
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row and button click handlers
    tbody.querySelectorAll('tr.data-table__row').forEach(row => {
      const fid = row.getAttribute('data-finding-id');

      row.addEventListener('click', (e) => {
        // Prevent double trigger if clicking the explicit button
        if (e.target.closest('.btn-inspect-evidence')) return;
        if (fid) showEvidence(fid);
      });

      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (fid) showEvidence(fid);
        }
      });
    });

    tbody.querySelectorAll('.btn-inspect-evidence').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fid = btn.getAttribute('data-finding-id');
        if (fid) showEvidence(fid);
      });
    });
  }

  /**
   * Updates pagination buttons and label info.
   */
  function updatePagination() {
    const totalItems = filteredFindings.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    const prevBtn = document.getElementById('findings-prev');
    const nextBtn = document.getElementById('findings-next');
    const pageInfo = document.getElementById('findings-page-info');

    if (prevBtn) {
      prevBtn.disabled = currentPage <= 1;
    }

    if (nextBtn) {
      nextBtn.disabled = currentPage >= totalPages;
    }

    if (pageInfo) {
      pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalItems} ${totalItems === 1 ? 'finding' : 'findings'})`;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. EVIDENCE COMPARISON & LOCAL FIX PREVIEW VIEW
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Opens the detailed side-by-side evidence comparison panel for a finding.
   *
   * @param {string} findingId - Unique ID of finding to inspect (e.g., 'F-101')
   */
  function showEvidence(findingId) {
    if (!findingId) return;

    const finding = allFindings.find(f => f.id === findingId);
    if (!finding) return;

    activeFindingId = findingId;

    // Highlight row in table
    const tbody = document.getElementById('findings-tbody');
    if (tbody) {
      tbody.querySelectorAll('tr.data-table__row').forEach(row => {
        if (row.getAttribute('data-finding-id') === findingId) {
          row.classList.add('data-table__row--selected');
        } else {
          row.classList.remove('data-table__row--selected');
        }
      });
    }

    const evidencePanel = document.getElementById('evidence-panel');
    const fixPreviewPanel = document.getElementById('fix-preview-panel');

    // ── 1. Populate Evidence Panel ──────────────────────────────────────────
    if (evidencePanel) {
      evidencePanel.setAttribute('data-finding-id', finding.id);

      const titleLabel = document.getElementById('evidence-finding-label');
      if (titleLabel) {
        titleLabel.textContent = `#${finding.id}: ${finding.title}`;
      }

      // Documentation side (Left)
      const docFile = finding.docFile || finding.doc_file || 'Documentation';
      const docLine = finding.docLine || finding.doc_line || 1;
      const docFileEl = document.getElementById('evidence-doc-file');
      if (docFileEl) {
        docFileEl.textContent = `${docFile}:${docLine}`;
      }

      const docContentEl = document.getElementById('evidence-doc-content');
      if (docContentEl) {
        const rawClaim = finding.docEvidence || finding.doc_evidence || finding.docClaim || finding.doc_claim || 'No documentation evidence available.';
        const cleanedDoc = cleanCodeSnippet(rawClaim);
        docContentEl.textContent = cleanedDoc;
      }

      // Actual code side (Right)
      const codeFile = finding.codeFile || finding.code_file || 'Source Code';
      const codeLine = finding.codeLine || finding.code_line || 1;
      const codeFileEl = document.getElementById('evidence-code-file');
      if (codeFileEl) {
        codeFileEl.textContent = `${codeFile}:${codeLine}`;
      }

      const codeContentEl = document.getElementById('evidence-code-content');
      if (codeContentEl) {
        const rawCode = finding.actualCodeEvidence || finding.actual_code_evidence || 'No code implementation evidence available.';
        const cleanedCode = cleanCodeSnippet(rawCode);
        codeContentEl.textContent = cleanedCode;
      }

      // Context explanation summary below evidence columns
      let footerEl = evidencePanel.querySelector('.evidence-panel-container__footer-details');
      if (!footerEl) {
        footerEl = document.createElement('div');
        footerEl.className = 'evidence-panel-container__footer-details';
        footerEl.style.marginTop = 'var(--gap-md)';
        footerEl.style.paddingTop = 'var(--gap-md)';
        footerEl.style.borderTop = '1px solid var(--clr-border)';
        evidencePanel.appendChild(footerEl);
      }

      const rawSeverity = normalizeSeverity(finding.severity);
      const severityDisplay = rawSeverity.charAt(0).toUpperCase() + rawSeverity.slice(1);

      footerEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: var(--gap-sm);">
          <div>
            <strong style="color: var(--clr-text-primary);">Why this is a drift mismatch:</strong>
            <p style="margin-top: 4px; color: var(--clr-text-secondary); font-size: var(--fs-sm); line-height: 1.5;">
              ${escapeHtml(finding.explanation || 'Documentation claims differ from actual AST/runtime code signatures.')}
            </p>
          </div>
          ${finding.suggestedCorrection ? `
          <div>
            <strong style="color: var(--clr-text-primary);">Suggested correction:</strong>
            <p style="margin-top: 4px; color: var(--clr-accent); font-size: var(--fs-sm); font-family: var(--font-mono); line-height: 1.5;">
              ${escapeHtml(finding.suggestedCorrection)}
            </p>
          </div>
          ` : ''}
          <div style="display: flex; gap: var(--gap-md); align-items: center; margin-top: 4px; font-size: var(--fs-xs);">
            <span><strong>Confidence:</strong> <span class="mono">${escapeHtml(finding.confidence)}%</span></span>
            <span><strong>Severity:</strong> <span class="severity-chip severity-chip--${escapeHtml(rawSeverity)}">${escapeHtml(severityDisplay)}</span></span>
            <span><strong>Status:</strong> <span class="mono">${escapeHtml(finding.status || 'pending')}</span></span>
          </div>
        </div>
      `;

      evidencePanel.removeAttribute('hidden');
      evidencePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ── 2. Populate Fix Preview Panel (if fix is available) ─────────────────
    if (fixPreviewPanel && finding.fix) {
      const fix = finding.fix;
      fixPreviewPanel.setAttribute('data-finding-id', finding.id);
      fixPreviewPanel.setAttribute('data-fix-id', fix.id || finding.fixId || 'FIX-???');

      const fixLabel = document.getElementById('fix-preview-fix-label');
      if (fixLabel) {
        fixLabel.textContent = `#${fix.id || finding.fixId || 'FIX'}`;
      }

      const confidenceEl = document.getElementById('fix-preview-confidence');
      if (confidenceEl) {
        confidenceEl.textContent = `Confidence: ${finding.confidence || fix.confidence || 90}%`;
      }

      const origEl = document.getElementById('fix-preview-original-content');
      if (origEl) {
        origEl.textContent = fix.originalContent || finding.docClaim || '—';
      }

      const propEl = document.getElementById('fix-preview-proposed-content');
      if (propEl) {
        propEl.textContent = fix.proposedContent || finding.suggestedCorrection || '—';
      }

      fixPreviewPanel.removeAttribute('hidden');
    }
  }

  /**
   * Closes the active evidence panel and fix preview panel.
   */
  function closeEvidence() {
    activeFindingId = null;

    const evidencePanel = document.getElementById('evidence-panel');
    if (evidencePanel) {
      evidencePanel.setAttribute('hidden', '');
    }

    const fixPreviewPanel = document.getElementById('fix-preview-panel');
    if (fixPreviewPanel) {
      fixPreviewPanel.setAttribute('hidden', '');
    }

    const tbody = document.getElementById('findings-tbody');
    if (tbody) {
      tbody.querySelectorAll('tr.data-table__row--selected').forEach(row => {
        row.classList.remove('data-table__row--selected');
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. CSV EXPORT
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Exports the currently filtered findings dataset as a CSV file download.
   */
  function exportCsv() {
    if (filteredFindings.length === 0) {
      alert('No findings available to export.');
      return;
    }

    const headers = ['ID', 'Severity', 'Confidence', 'DocFile', 'DocLine', 'CodeFile', 'CodeLine', 'Status', 'Title', 'Explanation'];
    const rows = filteredFindings.map(f => [
      `"${f.id || ''}"`,
      `"${f.severity || ''}"`,
      `"${f.confidence || ''}%"`,
      `"${f.docFile || f.doc_file || ''}"`,
      f.docLine || f.doc_line || '',
      `"${f.codeFile || f.code_file || ''}"`,
      f.codeLine || f.code_line || '',
      `"${f.status || ''}"`,
      `"${(f.title || '').replace(/"/g, '""')}"`,
      `"${(f.explanation || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `docugosync_findings_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. EVENT BINDING & LIFECYCLE
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Binds event listeners to toolbar filters, pagination, and close buttons.
   */
  function bindEvents() {
    // Severity filter dropdown
    const severitySelect = document.getElementById('filter-severity');
    if (severitySelect) {
      severitySelect.addEventListener('change', () => {
        currentFilters.severity = severitySelect.value;
        applyFilters();
      });
    }

    // File filter dropdown
    const fileSelect = document.getElementById('filter-file');
    if (fileSelect) {
      fileSelect.addEventListener('change', () => {
        currentFilters.file = fileSelect.value;
        applyFilters();
      });
    }

    // Search input
    const searchInput = document.getElementById('search-findings');
    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          currentFilters.search = searchInput.value.trim();
          applyFilters();
        }, 180);
      });
    }

    // Pagination buttons
    const prevBtn = document.getElementById('findings-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          renderTable();
          updatePagination();
        }
      });
    }

    const nextBtn = document.getElementById('findings-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredFindings.length / itemsPerPage);
        if (currentPage < totalPages) {
          currentPage++;
          renderTable();
          updatePagination();
        }
      });
    }

    // Close buttons for evidence and fix preview
    const evidenceClose = document.getElementById('evidence-panel-close');
    if (evidenceClose) {
      evidenceClose.addEventListener('click', closeEvidence);
    }

    const fixClose = document.getElementById('fix-preview-close');
    if (fixClose) {
      fixClose.addEventListener('click', () => {
        const panel = document.getElementById('fix-preview-panel');
        if (panel) panel.setAttribute('hidden', '');
      });
    }

    // Table column sorting buttons
    const sortButtons = document.querySelectorAll('#findings-table .data-table__sort-btn');
    sortButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const col = btn.getAttribute('data-sort');
        if (currentSort.column === col) {
          currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.column = col;
          currentSort.direction = 'asc';
        }

        // Update ARIA sort attributes on parent TH
        document.querySelectorAll('#findings-table th').forEach(th => {
          th.setAttribute('aria-sort', 'none');
        });
        const parentTh = btn.closest('th');
        if (parentTh) {
          parentTh.setAttribute('aria-sort', currentSort.direction === 'asc' ? 'ascending' : 'descending');
        }

        applySorting();
        renderTable();
      });
    });

    // CSV export button
    const exportBtn = document.getElementById('export-findings-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportCsv);
    }
  }

  /**
   * Main render function accepting findings data array.
   *
   * @param {Array<Object>} [findingsData] - Array of findings from backend or MockData
   */
  function render(findingsData = null) {
    if (Array.isArray(findingsData)) {
      allFindings = [...findingsData];
    } else if (findingsData && Array.isArray(findingsData.findings)) {
      allFindings = [...findingsData.findings];
    } else {
      allFindings = [];
    }

    populateFileFilter();
    applyFilters();
  }

  /**
   * Initializes findings module, binds DOM events, and loads initial dataset.
   */
  function init() {
    bindEvents();
    render([]);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PUBLIC FINDINGS API
  // ───────────────────────────────────────────────────────────────────────────
  const Findings = {
    init,
    render,
    showEvidence,
    closeEvidence,
    setFilterSeverity: (sev) => {
      currentFilters.severity = sev;
      const el = document.getElementById('filter-severity');
      if (el) el.value = sev;
      applyFilters();
    },
    setFilterFile: (file) => {
      currentFilters.file = file;
      const el = document.getElementById('filter-file');
      if (el) el.value = file;
      applyFilters();
    },
    setSearchQuery: (q) => {
      currentFilters.search = q;
      const el = document.getElementById('search-findings');
      if (el) el.value = q;
      applyFilters();
    },
    getFindings: () => [...allFindings],
    getFilteredFindings: () => [...filteredFindings],
    exportCsv
  };

  // Export to window
  if (typeof window !== 'undefined') {
    window.Findings = Findings;
  }

  // CommonJS export for testing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Findings;
  }
})();
