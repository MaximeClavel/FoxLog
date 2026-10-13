// src/ui/modal-tabs/raw-tab.js
// Raw Log tab: the log text, one addressable line per span (other tabs scroll
// to a line through ModalManager.scrollToLogLine), with copy and .txt export.
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;
  const { escapeHtml, formatBytes, generateFilename, downloadFile } = window.FoxLog.modalTabUtils;

  /**
   * @param {Object} ctx - Tab context
   * @returns {string} HTML of the Raw Log pane
   */
  function renderRawTab(ctx) {
    const { parsedLog } = ctx;
    // Split raw content into lines and wrap each in a span with data-line
    const rawLines = parsedLog.rawContent.split('\n');
    const structuredLines = rawLines.map((line, index) =>
      `<span class="sf-log-line" data-line="${index}">${escapeHtml(line)}</span>`
    ).join('\n');

    return `
      <div class="sf-raw-tab-content">
        <div class="sf-export-toolbar">
          <button id="copy-raw-btn" class="sf-export-btn sf-export-btn-primary">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/>
              <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/>
            </svg>
            ${i18n.copy || 'Copy'}
          </button>
          <button id="export-raw-btn" class="sf-export-btn">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
            ${i18n.exportRaw || 'Export (.txt)'}
          </button>
          <div class="sf-export-info">
            <span class="sf-export-size">${formatBytes(parsedLog.rawContent.length)}</span>
            <span class="sf-export-lines">${rawLines.length} ${(i18n.lines || 'Lines').toLowerCase()}</span>
          </div>
        </div>
        <pre class="sf-raw-log-content" tabindex="0" aria-label="${i18n.rawLog || 'Raw Log'}">${structuredLines}</pre>
      </div>
    `;
  }

  function exportRawLog(ctx, parsedLog) {
    try {
      const filename = generateFilename(parsedLog, 'txt');
      const blob = new Blob([parsedLog.rawContent], { type: 'text/plain' });
      downloadFile(blob, filename);
      logger.success('Raw log exported');
      ctx.showToast(i18n.toastExportSuccess || 'Exported successfully!');
    } catch (error) {
      logger.error('Export failed', error);
      ctx.showToast(i18n.toastExportError || 'Export error', 'error');
    }
  }

  async function copyToClipboard(ctx, text, button) {
    try {
      await navigator.clipboard.writeText(text);

      // Feedback visuel
      const originalText = button.innerHTML;
      button.innerHTML = `
        <svg viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px;">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
        </svg>
        ${i18n.copied || 'Copied!'}
      `;
      button.classList.add('sf-export-btn-success');

      setTimeout(() => {
        button.innerHTML = originalText;
        button.classList.remove('sf-export-btn-success');
      }, 2000);

      logger.success('Copied to clipboard');
      ctx.showToast(i18n.copySuccess || 'Copied to clipboard!');
    } catch (error) {
      logger.error('Copy failed', error);
      ctx.showToast(i18n.copyError || 'Copy error', 'error');
    }
  }

  // Runs on open and again after every log change: the toolbar is new each time
  function setupExportButtons(ctx) {
    const { pane, parsedLog } = ctx;

    // Export log brut (texte)
    const exportRawBtn = pane.querySelector('#export-raw-btn');
    if (exportRawBtn) {
      exportRawBtn.addEventListener('click', () => {
        exportRawLog(ctx, parsedLog);
      });
    }

    // Copier dans le presse-papier
    const copyBtn = pane.querySelector('#copy-raw-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        copyToClipboard(ctx, parsedLog.rawContent, copyBtn);
      });
    }
  }

  window.FoxLog.modalTabs.register({
    id: 'raw',
    order: 50,
    icon: 'file-text',
    label: () => i18n.rawLog || 'Raw Log',
    render: renderRawTab,
    setup: setupExportButtons,
    onLogChange: setupExportButtons
  });

  logger.log('[FoxLog] Raw Log tab loaded');
})();
