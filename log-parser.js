// ============================================
// FOXLOG - LOG PARSER
// Phase 1: Parser le log brut en structure exploitable
// ============================================

/**
 * Structure d'un log parsé
 * @typedef {Object} ParsedLog
 * @property {string} rawContent - Contenu brut du log
 * @property {LogMetadata} metadata - Métadonnées du log
 * @property {LogLine[]} lines - Lignes parsées
 * @property {ExecutionStats} stats - Statistiques d'exécution
 */

/**
 * Métadonnées du log
 * @typedef {Object} LogMetadata
 * @property {string} id - ID du log
 * @property {string} userId - ID de l'utilisateur
 * @property {Date} startTime - Date de début
 * @property {number} duration - Durée en ms
 * @property {string} operation - Type d'opération
 * @property {string} status - Statut (Success, Error, etc.)
 * @property {string} application - Application source
 * @property {number} logLength - Taille du log
 */

/**
 * Ligne de log parsée
 * @typedef {Object} LogLine
 * @property {number} index - Index de la ligne
 * @property {string} timestamp - Timestamp (HH:MM:SS.mmm)
 * @property {number} timestampMs - Timestamp en millisecondes
 * @property {string} type - Type de ligne (CODE_UNIT, METHOD_ENTRY, SOQL, DML, etc.)
 * @property {string} content - Contenu de la ligne
 * @property {Object} details - Détails spécifiques au type
 * @property {number} depth - Profondeur d'imbrication
 * @property {string} raw - Ligne brute
 */

/**
 * Statistiques d'exécution
 * @typedef {Object} ExecutionStats
 * @property {Object} limits - Limites Salesforce
 * @property {number} limits.soqlQueries - Nombre de requêtes SOQL
 * @property {number} limits.dmlStatements - Nombre de DML
 * @property {number} limits.cpuTime - Temps CPU (ms)
 * @property {number} limits.heapSize - Taille du heap
 * @property {MethodStats[]} methods - Statistiques par méthode
 * @property {string[]} errors - Erreurs détectées
 */

class SalesforceLogParser {
  constructor() {
    // Regex pour parser les différents types de lignes
    this.patterns = {
      // Timestamp au début de chaque ligne: HH:MM:SS.mmm (duration)|TYPE|...
      timestamp: /^(\d{2}:\d{2}:\d{2}\.\d+)\s+\((\d+)\)\|([A-Z_]+)\|(.*)$/,
      
      // Types de lignes importantes
      codeUnit: /CODE_UNIT_STARTED\|(.+)/,
      codeUnitFinished: /CODE_UNIT_FINISHED\|(.+)/,
      methodEntry: /METHOD_ENTRY\|(.+)/,
      methodExit: /METHOD_EXIT\|(.+)/,
      
      // Opérations DB
      soqlExecute: /SOQL_EXECUTE_BEGIN\|(.+)/,
      soqlEnd: /SOQL_EXECUTE_END\|(.+)/,
      dmlBegin: /DML_BEGIN\|(.+)/,
      dmlEnd: /DML_END\|(.+)/,
      
      // Variables et debug
      userDebug: /USER_DEBUG\|(.+)/,
      variableAssignment: /VARIABLE_ASSIGNMENT\|(.+)/,
      variableScope: /VARIABLE_SCOPE_BEGIN\|(.+)/,
      
      // Erreurs et exceptions
      exception: /EXCEPTION_THROWN\|(.+)/,
      fatal: /FATAL_ERROR\|(.+)/,
      
      // Limites
      limitUsage: /LIMIT_USAGE_FOR_NS\|(.+)/,
      cumulativeLimit: /CUMULATIVE_LIMIT_USAGE/
    };
  }

