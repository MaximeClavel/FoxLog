// src/services/error-alert-service.js
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;

  const SETTING_KEY = 'errorAlertsEnabled';
  const DEFAULT_LATE_WINDOW_MS = 10 * 60 * 1000;
  // Far more than one late window holds for a normal user; keeps a chatty user's stored state small
  const MAX_SEEN_IDS = 500;
  const MAX_ERROR_LENGTH = 160;
  const MAX_GROUPED_OPERATIONS = 3;

  const startTimeOf = (log) => new Date(log.StartTime).getTime();
  const hasFailedStatus = (log) => Boolean(log.Status) && log.Status !== 'Success';

  // ============================================
  // PURE HELPERS (unit-tested in tests/test-error-alerts.js)
  // ============================================

  /**
   * Find the fetched logs that appeared since the previous check of the same user.
   * The state is a watermark (newest StartTime seen) plus the Ids seen within `lateWindowMs`
   * of it: logs are sorted by start but listed when their transaction ends, so a long one can
   * show up behind newer logs and must still count as new.
   * @param {Array} logs - ApexLog records, in any order
   * @param {{userId: string, startTime: string|null, seen: Object<string, number>}|null} state
   *   Result of the previous check; null, or another user's, makes this check the baseline (nothing is new)
   * @param {Object} options
   * @param {string} options.userId - User the logs belong to
   * @param {{startTime: string}|null} [options.clearMark] - The panel's Clear mark: logs it hides are never new
   * @param {number} [options.lateWindowMs]
   * @returns {{newLogs: Array, state: Object, baseline: boolean}} New logs newest first, and the state for the next check
   */
  function findNewLogs(logs, state, { userId, clearMark = null, lateWindowMs = DEFAULT_LATE_WINDOW_MS }) {
    const baseline = !state || state.userId !== userId;
    const seen = baseline ? {} : { ...state.seen };
    const previousNewest = !baseline && state.startTime ? Date.parse(state.startTime) : -Infinity;
    const clearedUpTo = clearMark ? Date.parse(clearMark.startTime) : -Infinity;

    const newLogs = [];
    logs.forEach((log) => {
      const startTime = startTimeOf(log);
      if (Number.isNaN(startTime) || seen[log.Id] !== undefined) return;
      seen[log.Id] = startTime;
      // Below the window its Id was dropped from `seen` long ago: an old log, not a new one
      const isRecent = startTime >= previousNewest - lateWindowMs;
      if (!baseline && isRecent && startTime > clearedUpTo) {
        newLogs.push(log);
      }
    });

    const newest = Math.max(previousNewest, ...Object.values(seen));
    const kept = Object.entries(seen)
      .filter(([, startTime]) => startTime >= newest - lateWindowMs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_SEEN_IDS);

    return {
      newLogs: newLogs.sort((a, b) => startTimeOf(b) - startTimeOf(a)),
      baseline,
      state: {
        userId,
        startTime: Number.isFinite(newest) ? new Date(newest).toISOString() : null,
        seen: Object.fromEntries(kept)
      }
    };
  }

  /**
   * Whether a log counts as an error: the same signals that turn its card red in the panel,
   * a status other than Success or the error badge of the quick body scan
   * @param {Object} log - ApexLog record
   * @param {Object} [analysis] - Its logPreviewService result
   * @returns {boolean}
   */
  function isErrorLog(log, analysis) {
    return Boolean(analysis?.hasError) || hasFailedStatus(log);
  }

  /**
   * One line about a log's error for the alert: the first error the scan found, else the failed status
   * @param {Object} log - ApexLog record
   * @param {Object} [analysis] - Its logPreviewService result
   * @returns {string} Empty when there is nothing to say
   */
  function describeError(log, analysis) {
    const text = (analysis?.firstError || (hasFailedStatus(log) ? log.Status : '')).replace(/\s+/g, ' ').trim();
    return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH - 1)}…` : text;
  }

  /**
   * The new logs that carry an error, with a line about it
   * @param {Array} newLogs - From findNewLogs
   * @param {Map<string, Object>} [analysis] - logPreviewService results by log Id
   * @returns {Array<{log: Object, error: string}>}
   */
  function pickErrorLogs(newLogs, analysis = new Map()) {
    return newLogs
      .filter((log) => isErrorLog(log, analysis.get(log.Id)))
      .map((log) => ({ log, error: describeError(log, analysis.get(log.Id)) }));
  }

  /**
   * The distinct operations of grouped alerts, e.g. "ApexTrigger · /aura · …"
   * @param {Array<{log: Object}>} alerts
   * @returns {string}
   */
  function summarizeOperations(alerts) {
    const operations = [...new Set(alerts.map(({ log }) => log.Operation || 'Unknown'))];
    const shown = operations.slice(0, MAX_GROUPED_OPERATIONS);
    if (operations.length > shown.length) shown.push('…');
    return shown.join(' · ');
  }

  // ============================================
  // SERVICE
  // ============================================

  /**
   * Alerts the user to new error logs of the watched user (the panel's selected user):
   * a count on the toolbar icon and a toast, both skipped while the log list is on screen.
   * The content script feeds it the logs it fetches (panel refresh, or the background poll
   * while the panel is closed); the watermark of what was seen is kept per org and user in
   * chrome.storage.local, shared by every tab of the org.
   */
  class ErrorAlertService {
    constructor() {
      this.enabled = true;
      this.watchedUserId = null; // User whose baseline this page has set
      this.unseen = new Map();   // logId -> alert, counted on the toolbar badge
      this.badgeCount = null;    // Last count sent to the background (null: nothing sent yet)
      this.toastAlerts = [];     // Alerts the toast on screen is about
      this.toast = null;
      this.queue = Promise.resolve();
    }

    /**
     * Read the popup's "Error alerts" setting and follow its changes
     * @param {Function} onEnabledChange - Called with the new value when the user flips it
     * @returns {Promise<boolean>} Whether alerts are on
     */
    async init(onEnabledChange) {
      // The toolbar icon may still show the count of this tab's previous page
      this._setBadge(0);

      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !(SETTING_KEY in changes)) return;
        const enabled = changes[SETTING_KEY].newValue !== false;
        if (enabled === this.enabled) return;
        this.enabled = enabled;
        // Off: drop the badge and the toast. Back on: what arrived meanwhile is not news, start a new baseline
        this.watchedUserId = null;
        this.markAllSeen();
        onEnabledChange(enabled);
      });

      this.enabled = await new Promise((resolve) => {
        chrome.storage.local.get([SETTING_KEY], (result) => resolve(result?.[SETTING_KEY] !== false));
      });
      return this.enabled;
    }

    /**
     * Where the background poll can start fetching: a late window before the watermark,
     * or null (fetch the latest logs) until this page has a baseline for the user
     * @param {string} userId
     * @returns {Promise<string|null>} ISO date
     */
    async getFetchSince(userId) {
      if (userId !== this.watchedUserId) return null;
      const state = await this._readState(userId);
      if (!state?.startTime) return null;
      return new Date(Date.parse(state.startTime) - this._lateWindow()).toISOString();
    }

    /**
     * Run freshly fetched logs through the alerts. The new ones are marked seen; those that carry
     * an error get the toast and count on the badge, unless the user is looking at the log list.
     * Checks run one after another, so the panel refresh and the background poll never both alert on a log.
     * @param {string} userId - User the logs belong to
     * @param {Array} logs - ApexLog records
     * @param {Object} context
     * @param {{startTime: string}|null} [context.clearMark] - The panel's Clear mark for this user
     * @param {Function} context.isInView - Whether the log list is on screen right now
     * @param {Function} context.isStale - Whether `userId` is no longer the watched user (the result is dropped)
     * @returns {Promise<void>}
     */
    process(userId, logs, context) {
      this.queue = this.queue
        .then(() => this._process(userId, logs, context))
        .catch((error) => logger.warn('[FoxLog] Error alert check failed', error));
      return this.queue;
    }

    /** @private */
    async _process(userId, logs, { clearMark = null, isInView, isStale }) {
      if (!this.enabled || isStale()) return;

      // First check on this page, or another user picked: what is already listed is the baseline
      const previous = userId === this.watchedUserId ? await this._readState(userId) : null;
      const { newLogs, state, baseline } = findNewLogs(logs, previous, {
        userId,
        clearMark,
        lateWindowMs: this._lateWindow()
      });
      this.watchedUserId = userId;
      if (JSON.stringify(state) !== JSON.stringify(previous)) {
        this._writeState(userId, state);
      }
      if (baseline) {
        logger.log(`[FoxLog] Error alerts: baseline of ${logs.length} logs for user ${userId}`);
      }

      if (isInView()) {
        // The list shows them, error badges included: nothing to alert, and pending alerts are seen too
        this.markAllSeen();
        return;
      }
      if (newLogs.length === 0) return;

      // Only the new logs' bodies are scanned (and cached for the panel's cards)
      const analysis = await window.FoxLog.logPreviewService.analyzeBatch(newLogs);
      if (!this.enabled || isStale()) return;
      if (isInView()) {
        this.markAllSeen();
        return;
      }

      const alerts = pickErrorLogs(newLogs, analysis);
      if (alerts.length > 0) {
        this._alert(alerts);
      }
    }

    /**
     * The user opened this log: it no longer counts on the badge
     * @param {string} logId
     */
    markSeen(logId) {
      if (this.unseen.delete(logId)) {
        this._setBadge(this.unseen.size);
      }
    }

    /** The user is looking at the log list: clear the badge and the toast */
    markAllSeen() {
      this.unseen.clear();
      this._setBadge(0);
      this.toast?.dismiss();
    }

    /** @private */
    _alert(alerts) {
      alerts.forEach((alert) => this.unseen.set(alert.log.Id, alert));
      this._setBadge(this.unseen.size);
      // Alerts still on screen are folded in: the toast then groups them all
      this.toastAlerts = alerts.concat(this.toast ? this.toastAlerts : []);
      this._showToast();
      logger.log(`[FoxLog] Error alerts: ${alerts.length} new log(s) with an error`);
    }

    /** One toast for one log ("Open" opens it), one grouped toast for several ("Open" opens the panel) @private */
    _showToast() {
      const { CONFIG, i18n, toastManager } = window.FoxLog;
      const alerts = this.toastAlerts;
      const userId = this.watchedUserId;
      const [first] = alerts;

      const content = alerts.length === 1
        ? {
          title: i18n.errorAlertTitle || 'New log with an error',
          message: [first.log.Operation, first.error].filter(Boolean).join(' — '),
          action: {
            label: i18n.errorAlertOpen || 'Open',
            ariaLabel: i18n.errorAlertOpenLog || 'Open this log in FoxLog',
            onClick: () => document.dispatchEvent(new CustomEvent('foxlog:viewLog', {
              detail: { logId: first.log.Id, log: first.log }
            }))
          }
        }
        : {
          title: (i18n.errorAlertTitleMany || '{count} new logs with errors').replace('{count}', alerts.length),
          message: summarizeOperations(alerts),
          action: {
            label: i18n.errorAlertOpen || 'Open',
            ariaLabel: i18n.errorAlertOpenPanel || 'Open the FoxLog panel',
            onClick: () => document.dispatchEvent(new CustomEvent('foxlog:openPanel', { detail: { userId } }))
          }
        };

      this.toast = toastManager.showAlert({
        ...content,
        type: 'error',
        duration: CONFIG.ERROR_ALERT_TOAST_DURATION,
        onDismiss: () => {
          this.toast = null;
          this.toastAlerts = [];
        }
      });
    }

    /**
     * Content scripts can't reach chrome.action: the background sets the badge on this tab (sender.tab.id)
     * @private
     */
    _setBadge(count) {
      if (count === this.badgeCount) return;
      this.badgeCount = count;
      try {
        chrome.runtime.sendMessage({ action: 'setErrorBadge', count }, () => void chrome.runtime.lastError);
      } catch (error) {
        // The extension was reloaded or updated: this page's scripts are orphaned until it reloads
        logger.warn('[FoxLog] Could not update the error badge', error);
      }
    }

    /** @private */
    _lateWindow() {
      return window.FoxLog.CONFIG?.ERROR_ALERT_LATE_WINDOW || DEFAULT_LATE_WINDOW_MS;
    }

    /**
     * Storage key of a user's alert watermark, scoped to the org like the Clear mark
     * @private
     */
    _stateKey(userId) {
      const org = window.FoxLog.salesforceAPI?.baseUrl || window.location.hostname;
      return `foxlog.alertsSeen.${org}.${userId}`;
    }

    /** @private */
    _readState(userId) {
      const key = this._stateKey(userId);
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => resolve(result?.[key] || null));
      });
    }

    /** @private */
    _writeState(userId, state) {
      chrome.storage.local.set({ [this._stateKey(userId)]: state });
    }
  }

  window.FoxLog.errorAlerts = { findNewLogs, isErrorLog, describeError, pickErrorLogs, summarizeOperations };
  window.FoxLog.errorAlertService = new ErrorAlertService();
  logger.log('[FoxLog] Error Alert Service loaded');
})();
