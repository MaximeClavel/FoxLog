# 🩺 Analyse des Anti-patterns

## Vue d'ensemble

FoxLog intègre un système de détection automatique des anti-patterns courants dans les logs de debug Salesforce. Cette fonctionnalité analyse les logs d'exécution Apex et identifie les problèmes de performance potentiels qui pourraient causer des erreurs en production.

## Accès à l'analyse

L'analyse est accessible via l'onglet **🩺 Analyse** dans la modal de détail d'un log.

Un **badge** sur l'onglet indique l'état de santé du code :
- ✓ **Vert** : Aucun problème détecté
- 🔴 **Rouge** : Problèmes critiques (nombre affiché)
- 🟡 **Orange** : Avertissements (nombre affiché)
- 🔵 **Bleu** : Suggestions d'amélioration (nombre affiché)

## Score de santé

Chaque analyse produit un **score de santé** de 0 à 100 :

| Score | État | Description |
|-------|------|-------------|
| 80-100 | 🟢 Excellent | Code optimisé, peu ou pas de problèmes |
| 50-79 | 🟡 Attention | Quelques optimisations recommandées |
| 0-49 | 🔴 Critique | Risque élevé de governor limits |

### Calcul du score
```
Score = 100 - (critiques × 20) - (warnings × 10) - (infos × 2)
```

---

## Anti-patterns détectés

### 🔴 Critiques

#### SOQL in Loop
**Sévérité** : Critique  
**Ce qu'on observe** : Plusieurs requêtes SOQL avec un pattern similaire sont exécutées en séquence rapprochée dans le log.  
**Ce que ça indique** : Ces requêtes sont probablement exécutées dans une boucle dans le code Apex.

**Exemple de log** :
```
10:15:32.045 (12345)|SOQL_EXECUTE_BEGIN|[25]|SELECT Id FROM Contact WHERE AccountId = '001...'
10:15:32.078 (12378)|SOQL_EXECUTE_BEGIN|[25]|SELECT Id FROM Contact WHERE AccountId = '001...'
10:15:32.112 (12412)|SOQL_EXECUTE_BEGIN|[25]|SELECT Id FROM Contact WHERE AccountId = '001...'
// ❌ Pattern répétitif détecté !
```

**Cause probable dans le code** :
```apex
for (Account acc : accounts) {
    List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];
}
```

**Solution recommandée** :
```apex
Set<Id> accountIds = new Set<Id>();
for (Account acc : accounts) {
    accountIds.add(acc.Id);
}
List<Contact> contacts = [SELECT Id, AccountId FROM Contact WHERE AccountId IN :accountIds];
// ✅ Une seule requête apparaîtra dans le log
```

---

#### DML in Loop
**Sévérité** : Critique  
**Ce qu'on observe** : Plusieurs opérations DML du même type sur le même objet apparaissent en séquence dans le log.  
**Ce que ça indique** : Ces DML sont probablement exécutés dans une boucle.

**Exemple de log** :
```
10:15:32.200 (12500)|DML_BEGIN|[30]|Op:Update|Type:Account|Rows:1
10:15:32.250 (12550)|DML_BEGIN|[30]|Op:Update|Type:Account|Rows:1
10:15:32.300 (12600)|DML_BEGIN|[30]|Op:Update|Type:Account|Rows:1
// ❌ Pattern répétitif détecté !
```

**Cause probable dans le code** :
```apex
for (Account acc : accounts) {
    acc.Name = 'Updated';
    update acc;
}
```

**Solution recommandée** :
```apex
for (Account acc : accounts) {
    acc.Name = 'Updated';
}
update accounts; // ✅ Un seul DML apparaîtra dans le log
```

---

#### Recursion possible
**Sévérité** : Critique (>50 appels) ou Warning (>10 appels)  
**Ce qu'on observe** : Une même méthode apparaît plus de 10 fois dans les `METHOD_ENTRY` du log.  
**Ce que ça indique** : Récursion non contrôlée ou logique de boucle excessive.

**Solution** :
```apex
public class MyTriggerHandler {
    private static Boolean isExecuting = false;
    
    public static void handleTrigger() {
        if (isExecuting) return; // ✅ Protection contre la récursion
        isExecuting = true;
        // ... logique
        isExecuting = false;
    }
}
```

---

