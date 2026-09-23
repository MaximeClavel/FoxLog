// src/ui/panel-manager.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;

  class PanelManager {
    constructor() {
      this.panel = null;
      this.isOpen = false;
      this.currentPage = 1;
      this.logsPerPage = 4;
      this.allLogs = [];
      this.logAnalysis = new Map();
      this.usersCache = [];
      this.selectedUserId = null;
      this.locale = navigator.language || 'en-US';
      this.debugStatus = null;
      this.statusMessageTimeout = null;
    }

    create() {
      if (this.panel) {
        logger.warn('[FoxLog] Panel already exists');
        return;
      }

      this.panel = document.createElement('div');
      this.panel.id = 'sf-debug-panel';
      this.panel.className = 'sf-panel-closed';
      this.panel.setAttribute('role', 'dialog');
      this.panel.setAttribute('aria-label', 'FoxLog');
      this.panel.tabIndex = -1;
      this.panel.innerHTML = this._getTemplate();

      document.body.appendChild(this.panel);
      this._attachEventListeners();

      logger.log('[FoxLog] Panel created');
    }

    toggle() {
      this.isOpen = !this.isOpen;
      this.panel.className = this.isOpen ? 'sf-panel-open' : 'sf-panel-closed';
      if (this.isOpen) {
        this.panel.focus({ preventScroll: true });
      }
      logger.log(`Panel ${this.isOpen ? 'opened' : 'closed'}`);
    }

    /**
     * load users into the picklist
     */
    async loadUsers(currentUserId = null) {
      const { salesforceAPI, logger } = window.FoxLog;
      const userSelect = this.panel.querySelector('#sf-user-select');
      
      if (!userSelect) {
        logger.error('User select not found');
        return;
      }

      try {
        userSelect.disabled = true;
        userSelect.innerHTML = `<option>${i18n.loading || 'Loading...'}</option>`;
        this.showLoading();
        
        logger.log('Fetching users...');
        // Pass currentUserId to ensure current user is always in the list
        const users = await salesforceAPI.fetchUsersWithLogs(currentUserId);
        
        logger.log(`Received ${users.length} users`);
        this.usersCache = users;

        if (users.length === 0) {
          userSelect.innerHTML = `<option value="">${i18n.noUsersFound || 'No users found'}</option>`;
          this.hideLoading();
          logger.warn('No users found');

          const container = this.panel.querySelector('#sf-logs-list');
          if (container) {
            container.innerHTML = `
              <div class="sf-empty-state">
                <div class="sf-empty-icon sf-empty-icon--warning">${window.FoxLog.icon('alert-triangle', { size: 22 })}</div>
                <p class="sf-empty-title">${i18n.noUsersFound || 'No users found'}</p>
                <p>${i18n.noApexLogs || 'No Apex logs found.'}</p>
                <p class="sf-hint">${window.FoxLog.icon('lightbulb')} ${i18n.ensureYouHave || 'Make sure you have:'}</p>
                <ul class="sf-empty-list">
                  <li>${i18n.apexLogs || 'Apex logs'}</li>
                  <li>${i18n.activeTraceFlag || 'Or an active TraceFlag'}</li>
                  <li>${i18n.requiredPermissions || 'Required permissions'}</li>
                </ul>
              </div>
            `;
          }
          return;
        }

        this.hideLoading();

        const options = users.map(user => {
          const selected = user.id === currentUserId ? 'selected' : '';
          
          // Plain marker for quick scanning (native <option> text can't render icons/color)
          const marker = (user.hasTraceFlag || user.logCount > 0) ? '●' : '○';

          // Add "(You)" indicator for current user
          const youIndicator = user.isCurrentUser ? ` (${i18n.you || 'You'})` : '';
          const escapeHtml = window.FoxLog.escapeHtml || ((s) => s);
          let label = `${marker} ${escapeHtml(user.name)}${youIndicator}`;
          
          if (user.hasTraceFlag) {
            label += ` [${escapeHtml(user.debugLevel)}]`;
          }
          
          if (user.logCount > 0) {
            label += ` (${user.logCount} log${user.logCount > 1 ? 's' : ''})`;
          } else if (user.hasTraceFlag) {
            label += ` (0 logs)`;
          }
          
          return `<option value="${escapeHtml(user.id)}" ${selected}>${label}</option>`;
        }).join('');

        userSelect.innerHTML = options;
        userSelect.disabled = false;

        if (!currentUserId && users.length > 0) {
          this.selectedUserId = users[0].id;
          userSelect.value = users[0].id;
        } else {
          userSelect.value = currentUserId;
          this.selectedUserId = currentUserId;
        }

        // Update debug status
        await this.updateDebugStatus(this.selectedUserId);

        logger.success(`Loaded ${users.length} users`);
      } catch (error) {
        logger.error('Failed to load users', error);
        userSelect.innerHTML = `<option value="">${i18n.loadingError || 'Error loading logs'}</option>`;
        userSelect.disabled = true;
        this.hideLoading();
      }
    }

    /**
     * Update debug status
     */
    async updateDebugStatus(userId) {
      if (!userId) return;

      const { debugLevelManager } = window.FoxLog;
      if (!debugLevelManager) {
        logger.warn('Debug Level Manager not available');
        return;
      }

      const statusContainer = this.panel.querySelector('#sf-debug-status');
      const debugToggle = this.panel.querySelector('#sf-debug-logs-toggle');
      
      if (!statusContainer) return;

      try {
        statusContainer.textContent = i18n.loading || 'Loading...';
        if (debugToggle) {
          debugToggle.disabled = true;
        }

        const status = await debugLevelManager.getDebugStatus(userId);
        this.debugStatus = status;

        if (debugToggle) {
          debugToggle.checked = status.enabled;
          debugToggle.disabled = false;
        }

        statusContainer.innerHTML = `
          <span class="${status.className}">
            ${status.icon} ${status.message}
          </span>
        `;

        logger.log('Debug status updated:', status);
      } catch (error) {
        logger.error('Failed to update debug status', error);
        statusContainer.textContent = i18n.error || 'Error';
        if (debugToggle) {
          debugToggle.disabled = false;
        }
      }
    }

    async toggleDebugLogs() {
      const userId = this.selectedUserId;
      if (!userId) {
        this._showStatusMessage(i18n.noUserSelected || 'No user selected', 'warning');
        return;
      }

      const { debugLevelManager } = window.FoxLog;
      if (!debugLevelManager) {
        this._showStatusMessage(i18n.debugManagerUnavailable || 'Debug manager unavailable', 'error');
        return;
      }

      const debugToggle = this.panel.querySelector('#sf-debug-logs-toggle');
      const statusContainer = this.panel.querySelector('#sf-debug-status');

      try {
        if (debugToggle) debugToggle.disabled = true;
        statusContainer.textContent = i18n.processing || 'Processing...';
        this.showLoading();
        this._showStatusMessage(i18n.processing || 'Processing...', 'info');

        const result = await debugLevelManager.toggleDebugLogs(userId, 60);

        if (result.success) {

          if (result.enabled) {
            this._showStatusMessage(i18n.debugLogsEnabled || 'Debug logs enabled (60min)', 'success');
            logger.success('Debug logs enabled for user:', userId);
          } else {
            this._showStatusMessage(i18n.debugLogsDisabled || 'Debug logs disabled', 'success');
            logger.success('Debug logs disabled for user:', userId);
          }

          // Refresh status
          document.dispatchEvent(new CustomEvent('foxlog:refresh'));
          await this.updateDebugStatus(userId);

          const finalMessage = result.enabled 
            ? (i18n.debugLogsEnabledShort || 'Debug logs enabled')
            : (i18n.debugLogsDisabledShort || 'Debug logs disabled');
          this._showStatusMessage(finalMessage, 'success');
          
        } else {
          throw new Error(result.error || 'Unknown error');
        }

      } catch (error) {
        logger.error('Failed to toggle debug logs', error);
        this._showStatusMessage((i18n.errorPrefix || 'Error:') + ' ' + error.message, 'error');

        if (debugToggle) {
          debugToggle.checked = !debugToggle.checked;
          debugToggle.disabled = false;
        }
        statusContainer.textContent = i18n.error || 'Error';
      }
      this.hideLoading();
    }

    /**
     * Show a transient message in the status line
     * @param {string} message
     * @param {'success'|'error'|'warning'|'info'} type
     * @param {{label: string, onClick: Function}} [action] - Optional inline button (e.g. Undo)
     */
    showStatusMessage(message, type = 'info', action = null) {
      this._showStatusMessage(message, type, action);
    }

    _showStatusMessage(message, type = 'info', action = null) {
      const statusIndicator = this.panel.querySelector('#sf-status-indicator');
      const statusText = this.panel.querySelector('#sf-status-text');
      const statusAction = this.panel.querySelector('#sf-status-action');

      if (!statusIndicator || !statusText) return;

      if (this.statusMessageTimeout) {
        clearTimeout(this.statusMessageTimeout);
      }

      statusIndicator.className = 'sf-status-disconnected';
      
      switch (type) {
        case 'success':
          statusIndicator.className = 'sf-status-success';
          break;
        case 'error':
          statusIndicator.className = 'sf-status-error';
          break;
        case 'warning':
          statusIndicator.className = 'sf-status-warning';
          break;
        case 'info':
          statusIndicator.className = 'sf-status-info';
          break;
      }

      statusText.textContent = message;

      if (statusAction) {
        statusAction.hidden = !action;
        statusAction.textContent = action?.label || '';
        statusAction.onclick = action
          ? () => { this.resetStatusMessage(); action.onClick(); }
          : null;
      }

      // Auto-clear after 5 seconds (longer when the message offers an action)
      this.statusMessageTimeout = setTimeout(() => this.resetStatusMessage(), action ? 8000 : 5000);
    }

    /** Put the status line back to "Ready", dropping any pending action (e.g. Undo) */
    resetStatusMessage() {
      clearTimeout(this.statusMessageTimeout);
      const statusIndicator = this.panel.querySelector('#sf-status-indicator');
      const statusText = this.panel.querySelector('#sf-status-text');
      const statusAction = this.panel.querySelector('#sf-status-action');

      if (statusIndicator) statusIndicator.className = 'sf-status-disconnected';
      if (statusText) statusText.textContent = i18n.ready || 'Ready';
      if (statusAction) {
        statusAction.hidden = true;
        statusAction.onclick = null;
      }
    }

    getSelectedUserId() {
      const userSelect = this.panel.querySelector('#sf-user-select');
      return userSelect?.value || this.selectedUserId;
    }

    /**
     * @param {Array} logs - Logs to list (cleared ones last, when shown)
     * @param {Map|null} analysisResults
     * @param {boolean} preservePage
     * @param {{visibleCount: number, clearedCount: number, clearedOn: number|null, showCleared: boolean}} [clearState]
     *   How many of `logs` are regular logs, and how many logs the last Clear hid
     */
    async updateLogList(logs, analysisResults = null, preservePage = false, clearState = null) {
      const previousLogsCount = this.allLogs.length;
      const previousPage = this.currentPage;

      this.allLogs = logs;
      this.clearState = clearState || { visibleCount: logs.length, clearedCount: 0, clearedOn: null, showCleared: false };
      
      if (!preservePage) {
        const hasNewLogs = logs.length !== previousLogsCount;
        if (hasNewLogs) {
          this.currentPage = 1;
        } else {
          this.currentPage = previousPage;
        }
      }

      const totalPages = Math.ceil(logs.length / this.logsPerPage);
      if (this.currentPage > totalPages) {
        this.currentPage = Math.max(1, totalPages);
      }

      if (analysisResults) {
        this.logAnalysis = analysisResults;
      }

      const container = this.panel.querySelector('#sf-logs-list');
      if (!container) return;

      if (logs.length === 0) {
        this._showEmptyState();
      } else {
        this._renderPaginatedLogs();
      }
      this._renderClearedBar();
      this.updateLastRefreshTime();
    }

    _renderPaginatedLogs() {
      const container = this.panel.querySelector('#sf-logs-list');
      const start = (this.currentPage - 1) * this.logsPerPage;
      const end = start + this.logsPerPage;
      const logsToDisplay = this.allLogs.slice(start, end);
      const visibleCount = this.clearState?.visibleCount ?? this.allLogs.length;

      container.innerHTML = logsToDisplay.map((log, i) => {
        const isCleared = start + i >= visibleCount;
        // Label the cleared block where it starts, and again at the top of later pages
        const separator = isCleared && (start + i === visibleCount || i === 0)
          ? this._createClearedSeparator()
          : '';
        return separator + this._createLogItem(log, isCleared);
      }).join('');
      this._renderPagination();
    }

    _createClearedSeparator() {
      const clearedOn = this.clearState?.clearedOn;
      const date = clearedOn
        ? new Date(clearedOn).toLocaleString(this.locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '';
      const label = (i18n.clearedSeparator || 'Cleared {date}').replace('{date}', date);
      return `<div class="sf-cleared-separator" role="separator" title="${i18n.clearedBarHint || 'Hidden in FoxLog only: they are still in Salesforce'}"><span>${label}</span></div>`;
    }

    /**
     * Bar under the list: how many logs the last Clear hid, with Show/Hide and Restore
     * @private
     */
    _renderClearedBar() {
      const bar = this.panel.querySelector('#sf-cleared-bar');
      if (!bar) return;

      const { clearedCount = 0, showCleared = false } = this.clearState || {};
      bar.hidden = clearedCount === 0;
      if (clearedCount === 0) {
        bar.innerHTML = '';
        return;
      }

      const countLabel = clearedCount === 1
        ? (i18n.clearedCountOne || '1 cleared log')
        : (i18n.clearedCount || '{count} cleared logs').replace('{count}', clearedCount);
      const hint = i18n.clearedBarHint || 'Hidden in FoxLog only: they are still in Salesforce';
      const toggleLabel = showCleared ? (i18n.hideClearedLogs || 'Hide') : (i18n.showClearedLogs || 'Show');
      const restoreLabel = i18n.restoreClearedLogs || 'Restore';

      bar.innerHTML = `
        <span class="sf-cleared-bar-label" title="${hint}">
          ${window.FoxLog.icon('eye-off', { size: 13 })}
          <span>${countLabel}</span>
          <span class="sf-sr-only">(${hint})</span>
        </span>
        <span class="sf-cleared-bar-actions">
          <button type="button" class="sf-cleared-bar-btn" data-cleared-action="toggle" aria-pressed="${showCleared}">
            ${window.FoxLog.icon(showCleared ? 'eye-off' : 'eye', { size: 13 })} ${toggleLabel}
          </button>
          <button type="button" class="sf-cleared-bar-btn" data-cleared-action="restore" title="${i18n.restoreClearedTooltip || 'Put the cleared logs back in the list'}">
            ${window.FoxLog.icon('rotate-ccw', { size: 13 })} ${restoreLabel}
          </button>
        </span>
      `;
    }

    _renderPagination() {
      const totalPages = Math.ceil(this.allLogs.length / this.logsPerPage);
      
      if (totalPages <= 1) {
        const paginationContainer = this.panel.querySelector('.sf-pagination');
        if (paginationContainer) {
          paginationContainer.style.display = 'none';
        }
        return;
      }

      let paginationContainer = this.panel.querySelector('.sf-pagination');
      
      if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.className = 'sf-pagination';
        
        const logsContainer = this.panel.querySelector('#sf-logs-list');
        logsContainer.parentNode.insertBefore(paginationContainer, logsContainer.nextSibling);
      }

      paginationContainer.style.display = 'flex';
      const pageLabel = i18n.page || 'Page';
      const logsLabel = i18n.logs || 'logs';
      paginationContainer.innerHTML = `
        <button type="button" class="sf-pagination-btn sf-pagination-prev" aria-label="${i18n.previousPage || 'Previous page'}" ${this.currentPage === 1 ? 'disabled' : ''}>
          ${window.FoxLog.icon('chevron-left', { size: 16 })}
        </button>
        
        <span class="sf-pagination-info">
          ${pageLabel} ${this.currentPage} / ${totalPages}
          <span class="sf-pagination-count">(${this.allLogs.length} ${logsLabel})</span>
        </span>
        
        <button type="button" class="sf-pagination-btn sf-pagination-next" aria-label="${i18n.nextPage || 'Next page'}" ${this.currentPage === totalPages ? 'disabled' : ''}>
          ${window.FoxLog.icon('chevron-right', { size: 16 })}
        </button>
      `;

      paginationContainer.querySelector('.sf-pagination-prev')?.addEventListener('click', () => {
        this.goToPage(this.currentPage - 1);
      });

      paginationContainer.querySelector('.sf-pagination-next')?.addEventListener('click', () => {
        this.goToPage(this.currentPage + 1);
      });
    }

    goToPage(page) {
      const totalPages = Math.ceil(this.allLogs.length / this.logsPerPage);
      
      if (page < 1 || page > totalPages) return;
      
      this.currentPage = page;
      this._renderPaginatedLogs();

      const container = this.panel.querySelector('#sf-logs-list');
      if (container) {
        container.scrollTop = 0;
      }
    }

    showLoading() {
      const container = this.panel.querySelector('#sf-logs-list');
      if (container) {
        const panelContent = container.closest('.sf-panel-content');
        if (panelContent) {
          panelContent.style.minHeight = '250px';
        }

        container.innerHTML = `
          <div class="sf-loading-overlay" role="status" aria-busy="true" aria-label="${i18n.loading || 'Loading...'}">
            <div class="sf-skeleton-card"></div>
            <div class="sf-skeleton-card"></div>
            <div class="sf-skeleton-card"></div>
          </div>
        `;
      }
    }

    hideLoading() {
      const container = this.panel.querySelector('#sf-logs-list');
      if (!container) return;
      
      const loadingOverlay = container.querySelector('.sf-loading-overlay');
      if (loadingOverlay) {
        loadingOverlay.remove();
      }
    }

    showError(message) {
      const container = this.panel.querySelector('#sf-logs-list');
      if (container) {
        container.innerHTML = `
          <div class="sf-empty-state">
            <div class="sf-empty-icon sf-empty-icon--danger">${window.FoxLog.icon('alert-triangle', { size: 22 })}</div>
            <p class="sf-empty-title">${i18n.error || 'Error'}</p>
            <p>${message}</p>
          </div>
        `;
      }
    }

    _getTemplate() {
      const ICONS = window.FoxLog.ICONS || {};
      
      return `
        <div class="sf-panel-header">
          <div class="sf-panel-brand">
            <img src="${ICONS.FOXLOG || ''}" alt="" width="26" height="26">
            <h3>FoxLog</h3>
          </div>
          <div class="sf-panel-controls">
            <button type="button" id="sf-refresh-btn" title="${i18n.refresh || 'Refresh'}" aria-label="${i18n.refresh || 'Refresh'}">${window.FoxLog.icon('refresh-cw', { size: 16 })}</button>
            <button type="button" id="sf-clear-logs-btn" title="${i18n.clearTooltip || 'Clear the list (logs stay in Salesforce)'}" aria-label="${i18n.clearTooltip || 'Clear the list (logs stay in Salesforce)'}">${window.FoxLog.icon('eye-off', { size: 16 })}</button>
            <button type="button" id="sf-close-panel" title="${i18n.close || 'Close'}" aria-label="${i18n.close || 'Close'}">${window.FoxLog.icon('x', { size: 16 })}</button>
          </div>
        </div>

        <div class="sf-panel-tabs" role="tablist" aria-label="FoxLog">
          <button type="button" class="sf-panel-tab-btn active" id="sf-tabbtn-salesforce" role="tab" aria-selected="true" aria-controls="sf-tab-salesforce" data-panel-tab="salesforce">${window.FoxLog.icon('cloud', { className: 'foxlog-icon--salesforce' })} ${i18n.tabSalesforce || 'Salesforce'}</button>
          <button type="button" class="sf-panel-tab-btn" id="sf-tabbtn-import" role="tab" aria-selected="false" aria-controls="sf-tab-import" tabindex="-1" data-panel-tab="import">${window.FoxLog.icon('folder')} ${i18n.tabImport || 'Files'}</button>
        </div>

        <div id="sf-tab-salesforce" class="sf-panel-tab-content active" role="tabpanel" aria-labelledby="sf-tabbtn-salesforce">
          <div class="sf-panel-status" role="status" aria-live="polite">
            <span id="sf-status-indicator" class="sf-status-disconnected" aria-hidden="true">●</span>
            <span id="sf-status-text">${i18n.ready || 'Ready'}</span>
            <button type="button" id="sf-status-action" class="sf-status-action" hidden></button>
          </div>
          <div class="sf-panel-filters">
            <select id="sf-user-select" class="sf-user-picklist" aria-label="${i18n.selectUser || 'Select a user'}" title="${i18n.userPicklistLegend || '● = TraceFlag or logs available | ○ = No activity'}">
              <option value="">${i18n.loading || 'Loading...'}</option>
            </select>
          </div>
          
          <div class="sf-debug-control">
            <label class="sf-debug-toggle-label">
              <input type="checkbox" id="sf-debug-logs-toggle" class="sf-debug-toggle-input" role="switch" disabled>
              <span class="sf-debug-toggle-slider"></span>
              <span class="sf-debug-toggle-text">${i18n.debugLogs || 'Debug Logs'}</span>
            </label>
            <span id="sf-debug-status" class="sf-debug-status" aria-live="polite">
              ● ${i18n.unknown || 'Unknown'}
            </span>
          </div>
          
          <div class="sf-panel-content" id="sf-logs-list">
            <div class="sf-empty-state">
              <div class="sf-empty-icon">${window.FoxLog.icon('database', { size: 22 })}</div>
              <p class="sf-empty-title">${i18n.welcome || 'Welcome to FoxLog!'}</p>
              <p class="sf-hint">${i18n.selectUser || 'Select a user'}</p>
            </div>
          </div>
          <div class="sf-cleared-bar" id="sf-cleared-bar" hidden></div>
        </div>

        <div id="sf-tab-import" class="sf-panel-tab-content" role="tabpanel" aria-labelledby="sf-tabbtn-import">
          <div class="sf-import-zone" id="sf-import-dropzone" role="button" tabindex="0" aria-label="${i18n.importFile || 'Import a file'}">
            <div class="sf-import-zone-icon">${window.FoxLog.icon('upload-cloud', { size: 24 })}</div>
            <div class="sf-import-zone-text">
              <strong>${i18n.importFile || 'Import a file'}</strong><br>
              ${i18n.importDropOrClick || 'Drag & drop a .txt or .log file here, or click to browse'}
            </div>
            <input type="file" id="sf-import-file-input" accept=".txt,.log" style="display:none;">
          </div>
          
          <div class="sf-import-storage" id="sf-import-storage">
            <div class="sf-import-storage-bar">
              <div class="sf-import-storage-fill" id="sf-import-storage-fill" style="width:0%"></div>
            </div>
            <span class="sf-import-storage-text" id="sf-import-storage-text">0 KB ${i18n.importStorageLimit || 'of 10 MB'}</span>
          </div>
          
          <div class="sf-import-history" id="sf-import-history">
            <div class="sf-import-history-header">
              <span class="sf-import-history-title">${i18n.importHistory || 'Import History'}</span>
              <button class="sf-import-delete-all-btn" id="sf-import-delete-all" style="display:none;">
                ${window.FoxLog.icon('trash', { size: 12 })} ${i18n.importDeleteAll || 'Delete all'}
              </button>
            </div>
            <div id="sf-import-list">
              <div class="sf-import-empty">
                <p>${window.FoxLog.icon('inbox')} ${i18n.importNoHistory || 'No imported logs'}</p>
                <p class="sf-hint">${i18n.importNoHistoryHint || 'Import a log file to get started'}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="sf-panel-footer">
          <span id="sf-version-display">v${window.FoxLog.VERSION}</span>
          <a href="https://ko-fi.com/maxclv" target="_blank" rel="noopener noreferrer" class="sf-kofi-link" title="${i18n.supportOnKofi || 'Support FoxLog on Ko-fi'}">
            <img src="${ICONS.KOFI || ''}" alt="Ko-fi" class="sf-kofi-logo">
          </a>
          <span id="sf-last-update">${i18n.neverUpdated || 'Never updated'}</span>
        </div>
      `;
    }

    _attachEventListeners() {
      this.panel.querySelector('#sf-refresh-btn')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('foxlog:refresh'));
      });
      
      this.panel.querySelector('#sf-clear-logs-btn')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('foxlog:clear'));
      });

      this.panel.querySelector('#sf-cleared-bar')?.addEventListener('click', (e) => {
        const action = e.target.closest('[data-cleared-action]')?.dataset.clearedAction;
        if (action === 'toggle') {
          document.dispatchEvent(new CustomEvent('foxlog:toggleCleared'));
        } else if (action === 'restore') {
          document.dispatchEvent(new CustomEvent('foxlog:restoreCleared'));
        }
      });
      
      this.panel.querySelector('#sf-close-panel')?.addEventListener('click', () => {
        this.toggle();
      });

      this.panel.querySelector('#sf-user-select')?.addEventListener('change', async (e) => {
        this.selectedUserId = e.target.value;
        
        await this.updateDebugStatus(this.selectedUserId);
        
        document.dispatchEvent(new CustomEvent('foxlog:userChanged', {
          detail: { userId: this.selectedUserId }
        }));
      });

      this.panel.querySelector('#sf-debug-logs-toggle')?.addEventListener('change', async (e) => {
        await this.toggleDebugLogs();
      });
      
      this.panel.querySelector('#sf-logs-list')?.addEventListener('click', (e) => {
        const logItem = e.target.closest('.sf-log-item');
        if (logItem) {
          const logId = logItem.dataset.logId;
          if (logId) {
            document.dispatchEvent(new CustomEvent('foxlog:viewLog', {
              detail: { logId }
            }));
          }
        }
      });
      
      // Panel tab switching
      this.panel.querySelectorAll('.sf-panel-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tabId = btn.dataset.panelTab;
          this._switchPanelTab(tabId);
        });
      });

      this.panel.querySelector('.sf-panel-tabs')?.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const tabs = [...this.panel.querySelectorAll('.sf-panel-tab-btn')];
        const step = e.key === 'ArrowRight' ? 1 : tabs.length - 1;
        const next = tabs[(tabs.indexOf(document.activeElement) + step) % tabs.length];
        next.focus();
        this._switchPanelTab(next.dataset.panelTab);
      });

      this.panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.toggle();
          document.getElementById('sf-foxlog-toggle')?.focus();
        }
      });

      // Cards are role="button" divs: activate them like buttons, but ignore keys aimed at nested controls
      ['#sf-logs-list', '#sf-import-list'].forEach(selector => {
        this.panel.querySelector(selector)?.addEventListener('keydown', (e) => {
          const isActivationKey = e.key === 'Enter' || e.key === ' ';
          if (isActivationKey && e.target.matches('.sf-log-item, .sf-import-item-info')) {
            e.preventDefault();
            e.target.click();
          }
        });
      });
      
      // Import: dropzone click
      const dropzone = this.panel.querySelector('#sf-import-dropzone');
      const fileInput = this.panel.querySelector('#sf-import-file-input');
      
      if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
          }
        });
        
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            this._handleImportFile(file);
            fileInput.value = '';
          }
        });
        
        // Drag & drop
        dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropzone.classList.add('sf-import-dragover');
        });
        
        dropzone.addEventListener('dragleave', () => {
          dropzone.classList.remove('sf-import-dragover');
        });
        
        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.classList.remove('sf-import-dragover');
          const file = e.dataTransfer.files[0];
          if (file) {
            this._handleImportFile(file);
          }
        });
      }
      
      // Import: delete all
      this.panel.querySelector('#sf-import-delete-all')?.addEventListener('click', () => {
        this._deleteAllImports();
      });
      
      // Import: click on history item
      this.panel.querySelector('#sf-import-list')?.addEventListener('click', (e) => {
        // Delete button
        const deleteBtn = e.target.closest('.sf-import-item-delete');
        if (deleteBtn) {
          e.stopPropagation();
          const importId = deleteBtn.dataset.importId;
          if (importId) this._deleteImport(importId);
          return;
        }
        // Click on item -> open modal
        const item = e.target.closest('.sf-import-item');
        if (item) {
          const importId = item.dataset.importId;
          if (importId) {
            document.dispatchEvent(new CustomEvent('foxlog:viewImportedLog', {
              detail: { importId }
            }));
          }
        }
      });
      
      // Load import history on startup
      this._loadImportHistory();

      // Refresh import list when a file is imported from the Diff tab
      document.addEventListener('foxlog:importListChanged', () => {
        this._loadImportHistory();
      });
    }

    _showEmptyState() {
      const container = this.panel.querySelector('#sf-logs-list');
      const selectedUser = this.usersCache.find(u => u.id === this.selectedUserId);
      const userName = selectedUser?.name || (i18n.thisUser || 'this user');

      const paginationContainer = this.panel.querySelector('.sf-pagination');
      if (paginationContainer) {
        paginationContainer.style.display = 'none';
      }

      // Everything was cleared: say so, since "No logs" alone reads as if they were deleted
      if (this.clearState?.clearedCount > 0) {
        container.innerHTML = `
          <div class="sf-empty-state">
            <div class="sf-empty-icon">${window.FoxLog.icon('eye-off', { size: 22 })}</div>
            <p class="sf-empty-title">${i18n.noNewLogs || 'No new logs'}</p>
            <p class="sf-hint">${i18n.clearedEmptyHint || 'Cleared logs are only hidden here, they stay in Salesforce.'}</p>
          </div>
        `;
        return;
      }

      let hint = i18n.clickRefresh || 'Click Refresh';
      
      if (selectedUser?.hasTraceFlag && selectedUser?.logCount === 0) {
        const traceMessage = i18n.traceFlagActive || 'TraceFlag active but no logs. Execute Apex code.';
        hint = `${window.FoxLog.icon('info', { className: 'foxlog-icon--warning' })} ${traceMessage}`;
      }
      
      container.innerHTML = `
        <div class="sf-empty-state">
          <div class="sf-empty-icon">${window.FoxLog.icon('inbox', { size: 22 })}</div>
          <p class="sf-empty-title">${(i18n.noLogsFor || 'No logs for')} ${userName}</p>
          <p class="sf-hint">${hint}</p>
        </div>
      `;
    }

    _getStatusTone(status) {
      if (!status || status === 'INFO') return 'neutral';
      return status === 'Success' ? 'success' : 'danger';
    }

    _getStatusLabel(status) {
      return status.split(':')[0].trim() || status;
    }

    _createLogItem(log, isCleared = false) {
      const escapeHtml = window.FoxLog.escapeHtml || ((value) => value);
      const time = this._formatTime(log.StartTime);
      const status = log.Status || 'INFO';
      const tone = this._getStatusTone(status);

      const analysis = this.logAnalysis.get(log.Id);
      const hasError = analysis?.hasError || false;
      const errorCount = analysis?.errorCount || 0;

      const errorLabel = errorCount === 1 ? (i18n.error || 'Error') : (i18n.errors || 'Errors');
      const errorBadge = hasError
        ? `<span class="sf-log-error-badge" title="${errorCount} ${errorLabel}">${window.FoxLog.icon('alert-circle', { size: 12 })} ${errorCount}</span>`
        : '';
      const operation = escapeHtml(log.Operation || 'Unknown');

      return `
        <div class="sf-log-entry sf-log-item sf-log-tone-${tone} ${hasError ? 'sf-log-has-error' : ''} ${isCleared ? 'sf-log-cleared' : ''}" data-log-id="${escapeHtml(log.Id)}" role="button" tabindex="0">
          <div class="sf-log-header">
            <span class="sf-log-operation" title="${operation}">${operation}</span>
            <span class="sf-log-time">${time}</span>
          </div>
          <div class="sf-log-body">
            <span class="sf-log-level sf-log-level--${tone}" title="${escapeHtml(status)}">${escapeHtml(this._getStatusLabel(status))}</span>
            ${errorBadge}
            <span class="sf-log-meta">${window.FoxLog.formatDuration(log.DurationMilliseconds || 0)} · ${this._formatSize(log.LogLength || 0)}</span>
          </div>
        </div>
      `;
    }

    _formatTime(timestamp) {
      return new Date(timestamp).toLocaleTimeString(this.locale);
    }

    _formatSize(bytes) {
      if (bytes < 1024) return `${bytes} B`;
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    updateLastRefreshTime() {
      const lastUpdateElement = this.panel.querySelector('#sf-last-update');
      if (lastUpdateElement) {
        const now = new Date();
        const timeString = now.toLocaleTimeString(this.locale, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        lastUpdateElement.textContent = `${i18n.lastUpdate || 'Last update:'} ${timeString}`;
      }
    }

    // ============================================
    // PANEL TABS
    // ============================================

    /**
     * Switch between panel tabs (salesforce / import)
     * @param {string} tabId - The tab to activate
     */
    _switchPanelTab(tabId) {
      // Update tab buttons
      this.panel.querySelectorAll('.sf-panel-tab-btn').forEach(btn => {
        const isActive = btn.dataset.panelTab === tabId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
        btn.tabIndex = isActive ? 0 : -1;
      });
      
      // Update tab content
      this.panel.querySelectorAll('.sf-panel-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `sf-tab-${tabId}`);
      });
      
      // Refresh import history when switching to import tab
      if (tabId === 'import') {
        this._loadImportHistory();
      }
      
      logger.log(`Panel tab switched to: ${tabId}`);
    }

    // ============================================
    // IMPORT FILE HANDLING
    // ============================================

    /**
     * Handle imported file
     * @param {File} file - The file to import
     * @private
     */
    _handleImportFile(file) {
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
      const validExtensions = ['.txt', '.log'];
      
      // Validate file type
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!validExtensions.includes(ext)) {
        this._showStatusMessage(i18n.importInvalidType || 'Invalid file type. Use .txt or .log', 'warning');
        return;
      }
      
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        this._showStatusMessage(i18n.importFileTooLarge || 'File too large (max 5 MB)', 'warning');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target.result;
        const importEntry = {
          id: 'imp_' + Date.now(),
          filename: file.name,
          date: new Date().toISOString(),
          size: file.size,
          content: content
        };
        
        await this._saveImport(importEntry);
        this._loadImportHistory();
        
        // Dispatch event to open modal with analysis
        document.dispatchEvent(new CustomEvent('foxlog:viewImportedLog', {
          detail: { importId: importEntry.id }
        }));
        
        this._showStatusMessage(i18n.importSuccess || 'Log imported successfully!', 'success');
        logger.success(`File imported: ${file.name} (${this._formatSize(file.size)})`);
      };
      
      reader.onerror = () => {
        this._showStatusMessage(i18n.importError || 'Import error', 'error');
        logger.error('Failed to read imported file');
      };
      
      reader.readAsText(file);
    }

    /**
     * Save import to chrome.storage.local, evicting oldest if > 10MB
     * @param {Object} entry - The import entry to save
     * @private
     */
    async _saveImport(entry) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['importedLogs'], (result) => {
          const imports = result.importedLogs || [];
          const MAX_STORAGE = 10 * 1024 * 1024; // 10 MB
          
          // Add the new entry
          imports.unshift(entry);
          
          // Evict oldest entries until under limit
          let totalSize = imports.reduce((sum, imp) => sum + (imp.size || 0), 0);
          while (totalSize > MAX_STORAGE && imports.length > 1) {
            const removed = imports.pop();
            totalSize -= (removed.size || 0);
            logger.log(`Evicted old import: ${removed.filename}`);
          }
          
          chrome.storage.local.set({ importedLogs: imports }, resolve);
        });
      });
    }

    /**
     * Load and render import history
     * @private
     */
    _loadImportHistory() {
      chrome.storage.local.get(['importedLogs'], (result) => {
        const imports = result.importedLogs || [];
        this._renderImportHistory(imports);
        this._updateStorageBar(imports);
      });
    }

    /**
     * Render import history list
     * @param {Array} imports - Array of import entries
     * @private
     */
    _renderImportHistory(imports) {
      const listContainer = this.panel.querySelector('#sf-import-list');
      const deleteAllBtn = this.panel.querySelector('#sf-import-delete-all');
      if (!listContainer) return;
      
      if (imports.length === 0) {
        listContainer.innerHTML = `
          <div class="sf-import-empty">
            <p>${window.FoxLog.icon('inbox')} ${i18n.importNoHistory || 'No imported logs'}</p>
            <p class="sf-hint">${i18n.importNoHistoryHint || 'Import a log file to get started'}</p>
          </div>
        `;
        if (deleteAllBtn) deleteAllBtn.style.display = 'none';
        return;
      }
      
      if (deleteAllBtn) deleteAllBtn.style.display = 'inline-flex';
      const escapeHtml = window.FoxLog.escapeHtml || ((s) => s);
      
      listContainer.innerHTML = imports.map(imp => {
        const date = new Date(imp.date);
        const dateStr = date.toLocaleDateString(this.locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
        const timeStr = date.toLocaleTimeString(this.locale, { hour: '2-digit', minute: '2-digit' });
        
        return `
          <div class="sf-import-item" data-import-id="${escapeHtml(imp.id)}">
            <div class="sf-import-item-info" role="button" tabindex="0">
              <div class="sf-import-item-name">${window.FoxLog.icon('file', { className: 'foxlog-icon--muted' })} ${escapeHtml(imp.filename)}</div>
              <div class="sf-import-item-meta">${dateStr} ${timeStr} · ${this._formatSize(imp.size)}</div>
            </div>
            <button type="button" class="sf-import-item-delete" data-import-id="${escapeHtml(imp.id)}" title="${i18n.importDelete || 'Delete'}" aria-label="${i18n.importDelete || 'Delete'}">${window.FoxLog.icon('x')}</button>
          </div>
        `;
      }).join('');
    }

    /**
     * Update storage usage bar
     * @param {Array} imports - Array of import entries
     * @private
     */
    _updateStorageBar(imports) {
      const MAX_STORAGE = 10 * 1024 * 1024; // 10 MB
      const totalSize = imports.reduce((sum, imp) => sum + (imp.size || 0), 0);
      const percentage = Math.min((totalSize / MAX_STORAGE) * 100, 100);
      
      const fill = this.panel.querySelector('#sf-import-storage-fill');
      const text = this.panel.querySelector('#sf-import-storage-text');
      
      if (fill) {
        fill.style.width = percentage + '%';
        fill.classList.toggle('sf-storage-warning', percentage > 80);
      }
      
      if (text) {
        const usedStr = totalSize < 1024 * 1024
          ? (totalSize / 1024).toFixed(1) + ' KB'
          : (totalSize / (1024 * 1024)).toFixed(2) + ' MB';
        text.textContent = `${usedStr} ${i18n.importStorageLimit || 'of 10 MB'}`;
      }
    }

    /**
     * Delete a single import entry
     * @param {string} importId - The ID of the import to delete
     * @private
     */
    _deleteImport(importId) {
      chrome.storage.local.get(['importedLogs'], (result) => {
        const imports = (result.importedLogs || []).filter(imp => imp.id !== importId);
        chrome.storage.local.set({ importedLogs: imports }, () => {
          this._renderImportHistory(imports);
          this._updateStorageBar(imports);
          logger.log(`Import deleted: ${importId}`);
        });
      });
    }

    /**
     * Delete all imported logs
     * @private
     */
    _deleteAllImports() {
      chrome.storage.local.set({ importedLogs: [] }, () => {
        this._renderImportHistory([]);
        this._updateStorageBar([]);
        logger.success('All imports deleted');
      });
    }

    /**
     * Get an imported log by ID (for viewing)
     * @param {string} importId - The ID of the import
     * @returns {Promise<Object|null>} The import entry or null
     */
    getImportedLog(importId) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['importedLogs'], (result) => {
          const imports = result.importedLogs || [];
          resolve(imports.find(imp => imp.id === importId) || null);
        });
      });
    }
  }

  window.FoxLog.panelManager = new PanelManager();
  logger.log('[FoxLog] Panel Manager loaded');
})();