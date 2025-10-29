// src/workers/call-tree-worker.js
// Web Worker pour construire l'arbre d'appels à partir d'un log parsé
// Évite de bloquer le thread UI sur les gros logs

'use strict';

/**
 * Structure d'un nœud de l'arbre
 * @typedef {Object} CallTreeNode
 * @property {string} id - Identifiant unique du nœud
 * @property {string} type - Type d'événement (METHOD_ENTRY, SOQL_EXECUTE_BEGIN, etc.)
 * @property {string} name - Nom lisible (classe.méthode, query, etc.)
 * @property {number} depth - Profondeur dans l'arbre (0 = racine)
 * @property {string} startTime - Timestamp de début
 * @property {number} startTimeMs - Timestamp en millisecondes
 * @property {number} duration - Durée totale (ms)
 * @property {number} exclusiveDuration - Durée sans les enfants (ms)
 * @property {CallTreeNode[]} children - Nœuds enfants
 * @property {boolean} hasError - Contient une erreur ou un enfant avec erreur
 * @property {number} soqlCount - Nombre de SOQL dans ce nœud + enfants
 * @property {number} dmlCount - Nombre de DML dans ce nœud + enfants
 * @property {number} logLineIndex - Index de la ligne dans le log original
 * @property {Object} details - Détails spécifiques au type
 */

class CallTreeBuilder {
  constructor() {
    this.nodeCounter = 0;
    this.stack = []; // Pile d'appels pour construction
  }

  /**
   * Construit l'arbre d'appels depuis un log parsé
   * @param {Object} parsedLog - Log parsé par log-parser.js
   * @returns {Object} Arbre d'appels avec métadonnées
   */
  buildTree(parsedLog) {
    const startBuild = performance.now();
    
    // Initialisation
    this.nodeCounter = 0;
    this.stack = [];
    
    // Créer le nœud racine
    const root = this._createRootNode(parsedLog);
    this.stack.push(root);
    
    // Parser toutes les lignes
    parsedLog.lines.forEach((line, index) => {
      this._processLine(line, index);
    });
    
    // Finaliser les nœuds non fermés (logs incomplets)
    this._closeIncompleteNodes();
    
    // Calculer les durées exclusives
    this._calculateExclusiveDurations(root);
    
    // Propager les compteurs et erreurs
    this._propagateMetrics(root);
    
    // Collecter les métadonnées
    const metadata = this._collectMetadata(root, parsedLog);
    
    const buildDuration = performance.now() - startBuild;
    console.log(`[CallTreeWorker] Tree built in ${buildDuration.toFixed(2)}ms`);
    
    return {
      metadata,
      root,
      buildDuration
    };
  }

  /**
   * Crée le nœud racine
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
   * Traite une ligne du log
   * @private
   */
  _processLine(line, index) {
    const { type } = line;
    
    // Types qui ouvrent un nouveau nœud
    const openingTypes = [
      'CODE_UNIT_STARTED',
      'METHOD_ENTRY',
      'SOQL_EXECUTE_BEGIN',
      'DML_BEGIN'
    ];
    
    // Types qui ferment un nœud
    const closingTypes = [
      'CODE_UNIT_FINISHED',
      'METHOD_EXIT',
      'SOQL_EXECUTE_END',
      'DML_END'
    ];
    
    if (openingTypes.includes(type)) {
      this._openNode(line, index);
    } else if (closingTypes.includes(type)) {
      this._closeNode(line, index);
    } else if (type === 'EXCEPTION_THROWN' || type === 'FATAL_ERROR') {
      this._markError(line, index);
    } else if (type === 'USER_DEBUG') {
      // Ajouter les USER_DEBUG comme nœuds feuilles
      this._addLeafNode(line, index);
    }
  }

