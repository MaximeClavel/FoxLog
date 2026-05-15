// src/services/anti-pattern-detector.js
// Service to detect common Salesforce anti-patterns in debug logs

(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;

  /**
   * Anti-pattern severity levels
   */
  const SEVERITY = {
    CRITICAL: 'critical',  // Will likely cause governor limit issues
    WARNING: 'warning',    // Performance concern
    INFO: 'info'           // Best practice suggestion
  };

  /**
   * Anti-pattern types
   */
  const PATTERN_TYPES = {
    SOQL_IN_LOOP: 'soql_in_loop',
    DML_IN_LOOP: 'dml_in_loop',
    N_PLUS_ONE: 'n_plus_one',
    RECURSION: 'recursion',
    TRIGGER_RECURSION: 'trigger_recursion',
    SOQL_NO_LIMIT: 'soql_no_limit',
    SOQL_SELECT_ALL: 'soql_select_all',
    SOQL_NO_WHERE: 'soql_no_where',
    SOQL_NON_SELECTIVE: 'soql_non_selective',
    EXCESSIVE_SOQL: 'excessive_soql',
    EXCESSIVE_DML: 'excessive_dml',
    CPU_INTENSIVE: 'cpu_intensive',
    LARGE_HEAP: 'large_heap',
    MULTIPLE_CALLOUTS: 'multiple_callouts',
    EXCESSIVE_FUTURE: 'excessive_future',
    MIXED_DML: 'mixed_dml',
    HARDCODED_ID: 'hardcoded_id',
    VALIDATION_FAILURES: 'validation_failures',
    DEBUG_STATEMENTS: 'debug_statements',
    CALLOUT_AFTER_DML: 'callout_after_dml',
    LARGE_QUERY_RESULT: 'large_query_result',
    SLOW_QUERY: 'slow_query',
    EXCESSIVE_ROWS_FETCHED: 'excessive_rows_fetched',
    DML_ROWS_LIMIT: 'dml_rows_limit',
    EMPTY_QUERY_RESULT: 'empty_query_result',
    DESCRIBE_IN_LOOP: 'describe_in_loop',
    EXCEPTION_SWALLOWED: 'exception_swallowed',
    FLOW_RECURSION: 'flow_recursion',
    NESTED_LOOP_PATTERN: 'nested_loop_pattern',
    // Security patterns
    SOQL_INJECTION_RISK: 'soql_injection_risk',
    CRUD_FLS_BYPASS: 'crud_fls_bypass',
    INSECURE_ENDPOINT: 'insecure_endpoint',
    SYSTEM_MODE_USAGE: 'system_mode_usage',
    WITHOUT_SHARING: 'without_sharing'
  };

  class AntiPatternDetector {
    constructor() {
      this.patterns = [];
      this.thresholds = {
        recursionLimit: 10,        // Same method called > 10 times
        triggerRecursionLimit: 3,  // Same trigger > 3 times
        excessiveSoqlPercent: 70,  // > 70% of SOQL limit
        excessiveDmlPercent: 70,   // > 70% of DML limit
        cpuPercent: 80,            // > 80% of CPU limit
        heapPercent: 80,           // > 80% of heap limit
        loopIterationThreshold: 3, // Detect patterns repeating > 3 times
        nPlusOneThreshold: 5,      // N+1 if same query with diff ID >= 5 times
        calloutThreshold: 3,       // Multiple callouts threshold
        futureThreshold: 5,        // Excessive @future calls
        validationFailureThreshold: 3, // Multiple validation failures
        debugStatementsThreshold: 20,  // More than 20 debug statements
        largeQueryResultThreshold: 200, // Query returning > 200 records
        slowQueryMs: 2000,             // SOQL taking > 2s
        excessiveRowsFetchedPercent: 70, // > 70% of 50000 row limit
        dmlRowsPercent: 70,            // > 70% of 10000 DML rows limit
        emptyQueryThreshold: 3,        // More than 3 empty result queries
        describeInLoopThreshold: 3,    // Same describe > 3 times
        flowRecursionLimit: 3,         // Same flow > 3 times
        nestedLoopDmlSoqlThreshold: 2  // SOQL/DML within nested method calls
      };
    }

    /**
     * Analyze a parsed log for anti-patterns
     * @param {Object} parsedLog - Parsed log from LogParser
     * @param {Object} callTree - Optional call tree for deeper analysis
     * @returns {Object} Analysis results with detected patterns
     */
    analyze(parsedLog, callTree = null) {
      this.patterns = [];
      
      const { lines, stats } = parsedLog;
      
      // Run all detectors
      this._detectSoqlInLoop(lines);
      this._detectNPlusOne(lines);
      this._detectDmlInLoop(lines);
      this._detectRecursion(lines, stats);
      this._detectTriggerRecursion(lines);
      this._detectSoqlNoLimit(lines);
      this._detectSoqlSelectAll(lines);
      this._detectSoqlNoWhere(lines);
      this._detectNonSelectiveQuery(lines);
      this._detectExcessiveLimits(stats);
      this._detectMultipleCallouts(lines);
      this._detectExcessiveFuture(lines);
      this._detectMixedDml(lines);
      this._detectHardcodedIds(lines);
      this._detectValidationFailures(lines);
      this._detectDebugStatements(lines);
      this._detectCalloutAfterDml(lines);
      this._detectLargeQueryResults(lines);
      this._detectSlowQueries(lines);
      this._detectExcessiveRowsFetched(lines, stats);
      this._detectDmlRowsLimit(lines, stats);
      this._detectEmptyQueryResults(lines);
      this._detectDescribeInLoop(lines);
      this._detectExceptionSwallowed(lines);
      this._detectFlowRecursion(lines);
      this._detectNestedLoopPattern(lines);
      this._detectSoqlInjectionRisk(lines);
      this._detectCrudFlsBypass(lines);
      this._detectInsecureEndpoint(lines);
      this._detectSystemModeUsage(lines);
      this._detectWithoutSharing(lines);
      
      // If call tree available, run advanced analysis
      if (callTree) {
        this._detectCallTreePatterns(callTree);
      }

      // Sort by severity (critical first)
      this.patterns.sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });

      const summary = this._generateSummary();
      
      logger.log(`[AntiPatternDetector] Found ${this.patterns.length} anti-patterns`);
      
      return {
        patterns: this.patterns,
        summary,
        hasCritical: this.patterns.some(p => p.severity === SEVERITY.CRITICAL),
        hasWarning: this.patterns.some(p => p.severity === SEVERITY.WARNING),
        totalCount: this.patterns.length
      };
    }

    /**
     * Detect SOQL queries inside loops
     * @private
     */
    _detectSoqlInLoop(lines) {
      const soqlLines = lines.filter(l => l.type === 'SOQL_EXECUTE_BEGIN');
      
      if (soqlLines.length < 2) return;
      
      // Group SOQL by similar query pattern (ignoring specific values)
      const queryGroups = this._groupSimilarQueries(soqlLines);
      
      for (const [pattern, occurrences] of Object.entries(queryGroups)) {
        if (occurrences.length >= this.thresholds.loopIterationThreshold) {
          // Check if they happen in quick succession (likely in a loop)
          const isInLoop = this._checkSequentialExecution(occurrences);
          
          if (isInLoop) {
            this.patterns.push({
              type: PATTERN_TYPES.SOQL_IN_LOOP,
              severity: SEVERITY.CRITICAL,
              title: 'SOQL in Loop',
              description: `Same query pattern executed ${occurrences.length} times - likely inside a loop`,
              query: this._truncateQuery(occurrences[0].details.query || pattern),
              occurrences: occurrences.length,
              lines: occurrences.map(o => o.index),
              suggestion: 'Move the query outside the loop and use collections (List, Set, Map) to bulkify',
              impact: `Using ${occurrences.length} SOQL queries instead of 1`
            });
          }
        }
      }
    }

    /**
     * Detect DML operations inside loops
     * @private
     */
    _detectDmlInLoop(lines) {
      const dmlLines = lines.filter(l => l.type === 'DML_BEGIN');
      
      if (dmlLines.length < 2) return;
      
      // Group DML by operation type and object
      const dmlGroups = {};
      
      for (const line of dmlLines) {
        const key = `${line.details.operation || 'DML'}|${line.details.objectType || 'Unknown'}`;
        if (!dmlGroups[key]) {
          dmlGroups[key] = [];
        }
        dmlGroups[key].push(line);
      }
      
      for (const [key, occurrences] of Object.entries(dmlGroups)) {
        if (occurrences.length >= this.thresholds.loopIterationThreshold) {
          const isInLoop = this._checkSequentialExecution(occurrences);
          
          if (isInLoop) {
            const [operation, objectType] = key.split('|');
            
            this.patterns.push({
              type: PATTERN_TYPES.DML_IN_LOOP,
              severity: SEVERITY.CRITICAL,
              title: 'DML in Loop',
              description: `${operation} on ${objectType} executed ${occurrences.length} times - likely inside a loop`,
              operation,
              objectType,
              occurrences: occurrences.length,
              lines: occurrences.map(o => o.index),
              suggestion: 'Collect records in a List and perform a single DML operation outside the loop',
              impact: `Using ${occurrences.length} DML statements instead of 1`
            });
          }
        }
      }
    }

    /**
     * Detect N+1 query pattern - queries for child records using parent ID
     * @private
     */
    _detectNPlusOne(lines) {
      const soqlLines = lines.filter(l => l.type === 'SOQL_EXECUTE_BEGIN');
      
      if (soqlLines.length < this.thresholds.nPlusOneThreshold) return;
      
      // Look for queries with patterns like "WHERE AccountId = :parentId" or "WHERE ParentId = ?"
      const parentIdQueries = {};
      const idPattern = /WHERE\s+(\w+Id)\s*=\s*[:']?([^'\s\)]+)/gi;
      
      for (const line of soqlLines) {
        const query = line.details.query || line.content || '';
        const matches = [...query.matchAll(idPattern)];
        
        for (const match of matches) {
          const fieldName = match[1];
          // Normalize the query pattern (remove the specific ID value)
          const normalizedQuery = query.replace(/[:'][^'\s\)]+/g, ':ID').toLowerCase();
          const key = `${fieldName}|${normalizedQuery}`;
          
          if (!parentIdQueries[key]) {
            parentIdQueries[key] = { field: fieldName, query: query, occurrences: [] };
          }
          parentIdQueries[key].occurrences.push(line);
        }
      }
      
      // Check for N+1 patterns
      for (const [key, data] of Object.entries(parentIdQueries)) {
        if (data.occurrences.length >= this.thresholds.nPlusOneThreshold) {
          const isSequential = this._checkSequentialExecution(data.occurrences);
          
          if (isSequential) {
            // Extract object name from query
            const fromMatch = data.query.match(/FROM\s+(\w+)/i);
            const objectName = fromMatch ? fromMatch[1] : 'records';
            
            this.patterns.push({
              type: PATTERN_TYPES.N_PLUS_ONE,
              severity: SEVERITY.CRITICAL,
              title: 'N+1 Query Pattern',
              description: `Query fetching ${objectName} by ${data.field} executed ${data.occurrences.length} times`,
              query: this._truncateQuery(data.query),
              field: data.field,
              occurrences: data.occurrences.length,
              lines: data.occurrences.map(o => o.index),
              suggestion: `Use a parent-child relationship query (subquery) or collect IDs in a Set and query once with IN clause`,
              impact: `${data.occurrences.length} queries could be replaced by 1 optimized query`
            });
          }
        }
      }
    }

    /**
     * Detect trigger recursion - same trigger firing multiple times
     * @private
     */
    _detectTriggerRecursion(lines) {
      const triggerExecutions = {};
      
      for (const line of lines) {
        // Look for trigger execution entries
        if (line.type === 'CODE_UNIT_STARTED' || line.content?.includes('TRIGGER')) {
          const content = line.content || '';
          const triggerMatch = content.match(/trigger\s+(\w+)\s+on\s+(\w+)/i) || 
                              content.match(/(\w+)\s+on\s+(\w+)\s+trigger/i);
          
          if (triggerMatch) {
            const triggerName = triggerMatch[1];
            const objectName = triggerMatch[2];
            const key = `${triggerName}|${objectName}`;
            
            if (!triggerExecutions[key]) {
              triggerExecutions[key] = { name: triggerName, object: objectName, lines: [] };
            }
            triggerExecutions[key].lines.push(line.index);
          }
        }
      }
      
      for (const [key, data] of Object.entries(triggerExecutions)) {
        if (data.lines.length > this.thresholds.triggerRecursionLimit) {
          this.patterns.push({
            type: PATTERN_TYPES.TRIGGER_RECURSION,
            severity: SEVERITY.CRITICAL,
            title: 'Trigger Recursion',
            description: `Trigger ${data.name} on ${data.object} executed ${data.lines.length} times`,
            triggerName: data.name,
            objectName: data.object,
            occurrences: data.lines.length,
            lines: data.lines.slice(0, 10),
            suggestion: 'Add a static Boolean variable to prevent recursive trigger execution',
            impact: 'May cause infinite loop and hit governor limits'
          });
        }
      }
    }

    /**
     * Detect uncontrolled recursion
     * @private
     */
    _detectRecursion(lines, stats) {
      // Check method call frequency
      const methodCalls = {};
      
      for (const line of lines) {
        if (line.type === 'METHOD_ENTRY') {
          const signature = `${line.details.class || ''}.${line.details.method || ''}`;
          if (!methodCalls[signature]) {
            methodCalls[signature] = { count: 0, lines: [] };
          }
          methodCalls[signature].count++;
          methodCalls[signature].lines.push(line.index);
        }
      }
      
      for (const [signature, data] of Object.entries(methodCalls)) {
        if (data.count > this.thresholds.recursionLimit && signature !== '.') {
          this.patterns.push({
            type: PATTERN_TYPES.RECURSION,
            severity: data.count > 50 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
            title: 'Possible Recursion',
            description: `Method ${signature} called ${data.count} times`,
            method: signature,
            occurrences: data.count,
            lines: data.lines.slice(0, 10), // First 10 occurrences
            suggestion: 'Add a static variable to prevent recursive trigger execution or review loop logic',
            impact: `Excessive method calls may cause CPU timeout`
          });
        }
      }
    }

    /**
     * Detect SOQL queries without LIMIT clause
     * @private
     */
    _detectSoqlNoLimit(lines) {
      const soqlLines = lines.filter(l => l.type === 'SOQL_EXECUTE_BEGIN');
      
      for (const line of soqlLines) {
        const query = (line.details.query || line.content || '').toUpperCase();
        
        // Skip COUNT queries and subqueries
        if (query.includes('COUNT(') || query.includes('COUNT (')) continue;
        
        // Check for LIMIT clause
        if (!query.includes(' LIMIT ')) {
          this.patterns.push({
            type: PATTERN_TYPES.SOQL_NO_LIMIT,
            severity: SEVERITY.WARNING,
            title: 'SOQL without LIMIT',
            description: 'Query has no LIMIT clause - may return more records than needed',
            query: this._truncateQuery(line.details.query || line.content),
            lines: [line.index],
            suggestion: 'Add LIMIT clause to prevent fetching unnecessary records',
            impact: 'May cause heap size issues or return more data than needed'
          });
        }
      }
    }

    /**
     * Detect SOQL queries selecting all fields (SELECT * pattern)
     * @private
     */
    _detectSoqlSelectAll(lines) {
      const soqlLines = lines.filter(l => l.type === 'SOQL_EXECUTE_BEGIN');
      
      for (const line of soqlLines) {
        const query = (line.details.query || line.content || '');
        
        // Count fields in SELECT clause
        const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
        if (selectMatch) {
          const fields = selectMatch[1].split(',').map(f => f.trim());
          
          // If more than 15 fields, it's likely selecting too many
          if (fields.length > 15) {
            this.patterns.push({
              type: PATTERN_TYPES.SOQL_SELECT_ALL,
              severity: SEVERITY.INFO,
              title: 'Too Many Fields Selected',
              description: `Query selects ${fields.length} fields - consider selecting only needed fields`,
              query: this._truncateQuery(line.details.query || line.content),
              fieldCount: fields.length,
              lines: [line.index],
              suggestion: 'Select only the fields you actually need to reduce heap usage',
              impact: 'Increased heap size and slower query execution'
            });
          }
        }
      }
    }

    /**
     * Detect SOQL queries without WHERE clause
     * @private
     */
    _detectSoqlNoWhere(lines) {
      const soqlLines = lines.filter(l => l.type === 'SOQL_EXECUTE_BEGIN');
      
      for (const line of soqlLines) {
        const query = (line.details.query || line.content || '').toUpperCase();
        
        // Check for WHERE clause (but allow aggregate queries)
        if (!query.includes(' WHERE ') && !query.includes('COUNT(') && !query.includes('GROUP BY')) {
          // Get the object being queried
          const fromMatch = query.match(/FROM\s+(\w+)/i);
          const objectName = fromMatch ? fromMatch[1] : 'Unknown';
          
          this.patterns.push({
            type: PATTERN_TYPES.SOQL_NO_WHERE,
            severity: SEVERITY.WARNING,
            title: 'SOQL without WHERE',
            description: `Query on ${objectName} has no WHERE clause - fetching all records`,
            query: this._truncateQuery(line.details.query || line.content),
            objectName,
            lines: [line.index],
            suggestion: 'Add WHERE clause to filter records and improve performance',
            impact: 'Returns all accessible records, may hit governor limits'
          });
        }
      }
    }

    /**
     * Detect excessive limit usage
     * @private
     */
    _detectExcessiveLimits(stats) {
      const { limits } = stats;
      
      // SOQL limit check
      const soqlPercent = (limits.soqlQueries / limits.maxSoqlQueries) * 100;
      if (soqlPercent >= this.thresholds.excessiveSoqlPercent) {
        this.patterns.push({
          type: PATTERN_TYPES.EXCESSIVE_SOQL,
          severity: soqlPercent >= 90 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
          title: 'High SOQL Usage',
          description: `Using ${limits.soqlQueries}/${limits.maxSoqlQueries} SOQL queries (${soqlPercent.toFixed(0)}%)`,
          current: limits.soqlQueries,
          max: limits.maxSoqlQueries,
          percent: soqlPercent,
          suggestion: 'Bulkify queries, use collections, or consider using Platform Cache',
          impact: 'Risk of hitting governor limits in production'
        });
      }
      
      // DML limit check
      const dmlPercent = (limits.dmlStatements / limits.maxDmlStatements) * 100;
      if (dmlPercent >= this.thresholds.excessiveDmlPercent) {
        this.patterns.push({
          type: PATTERN_TYPES.EXCESSIVE_DML,
          severity: dmlPercent >= 90 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
          title: 'High DML Usage',
          description: `Using ${limits.dmlStatements}/${limits.maxDmlStatements} DML statements (${dmlPercent.toFixed(0)}%)`,
          current: limits.dmlStatements,
          max: limits.maxDmlStatements,
          percent: dmlPercent,
          suggestion: 'Combine DML operations, use Database.insert with allOrNone=false',
          impact: 'Risk of hitting governor limits in production'
        });
      }
      
      // CPU limit check
      const cpuPercent = (limits.cpuTime / limits.maxCpuTime) * 100;
      if (cpuPercent >= this.thresholds.cpuPercent) {
        this.patterns.push({
          type: PATTERN_TYPES.CPU_INTENSIVE,
          severity: cpuPercent >= 90 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
          title: 'High CPU Usage',
          description: `Using ${limits.cpuTime}ms/${limits.maxCpuTime}ms CPU time (${cpuPercent.toFixed(0)}%)`,
          current: limits.cpuTime,
          max: limits.maxCpuTime,
          percent: cpuPercent,
          suggestion: 'Optimize algorithms, reduce loop iterations, use async processing',
          impact: 'Risk of CPU timeout in production'
        });
      }
      
      // Heap limit check
      const heapPercent = (limits.heapSize / limits.maxHeapSize) * 100;
      if (heapPercent >= this.thresholds.heapPercent) {
        this.patterns.push({
          type: PATTERN_TYPES.LARGE_HEAP,
          severity: heapPercent >= 90 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
          title: 'High Heap Usage',
          description: `Using ${Math.round(limits.heapSize/1024)}KB/${Math.round(limits.maxHeapSize/1024)}KB heap (${heapPercent.toFixed(0)}%)`,
          current: limits.heapSize,
          max: limits.maxHeapSize,
          percent: heapPercent,
          suggestion: 'Process records in smaller batches, avoid storing large strings',
          impact: 'Risk of heap limit exception in production'
        });
      }
    }

    /**
     * Analyze call tree for patterns
     * @private
     */
    _detectCallTreePatterns(callTree) {
      // Additional analysis using call tree structure
      // Can detect nested patterns more accurately
      if (callTree.metadata && callTree.metadata.deepestDepth > 50) {
        this.patterns.push({
          type: PATTERN_TYPES.RECURSION,
          severity: SEVERITY.WARNING,
          title: 'Deep Call Stack',
          description: `Call stack depth reaches ${callTree.metadata.deepestDepth} levels`,
          depth: callTree.metadata.deepestDepth,
          suggestion: 'Review code structure to reduce nesting levels',
          impact: 'Deep call stacks can be harder to debug and maintain'
        });
      }
    }

    /**
     * Detect non-selective SOQL queries (from log performance indicators)
     * @private
     */
    _detectNonSelectiveQuery(lines) {
      for (const line of lines) {
        const content = line.content || '';
        
        // Look for non-selective query warnings in logs
        if (content.includes('non-selective') || 
            content.includes('QUERY_MORE') ||
            content.includes('full table scan')) {
          
          this.patterns.push({
            type: PATTERN_TYPES.SOQL_NON_SELECTIVE,
            severity: SEVERITY.WARNING,
            title: 'Non-Selective Query',
            description: 'Query may be doing a full table scan - add indexed field to WHERE clause',
            lines: [line.index],
            suggestion: 'Add filter on indexed field (Id, Name, CreatedDate, or custom indexed field)',
            impact: 'Poor query performance, especially with large data volumes'
          });
        }
      }
    }

    /**
     * Detect multiple HTTP callouts that could be batched
     * @private
     */
    _detectMultipleCallouts(lines) {
      const callouts = lines.filter(l => 
        l.type === 'CALLOUT_REQUEST' || 
        l.content?.includes('CALLOUT_REQUEST') ||
        l.content?.includes('HttpRequest')
      );
      
      if (callouts.length >= this.thresholds.calloutThreshold) {
        // Group callouts by endpoint pattern
        const endpointGroups = {};
        
        for (const line of callouts) {
          const content = line.content || '';
          // Extract endpoint pattern (domain)
          const urlMatch = content.match(/https?:\/\/([^\/\s]+)/i);
          const endpoint = urlMatch ? urlMatch[1] : 'unknown';
          
          if (!endpointGroups[endpoint]) {
            endpointGroups[endpoint] = [];
          }
          endpointGroups[endpoint].push(line);
        }
        
        for (const [endpoint, calls] of Object.entries(endpointGroups)) {
          if (calls.length >= this.thresholds.calloutThreshold) {
            const isSequential = this._checkSequentialExecution(calls);
            
            if (isSequential) {
              this.patterns.push({
                type: PATTERN_TYPES.MULTIPLE_CALLOUTS,
                severity: SEVERITY.WARNING,
                title: 'Multiple HTTP Callouts',
                description: `${calls.length} callouts to ${endpoint} - consider batching`,
                endpoint,
                occurrences: calls.length,
                lines: calls.map(c => c.index),
                suggestion: 'Batch multiple callouts into one request if API supports it, or use @future/Queueable',
                impact: 'Synchronous callouts slow down user experience'
              });
            }
          }
        }
      }
    }

    /**
     * Detect excessive @future or Queueable calls
     * @private
     */
    _detectExcessiveFuture(lines) {
      const futureCalls = lines.filter(l => 
        l.content?.includes('@future') ||
        l.content?.includes('System.enqueueJob') ||
        l.content?.includes('FUTURE_METHOD') ||
        l.type === 'FUTURE_METHOD'
      );
      
      if (futureCalls.length >= this.thresholds.futureThreshold) {
        this.patterns.push({
          type: PATTERN_TYPES.EXCESSIVE_FUTURE,
          severity: futureCalls.length >= 10 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
          title: 'Excessive Async Calls',
          description: `${futureCalls.length} @future or Queueable jobs enqueued`,
          occurrences: futureCalls.length,
          lines: futureCalls.map(l => l.index).slice(0, 10),
          suggestion: 'Consider using Batchable for bulk processing, or consolidate async operations',
          impact: 'May hit async governor limits (50 @future calls per transaction)'
        });
      }
    }

    /**
     * Detect mixed DML operations (setup + non-setup objects)
     * @private
     */
    _detectMixedDml(lines) {
      const setupObjects = ['User', 'Group', 'GroupMember', 'PermissionSet', 'PermissionSetAssignment', 
                           'QueueSObject', 'SetupEntityAccess', 'FieldPermissions', 'ObjectPermissions'];
      
      let hasSetupDml = false;
      let hasNonSetupDml = false;
      const setupLines = [];
      const nonSetupLines = [];
      
      const dmlLines = lines.filter(l => l.type === 'DML_BEGIN');
      
      for (const line of dmlLines) {
        const objectType = line.details?.objectType || '';
        
        if (setupObjects.some(so => objectType.includes(so))) {
          hasSetupDml = true;
          setupLines.push(line.index);
        } else if (objectType) {
          hasNonSetupDml = true;
          nonSetupLines.push(line.index);
        }
      }
      
      if (hasSetupDml && hasNonSetupDml) {
        this.patterns.push({
          type: PATTERN_TYPES.MIXED_DML,
          severity: SEVERITY.CRITICAL,
          title: 'Mixed DML Operations',
          description: 'DML on setup and non-setup objects in same transaction',
          setupLines: setupLines.slice(0, 5),
          nonSetupLines: nonSetupLines.slice(0, 5),
          lines: [...setupLines.slice(0, 3), ...nonSetupLines.slice(0, 3)],
          suggestion: 'Use @future method or Queueable to separate setup object DML',
          impact: 'Will cause MIXED_DML_OPERATION error at runtime'
        });
      }
    }

    /**
     * Detect hardcoded Salesforce IDs in queries
     * @private
     */
    _detectHardcodedIds(lines) {
      const soqlLines = lines.filter(l => l.type === 'SOQL_EXECUTE_BEGIN');
      const hardcodedIdPattern = /['"]([a-zA-Z0-9]{15}|[a-zA-Z0-9]{18})['"]/g;
      const foundIds = [];
      
      for (const line of soqlLines) {
        const query = line.details?.query || line.content || '';
        const matches = query.match(hardcodedIdPattern);
        
        if (matches) {
          // Verify it looks like a Salesforce ID (starts with valid prefix)
          const validPrefixes = ['001', '003', '005', '006', '00Q', '500', '701', '00G', '00D', 
                                  '00e', '00T', '00U', '012', 'a0', '01I', '01p', '01q', 
                                  '00k', '00K', '04t', '800', '801'];
          for (const match of matches) {
            const id = match.replace(/['"]/g, '');
            if (validPrefixes.some(p => id.startsWith(p))) {
              foundIds.push({ id, line: line.index, query: this._truncateQuery(query) });
            }
          }
        }
      }
      
      if (foundIds.length > 0) {
        this.patterns.push({
          type: PATTERN_TYPES.HARDCODED_ID,
          severity: SEVERITY.WARNING,
          title: 'Hardcoded Record IDs',
          description: `Found ${foundIds.length} hardcoded Salesforce ID(s) in queries`,
          ids: foundIds.slice(0, 5),
          occurrences: foundIds.length,
          lines: foundIds.map(f => f.line),
          suggestion: 'Use Custom Settings, Custom Metadata, or dynamic queries instead of hardcoded IDs',
          impact: 'IDs differ between environments - will break in sandbox/production'
        });
      }
    }

    /**
     * Detect multiple validation rule failures
     * @private
     */
    _detectValidationFailures(lines) {
      const validationFailures = lines.filter(l => 
        l.content?.includes('VALIDATION_FAIL') ||
        l.content?.includes('FIELD_CUSTOM_VALIDATION_EXCEPTION') ||
        l.type === 'VALIDATION_ERROR'
      );
      
      if (validationFailures.length >= this.thresholds.validationFailureThreshold) {
        // Group by validation rule if possible
        const ruleGroups = {};
        
        for (const line of validationFailures) {
          const content = line.content || '';
          // Try to extract validation rule name
          const ruleMatch = content.match(/VALIDATION_RULE:\s*(\w+)/i) ||
                          content.match(/Rule:\s*(\w+)/i);
          const ruleName = ruleMatch ? ruleMatch[1] : 'Unknown';
          
          if (!ruleGroups[ruleName]) {
            ruleGroups[ruleName] = [];
          }
          ruleGroups[ruleName].push(line);
        }
        
        this.patterns.push({
          type: PATTERN_TYPES.VALIDATION_FAILURES,
          severity: SEVERITY.INFO,
          title: 'Multiple Validation Failures',
          description: `${validationFailures.length} validation rule failures detected`,
          rules: Object.keys(ruleGroups),
          occurrences: validationFailures.length,
          lines: validationFailures.map(l => l.index).slice(0, 10),
          suggestion: 'Review validation rules or data quality - consider handling in Apex before DML',
          impact: 'Data quality issues or overly restrictive validation rules'
        });
      }
    }

    /**
     * Detect excessive debug statements (System.debug)
     * @private
     */
    _detectDebugStatements(lines) {
      const debugLines = lines.filter(l => 
        l.type === 'USER_DEBUG' ||
        l.content?.includes('USER_DEBUG') ||
        l.content?.includes('System.debug')
      );
      
      if (debugLines.length >= this.thresholds.debugStatementsThreshold) {
        this.patterns.push({
          type: PATTERN_TYPES.DEBUG_STATEMENTS,
          severity: SEVERITY.INFO,
          title: 'Excessive Debug Statements',
          description: `${debugLines.length} System.debug statements found`,
          occurrences: debugLines.length,
          lines: debugLines.map(l => l.index).slice(0, 15),
          suggestion: 'Remove debug statements before deploying to production - they consume CPU and heap',
          impact: 'Performance overhead and cluttered logs'
        });
      }
    }

    /**
     * Detect callout after DML (uncommitted work pending)
     * @private
     */
    _detectCalloutAfterDml(lines) {
      let lastDmlIndex = -1;
      let dmlFound = false;
      const violations = [];
      
      for (const line of lines) {
        // Track DML operations
        if (line.type === 'DML_BEGIN' || line.content?.includes('DML_BEGIN')) {
          dmlFound = true;
          lastDmlIndex = line.index;
        }
        
        // Check for callout after DML
        if (dmlFound && (
          line.type === 'CALLOUT_REQUEST' || 
          line.content?.includes('CALLOUT_REQUEST') ||
          line.content?.includes('System.HttpRequest')
        )) {
          violations.push({
            dmlLine: lastDmlIndex,
            calloutLine: line.index
          });
        }
        
        // Reset on transaction boundary or commit
        if (line.content?.includes('COMMIT') || 
            line.content?.includes('CODE_UNIT_FINISHED') ||
            line.type === 'CODE_UNIT_FINISHED') {
          dmlFound = false;
        }
      }
      
      if (violations.length > 0) {
        this.patterns.push({
          type: PATTERN_TYPES.CALLOUT_AFTER_DML,
          severity: SEVERITY.CRITICAL,
          title: 'Callout After DML',
          description: `HTTP callout performed after DML operation without commit`,
          occurrences: violations.length,
          lines: violations.map(v => v.calloutLine),
          suggestion: 'Move callout before DML, or use @future(callout=true) for the callout',
          impact: 'Will cause "You have uncommitted work pending" error'
        });
      }
    }

    /**
     * Detect queries returning large result sets
     * @private
     */
    _detectLargeQueryResults(lines) {
      const largeResults = [];
      
      for (const line of lines) {
        // Look for SOQL_EXECUTE_END with row count
        if (line.type === 'SOQL_EXECUTE_END' || line.content?.includes('SOQL_EXECUTE_END')) {
          const content = line.content || '';
          // Extract row count: "Rows:150" or similar
          const rowMatch = content.match(/Rows[:\s]*(\d+)/i);
          
          if (rowMatch) {
            const rowCount = parseInt(rowMatch[1], 10);
            if (rowCount >= this.thresholds.largeQueryResultThreshold) {
              largeResults.push({
                line: line.index,
                rows: rowCount
              });
            }
          }
        }
      }
      
      if (largeResults.length > 0) {
        const maxRows = Math.max(...largeResults.map(r => r.rows));
        
        this.patterns.push({
          type: PATTERN_TYPES.LARGE_QUERY_RESULT,
          severity: maxRows >= 500 ? SEVERITY.WARNING : SEVERITY.INFO,
          title: 'Large Query Results',
          description: `${largeResults.length} queries returned ${this.thresholds.largeQueryResultThreshold}+ records (max: ${maxRows})`,
          occurrences: largeResults.length,
          maxRows,
          lines: largeResults.map(r => r.line),
          suggestion: 'Add more filters to WHERE clause or use LIMIT to reduce result size',
          impact: 'Large result sets consume heap memory and may cause performance issues'
        });
      }
    }

    /**
     * Detect slow SOQL queries (long execution time)
     * @private
     */
    _detectSlowQueries(lines) {
      const soqlBegins = {};
      const slowQueries = [];

      for (const line of lines) {
        if (line.type === 'SOQL_EXECUTE_BEGIN') {
          soqlBegins[line.index] = line;
        }

        if (line.type === 'SOQL_EXECUTE_END' || line.content?.includes('SOQL_EXECUTE_END')) {
          // Find the closest preceding SOQL_EXECUTE_BEGIN
          const beginIndices = Object.keys(soqlBegins).map(Number).sort((a, b) => b - a);
          const matchedIndex = beginIndices.find(idx => idx < line.index);

          if (matchedIndex !== undefined) {
            const beginLine = soqlBegins[matchedIndex];
            delete soqlBegins[matchedIndex];

            // Calculate duration from nanosecond timestamps
            if (beginLine.duration !== undefined && line.duration !== undefined) {
              const durationNs = line.duration - beginLine.duration;
              const durationMs = durationNs / 1000000;

              if (durationMs >= this.thresholds.slowQueryMs) {
                slowQueries.push({
                  line: beginLine.index,
                  query: beginLine.details.query || beginLine.content,
                  durationMs: Math.round(durationMs)
                });
              }
            }
          }
        }
      }

      for (const sq of slowQueries) {
        this.patterns.push({
          type: PATTERN_TYPES.SLOW_QUERY,
          severity: sq.durationMs >= 5000 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
          title: 'Slow SOQL Query',
          description: `Query took ${sq.durationMs}ms to execute`,
          query: this._truncateQuery(sq.query),
          durationMs: sq.durationMs,
          lines: [sq.line],
          suggestion: 'Add selective filters on indexed fields, reduce result set with LIMIT, or add custom indexes',
          impact: 'Slow queries degrade user experience and increase CPU time consumption'
        });
      }
    }

    /**
     * Detect total rows fetched approaching the 50,000 governor limit
     * @private
     */
    _detectExcessiveRowsFetched(lines, stats) {
      let totalRowsFetched = 0;
      const maxRows = 50000;

      for (const line of lines) {
        if (line.type === 'SOQL_EXECUTE_END' || line.content?.includes('SOQL_EXECUTE_END')) {
          const content = line.content || '';
          const rowMatch = content.match(/Rows[:\s]*(\d+)/i);
          if (rowMatch) {
            totalRowsFetched += parseInt(rowMatch[1], 10);
          } else if (line.details?.rows) {
            totalRowsFetched += line.details.rows;
          }
        }
      }

      const rowPercent = (totalRowsFetched / maxRows) * 100;
      if (rowPercent >= this.thresholds.excessiveRowsFetchedPercent) {
        this.patterns.push({
          type: PATTERN_TYPES.EXCESSIVE_ROWS_FETCHED,
          severity: rowPercent >= 90 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
          title: 'High Total Rows Fetched',
          description: `Fetched ${totalRowsFetched.toLocaleString()}/${maxRows.toLocaleString()} total rows across all queries (${rowPercent.toFixed(0)}%)`,
          current: totalRowsFetched,
          max: maxRows,
          percent: rowPercent,
          suggestion: 'Reduce the number of records fetched by adding filters and LIMIT clauses, or use SOQL for loops for batch processing',
          impact: 'Risk of hitting the 50,000 total rows governor limit'
        });
      }
    }

    /**
     * Detect total DML rows approaching the 10,000 governor limit
     * @private
     */
    _detectDmlRowsLimit(lines, stats) {
      let totalDmlRows = 0;
      const maxDmlRows = 10000;

      for (const line of lines) {
        if (line.type === 'DML_BEGIN') {
          const rows = line.details?.rows || 0;
          totalDmlRows += rows;
        }
      }

      const dmlRowPercent = (totalDmlRows / maxDmlRows) * 100;
      if (dmlRowPercent >= this.thresholds.dmlRowsPercent) {
        this.patterns.push({
          type: PATTERN_TYPES.DML_ROWS_LIMIT,
          severity: dmlRowPercent >= 90 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
          title: 'High DML Rows Usage',
          description: `${totalDmlRows.toLocaleString()}/${maxDmlRows.toLocaleString()} DML rows processed (${dmlRowPercent.toFixed(0)}%)`,
          current: totalDmlRows,
          max: maxDmlRows,
          percent: dmlRowPercent,
          suggestion: 'Process fewer records per transaction, or move bulk operations to Batch Apex',
          impact: 'Risk of hitting the 10,000 DML rows governor limit'
        });
      }
    }

    /**
     * Detect SOQL queries returning 0 rows (wasted queries)
     * @private
     */
    _detectEmptyQueryResults(lines) {
      const emptyQueries = [];

      // Match SOQL_EXECUTE_BEGIN with their corresponding END
      let pendingBegin = null;

      for (const line of lines) {
        if (line.type === 'SOQL_EXECUTE_BEGIN') {
          pendingBegin = line;
        }
        if ((line.type === 'SOQL_EXECUTE_END' || line.content?.includes('SOQL_EXECUTE_END')) && pendingBegin) {
          const content = line.content || '';
          const rowMatch = content.match(/Rows[:\s]*(\d+)/i);
          const rows = rowMatch ? parseInt(rowMatch[1], 10) : (line.details?.rows ?? -1);

          if (rows === 0) {
            emptyQueries.push({
              line: pendingBegin.index,
              query: pendingBegin.details.query || pendingBegin.content
            });
          }
          pendingBegin = null;
        }
      }

      if (emptyQueries.length >= this.thresholds.emptyQueryThreshold) {
        this.patterns.push({
          type: PATTERN_TYPES.EMPTY_QUERY_RESULT,
          severity: SEVERITY.INFO,
          title: 'Empty SOQL Results',
          description: `${emptyQueries.length} queries returned 0 rows - wasted SOQL governor limit`,
          occurrences: emptyQueries.length,
          queries: emptyQueries.slice(0, 5).map(q => this._truncateQuery(q.query)),
          lines: emptyQueries.map(q => q.line),
          suggestion: 'Check if these queries are necessary, or validate data existence before querying',
          impact: `${emptyQueries.length} SOQL queries consumed without returning data`
        });
      }
    }

    /**
     * Detect Schema.describe calls in loops
     * @private
     */
    _detectDescribeInLoop(lines) {
      const describeCalls = [];

      for (const line of lines) {
        const content = (line.content || '').toLowerCase();
        if (line.type === 'METHOD_ENTRY' || line.type === 'SYSTEM_METHOD_ENTRY') {
          if (content.includes('describe') && (
            content.includes('schema') || 
            content.includes('sobjecttype') || 
            content.includes('getdescribe') ||
            content.includes('describeSObjects'.toLowerCase()) ||
            content.includes('getglobaldescribe')
          )) {
            describeCalls.push(line);
          }
        }
        // Also match specific describe log events
        if (content.includes('DESCRIBE_RESULT') || content.includes('DESCRIBE_SOBJECT')) {
          describeCalls.push(line);
        }
      }

      if (describeCalls.length >= this.thresholds.describeInLoopThreshold) {
        const isInLoop = this._checkSequentialExecution(describeCalls);
        if (isInLoop) {
          this.patterns.push({
            type: PATTERN_TYPES.DESCRIBE_IN_LOOP,
            severity: SEVERITY.WARNING,
            title: 'Schema Describe in Loop',
            description: `${describeCalls.length} Schema.describe calls detected in sequence - likely in a loop`,
            occurrences: describeCalls.length,
            lines: describeCalls.map(l => l.index).slice(0, 10),
            suggestion: 'Cache describe results in a static variable and reuse them instead of calling describe repeatedly',
            impact: 'Schema.describe calls are expensive on CPU time and count toward describe limits'
          });
        }
      }
    }

    /**
     * Detect exceptions that appear to be swallowed (caught but not handled)
     * @private
     */
    _detectExceptionSwallowed(lines) {
      const exceptions = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.type === 'EXCEPTION_THROWN' || line.content?.includes('EXCEPTION_THROWN')) {
          // Look at the following lines (within 10 lines) for indicators of handling
          let handled = false;
          const exceptionContent = line.content || '';

          for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
            const nextLine = lines[j];
            const nextContent = (nextLine.content || '').toLowerCase();

            // Consider exception handled if there's a debug/log, DML, another throw, or fatal
            if (nextContent.includes('user_debug') ||
                nextContent.includes('system.debug') ||
                nextContent.includes('logger') ||
                nextContent.includes('exception') ||
                nextLine.type === 'FATAL_ERROR' ||
                nextContent.includes('fatal_error')) {
              handled = true;
              break;
            }
          }

          if (!handled) {
            exceptions.push({
              line: line.index,
              exception: exceptionContent
            });
          }
        }
      }

      if (exceptions.length > 0) {
        this.patterns.push({
          type: PATTERN_TYPES.EXCEPTION_SWALLOWED,
          severity: exceptions.length >= 3 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
          title: 'Possibly Swallowed Exception',
          description: `${exceptions.length} exception(s) thrown with no visible handling (no debug, log, or re-throw)`,
          occurrences: exceptions.length,
          exceptions: exceptions.slice(0, 5).map(e => this._truncateQuery(e.exception)),
          lines: exceptions.map(e => e.line),
          suggestion: 'Ensure all exceptions are properly logged, handled, or re-thrown. Silent catch blocks hide bugs',
          impact: 'Swallowed exceptions make debugging extremely difficult and may hide data integrity issues'
        });
      }
    }

    /**
     * Detect Flow / Process Builder recursion
     * @private
     */
    _detectFlowRecursion(lines) {
      const flowExecutions = {};

      for (const line of lines) {
        const content = line.content || '';

        // Detect Flow start events
        if (line.type === 'FLOW_START_INTERVIEW_BEGIN' ||
            line.type === 'FLOW_CREATE_INTERVIEW_BEGIN' ||
            content.includes('FLOW_START_INTERVIEW') ||
            content.includes('Flow:') ||
            content.includes('Process_Builder') ||
            (line.type === 'CODE_UNIT_STARTED' && content.includes('Flow'))) {
          
          // Extract flow name
          const flowMatch = content.match(/Flow[:\s]+(\w[\w\s-]*\w)/i) ||
                           content.match(/FLOW_START_INTERVIEW_BEGIN\|.*\|(\w+)/i) ||
                           content.match(/([\w_]+(?:Flow|Process)[\w_]*)/i);
          
          const flowName = flowMatch ? flowMatch[1].trim() : 'Unknown Flow';

          if (!flowExecutions[flowName]) {
            flowExecutions[flowName] = { name: flowName, lines: [] };
          }
          flowExecutions[flowName].lines.push(line.index);
        }
      }

      for (const [name, data] of Object.entries(flowExecutions)) {
        if (data.lines.length > this.thresholds.flowRecursionLimit) {
          this.patterns.push({
            type: PATTERN_TYPES.FLOW_RECURSION,
            severity: data.lines.length > 10 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
            title: 'Flow/Process Builder Recursion',
            description: `"${data.name}" executed ${data.lines.length} times - likely recursive`,
            flowName: data.name,
            occurrences: data.lines.length,
            lines: data.lines.slice(0, 10),
            suggestion: 'Add an entry condition to prevent re-execution (e.g., check $Record__Prior values or use a checkbox field as guard)',
            impact: 'Recursive flows consume governor limits and may cause infinite loops'
          });
        }
      }
    }

    /**
     * Detect nested loop patterns (O(n²)) via SOQL/DML within nested METHOD_ENTRY
     * @private
     */
    _detectNestedLoopPattern(lines) {
      // Strategy: Find methods that call SOQL/DML AND are called by another method
      // that itself is called multiple times. This indicates a nested loop pattern.
      const methodCallCounts = {};
      const methodContainsSoqlDml = {};
      let currentMethodStack = [];

      for (const line of lines) {
        if (line.type === 'METHOD_ENTRY') {
          const signature = `${line.details.class || ''}.${line.details.method || ''}`;
          currentMethodStack.push(signature);
          
          if (!methodCallCounts[signature]) {
            methodCallCounts[signature] = 0;
          }
          methodCallCounts[signature]++;
        }

        if (line.type === 'METHOD_EXIT') {
          currentMethodStack.pop();
        }

        // Track if current method context triggers SOQL or DML
        if ((line.type === 'SOQL_EXECUTE_BEGIN' || line.type === 'DML_BEGIN') && currentMethodStack.length >= 2) {
          const innerMethod = currentMethodStack[currentMethodStack.length - 1];
          const outerMethod = currentMethodStack[currentMethodStack.length - 2];

          if (!methodContainsSoqlDml[innerMethod]) {
            methodContainsSoqlDml[innerMethod] = { type: line.type, calledFrom: new Set() };
          }
          methodContainsSoqlDml[innerMethod].calledFrom.add(outerMethod);
        }
      }

      // Find methods that contain SOQL/DML and are called multiple times from a method also called multiple times
      for (const [method, data] of Object.entries(methodContainsSoqlDml)) {
        const innerCalls = methodCallCounts[method] || 0;
        
        for (const outerMethod of data.calledFrom) {
          const outerCalls = methodCallCounts[outerMethod] || 0;

          if (innerCalls >= this.thresholds.nestedLoopDmlSoqlThreshold && 
              outerCalls >= this.thresholds.nestedLoopDmlSoqlThreshold &&
              method !== outerMethod) {
            
            const opType = data.type === 'SOQL_EXECUTE_BEGIN' ? 'SOQL' : 'DML';

            this.patterns.push({
              type: PATTERN_TYPES.NESTED_LOOP_PATTERN,
              severity: SEVERITY.WARNING,
              title: `Nested Loop with ${opType}`,
              description: `${method} (called ${innerCalls}x) contains ${opType}, called from ${outerMethod} (called ${outerCalls}x) — possible O(n²) pattern`,
              innerMethod: method,
              outerMethod: outerMethod,
              innerCalls,
              outerCalls,
              suggestion: `Refactor to collect data in the outer loop and perform ${opType} operations in bulk after the loop`,
              impact: `O(n²) complexity: ${innerCalls}×${outerCalls} potential ${opType} operations`
            });
          }
        }
      }
    }

    /**
     * Detect dynamic SOQL (Database.query) which may indicate SOQL injection risk
     * @private
     */
    _detectSoqlInjectionRisk(lines) {
      // Reliable detection: in Salesforce logs, inline SOQL uses :tmpVarN bind
      // variables, while Database.query() shows interpolated values directly.
      // A SOQL_EXECUTE_BEGIN without :tmpVar patterns indicates dynamic SOQL.
      const soqlLines = lines.filter(l => l.type === 'SOQL_EXECUTE_BEGIN');

      const dynamicSoqlLines = soqlLines.filter(l => {
        const query = l.details?.query || l.content || '';
        // Inline SOQL uses :tmpVar1, :tmpVar2 etc. in the logged query
        const hasBindVariable = /:tmpVar\d+/i.test(query);
        // Skip aggregate queries (COUNT, SUM, etc.) — often legitimately dynamic
        const isAggregate = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(query);
        return !hasBindVariable && !isAggregate;
      });

      // Exclude queries with WITH SECURITY_ENFORCED / USER_MODE / SYSTEM_MODE
      // since those are clearly written as inline SOQL with mode keywords
      const suspectedDynamic = dynamicSoqlLines.filter(l => {
        const query = (l.details?.query || l.content || '').toUpperCase();
        // Inline SOQL with security keywords is explicitly written — not dynamic
        const hasSecurityKeyword = query.includes('WITH SECURITY_ENFORCED') ||
                                   query.includes('WITH USER_MODE') ||
                                   query.includes('WITH SYSTEM_MODE');
        return !hasSecurityKeyword;
      });

      if (suspectedDynamic.length > 0) {
        this.patterns.push({
          type: PATTERN_TYPES.SOQL_INJECTION_RISK,
          severity: SEVERITY.WARNING,
          title: 'Dynamic SOQL — Injection Risk',
          description: `${suspectedDynamic.length} SOQL query(ies) executed without bind variables — likely Database.query() with string concatenation`,
          occurrences: suspectedDynamic.length,
          lines: suspectedDynamic.map(l => l.index).slice(0, 10),
          suggestion: 'Use bind variables (:var), Database.queryWithBinds(), or inline SOQL instead of string concatenation',
          impact: 'SOQL injection can expose or modify unauthorized data'
        });
      }
    }

    /**
     * Detect SOQL queries without CRUD/FLS enforcement (pre-API v67 code)
     * In API v67+, user mode is default — WITH SECURITY_ENFORCED is legacy
     * @private
     */
    _detectCrudFlsBypass(lines) {
      const soqlLines = lines.filter(l => l.type === 'SOQL_EXECUTE_BEGIN');

      if (soqlLines.length === 0) return;

      // Detect legacy WITH SECURITY_ENFORCED usage (deprecated in v67+)
      const legacySecurityEnforced = soqlLines.filter(l => {
        const query = (l.details?.query || l.content || '').toUpperCase();
        return query.includes('WITH SECURITY_ENFORCED');
      });

      if (legacySecurityEnforced.length > 0) {
        this.patterns.push({
          type: PATTERN_TYPES.CRUD_FLS_BYPASS,
          severity: SEVERITY.INFO,
          title: 'Legacy WITH SECURITY_ENFORCED',
          description: `${legacySecurityEnforced.length} queries use WITH SECURITY_ENFORCED — deprecated since API v67 (Summer '26), user mode is now the default`,
          occurrences: legacySecurityEnforced.length,
          lines: legacySecurityEnforced.map(l => l.index).slice(0, 10),
          suggestion: 'Remove WITH SECURITY_ENFORCED (redundant in API v67+). Use WITH USER_MODE for explicit intent, or WITH SYSTEM_MODE only when bypassing is justified',
          impact: 'Technical debt — no security risk, but code should be modernized'
        });
      }
    }

    /**
     * Detect explicit SYSTEM_MODE usage that bypasses FLS/CRUD enforcement
     * @private
     */
    _detectSystemModeUsage(lines) {
      // Only check structural log line types — not USER_DEBUG or CONTINUATION
      const structuralTypes = new Set([
        'SOQL_EXECUTE_BEGIN', 'DML_BEGIN', 'METHOD_ENTRY',
        'CODE_UNIT_STARTED', 'CONSTRUCTOR_ENTRY'
      ]);

      // Check SOQL with SYSTEM_MODE
      const soqlSystemMode = lines.filter(l =>
        l.type === 'SOQL_EXECUTE_BEGIN' &&
        (l.details?.query || l.content || '').toUpperCase().includes('WITH SYSTEM_MODE')
      );

      // Check DML with "as system"
      const dmlSystemMode = lines.filter(l =>
        l.type === 'DML_BEGIN' &&
        (l.content || '').toLowerCase().includes('as system')
      );

      // Check Database methods with AccessLevel.SYSTEM_MODE (METHOD_ENTRY only)
      const dbSystemMode = lines.filter(l =>
        structuralTypes.has(l.type) &&
        (l.content?.includes('AccessLevel.SYSTEM_MODE') ||
         l.content?.includes('AccessLevel.System_mode'))
      );

      const allSystemMode = [...soqlSystemMode, ...dmlSystemMode, ...dbSystemMode];

      if (allSystemMode.length > 0) {
        this.patterns.push({
          type: PATTERN_TYPES.SYSTEM_MODE_USAGE,
          severity: SEVERITY.WARNING,
          title: 'Explicit System Mode — FLS Bypassed',
          description: `${allSystemMode.length} operation(s) explicitly bypass CRUD/FLS via SYSTEM_MODE or "as system"`,
          occurrences: allSystemMode.length,
          lines: allSystemMode.map(l => l.index).slice(0, 10),
          suggestion: 'Verify each SYSTEM_MODE usage is justified. Prefer USER_MODE (default in API v67+) unless a legitimate service-layer bypass is needed',
          impact: 'Users may access or modify records/fields they should not — review for least-privilege compliance'
        });
      }
    }

    /**
     * Detect "without sharing" class execution in the log
     * @private
     */
    _detectWithoutSharing(lines) {
      // Only detect in structural log lines — exclude USER_DEBUG to avoid false positives
      const relevantTypes = new Set([
        'CODE_UNIT_STARTED', 'CODE_UNIT_FINISHED',
        'METHOD_ENTRY', 'CONSTRUCTOR_ENTRY',
        'SYSTEM_METHOD_ENTRY', 'VF_PAGE_MESSAGE'
      ]);

      const allMatches = lines.filter(l =>
        relevantTypes.has(l.type) &&
        /\bwithout\s+sharing\b/i.test(l.content || '')
      );

      if (allMatches.length > 0) {
        this.patterns.push({
          type: PATTERN_TYPES.WITHOUT_SHARING,
          severity: SEVERITY.INFO,
          title: 'Without Sharing Context',
          description: `${allMatches.length} reference(s) to "without sharing" — record-level security bypassed`,
          occurrences: allMatches.length,
          lines: allMatches.map(l => l.index).slice(0, 10),
          suggestion: 'In API v67+, undecorated classes default to "with sharing". Audit existing "without sharing" declarations for least-privilege compliance',
          impact: 'Code can access records the current user should not see — verify this is intentional'
        });
      }
    }

    /**
     * Detect HTTP callouts to non-HTTPS endpoints
     * @private
     */
    _detectInsecureEndpoint(lines) {
      const callouts = lines.filter(l =>
        l.type === 'CALLOUT_REQUEST' ||
        l.content?.includes('CALLOUT_REQUEST')
      );

      const insecureCallouts = callouts.filter(l => {
        const content = l.content || '';
        return /http:\/\/(?!localhost|127\.0\.0\.1)/i.test(content);
      });

      if (insecureCallouts.length > 0) {
        this.patterns.push({
          type: PATTERN_TYPES.INSECURE_ENDPOINT,
          severity: SEVERITY.WARNING,
          title: 'Insecure HTTP Endpoint',
          description: `${insecureCallouts.length} callout(s) to non-HTTPS endpoint(s) — data transmitted in clear text`,
          occurrences: insecureCallouts.length,
          lines: insecureCallouts.map(l => l.index).slice(0, 10),
          suggestion: 'Use HTTPS for all external callouts to encrypt data in transit',
          impact: 'Sensitive data (tokens, PII) can be intercepted via man-in-the-middle attacks'
        });
      }
    }

    /**
     * Group similar SOQL queries by pattern
     * @private
     */
    _groupSimilarQueries(soqlLines) {
      const groups = {};
      
      for (const line of soqlLines) {
        // Normalize query by removing specific values
        const query = (line.details.query || line.content || '');
        const pattern = this._normalizeQueryPattern(query);
        
        if (!groups[pattern]) {
          groups[pattern] = [];
        }
        groups[pattern].push(line);
      }
      
      return groups;
    }

    /**
     * Normalize a query to identify similar patterns
     * @private
     */
    _normalizeQueryPattern(query) {
      return query
        .replace(/'[^']*'/g, '?')      // Replace string literals
        .replace(/\d+/g, '?')          // Replace numbers
        .replace(/\s+/g, ' ')          // Normalize whitespace
        .trim()
        .toLowerCase();
    }

    /**
     * Check if lines are executed sequentially (likely in a loop)
     * @private
     */
    _checkSequentialExecution(lines) {
      if (lines.length < 3) return false;
      
      // Check if lines are close together in the log
      const indices = lines.map(l => l.index).sort((a, b) => a - b);
      
      let sequentialCount = 0;
      for (let i = 1; i < indices.length; i++) {
        // If lines are within 50 lines of each other, consider them sequential
        if (indices[i] - indices[i-1] < 50) {
          sequentialCount++;
        }
      }
      
      // If more than 60% are sequential, it's likely a loop
      return (sequentialCount / (indices.length - 1)) > 0.6;
    }

    /**
     * Truncate query for display
     * @private
     */
    _truncateQuery(query, maxLength = 100) {
      if (!query) return '';
      return query.length > maxLength 
        ? query.substring(0, maxLength) + '...' 
        : query;
    }

    /**
     * Generate summary of detected patterns
     * @private
     */
    _generateSummary() {
      const critical = this.patterns.filter(p => p.severity === SEVERITY.CRITICAL);
      const warnings = this.patterns.filter(p => p.severity === SEVERITY.WARNING);
      const info = this.patterns.filter(p => p.severity === SEVERITY.INFO);
      
      return {
        critical: critical.length,
        warnings: warnings.length,
        info: info.length,
        total: this.patterns.length,
        score: this._calculateHealthScore(critical.length, warnings.length, info.length)
      };
    }

    /**
     * Calculate a health score (0-100)
     * @private
     */
    _calculateHealthScore(critical, warnings, info) {
      // Start with 100, deduct points for issues
      let score = 100;
      score -= critical * 20;    // -20 per critical
      score -= warnings * 10;   // -10 per warning
      score -= info * 2;        // -2 per info
      return Math.max(0, Math.min(100, score));
    }
  }

  // Export constants for use in UI
  window.FoxLog.ANTI_PATTERN_SEVERITY = SEVERITY;
  window.FoxLog.ANTI_PATTERN_TYPES = PATTERN_TYPES;
  
  // Create singleton instance
  window.FoxLog.AntiPatternDetector = AntiPatternDetector;
  window.FoxLog.antiPatternDetector = new AntiPatternDetector();
  
  logger.log('[FoxLog] Anti-Pattern Detector loaded');
})();
