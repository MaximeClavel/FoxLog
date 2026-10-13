// src/ui/modal-tabs/analysis-tab.js
// Analysis tab: health score, anti-patterns grouped by severity with links to
// their log lines, and the report export menu (PDF, MD, TXT).
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;
  const { escapeHtml } = window.FoxLog.modalTabUtils;

  /**
   * Badge next to the tab label: the count of the worst severity found
   * @param {Object} ctx - Tab context
   * @returns {string} HTML
   */
  function renderAnalysisBadge(ctx) {
    const results = ctx.antiPatternResults;
    if (!results || results.totalCount === 0) {
      return `<span class="sf-tab-badge sf-badge-success">${window.FoxLog.icon('check', { size: 10 })}</span>`;
    }

    if (results.hasCritical) {
      return `<span class="sf-tab-badge sf-badge-critical">${results.summary.critical}</span>`;
    }

    if (results.hasWarning) {
      return `<span class="sf-tab-badge sf-badge-warning">${results.summary.warnings}</span>`;
    }

    return `<span class="sf-tab-badge sf-badge-info">${results.summary.info}</span>`;
  }

  /**
   * @param {Object} ctx - Tab context
   * @returns {string} HTML of the Analysis pane
   */
  function renderAnalysisTab(ctx) {
    const results = ctx.antiPatternResults;
    if (!results) {
      return `
        <div class="sf-analysis-container">
          <div class="sf-empty-state">
            <p>${window.FoxLog.icon('alert-triangle')} ${i18n.analysisUnavailable || 'Analysis unavailable'}</p>
          </div>
        </div>
      `;
    }

    const { patterns, summary } = results;

    // Determine score color
    let scoreClass = 'success';
    if (summary.score < 50) scoreClass = 'danger';
    else if (summary.score < 80) scoreClass = 'warning';

    // If no patterns detected, show success message
    if (patterns.length === 0) {
      return `
        <div class="sf-analysis-container">
          <div class="sf-analysis-header sf-analysis-header-healthy">
            ${renderExportDropdown()}
          </div>
          <div class="sf-analysis-healthy">
            <div class="sf-healthy-icon">${window.FoxLog.icon('check-circle', { size: 40 })}</div>
            <div class="sf-healthy-text">${i18n.codeHealthy || 'Code is healthy!'}</div>
            <div class="sf-health-score-large sf-score-${scoreClass}" style="--score: ${summary.score}">
              ${i18n.healthScore || 'Health Score'}: <strong>${summary.score}/100</strong>
            </div>
            <p class="sf-healthy-description">${i18n.noAntiPatterns || 'No anti-patterns detected'}</p>
          </div>
        </div>
      `;
    }

    // Render patterns grouped by severity
    const criticalPatterns = patterns.filter(p => p.severity === 'critical');
    const warningPatterns = patterns.filter(p => p.severity === 'warning');
    const infoPatterns = patterns.filter(p => p.severity === 'info');

    return `
      <div class="sf-analysis-container">
        <div class="sf-analysis-header">
          <div class="sf-health-score-large sf-score-${scoreClass}" style="--score: ${summary.score}">
            <span class="sf-score-label">${i18n.healthScore || 'Health Score'}</span>
            <span class="sf-score-value">${summary.score}<span class="sf-score-max">/100</span></span>
          </div>
          <div class="sf-analysis-summary">
            ${summary.critical > 0 ? `<div class="sf-ap-stat sf-ap-critical">${window.FoxLog.dot('critical')} ${summary.critical} ${i18n.critical || 'Critical'}</div>` : ''}
            ${summary.warnings > 0 ? `<div class="sf-ap-stat sf-ap-warning">${window.FoxLog.dot('warning')} ${summary.warnings} ${i18n.warning || 'Warning'}</div>` : ''}
            ${summary.info > 0 ? `<div class="sf-ap-stat sf-ap-info">${window.FoxLog.dot('info')} ${summary.info} ${i18n.info || 'Info'}</div>` : ''}
          </div>
          ${renderExportDropdown()}
        </div>

        <div class="sf-analysis-patterns">
          ${criticalPatterns.length > 0 ? `
            <div class="sf-pattern-group sf-group-critical">
              <h4 class="sf-group-title">${window.FoxLog.dot('critical')} ${i18n.critical || 'Critical'} (${criticalPatterns.length})</h4>
              ${renderPatternGroup(criticalPatterns, 'critical', patterns)}
            </div>
          ` : ''}

          ${warningPatterns.length > 0 ? `
            <div class="sf-pattern-group sf-group-warning">
              <h4 class="sf-group-title">${window.FoxLog.dot('warning')} ${i18n.warning || 'Warning'} (${warningPatterns.length})</h4>
              ${renderPatternGroup(warningPatterns, 'warning', patterns)}
            </div>
          ` : ''}

          ${infoPatterns.length > 0 ? `
            <div class="sf-pattern-group sf-group-info">
              <h4 class="sf-group-title">${window.FoxLog.dot('info')} ${i18n.info || 'Info'} (${infoPatterns.length})</h4>
              ${renderPatternGroup(infoPatterns, 'info', patterns)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Export button and its PDF / MD / TXT menu
   * @private
   */
  function renderExportDropdown() {
    return `
      <div class="sf-analysis-export-dropdown">
        <button class="sf-call-tree-btn sf-analysis-export-btn" data-action="toggle-analysis-export" title="${i18n.exportReport || 'Export Report'}">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
        <div class="sf-analysis-export-menu" style="display: none;">
          <button class="sf-export-menu-item" data-action="export-pdf">${window.FoxLog.icon('file')} ${i18n.exportPdfShort || 'PDF'}</button>
          <button class="sf-export-menu-item" data-action="export-md">${window.FoxLog.icon('file-text')} ${i18n.exportMdShort || 'MD'}</button>
          <button class="sf-export-menu-item" data-action="export-txt">${window.FoxLog.icon('file')} ${i18n.exportTxtShort || 'TXT'}</button>
        </div>
      </div>
    `;
  }

  /**
   * Render a group of patterns
   * @private
   */
  function renderPatternGroup(patterns, severity, allPatterns) {
    if (patterns.length === 0) return '';

    return patterns.map(pattern => renderPatternItem(pattern, allPatterns.indexOf(pattern))).join('');
  }

  /**
   * Render a single pattern item
   * @param {number} patternIndex - Position in results.patterns (the Summary links to it)
   * @private
   */
  function renderPatternItem(pattern, patternIndex) {
    const severityTones = {
      critical: 'critical',
      warning: 'warning',
      info: 'info'
    };

    const icon = window.FoxLog.dot(severityTones[pattern.severity] || 'neutral');

    // Build details section
    let detailsHtml = '';

    if (pattern.query) {
      detailsHtml += `<div class="sf-ap-query"><code>${escapeHtml(pattern.query)}</code></div>`;
    }

    if (pattern.occurrences) {
      detailsHtml += `<div class="sf-ap-occurrences">${i18n.occurrences || 'Occurrences'}: <strong>${pattern.occurrences}</strong></div>`;
    }

    if (pattern.method) {
      detailsHtml += `<div class="sf-ap-method">${window.FoxLog.icon('map-pin', { size: 12 })} <code>${escapeHtml(pattern.method)}</code></div>`;
    }

    if (pattern.percent !== undefined) {
      detailsHtml += `<div class="sf-ap-percent">${pattern.percent.toFixed(0)}% ${i18n.limitUsed || 'of limit used'}</div>`;
    }

    // Line navigation buttons (max 15 visible, expandable)
    let linesHtml = '';
    if (pattern.lines && pattern.lines.length > 0) {
      const maxVisible = 15;
      const allLines = pattern.lines;
      const visibleLines = allLines.slice(0, maxVisible);
      const hiddenCount = allLines.length - maxVisible;
      const uniqueId = `lines-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      linesHtml = `
        <div class="sf-ap-lines" data-lines-id="${uniqueId}">
          <div class="sf-ap-lines-visible">
            ${visibleLines.map(lineIdx => `
              <button class="sf-ap-line-btn" data-line="${lineIdx}" title="${i18n.viewInLog || 'View in log'}">
                L${lineIdx + 1}
              </button>
            `).join('')}
            ${hiddenCount > 0 ? `
              <button class="sf-ap-show-more-btn" data-target="${uniqueId}" title="${i18n.showAll || 'Show all'}">
                +${hiddenCount}
              </button>
            ` : ''}
          </div>
          ${hiddenCount > 0 ? `
            <div class="sf-ap-lines-all" style="display: none;">
              ${allLines.map(lineIdx => `
                <button class="sf-ap-line-btn" data-line="${lineIdx}" title="${i18n.viewInLog || 'View in log'}">
                  L${lineIdx + 1}
                </button>
              `).join('')}
              <a href="#" class="sf-ap-show-less-btn" data-target="${uniqueId}">${i18n.showLess || 'Less'}</a>
            </div>
          ` : ''}
        </div>
      `;
    }

    return `
      <div class="sf-anti-pattern-item sf-ap-${pattern.severity}" data-pattern-index="${patternIndex}">
        <div class="sf-ap-header">
          <span class="sf-ap-icon">${icon}</span>
          <span class="sf-ap-title">${pattern.title}</span>
        </div>
        <div class="sf-ap-description">${pattern.description}</div>
        ${detailsHtml}
        <div class="sf-ap-suggestion">
          <span class="sf-ap-suggestion-label">${window.FoxLog.icon('lightbulb', { size: 13 })} ${i18n.suggestion || 'Suggestion'}:</span>
          ${pattern.suggestion}
        </div>
        ${pattern.impact ? `
          <div class="sf-ap-impact">
            <span class="sf-ap-impact-label">${window.FoxLog.icon('zap', { size: 13 })} ${i18n.impact || 'Impact'}:</span>
            ${pattern.impact}
          </div>
        ` : ''}
        ${linesHtml}
      </div>
    `;
  }

  /**
   * Setup click handlers for anti-pattern line buttons
   * @private
   */
  function setupAntiPatternLineButtons(ctx) {
    const { pane } = ctx;

    // Line navigation buttons
    const lineButtons = pane.querySelectorAll('.sf-ap-line-btn');
    lineButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const lineIndex = parseInt(btn.dataset.line, 10);
        ctx.scrollToLogLine(lineIndex);
      });
    });

    // "Show more" buttons (+XX)
    const showMoreBtns = pane.querySelectorAll('.sf-ap-show-more-btn');
    showMoreBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = btn.dataset.target;
        const container = pane.querySelector(`[data-lines-id="${targetId}"]`);
        if (container) {
          container.querySelector('.sf-ap-lines-visible').style.display = 'none';
          container.querySelector('.sf-ap-lines-all').style.display = 'flex';
        }
      });
    });

    // "Show less" links
    const showLessBtns = pane.querySelectorAll('.sf-ap-show-less-btn');
    showLessBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetId = btn.dataset.target;
        const container = pane.querySelector(`[data-lines-id="${targetId}"]`);
        if (container) {
          container.querySelector('.sf-ap-lines-visible').style.display = 'flex';
          container.querySelector('.sf-ap-lines-all').style.display = 'none';
        }
      });
    });
  }

  /**
   * Setup export buttons (PDF, MD, TXT) with dropdown menu
   * @private
   */
  function setupExportAnalysisButtons(ctx) {
    const { pane } = ctx;

    // Toggle dropdown menu
    const exportBtn = pane.querySelector('.sf-analysis-export-btn');
    const exportMenu = pane.querySelector('.sf-analysis-export-menu');

    if (exportBtn && exportMenu) {
      exportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isVisible = exportMenu.style.display !== 'none';
        exportMenu.style.display = isVisible ? 'none' : 'block';
      });

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!exportBtn.contains(e.target) && !exportMenu.contains(e.target)) {
          exportMenu.style.display = 'none';
        }
      });
    }

    // Export actions from menu items
    const menuItems = pane.querySelectorAll('.sf-analysis-export-menu .sf-export-menu-item');
    menuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = item.dataset.action;

        if (exportMenu) exportMenu.style.display = 'none';

        // Read at click time: the pane is re-wired on every log change, ctx always holds the shown log
        const exporter = window.FoxLog.analysisExporter;
        switch (action) {
          case 'export-pdf':
            exporter.exportPdf(ctx.parsedLog, ctx.antiPatternResults);
            break;
          case 'export-md':
            exporter.exportMarkdown(ctx.parsedLog, ctx.antiPatternResults);
            break;
          case 'export-txt':
            exporter.exportText(ctx.parsedLog, ctx.antiPatternResults);
            break;
        }
      });
    });

    logger.log('[Export Setup] Analysis export dropdown configured');
  }

  // Runs on open and again after every log change: the pane content is new each time
  function setupAnalysisContent(ctx) {
    setupAntiPatternLineButtons(ctx);
    setupExportAnalysisButtons(ctx);
  }

  window.FoxLog.modalTabs.register({
    id: 'analysis',
    order: 20,
    icon: 'activity',
    label: () => i18n.analysis || 'Analysis',
    badge: renderAnalysisBadge,
    render: renderAnalysisTab,
    setup: setupAnalysisContent,
    onLogChange: setupAnalysisContent,

    /**
     * Scroll to a pattern and flash it (used by ModalManager.showPatternInAnalysis)
     * @param {Object} ctx - Tab context
     * @param {number} patternIndex - Index in results.patterns
     */
    flashPattern(ctx, patternIndex) {
      const item = ctx.pane.querySelector(`.sf-anti-pattern-item[data-pattern-index="${patternIndex}"]`);
      if (!item) return;

      item.scrollIntoView({ behavior: 'instant', block: 'center' });
      item.classList.add('sf-anti-pattern-item--flash');
      setTimeout(() => item.classList.remove('sf-anti-pattern-item--flash'), 1800);
    }
  });

  logger.log('[FoxLog] Analysis tab loaded');
})();
