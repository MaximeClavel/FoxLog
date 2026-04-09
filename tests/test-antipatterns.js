// ============================================
// TESTS ANTI-PATTERN DETECTOR
// À exécuter dans la console du navigateur
// sur une page Salesforce avec FoxLog actif
// ============================================

console.clear();
console.log('%c🩺 TESTS ANTI-PATTERN DETECTOR', 'background: #dc2626; color: white; font-size: 16px; padding: 10px; font-weight: bold');

const detector = window.FoxLog.antiPatternDetector;
if (!detector) {
  console.error('❌ AntiPatternDetector non chargé !');
  throw new Error('FoxLog not loaded');
}

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ ${testName}`);
    failed++;
  }
}

function makeStats() {
  return {
    limits: {
      soqlQueries: 5, dmlStatements: 3,
      cpuTime: 500, heapSize: 100000,
      maxSoqlQueries: 100, maxDmlStatements: 150,
      maxCpuTime: 10000, maxHeapSize: 6000000
    },
    methods: [], methodMap: new Map(),
    errors: [], queries: [], dmlOperations: [], methodStack: []
  };
}

function makeLine(index, type, content, details) {
  return { index, type, content: content || '', details: details || {}, depth: 0, raw: content || '' };
}

// ---- Test 1: SOQL in Loop ----
console.log('\n%c🔴 Test 1: SOQL in Loop', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [];
  for (let i = 0; i < 5; i++) {
    lines.push(makeLine(i, 'SOQL_EXECUTE_BEGIN', `[25]|SELECT Id FROM Contact WHERE AccountId = '00${i}'`, { query: `SELECT Id FROM Contact WHERE AccountId = '00${i}'` }));
  }
  const result = detector.analyze({ lines, stats: makeStats() });
  const soqlLoop = result.patterns.find(p => p.type === 'soql_in_loop');
  assert(!!soqlLoop, 'Détecte SOQL in Loop');
  assert(soqlLoop && soqlLoop.severity === 'critical', 'Sévérité critique');
} catch (e) { console.error('❌ Erreur Test 1:', e); failed++; }

// ---- Test 2: DML in Loop ----
console.log('\n%c🔴 Test 2: DML in Loop', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [];
  for (let i = 0; i < 5; i++) {
    lines.push(makeLine(i, 'DML_BEGIN', `[30]|Op:Update|Type:Account|Rows:1`, { operation: 'Update', objectType: 'Account', rows: 1 }));
  }
  const result = detector.analyze({ lines, stats: makeStats() });
  const dmlLoop = result.patterns.find(p => p.type === 'dml_in_loop');
  assert(!!dmlLoop, 'Détecte DML in Loop');
  assert(dmlLoop && dmlLoop.occurrences === 5, 'Compte 5 occurrences');
} catch (e) { console.error('❌ Erreur Test 2:', e); failed++; }

// ---- Test 3: N+1 Query ----
console.log('\n%c🔴 Test 3: N+1 Query', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [];
  for (let i = 0; i < 6; i++) {
    const q = `SELECT Id FROM Contact WHERE AccountId = '001ABC00000${i}'`;
    lines.push(makeLine(i, 'SOQL_EXECUTE_BEGIN', `[10]|${q}`, { query: q }));
  }
  const result = detector.analyze({ lines, stats: makeStats() });
  const nPlus = result.patterns.find(p => p.type === 'n_plus_one');
  assert(!!nPlus, 'Détecte N+1 Query');
  assert(nPlus && nPlus.severity === 'critical', 'Sévérité critique');
} catch (e) { console.error('❌ Erreur Test 3:', e); failed++; }

// ---- Test 4: SOQL no LIMIT ----
console.log('\n%c🟡 Test 4: SOQL no LIMIT', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [
    makeLine(0, 'SOQL_EXECUTE_BEGIN', '[7]|SELECT Id FROM Account WHERE Name = \'Test\'', { query: 'SELECT Id FROM Account WHERE Name = \'Test\'' })
  ];
  const result = detector.analyze({ lines, stats: makeStats() });
  const noLimit = result.patterns.find(p => p.type === 'soql_no_limit');
  assert(!!noLimit, 'Détecte SOQL sans LIMIT');
  assert(noLimit && noLimit.severity === 'warning', 'Sévérité warning');
} catch (e) { console.error('❌ Erreur Test 4:', e); failed++; }

// ---- Test 5: SOQL no WHERE ----
console.log('\n%c🟡 Test 5: SOQL no WHERE', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [
    makeLine(0, 'SOQL_EXECUTE_BEGIN', '[7]|SELECT Id FROM Account LIMIT 100', { query: 'SELECT Id FROM Account LIMIT 100' })
  ];
  const result = detector.analyze({ lines, stats: makeStats() });
  const noWhere = result.patterns.find(p => p.type === 'soql_no_where');
  assert(!!noWhere, 'Détecte SOQL sans WHERE');
} catch (e) { console.error('❌ Erreur Test 5:', e); failed++; }

// ---- Test 6: Hardcoded ID ----
console.log('\n%c🟡 Test 6: Hardcoded ID', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const q = "SELECT Id FROM Account WHERE Id = '001000000000001AAA'";
  const lines = [makeLine(0, 'SOQL_EXECUTE_BEGIN', `[5]|${q}`, { query: q })];
  const result = detector.analyze({ lines, stats: makeStats() });
  const hardcoded = result.patterns.find(p => p.type === 'hardcoded_id');
  assert(!!hardcoded, 'Détecte Hardcoded ID');
} catch (e) { console.error('❌ Erreur Test 6:', e); failed++; }

// ---- Test 7: Debug Statements ----
console.log('\n%c🔵 Test 7: Debug Statements', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [];
  for (let i = 0; i < 25; i++) {
    lines.push(makeLine(i, 'USER_DEBUG', `[${i}]|DEBUG|message ${i}`, {}));
  }
  const result = detector.analyze({ lines, stats: makeStats() });
  const debug = result.patterns.find(p => p.type === 'debug_statements');
  assert(!!debug, 'Détecte debug excessifs');
  assert(debug && debug.occurrences === 25, '25 occurrences');
} catch (e) { console.error('❌ Erreur Test 7:', e); failed++; }

// ---- Test 8: Excessive SOQL Usage ----
console.log('\n%c🔴 Test 8: Excessive SOQL', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const stats = makeStats();
  stats.limits.soqlQueries = 92;
  const result = detector.analyze({ lines: [], stats });
  const excessive = result.patterns.find(p => p.type === 'excessive_soql');
  assert(!!excessive, 'Détecte SOQL excessif à 92%');
  assert(excessive && excessive.severity === 'critical', 'Critique à >90%');
} catch (e) { console.error('❌ Erreur Test 8:', e); failed++; }

// ---- Test 9: Excessive DML Usage ----
console.log('\n%c🟡 Test 9: Excessive DML', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const stats = makeStats();
  stats.limits.dmlStatements = 110;
  const result = detector.analyze({ lines: [], stats });
  const excessive = result.patterns.find(p => p.type === 'excessive_dml');
  assert(!!excessive, 'Détecte DML excessif à 73%');
  assert(excessive && excessive.severity === 'warning', 'Warning entre 70-90%');
} catch (e) { console.error('❌ Erreur Test 9:', e); failed++; }

// ---- Test 10: Mixed DML ----
console.log('\n%c🔴 Test 10: Mixed DML', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [
    makeLine(0, 'DML_BEGIN', '[10]|Op:Insert|Type:Account|Rows:1', { operation: 'Insert', objectType: 'Account', rows: 1 }),
    makeLine(1, 'DML_BEGIN', '[15]|Op:Insert|Type:User|Rows:1', { operation: 'Insert', objectType: 'User', rows: 1 })
  ];
  const result = detector.analyze({ lines, stats: makeStats() });
  const mixed = result.patterns.find(p => p.type === 'mixed_dml');
  assert(!!mixed, 'Détecte Mixed DML');
  assert(mixed && mixed.severity === 'critical', 'Sévérité critique');
} catch (e) { console.error('❌ Erreur Test 10:', e); failed++; }

// ---- Test 11: Callout After DML ----
console.log('\n%c🔴 Test 11: Callout After DML', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [
    makeLine(0, 'DML_BEGIN', '[10]|Op:Insert|Type:Account|Rows:1', {}),
    makeLine(1, 'CALLOUT_REQUEST', '[12]|System.HttpRequest', {})
  ];
  const result = detector.analyze({ lines, stats: makeStats() });
  const callout = result.patterns.find(p => p.type === 'callout_after_dml');
  assert(!!callout, 'Détecte Callout After DML');
  assert(callout && callout.severity === 'critical', 'Sévérité critique');
} catch (e) { console.error('❌ Erreur Test 11:', e); failed++; }

// ---- Test 12: Method Recursion ----
console.log('\n%c🟡 Test 12: Method Recursion', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [];
  for (let i = 0; i < 15; i++) {
    lines.push(makeLine(i, 'METHOD_ENTRY', `[1]|MyClass.process()`, { class: 'MyClass', method: 'process' }));
  }
  const result = detector.analyze({ lines, stats: makeStats() });
  const recursion = result.patterns.find(p => p.type === 'recursion');
  assert(!!recursion, 'Détecte récursion (15 appels)');
  assert(recursion && recursion.severity === 'warning', 'Warning <50 appels');
} catch (e) { console.error('❌ Erreur Test 12:', e); failed++; }

// ---- Test 13: Trigger Recursion ----
console.log('\n%c🔴 Test 13: Trigger Recursion', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [];
  for (let i = 0; i < 5; i++) {
    lines.push(makeLine(i, 'CODE_UNIT_STARTED', `[EXTERNAL]|trigger AccountTrigger on Account`, {}));
  }
  const result = detector.analyze({ lines, stats: makeStats() });
  const trig = result.patterns.find(p => p.type === 'trigger_recursion');
  assert(!!trig, 'Détecte trigger recursion');
  assert(trig && trig.occurrences === 5, '5 exécutions');
} catch (e) { console.error('❌ Erreur Test 13:', e); failed++; }

// ---- Test 14: Large Query Results ----
console.log('\n%c🟡 Test 14: Large Query Results', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [
    makeLine(0, 'SOQL_EXECUTE_END', 'SOQL_EXECUTE_END|Rows:600', { rows: 600 })
  ];
  const result = detector.analyze({ lines, stats: makeStats() });
  const large = result.patterns.find(p => p.type === 'large_query_result');
  assert(!!large, 'Détecte large query (600 rows)');
  assert(large && large.severity === 'warning', 'Warning car >500');
} catch (e) { console.error('❌ Erreur Test 14:', e); failed++; }

// ---- Test 15: Too Many Fields ----
console.log('\n%c🔵 Test 15: Too Many Fields', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const fields = Array.from({length: 20}, (_, i) => `Field${i}__c`).join(', ');
  const q = `SELECT ${fields} FROM Account WHERE Id = '001test'`;
  const lines = [makeLine(0, 'SOQL_EXECUTE_BEGIN', `[5]|${q}`, { query: q })];
  const result = detector.analyze({ lines, stats: makeStats() });
  const many = result.patterns.find(p => p.type === 'soql_select_all');
  assert(!!many, 'Détecte trop de champs (20)');
  assert(many && many.fieldCount === 20, '20 champs comptés');
} catch (e) { console.error('❌ Erreur Test 15:', e); failed++; }

// ============================================
// NOUVEAUX ANTI-PATTERNS
// ============================================

// ---- Test 16: Slow SOQL Query ----
console.log('\n%c🟡 Test 16: Slow SOQL Query', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [
    makeLine(0, 'SOQL_EXECUTE_BEGIN', '[7]|SELECT Id FROM Account', { query: 'SELECT Id FROM Account' }),
    makeLine(1, 'SOQL_EXECUTE_END', 'SOQL_EXECUTE_END|Rows:100', { rows: 100 })
  ];
  // Simulate 3s duration via nanosecond timestamps
  lines[0].duration = 1000000;
  lines[1].duration = 3001000000;
  const result = detector.analyze({ lines, stats: makeStats() });
  const slow = result.patterns.find(p => p.type === 'slow_query');
  assert(!!slow, 'Détecte slow query (3s)');
  assert(slow && slow.severity === 'warning', 'Warning car <5s');
} catch (e) { console.error('❌ Erreur Test 16:', e); failed++; }

// ---- Test 17: Excessive Rows Fetched ----
console.log('\n%c🔴 Test 17: Excessive Rows Fetched', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [
    makeLine(0, 'SOQL_EXECUTE_END', 'SOQL_EXECUTE_END|Rows:20000', { rows: 20000 }),
    makeLine(1, 'SOQL_EXECUTE_END', 'SOQL_EXECUTE_END|Rows:18000', { rows: 18000 })
  ];
  const result = detector.analyze({ lines, stats: makeStats() });
  const rows = result.patterns.find(p => p.type === 'excessive_rows_fetched');
  assert(!!rows, 'Détecte rows excessifs (38000/50000)');
  assert(rows && rows.severity === 'warning', 'Warning car 76%');
} catch (e) { console.error('❌ Erreur Test 17:', e); failed++; }

// ---- Test 18: DML Rows Limit ----
console.log('\n%c🔴 Test 18: DML Rows Limit', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [
    makeLine(0, 'DML_BEGIN', '[10]|Op:Insert|Type:Account|Rows:5000', { operation: 'Insert', objectType: 'Account', rows: 5000 }),
    makeLine(1, 'DML_BEGIN', '[15]|Op:Update|Type:Contact|Rows:3000', { operation: 'Update', objectType: 'Contact', rows: 3000 })
  ];
  const result = detector.analyze({ lines, stats: makeStats() });
  const dmlRows = result.patterns.find(p => p.type === 'dml_rows_limit');
  assert(!!dmlRows, 'Détecte DML rows excessifs (8000/10000)');
  assert(dmlRows && dmlRows.severity === 'warning', 'Warning car 80%');
} catch (e) { console.error('❌ Erreur Test 18:', e); failed++; }

// ---- Test 19: Empty Query Results ----
console.log('\n%c🔵 Test 19: Empty Query Results', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [];
  for (let i = 0; i < 4; i++) {
    lines.push(makeLine(i*2, 'SOQL_EXECUTE_BEGIN', `[7]|SELECT Id FROM Account WHERE Name = 'NonExist${i}'`, { query: `SELECT Id FROM Account WHERE Name = 'NonExist${i}'` }));
    lines.push(makeLine(i*2+1, 'SOQL_EXECUTE_END', 'SOQL_EXECUTE_END|Rows:0', { rows: 0 }));
  }
  const result = detector.analyze({ lines, stats: makeStats() });
  const empty = result.patterns.find(p => p.type === 'empty_query_result');
  assert(!!empty, 'Détecte requêtes vides (4x)');
  assert(empty && empty.occurrences === 4, '4 requêtes vides');
} catch (e) { console.error('❌ Erreur Test 19:', e); failed++; }

// ---- Test 20: Describe in Loop ----
console.log('\n%c🟡 Test 20: Describe in Loop', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [];
  for (let i = 0; i < 5; i++) {
    lines.push(makeLine(i, 'METHOD_ENTRY', `[${i}]|Schema.SObjectType.getDescribe`, { class: 'Schema', method: 'getDescribe' }));
  }
  const result = detector.analyze({ lines, stats: makeStats() });
  const desc = result.patterns.find(p => p.type === 'describe_in_loop');
  assert(!!desc, 'Détecte describe en boucle');
  assert(desc && desc.occurrences === 5, '5 describe calls');
} catch (e) { console.error('❌ Erreur Test 20:', e); failed++; }

// ---- Test 21: Exception Swallowed ----
console.log('\n%c🟡 Test 21: Exception Swallowed', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [
    makeLine(0, 'EXCEPTION_THROWN', 'System.NullPointerException: Attempt to de-reference a null object', {}),
    makeLine(1, 'METHOD_EXIT', '[1]|MyClass.method()', {}),
    makeLine(2, 'CODE_UNIT_FINISHED', 'MyClass', {})
  ];
  const result = detector.analyze({ lines, stats: makeStats() });
  const swallowed = result.patterns.find(p => p.type === 'exception_swallowed');
  assert(!!swallowed, 'Détecte exception avalée');
} catch (e) { console.error('❌ Erreur Test 21:', e); failed++; }

// ---- Test 22: Flow Recursion ----
console.log('\n%c🟡 Test 22: Flow Recursion', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [];
  for (let i = 0; i < 5; i++) {
    lines.push(makeLine(i, 'FLOW_START_INTERVIEW_BEGIN', `Flow: UpdateAccountFlow`, {}));
  }
  const result = detector.analyze({ lines, stats: makeStats() });
  const flow = result.patterns.find(p => p.type === 'flow_recursion');
  assert(!!flow, 'Détecte flow recursion');
  assert(flow && flow.occurrences === 5, '5 exécutions du flow');
} catch (e) { console.error('❌ Erreur Test 22:', e); failed++; }

// ---- Test 23: Nested Loop Pattern ----
console.log('\n%c🟡 Test 23: Nested Loop (O(n²))', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [];
  let idx = 0;
  // Simulate: OuterClass.process() called 3x, each calling InnerClass.query() which does SOQL
  for (let i = 0; i < 3; i++) {
    lines.push(makeLine(idx++, 'METHOD_ENTRY', `[1]|OuterClass.process()`, { class: 'OuterClass', method: 'process' }));
    for (let j = 0; j < 3; j++) {
      lines.push(makeLine(idx++, 'METHOD_ENTRY', `[2]|InnerClass.query()`, { class: 'InnerClass', method: 'query' }));
      lines.push(makeLine(idx++, 'SOQL_EXECUTE_BEGIN', `[5]|SELECT Id FROM Contact`, { query: 'SELECT Id FROM Contact' }));
      lines.push(makeLine(idx++, 'METHOD_EXIT', `[2]|InnerClass.query()`, { class: 'InnerClass', method: 'query' }));
    }
    lines.push(makeLine(idx++, 'METHOD_EXIT', `[1]|OuterClass.process()`, { class: 'OuterClass', method: 'process' }));
  }
  const result = detector.analyze({ lines, stats: makeStats() });
  const nested = result.patterns.find(p => p.type === 'nested_loop_pattern');
  assert(!!nested, 'Détecte nested loop O(n²)');
} catch (e) { console.error('❌ Erreur Test 23:', e); failed++; }

// ============================================
// TESTS NÉGATIFS (pas de faux positifs)
// ============================================

// ---- Test 24: Code propre → 0 patterns ----
console.log('\n%c🟢 Test 24: Code propre', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const q = 'SELECT Id FROM Account WHERE Industry = \'Tech\' LIMIT 10';
  const lines = [
    makeLine(0, 'SOQL_EXECUTE_BEGIN', `[7]|${q}`, { query: q }),
    makeLine(1, 'SOQL_EXECUTE_END', 'SOQL_EXECUTE_END|Rows:3', { rows: 3 }),
    makeLine(2, 'DML_BEGIN', '[10]|Op:Insert|Type:Contact|Rows:1', { operation: 'Insert', objectType: 'Contact', rows: 1 }),
    makeLine(3, 'USER_DEBUG', '[12]|DEBUG|Done', {})
  ];
  const result = detector.analyze({ lines, stats: makeStats() });
  assert(result.patterns.length === 0, 'Aucun anti-pattern sur code propre');
  assert(result.summary.score === 100, 'Score santé = 100');
} catch (e) { console.error('❌ Erreur Test 24:', e); failed++; }

// ---- Test 25: Score de santé ----
console.log('\n%c📊 Test 25: Score de santé', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const stats = makeStats();
  stats.limits.soqlQueries = 95; // Critical
  stats.limits.dmlStatements = 120; // Warning
  const result = detector.analyze({ lines: [], stats });
  assert(result.summary.score < 100, 'Score < 100 avec problèmes');
  assert(result.summary.critical >= 1, 'Au moins 1 critique');
  assert(result.hasCritical === true, 'hasCritical = true');
  console.log(`  📋 Score: ${result.summary.score}/100`);
} catch (e) { console.error('❌ Erreur Test 25:', e); failed++; }

// ---- Test 26: Résultat trié par sévérité ----
console.log('\n%c📊 Test 26: Tri par sévérité', 'background:#333;color:white;padding:4px;font-weight:bold');
try {
  const lines = [
    makeLine(0, 'DML_BEGIN', '[10]|Op:Insert|Type:Account|Rows:1', { operation: 'Insert', objectType: 'Account', rows: 1 }),
    makeLine(1, 'DML_BEGIN', '[15]|Op:Insert|Type:User|Rows:1', { operation: 'Insert', objectType: 'User', rows: 1 })
  ];
  for (let i = 0; i < 25; i++) {
    lines.push(makeLine(10+i, 'USER_DEBUG', `[${i}]|DEBUG|msg`, {}));
  }
  const result = detector.analyze({ lines, stats: makeStats() });
  if (result.patterns.length >= 2) {
    assert(result.patterns[0].severity === 'critical', 'Premier = critical');
    const lastP = result.patterns[result.patterns.length - 1];
    assert(lastP.severity !== 'critical' || result.patterns.every(p => p.severity === 'critical'), 'Trié critical → info');
  }
} catch (e) { console.error('❌ Erreur Test 26:', e); failed++; }

// ============================================
// RÉSUMÉ
// ============================================
console.log('\n%c✨ RÉSUMÉ DES TESTS', 'background:#10b981;color:white;font-size:14px;padding:8px;font-weight:bold');
console.log(`  ✅ Passés: ${passed}`);
console.log(`  ❌ Échoués: ${failed}`);
console.log(`  📊 Total: ${passed + failed}`);
if (failed === 0) {
  console.log('%c  🎉 Tous les tests passent !', 'color:green;font-weight:bold;font-size:14px');
} else {
  console.log(`%c  ⚠️ ${failed} test(s) échoué(s)`, 'color:red;font-weight:bold;font-size:14px');
}
