// src/parsers/log-parser.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  
  class LogParser {
    constructor() {
      this.LOG_TYPES = window.FoxLog.LOG_TYPES || {};

      this.patterns = {
        timestamp: /^(\d{2}:\d{2}:\d{2}\.\d+)\s+\((\d+)\)\|([A-Z_]+)\|(.*)$/,
        method: /\[(\d+)\]\|([^|]+)\|(.+)/,
        soql: /\[(\d+)\](.+)/,
        rows: /Rows:(\d+)/
      };
    }

    parse(rawLog, metadata = {}) {
      const lines = rawLog.split('\n').filter(line => line.trim());
      const parsedLines = [];
      const stats = this._initStats();
      
      let currentDepth = 0;

      for (let i = 0; i < lines.length; i++) {
        const parsedLine = this._parseLine(lines[i], i, currentDepth);
        
        if (parsedLine) {
          currentDepth = this._updateDepth(parsedLine, currentDepth);
          parsedLine.depth = currentDepth;
          
          parsedLines.push(parsedLine);
          this._collectStats(parsedLine, stats);
        }
      }

      this._parseCumulativeLimits(lines, stats);

      return {
        rawContent: rawLog,
        metadata: this._buildMetadata(metadata, rawLog),
        lines: parsedLines,
        stats,
        parsed: true
      };
    }

    _parseLine(line, index, depth) {
      const match = this.patterns.timestamp.exec(line);
      
      if (!match) {
        return {
          index,
          timestamp: null,
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
        timestampMs: this._parseTimestamp(timestamp),
        duration: parseInt(duration, 10),
        type,
        content: content.trim(),
        details: this._parseDetails(type, content),
        depth,
        raw: line
      };
    }

    _parseDetails(type, content) {
      const parsers = {
        [this.LOG_TYPES.METHOD_ENTRY]: () => this._parseMethod(content),
        [this.LOG_TYPES.METHOD_EXIT]: () => this._parseMethod(content),
        [this.LOG_TYPES.SOQL]: () => this._parseSOQL(content),
        [this.LOG_TYPES.SOQL_END]: () => this._parseSOQLEnd(content),
        [this.LOG_TYPES.DML]: () => this._parseDML(content),
        [this.LOG_TYPES.USER_DEBUG]: () => this._parseDebug(content),
        [this.LOG_TYPES.ERROR]: () => this._parseException(content)
      };
      
      const parser = parsers[type];
      return parser ? parser() : {};
    }

    _parseMethod(content) {
      const parts = content.split('|');
      const details = {};

      if (parts.length > 0) {
        const depthMatch = parts[0].match(/\[(\d+)\]/);
        if (depthMatch) {
          details.depth = parseInt(depthMatch[1], 10);
        }

        const signature = parts[parts.length - 1];
        const lastDot = signature.lastIndexOf('.');
        
        if (lastDot > -1) {
          details.class = signature.substring(0, lastDot);
          details.method = signature.substring(lastDot + 1);
        } else {
          details.method = signature;
        }
      }

      return details;
    }

    _parseSOQL(content) {
      const match = this.patterns.soql.exec(content);
      return match ? {
        aggregations: parseInt(match[1], 10),
        query: match[2].trim()
      } : {};
    }

    _parseSOQLEnd(content) {
      const match = this.patterns.rows.exec(content);
      return match ? { rows: parseInt(match[1], 10) } : {};
    }

    _parseDML(content) {
      const [operation, objectType] = content.split('|');
      return { operation, objectType };
    }

    _parseDebug(content) {
      const [line, level, message] = content.split('|');
      return { line, level, message };
    }

    _parseException(content) {
      const [exceptionType, message] = content.split('|');
      return { exceptionType, message };
    }

    _parseTimestamp(timestamp) {
      const [time, ms] = timestamp.split('.');
      const [h, m, s] = time.split(':').map(Number);
      return (h * 3600000) + (m * 60000) + (s * 1000) + Number(ms);
    }

    _updateDepth(line, currentDepth) {
      if (line.type.includes('ENTRY') || line.type.includes('BEGIN')) {
        return currentDepth + 1;
      }
      if (line.type.includes('EXIT') || line.type.includes('END')) {
        return Math.max(0, currentDepth - 1);
      }
      return currentDepth;
    }

    _initStats() {
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
        dmlOperations: [],
        methodStack: []
      };
    }

    _collectStats(line, stats) {
      const collectors = {
        'SOQL_EXECUTE_BEGIN': () => {
          stats.limits.soqlQueries++;
          stats.queries.push({
            query: line.details.query,
            timestamp: line.timestamp,
            index: line.index
          });
        },
        'SOQL_EXECUTE_END': () => {
          if (stats.queries.length > 0) {
            stats.queries[stats.queries.length - 1].rows = line.details.rows;
          }
        },
        'DML_BEGIN': () => {
          stats.limits.dmlStatements++;
          stats.dmlOperations.push({
            operation: line.details.operation,
            objectType: line.details.objectType,
            timestamp: line.timestamp
          });
        },
        'METHOD_ENTRY': () => {
          const existing = stats.methods.find(
            m => m.class === line.details.class && m.method === line.details.method
          );
          
          if (existing) {
            existing.calls++;
          } else {
            stats.methods.push({
              class: line.details.class,
              method: line.details.method,
              calls: 1,
              firstCall: line.timestamp
            });
          }
          
          stats.methodStack.push({
            class: line.details.class,
            method: line.details.method,
            timestamp: line.timestamp
          });
        },
        'METHOD_EXIT': () => {
          stats.methodStack.pop();
        },
        'EXCEPTION_THROWN': () => {
          const currentMethod = stats.methodStack.length > 0
            ? `${stats.methodStack[stats.methodStack.length - 1].class}.${stats.methodStack[stats.methodStack.length - 1].method}`
            : null;

          stats.errors.push({
            type: line.type,
            message: line.details.message || line.content,
            timestamp: line.timestamp,
            method: currentMethod,
            depth: line.depth
          });
        }
      };

      const collector = collectors[line.type];
      if (collector) collector();
    }

    _parseCumulativeLimits(lines, stats) {
      const limitPatterns = {
        soql: /Number of SOQL queries:\s*(\d+)\s+out of\s+(\d+)/,
        dml: /Number of DML statements:\s*(\d+)\s+out of\s+(\d+)/,
        cpu: /Maximum CPU time:\s*(\d+)\s+out of\s+(\d+)/,
        heap: /Maximum heap size:\s*(\d+)\s+out of\s+(\d+)/
      };

      const cumulativeIndex = lines.findIndex(l => l.includes('CUMULATIVE_LIMIT_USAGE'));
      if (cumulativeIndex === -1) return;

      for (let i = cumulativeIndex; i < lines.length; i++) {
        const line = lines[i];
        
        Object.entries(limitPatterns).forEach(([key, pattern]) => {
          const match = line.match(pattern);
          if (match) {
            const [, used, max] = match;
            if (key === 'soql') {
              stats.limits.soqlQueries = parseInt(used, 10);
              stats.limits.maxSoqlQueries = parseInt(max, 10);
            } else if (key === 'dml') {
              stats.limits.dmlStatements = parseInt(used, 10);
              stats.limits.maxDmlStatements = parseInt(max, 10);
            } else if (key === 'cpu') {
              stats.limits.cpuTime = parseInt(used, 10);
              stats.limits.maxCpuTime = parseInt(max, 10);
            } else if (key === 'heap') {
              stats.limits.heapSize = parseInt(used, 10);
              stats.limits.maxHeapSize = parseInt(max, 10);
            }
          }
        });
      }
    }

    _buildMetadata(metadata, rawLog) {
      return {
        id: metadata.Id || null,
        userId: metadata.LogUserId || null,
        startTime: metadata.StartTime ? new Date(metadata.StartTime) : null,
        duration: metadata.DurationMilliseconds || 0,
        operation: metadata.Operation || 'Unknown',
        status: metadata.Status || 'Unknown',
        application: metadata.Application || 'Unknown',
        logLength: metadata.LogLength || rawLog.length
      };
    }

    getSummary(parsedLog) {
      const { stats, metadata, lines } = parsedLog;
      
      return {
        metadata,
        totalLines: lines.length,
        duration: metadata.duration,
        status: metadata.status,
        limits: {
          soql: `${stats.limits.soqlQueries}/${stats.limits.maxSoqlQueries}`,
          dml: `${stats.limits.dmlStatements}/${stats.limits.maxDmlStatements}`,
          cpu: `${stats.limits.cpuTime}ms/${stats.limits.maxCpuTime}ms`,
          heap: `${Math.round(stats.limits.heapSize / 1024)}KB/${Math.round(stats.limits.maxHeapSize / 1024)}KB`
        },
        methods: stats.methods.length,
        errors: stats.errors.length,
        hasErrors: stats.errors.length > 0
      };
    }
  }

  window.FoxLog.LogParser = LogParser;
  window.FoxLog.logParser = new LogParser();
  console.log('[FoxLog] Log Parser loaded');
})();