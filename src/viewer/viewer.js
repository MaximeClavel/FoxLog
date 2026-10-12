// src/viewer/viewer.js
// Full-page log analysis in its own tab. "Open in a new tab" (src/services/new-tab-opener.js)
// hands the log to src/background.js, which stores it under a random key and opens
// this page with ?k=<key>. The page renders the modal's analysis in PAGE MODE.
// See docs/tech-solution/open-in-new-tab.md
(function() {
  'use strict';

  const { logParser, modalManager } = window.FoxLog;
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;

  const ENTRY_PREFIX = 'foxlogViewer:'; // same as VIEWER_ENTRY_PREFIX in background.js
  const KEY_PATTERN = /^[0-9a-f-]{36}$/;
  const TABS = ['summary', 'analysis', 'graph', 'calls', 'raw', 'diff'];

  const statusEl = document.getElementById('foxlog-viewer-status');
  const escapeHtml = window.FoxLog.escapeHtml;

  function storageGet(area, key) {
    return new Promise((resolve) => {
      try {
        chrome.storage[area].get(key, (result) => {
          if (chrome.runtime.lastError) {
            logger.warn(`[Viewer] storage.${area} read failed`, chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          resolve(result ? result[key] : null);
        });
      } catch (error) {
        logger.warn(`[Viewer] storage.${area} unavailable`, error);
        resolve(null);
      }
    });
  }

  /** The background stores in storage.session, or storage.local when session is full */
  async function readEntry(key) {
    for (const area of ['session', 'local']) {
      if (!chrome.storage[area]) continue;
      const entry = await storageGet(area, ENTRY_PREFIX + key);
      if (entry) return entry;
    }
    return null;
  }

  function showState({ iconName, tone, title, hint }) {
    statusEl.innerHTML = `
      <div class="sf-empty-state">
        <div class="sf-empty-icon${tone ? ` sf-empty-icon--${tone}` : ''}">${window.FoxLog.icon(iconName, { size: 22 })}</div>
        <p class="sf-empty-title">${escapeHtml(title)}</p>
        ${hint ? `<p class="sf-hint">${escapeHtml(hint)}</p>` : ''}
      </div>
    `;
  }

  function render(entry) {
    const parsedLog = logParser.parse(entry.rawContent, entry.metadata);
    // Header chips content.js adds (_decorateLogMetadata)
    parsedLog.metadata.userName = entry.userName || null;
    parsedLog.metadata.cleared = Boolean(entry.cleared);

    modalManager.pageMode = true; // PAGE MODE, see modal-manager.js
    modalManager.showParsedLog(parsedLog, logParser);

    const page = modalManager.currentModal;
    // A page landmark, not a dialog
    page.setAttribute('role', 'main');
    page.removeAttribute('aria-modal');
    document.title = `${parsedLog.metadata.operation} · FoxLog`;

    // Start on the tab in the URL (kept across reloads), else the one the modal was on
    const hashTab = window.location.hash.slice(1);
    const initialTab = TABS.includes(hashTab) ? hashTab : entry.initialTab;
    if (TABS.includes(initialTab) && initialTab !== 'summary') {
      page.querySelector(`.sf-tab-btn[data-tab="${initialTab}"]`)?.click();
    }

    // Tab buttons are switched by click (mouse, arrow keys and Summary links all go through it)
    page.querySelector('.sf-modal-tabs')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.sf-tab-btn')?.dataset.tab;
      if (tab) history.replaceState(null, '', `#${tab}`);
    });
  }

  async function init() {
    document.documentElement.lang = navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
    statusEl.insertAdjacentHTML('beforeend', `<div class="sf-loading-text">${escapeHtml(i18n.loadingLog || 'Loading log...')}</div>`);

    const key = new URLSearchParams(window.location.search).get('k');
    if (!key || !KEY_PATTERN.test(key)) {
      showMissing();
      return;
    }

    // Tell the background this tab shows the entry: it is kept until the tab closes,
    // also after a reload or a duplication of the tab
    chrome.runtime.sendMessage({ action: 'viewerAttach', key }, () => void chrome.runtime.lastError);

    const entry = await readEntry(key);
    if (!entry || typeof entry.rawContent !== 'string') {
      showMissing();
      return;
    }

    try {
      render(entry);
      statusEl.remove();
      logger.success('[Viewer] Log displayed');
    } catch (error) {
      logger.error('[Viewer] Could not display the log', error);
      modalManager.currentModal?.remove();
      showState({ iconName: 'alert-triangle', tone: 'danger', title: i18n.viewerError || 'Couldn\'t display this log', hint: error.message });
    }
  }

  function showMissing() {
    document.title = 'FoxLog';
    showState({
      iconName: 'inbox',
      title: i18n.viewerMissingTitle || 'This log is no longer available',
      hint: i18n.viewerMissingHint || 'It is only kept while its tab is open. Open it again from FoxLog in Salesforce.'
    });
  }

  init();
})();
