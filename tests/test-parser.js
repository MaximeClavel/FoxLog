// ============================================
// TESTS DU PARSER - À exécuter dans la console
// ============================================

console.clear();
console.log('%c🧪 TESTS DU PARSER FOXLOG', 'background: #0176d3; color: white; font-size: 16px; padding: 10px; font-weight: bold');

// Exemple de log Salesforce simplifié pour les tests
const sampleLog = `
12:34:56.001 (1234567)|EXECUTION_STARTED
12:34:56.002 (2345678)|CODE_UNIT_STARTED|[EXTERNAL]|01p8E000000YR6Q|MyClass.myMethod
12:34:56.003 (3456789)|METHOD_ENTRY|[1]|01p8E000000YR6Q|MyClass.myMethod()
12:34:56.004 (4567890)|VARIABLE_SCOPE_BEGIN|[1]|this|MyClass
12:34:56.005 (5678901)|USER_DEBUG|[5]|DEBUG|Starting process
12:34:56.010 (10123456)|SOQL_EXECUTE_BEGIN|[7]|Aggregations:0|SELECT Id, Name FROM Account WHERE Industry = 'Technology' LIMIT 10
12:34:56.045 (45678901)|SOQL_EXECUTE_END|[7]|Rows:8
12:34:56.046 (46789012)|METHOD_ENTRY|[2]|01p8E000000YR6Q|MyClass.helperMethod()
12:34:56.047 (47890123)|USER_DEBUG|[10]|INFO|Processing 8 records
12:34:56.050 (50123456)|DML_BEGIN|[12]|Op:Insert|Type:Contact|Rows:5
12:34:56.075 (75456789)|DML_END|[12]
12:34:56.076 (76567890)|METHOD_EXIT|[2]|01p8E000000YR6Q|MyClass.helperMethod()
12:34:56.080 (80123456)|EXCEPTION_THROWN|[15]|System.NullPointerException|Attempt to de-reference a null object
12:34:56.085 (85234567)|METHOD_EXIT|[1]|01p8E000000YR6Q|MyClass.myMethod()
12:34:56.086 (86345678)|CODE_UNIT_FINISHED|MyClass.myMethod
12:34:56.087 (87456789)|EXECUTION_FINISHED
12:34:56.088 (88567890)|CUMULATIVE_LIMIT_USAGE
12:34:56.088 (88567890)|LIMIT_USAGE_FOR_NS|(default)|
  Number of SOQL queries: 1 out of 100
  Number of DML statements: 1 out of 150
  Maximum CPU time: 85 out of 10000
  Maximum heap size: 512000 out of 6000000
`;

const sampleMetadata = {
  Id: '07L8E000000TEST',
  LogUserId: '0058E000000USER',
  StartTime: '2025-01-20T12:34:56.000Z',
  DurationMilliseconds: 88,
  Operation: 'Execution of MyClass.myMethod',
  Status: 'Success',
  Application: 'Lightning',
  LogLength: 2345
};

// Test 1: Créer une instance du parser
console.log('\n%c📦 Test 1: Création du parser', 'background: #333; color: white; padding: 5px; font-weight: bold');
try {
  const parser = new window.SalesforceLogParser();
  console.log('✅ Parser créé avec succès');
  console.log('   Patterns disponibles:', Object.keys(parser.patterns).length);
} catch (error) {
  console.error('❌ Erreur création parser:', error);
}

// Test 2: Parser le log exemple
console.log('\n%c🔍 Test 2: Parsing du log', 'background: #333; color: white; padding: 5px; font-weight: bold');
try {
  const parser = new window.SalesforceLogParser();
  const parsedLog = parser.parse(sampleLog, sampleMetadata);
  
  console.log('✅ Log parsé avec succès');
  console.log('   Lignes totales:', parsedLog.lines.length);
  console.log('   SOQL queries:', parsedLog.stats.limits.soqlQueries);
  console.log('   DML statements:', parsedLog.stats.limits.dmlStatements);
  console.log('   Méthodes:', parsedLog.stats.methods.length);
  console.log('   Erreurs:', parsedLog.stats.errors.length);
  
  console.log('\n📋 Détail des lignes parsées:');
  parsedLog.lines.forEach((line, i) => {
    if (i < 5) { // Afficher seulement les 5 premières
      console.log(`   ${i + 1}. [${line.type}] ${line.content.substring(0, 50)}...`);
    }
  });
  
  console.log('\n🎯 Structure de parsedLog:', parsedLog);
  
} catch (error) {
  console.error('❌ Erreur parsing:', error);
}

