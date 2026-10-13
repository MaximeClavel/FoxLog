// src/ui/modal-tabs/diff-tab.js
// Diff tab: compares the open log with an imported file (LogDiffView). The
// import dropdown is filled lazily on the first activation.
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;
  const { renderLoading, renderErrorState } = window.FoxLog.modalTabUtils;

  /**
   * @returns {string} HTML of the Diff pane: import picker and an empty result area
   */
  function renderDiffTab() {
    return `
      <div class="sf-diff-select-container">
        <div class="sf-diff-top-bar">
          <select class="sf-diff-log-select" aria-label="${i18n.diffSelectLog || 'Select an imported log to compare'}">
            <option value="">-- ${i18n.diffSelectLog || 'Select an imported log'} --</option>
          </select>
          <span class="sf-diff-or">${i18n.diffOr || 'or'}</span>
          <label class="sf-diff-import-btn" tabindex="0" role="button" aria-label="${i18n.diffImportFile || 'Import a file'}">
            ${window.FoxLog.icon('folder', { size: 13 })} ${i18n.diffImportFile || 'Import a file'}
            <input type="file" class="sf-diff-file-input" accept=".txt,.log" hidden />
          </label>
        </div>
        <div class="sf-diff-content-area"></div>
      </div>
    `;
  }

  /**
   * Destroy the diff view of the previous run, if any
   * @private
   */
  function destroyView(state) {
    if (state.view) {
      state.view.destroy();
      state.view = null;
    }
  }

  /**
   * Prepare the lazy init of the Diff tab for the log in ctx: the dropdown is
   * filled on the next activation, or right away if the tab is already active.
   * @private
   */
  function armDiffTab(ctx) {
    const { state } = ctx;
    const currentLog = ctx.parsedLog;

    // Bump the token so a diff still running for the previous log navigation
    // can detect it's no longer current (same DOM node is reused across logs).
    state.run = (state.run || 0) + 1;

    let diffInitialized = false;

    const initDiffTab = async () => {
      if (diffInitialized) return;
      diffInitialized = true;
      await populateDiffImportSelect(ctx, currentLog);
    };

    // The tab button persists across log navigation: onActivate always calls
    // the init bound to the log currently shown, never a previous one (it
    // would still diff against that log).
    state.init = initDiffTab;

    // Navigating to the previous/next log while the Diff tab is already
    // active resets its content but never re-fires a click on the tab
    // button, so nothing would otherwise fill the dropdown — init now.
    if (ctx.isActive()) {
      initDiffTab();
    }
  }

  /**
   * Load imported logs list into the Diff tab dropdown
   * @private
   */
  async function populateDiffImportSelect(ctx, currentLog) {
    const select = ctx.pane.querySelector('.sf-diff-log-select');
    const fileInput = ctx.pane.querySelector('.sf-diff-file-input');

    // Wire inline file import
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await handleDiffImport(ctx, currentLog, file);
        fileInput.value = '';
      });
    }

    if (!select) return;

    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get('importedLogs', resolve);
      });

      const imports = result.importedLogs || [];

      imports.forEach(imp => {
        const option = document.createElement('option');
        option.value = imp.id;
        const date = new Date(imp.date).toLocaleString();
        option.textContent = `${imp.filename} (${date})`;
        select.appendChild(option);
      });

      select.addEventListener('change', async () => {
        const importId = select.value;
        if (!importId) return;
        await runDiff(ctx, currentLog, importId);
      });
    } catch (error) {
      logger.error('Failed to load imported logs for diff', error);
    }
  }

  /**
   * Import a file directly from the Diff tab, save to storage, then run diff
   * @private
   */
  async function handleDiffImport(ctx, currentLog, file) {
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const validExtensions = ['.txt', '.log'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    if (!validExtensions.includes(ext)) {
      ctx.showToast(i18n.importInvalidType || 'Invalid file type. Use .txt or .log', 'error');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      ctx.showToast(i18n.importFileTooLarge || 'File too large (max 5 MB)', 'error');
      return;
    }

    const content = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });

    const importEntry = {
      id: 'imp_' + Date.now(),
      filename: file.name,
      date: new Date().toISOString(),
      size: file.size,
      content
    };

    // Save to storage (same logic as panel-manager)
    await new Promise(resolve => {
      chrome.storage.local.get(['importedLogs'], (result) => {
        const imports = result.importedLogs || [];
        const MAX_STORAGE = 10 * 1024 * 1024;
        imports.unshift(importEntry);

        let totalSize = imports.reduce((sum, imp) => sum + (imp.size || 0), 0);
        while (totalSize > MAX_STORAGE && imports.length > 1) {
          const removed = imports.pop();
          totalSize -= (removed.size || 0);
        }

        chrome.storage.local.set({ importedLogs: imports }, resolve);
      });
    });

    // Refresh the Files panel if open
    document.dispatchEvent(new CustomEvent('foxlog:importListChanged'));

    // Add option to dropdown and select it
    const select = ctx.pane.querySelector('.sf-diff-log-select');
    if (select) {
      const option = document.createElement('option');
      option.value = importEntry.id;
      const date = new Date(importEntry.date).toLocaleString();
      option.textContent = `${importEntry.filename} (${date})`;
      select.insertBefore(option, select.options[1]);
      select.value = importEntry.id;
    }

    logger.success(`File imported from Diff tab: ${file.name}`);

    // Run diff immediately
    await runDiff(ctx, currentLog, importEntry.id);
  }

  /**
   * Parse an imported file like a Salesforce log.
   * An import carries no Salesforce metadata, so hand LogParser the keys it
   * reads (`Id`, `Operation`, ...). Without an `Id` every imported file gets
   * the cache key `null` in CallTreeBuilder, which then returns the first
   * tree it ever built for all of them.
   * @private
   */
  function parseImportedLog(importData) {
    const parsed = window.FoxLog.logParser.parse(importData.content, {
      Id: importData.id,
      Operation: importData.filename,
      StartTime: importData.date,
      Status: 'Import',
      LogLength: importData.size
    });

    // The root node's duration comes from the metadata, which an import lacks:
    // derive it from the log's own nanosecond counter so the diff doesn't
    // report the root as a huge timing change against the current log.
    const totalNs = parsed.lines.reduce((max, line) => Math.max(max, line.duration || 0), 0);
    parsed.metadata.duration = Math.round(totalNs / 1e6);

    return parsed;
  }

  /**
   * Execute diff between the imported file (reference) and the current log.
   * The imported file is side A and the current log side B, so a row "added"
   * (+) exists only in the current log and a row "removed" (−) only in the
   * imported file. The current log is shown in the left pane.
   * @private
   */
  async function runDiff(ctx, currentLog, importId) {
    const { callTreeBuilder, LogDiffView } = window.FoxLog;
    const { state } = ctx;
    const contentArea = ctx.pane.querySelector('.sf-diff-content-area');
    if (!contentArea) return;

    // A newer selection, a log navigation or closing the modal supersedes
    // this run: whichever finishes last must not overwrite the current one.
    const run = (state.run || 0) + 1;
    state.run = run;
    const isStale = () => state.run !== run;

    destroyView(state);

    contentArea.innerHTML = renderLoading(i18n.diffComputing || 'Computing diff...');

    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get('importedLogs', resolve);
      });
      const imports = result.importedLogs || [];
      const importData = imports.find(imp => imp.id === importId);

      if (!importData || !importData.content) {
        throw new Error('Imported log content not found');
      }

      const fileLog = parseImportedLog(importData);

      if (!callTreeBuilder) {
        throw new Error('CallTreeBuilder not available');
      }

      const [fileTree, currentTree] = await Promise.all([
        callTreeBuilder.buildTree(fileLog),
        callTreeBuilder.buildTree(currentLog)
      ]);
      if (isStale()) return;

      const diffResult = await runDiffWorker(fileTree, currentTree);
      if (isStale()) return;

      contentArea.innerHTML = '<div class="sf-diff-view-container"></div>';
      const container = contentArea.querySelector('.sf-diff-view-container');

      const metaA = {
        label: i18n.diffLabelFile || 'Reference file',
        onlyLabel: i18n.diffOnlyInFile || 'Only in the file',
        filename: importData.filename || 'File'
      };
      const metaB = {
        label: i18n.diffLabelCurrent || 'Current log',
        onlyLabel: i18n.diffOnlyInCurrent || 'Only in the current log',
        filename: currentLog.metadata?.operation || 'Log'
      };

      const diffView = new LogDiffView(container, diffResult, metaA, metaB, { leftSide: 'b' });
      diffView.render();
      state.view = diffView;

      logger.success('Diff view rendered');
    } catch (error) {
      logger.error('Diff computation failed', error);
      if (isStale()) return; // another run is in charge of the content now

      contentArea.innerHTML = renderErrorState(i18n.diffError || 'Diff computation error', error.message);
    }
  }

  /**
   * Run diff in a Web Worker with timeout
   * @private
   */
  async function runDiffWorker(treeA, treeB) {
    const timeout = window.FoxLog.CONFIG?.DIFF_WORKER_TIMEOUT ?? 10000;

    // Loaded by URL on an extension page (the "Open in a new tab" viewer), from a Blob URL
    // in the content script (see window.FoxLog.createWorker in src/core/constants.js)
    const { worker, release } = await window.FoxLog.createWorker('src/workers/log-diff-worker.js');

    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();

      const timer = setTimeout(() => {
        worker.terminate();
        release();
        reject(new Error(i18n.diffTimeout || 'Diff computation timed out'));
      }, timeout);

      worker.onmessage = (event) => {
        clearTimeout(timer);
        worker.terminate();
        release();
        if (event.data.type === 'error') {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data.result);
        }
      };

      worker.onerror = (error) => {
        clearTimeout(timer);
        worker.terminate();
        release();
        reject(error);
      };

      worker.postMessage({ type: 'diff', treeA, treeB, requestId });
    });
  }

  window.FoxLog.modalTabs.register({
    id: 'diff',
    order: 60,
    icon: 'shuffle',
    label: () => i18n.diffTab || 'Diff',
    render: renderDiffTab,
    setup: armDiffTab,

    onActivate(ctx) {
      if (ctx.state.init) ctx.state.init();
    },

    // The shell already put an empty picker back: drop the old diff, re-arm for the new log
    onLogChange(ctx) {
      destroyView(ctx.state);
      armDiffTab(ctx);
    },

    // Bump the run token so a diff still in flight (awaiting the trees or the
    // worker) sees itself as stale and leaves the closed modal alone.
    destroy(ctx) {
      ctx.state.run = (ctx.state.run || 0) + 1;
      destroyView(ctx.state);
    }
  });

  logger.log('[FoxLog] Diff tab loaded');
})();