#### Requête N+1 (N+1 Query Pattern)
**Sévérité** : Critique  
**Ce qu'on observe** : Plusieurs requêtes SOQL filtrant sur un champ de relation (ex: `AccountId`, `ParentId`) avec des valeurs différentes, exécutées en séquence.  
**Ce que ça indique** : Pour chaque record parent, une requête séparée est faite pour récupérer les enfants.

**Exemple de log** :
```
10:15:32.045|SOQL_EXECUTE_BEGIN|SELECT Id FROM Contact WHERE AccountId = '001ABC...'
10:15:32.078|SOQL_EXECUTE_BEGIN|SELECT Id FROM Contact WHERE AccountId = '001DEF...'
10:15:32.112|SOQL_EXECUTE_BEGIN|SELECT Id FROM Contact WHERE AccountId = '001GHI...'
// ❌ N+1 : 1 requête par Account au lieu de 1 requête pour tous
```

**Cause probable** :
```apex
List<Account> accounts = [SELECT Id FROM Account LIMIT 100];
for (Account acc : accounts) {
    // ❌ 100 requêtes pour 100 comptes !
    List<Contact> contacts = [SELECT Id FROM Contact WHERE AccountId = :acc.Id];
}
```

**Solutions recommandées** :
```apex
// Option 1 : Sous-requête (relation parent-enfant)
List<Account> accounts = [SELECT Id, (SELECT Id FROM Contacts) FROM Account LIMIT 100];

// Option 2 : Requête avec IN et Map
Set<Id> accountIds = new Map<Id, Account>(accounts).keySet();
Map<Id, List<Contact>> contactsByAccount = new Map<Id, List<Contact>>();
for (Contact c : [SELECT Id, AccountId FROM Contact WHERE AccountId IN :accountIds]) {
    if (!contactsByAccount.containsKey(c.AccountId)) {
        contactsByAccount.put(c.AccountId, new List<Contact>());
    }
    contactsByAccount.get(c.AccountId).add(c);
}
// ✅ 1 seule requête quel que soit le nombre de comptes
```

---

#### Trigger Recursion
**Sévérité** : Critique  
**Ce qu'on observe** : Le même trigger (ex: `AccountTrigger on Account`) apparaît plus de 3 fois dans les `CODE_UNIT_STARTED`.  
**Ce que ça indique** : Le trigger se déclenche en cascade, souvent à cause d'un update dans le trigger lui-même.

**Exemple de log** :
```
CODE_UNIT_STARTED|[EXTERNAL]|trigger AccountTrigger on Account
  DML_BEGIN|Op:Update|Type:Account
    CODE_UNIT_STARTED|[EXTERNAL]|trigger AccountTrigger on Account  ← Récursion !
      DML_BEGIN|Op:Update|Type:Account
        CODE_UNIT_STARTED|[EXTERNAL]|trigger AccountTrigger on Account  ← Récursion !
```

**Solution** :
```apex
public class TriggerHandler {
    private static Set<Id> processedIds = new Set<Id>();
    
    public static void handleBeforeUpdate(List<Account> newList) {
        List<Account> toProcess = new List<Account>();
        for (Account acc : newList) {
            if (!processedIds.contains(acc.Id)) {
                processedIds.add(acc.Id);
                toProcess.add(acc);
            }
        }
        // ✅ Ne traite chaque record qu'une fois
        if (!toProcess.isEmpty()) {
            processAccounts(toProcess);
        }
    }
}
```

---

#### Mixed DML Operations
**Sévérité** : Critique  
**Ce qu'on observe** : Des DML sur des objets "setup" (User, Group, PermissionSet...) et des objets standard dans la même transaction.  
**Ce que ça indique** : Risque d'erreur `MIXED_DML_OPERATION` à l'exécution.

**Objets setup concernés** : User, Group, GroupMember, PermissionSet, PermissionSetAssignment, QueueSObject, etc.

**Solution** :
```apex
// ❌ Interdit dans la même transaction
insert new Account(Name = 'Test');
insert new User(/*...*/);

// ✅ Séparer avec @future
insert new Account(Name = 'Test');
UserService.createUserAsync(userData); // @future method
```

---

#### High SOQL/DML/CPU/Heap Usage
**Sévérité** : Critique (>90%) ou Warning (>70%)  
**Ce qu'on observe** : Les compteurs dans la section `CUMULATIVE_LIMIT_USAGE` du log montrent une utilisation élevée des governor limits.  
**Ce que ça indique** : Le code approche des limites Salesforce et risque d'échouer avec plus de données.

