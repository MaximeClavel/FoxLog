// Test rapide d'un Session ID spécifique
async function testSessionId(sessionId) {
  const baseUrl = window.location.origin.replace('lightning.force.com', 'my.salesforce.com');
  const response = await fetch(`${baseUrl}/services/data/v59.0/limits`, {
    headers: { 'Authorization': `Bearer ${sessionId}` }
  });
  
  if (response.ok) {
    console.log('%c✅ Session ID VALIDE pour API REST', 'color: green; font-weight: bold; font-size: 16px');
    const data = await response.json();
    console.log('Données API:', data);
    return true;
  } else {
    const error = await response.text();
    console.log('%c❌ Session ID INVALIDE', 'color: red; font-weight: bold; font-size: 16px');
    console.log('Erreur:', error);
    return false;
  }
}

// Tester le cookie actuel
const sid = document.cookie.match(/sid=([^;]+)/)?.[1];
console.log('Session ID trouvé:', sid?.substring(0, 30) + '...');
await testSessionId(sid);

// Lister TOUS les cookies sid disponibles
const allSidCookies = await chrome.cookies.getAll({});
const sidCookies = allSidCookies.filter(c => c.name === 'sid' && (c.domain.includes('salesforce') || c.domain.includes('force.com')));
console.log('Tous les cookies sid trouvés:', sidCookies.map(c => ({ domain: c.domain, value: c.value.substring(0, 30) + '...' })));

// Tester chaque cookie
for (const cookie of sidCookies) {
  console.log(`\nTest cookie @ ${cookie.domain}`);
  await testSessionId(cookie.value);
}
