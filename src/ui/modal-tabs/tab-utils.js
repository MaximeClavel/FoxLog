// src/ui/modal-tabs/tab-utils.js
// Helpers shared by the modal shell (ModalManager) and the tab modules.
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;

  window.FoxLog.modalTabUtils = {
    /**
     * Escape HTML special characters (same as window.FoxLog.escapeHtml)
     * @param {string} unsafe - Raw string
     * @returns {string} String safe for innerHTML
     */
    escapeHtml: window.FoxLog.escapeHtml,

    /**
     * @param {number} bytes - Size in bytes
     * @returns {string} e.g. "812 B", "12.4 KB", "1.2 MB"
     */
    formatBytes(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    /**
     * Tone of a log status, for the header chip and the Summary
     * @param {string} status - Log status ("Success", an exception message, "Unknown"...)
     * @returns {string} 'success' | 'neutral' | 'danger'
     */
    getStatusTone(status) {
      if (status === 'Success') return 'success';
      return status === 'Unknown' ? 'neutral' : 'danger';
    },

    /**
     * Download file name for an export of the given log
     * @param {Object} parsedLog - Parsed log
     * @param {string} extension - File extension without the dot
     * @returns {string} e.g. "foxlog_ApexTrigger_2026-10-12T09-30-00.txt"
     */
    generateFilename(parsedLog, extension) {
      const date = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const operation = (parsedLog.metadata.operation || 'log')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 30);
      return `foxlog_${operation}_${date}.${extension}`;
    },

    /**
     * Save a Blob through a temporary download link
     * @param {Blob} blob - File content
     * @param {string} filename - Suggested file name
     */
    downloadFile(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    /**
     * Spinner shown while a tab (or part of it) is being built
     * @param {string} text - Main line
     * @param {string} [subtext] - Optional second line
     * @returns {string} HTML
     */
    renderLoading(text, subtext = '') {
      return `
        <div class="sf-calls-loading">
          <div class="sf-spinner"></div>
          <div class="sf-loading-text">${text}</div>
          ${subtext ? `<div class="sf-loading-subtext">${subtext}</div>` : ''}
        </div>
      `;
    },

    /**
     * Error state shown in place of a tab's content when building it failed
     * @param {string} message - What failed (translated)
     * @param {string} detail - Technical detail, usually error.message
     * @returns {string} HTML
     */
    renderErrorState(message, detail) {
      return `
        <div class="sf-empty-state">
          <p style="color: #ef4444; font-weight: 600;">${window.FoxLog.icon('alert-triangle')} ${i18n.error || 'Error'}</p>
          <p style="color: #666;">${message}</p>
          <p class="sf-hint">${detail}</p>
        </div>
      `;
    }
  };

  logger.log('[FoxLog] Modal tab utils loaded');
})();
