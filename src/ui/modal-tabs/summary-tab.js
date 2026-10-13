// src/ui/modal-tabs/summary-tab.js
// Summary tab: verdict banner, general information, limits, errors,
// anti-pattern preview and methods. Its links jump to the Flow and Analysis tabs.
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;
  const { escapeHtml, getStatusTone } = window.FoxLog.modalTabUtils;

  // Share of a Salesforce limit where the Summary bars and the verdict banner turn amber / red
  const LIMIT_WARNING_PCT = 75;
  const LIMIT_DANGER_PCT = 90;

  // Summary sections the user collapsed (persisted, shared by every log)
  let collapsedSections = new Set();
  loadSectionPrefs();

  function loadSectionPrefs() {
    try {
      chrome.storage.local.get('summaryCollapsedSections', (result) => {
        const saved = result && result.summaryCollapsedSections;
        if (Array.isArray(saved)) collapsedSections = new Set(saved);
      });
    } catch (error) {
      logger.warn('[SummaryTab] Could not load Summary section preferences', error);
    }
  }

  function saveSectionPrefs() {
    try {
      chrome.storage.local.set({ summaryCollapsedSections: [...collapsedSections] });
    } catch (error) {
      logger.warn('[SummaryTab] Could not save Summary section preferences', error);
    }
  }

  function toggleSummarySection(section) {
    if (!section) return;
    const key = section.dataset.section;
    const collapsed = section.classList.toggle('sf-collapsed');
    const toggle = section.querySelector('.sf-section-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', String(!collapsed));

    if (collapsed) collapsedSections.add(key);
    else collapsedSections.delete(key);
    saveSectionPrefs();
  }

  async function copyErrorMessage(ctx, button) {
    const messageEl = button.closest('.sf-error-item')?.querySelector('.sf-error-message');
    if (!messageEl) return;

    try {
      await navigator.clipboard.writeText(messageEl.textContent.trim());
      button.innerHTML = window.FoxLog.icon('check', { size: 13 });
      setTimeout(() => { button.innerHTML = window.FoxLog.icon('copy', { size: 13 }); }, 1500);
      ctx.showToast(i18n.copySuccess || 'Copied to clipboard!');
    } catch (error) {
      logger.error('Copy failed', error);
      ctx.showToast(i18n.copyError || 'Copy error', 'error');
    }
  }

  /**
   * One delegated listener on the persistent pane: the shell replaces its
   * content on log navigation, the listener stays.
   * @param {Object} ctx - Tab context
   */
  function setupSummaryInteractions(ctx) {
    ctx.pane.addEventListener('click', (e) => {
      const target = e.target;

      const sectionToggle = target.closest('.sf-section-toggle');
      if (sectionToggle) {
        toggleSummarySection(sectionToggle.closest('.sf-summary-section'));
        return;
      }

      const copyBtn = target.closest('.sf-error-copy-btn');
      if (copyBtn) {
        copyErrorMessage(ctx, copyBtn);
        return;
      }

      const errorCard = target.closest('.sf-error-item[data-line-indexes]');
      if (errorCard) {
        // Drag-selecting the message also ends in a click on the card: keep the selection, don't navigate
        const selection = window.getSelection();
        if (!target.closest('.sf-error-jump-btn') && !selection.isCollapsed && errorCard.contains(selection.anchorNode)) return;

        const lines = errorCard.dataset.lineIndexes.split(',').map(Number).filter(Number.isInteger);
        ctx.showInFlow({ lines });
        return;
      }

      const flowTarget = target.closest('[data-flow-group], [data-flow-method]');
      if (flowTarget) {
        ctx.showInFlow(flowTarget.dataset.flowGroup
          ? { group: flowTarget.dataset.flowGroup }
          : { method: flowTarget.dataset.flowMethod });
        return;
      }

      const patternBtn = target.closest('[data-pattern-index]');
      if (patternBtn) {
        ctx.showPatternInAnalysis(parseInt(patternBtn.dataset.patternIndex, 10));
        return;
      }

      const openTab = target.closest('[data-open-tab]');
      if (openTab) {
        ctx.openTab(openTab.dataset.openTab);
      }
    });
  }

  /**
   * One collapsible Summary section. The collapsed state is remembered by key.
   * @private
   */
  function renderSummarySection(key, iconName, title, bodyHtml, extraClass = '') {
    const collapsed = collapsedSections.has(key);
    return `
      <div class="sf-summary-section ${extraClass}${collapsed ? ' sf-collapsed' : ''}" data-section="${key}">
        <h4>
          <button type="button" class="sf-section-toggle" aria-expanded="${!collapsed}">
            ${window.FoxLog.icon(iconName, { size: 14 })}
            <span class="sf-section-title">${title}</span>
            <span class="sf-section-chevron">${window.FoxLog.icon('chevron-down', { size: 14 })}</span>
          </button>
        </h4>
        <div class="sf-section-body">${bodyHtml}</div>
      </div>
    `;
  }

  /**
   * Identical errors (same type and message) collapse into one card with a count.
   * @private
   */
  function groupErrors(errors) {
    const groups = new Map();
    errors.forEach(error => {
      const key = `${error.type}|${error.exceptionType || ''}|${error.message}`;
      let group = groups.get(key);
      if (!group) {
        group = { error, count: 0, lineIndexes: [] };
        groups.set(key, group);
      }
      group.count++;
      if (Number.isInteger(error.lineIndex)) group.lineIndexes.push(error.lineIndex);
    });
    return [...groups.values()];
  }

  function renderErrorsSection(errors) {
    const viewInFlow = escapeHtml(i18n.viewInFlow || 'View in Flow');
    const copyLabel = escapeHtml(i18n.copyMessage || 'Copy message');

    const cards = groupErrors(errors).map(({ error, count, lineIndexes }) => {
      const canJump = lineIndexes.length > 0;
      return `
        <div class="sf-error-item${canJump ? ' sf-error-item--jumpable' : ''}"${canJump ? ` data-line-indexes="${lineIndexes.join(',')}"` : ''}>
          <div class="sf-error-item-head">
            <div class="sf-error-type">${escapeHtml(error.type)}</div>
            ${count > 1 ? `<span class="sf-error-count" title="${count}×">×${count}</span>` : ''}
            <span class="sf-error-actions">
              <button type="button" class="sf-error-action sf-error-copy-btn" title="${copyLabel}" aria-label="${copyLabel}">${window.FoxLog.icon('copy', { size: 13 })}</button>
              ${canJump ? `<button type="button" class="sf-error-action sf-error-jump-btn">${viewInFlow} ${window.FoxLog.icon('arrow-right', { size: 12 })}</button>` : ''}
            </span>
          </div>
          <div class="sf-error-details">
            <div class="sf-error-message">${escapeHtml(error.exceptionType || 'Exception')}: ${escapeHtml(error.message)}</div>
            ${error.method ? `<div class="sf-error-location">${window.FoxLog.icon('map-pin', { size: 12 })} ${(i18n.location || 'Location')}: <code>${escapeHtml(error.method)}</code></div>` : ''}
            <div class="sf-error-time">${escapeHtml(error.timestamp)}</div>
          </div>
        </div>
      `;
    }).join('');

    return renderSummarySection(
      'errors',
      'alert-circle',
      `${i18n.errors || 'Errors'} (${errors.length})`,
      `<div class="sf-errors-list">${cards}</div>`,
      'sf-summary-errors'
    );
  }

  /**
   * Top anti-patterns (worst first) with a way into the Analysis tab.
   * @private
   */
  function renderAntiPatternsSection(results) {
    if (!results || !results.patterns || results.patterns.length === 0) return '';

    const preview = ['critical', 'warning', 'info']
      .flatMap(severity => results.patterns.filter(p => p.severity === severity))
      .slice(0, 3);
    const remaining = results.patterns.length - preview.length;
    const viewInAnalysis = escapeHtml(i18n.viewInAnalysis || 'View in Analysis');

    const items = preview.map(pattern => `
      <button type="button" class="sf-ap-preview-item sf-ap-preview--${pattern.severity}" data-pattern-index="${results.patterns.indexOf(pattern)}" title="${viewInAnalysis}">
        <span class="sf-ap-preview-dot">${window.FoxLog.dot(pattern.severity)}</span>
        <span class="sf-ap-preview-title">${escapeHtml(pattern.title)}</span>
        ${pattern.query || pattern.method ? `<span class="sf-ap-preview-detail">${escapeHtml(pattern.query || pattern.method)}</span>` : ''}
        ${pattern.occurrences ? `<span class="sf-ap-preview-count">×${pattern.occurrences}</span>` : ''}
        <span class="sf-ap-preview-arrow">${window.FoxLog.icon('arrow-right', { size: 13 })}</span>
      </button>
    `).join('');

    const moreLink = remaining > 0
      ? `<button type="button" class="sf-summary-more" data-open-tab="analysis">${escapeHtml((i18n.viewAllAntiPatterns || 'View all {count} anti-patterns').replace('{count}', results.patterns.length))} ${window.FoxLog.icon('arrow-right', { size: 12 })}</button>`
      : '';

    return renderSummarySection(
      'antipatterns',
      'activity',
      `${i18n.antiPatterns || 'Detected Anti-patterns'} (${results.patterns.length})`,
      `<div class="sf-ap-preview-list">${items}${moreLink}</div>`
    );
  }

  function renderMethodsSection(methods, totalCount) {
    const hasTiming = methods.some(m => m.totalMs > 0);
    const ranked = [...methods].sort((a, b) => hasTiming
      ? (b.totalMs - a.totalMs) || (b.calls - a.calls)
      : b.calls - a.calls);
    const top = ranked.slice(0, 10);
    const maxMs = top.length > 0 ? top[0].totalMs : 0;
    const extraCount = ranked.length - top.length;
    const viewInFlow = escapeHtml(i18n.viewInFlow || 'View in Flow');
    const timeTitle = escapeHtml(i18n.methodTimeTitle || 'Total time');

    const rows = top.map(m => {
      // Same naming as the Flow nodes, which is what the jump matches on
      const name = m.class && m.method ? `${m.class}.${m.method}` : (m.method || 'Unknown Method');
      const timeHtml = hasTiming
        ? `<span class="sf-method-time" title="${timeTitle}">${m.totalMs >= 1 ? window.FoxLog.formatDuration(Math.round(m.totalMs)) : '<1 ms'}</span>`
        : '';
      const barHtml = hasTiming && maxMs > 0
        ? `<span class="sf-method-bar"><span class="sf-method-bar-fill" style="width: ${Math.max(2, m.totalMs / maxMs * 100).toFixed(1)}%"></span></span>`
        : '';
      return `
        <button type="button" class="sf-method-item" data-flow-method="${escapeHtml(name)}" title="${viewInFlow}">
          <span class="sf-method-main">
            <span class="sf-method-name">${escapeHtml(name)}</span>
            ${barHtml}
          </span>
          ${timeHtml}
          <span class="sf-method-calls">${m.calls} ${i18n.callsSuffix || 'call(s)'}</span>
        </button>
      `;
    }).join('');

    const extraHint = extraCount > 0
      ? `<div class="sf-hint">${(i18n.andOthers || '...and {count} more').replace('{count}', extraCount)}</div>`
      : '';

    return renderSummarySection(
      'methods',
      'code',
      `${i18n.methods || 'Methods'} (${totalCount})`,
      `<div class="sf-methods-list">${rows}${extraHint}</div>`
    );
  }

  // Verdict banner at the top of the Summary: errors, log status, anti-patterns and the hottest limit set the tone.
  function renderVerdictBanner(summary, parsedLog, results) {
    const { limits } = parsedLog.stats;
    const pct = (used, max) => (max > 0 ? used / max * 100 : 0);
    const limitPct = {
      soql: pct(limits.soqlQueries, limits.maxSoqlQueries),
      dml: pct(limits.dmlStatements, limits.maxDmlStatements),
      cpu: pct(limits.cpuTime, limits.maxCpuTime),
      heap: pct(limits.heapSize, limits.maxHeapSize)
    };
    const hottest = Math.max(...Object.values(limitPct));
    const errorCount = parsedLog.stats.errors.length;
    const criticalCount = results ? results.summary.critical : 0;
    const warningCount = results ? results.summary.warnings : 0;
    const plural = (count, one, many) => (count === 1 ? one : many).replace('{count}', count);

    // A log can fail without any parsed error line (e.g. only FATAL_ERROR), the status still says so
    const statusFailed = getStatusTone(String(summary.metadata.status)) === 'danger';

    let tone = 'healthy';
    if (errorCount > 0 || criticalCount > 0 || statusFailed || hottest >= LIMIT_DANGER_PCT) tone = 'critical';
    else if (warningCount > 0 || hottest > LIMIT_WARNING_PCT) tone = 'warning';

    // Without analysis results "healthy" would be a claim nobody checked
    if (tone === 'healthy' && !results) return '';

    let title;
    if (tone === 'critical') {
      const parts = [];
      if (errorCount > 0) parts.push(plural(errorCount, i18n.verdictErrorOne || '{count} error', i18n.verdictErrorMany || '{count} errors'));
      if (criticalCount > 0) parts.push(plural(criticalCount, i18n.verdictCriticalOne || '{count} critical anti-pattern', i18n.verdictCriticalMany || '{count} critical anti-patterns'));
      if (parts.length > 0) title = parts.join(i18n.verdictAnd || ' and ');
      else if (statusFailed) title = i18n.verdictStatusFailed || 'The log did not finish successfully';
      else title = i18n.verdictLimitCritical || 'A Salesforce limit is almost reached';
    } else if (tone === 'warning') {
      title = warningCount > 0
        ? `${i18n.verdictNoErrors || 'No errors'}, ${plural(warningCount, i18n.verdictAttentionOne || '{count} warning', i18n.verdictAttentionMany || '{count} warnings')}`
        : (i18n.verdictLimitWarning || 'A Salesforce limit is above 75%');
    } else {
      title = i18n.verdictHealthy || 'Healthy log';
    }

    const worstTitles = results && tone !== 'healthy'
      ? ['critical', 'warning'].flatMap(severity => results.patterns.filter(p => p.severity === severity).map(p => p.title))
      : [];
    const subline = [...new Set(worstTitles)].slice(0, 2).map(title => escapeHtml(title)).join(' · ');

    const chips = [
      { icon: 'search', text: `SOQL ${limits.soqlQueries}/${limits.maxSoqlQueries}`, hot: limitPct.soql > LIMIT_WARNING_PCT },
      { icon: 'database', text: `DML ${limits.dmlStatements}/${limits.maxDmlStatements}`, hot: limitPct.dml > LIMIT_WARNING_PCT },
      { icon: 'zap', text: `CPU ${Math.round(limitPct.cpu)} %`, hot: limitPct.cpu > LIMIT_WARNING_PCT }
    ];
    if (limitPct.heap > LIMIT_WARNING_PCT) chips.push({ icon: 'bar-chart', text: `Heap ${Math.round(limitPct.heap)} %`, hot: true });
    chips.push({ icon: null, text: window.FoxLog.formatDuration(summary.duration), hot: false });

    const chipsHtml = chips.map(chip => `
      <span class="sf-verdict-chip${chip.hot ? ' sf-verdict-chip--hot' : ''}">${chip.icon ? window.FoxLog.icon(chip.icon, { size: 12 }) : ''}${escapeHtml(chip.text)}</span>
    `).join('');

    const score = results ? results.summary.score : null;
    const scoreHtml = Number.isFinite(score)
      ? `
        <div class="sf-verdict-score" title="${escapeHtml(i18n.healthScore || 'Health Score')}: ${score}/100">
          <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
            <circle cx="23" cy="23" r="18" fill="none" style="stroke: var(--fl-track)" stroke-width="4"/>
            <circle cx="23" cy="23" r="18" fill="none" style="stroke: var(--v-solid)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(Math.min(100, Math.max(0, score)) / 100 * 113.1).toFixed(1)} 113.1"/>
          </svg>
          <span class="sf-verdict-score-value">${Math.round(score)}</span>
        </div>
      `
      : '';

    const ctaHtml = results && results.patterns.length > 0
      ? `<button type="button" class="sf-verdict-cta" data-open-tab="analysis">${escapeHtml(i18n.viewAnalysis || 'View analysis')} ${window.FoxLog.icon('arrow-right', { size: 12 })}</button>`
      : '';

    const iconName = { critical: 'alert-circle', warning: 'alert-triangle', healthy: 'check-circle' }[tone];

    return `
      <div class="sf-verdict sf-verdict--${tone}">
        <div class="sf-verdict-icon">${window.FoxLog.icon(iconName, { size: 22 })}</div>
        <div class="sf-verdict-body">
          <div class="sf-verdict-title">${escapeHtml(title)}</div>
          ${subline ? `<div class="sf-verdict-sub">${subline}</div>` : ''}
          <div class="sf-verdict-chips">${chipsHtml}</div>
        </div>
        ${scoreHtml}
        ${ctaHtml}
      </div>
    `;
  }

  /**
   * @param {string} [flowGroup] - 'soql' | 'dml' makes the bar a link to those nodes in the Flow tab
   * @private
   */
  function renderLimitBar(label, used, max, displayValue, flowGroup = null) {
    const percentage = max > 0 ? (used / max * 100).toFixed(1) : 0;
    const isWarning = percentage > LIMIT_WARNING_PCT;
    const isDanger = percentage > LIMIT_DANGER_PCT;
    const statusClass = isDanger ? 'danger' : (isWarning ? 'warning' : 'success');
    const inner = `
        <span class="sf-label">${label}</span>
        <span class="sf-limit-bar">
          <span class="sf-limit-fill sf-limit-${statusClass}" style="width: ${percentage}%"></span>
        </span>
        <span class="sf-limit-value">${displayValue}</span>
    `;

    if (flowGroup && used > 0) {
      return `<button type="button" class="sf-limit-item sf-limit-item--jumpable" data-flow-group="${flowGroup}" title="${escapeHtml(i18n.viewInFlow || 'View in Flow')}">${inner}</button>`;
    }
    return `<div class="sf-limit-item">${inner}</div>`;
  }

  /**
   * @param {Object} ctx - Tab context
   * @returns {string} HTML of the Summary pane
   */
  function renderSummaryTab(ctx) {
    const { summary, parsedLog, antiPatternResults } = ctx;
    const status = String(summary.metadata.status);
    const statusClass = { success: 'sf-status-success', danger: 'sf-status-error' }[getStatusTone(status)] || '';
    const errorsSection = parsedLog.stats.errors.length > 0
      ? renderErrorsSection(parsedLog.stats.errors)
      : '';

    return `
      <div class="sf-summary-container">
        ${renderVerdictBanner(summary, parsedLog, antiPatternResults)}

        <div class="sf-summary-section sf-summary-overview">
          <h4>${window.FoxLog.icon('info', { size: 14 })} ${i18n.generalInfo || 'General Information'}</h4>
          <div class="sf-summary-grid">
            <div class="sf-summary-item">
              <span class="sf-label">${i18n.operation || 'Operation'}</span>
              <span class="sf-value">${escapeHtml(summary.metadata.operation)}</span>
            </div>
            <div class="sf-summary-item">
              <span class="sf-label">${i18n.status || 'Status'}</span>
              <span class="sf-value sf-value--status ${statusClass}" title="${escapeHtml(status)}">${escapeHtml(status.split(':')[0])}</span>
            </div>
            <div class="sf-summary-item">
              <span class="sf-label">${i18n.duration || 'Duration'}</span>
              <span class="sf-value">${window.FoxLog.formatDuration(summary.duration)}</span>
            </div>
            <div class="sf-summary-item">
              <span class="sf-label">${i18n.lines || 'Lines'}</span>
              <span class="sf-value">${summary.totalLines}</span>
            </div>
          </div>
        </div>

        ${renderSummarySection('limits', 'bar-chart', i18n.salesforceLimits || 'Salesforce Limits', `
          <div class="sf-limits-grid">
            ${renderLimitBar(i18n.limitSoql || 'SOQL Queries', parsedLog.stats.limits.soqlQueries, parsedLog.stats.limits.maxSoqlQueries, summary.limits.soql, 'soql')}
            ${renderLimitBar(i18n.limitDml || 'DML Statements', parsedLog.stats.limits.dmlStatements, parsedLog.stats.limits.maxDmlStatements, summary.limits.dml, 'dml')}
            ${renderLimitBar(i18n.limitCpu || 'CPU Time', parsedLog.stats.limits.cpuTime, parsedLog.stats.limits.maxCpuTime, summary.limits.cpu)}
            ${renderLimitBar(i18n.limitHeap || 'Heap Size', parsedLog.stats.limits.heapSize, parsedLog.stats.limits.maxHeapSize, summary.limits.heap)}
          </div>
        `)}

        ${errorsSection}

        ${renderAntiPatternsSection(antiPatternResults)}

        ${renderMethodsSection(parsedLog.stats.methods, summary.methods)}
      </div>
    `;
  }

  window.FoxLog.modalTabs.register({
    id: 'summary',
    order: 10,
    icon: 'layout',
    label: () => i18n.summary || 'Summary',
    render: renderSummaryTab,
    setup: setupSummaryInteractions
  });

  logger.log('[FoxLog] Summary tab loaded');
})();
