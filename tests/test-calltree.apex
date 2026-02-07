// FoxLog Call Tree Test - Execute in Developer Console
// Generates a rich call tree with nested operations

List<Account> accs = new List<Account>();
List<Contact> cons = new List<Contact>();
List<Opportunity> opps = new List<Opportunity>();

// Level 1: Create Accounts (triggers CODE_UNIT for triggers if any)
System.debug('=== Level 1: Creating Accounts ===');
for (Integer i = 0; i < 3; i++) {
    accs.add(new Account(
        Name = 'CallTree Test ' + i,
        Industry = 'Technology',
        BillingCity = 'Paris'
    ));
}
Database.insert(accs, true);

// Level 2: Create Contacts linked to Accounts
System.debug('=== Level 2: Creating Contacts ===');
for (Account a : accs) {
    cons.add(new Contact(FirstName = 'John', LastName = 'Doe', AccountId = a.Id));
    cons.add(new Contact(FirstName = 'Jane', LastName = 'Smith', AccountId = a.Id));
}
Database.insert(cons, true);

// Level 3: Create Opportunities
System.debug('=== Level 3: Creating Opportunities ===');
for (Account a : accs) {
    opps.add(new Opportunity(
        Name = 'Opp for ' + a.Name,
        AccountId = a.Id,
        StageName = 'Prospecting',
        CloseDate = Date.today().addDays(30)
    ));
}
Database.insert(opps, true);

// Level 4: Query with relationships (generates SOQL nodes)
System.debug('=== Level 4: Querying with relationships ===');
List<Account> accWithRels = [
    SELECT Id, Name,
           (SELECT Id, Name FROM Contacts),
           (SELECT Id, Name FROM Opportunities)
    FROM Account
    WHERE Id IN :accs
];

for (Account a : accWithRels) {
    System.debug('Account: ' + a.Name);
    System.debug('  Contacts: ' + a.Contacts.size());
    System.debug('  Opportunities: ' + a.Opportunities.size());
}

// Level 5: Update operations (generates DML nodes)
System.debug('=== Level 5: Updating records ===');
for (Account a : accs) {
    a.Description = 'Updated at ' + System.now();
}
Database.update(accs, true);

for (Contact c : cons) {
    c.Description = 'Updated at ' + System.now();
}
Database.update(cons, true);

// Level 6: Aggregate queries
System.debug('=== Level 6: Aggregate queries ===');
List<AggregateResult> aggResults = [
    SELECT AccountId, COUNT(Id) cnt
    FROM Contact
    WHERE AccountId IN :accs
    GROUP BY AccountId
];
for (AggregateResult ar : aggResults) {
    System.debug('Account ' + ar.get('AccountId') + ' has ' + ar.get('cnt') + ' contacts');
}

// Level 7: Database methods with partial success
System.debug('=== Level 7: Database operations ===');
List<Account> mixedAccs = new List<Account>{
    new Account(Name = 'Valid Account'),
    new Account() // Invalid - will fail
};
Database.SaveResult[] results = Database.insert(mixedAccs, false);
for (Database.SaveResult sr : results) {
    if (sr.isSuccess()) {
        System.debug('Insert success: ' + sr.getId());
    } else {
        System.debug('Insert failed: ' + sr.getErrors()[0].getMessage());
    }
}

// Level 8: System methods
System.debug('=== Level 8: System operations ===');
String jsonStr = JSON.serialize(accs);
List<Object> parsed = (List<Object>)JSON.deserializeUntyped(jsonStr);
System.debug('Serialized ' + parsed.size() + ' accounts');

Datetime now = Datetime.now();
String formatted = now.format('yyyy-MM-dd HH:mm:ss');
System.debug('Current time: ' + formatted);

// Level 9: Limits check
System.debug('=== Level 9: Governor Limits ===');
System.debug('SOQL: ' + Limits.getQueries() + '/' + Limits.getLimitQueries());
System.debug('DML: ' + Limits.getDmlStatements() + '/' + Limits.getLimitDmlStatements());
System.debug('CPU: ' + Limits.getCpuTime() + '/' + Limits.getLimitCpuTime());

// Cleanup
System.debug('=== Cleanup ===');
delete opps;
delete cons;
List<Account> allTestAccs = [SELECT Id FROM Account WHERE Name LIKE 'CallTree Test%' OR Name = 'Valid Account'];
delete allTestAccs;

System.debug('=== FoxLog Call Tree Test COMPLETE ===');