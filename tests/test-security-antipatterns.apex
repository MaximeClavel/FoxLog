// FoxLog Security Anti-Pattern Test - Execute in Developer Console
// Generates logs that trigger the security-related anti-patterns
//
// PREREQUISITE: Deploy FoxLogSecurityTest class first (see bottom of this file)
// Then run this anonymous script.

System.debug('=== FOXLOG SECURITY ANTI-PATTERN TEST START ===');

// ============================================
// 🔒 SECURITY ANTI-PATTERNS
// ============================================

// --- 1. SOQL Injection Risk (Database.query) ---
System.debug('--- Test: SOQL Injection Risk ---');

String nameFilter = 'FoxLog';
// ❌ Dynamic SOQL via string concatenation (injection-vulnerable pattern)
String q1 = 'SELECT Id, Name FROM Account WHERE Name LIKE \'%' + nameFilter + '%\' LIMIT 5';
List<Account> dynamicResults1 = Database.query(q1);
System.debug('Dynamic query 1 returned: ' + dynamicResults1.size());

String industryFilter = 'Technology';
String q2 = 'SELECT Id FROM Account WHERE Industry = \'' + industryFilter + '\' LIMIT 5';
List<Account> dynamicResults2 = Database.query(q2);
System.debug('Dynamic query 2 returned: ' + dynamicResults2.size());

// ❌ Database.countQuery (also injection risk)
String countQ = 'SELECT COUNT() FROM Account WHERE Name != null';
Integer cnt = Database.countQuery(countQ);
System.debug('Count query returned: ' + cnt);


// --- 2. Legacy WITH SECURITY_ENFORCED (deprecated in API v67+) ---
System.debug('--- Test: Legacy WITH SECURITY_ENFORCED ---');

// ❌ Old-style FLS enforcement — redundant since API v67 (user mode is default)
List<Account> secEnf1 = [SELECT Id, Name FROM Account WITH SECURITY_ENFORCED LIMIT 5];
System.debug('Security enforced query 1: ' + secEnf1.size());

List<Account> secEnf2 = [SELECT Id, Industry FROM Account WITH SECURITY_ENFORCED LIMIT 5];
System.debug('Security enforced query 2: ' + secEnf2.size());

List<Contact> secEnf3 = [SELECT Id, LastName FROM Contact WITH SECURITY_ENFORCED LIMIT 5];
System.debug('Security enforced query 3: ' + secEnf3.size());


// --- 3 & 4. SYSTEM_MODE + Without Sharing ---
// These patterns require a deployed class (cannot use SYSTEM_MODE in anonymous Apex).
// Deploy FoxLogSecurityTest class (see bottom of this file), then uncomment:
// FoxLogSecurityTest.runSystemModeTests();
System.debug('--- Test: SYSTEM_MODE & Without Sharing ---');
System.debug('Skipped: deploy FoxLogSecurityTest class first, then uncomment line above');
System.debug('Note: these patterns only fire on actual CODE_UNIT / METHOD_ENTRY lines');


// --- 5. Insecure HTTP Endpoint ---
System.debug('--- Test: Insecure Endpoint ---');
// ❌ HTTP request to non-HTTPS endpoint (will appear in log as CALLOUT_REQUEST)
// NOTE: This will FAIL at runtime (no Remote Site Setting), but the log
// still captures the CALLOUT_REQUEST attempt which FoxLog can detect.
HttpRequest req = new HttpRequest();
req.setEndpoint('http://foxlog-test.example.com/api/insecure');
req.setMethod('GET');
req.setTimeout(3000);

try {
    Http http = new Http();
    HttpResponse res = http.send(req);
} catch (Exception e) {
    System.debug('Expected callout failure: ' + e.getMessage());
}

// Second insecure callout attempt
HttpRequest req2 = new HttpRequest();
req2.setEndpoint('http://foxlog-test.example.com/api/v2/data');
req2.setMethod('POST');
req2.setTimeout(3000);

try {
    Http http2 = new Http();
    HttpResponse res2 = http2.send(req2);
} catch (Exception e) {
    System.debug('Expected callout failure 2: ' + e.getMessage());
}


// ============================================
// ✅ BONNES PRATIQUES (pour comparaison)
// ============================================
System.debug('--- Bonnes pratiques ---');

// ✅ Inline SOQL (pas d'injection possible)
List<Account> safeQuery = [SELECT Id FROM Account WHERE Name = :nameFilter LIMIT 5];

// ✅ USER_MODE explicite (la bonne pratique v67+)
List<Account> userMode = [SELECT Id, Name FROM Account WITH USER_MODE LIMIT 5];

System.debug('Safe queries returned: ' + safeQuery.size() + ', ' + userMode.size());
System.debug('=== FOXLOG SECURITY ANTI-PATTERN TEST END ===');


// ============================================
// DEPLOY THIS CLASS FIRST (via Dev Console > New Apex Class)
// ============================================
/*

public without sharing class FoxLogSecurityTest {

    public static void runSystemModeTests() {
        // ❌ SYSTEM_MODE in SOQL — bypasses CRUD/FLS
        List<Account> sysMode1 = [SELECT Id, Name FROM Account WITH SYSTEM_MODE LIMIT 5];
        System.debug('System mode query 1: ' + sysMode1.size());

        List<Contact> sysMode2 = [SELECT Id, Email FROM Contact WITH SYSTEM_MODE LIMIT 5];
        System.debug('System mode query 2: ' + sysMode2.size());

        // ❌ Database method with AccessLevel.SYSTEM_MODE
        String dynamicQ = 'SELECT Id FROM Account LIMIT 5';
        List<Account> sysMode3 = Database.query(dynamicQ, AccessLevel.SYSTEM_MODE);
        System.debug('System mode via AccessLevel: ' + sysMode3.size());

        // ❌ DML in system mode
        Account tempAcc = new Account(Name = 'FoxLog_SecurityTest_Temp');
        insert as system tempAcc;
        System.debug('Inserted in system mode: ' + tempAcc.Id);

        // Cleanup
        delete as system tempAcc;
    }
}

*/