| Limite | Seuil Warning | Seuil Critique |
|--------|---------------|----------------|
| SOQL Queries | >70% (70/100) | >90% (90/100) |
| DML Statements | >70% (105/150) | >90% (135/150) |
| CPU Time | >80% (8000ms) | >90% (9000ms) |
| Heap Size | >80% (4.8MB) | >90% (5.4MB) |

---

### 🟡 Warnings

#### SOQL without LIMIT
**Ce qu'on observe** : Une ligne `SOQL_EXECUTE_BEGIN` dans le log ne contient pas de clause `LIMIT`.  
**Ce que ça indique** : La requête pourrait retourner un grand nombre de records non maîtrisé.

**Exemple de log** :
```
10:15:32.045|SOQL_EXECUTE_BEGIN|[25]|SELECT Id, Name FROM Account
// ❌ Pas de LIMIT
```

**Solution recommandée** :
```apex
List<Account> accounts = [SELECT Id, Name FROM Account LIMIT 200];
```

---

#### SOQL without WHERE
**Ce qu'on observe** : Une ligne `SOQL_EXECUTE_BEGIN` dans le log ne contient pas de clause `WHERE`.  
**Ce que ça indique** : La requête récupère potentiellement tous les records de l'objet.

**Exemple de log** :
```
10:15:32.045|SOQL_EXECUTE_BEGIN|[25]|SELECT Id FROM Account
// ❌ Pas de WHERE - récupère tous les comptes accessibles
```

**Solution recommandée** :
```apex
List<Account> accounts = [SELECT Id FROM Account WHERE OwnerId = :UserInfo.getUserId()];
```

---

#### Non-Selective Query
**Ce qu'on observe** : Le log contient des indicateurs de requête non-sélective (`non-selective`, `QUERY_MORE`, `full table scan`).  
**Ce que ça indique** : La requête ne filtre pas sur un champ indexé, causant un scan complet de la table.

**Champs indexés par défaut** : Id, Name, OwnerId, CreatedDate, SystemModstamp, RecordType, et les champs External ID.

**Solution** :
```apex
// ❌ Champ non indexé en filtre
[SELECT Id FROM Account WHERE Industry = 'Technology']

// ✅ Ajouter un filtre sur champ indexé
[SELECT Id FROM Account WHERE Industry = 'Technology' AND CreatedDate = LAST_N_DAYS:30]
```

---

#### Multiple HTTP Callouts
**Ce qu'on observe** : Plusieurs `CALLOUT_REQUEST` vers le même endpoint en séquence.  
**Ce que ça indique** : Des appels HTTP qui pourraient être regroupés ou parallélisés.

**Solution** :
- Utiliser une API qui supporte le batch si disponible
- Déplacer les callouts dans un `@future` ou `Queueable`
- Utiliser `Continuation` pour les callouts parallèles en Visualforce/LWC

---

#### Excessive Async Calls
**Ce qu'on observe** : Plus de 5 appels `@future` ou `System.enqueueJob` dans la même transaction.  
**Ce que ça indique** : Risque d'atteindre la limite de 50 @future par transaction.

**Solution** :
```apex
// ❌ @future dans une boucle
for (Account acc : accounts) {
    MyService.processAsync(acc.Id); // @future
}

// ✅ Passer tous les IDs à un seul @future
MyService.processAsyncBulk(accountIds); // @future(callout=true)
```

---

#### Hardcoded Record IDs
**Ce qu'on observe** : Des IDs Salesforce (15 ou 18 caractères) apparaissent en dur dans les requêtes SOQL du log.  
**Ce que ça indique** : IDs qui varient entre sandbox et production - code non portable.

**Exemple** :
```sql
SELECT Id FROM RecordType WHERE Id = '012000000000ABC'  -- ❌ Hardcodé
```

**Solution** :
```apex
// ✅ Utiliser Custom Settings ou Custom Metadata
Id recordTypeId = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName()
    .get('Customer').getRecordTypeId();
```

---

### 🔵 Informations

#### Too Many Fields Selected
**Ce qu'on observe** : Une requête SOQL dans le log contient plus de 15 champs dans le SELECT.  
**Ce que ça indique** : Consommation de heap potentiellement excessive.

**Suggestion** : Revoir la requête pour ne sélectionner que les champs réellement utilisés.

---