  /**
   * Parse un log brut complet
   * @param {string} rawLog - Contenu brut du log
   * @param {Object} metadata - Métadonnées du log (depuis ApexLog)
   * @returns {ParsedLog}
   */
  parse(rawLog, metadata = {}) {
    const lines = rawLog.split('\n');
    const parsedLines = [];
    const stats = this.initStats();
    let currentDepth = 0;

    console.log(`[FoxLog Parser] 📋 Parsing ${lines.length} lignes...`);

    lines.forEach((line, index) => {
      if (!line.trim()) return; // Ignorer les lignes vides

      const parsedLine = this.parseLine(line, index, currentDepth);
      
      if (parsedLine) {
        // Gérer la profondeur pour les méthodes
        if (parsedLine.type.includes('ENTRY') || parsedLine.type.includes('BEGIN')) {
          currentDepth++;
        } else if (parsedLine.type.includes('EXIT') || parsedLine.type.includes('END')) {
          currentDepth = Math.max(0, currentDepth - 1);
        }
        
        parsedLine.depth = currentDepth;
        parsedLines.push(parsedLine);

        // Collecter les statistiques
        this.collectStats(parsedLine, stats);
      }
    });

    // Parser les limites cumulatives à la fin
    this.parseCumulativeLimits(lines, stats);

    const result = {
      rawContent: rawLog,
      metadata: {
        id: metadata.Id || null,
        userId: metadata.LogUserId || null,
        startTime: metadata.StartTime ? new Date(metadata.StartTime) : null,
        duration: metadata.DurationMilliseconds || 0,
        operation: metadata.Operation || 'Unknown',
        status: metadata.Status || 'Unknown',
        application: metadata.Application || 'Unknown',
        logLength: metadata.LogLength || rawLog.length
      },
      lines: parsedLines,
      stats: stats,
      parsed: true
    };

    console.log(`[FoxLog Parser] ✅ ${parsedLines.length} lignes parsées`);
    console.log(`[FoxLog Parser] 📊 Stats:`, {
      soql: stats.limits.soqlQueries,
      dml: stats.limits.dmlStatements,
      methods: stats.methods.length,
      errors: stats.errors.length
    });

    return result;
  }

  /**
   * Parse une ligne individuelle
   * @param {string} line - Ligne brute
   * @param {number} index - Index de la ligne
   * @param {number} depth - Profondeur actuelle
   * @returns {LogLine|null}
   */
  parseLine(line, index, depth) {
    const match = this.patterns.timestamp.exec(line);
    
    if (!match) {
      // Ligne sans timestamp (continuation, etc.)
      return {
        index,
        timestamp: null,
        timestampMs: null,
        type: 'CONTINUATION',
        content: line,
        details: {},
        depth,
        raw: line
      };
    }

    const [, timestamp, duration, type, content] = match;
    
    return {
      index,
      timestamp,
      timestampMs: this.parseTimestamp(timestamp),
      duration: parseInt(duration, 10),
      type,
      content: content.trim(),
      details: this.parseDetails(type, content),
      depth,
      raw: line
    };
  }

  /**
   * Parse les détails spécifiques selon le type de ligne
   * @param {string} type - Type de ligne
   * @param {string} content - Contenu de la ligne
   * @returns {Object}
   */
  parseDetails(type, content) {
    const details = {};

    switch(type) {
      case 'CODE_UNIT_STARTED':
      case 'CODE_UNIT_FINISHED':
        details.unit = content.split('|')[0];
        break;

      case 'METHOD_ENTRY':
      case 'METHOD_EXIT':
        const methodParts = content.split('|');
        // Format: [DEPTH]|ID|Class.Method
        // On veut extraire le dernier élément qui contient Class.Method
        let methodSignature = '';
        
        if (methodParts.length >= 3) {
            // Le dernier élément contient généralement Class.Method
            methodSignature = methodParts[methodParts.length - 1];
        } else if (methodParts.length === 1) {
            methodSignature = methodParts[0];
        }
        
        // Parser le format Class.Method
        if (methodSignature.includes('.')) {
            const lastDotIndex = methodSignature.lastIndexOf('.');
            details.class = methodSignature.substring(0, lastDotIndex);
            details.method = methodSignature.substring(lastDotIndex + 1);
        } else {
            // Fallback si pas de point trouvé
            details.class = 'Unknown';
            details.method = methodSignature || 'Unknown';
        }
        
        // Extraire l'ID si présent (pour référence)
        if (methodParts.length >= 3) {
            details.id = methodParts[1];
        }
        break;

      case 'SOQL_EXECUTE_BEGIN':
        const soqlMatch = content.match(/\[(\d+)\](.+)/);
        if (soqlMatch) {
          details.aggregations = parseInt(soqlMatch[1], 10);
          details.query = soqlMatch[2].trim();
        }
        break;

      case 'SOQL_EXECUTE_END':
        const rowsMatch = content.match(/Rows:(\d+)/);
        if (rowsMatch) {
          details.rows = parseInt(rowsMatch[1], 10);
        }
        break;

      case 'DML_BEGIN':
      case 'DML_END':
        const dmlParts = content.split('|');
        details.operation = dmlParts[0];
        if (dmlParts[1]) {
          details.objectType = dmlParts[1];
        }
        break;

      case 'USER_DEBUG':
        const debugParts = content.split('|');
        details.line = debugParts[0];
        details.level = debugParts[1];
        details.message = debugParts[2];
        break;

      case 'VARIABLE_ASSIGNMENT':
        const varParts = content.split('|');
        details.line = varParts[0];
        details.variable = varParts[1];
        details.value = varParts[2];
        break;

      case 'EXCEPTION_THROWN':
        const exParts = content.split('|');
        details.exceptionType = exParts[0];
        details.message = exParts[1];
        break;

      case 'LIMIT_USAGE_FOR_NS':
        const limitParts = content.split('|');
        details.namespace = limitParts[0];
        if (limitParts.length > 1) {
          const values = limitParts[1].split(':');
          details.metric = values[0];
          details.used = parseInt(values[1], 10);
          details.limit = parseInt(values[2], 10);
        }
        break;
    }

    return details;
  }

