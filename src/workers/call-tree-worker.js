// src/workers/call-tree-worker.js
// Web Worker that builds the call tree from a parsed log
// Prevents blocking the UI thread on large logs

'use strict';

// ============================================
  // LOGGER LOCAL
  // ============================================
  const DEBUG_MODE = false; 

  const logger = {
    _isEnabled() {
      return DEBUG_MODE;
    },
    
    log: (msg, data) => {
      if (!logger._isEnabled()) return;
      if (data !== null && data !== undefined && data !== '') {
        console.log(`[FoxLog BG] ${msg}`, data);
      } else {
        console.log(`[FoxLog BG] ${msg}`);
      }
    },
    
    success: (msg, data) => {
      if (!logger._isEnabled()) return;
      if (data !== null && data !== undefined && data !== '') {
        console.log(`[FoxLog BG] ✅ ${msg}`, data);
      } else {
        console.log(`[FoxLog BG] ✅ ${msg}`);
      }
    },
    
    warn: (msg, data) => {
      if (!logger._isEnabled()) return;
      if (data !== null && data !== undefined && data !== '') {
        console.warn(`[FoxLog BG] ⚠️ ${msg}`, data);
      } else {
        console.warn(`[FoxLog BG] ⚠️ ${msg}`);
      }
    },
    
    error: (msg, err) => {
      // Toujours logger les erreurs, même en production
      if (err !== null && err !== undefined && err !== '') {
        console.error(`[FoxLog BG] ❌ ${msg}`, err);
      } else {
        console.error(`[FoxLog BG] ❌ ${msg}`);
      }
    }
  };

/**
 * Call tree node structure
 * @typedef {Object} CallTreeNode
 * @property {string} id - Unique node identifier
 * @property {string} type - Event type (METHOD_ENTRY, SOQL_EXECUTE_BEGIN, etc.)
 * @property {string} name - Human readable name (class.method, query, etc.)
 * @property {number} depth - Depth within the tree (0 = root)
 * @property {string} startTime - Start timestamp
 * @property {number} startTimeMs - Start timestamp in milliseconds
 * @property {number} duration - Total duration (ms)
 * @property {number} exclusiveDuration - Duration without children (ms)
 * @property {CallTreeNode[]} children - Child nodes
 * @property {boolean} hasError - True when this node or a child contains an error
 * @property {number} soqlCount - Number of SOQL calls in this node and its children
 * @property {number} dmlCount - Number of DML operations in this node and its children
 * @property {number} logLineIndex - Line index within the original log
 * @property {Object} details - Additional data specific to the event type
 */

class CallTreeBuilder {
  constructor() {
    this.nodeCounter = 0;
    this.stack = []; // Pile d'appels pour construction
  }

  /**
   * Build the call tree from a parsed log
   * @param {Object} parsedLog - Log parsed by log-parser.js
   * @returns {Object} Call tree with metadata
   */
  buildTree(parsedLog) {
    const startBuild = performance.now();
    
    // Initialization
    this.nodeCounter = 0;
    this.stack = [];
    
    // Create the root node
    const root = this._createRootNode(parsedLog);
    this.stack.push(root);
    
    // Process every line
    parsedLog.lines.forEach((line, index) => {
      this._processLine(line, index);
    });
    
    // Close nodes left open (incomplete logs)
    this._closeIncompleteNodes();
    
    // Calculate exclusive durations
    this._calculateExclusiveDurations(root);
    
    // Propagate counters and errors
    this._propagateMetrics(root);
    
    // Collect metadata
    const metadata = this._collectMetadata(root, parsedLog);
    
    const buildDuration = performance.now() - startBuild;
    logger.log('Tree built in ${buildDuration.toFixed(2)}ms');
    
    return {
      metadata,
      root,
      buildDuration
    };
  }

  /**
   * Create the root node
   * @private
   */
  _createRootNode(parsedLog) {
    return {
      id: `node_${this.nodeCounter++}`,
      type: 'ROOT',
      name: parsedLog.metadata.operation || 'Transaction',
      depth: 0,
      startTime: parsedLog.lines[0]?.timestamp || '00:00:00.000',
      startTimeMs: parsedLog.lines[0]?.timestampMs || 0,
      duration: parsedLog.metadata.duration || 0,
      exclusiveDuration: 0,
      children: [],
      hasError: parsedLog.stats.errors.length > 0,
      soqlCount: 0,
      dmlCount: 0,
      logLineIndex: 0,
      details: {
        operation: parsedLog.metadata.operation,
        status: parsedLog.metadata.status
      }
    };
  }

