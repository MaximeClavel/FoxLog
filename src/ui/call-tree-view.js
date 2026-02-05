// src/ui/call-tree-view.js
// UI component to display the call tree with virtualization

(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const { logger, callTreeBuilder } = window.FoxLog;

  class CallTreeView {
    constructor(container, callTree, parsedLog) {
      this.container = container;
      this.callTree = callTree;
      this.parsedLog = parsedLog;
      
      // Component state
      this.expandedNodes = new Set();
      this.visibleNodes = [];
      this.filteredNodes = [];
      this.searchQuery = '';
      this.highlightedNodeId = null;
      this.filters = {
        types: [],
        errorsOnly: false,
        minDuration: 0,
        maxDepth: null
      };
      
      // Virtualization
      this.nodeHeight = 36; // Node height in pixels
      this.viewportHeight = 0;
      this.scrollTop = 0;
      this.renderBuffer = 10; // Additional nodes to render
      
      // DOM references
      this.toolbarEl = null;
      this.treeContainer = null;
      this.scrollContainer = null;
      
      // Debounce timers
      this.searchDebounce = null;
      this.listenersAttached = false;
    }

    /**
     * Initialize the view
     */
    async init() {
      this._initExpandedState();
      this._buildVisibleNodes();
      this._render();
      await this._waitForRender();
      logger.success('CallTreeView initialized');
    }

    async _waitForRender() {
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.toolbarEl = this.container.querySelector('.sf-call-tree-toolbar');
            this.scrollContainer = this.container.querySelector('.sf-call-tree-scroll-container');
            this.treeContainer = this.container.querySelector('.sf-call-tree-viewport');
            
            if (this.scrollContainer) {
              this.viewportHeight = this.scrollContainer.clientHeight;
            }
            
            this._renderVisibleNodes();
            this._setupEventListeners();
            resolve();
          });
        });
      });
    }

    /**
     * Initialize expanded state (levels 0-2 by default)
     * @private
     */
    _initExpandedState() {
      const initExpanded = (node) => {
        if (node.depth <= 2) {
          this.expandedNodes.add(node.id);
        }
        node.children.forEach(child => initExpanded(child));
      };
      
      initExpanded(this.callTree.root);
    }

    /**
     * Build the list of visible nodes (flattened)
     * @private
     */
    _buildVisibleNodes() {
      this.visibleNodes = [];
      this._traverseVisible(this.callTree.root);
      this.filteredNodes = [...this.visibleNodes];
    }

    /**
     * Traverse the tree and collect visible nodes
     * @private
     */
    _traverseVisible(node) {
      this.visibleNodes.push(node);
      
      if (this.expandedNodes.has(node.id)) {
        node.children.forEach(child => this._traverseVisible(child));
      }
    }

    /**
     * Render the component
     * @private
     */
    _render() {
      this.container.innerHTML = `
        <div class="sf-call-tree">
          ${this._renderToolbar()}
          ${this._renderTopNodes()}
          <div class="sf-call-tree-scroll-container">
            <div class="sf-call-tree-spacer" style="height: ${this.filteredNodes.length * this.nodeHeight}px;"></div>
            <div class="sf-call-tree-viewport"></div>
          </div>
          ${this._renderEmptyState()}
        </div>
      `;
    }

    /**
     * Render the toolbar
     * @private
     */
    _renderToolbar() {
      return `
        <div class="sf-call-tree-toolbar">
          <div class="sf-call-tree-search">
            <svg class="sf-search-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
            </svg>
            <input 
              type="text" 
              class="sf-call-tree-search-input" 
              placeholder="${i18n.searchInTree || 'Search in tree...'}"
              value="${this.searchQuery}"
            />
          </div>
          
          <div class="sf-call-tree-actions">
            <button class="sf-call-tree-btn sf-btn-expand" data-action="expand-all" title="${i18n.expandAll || 'Expand All'}">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
              </svg>
            </button>
            <button class="sf-call-tree-btn sf-btn-collapse" data-action="collapse-all" title="${i18n.collapseAll || 'Collapse All'}">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
              </svg>
            </button>
            <button class="sf-call-tree-btn sf-btn-errors" data-action="errors-only" title="${i18n.errorsOnly || 'Errors Only'}">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
              </svg>
            </button>
            <div class="sf-export-dropdown">
              <button class="sf-call-tree-btn sf-btn-export" data-action="toggle-export-menu" title="${i18n.exportReport || 'Export Report'}">
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              </button>
              <div class="sf-export-menu" style="display: none;">
                <button class="sf-export-menu-item" data-action="export-txt">
                  📄 ${i18n.exportTxt || 'Export (.txt)'}
                </button>
                <button class="sf-export-menu-item" data-action="export-md">
                  📝 ${i18n.exportMd || 'Export (.md)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    /**
     * Render the banner for the top 5 slowest nodes
     * @private
     */
    _renderTopNodes() {
      if (!this.callTree.metadata.topSlowNodes || this.callTree.metadata.topSlowNodes.length === 0) {
        return '';
      }
      
      return `
        <div class="sf-call-tree-top-nodes">
          <div class="sf-top-nodes-title">⚡ ${i18n.topSlowestNodes || 'Top 5 Slowest Nodes'}</div>
          <div class="sf-top-nodes-list">
            ${this.callTree.metadata.topSlowNodes.map((node, i) => `
              <div class="sf-top-node-item" data-node-id="${node.id}">
                <span class="sf-top-node-rank">#${i + 1}</span>
                <span class="sf-top-node-name">${this._escapeHtml(node.name)}</span>
                <span class="sf-top-node-type">${node.type}</span>
                <span class="sf-top-node-duration">${node.duration.toFixed(2)}ms</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    /**
     * Scroll to a specific node and highlight it
     * @param {string} nodeId - Target node ID
     */
    scrollToNode(nodeId) {
      // 1. Find the node in the tree
      const node = this._findNodeById(this.callTree.root, nodeId);
      if (!node) {
        logger.warn(`Node ${nodeId} not found`);
        return;
      }
      
      // 2. Expand all parents to make the node visible
      this._expandPathToNode(node);
      
      // 3. Rebuild the list of visible nodes
      this._buildVisibleNodes();
      this._applyFilters();
      
      // 4. Find the node index in filteredNodes
      const index = this.filteredNodes.findIndex(n => n.id === nodeId);
      if (index === -1) {
        logger.warn(`Node ${nodeId} not in filtered list`);
        return;
      }
      
      // 5. Scroll to the node
      const scrollTop = index * this.nodeHeight;
      this.scrollContainer.scrollTop = scrollTop;
      
      // 6. Temporary highlight
      setTimeout(() => {
        this._highlightNode(nodeId);
        this._renderVisibleNodes();
      }, 100);
      
      logger.success(`Scrolled to node: ${node.name}`);
    }

    /**
     * Find a node by ID (recursive)
     * @private
     */
    _findNodeById(node, targetId) {
      if (node.id === targetId) return node;
      
      for (const child of node.children) {
        const found = this._findNodeById(child, targetId);
        if (found) return found;
      }
      
      return null;
    }

    /**
     * Expand every parent node to make the target visible
     * @private
     */
    _expandPathToNode(node) {
      // Find the complete path to the node
      const path = this._findPathToNode(this.callTree.root, node.id);
      
      // Expand every node on the path (except the last one)
      path.slice(0, -1).forEach(pathNode => {
        this.expandedNodes.add(pathNode.id);
      });
    }

    /**
     * Find the path to a node (list of parent nodes)
     * @private
     */
    _findPathToNode(current, targetId, path = []) {
      path.push(current);
      
      if (current.id === targetId) {
        return path;
      }
      
      for (const child of current.children) {
        const result = this._findPathToNode(child, targetId, [...path]);
        if (result) return result;
      }
      
      return null;
    }

    /**
     * Highlight a node temporarily
     * @private
     */
    _highlightNode(nodeId) {
      // Flag the node for highlighting
      this.highlightedNodeId = nodeId;
      
      // Remove highlight after 2 seconds
      setTimeout(() => {
        this.highlightedNodeId = null;
        this._renderVisibleNodes();
      }, 2000);
    }

    /**
     * Render the empty state
     * @private
     */
    _renderEmptyState() {
      if (this.filteredNodes.length > 0) return '';
      
      return `
        <div class="sf-call-tree-empty">
          <p>${i18n.noNodeFound || 'No node found'}</p>
          <p class="sf-hint">${i18n.adjustFilters || 'Adjust filters or search'}</p>
        </div>
      `;
    }

    /**
     * Rend les nœuds visibles (virtualisation)
     * @private
     */
    _renderVisibleNodes() {
      if (!this.treeContainer || this.filteredNodes.length === 0) {
        if (this.treeContainer) {
          this.treeContainer.innerHTML = '';
        }
        return;
      }
      
      if (this.scrollContainer) {
        const currentHeight = this.scrollContainer.clientHeight;
        if (currentHeight > 0) {
          this.viewportHeight = currentHeight;
        }
      }
      
      const effectiveViewportHeight = this.viewportHeight || 600;
      const startIndex = Math.max(0, Math.floor(this.scrollTop / this.nodeHeight) - this.renderBuffer);
      const endIndex = Math.min(
        this.filteredNodes.length,
        Math.ceil((this.scrollTop + effectiveViewportHeight) / this.nodeHeight) + this.renderBuffer
      );
      
      const fragment = document.createDocumentFragment();
      
      for (let i = startIndex; i < endIndex; i++) {
        const node = this.filteredNodes[i];
        const nodeEl = this._createNodeElement(node, i);
        fragment.appendChild(nodeEl);
      }
      
      this.treeContainer.innerHTML = '';
      this.treeContainer.appendChild(fragment);
      
      // Positionner le viewport
      this.treeContainer.style.transform = `translateY(${startIndex * this.nodeHeight}px)`;
    }

    /**
     * Create a DOM element for a node
     * @private
     */
    _createNodeElement(node, index) {
      const isExpanded = this.expandedNodes.has(node.id);
      const hasChildren = node.children.length > 0;
      const indent = node.depth * 24;
      
      // Add the highlight class if this is the target node
      const isHighlighted = this.highlightedNodeId === node.id;
      const highlightClass = isHighlighted ? 'sf-node-highlighted' : '';
      
      const div = document.createElement('div');
      div.className = `sf-call-tree-node ${node.hasError ? 'sf-node-error' : ''} ${isExpanded ? 'sf-node-expanded' : ''} ${highlightClass}`;
      div.dataset.nodeId = node.id;
      div.dataset.depth = node.depth;
      div.style.height = `${this.nodeHeight}px`;
      div.style.paddingLeft = `${indent}px`;
      
      div.innerHTML = `
        ${hasChildren ? `
          <button class="sf-node-toggle" data-node-id="${node.id}">
            <svg viewBox="0 0 20 20" fill="currentColor" class="sf-toggle-icon ${isExpanded ? 'sf-expanded' : ''}">
              <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
            </svg>
          </button>
        ` : '<span class="sf-node-spacer"></span>'}
        
        <span class="sf-node-icon ${this._getNodeIconClass(node.type)}">
          ${this._getNodeIcon(node.type)}
        </span>
        
        <span class="sf-node-name" title="${this._escapeHtml(node.name)}">
          ${this._escapeHtml(node.name)}
        </span>
        
        <span class="sf-node-badges">
          ${node.hasError ? `<span class="sf-node-badge sf-badge-error">${(i18n.error || 'Error').toUpperCase()}</span>` : ''}
          ${node.soqlCount > 0 ? `<span class="sf-node-badge sf-badge-soql">${node.soqlCount} SOQL</span>` : ''}
          ${node.dmlCount > 0 ? `<span class="sf-node-badge sf-badge-dml">${node.dmlCount} DML</span>` : ''}
        </span>
        
        <span class="sf-node-duration ${this._getDurationClass(node.duration)}">
          ${node.duration.toFixed(2)}ms
        </span>
      `;
      
      return div;
    }

    /**
     * Set up event listeners
     * @private
     */
    _setupEventListeners() {
      if (this.listenersAttached) return;
      
      // Toolbar actions
      this.container.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (btn) {
          e.preventDefault();
          e.stopPropagation();
          
          const action = btn.dataset.action;
          switch (action) {
            case 'expand-all':
              this._expandAll();
              break;
            case 'collapse-all':
              this._collapseAll();
              break;
            case 'errors-only':
              this._toggleErrorsOnly();
              break;
            case 'toggle-export-menu':
              this._toggleExportMenu();
              break;
            case 'export-txt':
              this._exportReport('txt');
              this._toggleExportMenu(false);
              break;
            case 'export-md':
              this._exportReport('md');
              this._toggleExportMenu(false);
              break;
          }
          return;
        }
        
        // Close export menu when clicking outside
        const exportDropdown = e.target.closest('.sf-export-dropdown');
        if (!exportDropdown) {
          this._toggleExportMenu(false);
        }
        
        // Toggle expand/collapse
        const toggleBtn = e.target.closest('.sf-node-toggle');
        if (toggleBtn) {
          this._toggleNode(toggleBtn.dataset.nodeId);
          return;
        }
        
        // Node click
        const nodeEl = e.target.closest('.sf-call-tree-node');
        if (nodeEl) {
          this._selectNode(nodeEl.dataset.nodeId);
          return;
        }
        
        const topNodeItem = e.target.closest('.sf-top-node-item');
        if (topNodeItem) {
          this.scrollToNode(topNodeItem.dataset.nodeId);
          return;
        }
      });
      
      // Top nodes
      const searchInput = this.container.querySelector('.sf-call-tree-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          clearTimeout(this.searchDebounce);
          this.searchDebounce = setTimeout(() => {
            this.searchQuery = e.target.value;
            this._applySearch();
          }, 200);
        });
      }
      
      // Scroll
      const scrollContainer = this.container.querySelector('.sf-call-tree-scroll-container');
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', () => {
          this.scrollTop = scrollContainer.scrollTop;
          this._renderVisibleNodes();
        });
      }
      
      this.listenersAttached = true;
    }

    _toggleNode(nodeId) {
      if (this.expandedNodes.has(nodeId)) {
        this.expandedNodes.delete(nodeId);
      } else {
        this.expandedNodes.add(nodeId);
      }
      
      this._buildVisibleNodes();
      this._applyFilters();
    }

    /**
     * Expand all nodes
     * @private
     */
    _expandAll() {
      const addAllNodes = (node) => {
        this.expandedNodes.add(node.id);
        node.children.forEach(child => addAllNodes(child));
      };
      
      addAllNodes(this.callTree.root);
      this._buildVisibleNodes();
      this._applyFilters();
    }

    /**
     * Collapse all nodes
     * @private
     */
    _collapseAll() {
      this.expandedNodes.clear();
      this.expandedNodes.add(this.callTree.root.id);
      this._buildVisibleNodes();
      this._applyFilters();
    }

    /**
     * Toggle the errors-only filter
     * @private
     */
    _toggleErrorsOnly() {
      this.filters.errorsOnly = !this.filters.errorsOnly;

      const errorBtn = this.container.querySelector('[data-action="errors-only"]');
      if (errorBtn) {
        if (this.filters.errorsOnly) {
          errorBtn.classList.add('sf-btn-active');
        } else {
          errorBtn.classList.remove('sf-btn-active');
        }
      }

      this._applyFilters();
    }

    /**
     * Apply the search filter
     * @private
     */
    _applySearch() {
      if (!this.searchQuery) {
        this.filteredNodes = [...this.visibleNodes];
      } else {
        const query = this.searchQuery.toLowerCase();
        this.filteredNodes = this.visibleNodes.filter(node => {
          return node.name.toLowerCase().includes(query) || 
                 node.type.toLowerCase().includes(query);
        });
      }
      
      this._updateView();
    }

    /**
     * Apply additional filters
     * @private
     */
    _applyFilters() {
      this.filteredNodes = this.visibleNodes.filter(node => {
        if (this.filters.errorsOnly && !node.hasError) return false;
        if (this.filters.minDuration && node.duration < this.filters.minDuration) return false;
        if (this.filters.maxDepth !== null && node.depth > this.filters.maxDepth) return false;
        return true;
      });
      
      if (this.searchQuery) {
        this._applySearch();
        return;
      }
      
      this._updateView();
    }

    /**
     * Update the view
     * @private
     */
    _updateView() {
      if (this.scrollContainer) {
        this.viewportHeight = this.scrollContainer.clientHeight;
        this.scrollTop = this.scrollContainer.scrollTop;
      }

      // Update spacer height
      const spacer = this.container.querySelector('.sf-call-tree-spacer');
      if (spacer) {
        spacer.style.height = `${this.filteredNodes.length * this.nodeHeight}px`;
      }
      
      // Re-render
      this._renderVisibleNodes();
      
      if (this.scrollContainer) {
        const maxScroll = (this.filteredNodes.length * this.nodeHeight) - this.viewportHeight;
        if (this.scrollTop > maxScroll) {
          this.scrollContainer.scrollTop = 0;
          this.scrollTop = 0;
        }
      }
    }

    /**
     * Select a node and scroll to it inside the raw log
     * @private
     */
    _selectNode(nodeId) {
      const node = callTreeBuilder.getNode(this.parsedLog.metadata.id, nodeId);
      if (!node) return;
      
      logger.log(`Node selected: ${node.name} (line ${node.logLineIndex})`);
      
      // Dispatch an event to synchronize with the raw log
      document.dispatchEvent(new CustomEvent('foxlog:scrollToLine', {
        detail: { lineIndex: node.logLineIndex }
      }));
    }

    /**
     * Get the icon for a node type
     * @private
     */
    _getNodeIcon(type) {
      const icons = {
        'ROOT': '📦',
        'METHOD_ENTRY': '→',
        'SOQL_EXECUTE_BEGIN': '🔍',
        'DML_BEGIN': '💾',
        'EXCEPTION_THROWN': '⚠️',
        'USER_DEBUG': '🐛',
        'CODE_UNIT_STARTED': '📦'
      };
      return icons[type] || '•';
    }

    /**
     * Get the CSS class for the icon
     * @private
     */
    _getNodeIconClass(type) {
      return `sf-icon-${type.toLowerCase().replace(/_/g, '-')}`;
    }

    /**
     * Get the CSS class for the duration
     * @private
     */
    _getDurationClass(duration) {
      if (duration > 1000) return 'sf-duration-critical';
      if (duration > 500) return 'sf-duration-warning';
      return '';
    }

    /**
     * Escape HTML content
     * @private
     */
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
     * Toggle export menu visibility
     * @private
     * @param {boolean|undefined} forceState - Force open (true) or close (false)
     */
    _toggleExportMenu(forceState) {
      const menu = this.container.querySelector('.sf-export-menu');
      if (!menu) return;
      
      const isVisible = menu.style.display !== 'none';
      const newState = forceState !== undefined ? forceState : !isVisible;
      menu.style.display = newState ? 'block' : 'none';
    }

    /**
     * Build the call tree as text (recursive)
     * @private
     * @param {Object} node - Current node
     * @param {string} prefix - Line prefix for indentation
     * @param {boolean} isLast - Is this the last child
     * @param {string} format - 'txt' or 'md'
     * @returns {string[]} Array of lines
     */
    _buildTreeText(node, prefix = '', isLast = true, format = 'txt') {
      const lines = [];
      
      // Skip root node display but process children
      if (node.depth === 0) {
        node.children.forEach((child, index) => {
          const childIsLast = index === node.children.length - 1;
          lines.push(...this._buildTreeText(child, '', childIsLast, format));
        });
        return lines;
      }
      
      // Build node line
      const connector = isLast ? '└── ' : '├── ';
      const durationStr = node.duration > 0 ? ` (${node.duration.toFixed(2)}ms)` : '';
      const errorMark = node.hasError ? ' ❌' : '';
      const soqlMark = node.soqlCount > 0 ? ` [${node.soqlCount} SOQL]` : '';
      const dmlMark = node.dmlCount > 0 ? ` [${node.dmlCount} DML]` : '';
      
      let nodeLine;
      if (format === 'md') {
        // Markdown format with code styling
        const badges = [];
        if (node.hasError) badges.push('❌');
        if (node.soqlCount > 0) badges.push(`\`${node.soqlCount} SOQL\``);
        if (node.dmlCount > 0) badges.push(`\`${node.dmlCount} DML\``);
        const badgeStr = badges.length > 0 ? ' ' + badges.join(' ') : '';
        nodeLine = `${prefix}${connector}\`${node.name}\`${durationStr}${badgeStr}`;
      } else {
        // Plain text format
        nodeLine = `${prefix}${connector}${node.name}${durationStr}${errorMark}${soqlMark}${dmlMark}`;
      }
      
      lines.push(nodeLine);
      
      // Process children
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      node.children.forEach((child, index) => {
        const childIsLast = index === node.children.length - 1;
        lines.push(...this._buildTreeText(child, childPrefix, childIsLast, format));
      });
      
      return lines;
    }

    /**
     * Export a report with call tree
     * @private
     * @param {string} format - 'txt' or 'md'
     */
    _exportReport(format = 'txt') {
      try {
        const metadata = this.callTree.metadata;
        const topNodes = metadata.topSlowNodes || [];
        const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const isMd = format === 'md';
        
        let content;
        
        if (isMd) {
          // Markdown format
          content = this._buildMarkdownReport(metadata, topNodes, date);
        } else {
          // Plain text format
          content = this._buildTextReport(metadata, topNodes, date);
        }
        
        // Generate filename
        const fileDate = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const operation = (this.parsedLog.metadata.operation || 'report')
          .replace(/[^a-zA-Z0-9]/g, '_')
          .substring(0, 30);
        const filename = `foxlog_${operation}_${fileDate}.${format}`;
        
        // Download file
        const mimeType = isMd ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        logger.success(`Performance report exported as ${format.toUpperCase()}`);
        
        // Show toast via custom event
        document.dispatchEvent(new CustomEvent('foxlog:showToast', {
          detail: { message: `✅ ${i18n.exportSuccess || 'Exported successfully!'}` }
        }));
      } catch (error) {
        logger.error('Export failed', error);
        document.dispatchEvent(new CustomEvent('foxlog:showToast', {
          detail: { message: `❌ ${i18n.exportError || 'Export error'}`, type: 'error' }
        }));
      }
    }

    /**
     * Build plain text report
     * @private
     */
    _buildTextReport(metadata, topNodes, date) {
      const lines = [
        '╔══════════════════════════════════════════════════════════════════╗',
        '║                    🦊 FoxLog - Performance Report                ║',
        '╚══════════════════════════════════════════════════════════════════╝',
        '',
        `📅 ${i18n.exportedOn || 'Exported on'}: ${date}`,
        `📋 ${i18n.operation || 'Operation'}: ${this.parsedLog.metadata.operation || 'N/A'}`,
        `⏱️  ${i18n.totalDuration || 'Total Duration'}: ${metadata.totalDuration?.toFixed(2) || 0}ms`,
        `📊 ${i18n.totalNodes || 'Total Nodes'}: ${metadata.totalNodes || 0}`,
        `❌ ${i18n.totalErrors || 'Errors'}: ${metadata.errorCount || 0}`,
        '',
        '─'.repeat(70),
        `⚡ ${i18n.topSlowestNodes || 'TOP 5 SLOWEST NODES'}`,
        '─'.repeat(70),
        ''
      ];
      
      if (topNodes.length > 0) {
        topNodes.forEach((node, index) => {
          lines.push(`  #${index + 1} │ ${node.duration.toFixed(2)}ms │ ${node.type}`);
          lines.push(`     └─ ${node.name}`);
          lines.push('');
        });
      } else {
        lines.push(`  ${i18n.noSlowNodes || 'No slow nodes detected'}`);
        lines.push('');
      }
      
      // Add call tree
      lines.push('─'.repeat(70));
      lines.push(`📂 ${i18n.callTree || 'CALL TREE'}`);
      lines.push('─'.repeat(70));
      lines.push('');
      
      const treeLines = this._buildTreeText(this.callTree.root, '', true, 'txt');
      lines.push(...treeLines);
      
      lines.push('');
      lines.push('─'.repeat(70));
      lines.push(`${i18n.generatedBy || 'Generated by'} FoxLog - Salesforce Debug Log Analyzer`);
      lines.push('');
      
      return lines.join('\n');
    }

    /**
     * Build Markdown report
     * @private
     */
    _buildMarkdownReport(metadata, topNodes, date) {
      const lines = [
        '# 🦊 FoxLog - Performance Report',
        '',
        '## 📋 Summary',
        '',
        '| Metric | Value |',
        '|--------|-------|',
        `| ${i18n.exportedOn || 'Exported on'} | ${date} |`,
        `| ${i18n.operation || 'Operation'} | ${this.parsedLog.metadata.operation || 'N/A'} |`,
        `| ${i18n.totalDuration || 'Total Duration'} | **${metadata.totalDuration?.toFixed(2) || 0}ms** |`,
        `| ${i18n.totalNodes || 'Total Nodes'} | ${metadata.totalNodes || 0} |`,
        `| ${i18n.totalErrors || 'Errors'} | ${metadata.errorCount || 0} |`,
        '',
        `## ⚡ ${i18n.topSlowestNodes || 'Top 5 Slowest Nodes'}`,
        ''
      ];
      
      if (topNodes.length > 0) {
        lines.push('| Rank | Duration | Type | Name |');
        lines.push('|------|----------|------|------|');
        topNodes.forEach((node, index) => {
          lines.push(`| #${index + 1} | **${node.duration.toFixed(2)}ms** | \`${node.type}\` | ${node.name} |`);
        });
      } else {
        lines.push(`> ${i18n.noSlowNodes || 'No slow nodes detected'}`);
      }
      
      // Add call tree
      lines.push('');
      lines.push(`## 📂 ${i18n.callTree || 'Call Tree'}`);
      lines.push('');
      lines.push('```');
      
      const treeLines = this._buildTreeText(this.callTree.root, '', true, 'txt');
      lines.push(...treeLines);
      
      lines.push('```');
      lines.push('');
      lines.push('---');
      lines.push(`*${i18n.generatedBy || 'Generated by'} [FoxLog](https://github.com/your-repo) - Salesforce Debug Log Analyzer*`);
      lines.push('');
      
      return lines.join('\n');
    }

    /**
     * Destroy the view
     */
    destroy() {
      clearTimeout(this.searchDebounce);
    }
  }

  // Exposer le composant
  window.FoxLog.CallTreeView = CallTreeView;
  
  logger.log('[FoxLog] CallTreeView loaded');
})();