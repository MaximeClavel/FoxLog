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
      
      // Current analysis data for export
      this.currentParsedLog = null;
      this.currentAntiPatternResults = null;
      
      // Logo assets in base64 for PDF export
      this.logoIconBase64 = null;
      this.logoTextBase64 = null;
      this._loadLogoAssets();
      
      // Listen for toast events from other components
      document.addEventListener('foxlog:showToast', (e) => {
        this._showToast(e.detail.message, e.detail.type || 'success');
      });
    }

    /**
     * Load logo assets as base64 for PDF export
     * @private
     */
    async _loadLogoAssets() {
      try {
        const iconUrl = chrome.runtime.getURL('src/assets/icon128.png');
        const logoTextUrl = chrome.runtime.getURL('src/assets/FoxLog.png');
        
        const [iconResponse, logoResponse] = await Promise.all([
          fetch(iconUrl),
          fetch(logoTextUrl)
        ]);
        
        const [iconBlob, logoBlob] = await Promise.all([
          iconResponse.blob(),
          logoResponse.blob()
        ]);
        
        this.logoIconBase64 = await this._blobToBase64(iconBlob);
        this.logoTextBase64 = await this._blobToBase64(logoBlob);
        
        logger.log('[ModalManager] Logo assets loaded for PDF export');
      } catch (error) {
        logger.warn('[ModalManager] Failed to load logo assets', error);
      }
    }

    /**
     * Convert blob to base64 string
     * @private
     */
    _blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
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
      modal.innerHTML = `
        <div class="sf-modal-content">
          <div class="sf-modal-header">
            <h3>📊 ${i18n.logAnalysis || 'Log Analysis'}</h3>
            ${this._renderNavigationButtons()}
            <button class="sf-modal-close-btn">×</button>
          </div>
          
          <div class="sf-modal-tabs">
            <button class="sf-tab-btn active" data-tab="summary">${i18n.summary || 'Summary'}</button>
            <button class="sf-tab-btn" data-tab="analysis">
              🩺 ${i18n.analysis || 'Analysis'}
              ${this._renderAnalysisBadge(antiPatternResults)}
            </button>
            <button class="sf-tab-btn" data-tab="calls">${i18n.calls || 'Calls'}</button>
            <button class="sf-tab-btn" data-tab="raw">${i18n.rawLog || 'Raw Log'}</button>
          </div>
          
          <div class="sf-modal-body-tabs">
            <div id="tab-summary" class="sf-tab-content active">
              ${this._renderSummaryTab(summary, parsedLog)}
            </div>
            
            <div id="tab-analysis" class="sf-tab-content">
              ${this._renderAnalysisTab(antiPatternResults)}
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
    _updateModalContent(parsedLog, parser, summary, antiPatternResults = null) {
      const modal = this.currentModal;
      if (!modal) return;
      
      const filterManager = window.FoxLog.filterManager;
      
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
      
      // Update Analysis tab
      const analysisTab = modal.querySelector('#tab-analysis');
      if (analysisTab) {
        analysisTab.innerHTML = this._renderAnalysisTab(antiPatternResults);
        this._setupAntiPatternLineButtons(modal);
        this._setupExportAnalysisButtons(modal);
      }
      
      // Update Analysis tab badge
      const analysisBtn = modal.querySelector('[data-tab="analysis"]');
      if (analysisBtn) {
        analysisBtn.innerHTML = `
          🩺 ${i18n.analysis || 'Analysis'}
          ${this._renderAnalysisBadge(antiPatternResults)}
        `;
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

      // Setup anti-pattern line navigation
      this._setupAntiPatternLineButtons(modal);
      
      // Setup analysis export buttons (PDF, MD, TXT)
      this._setupExportAnalysisButtons(modal);
    }

    /**
     * Setup click handlers for anti-pattern line buttons
     * @private
     */
    _setupAntiPatternLineButtons(modal) {
      // Line navigation buttons
      const lineButtons = modal.querySelectorAll('.sf-ap-line-btn');
      lineButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const lineIndex = parseInt(btn.dataset.line, 10);
          this.scrollToLogLine(lineIndex);
        });
      });

      // "Show more" buttons (+XX)
      const showMoreBtns = modal.querySelectorAll('.sf-ap-show-more-btn');
      showMoreBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetId = btn.dataset.target;
          const container = modal.querySelector(`[data-lines-id="${targetId}"]`);
          if (container) {
            container.querySelector('.sf-ap-lines-visible').style.display = 'none';
            container.querySelector('.sf-ap-lines-all').style.display = 'flex';
          }
        });
      });

      // "Show less" links
      const showLessBtns = modal.querySelectorAll('.sf-ap-show-less-btn');
      showLessBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetId = btn.dataset.target;
          const container = modal.querySelector(`[data-lines-id="${targetId}"]`);
          if (container) {
            container.querySelector('.sf-ap-lines-visible').style.display = 'flex';
            container.querySelector('.sf-ap-lines-all').style.display = 'none';
          }
        });
      });
    }

    /**
     * Setup export buttons (PDF, MD, TXT) with dropdown menu
     * @private
     */
    _setupExportAnalysisButtons(modal) {
      // Toggle dropdown menu
      const exportBtn = modal.querySelector('.sf-analysis-export-btn');
      const exportMenu = modal.querySelector('.sf-analysis-export-menu');
      
      if (exportBtn && exportMenu) {
        exportBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const isVisible = exportMenu.style.display !== 'none';
          exportMenu.style.display = isVisible ? 'none' : 'block';
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
          if (!exportBtn.contains(e.target) && !exportMenu.contains(e.target)) {
            exportMenu.style.display = 'none';
          }
        });
      }

      // Export actions from menu items
      const menuItems = modal.querySelectorAll('.sf-analysis-export-menu .sf-export-menu-item');
      menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const action = item.dataset.action;
          
          if (exportMenu) exportMenu.style.display = 'none';
          
          switch (action) {
            case 'export-pdf':
              this._exportAnalysisPdf();
              break;
            case 'export-md':
              this._exportAnalysisMd();
              break;
            case 'export-txt':
              this._exportAnalysisTxt();
              break;
          }
        });
      });

      logger.log('[Export Setup] Analysis export dropdown configured');
    }

    /**
     * Export analysis report as PDF (via print dialog)
     * @private
     */
    _exportAnalysisPdf() {
      logger.log('[PDF Export] Starting PDF export...');
      
      if (!this.currentParsedLog || !this.currentAntiPatternResults) {
        logger.error('[PDF Export] No data available', { 
          hasLog: !!this.currentParsedLog, 
          hasResults: !!this.currentAntiPatternResults 
        });
        this._showToast(`❌ ${i18n.exportError || 'Export error'}`, 'error');
        return;
      }

      const { metadata } = this.currentParsedLog;
      const { patterns, summary } = this.currentAntiPatternResults;
      const date = new Date().toLocaleString();

      logger.log('[PDF Export] Generating HTML...');
      // Generate PDF-friendly HTML
      const html = this._generatePdfHtml(metadata, patterns, summary, date);

      // Try to open print window
      try {
        logger.log('[PDF Export] Opening print window...');
        const printWindow = window.open('', '_blank', 'width=900,height=700');
        
        if (!printWindow || printWindow.closed || typeof printWindow.closed === 'undefined') {
          // Popup blocked - use iframe fallback
          logger.warn('[PDF Export] Popup blocked, using iframe fallback');
          this._exportPdfViaIframe(html);
          return;
        }

        printWindow.document.write(html);
        printWindow.document.close();

        // Wait for content to load then print
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
          }, 300);
        };

        logger.success('[PDF Export] PDF export initiated');
        this._showToast(`📄 ${i18n.exportPdfReady || 'PDF ready - use "Save as PDF" in print dialog'}`);
        
      } catch (error) {
        logger.error('[PDF Export] PDF export failed', error);
        this._exportPdfViaIframe(html);
      }
    }

    /**
     * Fallback: Export PDF via hidden iframe
     * @private
     */
    _exportPdfViaIframe(html) {
      logger.log('[PDF Export] Using iframe fallback');
      // Create a hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      // Wait for content then print
      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          this._showToast(`📄 ${i18n.exportPdfReady || 'PDF ready - use "Save as PDF" in print dialog'}`);
        } catch (e) {
          logger.error('[PDF Export] Iframe print failed', e);
          this._showToast(`❌ ${i18n.exportError || 'Export error'}`, 'error');
        }
        
        // Remove iframe after a delay
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
    }

    /**
     * Export analysis report as Markdown
     * @private
     */
    _exportAnalysisMd() {
      if (!this.currentParsedLog || !this.currentAntiPatternResults) {
        this._showToast(`❌ ${i18n.exportError || 'Export error'}`, 'error');
        return;
      }

      const { metadata } = this.currentParsedLog;
      const { patterns, summary } = this.currentAntiPatternResults;
      const date = new Date().toLocaleString();

      const md = this._generateMdContent(metadata, patterns, summary, date);
      const filename = this._generateFilename(this.currentParsedLog, 'md');
      const blob = new Blob([md], { type: 'text/markdown' });
      
      this._downloadFile(blob, filename);
      this._showToast(`✅ ${i18n.exportSuccess || 'Export successful'}`);
      logger.success('[MD Export] Markdown exported');
    }

    /**
     * Export analysis report as plain text
     * @private
     */
    _exportAnalysisTxt() {
      if (!this.currentParsedLog || !this.currentAntiPatternResults) {
        this._showToast(`❌ ${i18n.exportError || 'Export error'}`, 'error');
        return;
      }

      const { metadata } = this.currentParsedLog;
      const { patterns, summary } = this.currentAntiPatternResults;
      const date = new Date().toLocaleString();

      const txt = this._generateTxtContent(metadata, patterns, summary, date);
      const filename = this._generateFilename(this.currentParsedLog, 'txt');
      const blob = new Blob([txt], { type: 'text/plain' });
      
      this._downloadFile(blob, filename);
      this._showToast(`✅ ${i18n.exportSuccess || 'Export successful'}`);
      logger.success('[TXT Export] Text file exported');
    }

    /**
     * Generate Markdown content for export
     * @private
     */
    _generateMdContent(metadata, patterns, summary, date) {
      const criticalPatterns = patterns.filter(p => p.severity === 'critical');
      const warningPatterns = patterns.filter(p => p.severity === 'warning');
      const infoPatterns = patterns.filter(p => p.severity === 'info');

      let md = `# 🦊 FoxLog - Analysis Report\n\n`;
      md += `**Generated:** ${date}\n\n`;
      md += `---\n\n`;

      // Score section
      md += `## 📊 Health Score: ${summary.score}/100\n\n`;
      md += `| Severity | Count |\n`;
      md += `|----------|-------|\n`;
      md += `| 🔴 Critical | ${summary.critical} |\n`;
      md += `| 🟡 Warning | ${summary.warnings} |\n`;
      md += `| 🔵 Info | ${summary.info} |\n\n`;

      // Metadata
      md += `## 📋 Log Information\n\n`;
      md += `- **Operation:** ${metadata.operation || '-'}\n`;
      md += `- **Status:** ${metadata.status || '-'}\n`;
      md += `- **Duration:** ${metadata.duration || 0}ms\n`;
      md += `- **Log ID:** ${metadata.id || '-'}\n\n`;

      if (patterns.length === 0) {
        md += `## ✅ No Issues Detected\n\n`;
        md += `Great job! No anti-patterns were found in this log.\n`;
        return md;
      }

      // Critical patterns
      if (criticalPatterns.length > 0) {
        md += `## 🔴 Critical Issues (${criticalPatterns.length})\n\n`;
        criticalPatterns.forEach((p, i) => {
          md += this._formatPatternMd(p, i + 1);
        });
      }

      // Warning patterns
      if (warningPatterns.length > 0) {
        md += `## 🟡 Warnings (${warningPatterns.length})\n\n`;
        warningPatterns.forEach((p, i) => {
          md += this._formatPatternMd(p, i + 1);
        });
      }

      // Info patterns
      if (infoPatterns.length > 0) {
        md += `## 🔵 Info (${infoPatterns.length})\n\n`;
        infoPatterns.forEach((p, i) => {
          md += this._formatPatternMd(p, i + 1);
        });
      }

      md += `---\n\n`;
      md += `*Report generated by FoxLog - Salesforce Debug Log Analyzer*\n`;

      return md;
    }

    /**
     * Format a single pattern for Markdown
     * @private
     */
    _formatPatternMd(pattern, index) {
      let md = `### ${index}. ${pattern.title}\n\n`;
      md += `${pattern.description}\n\n`;
      
      if (pattern.query) {
        md += `**Query:**\n\`\`\`sql\n${pattern.query}\n\`\`\`\n\n`;
      }
      
      if (pattern.method) {
        md += `**Method:** \`${pattern.method}\`\n\n`;
      }
      
      if (pattern.count) {
        md += `**Occurrences:** ${pattern.count}\n\n`;
      }
      
      if (pattern.suggestion) {
        md += `> 💡 **Suggestion:** ${pattern.suggestion}\n\n`;
      }
      
      return md;
    }

    /**
     * Generate plain text content for export
     * @private
     */
    _generateTxtContent(metadata, patterns, summary, date) {
      const criticalPatterns = patterns.filter(p => p.severity === 'critical');
      const warningPatterns = patterns.filter(p => p.severity === 'warning');
      const infoPatterns = patterns.filter(p => p.severity === 'info');

      const separator = '='.repeat(60);
      const subSeparator = '-'.repeat(40);

      let txt = `${separator}\n`;
      txt += `  FOXLOG - ANALYSIS REPORT\n`;
      txt += `${separator}\n\n`;
      txt += `Generated: ${date}\n\n`;

      // Score section
      txt += `HEALTH SCORE: ${summary.score}/100\n`;
      txt += `${subSeparator}\n`;
      txt += `  Critical: ${summary.critical}\n`;
      txt += `  Warning:  ${summary.warnings}\n`;
      txt += `  Info:     ${summary.info}\n\n`;

      // Metadata
      txt += `LOG INFORMATION\n`;
      txt += `${subSeparator}\n`;
      txt += `  Operation: ${metadata.operation || '-'}\n`;
      txt += `  Status:    ${metadata.status || '-'}\n`;
      txt += `  Duration:  ${metadata.duration || 0}ms\n`;
      txt += `  Log ID:    ${metadata.id || '-'}\n\n`;

      if (patterns.length === 0) {
        txt += `${separator}\n`;
        txt += `  NO ISSUES DETECTED\n`;
        txt += `${separator}\n\n`;
        txt += `Great job! No anti-patterns were found in this log.\n`;
        return txt;
      }

      // Critical patterns
      if (criticalPatterns.length > 0) {
        txt += `${separator}\n`;
        txt += `  CRITICAL ISSUES (${criticalPatterns.length})\n`;
        txt += `${separator}\n\n`;
        criticalPatterns.forEach((p, i) => {
          txt += this._formatPatternTxt(p, i + 1);
        });
      }

      // Warning patterns
      if (warningPatterns.length > 0) {
        txt += `${separator}\n`;
        txt += `  WARNINGS (${warningPatterns.length})\n`;
        txt += `${separator}\n\n`;
        warningPatterns.forEach((p, i) => {
          txt += this._formatPatternTxt(p, i + 1);
        });
      }

      // Info patterns
      if (infoPatterns.length > 0) {
        txt += `${separator}\n`;
        txt += `  INFO (${infoPatterns.length})\n`;
        txt += `${separator}\n\n`;
        infoPatterns.forEach((p, i) => {
          txt += this._formatPatternTxt(p, i + 1);
        });
      }

      txt += `${separator}\n`;
      txt += `Report generated by FoxLog - Salesforce Debug Log Analyzer\n`;

      return txt;
    }

    /**
     * Format a single pattern for plain text
     * @private
     */
    _formatPatternTxt(pattern, index) {
      let txt = `[${index}] ${pattern.title}\n`;
      txt += `    ${pattern.description}\n`;
      
      if (pattern.query) {
        txt += `    Query: ${pattern.query}\n`;
      }
      
      if (pattern.method) {
        txt += `    Method: ${pattern.method}\n`;
      }
      
      if (pattern.count) {
        txt += `    Occurrences: ${pattern.count}\n`;
      }
      
      if (pattern.suggestion) {
        txt += `    Suggestion: ${pattern.suggestion}\n`;
      }
      
      txt += `\n`;
      return txt;
    }

    /**
     * Generate HTML content for PDF export
     * @private
     */
    _generatePdfHtml(metadata, patterns, summary, date) {
      const criticalPatterns = patterns.filter(p => p.severity === 'critical');
      const warningPatterns = patterns.filter(p => p.severity === 'warning');
      const infoPatterns = patterns.filter(p => p.severity === 'info');

      // Determine score color
      let scoreColor = '#16a34a';
      if (summary.score < 50) scoreColor = '#dc2626';
      else if (summary.score < 80) scoreColor = '#d97706';

      // Use base64 logos if available, fallback to text
      const logoHtml = this.logoIconBase64 && this.logoTextBase64
        ? `<img src="${this.logoIconBase64}" alt="FoxLog" class="logo-icon" /><img src="${this.logoTextBase64}" alt="FoxLog" class="logo-text" />`
        : `<span class="logo-fallback">🦊 FoxLog</span>`;

      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>FoxLog Analysis Report - ${metadata.operation || 'Log'}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              font-size: 12px;
              line-height: 1.5;
              color: #1f2937;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #e5e7eb;
            }
            .logo {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .logo-icon {
              width: 40px;
              height: 40px;
            }
            .logo-text {
              height: 32px;
            }
            .logo-fallback {
              font-size: 24px;
              font-weight: 700;
              color: #f97316;
            }
            .report-info { text-align: right; color: #6b7280; font-size: 11px; }
            .score-section {
              display: flex;
              align-items: center;
              gap: 30px;
              margin-bottom: 30px;
              padding: 20px;
              background: #f9fafb;
              border-radius: 8px;
            }
            .score-circle {
              width: 100px;
              height: 100px;
              border-radius: 50%;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: 700;
            }
            .score-value { font-size: 32px; line-height: 1; }
            .score-label { font-size: 10px; opacity: 0.9; }
            .stats { display: flex; gap: 20px; }
            .stat { text-align: center; }
            .stat-value { font-size: 24px; font-weight: 700; }
            .stat-label { font-size: 11px; color: #6b7280; }
            .stat-critical .stat-value { color: #dc2626; }
            .stat-warning .stat-value { color: #d97706; }
            .stat-info .stat-value { color: #2563eb; }
            .metadata {
              margin-bottom: 30px;
              padding: 15px;
              background: #f3f4f6;
              border-radius: 8px;
            }
            .metadata h3 { font-size: 14px; margin-bottom: 10px; }
            .metadata-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .metadata-item { display: flex; gap: 8px; }
            .metadata-label { color: #6b7280; min-width: 80px; }
            .pattern-group { margin-bottom: 25px; }
            .pattern-group h3 {
              font-size: 14px;
              padding: 10px 15px;
              margin-bottom: 10px;
              border-radius: 6px;
            }
            .group-critical h3 { background: #fef2f2; color: #dc2626; }
            .group-warning h3 { background: #fffbeb; color: #d97706; }
            .group-info h3 { background: #eff6ff; color: #2563eb; }
            .pattern-item {
              padding: 12px 15px;
              margin-bottom: 8px;
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              border-left-width: 4px;
              page-break-inside: avoid;
            }
            .pattern-item.critical { border-left-color: #dc2626; }
            .pattern-item.warning { border-left-color: #d97706; }
            .pattern-item.info { border-left-color: #2563eb; }
            .pattern-title { font-weight: 600; margin-bottom: 4px; }
            .pattern-desc { color: #4b5563; margin-bottom: 8px; }
            .pattern-suggestion {
              background: #f0fdf4;
              border: 1px solid #bbf7d0;
              padding: 8px 10px;
              border-radius: 4px;
              font-size: 11px;
              color: #166534;
            }
            .pattern-query {
              background: #f3f4f6;
              padding: 6px 10px;
              border-radius: 4px;
              font-family: monospace;
              font-size: 10px;
              margin-bottom: 8px;
              word-break: break-all;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              text-align: center;
              color: #9ca3af;
              font-size: 10px;
            }
            .healthy-message {
              text-align: center;
              padding: 40px;
              background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
              border-radius: 12px;
              border: 2px solid #10b981;
            }
            .healthy-icon { font-size: 48px; margin-bottom: 10px; }
            .healthy-text { font-size: 20px; font-weight: 700; color: #059669; }
            @media print {
              body { padding: 20px; }
              .pattern-item { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">
              ${logoHtml}
            </div>
            <div class="report-info">
              <div>${i18n.analysisReport || 'Analysis Report'}</div>
              <div>${date}</div>
            </div>
          </div>

          <div class="score-section">
            <div class="score-circle" style="background: ${scoreColor};">
              <div class="score-value">${summary.score}</div>
              <div class="score-label">/100</div>
            </div>
            <div class="stats">
              <div class="stat stat-critical">
                <div class="stat-value">${summary.critical}</div>
                <div class="stat-label">🔴 ${i18n.critical || 'Critical'}</div>
              </div>
              <div class="stat stat-warning">
                <div class="stat-value">${summary.warnings}</div>
                <div class="stat-label">🟡 ${i18n.warning || 'Warning'}</div>
              </div>
              <div class="stat stat-info">
                <div class="stat-value">${summary.info}</div>
                <div class="stat-label">🔵 ${i18n.info || 'Info'}</div>
              </div>
            </div>
          </div>

          <div class="metadata">
            <h3>📋 ${i18n.logInfo || 'Log Information'}</h3>
            <div class="metadata-grid">
              <div class="metadata-item">
                <span class="metadata-label">${i18n.operation || 'Operation'}:</span>
                <span>${metadata.operation || '-'}</span>
              </div>
              <div class="metadata-item">
                <span class="metadata-label">${i18n.status || 'Status'}:</span>
                <span>${metadata.status || '-'}</span>
              </div>
              <div class="metadata-item">
                <span class="metadata-label">${i18n.duration || 'Duration'}:</span>
                <span>${metadata.duration || 0}ms</span>
              </div>
              <div class="metadata-item">
                <span class="metadata-label">ID:</span>
                <span>${metadata.id || '-'}</span>
              </div>
            </div>
          </div>

          ${patterns.length === 0 ? `
            <div class="healthy-message">
              <div class="healthy-icon">✅</div>
              <div class="healthy-text">${i18n.codeHealthy || 'Code is healthy!'} ✨</div>
              <p>${i18n.noAntiPatterns || 'No anti-patterns detected'}</p>
            </div>
          ` : `
            ${criticalPatterns.length > 0 ? `
              <div class="pattern-group group-critical">
                <h3>🔴 ${i18n.critical || 'Critical'} (${criticalPatterns.length})</h3>
                ${criticalPatterns.map(p => this._renderPdfPatternItem(p, 'critical')).join('')}
              </div>
            ` : ''}
            
            ${warningPatterns.length > 0 ? `
              <div class="pattern-group group-warning">
                <h3>🟡 ${i18n.warning || 'Warning'} (${warningPatterns.length})</h3>
                ${warningPatterns.map(p => this._renderPdfPatternItem(p, 'warning')).join('')}
              </div>
            ` : ''}
            
            ${infoPatterns.length > 0 ? `
              <div class="pattern-group group-info">
                <h3>🔵 ${i18n.info || 'Info'} (${infoPatterns.length})</h3>
                ${infoPatterns.map(p => this._renderPdfPatternItem(p, 'info')).join('')}
              </div>
            ` : ''}
          `}

          <div class="footer">
            ${i18n.generatedBy || 'Generated by'} FoxLog v${chrome.runtime.getManifest().version}
          </div>
        </body>
        </html>
      `;
    }

    /**
     * Render a single pattern item for PDF
     * @private
     */
    _renderPdfPatternItem(pattern, severity) {
      return `
        <div class="pattern-item ${severity}">
          <div class="pattern-title">${pattern.title}</div>
          <div class="pattern-desc">${pattern.description}</div>
          ${pattern.query ? `<div class="pattern-query">${this._escapeHtml(pattern.query)}</div>` : ''}
          ${pattern.occurrences ? `<div style="color: #6b7280; font-size: 11px; margin-bottom: 8px;">${i18n.occurrences || 'Occurrences'}: ${pattern.occurrences}</div>` : ''}
          <div class="pattern-suggestion">💡 ${pattern.suggestion}</div>
        </div>
      `;
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

    /**
     * Render badge for analysis tab
     * @private
     */
    _renderAnalysisBadge(results) {
      if (!results || results.totalCount === 0) {
        return '<span class="sf-tab-badge sf-badge-success">✓</span>';
      }
      
      if (results.hasCritical) {
        return `<span class="sf-tab-badge sf-badge-critical">${results.summary.critical}</span>`;
      }
      
      if (results.hasWarning) {
        return `<span class="sf-tab-badge sf-badge-warning">${results.summary.warnings}</span>`;
      }
      
      return `<span class="sf-tab-badge sf-badge-info">${results.summary.info}</span>`;
    }

    /**
     * Render the Analysis tab content
     * @private
     */
    _renderAnalysisTab(results) {
      if (!results) {
        return `
          <div class="sf-analysis-container">
            <div class="sf-empty-state">
              <p>⚠️ ${i18n.analysisUnavailable || 'Analysis unavailable'}</p>
            </div>
          </div>
        `;
      }

      const { patterns, summary } = results;
      
      // Determine score color
      let scoreClass = 'success';
      if (summary.score < 50) scoreClass = 'danger';
      else if (summary.score < 80) scoreClass = 'warning';
      
      // If no patterns detected, show success message
      if (patterns.length === 0) {
        return `
          <div class="sf-analysis-container">
            <div class="sf-analysis-header sf-analysis-header-healthy">
              <div class="sf-analysis-export-dropdown">
                <button class="sf-call-tree-btn sf-analysis-export-btn" data-action="toggle-analysis-export" title="${i18n.exportReport || 'Export Report'}">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
                  </svg>
                </button>
                <div class="sf-analysis-export-menu" style="display: none;">
                  <button class="sf-export-menu-item" data-action="export-pdf">📄 ${i18n.exportPdf || 'PDF'}</button>
                  <button class="sf-export-menu-item" data-action="export-md">📝 ${i18n.exportMd || 'MD'}</button>
                  <button class="sf-export-menu-item" data-action="export-txt">📃 ${i18n.exportTxt || 'TXT'}</button>
                </div>
              </div>
            </div>
            <div class="sf-analysis-healthy">
              <div class="sf-healthy-icon">✅</div>
              <div class="sf-healthy-text">${i18n.codeHealthy || 'Code is healthy!'} ✨</div>
              <div class="sf-health-score-large sf-score-${scoreClass}">
                ${i18n.healthScore || 'Health Score'}: <strong>${summary.score}/100</strong>
              </div>
              <p class="sf-healthy-description">${i18n.noAntiPatterns || 'No anti-patterns detected'}</p>
            </div>
          </div>
        `;
      }

      // Render patterns grouped by severity
      const criticalPatterns = patterns.filter(p => p.severity === 'critical');
      const warningPatterns = patterns.filter(p => p.severity === 'warning');
      const infoPatterns = patterns.filter(p => p.severity === 'info');

      return `
        <div class="sf-analysis-container">
          <div class="sf-analysis-header">
            <div class="sf-health-score-large sf-score-${scoreClass}">
              <span class="sf-score-label">${i18n.healthScore || 'Health Score'}</span>
              <span class="sf-score-value">${summary.score}<span class="sf-score-max">/100</span></span>
            </div>
            <div class="sf-analysis-summary">
              ${summary.critical > 0 ? `<div class="sf-ap-stat sf-ap-critical">🔴 ${summary.critical} ${i18n.critical || 'Critical'}</div>` : ''}
              ${summary.warnings > 0 ? `<div class="sf-ap-stat sf-ap-warning">🟡 ${summary.warnings} ${i18n.warning || 'Warning'}</div>` : ''}
              ${summary.info > 0 ? `<div class="sf-ap-stat sf-ap-info">🔵 ${summary.info} ${i18n.info || 'Info'}</div>` : ''}
            </div>
            <div class="sf-analysis-export-dropdown">
              <button class="sf-call-tree-btn sf-analysis-export-btn" data-action="toggle-analysis-export" title="${i18n.exportReport || 'Export Report'}">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              </button>
              <div class="sf-analysis-export-menu" style="display: none;">
                <button class="sf-export-menu-item" data-action="export-pdf">📄 ${i18n.exportPdf || 'PDF'}</button>
                <button class="sf-export-menu-item" data-action="export-md">📝 ${i18n.exportMd || 'MD'}</button>
                <button class="sf-export-menu-item" data-action="export-txt">📃 ${i18n.exportTxt || 'TXT'}</button>
              </div>
            </div>
          </div>
          
          <div class="sf-analysis-patterns">
            ${criticalPatterns.length > 0 ? `
              <div class="sf-pattern-group sf-group-critical">
                <h4 class="sf-group-title">🔴 ${i18n.critical || 'Critical'} (${criticalPatterns.length})</h4>
                ${this._renderPatternGroup(criticalPatterns, 'critical')}
              </div>
            ` : ''}
            
            ${warningPatterns.length > 0 ? `
              <div class="sf-pattern-group sf-group-warning">
                <h4 class="sf-group-title">🟡 ${i18n.warning || 'Warning'} (${warningPatterns.length})</h4>
                ${this._renderPatternGroup(warningPatterns, 'warning')}
              </div>
            ` : ''}
            
            ${infoPatterns.length > 0 ? `
              <div class="sf-pattern-group sf-group-info">
                <h4 class="sf-group-title">🔵 ${i18n.info || 'Info'} (${infoPatterns.length})</h4>
                ${this._renderPatternGroup(infoPatterns, 'info')}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    /**
     * Render a group of patterns
     * @private
     */
    _renderPatternGroup(patterns, severity) {
      if (patterns.length === 0) return '';
      
      return patterns.map(pattern => this._renderPatternItem(pattern)).join('');
    }

    /**
     * Render a single pattern item
     * @private
     */
    _renderPatternItem(pattern) {
      const severityIcons = {
        critical: '🔴',
        warning: '🟡',
        info: '🔵'
      };
      
      const icon = severityIcons[pattern.severity] || '⚪';
      
      // Build details section
      let detailsHtml = '';
      
      if (pattern.query) {
        detailsHtml += `<div class="sf-ap-query"><code>${this._escapeHtml(pattern.query)}</code></div>`;
      }
      
      if (pattern.occurrences) {
        detailsHtml += `<div class="sf-ap-occurrences">${i18n.occurrences || 'Occurrences'}: <strong>${pattern.occurrences}</strong></div>`;
      }
      
      if (pattern.method) {
        detailsHtml += `<div class="sf-ap-method">📍 <code>${this._escapeHtml(pattern.method)}</code></div>`;
      }
      
      if (pattern.percent !== undefined) {
        detailsHtml += `<div class="sf-ap-percent">${pattern.percent.toFixed(0)}% ${i18n.limitUsed || 'of limit used'}</div>`;
      }

      // Line navigation buttons (max 15 visible, expandable)
      let linesHtml = '';
      if (pattern.lines && pattern.lines.length > 0) {
        const maxVisible = 15;
        const allLines = pattern.lines;
        const visibleLines = allLines.slice(0, maxVisible);
        const hiddenCount = allLines.length - maxVisible;
        const uniqueId = `lines-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        linesHtml = `
          <div class="sf-ap-lines" data-lines-id="${uniqueId}">
            <div class="sf-ap-lines-visible">
              ${visibleLines.map(lineIdx => `
                <button class="sf-ap-line-btn" data-line="${lineIdx}" title="${i18n.viewInLog || 'View in log'}">
                  L${lineIdx + 1}
                </button>
              `).join('')}
              ${hiddenCount > 0 ? `
                <button class="sf-ap-show-more-btn" data-target="${uniqueId}" title="${i18n.showAll || 'Show all'}">
                  +${hiddenCount}
                </button>
              ` : ''}
            </div>
            ${hiddenCount > 0 ? `
              <div class="sf-ap-lines-all" style="display: none;">
                ${allLines.map(lineIdx => `
                  <button class="sf-ap-line-btn" data-line="${lineIdx}" title="${i18n.viewInLog || 'View in log'}">
                    L${lineIdx + 1}
                  </button>
                `).join('')}
                <a href="#" class="sf-ap-show-less-btn" data-target="${uniqueId}">${i18n.showLess || 'Less'}</a>
              </div>
            ` : ''}
          </div>
        `;
      }

      return `
        <div class="sf-anti-pattern-item sf-ap-${pattern.severity}">
          <div class="sf-ap-header">
            <span class="sf-ap-icon">${icon}</span>
            <span class="sf-ap-title">${pattern.title}</span>
          </div>
          <div class="sf-ap-description">${pattern.description}</div>
          ${detailsHtml}
          <div class="sf-ap-suggestion">
            <span class="sf-ap-suggestion-label">💡 ${i18n.suggestion || 'Suggestion'}:</span>
            ${pattern.suggestion}
          </div>
          ${pattern.impact ? `
            <div class="sf-ap-impact">
              <span class="sf-ap-impact-label">⚡ ${i18n.impact || 'Impact'}:</span>
              ${pattern.impact}
            </div>
          ` : ''}
          ${linesHtml}
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