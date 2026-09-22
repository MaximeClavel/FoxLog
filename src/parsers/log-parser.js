// src/parsers/log-parser.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;

  // Every debug log event type that represents a Flow/Workflow-action-level
  // or Validation-Rule-level error (as opposed to a raw Apex
  // EXCEPTION_THROWN/FATAL_ERROR). The Flow/Workflow ones are confirmed
  // against a real "Workflow: FINER" category log: an explicit fault routed
  // to a Flow element, an interview that failed to start/be created, a
  // Workflow-Rule-launched flow action's error, and an invocable Apex
  // action's error (the case where a Flow calls into Apex that fails).
  // VALIDATION_FAIL is confirmed against a real failing run (see
  // tests/flow-error-repro/): bare, no extra fields, same as its sibling
  // VALIDATION_PASS -- the fallback label in call-tree-worker.js's
  // _markError ("Validation Rule failed") is what actually shows, since
  // there's no message to parse. VALIDATION_ERROR/
  // FIELD_CUSTOM_VALIDATION_EXCEPTION are unconfirmed alternates kept as a
  // defensive fallback (no real log has produced either so far).
  // FLOW_ELEMENT_FAULT specifically is confirmed to have its message FIRST
  // ("<fault message>|<element type>|<element API name>"), unlike the
  // generic elementType|elementName|message shape used below for the
  // others -- see _parseFlowElementFault.
  const STRUCTURED_ERROR_TYPES = [
    'FLOW_ELEMENT_ERROR',
    'FLOW_ELEMENT_FAULT',
    'FLOW_CREATE_INTERVIEW_ERROR',
    'FLOW_START_INTERVIEWS_ERROR',
    'INVOCABLE_ACTION_ERROR',
    'WF_FLOW_ACTION_ERROR',
    'WF_FLOW_ACTION_ERROR_DETAIL',
    'VALIDATION_FAIL',
    'VALIDATION_ERROR',
    'FIELD_CUSTOM_VALIDATION_EXCEPTION'
  ];

  // Non-error Flow "detail" events: attached as leaf nodes under whichever
  // element/interview is currently open, same treatment as USER_DEBUG/
  // VARIABLE_ASSIGNMENT already get. Field layout confirmed against a real
  // log (see tests/flow-error-repro/) for every entry below.
  const FLOW_DETAIL_TYPES = [
    'FLOW_RULE_DETAIL',
    'FLOW_ASSIGNMENT_DETAIL',
    'FLOW_VALUE_ASSIGNMENT',
    'FLOW_SUBFLOW_DETAIL',
    'FLOW_LOOP_DETAIL',
    'FLOW_BULK_ELEMENT_DETAIL',
    'FLOW_ACTIONCALL_DETAIL'
  ];

  // Validation Rule execution trace, confirmed against a real log: fires on
  // every DML that runs validation, whether or not any rule ends up
  // failing (VALIDATION_RULE names the rule being evaluated,
  // VALIDATION_FORMULA shows its formula/field values, then either
  // VALIDATION_PASS or VALIDATION_FAIL -- both confirmed bare, no extra
  // fields, see STRUCTURED_ERROR_TYPES above).
  const VALIDATION_DETAIL_TYPES = [
    'VALIDATION_RULE',
    'VALIDATION_FORMULA',
    'VALIDATION_PASS'
  ];

  class LogParser {
    constructor() {
      this.LOG_TYPES = window.FoxLog.LOG_TYPES || {};

      this.patterns = {
        // The |content group is optional: confirmed against a real log
        // that some event types are bare, with no second pipe at all
        // (VALIDATION_PASS, CUMULATIVE_LIMIT_USAGE...). Without this those
        // lines fell through to CONTINUATION instead of getting their real
        // type.
        timestamp: /^(\d{2}:\d{2}:\d{2}\.\d+)\s+\((\d+)\)\|([A-Z_]+)(?:\|(.*))?$/,
        method: /\[(\d+)\]\|([^|]+)\|(.+)/,
        soql: /\[(\d+)\](.+)/,
        rows: /Rows:(\d+)/
      };
    }

    parse(rawLog, metadata = {}) {
      const allLines = rawLog.split('\n');
      const parsedLines = [];
      const stats = this._initStats();
      
      let currentDepth = 0;

      // Track original line index for scroll navigation
      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];
        if (!line.trim()) continue; // Skip empty lines but keep the index
        
        const parsedLine = this._parseLine(line, i, currentDepth);
        
        if (parsedLine) {
          currentDepth = this._updateDepth(parsedLine, currentDepth);
          parsedLine.depth = currentDepth;
          
          parsedLines.push(parsedLine);
          this._collectStats(parsedLine, stats);
        }
      }

      this._parseCumulativeLimits(allLines, stats);

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

      const [, timestamp, duration, type, rawContent] = match;
      const content = rawContent || '';

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
        [this.LOG_TYPES.ERROR]: () => this._parseException(content),
        'SOSL_EXECUTE_BEGIN': () => this._parseSOSL(content),
        'SOSL_EXECUTE_END': () => this._parseSOQLEnd(content),
        'CALLOUT_REQUEST': () => this._parseCallout(content),
        'CALLOUT_RESPONSE': () => this._parseCallout(content),
        'FLOW_ELEMENT_BEGIN': () => this._parseFlowElement(content),
        'FLOW_ELEMENT_END': () => this._parseFlowElement(content),
        'FLOW_ELEMENT_FAULT': () => this._parseFlowElementFault(content),
        'FLOW_VALUE_ASSIGNMENT': () => this._parseFlowValueAssignment(content),
        'FLOW_ASSIGNMENT_DETAIL': () => this._parseFlowAssignmentDetail(content),
        'FLOW_LOOP_DETAIL': () => this._parseFlowLoopDetail(content),
        'FLOW_RULE_DETAIL': () => this._parseFlowRuleDetail(content),
        'FLOW_SUBFLOW_DETAIL': () => this._parseFlowSubflowDetail(content),
        'FLOW_BULK_ELEMENT_DETAIL': () => this._parseFlowBulkElementDetail(content),
        'FLOW_ACTIONCALL_DETAIL': () => this._parseFlowActionCallDetail(content),
        'VALIDATION_RULE': () => this._parseValidationRule(content),
        'VALIDATION_FORMULA': () => this._parseValidationFormula(content)
      };
      // Remaining STRUCTURED_ERROR_TYPES not given a dedicated parser above
      // (FLOW_ELEMENT_FAULT is handled separately -- see the comment on
      // that list) share the generic elementType|elementName|message
      // best-effort shape.
      STRUCTURED_ERROR_TYPES.forEach(errorType => {
        if (!parsers[errorType]) parsers[errorType] = () => this._parseFlowError(content);
      });

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

    _parseSOSL(content) {
      // Assumed to share SOQL's "[lineNum]|query text" shape (with or
      // without the pipe) -- unverified, see tests/flow-error-repro/.
      const match = this.patterns.soql.exec(content);
      if (!match) return { query: content.trim() };
      return { query: match[2].replace(/^\|/, '').trim() };
    }

    _parseCallout(content) {
      // Confirmed against a real log: CALLOUT_REQUEST is
      // "[line]|System.HttpRequest[Endpoint=<url>, Method=<verb>]",
      // CALLOUT_RESPONSE is "[line]|System.HttpResponse[Status=<text>,
      // StatusCode=<code>]". Kept as a regex extraction rather than a
      // strict positional parse since the bracketed fields could appear in
      // a different order/set depending on what was set on the request.
      const details = { raw: content };
      const urlMatch = content.match(/https?:\/\/[^\s,\]|]+/);
      if (urlMatch) details.endpoint = urlMatch[0];
      const statusMatch = content.match(/\b([1-5]\d{2})\b/);
      if (statusMatch) details.status = parseInt(statusMatch[1], 10);
      return details;
    }

    _parseDML(content) {
      // Format: [16]|Op:Insert|Type:Account|Rows:1
      const parts = content.split('|');
      const details = {};
      
      for (const part of parts) {
        if (part.startsWith('Op:')) {
          details.operation = part.substring(3);
        } else if (part.startsWith('Type:')) {
          details.objectType = part.substring(5);
        } else if (part.startsWith('Rows:')) {
          details.rows = parseInt(part.substring(5), 10);
        } else if (part.match(/^\[\d+\]$/)) {
          details.line = part;
        }
      }
      
      return details;
    }

    _parseDebug(content) {
      const [line, level, message] = content.split('|');
      return { line, level, message };
    }

    _parseException(content) {
      // Format: [60]|System.MathException: Divide by 0
      const parts = content.split('|');
      const details = {};
      
      // First part is usually the line number [60]
      if (parts[0] && parts[0].match(/^\[\d+\]$/)) {
        details.line = parts[0];
      }
      
      // Second part contains the exception type and message
      const exceptionPart = parts[1] || parts[0];
      if (exceptionPart) {
        const colonIndex = exceptionPart.indexOf(':');
        if (colonIndex > -1) {
          details.exceptionType = exceptionPart.substring(0, colonIndex).trim();
          details.message = exceptionPart.substring(colonIndex + 1).trim();
        } else {
          details.exceptionType = exceptionPart.trim();
          details.message = '';
        }
      }
      
      return details;
    }

    _parseFlowElement(content) {
      // Confirmed against a real log: "<interview GUID>|<element
      // type>|<element API name>", e.g. "...-55fc|FlowAssignment|
      // Set_Demo_Variables". The GUID is dropped (not useful for display).
      const parts = content.split('|');
      const details = { raw: content };

      if (parts.length >= 3) {
        details.interviewGuid = parts[0].trim();
        details.elementType = parts[1].trim();
        details.elementName = parts.slice(2).join('|').trim();
      } else if (parts.length === 2) {
        details.elementType = parts[0].trim();
        details.elementName = parts[1].trim();
      } else {
        details.elementType = content.trim();
      }

      return details;
    }

    _parseFlowElementFault(content) {
      // Confirmed against a real log: "<fault message>|<element
      // type>|<element API name>" -- message FIRST, unlike the generic
      // elementType|elementName|message shape _parseFlowError uses for the
      // other STRUCTURED_ERROR_TYPES. E.g. "Fault path taken.|
      // FlowActionCall|Call_With_Fault_Path".
      const parts = content.split('|');
      const details = { raw: content };

      if (parts.length >= 3) {
        details.message = parts[0].trim();
        details.elementType = parts[1].trim();
        details.elementName = parts.slice(2).join('|').trim();
      } else {
        details.message = content.trim();
      }

      return details;
    }

    _parseFlowValueAssignment(content) {
      // Confirmed: "<interview GUID>|<variable name>|<value>". Value can be
      // an empty string (e.g. a loop's currentIteration var after the last
      // pass: "...|Loop_Demo_Items__currentIteration|").
      const parts = content.split('|');
      const details = { raw: content };

      if (parts.length >= 3) {
        details.interviewGuid = parts[0].trim();
        details.variable = parts[1].trim();
        details.value = parts.slice(2).join('|').trim();
      } else if (parts.length === 2) {
        details.variable = parts[0].trim();
        details.value = parts[1].trim();
      } else {
        details.value = content.trim();
      }

      return details;
    }

    _parseFlowAssignmentDetail(content) {
      // Confirmed: "<interview GUID>|<variable name>|<operator>|<value>",
      // e.g. "...-55fc|LoopCounter|ASSIGN|0" or "...|DemoItems|ADD|a".
      const parts = content.split('|');
      const details = { raw: content };

      if (parts.length >= 4) {
        details.interviewGuid = parts[0].trim();
        details.variable = parts[1].trim();
        details.operator = parts[2].trim();
        details.value = parts.slice(3).join('|').trim();
      } else {
        details.message = content.trim();
      }

      return details;
    }

    _parseFlowLoopDetail(content) {
      // Confirmed: "<interview GUID>|<0-based iteration index>|<current
      // item value>", e.g. "...-55fc|0|a".
      const parts = content.split('|');
      const details = { raw: content };

      if (parts.length >= 3) {
        details.interviewGuid = parts[0].trim();
        details.iteration = parts[1].trim();
        details.value = parts.slice(2).join('|').trim();
      } else {
        details.message = content.trim();
      }

      return details;
    }

    _parseFlowRuleDetail(content) {
      // Confirmed: "<interview GUID>|<rule name>|<result>[|<result>...]",
      // e.g. "...-55fc|Flow_Native_Dml_Rule|false|false" -- exact meaning
      // of the (so far always duplicated) trailing result values isn't
      // confirmed, kept as-is in `results`.
      const parts = content.split('|');
      const details = { raw: content };

      if (parts.length >= 2) {
        details.interviewGuid = parts[0].trim();
        details.ruleName = parts[1].trim();
        details.results = parts.slice(2).map(p => p.trim());
      } else {
        details.message = content.trim();
      }

      return details;
    }

    _parseFlowSubflowDetail(content) {
      // Confirmed: "<interview GUID>|<subflow label>|<flow definition
      // Id>|<flow version Id>", e.g. "...-55fc|FoxLog Error Demo
      // Subflow|300DJ000000avtG|301DJ000000xUK2".
      const parts = content.split('|');
      const details = { raw: content };

      if (parts.length >= 2) {
        details.interviewGuid = parts[0].trim();
        details.subflowLabel = parts[1].trim();
        details.flowDefinitionId = parts[2] ? parts[2].trim() : undefined;
        details.flowVersionId = parts[3] ? parts[3].trim() : undefined;
      } else {
        details.message = content.trim();
      }

      return details;
    }

    _parseFlowBulkElementDetail(content) {
      // Confirmed: "<element type>|<element API name>|<count>" -- no
      // interview GUID prefix, unlike the other FLOW_*_DETAIL events. This
      // is what actually fires when a DML element sits inside a loop (the
      // Flow engine auto-bulkifies it): one line per iteration, not one
      // combined DML for the whole loop, which is worth surfacing as the
      // Flow equivalent of the SOQL/DML-in-loop antipattern.
      const parts = content.split('|');
      const details = { raw: content };

      if (parts.length >= 3) {
        details.elementType = parts[0].trim();
        details.elementName = parts[1].trim();
        details.count = parseInt(parts[2], 10);
      } else {
        details.message = content.trim();
      }

      return details;
    }

    _parseFlowActionCallDetail(content) {
      // Confirmed: "<interview GUID>|<action element name>|<action
      // type>|<action/class name>|<success true/false>|<message>". This is
      // the clearest "a Flow called into Apex/an action that failed" line
      // in the whole log -- it carries the human-readable error message
      // directly, e.g. "...-55fc|Call_With_Fault_Path|Apex|
      // FoxLogErrorDemoController|false|An Apex error occurred: ...".
      // elementName/elementType are aliased from actionName/actionType so
      // this reads the same as STRUCTURED_ERROR_TYPES for naming purposes
      // (see call-tree-worker.js's _markError).
      const parts = content.split('|');
      const details = { raw: content };

      if (parts.length >= 6) {
        details.interviewGuid = parts[0].trim();
        details.actionName = parts[1].trim();
        details.actionType = parts[2].trim();
        details.implementationName = parts[3].trim();
        details.success = parts[4].trim() === 'true';
        details.message = parts.slice(5).join('|').trim();
        details.elementName = details.actionName;
        details.elementType = details.actionType;
      } else {
        details.message = content.trim();
      }

      return details;
    }

    _parseValidationRule(content) {
      // Confirmed: "<rule Id>|<rule name>", e.g.
      // "03dDJ000000umFt|FoxLog_Demo_Validation_Fail".
      const parts = content.split('|');
      const details = { raw: content };

      if (parts.length >= 2) {
        details.ruleId = parts[0].trim();
        details.ruleName = parts[1].trim();
      } else {
        details.ruleName = content.trim();
      }

      return details;
    }

    _parseValidationFormula(content) {
      // Confirmed: "<formula>|<field=value that it evaluated against>",
      // e.g. 'CONTAINS( Description , "X")|Description=some text'.
      const parts = content.split('|');
      const details = { raw: content };

      if (parts.length >= 2) {
        details.formula = parts[0].trim();
        details.fieldValues = parts.slice(1).join('|').trim();
      } else {
        details.formula = content.trim();
      }

      return details;
    }

    _parseFlowError(content) {
      // Best-effort: the documented shape for these event types is roughly
      // "<element/action type>|<element/action API name>|<error message>",
      // but the exact field layout hasn't been verified per-type against a
      // real log yet -- see tests/flow-error-repro/. Degrades gracefully if
      // the real shape differs: `raw` always keeps the untouched content so
      // the UI has something to show either way.
      const parts = content.split('|');
      const details = { raw: content };

      if (parts.length >= 3) {
        details.elementType = parts[0].trim();
        details.elementName = parts[1].trim();
        details.message = parts.slice(2).join('|').trim();
      } else if (parts.length === 2) {
        details.elementName = parts[0].trim();
        details.message = parts[1].trim();
      } else {
        details.message = content.trim();
      }

      return details;
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
          maxHeapSize: 6000000,
          // Tracked for future UI use (not yet surfaced in the Summary tab's
          // limit meters -- same shape as the SOQL/DML ones above so it can
          // be wired in later without another data-model change).
          soslQueries: 0,
          maxSoslQueries: 20,
          callouts: 0,
          maxCallouts: 100
        },
        methods: [],
        methodMap: new Map(), // key: 'class.method' → index in methods[]
        errors: [],
        queries: [],
        soslQueries: [],
        callouts: [],
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
        'SOSL_EXECUTE_BEGIN': () => {
          stats.limits.soslQueries++;
          stats.soslQueries.push({
            query: line.details.query,
            timestamp: line.timestamp,
            index: line.index
          });
        },
        'SOSL_EXECUTE_END': () => {
          if (stats.soslQueries.length > 0) {
            stats.soslQueries[stats.soslQueries.length - 1].rows = line.details.rows;
          }
        },
        'CALLOUT_REQUEST': () => {
          stats.limits.callouts++;
          stats.callouts.push({
            endpoint: line.details.endpoint,
            timestamp: line.timestamp,
            index: line.index
          });
        },
        'CALLOUT_RESPONSE': () => {
          if (stats.callouts.length > 0) {
            stats.callouts[stats.callouts.length - 1].status = line.details.status;
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
          const key = `${line.details.class || ''}.${line.details.method || ''}`;
          const existingIndex = stats.methodMap.get(key);
          
          if (existingIndex !== undefined) {
            stats.methods[existingIndex].calls++;
          } else {
            const newEntry = {
              class: line.details.class,
              method: line.details.method,
              calls: 1,
              firstCall: line.timestamp
            };
            stats.methodMap.set(key, stats.methods.length);
            stats.methods.push(newEntry);
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
      STRUCTURED_ERROR_TYPES.forEach(errorType => {
        collectors[errorType] = collectors['EXCEPTION_THROWN'];
      });

      const collector = collectors[line.type];
      if (collector) collector();
    }

    _parseCumulativeLimits(lines, stats) {
      const limitPatterns = {
        soql: /Number of SOQL queries:\s*(\d+)\s+out of\s+(\d+)/,
        sosl: /Number of SOSL queries:\s*(\d+)\s+out of\s+(\d+)/,
        dml: /Number of DML statements:\s*(\d+)\s+out of\s+(\d+)/,
        cpu: /Maximum CPU time:\s*(\d+)\s+out of\s+(\d+)/,
        heap: /Maximum heap size:\s*(\d+)\s+out of\s+(\d+)/,
        callouts: /Number of callouts:\s*(\d+)\s+out of\s+(\d+)/
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
            } else if (key === 'sosl') {
              stats.limits.soslQueries = parseInt(used, 10);
              stats.limits.maxSoslQueries = parseInt(max, 10);
            } else if (key === 'dml') {
              stats.limits.dmlStatements = parseInt(used, 10);
              stats.limits.maxDmlStatements = parseInt(max, 10);
            } else if (key === 'cpu') {
              stats.limits.cpuTime = parseInt(used, 10);
              stats.limits.maxCpuTime = parseInt(max, 10);
            } else if (key === 'heap') {
              stats.limits.heapSize = parseInt(used, 10);
              stats.limits.maxHeapSize = parseInt(max, 10);
            } else if (key === 'callouts') {
              stats.limits.callouts = parseInt(used, 10);
              stats.limits.maxCallouts = parseInt(max, 10);
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
  logger.log('[FoxLog] Log Parser loaded');
})();