// Test 3: Vérifier les métadonnées
console.log('\n%c📝 Test 3: Métadonnées', 'background: #333; color: white; padding: 5px; font-weight: bold');
try {
  const parser = new window.SalesforceLogParser();
  const parsedLog = parser.parse(sampleLog, sampleMetadata);
  
  console.log('✅ Métadonnées extraites:');
  console.log('   ID:', parsedLog.metadata.id);
  console.log('   Operation:', parsedLog.metadata.operation);
  console.log('   Status:', parsedLog.metadata.status);
  console.log('   Duration:', parsedLog.metadata.duration + 'ms');
  console.log('   Application:', parsedLog.metadata.application);
  
} catch (error) {
  console.error('❌ Erreur métadonnées:', error);
}

// Test 4: Statistiques
console.log('\n%c📊 Test 4: Statistiques', 'background: #333; color: white; padding: 5px; font-weight: bold');
try {
  const parser = new window.SalesforceLogParser();
  const parsedLog = parser.parse(sampleLog, sampleMetadata);
  
  console.log('✅ Statistiques:');
  console.log('   SOQL:', `${parsedLog.stats.limits.soqlQueries}/${parsedLog.stats.limits.maxSoqlQueries}`);
  console.log('   DML:', `${parsedLog.stats.limits.dmlStatements}/${parsedLog.stats.limits.maxDmlStatements}`);
  console.log('   CPU:', `${parsedLog.stats.limits.cpuTime}ms/${parsedLog.stats.limits.maxCpuTime}ms`);
  console.log('   Heap:', `${Math.round(parsedLog.stats.limits.heapSize/1024)}KB/${Math.round(parsedLog.stats.limits.maxHeapSize/1024)}KB`);
  
  console.log('\n🔧 Méthodes appelées:');
  parsedLog.stats.methods.forEach(m => {
    console.log(`   - ${m.class}.${m.method} (${m.calls} appel${m.calls > 1 ? 's' : ''})`);
  });
  
  console.log('\n🗄️ Requêtes SOQL:');
  parsedLog.stats.queries.forEach(q => {
    console.log(`   - ${q.query} → ${q.rows || '?'} lignes`);
  });
  
  console.log('\n💾 Opérations DML:');
  parsedLog.stats.dmlOperations.forEach(op => {
    console.log(`   - ${op.operation} sur ${op.objectType || 'objet inconnu'}`);
  });
  
  if (parsedLog.stats.errors.length > 0) {
    console.log('\n❌ Erreurs détectées:');
    parsedLog.stats.errors.forEach(err => {
      console.log(`   - [${err.type}] ${err.message}`);
    });
  }
  
} catch (error) {
  console.error('❌ Erreur statistiques:', error);
}

// Test 5: Résumé
console.log('\n%c📄 Test 5: Résumé', 'background: #333; color: white; padding: 5px; font-weight: bold');
try {
  const parser = new window.SalesforceLogParser();
  const parsedLog = parser.parse(sampleLog, sampleMetadata);
  const summary = parser.getSummary(parsedLog);
  
  console.log('✅ Résumé généré:');
  console.table(summary);
  
} catch (error) {
  console.error('❌ Erreur résumé:', error);
}

// Test 6: Filtrage par type
console.log('\n%c🔍 Test 6: Filtrage par type', 'background: #333; color: white; padding: 5px; font-weight: bold');
try {
  const parser = new window.SalesforceLogParser();
  const parsedLog = parser.parse(sampleLog, sampleMetadata);
  
  const methodLines = parser.filterByType(parsedLog, ['METHOD_ENTRY', 'METHOD_EXIT']);
  console.log(`✅ ${methodLines.length} lignes de méthodes trouvées:`);
  methodLines.forEach(line => {
    console.log(`   [${line.type}] ${line.details.class}.${line.details.method}`);
  });
  
  const soqlLines = parser.filterByType(parsedLog, ['SOQL_EXECUTE_BEGIN', 'SOQL_EXECUTE_END']);
  console.log(`\n✅ ${soqlLines.length} lignes SOQL trouvées:`);
  soqlLines.forEach(line => {
    if (line.type === 'SOQL_EXECUTE_BEGIN') {
      console.log(`   Query: ${line.details.query}`);
    } else {
      console.log(`   Résultat: ${line.details.rows} lignes`);
    }
  });
  
} catch (error) {
  console.error('❌ Erreur filtrage:', error);
}