#### Deep Call Stack
**Ce qu'on observe** : La profondeur d'imbrication des `METHOD_ENTRY` dépasse 50 niveaux.  
**Ce que ça indique** : Architecture de code très imbriquée, potentiellement difficile à maintenir.

---

#### Multiple Validation Failures
**Ce qu'on observe** : Plusieurs `VALIDATION_FAIL` ou `FIELD_CUSTOM_VALIDATION_EXCEPTION` dans le log.  
**Ce que ça indique** : Données qui ne passent pas les règles de validation, ou règles trop restrictives.

**Suggestion** : Valider les données en Apex avant le DML, ou revoir les règles de validation.

---

#### Excessive Debug Statements
**Sévérité** : Info  
**Ce qu'on observe** : Plus de 20 `USER_DEBUG` ou `System.debug` dans le log.  
**Ce que ça indique** : Du code de debug laissé en place, consommant CPU et encombrant les logs.

**Solution** :
- Supprimer les `System.debug()` avant de déployer en production
- Utiliser un framework de logging conditionnel (ex: activation par Custom Setting)

```apex
// ❌ Debug laissé en place
System.debug('Entering method');
System.debug('Variable value: ' + myVar);

// ✅ Logging conditionnel
if (LogSettings__c.getInstance().EnableDebug__c) {
    Logger.log('Variable value: ' + myVar);
}
```

---

#### Callout After DML (Uncommitted Work Pending)
**Sévérité** : Critique  
**Ce qu'on observe** : Un `CALLOUT_REQUEST` apparaît après un `DML_BEGIN` sans commit intermédiaire.  
**Ce que ça indique** : Un callout HTTP après une opération DML non committée - **erreur garantie à l'exécution**.

**Erreur typique** : `System.CalloutException: You have uncommitted work pending. Please commit or rollback before calling out.`

**Exemple de log problématique** :
```
DML_BEGIN|Op:Insert|Type:Account
DML_END
CALLOUT_REQUEST|[...]HttpRequest  ← ❌ Erreur !
```

**Solutions** :
```apex
// ❌ Callout après DML
insert newAccount;
Http h = new Http();
HttpResponse res = h.send(req); // 💥 Erreur !

// ✅ Solution 1 : Callout AVANT le DML
HttpResponse res = h.send(req); // OK
insert newAccount;

// ✅ Solution 2 : @future pour le callout
insert newAccount;
MyService.sendCalloutAsync(newAccount.Id); // @future(callout=true)

// ✅ Solution 3 : Queueable pour chaîner
insert newAccount;
System.enqueueJob(new CalloutQueueable(newAccount.Id));
```

---

#### Large Query Results
**Sévérité** : Info/Warning  
**Ce qu'on observe** : Des requêtes SOQL retournent 200+ records (visible dans `SOQL_EXECUTE_END|Rows:XXX`).  
**Ce que ça indique** : Requêtes qui consomment beaucoup de heap memory.

**Impact** :
- Consommation importante de heap (limite 6MB sync, 12MB async)
- Risque de timeout sur des opérations volumineuses
- 500+ records = Warning, 200+ = Info

**Solutions** :
```apex
// ❌ Récupérer tous les comptes
List<Account> allAccounts = [SELECT Id, Name FROM Account];

// ✅ Filtrer plus finement
List<Account> recentAccounts = [
    SELECT Id, Name FROM Account 
    WHERE CreatedDate = LAST_N_DAYS:7 
    LIMIT 100
];

// ✅ Utiliser une boucle for SOQL pour les gros volumes
for (List<Account> batch : [SELECT Id FROM Account WHERE Industry = 'Tech']) {
    // Traite 200 records à la fois
    processBatch(batch);
}
```

---

## Récapitulatif des détections

