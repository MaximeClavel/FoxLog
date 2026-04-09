// FoxLog Anti-Pattern Test - Execute in Developer Console
// Creates test data, triggers anti-patterns, then cleans up

List<Account> accs = new List<Account>();
List<Contact> cons = new List<Contact>();

// Setup: Create test data
for (Integer i = 0; i < 5; i++) {
    accs.add(new Account(Name = 'FoxLog Test ' + i, Industry = 'Technology'));
}
insert accs;

for (Account a : accs) {
    cons.add(new Contact(FirstName = 'Test', LastName = 'C1', AccountId = a.Id));
    cons.add(new Contact(FirstName = 'Test', LastName = 'C2', AccountId = a.Id));
}
insert cons;

// ============================================
// 🔴 CRITICAL ANTI-PATTERNS
// ============================================

// Debug Statements (>20)
for (Integer i = 1; i <= 25; i++) {
    System.debug('Debug ' + i);
}

// SOQL in Loop
for (Account a : accs) {
    List<Contact> c = [SELECT Id FROM Contact WHERE AccountId = :a.Id];
}

// N+1 Query
for (Contact c : cons) {
    Account p = [SELECT Id, Name FROM Account WHERE Id = :c.AccountId LIMIT 1];
}

// DML in Loop
for (Account a : accs) {
    a.Description = 'Updated ' + System.now();
    update a;
}

// Callout After DML (will throw error - that's expected)
// Uncomment to test: requires a valid endpoint
// insert new Account(Name = 'Before Callout');
// Http h = new Http();
// HttpRequest req = new HttpRequest();
// req.setEndpoint('https://example.com');
// req.setMethod('GET');
// HttpResponse res = h.send(req); // Would cause uncommitted work pending

// ============================================
// 🟡 WARNING ANTI-PATTERNS
// ============================================

// SOQL no WHERE
List<Account> noWhere = [SELECT Id FROM Account LIMIT 50];

// SOQL no LIMIT
List<Account> noLimit = [SELECT Id FROM Account WHERE Industry = 'Technology'];

// Too Many Fields
List<Account> manyFields = [
    SELECT Id, Name, Industry, Type, Description, Website, Phone, Fax,
           BillingStreet, BillingCity, BillingState, BillingPostalCode,
           ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode,
           NumberOfEmployees, AnnualRevenue, OwnerId, CreatedDate
    FROM Account WHERE Id IN :accs
];

// Hardcoded ID
try {
    Account h = [SELECT Id FROM Account WHERE Id = '001000000000001AAA' LIMIT 1];
} catch (Exception e) { }

// Large Query
List<Account> large = [SELECT Id FROM Account LIMIT 500];

// Schema Describe in Loop
for (Integer i = 0; i < 5; i++) {
    Schema.DescribeSObjectResult descResult = Account.SObjectType.getDescribe();
    System.debug('Fields: ' + descResult.fields.getMap().size());
}

// Swallowed Exception (catch block with no debug/logging)
try {
    Integer result = 1 / 0;
} catch (Exception e) {
    // ❌ Intentionally empty - swallowed exception
}

// Empty Query Results (queries returning 0 rows)
for (Integer i = 0; i < 4; i++) {
    List<Account> empty = [SELECT Id FROM Account WHERE Name = 'FOXLOG_NONEXISTENT_' + i LIMIT 1];
}

// ============================================
// 🔵 INFO ANTI-PATTERNS
// ============================================

// Validation Failure
try {
    insert new Account();
} catch (Exception e) { }

// ============================================
// 📊 GOVERNOR LIMIT TRACKING
// ============================================

System.debug('=== Governor Limits Summary ===');
System.debug('Queries: ' + Limits.getQueries() + '/' + Limits.getLimitQueries());
System.debug('Query Rows: ' + Limits.getQueryRows() + '/' + Limits.getLimitQueryRows());
System.debug('DML: ' + Limits.getDmlStatements() + '/' + Limits.getLimitDmlStatements());
System.debug('DML Rows: ' + Limits.getDmlRows() + '/' + Limits.getLimitDmlRows());
System.debug('CPU: ' + Limits.getCpuTime() + 'ms/' + Limits.getLimitCpuTime() + 'ms');
System.debug('Heap: ' + Limits.getHeapSize() + '/' + Limits.getLimitHeapSize());

// Cleanup
delete cons;
delete accs;

System.debug('FoxLog Test DONE - Open this log in FoxLog!');
