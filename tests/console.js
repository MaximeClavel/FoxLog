// ============================================
// SCRIPT DE TEST COMPLET DES SESSION IDs
// ============================================

console.clear();
console.log('%c🔍 TEST COMPLET DES SESSION IDs SALESFORCE', 'background: #0176d3; color: white; font-size: 16px; padding: 10px; font-weight: bold');

// Fonction pour tester un Session ID
async function testSessionId(sessionId, source) {
  if (!sessionId) {
    console.log(`❌ ${source}: Pas de Session ID`);
    return false;
  }
  
  try {
    const baseUrl = window.location.origin.replace('lightning.force.com', 'my.salesforce.com');
    const testUrl = `${baseUrl}/services/data/v59.0/limits`;
    
    console.log(`🔍 Test ${source}:`, sessionId.substring(0, 25) + '...');
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionId}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      console.log(`%c✅ ${source}: Session ID VALIDE pour API REST`, 'color: green; font-weight: bold; font-size: 14px');
      console.log(`   Session ID complet:`, sessionId);
      return true;
    } else {
      const errorText = await response.text();
      console.log(`%c❌ ${source}: Session ID INVALIDE (${response.status})`, 'color: red; font-weight: bold');
      console.log(`   Erreur:`, errorText);
      return false;
    }
  } catch (error) {
    console.log(`%c❌ ${source}: Erreur de test`, 'color: red; font-weight: bold');
    console.error(error);
    return false;
  }
}

// Test 1: document.cookie
console.log('\n%c📋 Test 1: document.cookie', 'background: #333; color: white; padding: 5px; font-weight: bold');
const cookieMatch = document.cookie.match(/sid=([^;]+)/);
const cookieSid = cookieMatch ? cookieMatch[1] : null;
await testSessionId(cookieSid, 'document.cookie');

// Test 2: Chrome Cookies API (tous les domaines Salesforce)
console.log('\n%c🍪 Test 2: Chrome Cookies API', 'background: #333; color: white; padding: 5px; font-weight: bold');
const allCookies = await chrome.cookies.getAll({});
const sfCookies = allCookies.filter(c => 
  (c.domain.includes('salesforce') || c.domain.includes('force.com')) && c.name === 'sid'
);

console.log(`Trouvé ${sfCookies.length} cookie(s) 'sid' sur domaines Salesforce:`);
for (const cookie of sfCookies) {
  console.log(`  - ${cookie.domain}: ${cookie.value.substring(0, 25)}...`);
  await testSessionId(cookie.value, `Chrome Cookie @ ${cookie.domain}`);
}

// Test 3: $A.get (Aura)
console.log('\n%c⚡ Test 3: Aura Framework ($A)', 'background: #333; color: white; padding: 5px; font-weight: bold');
if (typeof $A !== 'undefined') {
  try {
    const auraToken = $A.get('$Token.sessionToken');
    await testSessionId(auraToken, '$A.get("$Token.sessionToken")');
  } catch(e) {
    console.log('❌ $A.get erreur:', e);
  }
} else {
  console.log('❌ $A non disponible');
}

// Test 4: window.__CACHE__
console.log('\n%c💾 Test 4: window.__CACHE__', 'background: #333; color: white; padding: 5px; font-weight: bold');
if (window.__CACHE__ && window.__CACHE__.sid) {
  await testSessionId(window.__CACHE__.sid, 'window.__CACHE__.sid');
} else {
  console.log('❌ window.__CACHE__ non disponible');
}

// Test 5: Ouvrir Developer Console pour forcer le cookie
console.log('\n%c🛠️ Test 5: Forcer via Developer Console', 'background: #333; color: white; padding: 5px; font-weight: bold');
console.log('Ouverture iframe vers Developer Console...');

const iframe = document.createElement('iframe');
iframe.style.display = 'none';
iframe.src = window.location.origin.replace('lightning.force.com', 'my.salesforce.com') + '/_ui/common/apex/debug/ApexCSIPage';
document.body.appendChild(iframe);

await new Promise(resolve => setTimeout(resolve, 3000));

document.body.removeChild(iframe);
console.log('Iframe fermée, vérification des nouveaux cookies...');

const newCookies = await chrome.cookies.getAll({
  domain: window.location.hostname.replace('lightning.force.com', 'my.salesforce.com'),
  name: 'sid'
});

if (newCookies && newCookies.length > 0) {
  console.log(`Nouveau cookie trouvé après Developer Console:`);
  await testSessionId(newCookies[0].value, 'Developer Console Cookie');
} else {
  console.log('❌ Aucun nouveau cookie après Developer Console');
}

// Résumé
console.log('\n%c📊 RÉSUMÉ', 'background: #0176d3; color: white; font-size: 14px; padding: 8px; font-weight: bold');
console.log('Test terminé ! Recherchez les lignes ✅ ci-dessus pour trouver un Session ID valide.');
