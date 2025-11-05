// src/services/call-tree-builder.js
// Service pour orchestrer la construction d'arbres d'appels via Web Worker
// Gère le cache et expose une API simple

(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const { logger } = window.FoxLog;

  class CallTreeBuilderService {
    constructor() {
      this.worker = null;
      this.cache = new Map(); // logId → CallTree
      this.pendingRequests = new Map(); // requestId → Promise resolver
      this.requestCounter = 0;
      this.workerReady = false;
    }

    /**
     * Initialise le Web Worker
     */
    async initialize() {
      if (this.worker) {
        logger.warn('CallTreeBuilder already initialized');
        return;
      }

      try {
        // Charger le code du worker
        const workerUrl = chrome.runtime.getURL('src/workers/call-tree-worker.js');
        const response = await fetch(workerUrl);
        const workerCode = await response.text();
        
        // Créer un blob avec le code
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        
        // Créer le worker depuis le blob
        this.worker = new Worker(blobUrl);
        
        this.worker.addEventListener('message', (event) => {
          this._handleWorkerMessage(event.data);
        });
        
        this.worker.addEventListener('error', (error) => {
          logger.error('Worker error', error);
        });
        
        this.workerReady = true;
        logger.success('CallTreeBuilder initialized with Worker (blob)');
      } catch (error) {
        logger.error('Failed to initialize Worker', error);
        this.workerReady = false;
      }
    }

    /**
     * Construit l'arbre d'appels pour un log parsé
     * @param {Object} parsedLog - Log parsé par log-parser.js
     * @returns {Promise<Object>} CallTree avec métadonnées
     */
    async buildTree(parsedLog) {
      const logId = parsedLog.metadata.id;
      
      // Vérifier le cache
      if (this.cache.has(logId)) {
        logger.log(`CallTree from cache for log ${logId}`);
        return this.cache.get(logId);
      }

      // Vérifier que le worker est prêt
      if (!this.workerReady) {
        await this.initialize();
      }

      if (!this.workerReady) {
        throw new Error('Worker not available');
      }

      logger.log(`Building CallTree for log ${logId}...`);

      // Envoyer au worker
      const requestId = `req_${this.requestCounter++}`;
      
      const promise = new Promise((resolve, reject) => {
        this.pendingRequests.set(requestId, { resolve, reject });
        
        // Timeout de 30 secondes
        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            reject(new Error('Worker timeout'));
          }
        }, 30000);
      });

      this.worker.postMessage({
        id: requestId,
        action: 'buildTree',
        payload: { parsedLog }
      });

      const callTree = await promise;
      
      // Mettre en cache
      this.cache.set(logId, callTree);
      
      logger.success(`CallTree built (${callTree.metadata.totalNodes} nodes, ${callTree.buildDuration.toFixed(0)}ms)`);
      
      return callTree;
    }

    /**
     * Récupère un nœud par son ID
     * @param {string} logId - ID du log
     * @param {string} nodeId - ID du nœud
     * @returns {Object|null} Nœud trouvé ou null
     */
    getNode(logId, nodeId) {
      const tree = this.cache.get(logId);
      if (!tree) return null;
      
      return this._findNode(tree.root, nodeId);
    }

    /**
     * Recherche des nœuds par nom/type
     * @param {string} logId - ID du log
     * @param {string} query - Texte à rechercher
     * @returns {Array} Liste des nœuds correspondants
     */
    search(logId, query) {
      const tree = this.cache.get(logId);
      if (!tree || !query) return [];
      
      const queryLower = query.toLowerCase();
      const results = [];
      
      this._searchInTree(tree.root, queryLower, results);
      
      return results;
    }

    /**
     * Filtre les nœuds selon des critères
     * @param {string} logId - ID du log
     * @param {Object} filters - Critères de filtrage
     * @returns {Array} Nœuds filtrés (aplatis)
     */
    filter(logId, filters) {
      const tree = this.cache.get(logId);
      if (!tree) return [];
      
      const allNodes = this._flattenTree(tree.root);
      
      return allNodes.filter(node => {
        // Filtre par type
        if (filters.types && filters.types.length > 0) {
          if (!filters.types.includes(node.type)) return false;
        }
        
        // Filtre erreurs uniquement
        if (filters.errorsOnly && !node.hasError) return false;
        
        // Filtre durée minimale
        if (filters.minDuration && node.duration < filters.minDuration) return false;
        
        // Filtre profondeur maximale
        if (filters.maxDepth !== undefined && node.depth > filters.maxDepth) return false;
        
        return true;
      });
    }

    /**
     * Obtient le chemin complet d'un nœud (breadcrumb)
     * @param {string} logId - ID du log
     * @param {string} nodeId - ID du nœud
     * @returns {Array} Chemin de la racine au nœud
     */
    getNodePath(logId, nodeId) {
      const tree = this.cache.get(logId);
      if (!tree) return [];
      
      const path = [];
      this._findNodePath(tree.root, nodeId, path);
      return path;
    }

    /**
     * Vide le cache
     * @param {string} logId - ID du log (optionnel, vide tout si absent)
     */
    clearCache(logId = null) {
      if (logId) {
        this.cache.delete(logId);
        logger.log(`Cache cleared for log ${logId}`);
      } else {
        this.cache.clear();
        logger.log('Cache cleared');
      }
    }

    /**
     * Détruit le worker
     */
    destroy() {
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
        this.workerReady = false;
        logger.log('Worker terminated');
      }
      this.clearCache();
    }

    // ============================================
    // PRIVATE METHODS
    // ============================================

    /**
     * Gère les messages du worker
     * @private
     */
    _handleWorkerMessage(data) {
      const { id, success, result, error } = data;
      
      const request = this.pendingRequests.get(id);
      if (!request) return;
      
      this.pendingRequests.delete(id);
      
      if (success) {
        request.resolve(result);
      } else {
        request.reject(new Error(error.message));
      }
    }

    /**
     * Trouve un nœud par ID (DFS)
     * @private
     */
    _findNode(node, nodeId) {
      if (node.id === nodeId) return node;
      
      for (const child of node.children) {
        const found = this._findNode(child, nodeId);
        if (found) return found;
      }
      
      return null;
    }

    /**
     * Recherche dans l'arbre
     * @private
     */
    _searchInTree(node, query, results) {
      const searchText = `${node.name} ${node.type}`.toLowerCase();
      
      if (searchText.includes(query)) {
        results.push({
          id: node.id,
          name: node.name,
          type: node.type,
          depth: node.depth,
          duration: node.duration,
          hasError: node.hasError
        });
      }
      
      node.children.forEach(child => {
        this._searchInTree(child, query, results);
      });
    }

    /**
     * Aplatit l'arbre (DFS)
     * @private
     */
    _flattenTree(node) {
      const result = [node];
      node.children.forEach(child => {
        result.push(...this._flattenTree(child));
      });
      return result;
    }

    /**
     * Trouve le chemin vers un nœud
     * @private
     */
    _findNodePath(node, targetId, path) {
      path.push({
        id: node.id,
        name: node.name,
        type: node.type
      });
      
      if (node.id === targetId) return true;
      
      for (const child of node.children) {
        if (this._findNodePath(child, targetId, path)) {
          return true;
        }
      }
      
      path.pop();
      return false;
    }
  }

  // Exposer le service
  window.FoxLog.CallTreeBuilderService = CallTreeBuilderService;
  window.FoxLog.callTreeBuilder = new CallTreeBuilderService();
  
  console.log('[FoxLog] CallTreeBuilder service loaded');
})();