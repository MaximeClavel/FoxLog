chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSessionId') {
    console.log('[Background] Recherche cookie sid...');
    
    async function findValidSessionCookie() {
      try {
        // 1️⃣ PRIORITÉ ABSOLUE : Chercher directement sur my.salesforce.com
        const currentUrl = request.url || sender.url || '';
        if (currentUrl) {
          const hostname = new URL(currentUrl).hostname;
          const myDomain = hostname.replace('lightning.force.com', 'my.salesforce.com');
          
          console.log(`[Background] 🎯 Recherche prioritaire sur: ${myDomain}`);
          
          const directCookie = await chrome.cookies.get({
            url: `https://${myDomain}`,
            name: 'sid'
          });
          
          if (directCookie && directCookie.value) {
            console.log('[Background] ✅ Cookie trouvé directement sur my.salesforce.com');
            console.log(`[Background]    Valeur: ${directCookie.value.substring(0, 30)}...`);
            return directCookie.value;
          }
        }
        
        // 2️⃣ FALLBACK : Récupérer TOUS les cookies 'sid' de tous les domaines Salesforce
        console.log('[Background] 🔍 Recherche dans tous les cookies sid...');
        const allCookies = await chrome.cookies.getAll({});
        
        // Filtrer uniquement les cookies 'sid' sur domaines Salesforce
        const sidCookies = allCookies.filter(c => 
          c.name === 'sid' && 
          (c.domain.includes('salesforce') || c.domain.includes('force.com'))
        );
        
        console.log(`[Background] ${sidCookies.length} cookie(s) 'sid' trouvé(s):`);
        sidCookies.forEach(c => {
          console.log(`  - ${c.domain}: ${c.value.substring(0, 30)}... (Secure: ${c.secure}, HttpOnly: ${c.httpOnly})`);
        });
        
        // PRIORITÉ 1: Cookie sur my.salesforce.com (le plus fiable pour API REST)
        let bestCookie = sidCookies.find(c => c.domain.includes('my.salesforce.com'));
        if (bestCookie) {
          console.log('[Background] ✅ Cookie trouvé sur my.salesforce.com (OPTIMAL)');
          console.log(`[Background]    Valeur: ${bestCookie.value.substring(0, 30)}...`);
          return bestCookie.value;
        }
        
        // PRIORITÉ 2: Cookie sur .salesforce.com
        bestCookie = sidCookies.find(c => c.domain === '.salesforce.com');
        if (bestCookie) {
          console.log('[Background] ✓ Cookie trouvé sur .salesforce.com');
          return bestCookie.value;
        }
        
        // PRIORITÉ 3: Cookie sur .force.com
        bestCookie = sidCookies.find(c => c.domain === '.force.com');
        if (bestCookie) {
          console.log('[Background] ⚠️ Cookie trouvé sur .force.com (peut être différent)');
          return bestCookie.value;
        }
        
        // PRIORITÉ 4: Cookie sur lightning.force.com (souvent invalide pour API)
        bestCookie = sidCookies.find(c => c.domain.includes('lightning.force.com'));
        if (bestCookie) {
          console.log('[Background] ⚠️ Cookie trouvé sur lightning.force.com (probablement invalide)');
          return bestCookie.value;
        }
        
        // PRIORITÉ 5: N'importe quel cookie sid en dernier recours
        if (sidCookies.length > 0) {
          bestCookie = sidCookies[0];
          console.log(`[Background] ⚠️ Cookie trouvé sur ${bestCookie.domain} (fallback - peut ne pas fonctionner)`);
          return bestCookie.value;
        }
        
        console.log('[Background] ✗ Aucun cookie sid trouvé');
        return null;
        
      } catch (error) {
        console.error('[Background] Erreur:', error);
        return null;
      }
    }
    
    findValidSessionCookie().then(sessionId => {
      sendResponse({ sessionId: sessionId });
    });
    
    return true; // Réponse asynchrone
  }
});