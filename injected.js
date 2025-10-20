// Script injecté dans le contexte de la page Salesforce
// Ce script a accès aux objets globaux de Salesforce

(function() {
'use strict';

// Fonction pour récupérer l'User ID
function getUserId() {
  let userId = null;
  
  // Méthode 1: Via window.UserContext (Lightning Experience)
  if (window.UserContext && window.UserContext.userId) {
    userId = window.UserContext.userId;
    console.log('[FoxLog Injected] User ID trouvé via UserContext:', userId);
    return userId;
  }
  
  // Méthode 2: Via $A (Aura Framework)
  if (typeof $A !== 'undefined') {
    try {
      userId = $A.get('$SObjectType.CurrentUser.Id');
      if (userId) {
        console.log('[FoxLog Injected] User ID trouvé via $A:', userId);
        return userId;
      }
    } catch(e) {
      console.log('[FoxLog Injected] Erreur $A:', e);
    }
  }
  
  // Méthode 3: Via LWR context
  if (window.LWR && window.LWR.aura && window.LWR.aura.context) {
    try {
      userId = window.LWR.aura.context.user?.id;
      if (userId) {
        console.log('[FoxLog Injected] User ID trouvé via LWR:', userId);
        return userId;
      }
    } catch(e) {
      console.log('[FoxLog Injected] Erreur LWR:', e);
    }
  }
  
  // Méthode 4: Depuis le DOM (Aura apps)
  try {
    const auraConfig = document.querySelector('script[type="text/javascript"]');
    if (auraConfig && auraConfig.textContent.includes('context')) {
      const match = auraConfig.textContent.match(/"user":\s*\{[^}]*"id":\s*"([^"]+)"/);
      if (match && match[1]) {
        userId = match[1];
        console.log('[FoxLog Injected] User ID trouvé via DOM:', userId);
        return userId;
      }
    }
  } catch(e) {
    console.log('[FoxLog Injected] Erreur DOM:', e);
  }
  
  return userId;
}

// Fonction pour récupérer le Session ID/Token
function getSessionToken() {
  let sessionId = null;
  
  // PRIORITÉ 1: Token de session Aura (valide pour API REST)
  if (typeof $A !== 'undefined') {
    try {
      const token = $A.get('$Token.sessionToken');
      if (token) {
        sessionId = token;
        console.log('[FoxLog Injected] ✅ Session Token trouvé via $A.sessionToken (valide pour API)');
        return sessionId;
      }
    } catch(e) {
      console.log('[FoxLog Injected] Erreur $A.sessionToken:', e);
    }
  }
  
  // PRIORITÉ 2: Via window.__CACHE__
  if (window.__CACHE__ && window.__CACHE__.sid) {
    sessionId = window.__CACHE__.sid;
    console.log('[FoxLog Injected] Session trouvée via __CACHE__.sid');
    return sessionId;
  }
  
  // PRIORITÉ 3: Via LWR
  if (window.LWR && window.LWR.aura && window.LWR.aura.token) {
    sessionId = window.LWR.aura.token;
    console.log('[FoxLog Injected] Session trouvée via LWR.aura.token');
    return sessionId;
  }
  
  // PRIORITÉ 4: Chercher dans les variables globales
  if (window.SFDCSessionVars && window.SFDCSessionVars.sessionId) {
    sessionId = window.SFDCSessionVars.sessionId;
    console.log('[FoxLog Injected] Session trouvée via SFDCSessionVars');
    return sessionId;
  }
  
  console.log('[FoxLog Injected] ❌ Aucune session trouvée');
  return null;
}

// Écouter les demandes de User ID
window.addEventListener('foxlog_request_userid', function(event) {
  const userId = getUserId();
  console.log('[FoxLog Injected] Réponse User ID:', userId);
  
  window.dispatchEvent(new CustomEvent('foxlog_userid_response', {
    detail: { userId: userId }
  }));
});

// Écouter les demandes de session
window.addEventListener('foxlog_request_session', function(event) {
  try {
    const sessionId = getSessionToken();
    
    console.log('[FoxLog Injected] Réponse Session ID:', sessionId ? sessionId.substring(0, 20) + '...' : 'null');
    
    window.dispatchEvent(new CustomEvent('foxlog_session_response', {
      detail: { sessionId: sessionId }
    }));
  } catch(error) {
    console.error('[FoxLog Injected] Erreur:', error);
    window.dispatchEvent(new CustomEvent('foxlog_session_response', {
      detail: { sessionId: null }
    }));
  }
});

console.log('[FoxLog Injected] Script injecté avec succès');

// Debug: Afficher les objets disponibles
console.log('[FoxLog Injected] Objets disponibles:', {
  hasAura: typeof $A !== 'undefined',
  hasUserContext: typeof window.UserContext !== 'undefined',
  hasLWR: typeof window.LWR !== 'undefined',
  hasCache: typeof window.__CACHE__ !== 'undefined'
});

})();