  /**
   * Convertit un timestamp HH:MM:SS.mmm en millisecondes
   * @param {string} timestamp
   * @returns {number}
   */
  parseTimestamp(timestamp) {
    const parts = timestamp.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const secondsParts = parts[2].split('.');
    const seconds = parseInt(secondsParts[0], 10);
    const milliseconds = parseInt(secondsParts[1], 10);

    return (hours * 3600000) + (minutes * 60000) + (seconds * 1000) + milliseconds;
  }

  /**
   * Initialise les statistiques
   * @returns {ExecutionStats}
   */
  initStats() {
    return {
      limits: {
        soqlQueries: 0,
        dmlStatements: 0,
        cpuTime: 0,
        heapSize: 0,
        maxSoqlQueries: 100,
        maxDmlStatements: 150,
        maxCpuTime: 10000,
        maxHeapSize: 6000000
      },
      methods: [],
      errors: [],
      queries: [],
      dmlOperations: []
    };
  }

  /**
   * Collecte les statistiques pendant le parsing
   * @param {LogLine} line
   * @param {ExecutionStats} stats
   */
  collectStats(line, stats) {
    switch(line.type) {
      case 'SOQL_EXECUTE_BEGIN':
        stats.limits.soqlQueries++;
        stats.queries.push({
          query: line.details.query,
          timestamp: line.timestamp,
          index: line.index
        });
        break;

      case 'SOQL_EXECUTE_END':
        if (stats.queries.length > 0) {
          const lastQuery = stats.queries[stats.queries.length - 1];
          lastQuery.rows = line.details.rows;
        }
        break;

      case 'DML_BEGIN':
        stats.limits.dmlStatements++;
        stats.dmlOperations.push({
          operation: line.details.operation,
          objectType: line.details.objectType,
          timestamp: line.timestamp,
          index: line.index
        });
        break;

      case 'METHOD_ENTRY':
        const existingMethod = stats.methods.find(
          m => m.class === line.details.class && m.method === line.details.method
        );
        
        if (existingMethod) {
          existingMethod.calls++;
        } else {
          stats.methods.push({
            class: line.details.class,
            method: line.details.method,
            calls: 1,
            firstCall: line.timestamp
          });
        }
        break;

      case 'EXCEPTION_THROWN':
      case 'FATAL_ERROR':
        stats.errors.push({
          type: line.type,
          message: line.details.message || line.content,
          timestamp: line.timestamp,
          index: line.index
        });
        break;
    }
  }