  /**
   * Process a log line
   * @private
   */
  _processLine(line, index) {
    const { type } = line;
    
    // Event types that open a new node
    const openingTypes = [
      'CODE_UNIT_STARTED',
      'METHOD_ENTRY',
      'CONSTRUCTOR_ENTRY',
      'SOQL_EXECUTE_BEGIN',
      'DML_BEGIN'
    ];
    
    // Event types that close a node
    const closingTypes = [
      'CODE_UNIT_FINISHED',
      'METHOD_EXIT',
      'CONSTRUCTOR_EXIT',
      'SOQL_EXECUTE_END',
      'DML_END'
    ];
    
    // Event types that are added as leaf nodes
    const leafTypes = [
      'USER_DEBUG',
      'VARIABLE_ASSIGNMENT'
    ];
    
    if (openingTypes.includes(type)) {
      this._openNode(line, index);
    } else if (closingTypes.includes(type)) {
      this._closeNode(line, index);
    } else if (type === 'EXCEPTION_THROWN' || type === 'FATAL_ERROR') {
      this._markError(line, index);
    } else if (leafTypes.includes(type)) {
      // Add leaf nodes (debug, variables, heap)
      this._addLeafNode(line, index);
    }
  }

  /**
   * Open a new node and push it on the stack
   * @private
   */
  _openNode(line, index) {
    const parent = this.stack[this.stack.length - 1];
    
    const node = {
      id: `node_${this.nodeCounter++}`,
      type: line.type,
      name: this._extractName(line),
      depth: parent.depth + 1,
      startTime: line.timestamp,
      startTimeMs: line.timestampMs || 0,
      // Use the nanosecond counter (when present) for accurate duration
      startTimeNs: typeof line.duration === 'number' ? line.duration : null,
      duration: 0, // Calculated when the node closes
      exclusiveDuration: 0,
      children: [],
      hasError: false,
      soqlCount: line.type === 'SOQL_EXECUTE_BEGIN' ? 1 : 0,
      dmlCount: line.type === 'DML_BEGIN' ? 1 : 0,
      logLineIndex: line.index, // Use the actual raw log line index
      details: this._extractDetails(line)
    };
    
    parent.children.push(node);
    this.stack.push(node);
  }

  /**
   * Close the node at the top of the stack
   * @private
   */
  _closeNode(line, index) {
    if (this.stack.length <= 1) {
      // Avoid closing the root node
      return;
    }
    
    const node = this.stack.pop();
    
    // Compute the duration
    // 1) Highest precision: difference of the nanosecond counter
    if (typeof line.duration === 'number' && typeof node.startTimeNs === 'number') {
      // Duration is a counter since the beginning, in nanoseconds → convert to ms
      node.duration = Math.max(0, (line.duration - node.startTimeNs) / 1e6);
    } else if (line.timestampMs && node.startTimeMs) {
      // 2) Fallback: timestamp in HH:mm:ss.SSS (ms resolution, can yield 0)
      node.duration = Math.max(0, line.timestampMs - node.startTimeMs);
    }
    
    // Update details (e.g., number of rows for SOQL_END)
    if (line.type === 'SOQL_EXECUTE_END' && line.details.rows !== undefined) {
      node.details.rows = line.details.rows;
    }
  }

  /**
   * Marque le nœud courant comme ayant une erreur
   * @private
   */
  _markError(line, index) {
    if (this.stack.length === 0) return;
    
    const currentNode = this.stack[this.stack.length - 1];
    
    // Build descriptive name for exception
    const exType = line.details.exceptionType || 'Exception';
    const exMsg = line.details.message || '';
    const shortMsg = exMsg.length > 50 ? exMsg.substring(0, 50) + '...' : exMsg;
    const nodeName = exMsg ? `${exType}: ${shortMsg}` : exType;
    
    // Create a child node for the exception
    const errorNode = {
      id: `node_${this.nodeCounter++}`,
      type: line.type,
      name: nodeName,
      depth: currentNode.depth + 1,
      startTime: line.timestamp,
      startTimeMs: line.timestampMs || 0,
      duration: 0,
      exclusiveDuration: 0,
      children: [],
      hasError: true,
      soqlCount: 0,
      dmlCount: 0,
      logLineIndex: line.index, // Use the actual raw log line index
      details: {
        message: line.details.message || line.content,
        exceptionType: line.details.exceptionType
      }
    };
    
    currentNode.children.push(errorNode);
    currentNode.hasError = true;
  }

  /**
   * Ajoute un nœud feuille (USER_DEBUG, VARIABLE_*, HEAP_ALLOCATE)
   * @private
   */
  _addLeafNode(line, index) {
    if (this.stack.length === 0) return;
    
    const parent = this.stack[this.stack.length - 1];
    
    // Determine node name based on type
    let nodeName;
    let nodeDetails = {};
    
    switch (line.type) {
      case 'USER_DEBUG':
        // Show the actual debug message, truncated if too long
        const message = line.details.message || line.content;
        const level = line.details.level || 'DEBUG';
        const truncatedMsg = message.length > 80 ? message.substring(0, 80) + '...' : message;
        nodeName = `[${level}] ${truncatedMsg}`;
        nodeDetails = {
          message: message,
          level: level
        };
        break;
        
      case 'VARIABLE_ASSIGNMENT':
        nodeName = this._extractVariableAssignmentName(line.content);
        nodeDetails = { assignment: line.content };
        break;
        
      default:
        nodeName = line.type;
        nodeDetails = { content: line.content };
    }
    
    const node = {
      id: `node_${this.nodeCounter++}`,
      type: line.type,
      name: nodeName,
      depth: parent.depth + 1,
      startTime: line.timestamp,
      startTimeMs: line.timestampMs || 0,
      duration: 0,
      exclusiveDuration: 0,
      children: [],
      hasError: false,
      soqlCount: 0,
      dmlCount: 0,
      logLineIndex: line.index, // Use the actual raw log line index
      details: nodeDetails
    };
    
    parent.children.push(node);
  }