| Anti-pattern | Sévérité | Ce qu'on cherche dans le log |
|--------------|----------|------------------------------|
| SOQL in Loop | 🔴 Critique | SOQL similaires répétés en séquence |
| DML in Loop | 🔴 Critique | DML identiques répétés en séquence |
| N+1 Query | 🔴 Critique | SOQL avec `WHERE ParentId = :id` répétés |
| Trigger Recursion | 🔴 Critique | Même trigger >3 fois |
| Mixed DML | 🔴 Critique | DML sur User/Group + objets standard |
| Callout After DML | 🔴 Critique | CALLOUT_REQUEST après DML sans commit |
| Method Recursion | 🔴/🟡 | Même méthode >10 fois |
| Governor Limits | 🔴/🟡 | CUMULATIVE_LIMIT_USAGE >70%/90% |
| SOQL no LIMIT | 🟡 Warning | SELECT sans LIMIT |
| SOQL no WHERE | 🟡 Warning | SELECT sans WHERE |
| Non-Selective | 🟡 Warning | Indicateurs de full table scan |
| Multiple Callouts | 🟡 Warning | CALLOUT_REQUEST répétés |
| Excessive Async | 🟡 Warning | >5 @future/Queueable |
| Hardcoded IDs | 🟡 Warning | IDs 15/18 chars dans SOQL |
| Large Query Results | 🟡/🔵 | SOQL_EXECUTE_END avec Rows >200 |
| Too Many Fields | 🔵 Info | SELECT avec >15 champs |
| Deep Call Stack | 🔵 Info | Profondeur >50 niveaux |
| Validation Failures | 🔵 Info | VALIDATION_FAIL multiples |
| Debug Statements | 🔵 Info | USER_DEBUG >20 occurrences |

---

## Architecture technique

### Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `src/services/anti-pattern-detector.js` | Service de détection |
| `src/ui/modal-manager.js` | Intégration UI (onglet Analyse) |
| `src/modal-styles.css` | Styles CSS |
| `src/core/constants.js` | Traductions i18n |

### Classe `AntiPatternDetector`

```javascript
// Utilisation
const detector = window.FoxLog.antiPatternDetector;
const results = detector.analyze(parsedLog);

// Structure du résultat
{
  patterns: [...],      // Liste des anti-patterns détectés
  summary: {
    critical: 2,        // Nombre de critiques
    warnings: 3,        // Nombre de warnings
    info: 1,            // Nombre d'infos
    total: 6,           // Total
    score: 45           // Score de santé (0-100)
  },
  hasCritical: true,    // Boolean
  hasWarning: true,     // Boolean
  totalCount: 6         // Total des patterns
}
```

### Configuration des seuils

Les seuils de détection sont configurables dans le constructeur :

```javascript
this.thresholds = {
  recursionLimit: 10,        // Appels de méthode avant alerte
  excessiveSoqlPercent: 70,  // % de la limite SOQL
  excessiveDmlPercent: 70,   // % de la limite DML
  cpuPercent: 80,            // % de la limite CPU
  heapPercent: 80,           // % de la limite Heap
  loopIterationThreshold: 3  // Répétitions pour détecter une boucle
};
```

---

## Export PDF

### Comment exporter

1. Ouvrir un log et aller dans l'onglet **🩺 Analyse**
2. Cliquer sur le bouton **📄 Export PDF** (en haut à droite)
3. Une fenêtre de prévisualisation s'ouvre
4. Dans la boîte de dialogue d'impression, sélectionner **"Enregistrer en PDF"** comme destination
5. Cliquer sur **Enregistrer**

### Contenu du rapport PDF

Le rapport PDF inclut :
- **Score de santé** avec jauge visuelle
- **Statistiques** : nombre de critiques, warnings et infos
- **Informations du log** : opération, statut, durée, ID
- **Liste des anti-patterns** groupés par sévérité avec :
  - Titre et description
  - Requête concernée (si applicable)
  - Nombre d'occurrences
  - Suggestion de correction

### Format

Le PDF est optimisé pour :
- Format A4
- Impression noir et blanc (couleurs conservées si disponible)
- Rupture de page automatique entre les patterns

---

## Navigation vers le code

Chaque anti-pattern détecté affiche des **boutons de navigation** (L1, L25, L142...) permettant de :
1. Basculer automatiquement vers l'onglet "Log brut"
2. Scroller jusqu'à la ligne concernée
3. Mettre en surbrillance la ligne pendant 2 secondes

---

## Bonnes pratiques Salesforce

### Les 5 règles d'or pour éviter les governor limits

1. **Bulkifier les requêtes SOQL**
   - Utiliser des collections (Set, List, Map)
   - Requêter une seule fois avant la boucle

2. **Bulkifier les opérations DML**
   - Collecter les records dans une List
   - Effectuer le DML après la boucle

3. **Contrôler la récursion**
   - Utiliser des variables statiques
   - Implémenter le pattern "run once"

4. **Optimiser les requêtes**
   - Toujours ajouter WHERE et LIMIT
   - Sélectionner uniquement les champs nécessaires

5. **Monitorer les limites**
   - Utiliser `Limits.getQueries()` et autres méthodes Limits
   - Logger les métriques critiquess
