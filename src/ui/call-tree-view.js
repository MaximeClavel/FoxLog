// src/ui/call-tree-view.js
// Composant UI pour afficher l'arbre d'appels avec virtualisation

(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const { logger, callTreeBuilder } = window.FoxLog;

  class CallTreeView {
    constructor(container, callTree, parsedLog) {
      this.container = container;
      this.callTree = callTree;
      this.parsedLog = parsedLog;
      
      // État du composant
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
      
      // Virtualisation
      this.nodeHeight = 36; // Hauteur d'un nœud en pixels
      this.viewportHeight = 0;
      this.scrollTop = 0;
      this.renderBuffer = 10; // Nombre de nœuds supplémentaires à rendre
      
      // Refs DOM
      this.toolbarEl = null;
      this.treeContainer = null;
      this.scrollContainer = null;
      this.topSentinel = null;
      this.bottomSentinel = null;
      
      // Observer pour scroll infini
      this.intersectionObserver = null;
      
      // Debounce timers
      this.searchDebounce = null;
    }

    /**
     * Initialise la vue
     */
    init() {
      this._initExpandedState();
      this._buildVisibleNodes();
      this._render();
      this._setupEventListeners();
      this._setupIntersectionObserver();
      
      logger.success('CallTreeView initialized');
    }

    /**
     * Initialise l'état expanded (niveau 0-2 par défaut)
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
     * Construit la liste des nœuds visibles (aplati)
     * @private
     */
    _buildVisibleNodes() {
      this.visibleNodes = [];
      this._traverseVisible(this.callTree.root);
      this.filteredNodes = [...this.visibleNodes];
    }

    /**
     * Traverse l'arbre et collecte les nœuds visibles
     * @private
     */
    _traverseVisible(node) {
      this.visibleNodes.push(node);
      
      if (this.expandedNodes.has(node.id)) {
        node.children.forEach(child => this._traverseVisible(child));
      }
    }

    /**
     * Rend le composant
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
      
      // Récupérer les refs
      this.toolbarEl = this.container.querySelector('.sf-call-tree-toolbar');
      this.scrollContainer = this.container.querySelector('.sf-call-tree-scroll-container');
      this.treeContainer = this.container.querySelector('.sf-call-tree-viewport');
      
      // Calculer hauteur viewport
      this.viewportHeight = this.scrollContainer.clientHeight;
      
      // Render initial
      this._renderVisibleNodes();
    }

    /**
     * Rend la barre d'outils
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
              placeholder="Rechercher dans l'arbre..."
              value="${this.searchQuery}"
            />
          </div>
          
          <div class="sf-call-tree-actions">
            <button class="sf-call-tree-btn" data-action="expand-all" title="Développer tout">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
              </svg>
            </button>
            <button class="sf-call-tree-btn" data-action="collapse-all" title="Tout replier">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
              </svg>
            </button>
            <button class="sf-call-tree-btn" data-action="errors-only" title="Erreurs uniquement">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    /**
     * Rend le bandeau des top 5 nœuds lents
     * @private
     */
    _renderTopNodes() {
      if (!this.callTree.metadata.topSlowNodes || this.callTree.metadata.topSlowNodes.length === 0) {
        return '';
      }
      
      return `
        <div class="sf-call-tree-top-nodes">
          <div class="sf-top-nodes-title">⚡ Top 5 des nœuds les plus lents</div>
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
     * Navigue vers un nœud spécifique et le met en évidence
     * @param {string} nodeId - ID du nœud cible
     */
    scrollToNode(nodeId) {
      const { logger } = window.FoxLog;
      
      // 1. Trouver le nœud dans l'arbre
      const node = this._findNodeById(this.callTree.root, nodeId);
      if (!node) {
        logger.warn(`Node ${nodeId} not found`);
        return;
      }
      
      // 2. Développer tous les parents pour rendre le nœud visible
      this._expandPathToNode(node);
      
      // 3. Reconstruire la liste des nœuds visibles
      this._buildVisibleNodes();
      this._applyFilters();
      
      // 4. Trouver l'index du nœud dans filteredNodes
      const index = this.filteredNodes.findIndex(n => n.id === nodeId);
      if (index === -1) {
        logger.warn(`Node ${nodeId} not in filtered list`);
        return;
      }
      
      // 5. Scroller vers le nœud
      const scrollTop = index * this.nodeHeight;
      this.scrollContainer.scrollTop = scrollTop;
      
      // 6. Highlight temporaire
      setTimeout(() => {
        this._highlightNode(nodeId);
        this._renderVisibleNodes();
      }, 100);
      
      logger.success(`Scrolled to node: ${node.name}`);
    }

    /**
     * Trouve un nœud par son ID (récursif)
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
     * Développe tous les parents d'un nœud pour le rendre visible
     * @private
     */
    _expandPathToNode(node) {
      // Trouver le chemin complet vers le nœud
      const path = this._findPathToNode(this.callTree.root, node.id);
      
      // Développer tous les nœuds du chemin (sauf le dernier)
      path.slice(0, -1).forEach(pathNode => {
        this.expandedNodes.add(pathNode.id);
      });
    }

    /**
     * Trouve le chemin vers un nœud (liste des nœuds parents)
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
     * Met en évidence un nœud temporairement
     * @private
     */
    _highlightNode(nodeId) {
      // Marquer le nœud pour highlight
      this.highlightedNodeId = nodeId;
      
      // Retirer le highlight après 2 secondes
      setTimeout(() => {
        this.highlightedNodeId = null;
        this._renderVisibleNodes();
      }, 2000);
    }

    /**
     * Rend l'état vide
     * @private
     */
    _renderEmptyState() {
      if (this.filteredNodes.length > 0) return '';
      
      return `
        <div class="sf-call-tree-empty">
          <p>Aucun nœud trouvé</p>
          <p class="sf-hint">Ajustez les filtres ou la recherche</p>
        </div>
      `;
    }

    /**
     * Rend les nœuds visibles (virtualisation)
     * @private
     */
    _renderVisibleNodes() {
      if (this.filteredNodes.length === 0) {
        this.treeContainer.innerHTML = '';
        return;
      }
      
      const startIndex = Math.max(0, Math.floor(this.scrollTop / this.nodeHeight) - this.renderBuffer);
      const endIndex = Math.min(
        this.filteredNodes.length,
        Math.ceil((this.scrollTop + this.viewportHeight) / this.nodeHeight) + this.renderBuffer
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
     * Crée un élément DOM pour un nœud
     * @private
     */
    _createNodeElement(node, index) {
      const isExpanded = this.expandedNodes.has(node.id);
      const hasChildren = node.children.length > 0;
      const indent = node.depth * 24;
      
      // Ajouter la classe de highlight si c'est le nœud cible
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
          ${node.hasError ? '<span class="sf-node-badge sf-badge-error">ERROR</span>' : ''}
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
     * Configure les event listeners
     * @private
     */
    _setupEventListeners() {
      // Recherche
      const searchInput = this.container.querySelector('.sf-call-tree-search-input');
      searchInput?.addEventListener('input', (e) => {
        clearTimeout(this.searchDebounce);
        this.searchDebounce = setTimeout(() => {
          this.searchQuery = e.target.value;
          this._applySearch();
        }, 200);
      });
      
      // Actions toolbar
      this.toolbarEl?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        
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
        }
      });
      
      // Toggle expand/collapse
      this.treeContainer?.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.sf-node-toggle');
        if (toggleBtn) {
          const nodeId = toggleBtn.dataset.nodeId;
          this._toggleNode(nodeId);
          return;
        }
        
        // Clic sur un nœud
        const nodeEl = e.target.closest('.sf-call-tree-node');
        if (nodeEl) {
          this._selectNode(nodeEl.dataset.nodeId);
        }
      });
      
      // Top nodes
      const topNodesContainer = this.container.querySelector('.sf-call-tree-top-nodes');
      topNodesContainer?.addEventListener('click', (e) => {
        const item = e.target.closest('.sf-top-node-item');
        if (item) {
          const nodeId = item.dataset.nodeId;
          // Au lieu de _selectNode, utiliser scrollToNode
          this.scrollToNode(nodeId);
        }
      });
      
      // Scroll
      this.scrollContainer?.addEventListener('scroll', () => {
        this.scrollTop = this.scrollContainer.scrollTop;
        this._renderVisibleNodes();
      });
    }

    /**
     * Configure l'intersection observer pour scroll infini
     * @private
     */
    _setupIntersectionObserver() {
      // Pas nécessaire avec virtualisation complète
      // Mais on peut l'utiliser pour lazy-load si besoin
    }

    /**
     * Toggle un nœud
     * @private
     */
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
     * Expand tous les nœuds
     * @private
     */
    _expandAll() {
      this.filteredNodes.forEach(node => {
        if (node.children.length > 0) {
          this.expandedNodes.add(node.id);
        }
      });
      
      this._buildVisibleNodes();
      this._applyFilters();
    }

    /**
     * Collapse tous les nœuds
     * @private
     */
    _collapseAll() {
      this.expandedNodes.clear();
      this._initExpandedState(); // Retour à l'état par défaut (niveau 0-2)
      this._buildVisibleNodes();
      this._applyFilters();
    }

    /**
     * Toggle filtre erreurs uniquement
     * @private
     */
    _toggleErrorsOnly() {
      this.filters.errorsOnly = !this.filters.errorsOnly;
      this._applyFilters();
    }

    /**
     * Applique la recherche
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
     * Applique les filtres
     * @private
     */
    _applyFilters() {
      this.filteredNodes = this.visibleNodes.filter(node => {
        if (this.filters.errorsOnly && !node.hasError) return false;
        if (this.filters.minDuration && node.duration < this.filters.minDuration) return false;
        if (this.filters.maxDepth !== null && node.depth > this.filters.maxDepth) return false;
        return true;
      });
      
      this._updateView();
    }

    /**
     * Met à jour la vue
     * @private
     */
    _updateView() {
      // Mettre à jour le spacer
      const spacer = this.container.querySelector('.sf-call-tree-spacer');
      if (spacer) {
        spacer.style.height = `${this.filteredNodes.length * this.nodeHeight}px`;
      }
      
      // Re-render
      this._renderVisibleNodes();
    }

    /**
     * Sélectionne un nœud et scroll vers lui dans le log brut
     * @private
     */
    _selectNode(nodeId) {
      const node = callTreeBuilder.getNode(this.parsedLog.metadata.id, nodeId);
      if (!node) return;
      
      logger.log(`Node selected: ${node.name} (line ${node.logLineIndex})`);
      
      // Dispatcher un événement pour synchroniser avec le log brut
      document.dispatchEvent(new CustomEvent('foxlog:scrollToLine', {
        detail: { lineIndex: node.logLineIndex }
      }));
    }

    /**
     * Obtient l'icône d'un type de nœud
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
     * Obtient la classe CSS pour l'icône
     * @private
     */
    _getNodeIconClass(type) {
      return `sf-icon-${type.toLowerCase().replace(/_/g, '-')}`;
    }

    /**
     * Obtient la classe CSS pour la durée
     * @private
     */
    _getDurationClass(duration) {
      if (duration > 1000) return 'sf-duration-critical';
      if (duration > 500) return 'sf-duration-warning';
      return '';
    }

    /**
     * Échappe le HTML
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
     * Détruit la vue
     */
    destroy() {
      if (this.intersectionObserver) {
        this.intersectionObserver.disconnect();
      }
      clearTimeout(this.searchDebounce);
    }
  }

  // Exposer le composant
  window.FoxLog.CallTreeView = CallTreeView;
  
  console.log('[FoxLog] CallTreeView loaded');
})();