  /**
   * Extract variable assignment name from content
   * @private
   */
  _extractVariableAssignmentName(content) {
    // Format: [depth]|variableName|value or variableName|value
    const parts = content.split('|');
    if (parts.length >= 2) {
      // Try to get variable name (skip the depth if present)
      const varName = parts[0].includes('[') ? parts[1] : parts[0];
      const value = parts[parts.length - 1];
      // Truncate long values
      const shortValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
      return `${varName} = ${shortValue}`;
    }
    return content.length > 60 ? content.substring(0, 60) + '...' : content;
  }

  /**
   * Close any nodes left open (incomplete logs)
   * @private
   */
  _closeIncompleteNodes() {
    // Ne garder que la racine
    while (this.stack.length > 1) {
      const node = this.stack.pop();
      // Estimate the duration when possible
      if (node.children.length > 0) {
        const lastChild = node.children[node.children.length - 1];
        node.duration = (lastChild.startTimeMs + lastChild.duration) - node.startTimeMs;
      }
    }
  }

  /**
   * Calculate exclusive durations (without children)
   * @private
   */
  _calculateExclusiveDurations(node) {
    if (node.children.length === 0) {
      node.exclusiveDuration = node.duration;
      return;
    }
    
      // Recurse through children
    node.children.forEach(child => {
      this._calculateExclusiveDurations(child);
    });
    
      // Exclusive duration = total duration - sum of child durations
    const childrenDuration = node.children.reduce((sum, child) => sum + child.duration, 0);
    node.exclusiveDuration = Math.max(0, node.duration - childrenDuration);
  }

  /**
   * Propagate metrics (errors, SOQL, DML) up to the parents
   * @private
   */
  _propagateMetrics(node) {
      // Recurse over children first
    node.children.forEach(child => {
      this._propagateMetrics(child);
    });
    
      // Aggregate metrics from the children
    node.children.forEach(child => {
      if (child.hasError) {
        node.hasError = true;
      }
      node.soqlCount += child.soqlCount;
      node.dmlCount += child.dmlCount;
    });
  }

  /**
   * Collect metadata from the tree
   * @private
   */
  _collectMetadata(root, parsedLog) {
    const allNodes = this._flattenTree(root);
    
    // Trouver la profondeur maximale
    const maxDepth = Math.max(...allNodes.map(n => n.depth));
    
    // Trouver les 5 nœuds les plus lents
    const sortedByDuration = [...allNodes]
      .filter(n => n.type !== 'ROOT')
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5)
      .map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        duration: n.duration,
        depth: n.depth
      }));
    
    return {
      logId: parsedLog.metadata.id,
      totalNodes: allNodes.length,
      maxDepth,
      totalDuration: root.duration,
      hasErrors: root.hasError,
      errorCount: parsedLog.stats.errors.length,
      soqlCount: root.soqlCount,
      dmlCount: root.dmlCount,
      topSlowNodes: sortedByDuration
    };
  }

  /**
   * Aplatit l'arbre en liste (DFS)
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
   * Extrait le nom d'un nœud
   * @private
   */
  _extractName(line) {
    const { type, details } = line;
    
    switch (type) {
      case 'METHOD_ENTRY':
      case 'METHOD_EXIT':
        return details.class && details.method 
          ? `${details.class}.${details.method}` 
          : details.method || 'Unknown Method';
      
      case 'SOQL_EXECUTE_BEGIN':
        return details.query 
          ? details.query.substring(0, 60) + (details.query.length > 60 ? '...' : '')
          : 'SOQL Query';
      
      case 'DML_BEGIN':
        const op = details.operation || 'DML';
        const objType = details.objectType || '';
        const rows = details.rows ? ` (${details.rows} row${details.rows > 1 ? 's' : ''})` : '';
        return `${op} ${objType}${rows}`.trim();
      
      case 'CODE_UNIT_STARTED':
        return line.content || 'Code Unit';
      
      default:
        return type;
    }
  }

  /**
   * Extract node-specific details
   * @private
   */
  _extractDetails(line) {
    const { type, details } = line;
    
    const baseDetails = {
      type,
      ...details
    };
    
      // Add specifics details
    if (type === 'SOQL_EXECUTE_BEGIN') {
      baseDetails.fullQuery = details.query;
    }
    
    return baseDetails;
  }
}

// ============================================
// MESSAGE HANDLER (Web Worker)
// ============================================

const builder = new CallTreeBuilder();

self.addEventListener('message', (event) => {
  const { action, payload, id } = event.data;
  
  try {
    if (action === 'buildTree') {
      const result = builder.buildTree(payload.parsedLog);
      
      self.postMessage({
        id,
        success: true,
        result
      });
    } else {
      throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
});

logger.log('[CallTreeWorker] Worker initialized');