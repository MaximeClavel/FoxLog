// src/ui/call-graph-view.js
// n8n-style visual execution graph for a CallTree: pannable/zoomable node canvas
// with a searchable node list on the left and a detail panel on the right.

(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;
  const escapeHtml = window.FoxLog.escapeHtml || (s => s || '');

  // Node type -> visual category, grouped for filtering
  const CATEGORY_META = {
    root:       { icon: 'package',        group: 'automation', label: 'Transaction' },
    trigger:    { icon: 'zap',            group: 'automation', label: 'Trigger' },
    flow:       { icon: 'shuffle',        group: 'automation', label: 'Flow' },
    workflow:   { icon: 'settings',       group: 'automation', label: 'Workflow' },
    validation: { icon: 'shield-check',   group: 'automation', label: 'Validation' },
    codeunit:   { icon: 'package',        group: 'automation', label: 'Code Unit' },
    method:     { icon: 'code',           group: 'apex',        label: 'Method' },
    soql:       { icon: 'search',         group: 'database',    label: 'SOQL' },
    dml:        { icon: 'database',       group: 'database',    label: 'DML' },
    error:      { icon: 'alert-triangle', group: 'errors',      label: 'Error' },
    debug:      { icon: 'bug',            group: 'debug',       label: 'Debug' },
    variable:   { icon: 'file-text',      group: 'debug',       label: 'Variable' },
    other:      { icon: 'info',           group: 'apex',        label: 'Event' }
  };

  function classify(node) {
    const type = node.type;
    if (type === 'ROOT') return 'root';
    if (type === 'EXCEPTION_THROWN' || type === 'FATAL_ERROR') return 'error';
    if (type === 'SOQL_EXECUTE_BEGIN') return 'soql';
    if (type === 'DML_BEGIN') return 'dml';
    if (type === 'METHOD_ENTRY' || type === 'CONSTRUCTOR_ENTRY') return 'method';
    if (type === 'USER_DEBUG') return 'debug';
    if (type === 'VARIABLE_ASSIGNMENT') return 'variable';
    if (type === 'CODE_UNIT_STARTED') {
      const name = node.name || '';
      if (/trigger event/i.test(name)) return 'trigger';
      if (/\bflow\b/i.test(name)) return 'flow';
      if (/\bworkflow\b/i.test(name)) return 'workflow';
      if (/\bvalidation\b/i.test(name)) return 'validation';
      return 'codeunit';
    }
    return 'other';
  }

  class CallGraphView {
    constructor(container, callTree, parsedLog) {
      this.container = container;
      this.callTree = callTree;
      this.parsedLog = parsedLog;

      this.expandedNodes = new Set();
      this.groupFilters = { automation: true, apex: true, database: true, errors: true, debug: false };
      this.searchQuery = '';
      this.selectedNodeId = null;

      this.transform = { x: 0, y: 0, scale: 1 };
      this.isPanning = false;
      this.panStart = null;
      this._dragDistance = 0;

      this.NODE_WIDTH = 220;
      this.NODE_HEIGHT = 60;
      this.COLUMN_GAP = 80;
      this.ROW_GAP = 18;
      this.PADDING = 50;
      this.EXPAND_ALL_CAP = 600;
      this.LIST_CAP = 500;

      this.lastLayout = null;
      this.allNodesFlat = [];
      this.nodeById = new Map();
      this.parentById = new Map();

      this.searchDebounce = null;
      this.listenersAttached = false;
    }

    /**
     * Initialize and render the view
     */
    async init() {
      this._indexTree();
      this._initExpandedState();
      this._render();
      await this._afterRender();
      logger.success('CallGraphView initialized');
    }

    /**
     * Build flat lookup structures for the whole tree (search, path expansion)
     * @private
     */
    _indexTree() {
      const walk = (node, parent) => {
        this.allNodesFlat.push(node);
        this.nodeById.set(node.id, node);
        if (parent) this.parentById.set(node.id, parent);
        node.children.forEach(child => walk(child, node));
      };
      walk(this.callTree.root, null);
    }

    /**
     * Default expand state: root + first level of children visible
     * @private
     */
    _initExpandedState() {
      this.allNodesFlat.forEach(node => {
        if (node.depth <= 1) this.expandedNodes.add(node.id);
      });
    }

    _getCategory(node) {
      return classify(node);
    }

    _passesFilter(node) {
      const cat = classify(node);
      const meta = CATEGORY_META[cat] || CATEGORY_META.other;
      return !!this.groupFilters[meta.group];
    }

    // ============================================
    // RENDER: STATIC SHELL
    // ============================================

    _render() {
      const meta = this.callTree.metadata || {};
      this.container.innerHTML = `
        <div class="sf-graph-view">
          <div class="sf-graph-stats">
            <div class="sf-graph-stat">
              <span class="sf-graph-stat-label">${i18n.duration || 'Duration'}</span>
              <span class="sf-graph-stat-value">${(meta.totalDuration || 0).toFixed(0)}ms</span>
            </div>
            <div class="sf-graph-stat">
              <span class="sf-graph-stat-label">SOQL</span>
              <span class="sf-graph-stat-value">${meta.soqlCount || 0}</span>
            </div>
            <div class="sf-graph-stat">
              <span class="sf-graph-stat-label">DML</span>
              <span class="sf-graph-stat-value">${meta.dmlCount || 0}</span>
            </div>
            <div class="sf-graph-stat">
              <span class="sf-graph-stat-label">${i18n.totalNodes || 'Nodes'}</span>
              <span class="sf-graph-stat-value">${meta.totalNodes || 0}</span>
            </div>
            <div class="sf-graph-stat ${meta.errorCount ? 'sf-graph-stat--error' : ''}">
              <span class="sf-graph-stat-label">${i18n.errors || 'Errors'}</span>
              <span class="sf-graph-stat-value">${meta.errorCount || 0}</span>
            </div>
          </div>

          <div class="sf-graph-body">
            <aside class="sf-graph-panel sf-graph-panel-left">
              <div class="sf-call-tree-search sf-graph-search">
                <svg class="sf-search-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
                </svg>
                <input type="text" class="sf-call-tree-search-input sf-graph-search-input" placeholder="${i18n.searchInGraph || 'Search a node...'}" />
              </div>

              <div class="sf-call-tree-filters sf-graph-filters">
                <span class="sf-filters-label">${i18n.filterBy || 'Filter'}:</span>
                <div class="sf-filter-toggles">
                  <button class="sf-filter-toggle sf-filter-active" data-filter="automation" title="${i18n.filterTriggersFlows || 'Triggers & Flows'}">
                    <span class="sf-filter-icon">${window.FoxLog.icon('zap')}</span>
                    <span class="sf-filter-text">${i18n.filterTriggersFlows || 'Triggers & Flows'}</span>
                  </button>
                  <button class="sf-filter-toggle sf-filter-active" data-filter="apex" title="${i18n.filterApex || 'Apex'}">
                    <span class="sf-filter-icon">${window.FoxLog.icon('code')}</span>
                    <span class="sf-filter-text">${i18n.filterApex || 'Apex'}</span>
                  </button>
                  <button class="sf-filter-toggle sf-filter-active" data-filter="database" title="${i18n.filterDatabase || 'Database'}">
                    <span class="sf-filter-icon">${window.FoxLog.icon('database')}</span>
                    <span class="sf-filter-text">${i18n.database || 'Database'}</span>
                  </button>
                  <button class="sf-filter-toggle sf-filter-active" data-filter="errors" title="${i18n.filterErrors || 'Errors'}">
                    <span class="sf-filter-icon">${window.FoxLog.icon('alert-circle')}</span>
                    <span class="sf-filter-text">${i18n.errors || 'Errors'}</span>
                  </button>
                  <button class="sf-filter-toggle" data-filter="debug" title="${i18n.filterDebug || 'Debug'}">
                    <span class="sf-filter-icon">${window.FoxLog.icon('bug')}</span>
                    <span class="sf-filter-text">${i18n.debug || 'Debug'}</span>
                  </button>
                </div>
              </div>

              <div class="sf-graph-list-label">${i18n.graphNodeList || 'Notable nodes'}</div>
              <div class="sf-graph-list"></div>
            </aside>

            <div class="sf-graph-main">
              <div class="sf-graph-toolbar">
                <div class="sf-graph-breadcrumb"></div>
                <div class="sf-graph-toolbar-actions">
                  <button class="sf-call-tree-btn" data-action="expand-all" title="${i18n.expandAll || 'Expand All'}">
                    <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>
                  </button>
                  <button class="sf-call-tree-btn" data-action="collapse-all" title="${i18n.collapseAll || 'Collapse All'}">
                    <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>
                  </button>
                  <span class="sf-graph-toolbar-sep"></span>
                  <button class="sf-call-tree-btn" data-action="zoom-out" title="${i18n.zoomOut || 'Zoom out'}">−</button>
                  <button class="sf-call-tree-btn sf-graph-zoom-label" data-action="zoom-reset" title="${i18n.resetZoom || 'Reset zoom'}">100%</button>
                  <button class="sf-call-tree-btn" data-action="zoom-in" title="${i18n.zoomIn || 'Zoom in'}">+</button>
                  <button class="sf-call-tree-btn" data-action="fit-view" title="${i18n.fitView || 'Fit view'}">
                    ${window.FoxLog.icon('map-pin', { size: 14 })}
                  </button>
                </div>
              </div>

              <div class="sf-graph-viewport">
                <div class="sf-graph-canvas">
                  <svg class="sf-graph-edges"></svg>
                  <div class="sf-graph-nodes"></div>
                </div>
              </div>
            </div>

            <aside class="sf-graph-panel sf-graph-panel-right sf-graph-detail"></aside>
          </div>
        </div>
      `;
    }

    _afterRender() {
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          this.viewportEl = this.container.querySelector('.sf-graph-viewport');
          this.canvasEl = this.container.querySelector('.sf-graph-canvas');
          this.edgesSvg = this.container.querySelector('.sf-graph-edges');
          this.nodesLayer = this.container.querySelector('.sf-graph-nodes');
          this.listEl = this.container.querySelector('.sf-graph-list');
          this.detailEl = this.container.querySelector('.sf-graph-detail');
          this.breadcrumbEl = this.container.querySelector('.sf-graph-breadcrumb');
          this.zoomLabelEl = this.container.querySelector('.sf-graph-zoom-label');

          this._layoutAndRender();
          this._setupEventListeners();
          this._fitView();
          resolve();
        });
      });
    }

    // ============================================
    // LAYOUT (tidy tree, left-to-right)
    // ============================================

    _buildVisibleTree(node) {
      const v = { id: node.id, node, depth: node.depth, children: [], hiddenCount: 0 };
      const kids = node.children.filter(c => this._passesFilter(c));
      if (this.expandedNodes.has(node.id)) {
        kids.forEach(k => v.children.push(this._buildVisibleTree(k)));
      } else {
        v.hiddenCount = kids.length;
      }
      return v;
    }

    _layoutAndRender() {
      const vroot = this._buildVisibleTree(this.callTree.root);

      let leafCounter = 0;
      const assignSlot = (v) => {
        if (v.children.length === 0) {
          v.slot = leafCounter++;
        } else {
          v.children.forEach(assignSlot);
          let minSlot = Infinity;
          let maxSlot = -Infinity;
          v.children.forEach(c => {
            if (c.slot < minSlot) minSlot = c.slot;
            if (c.slot > maxSlot) maxSlot = c.slot;
          });
          v.slot = (minSlot + maxSlot) / 2;
        }
      };
      assignSlot(vroot);

      const nodesFlat = [];
      const edgesFlat = [];
      const walk = (v) => {
        v.x = this.PADDING + v.depth * (this.NODE_WIDTH + this.COLUMN_GAP);
        v.y = this.PADDING + v.slot * (this.NODE_HEIGHT + this.ROW_GAP);
        nodesFlat.push(v);
        v.children.forEach(child => {
          edgesFlat.push({ parent: v, child });
          walk(child);
        });
      };
      walk(vroot);

      let maxNodeX = 0;
      let maxNodeY = 0;
      nodesFlat.forEach(n => {
        if (n.x > maxNodeX) maxNodeX = n.x;
        if (n.y > maxNodeY) maxNodeY = n.y;
      });
      const maxX = maxNodeX + this.NODE_WIDTH + this.PADDING;
      const maxY = maxNodeY + this.NODE_HEIGHT + this.PADDING;

      this.lastLayout = { nodesFlat, edgesFlat, width: maxX, height: maxY };

      this._renderEdges();
      this._renderNodes();
      this._renderList();
      this._renderDetail();
      this._renderBreadcrumb();
    }

    // ============================================
    // RENDER: DYNAMIC PARTS
    // ============================================

    _renderEdges() {
      if (!this.edgesSvg || !this.lastLayout) return;
      const { width, height, edgesFlat } = this.lastLayout;

      this.edgesSvg.setAttribute('width', width);
      this.edgesSvg.setAttribute('height', height);

      const paths = edgesFlat.map(({ parent, child }) => {
        const x1 = parent.x + this.NODE_WIDTH;
        const y1 = parent.y + this.NODE_HEIGHT / 2;
        const x2 = child.x;
        const y2 = child.y + this.NODE_HEIGHT / 2;
        const midX = (x1 + x2) / 2;
        const errorClass = child.node.hasError ? ' sf-graph-edge--error' : '';
        return `<path class="sf-graph-edge${errorClass}" d="M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}" fill="none"/>`;
      }).join('');

      this.edgesSvg.innerHTML = paths;

      if (this.canvasEl) {
        this.canvasEl.style.width = `${width}px`;
        this.canvasEl.style.height = `${height}px`;
      }
    }

    _renderNodes() {
      if (!this.nodesLayer || !this.lastLayout) return;
      const frag = document.createDocumentFragment();
      this.lastLayout.nodesFlat.forEach(v => frag.appendChild(this._createNodeEl(v)));
      this.nodesLayer.innerHTML = '';
      this.nodesLayer.appendChild(frag);
    }

    _createNodeEl(v) {
      const node = v.node;
      const cat = classify(node);
      const meta = CATEGORY_META[cat] || CATEGORY_META.other;
      const isSelected = this.selectedNodeId === node.id;
      const hasOwnError = cat === 'error';
      const ancestorError = cat !== 'root' && !hasOwnError && node.hasError;

      const el = document.createElement('div');
      el.className = [
        'sf-graph-node',
        `sf-graph-node--${cat}`,
        isSelected ? 'sf-graph-node--selected' : '',
        ancestorError ? 'sf-graph-node--has-error' : ''
      ].filter(Boolean).join(' ');
      el.dataset.nodeId = node.id;
      el.style.left = `${v.x}px`;
      el.style.top = `${v.y}px`;
      el.style.width = `${this.NODE_WIDTH}px`;

      const name = escapeHtml(node.name || meta.label);
      const durationStr = node.duration ? `${node.duration.toFixed(1)}ms` : '';

      let toggleHtml = '';
      if (v.hiddenCount > 0) {
        toggleHtml = `<button class="sf-graph-node-toggle sf-graph-node-toggle--expand" data-node-id="${node.id}" title="${i18n.expandNode || 'Expand'}">+${v.hiddenCount}</button>`;
      } else if (node.children.length > 0) {
        toggleHtml = `<button class="sf-graph-node-toggle sf-graph-node-toggle--collapse" data-node-id="${node.id}" title="${i18n.collapseNode || 'Collapse'}">−</button>`;
      }

      el.innerHTML = `
        <div class="sf-graph-node-row">
          <span class="sf-graph-node-icon">${window.FoxLog.icon(meta.icon, { size: 14 })}</span>
          <span class="sf-graph-node-name" title="${name}">${name}</span>
        </div>
        <div class="sf-graph-node-meta">
          ${durationStr ? `<span class="sf-graph-node-duration">${durationStr}</span>` : ''}
          ${node.soqlCount ? `<span class="sf-graph-node-badge sf-graph-badge-soql">${node.soqlCount} SOQL</span>` : ''}
          ${node.dmlCount ? `<span class="sf-graph-node-badge sf-graph-badge-dml">${node.dmlCount} DML</span>` : ''}
          ${node.hasError ? `<span class="sf-graph-node-badge sf-graph-badge-error">${window.FoxLog.icon('alert-circle', { size: 11 })}</span>` : ''}
        </div>
        ${toggleHtml}
      `;

      return el;
    }

    _renderList() {
      if (!this.listEl) return;
      const q = this.searchQuery.trim().toLowerCase();

      const items = this.allNodesFlat.filter(node => {
        if (node.type === 'ROOT') return false;
        if (!this._passesFilter(node)) return false;
        if (q) {
          return node.name.toLowerCase().includes(q) || node.type.toLowerCase().includes(q);
        }
        const group = CATEGORY_META[classify(node)].group;
        return group !== 'apex' && group !== 'debug';
      });

      if (items.length === 0) {
        this.listEl.innerHTML = `<div class="sf-graph-list-empty">${i18n.noGraphResults || 'No matching node'}</div>`;
        return;
      }

      const capped = items.slice(0, this.LIST_CAP);
      let html = capped.map(node => this._renderListItem(node)).join('');
      if (items.length > this.LIST_CAP) {
        html += `<div class="sf-graph-list-more">+${items.length - this.LIST_CAP} ${i18n.moreNodes || 'more'}</div>`;
      }
      this.listEl.innerHTML = html;
    }

    _renderListItem(node) {
      const cat = classify(node);
      const meta = CATEGORY_META[cat] || CATEGORY_META.other;
      const isActive = this.selectedNodeId === node.id;
      const name = escapeHtml(node.name || meta.label);
      const line = Number.isInteger(node.logLineIndex) ? node.logLineIndex + 1 : '-';
      const durationStr = node.duration ? ` · ${node.duration.toFixed(1)}ms` : '';

      return `
        <button class="sf-graph-list-item sf-graph-list-item--${cat} ${isActive ? 'sf-graph-list-item--active' : ''}" data-node-id="${node.id}">
          <span class="sf-graph-list-icon">${window.FoxLog.icon(meta.icon, { size: 13 })}</span>
          <span class="sf-graph-list-text">
            <span class="sf-graph-list-name" title="${name}">${name}</span>
            <span class="sf-graph-list-sub">${i18n.lineNumber || 'Line'} ${line}${durationStr}</span>
          </span>
          ${node.hasError ? `<span class="sf-graph-list-error">${window.FoxLog.icon('alert-circle', { size: 12 })}</span>` : ''}
        </button>
      `;
    }

    _renderDetail() {
      if (!this.detailEl) return;

      if (!this.selectedNodeId) {
        this.detailEl.innerHTML = `
          <div class="sf-graph-detail-empty">
            <div class="sf-graph-detail-empty-icon">${window.FoxLog.icon('map-pin', { size: 22 })}</div>
            <p>${i18n.noNodeSelected || 'No node selected'}</p>
            <p class="sf-hint">${i18n.clickNodeForDetails || 'Click a node in the graph to see its details'}</p>
          </div>
        `;
        return;
      }

      const node = this.nodeById.get(this.selectedNodeId);
      if (!node) {
        this.selectedNodeId = null;
        this._renderDetail();
        return;
      }

      const cat = classify(node);
      const meta = CATEGORY_META[cat] || CATEGORY_META.other;
      const name = escapeHtml(node.name || meta.label);
      const details = node.details || {};

      let extra = '';
      if (cat === 'soql' && (details.fullQuery || details.query)) {
        extra = `
          <div class="sf-graph-detail-block">
            <div class="sf-graph-detail-label">SOQL</div>
            <pre class="sf-graph-detail-code">${escapeHtml(details.fullQuery || details.query)}</pre>
          </div>
        `;
      } else if (cat === 'dml') {
        const parts = [details.operation, details.objectType, details.rows ? `(${details.rows} rows)` : ''].filter(Boolean);
        extra = `
          <div class="sf-graph-detail-block">
            <div class="sf-graph-detail-label">DML</div>
            <div>${escapeHtml(parts.join(' '))}</div>
          </div>
        `;
      } else if (cat === 'error') {
        extra = `
          <div class="sf-graph-detail-block sf-graph-detail-block--error">
            <div class="sf-graph-detail-label">${escapeHtml(details.exceptionType || 'Exception')}</div>
            <div>${escapeHtml(details.message || '')}</div>
          </div>
        `;
      } else if (cat === 'debug') {
        extra = `
          <div class="sf-graph-detail-block">
            <div class="sf-graph-detail-label">[${escapeHtml(details.level || 'DEBUG')}]</div>
            <div>${escapeHtml(details.message || '')}</div>
          </div>
        `;
      }

      const gotoBtn = Number.isInteger(node.logLineIndex) ? `
        <button class="sf-graph-detail-goto" data-action="goto-line" data-line="${node.logLineIndex}">
          ${window.FoxLog.icon('arrow-right', { size: 13 })} ${i18n.viewInRawLog || 'View in raw log'} · ${i18n.lineNumber || 'Line'} ${node.logLineIndex + 1}
        </button>
      ` : '';

      this.detailEl.innerHTML = `
        <div class="sf-graph-detail-header">
          <span class="sf-graph-detail-icon sf-graph-node--${cat}">${window.FoxLog.icon(meta.icon, { size: 18 })}</span>
          <div>
            <div class="sf-graph-detail-name" title="${name}">${name}</div>
            <div class="sf-graph-detail-type">${escapeHtml(node.type)}</div>
          </div>
        </div>
        ${node.hasError ? `<div class="sf-graph-detail-error-banner">${window.FoxLog.icon('alert-triangle', { size: 13 })} ${i18n.errors || 'Errors'} ${i18n.impact || 'downstream'}</div>` : ''}
        <div class="sf-graph-detail-grid">
          <div class="sf-graph-detail-stat"><span>${i18n.totalDurationLabel || 'Total duration'}</span><strong>${(node.duration || 0).toFixed(2)}ms</strong></div>
          <div class="sf-graph-detail-stat"><span>${i18n.exclusiveDuration || 'Exclusive duration'}</span><strong>${(node.exclusiveDuration || 0).toFixed(2)}ms</strong></div>
          <div class="sf-graph-detail-stat"><span>${i18n.childrenCount || 'Direct children'}</span><strong>${node.children.length}</strong></div>
          <div class="sf-graph-detail-stat"><span>SOQL / DML</span><strong>${node.soqlCount || 0} / ${node.dmlCount || 0}</strong></div>
        </div>
        ${extra}
        ${gotoBtn}
      `;
    }

    _renderBreadcrumb() {
      if (!this.breadcrumbEl) return;
      const { callTreeBuilder } = window.FoxLog;
      const logId = this.parsedLog.metadata.id;

      let path;
      if (this.selectedNodeId && callTreeBuilder) {
        path = callTreeBuilder.getNodePath(logId, this.selectedNodeId);
      } else {
        const root = this.callTree.root;
        path = [{ id: root.id, name: root.name, type: root.type }];
      }

      this.breadcrumbEl.innerHTML = path.map((p, i) => `
        <button class="sf-graph-crumb" data-node-id="${p.id}" title="${escapeHtml(p.name)}">${escapeHtml(this._truncate(p.name, 28))}</button>
        ${i < path.length - 1 ? '<span class="sf-graph-crumb-sep">›</span>' : ''}
      `).join('');
    }

    _truncate(str, max) {
      if (!str) return '';
      return str.length > max ? str.slice(0, max - 1) + '…' : str;
    }

    // ============================================
    // ACTIONS
    // ============================================

    _toggleNode(nodeId) {
      if (this.expandedNodes.has(nodeId)) {
        this.expandedNodes.delete(nodeId);
        this._layoutAndRender();
        this._panToNode(nodeId);
        return;
      }

      // A node with an extreme fan-out (e.g. one debug/child call per record
      // in a large batch) would reveal thousands of siblings in one shot,
      // which is both unreadable and heavy to lay out. Cap it like _expandAll.
      const node = this.nodeById.get(nodeId);
      const childCount = node ? node.children.filter(c => this._passesFilter(c)).length : 0;
      if (childCount > this.EXPAND_ALL_CAP) {
        document.dispatchEvent(new CustomEvent('foxlog:showToast', {
          detail: { message: i18n.graphTooLargeWarning || 'Large tree: expand depth capped to keep things smooth', type: 'warning' }
        }));
        return;
      }

      this.expandedNodes.add(nodeId);
      this._layoutAndRender();
      this._panToNode(nodeId);
    }

    _expandAll() {
      const total = this.callTree.metadata.totalNodes || this.allNodesFlat.length;
      if (total > this.EXPAND_ALL_CAP) {
        this.allNodesFlat.forEach(node => {
          if (node.depth <= 5) this.expandedNodes.add(node.id);
        });
        document.dispatchEvent(new CustomEvent('foxlog:showToast', {
          detail: { message: i18n.graphTooLargeWarning || 'Large tree: expand depth capped to keep things smooth', type: 'warning' }
        }));
      } else {
        this.allNodesFlat.forEach(node => this.expandedNodes.add(node.id));
      }
      this._layoutAndRender();
    }

    _collapseAll() {
      this.expandedNodes.clear();
      this.expandedNodes.add(this.callTree.root.id);
      this.selectedNodeId = null;
      this._layoutAndRender();
      this._fitView();
    }

    _toggleGroupFilter(group) {
      if (!(group in this.groupFilters)) return;
      this.groupFilters[group] = !this.groupFilters[group];
      this._syncFilterChipsUI();
      this._layoutAndRender();
    }

    _syncFilterChipsUI() {
      Object.keys(this.groupFilters).forEach(group => {
        const btn = this.container.querySelector(`[data-filter="${group}"]`);
        if (btn) btn.classList.toggle('sf-filter-active', this.groupFilters[group]);
      });
    }

    _expandPathTo(nodeId) {
      let current = this.nodeById.get(nodeId);
      while (current) {
        this.expandedNodes.add(current.id);
        current = this.parentById.get(current.id);
      }
    }

    _selectNode(nodeId) {
      const prev = this.selectedNodeId;
      this.selectedNodeId = nodeId || null;

      if (this.nodesLayer) {
        if (prev) {
          const prevEl = this.nodesLayer.querySelector(`[data-node-id="${prev}"]`);
          if (prevEl) prevEl.classList.remove('sf-graph-node--selected');
        }
        if (this.selectedNodeId) {
          const newEl = this.nodesLayer.querySelector(`[data-node-id="${this.selectedNodeId}"]`);
          if (newEl) newEl.classList.add('sf-graph-node--selected');
        }
      }

      this._renderDetail();
      this._renderBreadcrumb();
      this._renderListSelection();
    }

    _renderListSelection() {
      if (!this.listEl) return;
      this.listEl.querySelectorAll('.sf-graph-list-item--active').forEach(el => el.classList.remove('sf-graph-list-item--active'));
      if (this.selectedNodeId) {
        const el = this.listEl.querySelector(`[data-node-id="${this.selectedNodeId}"]`);
        if (el) el.classList.add('sf-graph-list-item--active');
      }
    }

    /**
     * Select a node coming from the side list / breadcrumb: reveal its path,
     * auto-enable its filter group if needed, and pan the canvas to it.
     * @private
     */
    _selectAndReveal(nodeId) {
      const node = this.nodeById.get(nodeId);
      if (!node) return;

      const cat = classify(node);
      const group = CATEGORY_META[cat].group;
      if (!this.groupFilters[group]) {
        this.groupFilters[group] = true;
        this._syncFilterChipsUI();
      }

      this._expandPathTo(nodeId);
      this.selectedNodeId = nodeId;
      this._layoutAndRender();
      this._panToNode(nodeId);
    }

    _panToNode(nodeId) {
      if (!this.lastLayout || !this.viewportEl) return;
      const v = this.lastLayout.nodesFlat.find(n => n.id === nodeId);
      if (!v) return;

      const rect = this.viewportEl.getBoundingClientRect();
      const scale = this.transform.scale || 1;
      const cx = v.x + this.NODE_WIDTH / 2;
      const cy = v.y + this.NODE_HEIGHT / 2;

      this.transform.x = rect.width / 2 - cx * scale;
      this.transform.y = rect.height / 2 - cy * scale;
      this._applyTransform();
    }

    // ============================================
    // PAN & ZOOM
    // ============================================

    _applyTransform() {
      if (!this.canvasEl) return;
      this.canvasEl.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
      if (this.zoomLabelEl) this.zoomLabelEl.textContent = `${Math.round(this.transform.scale * 100)}%`;
    }

    _zoomAt(cx, cy, factor) {
      const newScale = Math.min(2.5, Math.max(0.15, this.transform.scale * factor));
      const ratio = newScale / this.transform.scale;
      this.transform.x = cx - (cx - this.transform.x) * ratio;
      this.transform.y = cy - (cy - this.transform.y) * ratio;
      this.transform.scale = newScale;
      this._applyTransform();
    }

    _zoomBy(factor) {
      if (!this.viewportEl) return;
      const rect = this.viewportEl.getBoundingClientRect();
      this._zoomAt(rect.width / 2, rect.height / 2, factor);
    }

    _resetZoom() {
      this.transform.scale = 1;
      this._applyTransform();
    }

    _fitView() {
      if (!this.lastLayout || !this.viewportEl) return;
      const rect = this.viewportEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const { width, height } = this.lastLayout;
      const scale = Math.max(0.15, Math.min(2.5, Math.min(rect.width / width, rect.height / height, 1.1)));

      this.transform.scale = scale;
      this.transform.x = (rect.width - width * scale) / 2;
      this.transform.y = (rect.height - height * scale) / 2;
      this._applyTransform();
    }

    _setupPanning() {
      const vp = this.viewportEl;
      if (!vp) return;

      const onMouseDown = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.sf-graph-node') || e.target.closest('.sf-graph-node-toggle')) return;
        this.isPanning = true;
        this._dragDistance = 0;
        this.panStart = { x: e.clientX, y: e.clientY, tx: this.transform.x, ty: this.transform.y };
        vp.classList.add('sf-graph-panning');
      };

      const onMouseMove = (e) => {
        if (!this.isPanning) return;
        const dx = e.clientX - this.panStart.x;
        const dy = e.clientY - this.panStart.y;
        this._dragDistance = Math.max(this._dragDistance, Math.abs(dx), Math.abs(dy));
        this.transform.x = this.panStart.tx + dx;
        this.transform.y = this.panStart.ty + dy;
        this._applyTransform();
      };

      const onMouseUp = () => {
        if (!this.isPanning) return;
        this.isPanning = false;
        vp.classList.remove('sf-graph-panning');
        if (this._dragDistance < 4) {
          this._selectNode(null);
        }
      };

      const onWheel = (e) => {
        e.preventDefault();
        const rect = vp.getBoundingClientRect();
        const factor = e.deltaY < 0 ? 1.12 : (1 / 1.12);
        this._zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
      };

      vp.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      vp.addEventListener('wheel', onWheel, { passive: false });

      this._onPanMove = onMouseMove;
      this._onPanEnd = onMouseUp;
    }

    // ============================================
    // EVENTS
    // ============================================

    _setupEventListeners() {
      if (this.listenersAttached) return;

      this.container.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.sf-graph-node-toggle');
        if (toggleBtn) {
          e.stopPropagation();
          this._toggleNode(toggleBtn.dataset.nodeId);
          return;
        }

        const nodeEl = e.target.closest('.sf-graph-node');
        if (nodeEl) {
          this._selectNode(nodeEl.dataset.nodeId);
          return;
        }

        const listItem = e.target.closest('.sf-graph-list-item');
        if (listItem) {
          this._selectAndReveal(listItem.dataset.nodeId);
          return;
        }

        const crumb = e.target.closest('.sf-graph-crumb');
        if (crumb) {
          this._selectAndReveal(crumb.dataset.nodeId);
          return;
        }

        const filterBtn = e.target.closest('[data-filter]');
        if (filterBtn) {
          this._toggleGroupFilter(filterBtn.dataset.filter);
          return;
        }

        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
          this._handleAction(actionBtn.dataset.action, actionBtn);
        }
      });

      const searchInput = this.container.querySelector('.sf-graph-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          clearTimeout(this.searchDebounce);
          this.searchDebounce = setTimeout(() => {
            this.searchQuery = e.target.value;
            this._renderList();
          }, 200);
        });
      }

      this._setupPanning();
      this.listenersAttached = true;
    }

    _handleAction(action, btn) {
      switch (action) {
        case 'expand-all':
          this._expandAll();
          break;
        case 'collapse-all':
          this._collapseAll();
          break;
        case 'zoom-in':
          this._zoomBy(1.2);
          break;
        case 'zoom-out':
          this._zoomBy(1 / 1.2);
          break;
        case 'zoom-reset':
          this._resetZoom();
          break;
        case 'fit-view':
          this._fitView();
          break;
        case 'goto-line': {
          const line = parseInt(btn.dataset.line, 10);
          if (!Number.isNaN(line)) {
            document.dispatchEvent(new CustomEvent('foxlog:scrollToLine', { detail: { lineIndex: line } }));
          }
          break;
        }
      }
    }

    /**
     * Tear down listeners bound to window (called when the modal closes)
     */
    destroy() {
      clearTimeout(this.searchDebounce);
      if (this._onPanMove) window.removeEventListener('mousemove', this._onPanMove);
      if (this._onPanEnd) window.removeEventListener('mouseup', this._onPanEnd);
    }
  }

  window.FoxLog.CallGraphView = CallGraphView;

  logger.log('[FoxLog] CallGraphView loaded');
})();