// Test 7: Arbre d'exécution
console.log('\n%c🌳 Test 7: Arbre d\'exécution', 'background: #333; color: white; padding: 5px; font-weight: bold');
try {
  const parser = new window.SalesforceLogParser();
  const parsedLog = parser.parse(sampleLog, sampleMetadata);
  const tree = parser.buildExecutionTree(parsedLog);
  
  console.log('✅ Arbre d\'exécution construit:');
  console.log(tree);
  
  // Affichage récursif simplifié
  function displayTree(nodes, indent = 0) {
    nodes.forEach(node => {
      const prefix = '  '.repeat(indent);
      console.log(`${prefix}├─ ${node.name} (${node.duration || '?'}ms)`);
      if (node.children && node.children.length > 0) {
        displayTree(node.children, indent + 1);
      }
    });
  }
  
  console.log('\n📊 Visualisation:');
  displayTree(tree);
  
} catch (error) {
  console.error('❌ Erreur arbre:', error);
}

// Test 8: Performance
console.log('\n%c⚡ Test 8: Performance', 'background: #333; color: white; padding: 5px; font-weight: bold');
try {
  const parser = new window.SalesforceLogParser();
  
  // Générer un log plus long pour tester
  const bigLog = sampleLog.repeat(50); // 50x le log
  
  console.time('Parsing time');
  const parsedLog = parser.parse(bigLog, sampleMetadata);
  console.timeEnd('Parsing time');
  
  console.log(`✅ ${parsedLog.lines.length} lignes parsées`);
  console.log(`   Taille du log: ${Math.round(bigLog.length / 1024)}KB`);
  
} catch (error) {
  console.error('❌ Erreur performance:', error);
}

// Test 9: Gestion des erreurs
console.log('\n%c🛡️ Test 9: Gestion des erreurs', 'background: #333; color: white; padding: 5px; font-weight: bold');
try {
  const parser = new window.SalesforceLogParser();
  
  // Test avec un log vide
  console.log('Test 9a: Log vide');
  const emptyParsed = parser.parse('', sampleMetadata);
  console.log(`   ✅ ${emptyParsed.lines.length} lignes (attendu: 0)`);
  
  // Test avec des lignes malformées
  console.log('Test 9b: Lignes malformées');
  const badLog = 'Cette ligne est invalide\n12:34:56.001|INVALID|Test';
  const badParsed = parser.parse(badLog, sampleMetadata);
  console.log(`   ✅ ${badParsed.lines.length} lignes parsées malgré les erreurs`);
  
  // Test sans métadonnées
  console.log('Test 9c: Sans métadonnées');
  const noMetaParsed = parser.parse(sampleLog);
  console.log(`   ✅ Parsing réussi sans métadonnées`);
  console.log(`   Metadata.id:`, noMetaParsed.metadata.id);
  
} catch (error) {
  console.error('❌ Erreur gestion erreurs:', error);
}

// Test 10: Types de lignes reconnus
console.log('\n%c🎨 Test 10: Types de lignes', 'background: #333; color: white; padding: 5px; font-weight: bold');
try {
  const parser = new window.SalesforceLogParser();
  const parsedLog = parser.parse(sampleLog, sampleMetadata);
  
  // Compter les types
  const typeCounts = {};
  parsedLog.lines.forEach(line => {
    typeCounts[line.type] = (typeCounts[line.type] || 0) + 1;
  });
  
  console.log('✅ Types de lignes trouvés:');
  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
  
} catch (error) {
  console.error('❌ Erreur types:', error);
}

// Résumé final
console.log('\n%c✨ RÉSUMÉ DES TESTS', 'background: #10b981; color: white; font-size: 14px; padding: 8px; font-weight: bold');
console.log('✅ Tous les tests sont terminés !');
console.log('📝 Vérifiez les résultats ci-dessus pour détecter d\'éventuelles erreurs.');
console.log('\n💡 Pour tester avec un vrai log Salesforce:');
console.log('   1. Récupérez un log via window.viewLogDetails(logId)');
console.log('   2. Copiez le contenu');
console.log('   3. Exécutez: const parsed = new SalesforceLogParser().parse(votreLong, metadata);');
console.log('   4. Explorez: parsed.stats, parsed.lines, etc.');

// Fonction helper pour tester avec un vrai log
window.testRealLog = function(logId) {
  console.log('%c🔬 Test avec un vrai log', 'background: #6366f1; color: white; padding: 5px; font-weight: bold');
  
  // Cette fonction sera appelée manuellement par l'utilisateur
  console.log('Chargement du log', logId, '...');
  
  // Le reste sera géré par viewLogDetails qui parse automatiquement
  window.viewLogDetails(logId);
};

console.log('\n💻 Commande rapide:');
console.log('   window.testRealLog("07L...")  // Remplacez par un vrai ID de log');
console.log('\n');

// Export pour debugging
window.FoxLogParserTests = {
  sampleLog,
  sampleMetadata,
  runAllTests: function() {
    console.log('Relancement de tous les tests...');
    // Re-exécuter ce script
  }
};