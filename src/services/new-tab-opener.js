// src/services/new-tab-opener.js
// "Open in a new tab": hands a log over to the background, which stores it and
// opens src/viewer/viewer.html on it. The viewer runs on the extension origin
// and has no Salesforce session, so the raw log travels with the request.
// See docs/tech-solution/open-in-new-tab.md
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;

  // Modal tabs the viewer can open on (data-tab values in modal-manager.js)
  const VIEWER_TABS = ['summary', 'analysis', 'graph', 'calls', 'raw', 'diff'];

  /**
   * The ApexLog fields LogParser.parse() reads, taken from a Salesforce ApexLog
   * record (or the stand-in content.js builds for an imported file).
   * @param {Object} log
   * @returns {Object} Plain JSON-safe metadata
   */
  function pickApexLogFields(log) {
    return {
      Id: log.Id || null,
      LogUserId: log.LogUserId || null,
      Operation: log.Operation || null,
      Status: log.Status || null,
      Application: log.Application || null,
      StartTime: log.StartTime || null,
      DurationMilliseconds: log.DurationMilliseconds || 0,
      LogLength: log.LogLength || null
    };
  }

  /**
   * Turn a parsed log's metadata (LogParser._buildMetadata) back into ApexLog fields,
   * so the viewer parses it exactly like the content script did.
   * @param {Object} metadata - parsedLog.metadata
   * @returns {Object}
   */
  function apexLogFieldsFromParsed(metadata) {
    const startTime = metadata.startTime instanceof Date && !isNaN(metadata.startTime)
      ? metadata.startTime.toISOString()
      : null;
    return pickApexLogFields({
      Id: metadata.id,
      LogUserId: metadata.userId,
      Operation: metadata.operation,
      Status: metadata.status,
      Application: metadata.application,
      StartTime: startTime,
      DurationMilliseconds: metadata.duration,
      LogLength: metadata.logLength
    });
  }

  class NewTabOpener {
    constructor() {
      // Log ids whose request is in flight: a double click opens one tab, not two
      this._pending = new Set();
    }

    /**
     * Open a log that is already parsed (the modal) in a new tab.
     * @param {Object} parsedLog - Output of LogParser.parse(), decorated by content.js
     * @param {string} [initialTab] - Modal tab to show first (data-tab value)
     * @returns {Promise<boolean>} Whether the tab was opened
     */
    openParsedLog(parsedLog, initialTab) {
      if (!parsedLog) return Promise.resolve(false);
      const { metadata } = parsedLog;
      return this.open({
        rawContent: parsedLog.rawContent,
        metadata: apexLogFieldsFromParsed(metadata),
        userName: metadata.userName || null,
        cleared: Boolean(metadata.cleared),
        initialTab
      });
    }

    /**
     * Open a raw log in a new tab.
     * @param {Object} log
     * @param {string} log.rawContent - Log body
     * @param {Object} log.metadata - ApexLog record (Id, Operation, Status, StartTime...)
     * @param {string|null} [log.userName] - Header chip: whose log it is
     * @param {boolean} [log.cleared] - Header chip: hidden by Clear
     * @param {string} [log.initialTab] - Modal tab to show first
     * @returns {Promise<boolean>} Whether the tab was opened. Failures are shown as a toast.
     */
    async open({ rawContent, metadata, userName = null, cleared = false, initialTab = 'summary' }) {
      const pendingKey = metadata?.Id || '';
      if (this._pending.has(pendingKey)) return false;
      this._pending.add(pendingKey);

      try {
        const response = await this._send({
          action: 'openLogInNewTab',
          log: {
            rawContent: String(rawContent || ''),
            metadata: pickApexLogFields(metadata || {}),
            userName,
            cleared: Boolean(cleared),
            initialTab: VIEWER_TABS.includes(initialTab) ? initialTab : 'summary'
          }
        });

        if (!response || !response.ok) {
          throw Object.assign(new Error(response?.error || 'No response from the background'), { code: response?.error });
        }
        logger.success(`[NewTabOpener] Log ${pendingKey} opened in a new tab`);
        return true;
      } catch (error) {
        logger.error('[NewTabOpener] Could not open the log in a new tab', error);
        const message = error.code === 'storage'
          ? (i18n.openInNewTabTooLarge || 'This log is too large for the browser storage: it can\'t be opened in a new tab')
          : (i18n.openInNewTabError || 'Couldn\'t open the log in a new tab');
        // modal-manager.js shows the toast, modal open or not
        document.dispatchEvent(new CustomEvent('foxlog:showToast', { detail: { message, type: 'error' } }));
        return false;
      } finally {
        this._pending.delete(pendingKey);
      }
    }

    /**
     * runtime.sendMessage with a callback: Firefox's chrome.* shim doesn't return promises everywhere.
     * @private
     */
    _send(message) {
      return new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage(message, (response) => {
            const lastError = chrome.runtime.lastError;
            if (lastError) reject(new Error(lastError.message));
            else resolve(response);
          });
        } catch (error) {
          // "Extension context invalidated" after the extension was reloaded
          reject(error);
        }
      });
    }
  }

  window.FoxLog.newTabOpener = new NewTabOpener();
  logger.log('[FoxLog] New tab opener loaded');
})();
