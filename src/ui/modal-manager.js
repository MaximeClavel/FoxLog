// src/ui/modal-manager.js (Full version)
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;

  // The modal is a shell (header, tab bar, focus trap, navigation); each tab
  // lives in its own module under src/ui/modal-tabs/ and registers itself in
  // window.FoxLog.modalTabs. See docs/tech-solution/modal-tabs.md.

  class ModalManager {
    constructor() {
      this.currentModal = null;
      this.logger = window.FoxLog.logger;
      
      // Navigation state
      this.logsList = [];
      this.currentLogIndex = -1;
      this.isLoadingNavigation = false;
      this.onNavigate = null; // Callback for navigation
      
      // Current analysis data for export
      this.currentParsedLog = null;
      this.currentAntiPatternResults = null;

      // Contexts of the tabs of the open parsed-log modal, by tab id (see _createTabContexts)
      this._tabContexts = new Map();
      
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
            <h3>${window.FoxLog.icon('file', { size: 16 })} ${i18n.rawLog || 'Raw Log'}</h3>
            <button type="button" class="sf-modal-close-btn" aria-label="${i18n.close || 'Close'}">${window.FoxLog.icon('x')}</button>
          </div>
          <div class="sf-modal-body">
            <pre class="sf-raw-log-content" tabindex="0" aria-label="${i18n.rawLog || 'Raw Log'}">${this._escapeHtml(content)}</pre>
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
      const summary = parser.getSummary(parsedLog);
      
      // Run anti-pattern detection early for badge
      const antiPatternDetector = window.FoxLog.antiPatternDetector;
      let antiPatternResults = null;
      if (antiPatternDetector) {
        try {
          antiPatternResults = antiPatternDetector.analyze(parsedLog);
        } catch (error) {
          logger.error('Anti-pattern detection failed', error);
        }
      }
      
      // Store for export
      this.currentParsedLog = parsedLog;
      this.currentAntiPatternResults = antiPatternResults;
      
      // If updateOnly and modal exists, just update the content
      if (updateOnly && this.currentModal) {
        this._updateModalContent(parsedLog, parser, summary, antiPatternResults);
        return;
      }
      
      this.close();
      
      const modal = this._createModal();
      const tabContexts = this._createTabContexts(modal, { parsedLog, summary, antiPatternResults });
      modal.innerHTML = `
        <div class="sf-modal-content">
          <div class="sf-modal-header">
            <div class="sf-modal-title">${this._renderModalTitle(parsedLog.metadata)}</div>
            ${this._renderNavigationButtons()}
            <button type="button" class="sf-modal-close-btn" aria-label="${i18n.close || 'Close'}">${window.FoxLog.icon('x')}</button>
          </div>

          <div class="sf-modal-tabs" role="tablist" aria-label="${i18n.logAnalysis || 'Log Analysis'}">
            ${tabContexts.map((ctx, index) => this._renderTabButton(ctx, index === 0)).join('')}
          </div>
          
          <div class="sf-modal-body-tabs">
            ${tabContexts.map((ctx, index) => this._renderTabPane(ctx, index === 0)).join('')}
          </div>
        </div>
      `;

      tabContexts.forEach(ctx => {
        ctx.pane = modal.querySelector(`#tab-${ctx.tab.id}`);
        ctx.button = modal.querySelector(`.sf-tab-btn[data-tab="${ctx.tab.id}"]`);
      });
      this._tabContexts = new Map(tabContexts.map(ctx => [ctx.tab.id, ctx]));
      
      this._attachModal(modal);
      this._setupTabs(modal);
      this._tabContexts.forEach(ctx => this._invokeTab(ctx, 'setup'));
      
      this.logger.success('Parsed log modal with filters displayed');
    }

    /**
     * Update modal content without closing it (for navigation)
     * @private
     */
    _updateModalContent(parsedLog, parser, summary, antiPatternResults = null) {
      const modal = this.currentModal;
      if (!modal) return;
      
      // Re-analyze if not provided
      if (!antiPatternResults) {
        const antiPatternDetector = window.FoxLog.antiPatternDetector;
        if (antiPatternDetector) {
          try {
            antiPatternResults = antiPatternDetector.analyze(parsedLog);
          } catch (error) {
            logger.error('Anti-pattern detection failed', error);
          }
        }
      }
      
      const titleContainer = modal.querySelector('.sf-modal-title');
      if (titleContainer) {
        titleContainer.innerHTML = this._renderModalTitle(parsedLog.metadata);
      }

      // Update navigation buttons
      const navContainer = modal.querySelector('.sf-modal-nav, .sf-nav-placeholder');
      if (navContainer) {
        const newNav = document.createElement('div');
        newNav.innerHTML = this._renderNavigationButtons();
        navContainer.replaceWith(newNav.firstElementChild);
        this._setupNavigation(modal);
      }
      
      // Hand the new log to every tab: the shell re-renders its pane (and its
      // label badge), then the tab re-wires the new content. Lazy tabs (Flow,
      // Calls, Diff) rebuild right away if active, otherwise on their next click.
      this._tabContexts.forEach(ctx => {
        Object.assign(ctx, { parsedLog, summary, antiPatternResults });
        ctx.pane.innerHTML = ctx.tab.render(ctx);
        if (ctx.tab.badge) {
          ctx.button.innerHTML = this._renderTabButtonContent(ctx);
        }
        this._invokeTab(ctx, 'onLogChange');
      });
      
      this.logger.success('Modal content updated for navigation');
    }

    _showToast(message, type = 'success') {
      // Supprimer les anciens toasts
      const existingToast = document.querySelector('.sf-toast');
      if (existingToast) {
        existingToast.remove();
      }

      const toastIcons = {
        success: 'check-circle',
        error: 'alert-circle',
        warning: 'alert-triangle',
        info: 'info'
      };

      const toast = document.createElement('div');
      toast.className = `sf-toast sf-toast-${type}`;
      toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
      toast.innerHTML = `${window.FoxLog.icon(toastIcons[type] || 'info', { size: 16, className: 'sf-toast-icon' })}<span class="sf-toast-message"></span>`;
      toast.querySelector('.sf-toast-message').textContent = message;
      document.body.appendChild(toast);

      // Animation d'apparition
      setTimeout(() => toast.classList.add('sf-toast-show'), 10);

      // Disparition automatique
      setTimeout(() => {
        toast.classList.remove('sf-toast-show');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    _getStatusTone(status) {
      return window.FoxLog.modalTabUtils.getStatusTone(status);
    }

    /**
     * Render the log identity shown in the modal header
     * @private
     * @param {Object} metadata - Parsed log metadata
     * @returns {string} HTML for the header title block
     */
    _renderModalTitle(metadata) {
      const status = String(metadata.status);
      const startedAt = metadata.startTime ? metadata.startTime.toLocaleString(navigator.language) : '';

      return `
        <span class="sf-modal-title-icon">${window.FoxLog.icon('bar-chart', { size: 18 })}</span>
        <div class="sf-modal-title-text">
          <h3 title="${this._escapeHtml(metadata.operation)}">${this._escapeHtml(metadata.operation)}</h3>
          <p class="sf-modal-subtitle">
            <span class="sf-tone-chip sf-tone-chip--${this._getStatusTone(status)}" title="${this._escapeHtml(status)}">${this._escapeHtml(status.split(':')[0])}</span>
            ${metadata.userName ? `<span class="sf-tone-chip sf-tone-chip--user" title="${i18n.logUser || 'Log user: '}${this._escapeHtml(metadata.userName)}">${window.FoxLog.icon('user', { size: 12 })}<span class="sf-tone-chip-text">${this._escapeHtml(metadata.userName)}</span></span>` : ''}
            ${metadata.cleared ?`<span class="sf-tone-chip sf-tone-chip--hidden" title="${i18n.clearedBarHint || 'Hidden in FoxLog only: they are still in Salesforce'}">${window.FoxLog.icon('eye-off', { size: 12 })} ${i18n.hiddenLog || 'Hidden'}</span>` : ''}
            <span>${window.FoxLog.formatDuration(metadata.duration)}</span>
            ${startedAt ? `<span>${this._escapeHtml(startedAt)}</span>` : ''}
          </p>
        </div>
      `;
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
          <button type="button" class="sf-nav-btn sf-nav-prev" ${isFirst ? 'disabled' : ''} title="${i18n.previousLog || 'Previous log'}" aria-label="${i18n.previousLog || 'Previous log'}">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
          </button>
          <span class="sf-nav-position">${position}</span>
          <button type="button" class="sf-nav-btn sf-nav-next" ${isLast ? 'disabled' : ''} title="${i18n.nextLog || 'Next log'}" aria-label="${i18n.nextLog || 'Next log'}">
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
        this._showToast(i18n.error || 'Error', 'error');
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
        // Every tab destroys its views and bumps its generation token, so a
        // Flow/Calls build or a Diff run still in flight (awaiting
        // buildTree()/init()/the worker) sees itself as stale once it resumes,
        // instead of attaching a freshly built view -- with its own window
        // listeners -- to this now-detached modal.
        this._tabContexts.forEach(ctx => this._invokeTab(ctx, 'destroy'));
        this._tabContexts = new Map();

        this.currentModal.remove();
        this.currentModal = null;
        this.returnFocusTo?.focus?.();
        this.logger.log('Modal closed');
      }

      // Reset navigation state
      this.isLoadingNavigation = false;
    }

    _createModal() {
      const modal = document.createElement('div');
      modal.className = 'sf-log-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', i18n.logAnalysis || 'Log Analysis');
      return modal;
    }

    _attachModal(modal) {
      this.returnFocusTo = document.activeElement;
      document.body.appendChild(modal);
      this.currentModal = modal;
      modal.tabIndex = -1;
      modal.focus({ preventScroll: true });

      // Keep Tab inside the dialog while it is open
      modal.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const focusable = [...modal.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')]
          .filter(el => el.offsetParent !== null);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });

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

    /**
     * Switch to the Flow tab and show something from the Summary in it.
     * @param {{lines?: number[], group?: string, method?: string}} spec - see CallGraphView.jumpTo
     */
    showInFlow(spec) {
      const modal = this.currentModal;
      const graphBtn = modal && modal.querySelector('[data-tab="graph"]');
      if (!graphBtn) return;

      // The graph is built lazily (and asynchronously) on the first tab click:
      // the Flow tab keeps the target and applies it once the view exists.
      this._callTab('graph', 'queueJump', spec);
      graphBtn.click();
      this._callTab('graph', 'flushPendingJump');
    }

    /**
     * Switch to the Analysis tab and flash the given pattern (index in results.patterns).
     */
    showPatternInAnalysis(patternIndex) {
      const modal = this.currentModal;
      const analysisBtn = modal && modal.querySelector('[data-tab="analysis"]');
      if (!analysisBtn) return;

      analysisBtn.click();
      this._callTab('analysis', 'flashPattern', patternIndex);
    }

    /**
     * Create one context per registered tab for a modal being opened. A context
     * lives until the modal closes; its log fields are refreshed on prev/next
     * navigation. `pane` and `button` are set once the modal markup exists.
     * @private
     * @param {HTMLElement} modal - The modal being opened
     * @param {{parsedLog: Object, summary: Object, antiPatternResults: ?Object}} logData - Log shown first
     * @returns {Object[]} Tab contexts, in tab bar order
     */
    _createTabContexts(modal, logData) {
      const tabs = window.FoxLog.modalTabs ? window.FoxLog.modalTabs.list() : [];

      return tabs.map(tab => {
        const ctx = {
          tab,
          modal,
          pane: null,
          button: null,
          ...logData,
          // Private to the tab, kept across log navigation, dropped on close
          state: {},
          isActive: () => Boolean(ctx.button && ctx.button.classList.contains('active')),
          openTab: (tabId) => {
            const tabBtn = modal.querySelector(`[data-tab="${tabId}"]`);
            if (tabBtn) tabBtn.click();
          },
          showToast: (message, type) => this._showToast(message, type),
          showInFlow: (spec) => this.showInFlow(spec),
          showPatternInAnalysis: (patternIndex) => this.showPatternInAnalysis(patternIndex),
          scrollToLogLine: (lineIndex) => this.scrollToLogLine(lineIndex)
        };
        return ctx;
      });
    }

    /**
     * Call a hook (or any other method) of a tab module with its context
     * @private
     */
    _invokeTab(ctx, method, ...args) {
      const fn = ctx.tab[method];
      return typeof fn === 'function' ? fn.call(ctx.tab, ctx, ...args) : undefined;
    }

    /**
     * Call a method of a tab of the open modal, by tab id (no-op if it has no such tab)
     * @private
     */
    _callTab(tabId, method, ...args) {
      const ctx = this._tabContexts.get(tabId);
      return ctx ? this._invokeTab(ctx, method, ...args) : undefined;
    }

    /**
     * Tab bar button of a tab
     * @private
     * @param {Object} ctx - Tab context
     * @param {boolean} isActive - Whether the modal opens on this tab
     */
    _renderTabButton(ctx, isActive) {
      return `<button type="button" class="sf-tab-btn${isActive ? ' active' : ''}" role="tab" aria-selected="${isActive}"${isActive ? '' : ' tabindex="-1"'} data-tab="${ctx.tab.id}">${this._renderTabButtonContent(ctx)}</button>`;
    }

    /**
     * Icon, label and optional badge of a tab button (the badge is refreshed on log navigation)
     * @private
     */
    _renderTabButtonContent(ctx) {
      const { tab } = ctx;
      const label = typeof tab.label === 'function' ? tab.label() : tab.label;
      const badge = tab.badge ? tab.badge(ctx) : '';
      return `${window.FoxLog.icon(tab.icon, { size: 14 })} ${label}${badge ? ` ${badge}` : ''}`;
    }

    /**
     * Pane of a tab, filled by the tab module
     * @private
     */
    _renderTabPane(ctx, isActive) {
      const classes = ['sf-tab-content', isActive && 'active', ctx.tab.paneClass].filter(Boolean).join(' ');
      return `<div id="tab-${ctx.tab.id}" class="${classes}">${ctx.tab.render(ctx)}</div>`;
    }

    _setupTabs(modal) {
      const tabBtns = [...modal.querySelectorAll('.sf-tab-btn')];
      const tabContents = modal.querySelectorAll('.sf-tab-content');
      const tabContexts = this._tabContexts;

      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          tabBtns.forEach(b => {
            const isActive = b === btn;
            b.classList.toggle('active', isActive);
            b.setAttribute('aria-selected', String(isActive));
            b.tabIndex = isActive ? 0 : -1;
          });
          tabContents.forEach(c => c.classList.remove('active'));

          const content = modal.querySelector(`#tab-${btn.dataset.tab}`);
          if (content) {
            content.classList.add('active');
          }

          // Lazy tabs (Flow, Calls, Diff) build their content on activation
          const ctx = tabContexts.get(btn.dataset.tab);
          if (ctx) this._invokeTab(ctx, 'onActivate');
        });
      });

      // Arrow keys move between tabs; stop them here so they do not also switch to the previous/next log
      modal.querySelector('.sf-modal-tabs')?.addEventListener('keydown', (e) => {
        const current = tabBtns.indexOf(document.activeElement);
        const last = tabBtns.length - 1;
        const targets = {
          ArrowRight: (current + 1) % tabBtns.length,
          ArrowLeft: (current + last) % tabBtns.length,
          Home: 0,
          End: last
        };
        if (current < 0 || !(e.key in targets)) return;

        e.preventDefault();
        e.stopPropagation();
        tabBtns[targets[e.key]].focus();
        tabBtns[targets[e.key]].click();
      });
    }

    _escapeHtml(unsafe) {
      return window.FoxLog.escapeHtml(unsafe);
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