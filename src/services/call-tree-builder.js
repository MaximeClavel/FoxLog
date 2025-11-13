// src/services/call-tree-builder.js
// Service to orchestrate call tree construction via Web Worker
// Manages cache and exposes a simple API

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
     * Initialize the Web Worker
     */
    async initialize() {
      if (this.worker) {
        logger.warn('CallTreeBuilder already initialized');
        return;
      }

      try {
        // Load worker code
        const workerUrl = chrome.runtime.getURL('src/workers/call-tree-worker.js');
        const response = await fetch(workerUrl);
        const workerCode = await response.text();
        
        // Create blob with code
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        
        // Create worker from blob
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
     * Build call tree for a parsed log
     * @param {Object} parsedLog - Parsed log from log-parser.js
     * @returns {Promise<Object>} CallTree with metadata
     */
    async buildTree(parsedLog) {
      const logId = parsedLog.metadata.id;
      
      // Check cache
      if (this.cache.has(logId)) {
        logger.log(`CallTree from cache for log ${logId}`);
        return this.cache.get(logId);
      }

      // Check worker is ready
      if (!this.workerReady) {
        await this.initialize();
      }

      if (!this.workerReady) {
        throw new Error('Worker not available');
      }

      logger.log(`Building CallTree for log ${logId}...`);

      // Send to worker
      const requestId = `req_${this.requestCounter++}`;
      
      const promise = new Promise((resolve, reject) => {
        this.pendingRequests.set(requestId, { resolve, reject });
        
        // 30 second timeout
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
      
      // Cache result
      this.cache.set(logId, callTree);
      
      logger.success(`CallTree built (${callTree.metadata.totalNodes} nodes, ${callTree.buildDuration.toFixed(0)}ms)`);
      
      return callTree;
    }

    /**
     * Get a node by its ID
     * @param {string} logId - Log ID
     * @param {string} nodeId - Node ID
     * @returns {Object|null} Found node or null
     */
    getNode(logId, nodeId) {
      const tree = this.cache.get(logId);
      if (!tree) return null;
      
      return this._findNode(tree.root, nodeId);
    }

    /**
     * Search nodes by name/type
     * @param {string} logId - Log ID
     * @param {string} query - Search text
     * @returns {Array} List of matching nodes
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
     * Filter nodes by criteria
     * @param {string} logId - Log ID
     * @param {Object} filters - Filter criteria
     * @returns {Array} Filtered nodes (flattened)
     */
    filter(logId, filters) {
      const tree = this.cache.get(logId);
      if (!tree) return [];
      
      const allNodes = this._flattenTree(tree.root);
      
      return allNodes.filter(node => {
        if (filters.types && filters.types.length > 0) {
          if (!filters.types.includes(node.type)) return false;
        }
        
        if (filters.errorsOnly && !node.hasError) return false;
        
        if (filters.minDuration && node.duration < filters.minDuration) return false;
        
        if (filters.maxDepth !== undefined && node.depth > filters.maxDepth) return false;
        
        return true;
      });
    }

    /**
     * Get full path to a node (breadcrumb)
     * @param {string} logId - Log ID
     * @param {string} nodeId - Node ID
     * @returns {Array} Path from root to node
     */
    getNodePath(logId, nodeId) {
      const tree = this.cache.get(logId);
      if (!tree) return [];
      
      const path = [];
      this._findNodePath(tree.root, nodeId, path);
      return path;
    }

    /**
     * Clear cache
     * @param {string} logId - Log ID (optional, clears all if absent)
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
     * Destroy worker
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

    _findNode(node, nodeId) {
      if (node.id === nodeId) return node;
      
      for (const child of node.children) {
        const found = this._findNode(child, nodeId);
        if (found) return found;
      }
      
      return null;
    }

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

    _flattenTree(node) {
      const result = [node];
      node.children.forEach(child => {
        result.push(...this._flattenTree(child));
      });
      return result;
    }

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

  window.FoxLog.CallTreeBuilderService = CallTreeBuilderService;
  window.FoxLog.callTreeBuilder = new CallTreeBuilderService();
  
  console.log('[FoxLog] CallTreeBuilder service loaded');
})();