  /**
   * Parse les limites cumulatives à la fin du log
   * @param {string[]} lines
   * @param {ExecutionStats} stats
   */
  parseCumulativeLimits(lines, stats) {
    const cumulativeSection = lines.findIndex(l => 
      l.includes('CUMULATIVE_LIMIT_USAGE')
    );

    if (cumulativeSection === -1) return;

    // Chercher les limites après cette ligne
    for (let i = cumulativeSection; i < lines.length; i++) {
      const line = lines[i];

      if (line.includes('Number of SOQL queries:')) {
        const match = line.match(/(\d+)\s+out of\s+(\d+)/);
        if (match) {
          stats.limits.soqlQueries = parseInt(match[1], 10);
          stats.limits.maxSoqlQueries = parseInt(match[2], 10);
        }
      }

      if (line.includes('Number of DML statements:')) {
        const match = line.match(/(\d+)\s+out of\s+(\d+)/);
        if (match) {
          stats.limits.dmlStatements = parseInt(match[1], 10);
          stats.limits.maxDmlStatements = parseInt(match[2], 10);
        }
      }

      if (line.includes('Maximum CPU time:')) {
        const match = line.match(/(\d+)\s+out of\s+(\d+)/);
        if (match) {
          stats.limits.cpuTime = parseInt(match[1], 10);
          stats.limits.maxCpuTime = parseInt(match[2], 10);
        }
      }

      if (line.includes('Maximum heap size:')) {
        const match = line.match(/(\d+)\s+out of\s+(\d+)/);
        if (match) {
          stats.limits.heapSize = parseInt(match[1], 10);
          stats.limits.maxHeapSize = parseInt(match[2], 10);
        }
      }
    }
  }

  /**
   * Filtre les lignes parsées selon un type
   * @param {ParsedLog} parsedLog
   * @param {string[]} types - Types à inclure
   * @returns {LogLine[]}
   */
  filterByType(parsedLog, types) {
    return parsedLog.lines.filter(line => types.includes(line.type));
  }

  /**
   * Extrait l'arbre d'exécution (call stack)
   * @param {ParsedLog} parsedLog
   * @returns {Object[]}
   */
  buildExecutionTree(parsedLog) {
    const stack = [];
    const tree = [];

    parsedLog.lines.forEach(line => {
      if (line.type === 'METHOD_ENTRY' || line.type === 'CODE_UNIT_STARTED') {
        const node = {
          type: line.type,
          name: line.details.method || line.details.unit,
          class: line.details.class,
          timestamp: line.timestamp,
          children: [],
          startIndex: line.index,
          depth: line.depth
        };

        if (stack.length === 0) {
          tree.push(node);
        } else {
          stack[stack.length - 1].children.push(node);
        }

        stack.push(node);
      }

      if (line.type === 'METHOD_EXIT' || line.type === 'CODE_UNIT_FINISHED') {
        if (stack.length > 0) {
          const node = stack.pop();
          node.endIndex = line.index;
          node.duration = line.duration;
        }
      }
    });

    return tree;
  }

  /**
   * Résumé rapide du log
   * @param {ParsedLog} parsedLog
   * @returns {Object}
   */
  getSummary(parsedLog) {
    return {
      metadata: parsedLog.metadata,
      totalLines: parsedLog.lines.length,
      duration: parsedLog.metadata.duration,
      status: parsedLog.metadata.status,
      limits: {
        soql: `${parsedLog.stats.limits.soqlQueries}/${parsedLog.stats.limits.maxSoqlQueries}`,
        dml: `${parsedLog.stats.limits.dmlStatements}/${parsedLog.stats.limits.maxDmlStatements}`,
        cpu: `${parsedLog.stats.limits.cpuTime}ms/${parsedLog.stats.limits.maxCpuTime}ms`,
        heap: `${Math.round(parsedLog.stats.limits.heapSize/1024)}KB/${Math.round(parsedLog.stats.limits.maxHeapSize/1024)}KB`
      },
      methods: parsedLog.stats.methods.length,
      errors: parsedLog.stats.errors.length,
      hasErrors: parsedLog.stats.errors.length > 0
    };
  }
}

// Export pour utilisation dans content.js
window.SalesforceLogParser = SalesforceLogParser;
console.log('[FoxLog Parser] ✅ Parser chargé et disponible');