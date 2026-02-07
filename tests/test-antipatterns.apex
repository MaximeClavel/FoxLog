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

// Validation Failure
try {
    insert new Account();
} catch (Exception e) { }

// Governor Limits
System.debug('Queries: ' + Limits.getQueries() + '/' + Limits.getLimitQueries());
System.debug('DML: ' + Limits.getDmlStatements() + '/' + Limits.getLimitDmlStatements());
System.debug('CPU: ' + Limits.getCpuTime() + 'ms');

// Cleanup
delete cons;
delete accs;

System.debug('FoxLog Test DONE - Open this log in FoxLog!');