  /**
   * Ouvre un nouveau nœud et l'ajoute à la pile
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
      duration: 0, // Sera calculé à la fermeture
      exclusiveDuration: 0,
      children: [],
      hasError: false,
      soqlCount: line.type === 'SOQL_EXECUTE_BEGIN' ? 1 : 0,
      dmlCount: line.type === 'DML_BEGIN' ? 1 : 0,
      logLineIndex: index,
      details: this._extractDetails(line)
    };
    
    parent.children.push(node);
    this.stack.push(node);
  }

  /**
   * Ferme le nœud en haut de la pile
   * @private
   */
  _closeNode(line, index) {
    if (this.stack.length <= 1) {
      // Éviter de fermer la racine
      return;
    }
    
    const node = this.stack.pop();
    
    // Calculer la durée
    if (line.timestampMs && node.startTimeMs) {
      node.duration = line.timestampMs - node.startTimeMs;
    } else if (line.duration) {
      node.duration = line.duration / 1000; // Convertir ns en ms
    }
    
    // Mettre à jour les détails (ex: nombre de rows pour SOQL_END)
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
    
    // Créer un nœud enfant pour l'exception
    const errorNode = {
      id: `node_${this.nodeCounter++}`,
      type: line.type,
      name: line.details.exceptionType || 'Exception',
      depth: currentNode.depth + 1,
      startTime: line.timestamp,
      startTimeMs: line.timestampMs || 0,
      duration: 0,
      exclusiveDuration: 0,
      children: [],
      hasError: true,
      soqlCount: 0,
      dmlCount: 0,
      logLineIndex: index,
      details: {
        message: line.details.message || line.content,
        exceptionType: line.details.exceptionType
      }
    };
    
    currentNode.children.push(errorNode);
    currentNode.hasError = true;
  }

  /**
   * Ajoute un nœud feuille (USER_DEBUG)
   * @private
   */
  _addLeafNode(line, index) {
    if (this.stack.length === 0) return;
    
    const parent = this.stack[this.stack.length - 1];
    
    const node = {
      id: `node_${this.nodeCounter++}`,
      type: line.type,
      name: `Debug: ${line.details.level || 'INFO'}`,
      depth: parent.depth + 1,
      startTime: line.timestamp,
      startTimeMs: line.timestampMs || 0,
      duration: 0,
      exclusiveDuration: 0,
      children: [],
      hasError: false,
      soqlCount: 0,
      dmlCount: 0,
      logLineIndex: index,
      details: {
        message: line.details.message || line.content,
        level: line.details.level
      }
    };
    
    parent.children.push(node);
  }

  /**
   * Ferme les nœuds non fermés (logs incomplets)
   * @private
   */
  _closeIncompleteNodes() {
    // Ne garder que la racine
    while (this.stack.length > 1) {
      const node = this.stack.pop();
      // Estimer la durée si possible
      if (node.children.length > 0) {
        const lastChild = node.children[node.children.length - 1];
        node.duration = (lastChild.startTimeMs + lastChild.duration) - node.startTimeMs;
      }
    }
  }

  /**
   * Calcule les durées exclusives (sans enfants)
   * @private
   */
  _calculateExclusiveDurations(node) {
    if (node.children.length === 0) {
      node.exclusiveDuration = node.duration;
      return;
    }
    
    // Récursif sur les enfants
    node.children.forEach(child => {
      this._calculateExclusiveDurations(child);
    });
    
    // Durée exclusive = durée totale - somme des durées des enfants
    const childrenDuration = node.children.reduce((sum, child) => sum + child.duration, 0);
    node.exclusiveDuration = Math.max(0, node.duration - childrenDuration);
  }

  /**
   * Propage les métriques (erreurs, SOQL, DML) vers les parents
   * @private
   */
  _propagateMetrics(node) {
    // Récursif sur les enfants d'abord
    node.children.forEach(child => {
      this._propagateMetrics(child);
    });
    
    // Agréger les métriques des enfants
    node.children.forEach(child => {
      if (child.hasError) {
        node.hasError = true;
      }
      node.soqlCount += child.soqlCount;
      node.dmlCount += child.dmlCount;
    });
  }

  /**
   * Collecte les métadonnées de l'arbre
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
        return `${details.operation || 'DML'} ${details.objectType || ''}`.trim();
      
      case 'CODE_UNIT_STARTED':
        return line.content || 'Code Unit';
      
      default:
        return type;
    }
  }

  /**
   * Extrait les détails d'un nœud
   * @private
   */
  _extractDetails(line) {
    const { type, details } = line;
    
    const baseDetails = {
      type,
      ...details
    };
    
    // Ajouter des infos spécifiques
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

console.log('[CallTreeWorker] Worker initialized');