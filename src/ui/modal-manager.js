// src/ui/modal-manager.js (Full version)
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;
  
  class ModalManager {
    constructor() {
      this.currentModal = null;
      this.logger = window.FoxLog.logger;
      
      // Navigation state
      this.logsList = [];
      this.currentLogIndex = -1;
      this.isLoadingNavigation = false;
      this.onNavigate = null; // Callback for navigation
      
      // Listen for toast events from other components
      document.addEventListener('foxlog:showToast', (e) => {
        this._showToast(e.detail.message, e.detail.type || 'success');
      });
    }

    /**
     * Display a modal with the raw log content
     */
    showRawLog(content) {
      this.close();
      const modal = this._createModal();
      modal.innerHTML = `
        <div class="sf-modal-content">
          <div class="sf-modal-header">
            <h3>📄 ${i18n.rawLog || 'Raw Log'}</h3>
            <button class="sf-modal-close-btn">✕</button>
          </div>
          <div class="sf-modal-body">
            <pre class="sf-raw-log-content">${this._escapeHtml(content)}</pre>
          </div>
        </div>
      `;
      this._attachModal(modal);
      this.logger.success('Raw log modal displayed');
    }

    /**
     * Set the logs list for navigation
     * @param {Array} logs - Array of log metadata objects
     * @param {number} currentIndex - Index of the currently displayed log
     * @param {Function} onNavigate - Callback function(logId) when navigating
     */
    setLogsList(logs, currentIndex, onNavigate) {
      this.logsList = logs || [];
      this.currentLogIndex = currentIndex;
      this.onNavigate = onNavigate;
    }

    /**
     * Display a modal with the parsed log (tabs and filters)
     * @param {Object} parsedLog - The parsed log object
     * @param {Object} parser - The log parser instance
     * @param {boolean} updateOnly - If true, update existing modal content without closing
     */
    showParsedLog(parsedLog, parser, updateOnly = false) {
      const filterManager = window.FoxLog.filterManager;
      const summary = parser.getSummary(parsedLog);
      
      // If updateOnly and modal exists, just update the content
      if (updateOnly && this.currentModal) {
        this._updateModalContent(parsedLog, parser, summary);
        return;
      }
      
      this.close();
      
      const modal = this._createModal();
      modal.innerHTML = `
        <div class="sf-modal-content">
          <div class="sf-modal-header">
            <h3>📊 ${i18n.logAnalysis || 'Log Analysis'}</h3>
            ${this._renderNavigationButtons()}
            <button class="sf-modal-close-btn">×</button>
          </div>
          
          <div class="sf-modal-tabs">
            <button class="sf-tab-btn active" data-tab="summary">${i18n.summary || 'Summary'}</button>
            <button class="sf-tab-btn" data-tab="calls">${i18n.calls || 'Calls'}</button>
            <button class="sf-tab-btn" data-tab="raw">${i18n.rawLog || 'Raw Log'}</button>
          </div>
          
          <div class="sf-modal-body-tabs">
            <div id="tab-summary" class="sf-tab-content active">
              ${this._renderSummaryTab(summary, parsedLog)}
            </div>
            
            <div id="tab-calls" class="sf-tab-content">
              <div class="sf-calls-loading">
                <div class="sf-spinner"></div>
                <div class="sf-loading-text">${i18n.buildingCallTree || 'Building call tree...'}</div>
              </div>
            </div>

            <div id="tab-raw" class="sf-tab-content">
              ${this._renderRawTab(parsedLog)}
            </div>
          </div>
        </div>
      `;
      
      this._attachModal(modal);
      this._setupTabs(modal);
      this._setupCallsTab(modal, parsedLog);

      this._setupExportButtons(modal, parsedLog);
      
      this.logger.success('Parsed log modal with filters displayed');
    }

    /**
     * Update modal content without closing it (for navigation)
     * @private
     */
    _updateModalContent(parsedLog, parser, summary) {
      const modal = this.currentModal;
      if (!modal) return;
      
      const filterManager = window.FoxLog.filterManager;
      
      // Update navigation buttons
      const navContainer = modal.querySelector('.sf-modal-nav, .sf-nav-placeholder');
      if (navContainer) {
        const newNav = document.createElement('div');
        newNav.innerHTML = this._renderNavigationButtons();
        navContainer.replaceWith(newNav.firstElementChild);
        this._setupNavigation(modal);
      }
      
      // Update Summary tab
      const summaryTab = modal.querySelector('#tab-summary');
      if (summaryTab) {
        summaryTab.innerHTML = this._renderSummaryTab(summary, parsedLog);
      }
      
      // Reset Calls tab (will be rebuilt on click)
      const callsTab = modal.querySelector('#tab-calls');
      if (callsTab) {
        callsTab.innerHTML = `
          <div class="sf-calls-loading">
            <div class="sf-spinner"></div>
            <div class="sf-loading-text">${i18n.buildingCallTree || 'Building call tree...'}</div>
          </div>
        `;
        // Re-setup calls tab for the new log
        this._setupCallsTab(modal, parsedLog);
      }
      
      // Update Raw tab
      const rawTab = modal.querySelector('#tab-raw');
      if (rawTab) {
        rawTab.innerHTML = this._renderRawTab(parsedLog);
      }
      
      // Re-setup export buttons
      this._setupExportButtons(modal, parsedLog);
      
      this.logger.success('Modal content updated for navigation');
    }

    _setupExportButtons(modal, parsedLog) {
      // Export log brut (texte)
      const exportRawBtn = modal.querySelector('#export-raw-btn');
      if (exportRawBtn) {
        exportRawBtn.addEventListener('click', () => {
          this._exportRawLog(parsedLog);
        });
      }

      // Copier dans le presse-papier
      const copyBtn = modal.querySelector('#copy-raw-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          this._copyToClipboard(parsedLog.rawContent, copyBtn);
        });
      }
    }

    _exportRawLog(parsedLog) {
      try {
        const filename = this._generateFilename(parsedLog, 'txt');
        const blob = new Blob([parsedLog.rawContent], { type: 'text/plain' });
        this._downloadFile(blob, filename);
        this.logger.success('Raw log exported');
        this._showToast(`✅ ${i18n.exportSuccess || 'Exported successfully!'}`);
      } catch (error) {
        this.logger.error('Export failed', error);
        this._showToast(`❌ ${i18n.exportError || 'Export error'}`, 'error');
      }
    }

    async _copyToClipboard(text, button) {
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

        this.logger.success('Copied to clipboard');
        this._showToast(`✅ ${i18n.copySuccess || 'Copied to clipboard!'}`);
      } catch (error) {
        this.logger.error('Copy failed', error);
        this._showToast(`❌ ${i18n.copyError || 'Copy error'}`, 'error');
      }
    }

    _generateFilename(parsedLog, extension) {
      const date = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const operation = (parsedLog.metadata.operation || 'log')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 30);
      return `foxlog_${operation}_${date}.${extension}`;
    }

    _downloadFile(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    _showToast(message, type = 'success') {
      // Supprimer les anciens toasts
      const existingToast = document.querySelector('.sf-toast');
      if (existingToast) {
        existingToast.remove();
      }

      const toast = document.createElement('div');
      toast.className = `sf-toast sf-toast-${type}`;
      toast.textContent = message;
      document.body.appendChild(toast);

      // Animation d'apparition
      setTimeout(() => toast.classList.add('sf-toast-show'), 10);

      // Disparition automatique
      setTimeout(() => {
        toast.classList.remove('sf-toast-show');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    /**
     * Render navigation buttons for previous/next log
     * @private
     * @returns {string} HTML string for navigation buttons
     */
    _renderNavigationButtons() {
      const hasNavigation = this.logsList.length > 1 && this.currentLogIndex >= 0;
      
      if (!hasNavigation) {
        return '<div class="sf-nav-placeholder"></div>';
      }
      
      const isFirst = this.currentLogIndex === 0;
      const isLast = this.currentLogIndex === this.logsList.length - 1;
      const position = (i18n.logPosition || 'Log {current} of {total}')
        .replace('{current}', this.currentLogIndex + 1)
        .replace('{total}', this.logsList.length);
      
      return `
        <div class="sf-modal-nav">
          <button class="sf-nav-btn sf-nav-prev" ${isFirst ? 'disabled' : ''} title="${i18n.previousLog || 'Previous log'}">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
          </button>
          <span class="sf-nav-position">${position}</span>
          <button class="sf-nav-btn sf-nav-next" ${isLast ? 'disabled' : ''} title="${i18n.nextLog || 'Next log'}">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
            </svg>
          </button>
          <div class="sf-nav-loading" style="display: none;">
            <div class="sf-spinner-small"></div>
          </div>
        </div>
      `;
    }

    /**
     * Setup navigation button event listeners
     * @private
     */
    _setupNavigation(modal) {
      const prevBtn = modal.querySelector('.sf-nav-prev');
      const nextBtn = modal.querySelector('.sf-nav-next');
      
      if (prevBtn) {
        prevBtn.addEventListener('click', () => this._navigateToPrevious());
      }
      
      if (nextBtn) {
        nextBtn.addEventListener('click', () => this._navigateToNext());
      }
    }

    /**
     * Navigate to the previous log
     * @private
     */
    async _navigateToPrevious() {
      if (this.isLoadingNavigation || this.currentLogIndex <= 0) return;
      
      const newIndex = this.currentLogIndex - 1;
      await this._navigateToLog(newIndex);
    }

    /**
     * Navigate to the next log
     * @private
     */
    async _navigateToNext() {
      if (this.isLoadingNavigation || this.currentLogIndex >= this.logsList.length - 1) return;
      
      const newIndex = this.currentLogIndex + 1;
      await this._navigateToLog(newIndex);
    }

    /**
     * Navigate to a specific log by index
     * @private
     */
    async _navigateToLog(newIndex) {
      if (this.isLoadingNavigation) return;
      if (newIndex < 0 || newIndex >= this.logsList.length) return;
      
      const log = this.logsList[newIndex];
      if (!log || !log.Id) return;
      
      this.isLoadingNavigation = true;
      this._showNavigationLoading(true);
      this._updateNavigationButtons(newIndex);
      
      try {
        // Update the current index
        this.currentLogIndex = newIndex;
        
        // Call the navigation callback
        if (this.onNavigate) {
          await this.onNavigate(log.Id, newIndex);
        }
      } catch (error) {
        this.logger.error('Navigation failed', error);
        this._showToast(`❌ ${i18n.error || 'Error'}`, 'error');
        // Revert to previous state on error
        this._updateNavigationButtons(this.currentLogIndex);
      } finally {
        this.isLoadingNavigation = false;
        this._showNavigationLoading(false);
      }
    }

    /**
     * Show/hide navigation loading spinner
     * @private
     */
    _showNavigationLoading(show) {
      if (!this.currentModal) return;
      
      const loadingEl = this.currentModal.querySelector('.sf-nav-loading');
      const navBtns = this.currentModal.querySelectorAll('.sf-nav-btn');
      
      if (loadingEl) {
        loadingEl.style.display = show ? 'flex' : 'none';
      }
      
      navBtns.forEach(btn => {
        if (show) {
          btn.classList.add('sf-nav-loading-state');
        } else {
          btn.classList.remove('sf-nav-loading-state');
        }
      });
    }

    /**
     * Update navigation buttons state
     * @private
     */
    _updateNavigationButtons(index) {
      if (!this.currentModal) return;
      
      const prevBtn = this.currentModal.querySelector('.sf-nav-prev');
      const nextBtn = this.currentModal.querySelector('.sf-nav-next');
      const positionEl = this.currentModal.querySelector('.sf-nav-position');
      
      const isFirst = index === 0;
      const isLast = index === this.logsList.length - 1;
      
      if (prevBtn) {
        prevBtn.disabled = isFirst;
      }
      
      if (nextBtn) {
        nextBtn.disabled = isLast;
      }
      
      if (positionEl) {
        const position = (i18n.logPosition || 'Log {current} of {total}')
          .replace('{current}', index + 1)
          .replace('{total}', this.logsList.length);
        positionEl.textContent = position;
      }
    }

    /**
     * Ferme la modal actuelle
     */
    close() {
      if (this.currentModal) {
        this.currentModal.remove();
        this.currentModal = null;
        this.logger.log('Modal closed');
      }
      
      // Reset navigation state
      this.isLoadingNavigation = false;
    }

    _createModal() {
      const modal = document.createElement('div');
      modal.className = 'sf-log-modal';
      return modal;
    }

    _attachModal(modal) {
      document.body.appendChild(modal);
      this.currentModal = modal;

      // Close button
      const closeBtn = modal.querySelector('.sf-modal-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.close());
      }

      // Setup navigation buttons
      this._setupNavigation(modal);

      // Click outside to close
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.close();
        }
      });

      // Escape key to close
      const escapeHandler = (e) => {
        if (e.key === 'Escape') {
          this.close();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);

      // Arrow keys for navigation
      const arrowHandler = (e) => {
        if (!this.currentModal) {
          document.removeEventListener('keydown', arrowHandler);
          return;
        }
        
        // Don't navigate if focus is in an input
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
          return;
        }
        
        if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
          this._navigateToPrevious();
        } else if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
          this._navigateToNext();
        }
      };
      document.addEventListener('keydown', arrowHandler);

      // Listen for requests to scroll to a specific line
      document.addEventListener('foxlog:scrollToLine', (e) => {
        if (this.currentModal) {
          this.scrollToLogLine(e.detail.lineIndex);
        }
      });
    }

    _setupTabs(modal) {
      const tabBtns = modal.querySelectorAll('.sf-tab-btn');
      const tabContents = modal.querySelectorAll('.sf-tab-content');

      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          // Remove active class from all
          tabBtns.forEach(b => b.classList.remove('active'));
          tabContents.forEach(c => c.classList.remove('active'));

          // Add active to clicked
          btn.classList.add('active');
          const tabId = btn.dataset.tab;
          const content = modal.querySelector(`#tab-${tabId}`);
          if (content) {
            content.classList.add('active');
          }
        });
      });
    }

    /**
     * Configure le lazy-loading de l'onglet Appels
     * @private
     */
    async _setupCallsTab(modal, parsedLog) {
      const { callTreeBuilder, CallTreeView } = window.FoxLog;
      
      if (!callTreeBuilder || !CallTreeView) {
        logger.warn('[ModalManager] CallTree components not available');
        return;
      }

      // Listen for the Calls tab activation
      const callsBtn = modal.querySelector('[data-tab="calls"]');
      if (!callsBtn) return;

      let callTreeView = null;
      let callTreeBuilt = false;

      callsBtn.addEventListener('click', async () => {
        if (callTreeBuilt) return; // Already built

        const callsContainer = modal.querySelector('#tab-calls');
        if (!callsContainer) return;

        try {
          // Afficher le loading
          callsContainer.innerHTML = `
            <div class="sf-calls-loading">
              <div class="sf-spinner"></div>
              <div class="sf-loading-text">${i18n.buildingCallTree || 'Building call tree...'}</div>
              <div class="sf-loading-subtext">${(i18n.analyzing || 'Analyzing')} ${parsedLog.lines.length} ${(i18n.lines || 'Lines').toLowerCase()}</div>
            </div>
          `;

          // Construire l'arbre (via Web Worker)
          const callTree = await callTreeBuilder.buildTree(parsedLog);

          // Create the view
          callsContainer.innerHTML = '<div class="sf-call-tree-container"></div>';
          const container = callsContainer.querySelector('.sf-call-tree-container');

          callTreeView = new CallTreeView(container, callTree, parsedLog);
          callTreeView.init();

          callTreeBuilt = true;

          this.logger.success('CallTree view initialized');
        } catch (error) {
          this.logger.error('Failed to build call tree', error);
          
          callsContainer.innerHTML = `
            <div class="sf-empty-state">
              <p style="color: #ef4444; font-weight: 600;">⚠️ ${i18n.error || 'Error'}</p>
              <p style="color: #666;">${i18n.callTreeError || 'Unable to build the call tree'}</p>
              <p class="sf-hint">${error.message}</p>
            </div>
          `;
        }
      });
    }

    _renderSummaryTab(summary, parsedLog) {
      const extraCount = parsedLog.stats.methods.length > 10 ? parsedLog.stats.methods.length - 10 : 0;
      const extraHint = extraCount > 0
        ? (i18n.andOthers || '...and {count} more').replace('{count}', extraCount)
        : '';
      const errorsSection = parsedLog.stats.errors.length > 0
        ? `
          <div class="sf-summary-section sf-summary-errors">
            <h4>❌ ${(i18n.errors || 'Errors')} (${parsedLog.stats.errors.length})</h4>
            <div class="sf-errors-list">
              ${parsedLog.stats.errors.map(error => `
                <div class="sf-error-item">
                  <div class="sf-error-type">${error.type}</div>
                  <div class="sf-error-details">
                    <div class="sf-error-message">${error.exceptionType || 'Exception'}: ${error.message}</div>
                    ${error.method ? `<div class="sf-error-location">📍 ${(i18n.location || 'Location')}: <code>${error.method}</code></div>` : ''}
                    <div class="sf-error-time">${error.timestamp}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `
        : '';

      return `
        <div class="sf-summary-container">
          <div class="sf-summary-section">
            <h4>ℹ️ ${i18n.generalInfo || 'General Information'}</h4>
            <div class="sf-summary-grid">
              <div class="sf-summary-item">
                <span class="sf-label">${i18n.operation || 'Operation'}</span>
                <span class="sf-value">${summary.metadata.operation}</span>
              </div>
              <div class="sf-summary-item">
                <span class="sf-label">${i18n.status || 'Status'}</span>
                <span class="sf-value sf-status-${summary.metadata.status.toLowerCase()}">${summary.metadata.status}</span>
              </div>
              <div class="sf-summary-item">
                <span class="sf-label">${i18n.duration || 'Duration'}</span>
                <span class="sf-value">${summary.duration}ms</span>
              </div>
              <div class="sf-summary-item">
                <span class="sf-label">${i18n.lines || 'Lines'}</span>
                <span class="sf-value">${summary.totalLines}</span>
              </div>
            </div>
          </div>

          <div class="sf-summary-section">
            <h4>📊 ${i18n.salesforceLimits || 'Salesforce Limits'}</h4>
            <div class="sf-limits-grid">
              ${this._renderLimitBar(i18n.limitSoql || 'SOQL Queries', parsedLog.stats.limits.soqlQueries, parsedLog.stats.limits.maxSoqlQueries, summary.limits.soql)}
              ${this._renderLimitBar(i18n.limitDml || 'DML Statements', parsedLog.stats.limits.dmlStatements, parsedLog.stats.limits.maxDmlStatements, summary.limits.dml)}
              ${this._renderLimitBar(i18n.limitCpu || 'CPU Time', parsedLog.stats.limits.cpuTime, parsedLog.stats.limits.maxCpuTime, summary.limits.cpu)}
              ${this._renderLimitBar(i18n.limitHeap || 'Heap Size', parsedLog.stats.limits.heapSize, parsedLog.stats.limits.maxHeapSize, summary.limits.heap)}
            </div>
          </div>

          ${errorsSection}

          <div class="sf-summary-section">
            <h4>🔧 ${(i18n.methods || 'Methods')} (${summary.methods})</h4>
            <div class="sf-methods-list">
              ${parsedLog.stats.methods.slice(0, 10).map(m => `
                <div class="sf-method-item">
                  <span class="sf-method-name">${m.class}.${m.method}</span>
                  <span class="sf-method-calls">${m.calls} ${i18n.callsSuffix || 'call(s)'}</span>
                </div>
              `).join('')}
              ${extraHint ? `<div class="sf-hint">${extraHint}</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    _renderLimitBar(label, used, max, displayValue) {
      const percentage = max > 0 ? (used / max * 100).toFixed(1) : 0;
      const isWarning = percentage > 75;
      const isDanger = percentage > 90;
      const statusClass = isDanger ? 'danger' : (isWarning ? 'warning' : 'success');

      return `
        <div class="sf-limit-item">
          <span class="sf-label">${label}</span>
          <div class="sf-limit-bar">
            <div class="sf-limit-fill sf-limit-${statusClass}" style="width: ${percentage}%"></div>
          </div>
          <span class="sf-limit-value">${displayValue}</span>
        </div>
      `;
    }

    _renderRawTab(parsedLog) {
      // Split raw content into lines and wrap each in a span with data-line
      const rawLines = parsedLog.rawContent.split('\n');
      const structuredLines = rawLines.map((line, index) => 
        `<span class="sf-log-line" data-line="${index}">${this._escapeHtml(line)}</span>`
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
              <span class="sf-export-size">${this._formatBytes(parsedLog.rawContent.length)}</span>
              <span class="sf-export-lines">${rawLines.length} ${(i18n.lines || 'Lines').toLowerCase()}</span>
            </div>
          </div>
          <pre class="sf-raw-log-content">${structuredLines}</pre>
        </div>
      `;
    }

    _formatBytes(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    _escapeHtml(unsafe) {
      if (!unsafe) return '';
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    /**
     * Scroll to a specific line inside the Raw Log tab
     * @param {number} lineIndex - Line index
     */
    scrollToLogLine(lineIndex) {
      if (!this.currentModal) return;

      // Activate the Raw Log tab
      const rawBtn = this.currentModal.querySelector('[data-tab="raw"]');
      if (rawBtn) {
        rawBtn.click();
      }

      // Wait for the DOM to update
      setTimeout(() => {
        const rawContent = this.currentModal.querySelector('.sf-raw-log-content');
        if (!rawContent) return;

        // Find the line element by data-line attribute
        const lineEl = rawContent.querySelector(`[data-line="${lineIndex}"]`);
        if (!lineEl) {
          logger.warn(`Line ${lineIndex} not found in raw log`);
          return;
        }

        // Scroll the line into view
        lineEl.scrollIntoView({ behavior: 'instant', block: 'center' });

        // Highlight the line
        this._highlightLineElement(lineEl);
        
        logger.log(`Scrolled to line ${lineIndex}`);
      }, 150);
    }

    /**
     * Highlight a line element temporarily
     * @private
     * @param {HTMLElement} lineEl - The line element to highlight
     */
    _highlightLineElement(lineEl) {
      // Add highlight class
      lineEl.classList.add('sf-line-highlighted');
      
      // Remove after 2 seconds
      setTimeout(() => {
        lineEl.classList.remove('sf-line-highlighted');
      }, 2000);
    }
  }

  window.FoxLog.ModalManager = ModalManager;
  window.FoxLog.modalManager = new ModalManager();
  logger.log('[FoxLog] Modal Manager loaded');
})();