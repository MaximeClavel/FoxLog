// Script injecté dans le contexte de la page Salesforce
// Ce script a accès aux objets globaux de Salesforce

(function() {
'use strict';

/**
 * Récupérer l'User ID
 * 2 méthodes uniquement
 */
function getUserId() {
  let userId = null;
  
  // MÉTHODE 1: Via window.UserContext (Lightning Experience)
  if (window.UserContext && window.UserContext.userId) {
    userId = window.UserContext.userId;
    console.log('[FoxLog Injected] ✅ User ID trouvé via UserContext:', userId);
    return userId;
  }
  
  // MÉTHODE 2: Via $A (Aura Framework)
  if (typeof $A !== 'undefined') {
    try {
      userId = $A.get('$SObjectType.CurrentUser.Id');
      if (userId) {
        console.log('[FoxLog Injected] ✅ User ID trouvé via $A:', userId);
        return userId;
      }
    } catch(e) {
      console.log('[FoxLog Injected] ❌ Erreur $A:', e);
    }
  }
  
  console.log('[FoxLog Injected] ❌ User ID non trouvé');
  return null;
}

/**
 * Récupérer le Session ID/Token
 * 2 méthodes uniquement (priorité au token Aura)
 */
function getSessionToken() {
  let sessionId = null;
  
  // MÉTHODE 1 (PRIORITAIRE): Token de session Aura (valide pour API REST)
  if (typeof $A !== 'undefined') {
    try {
      const token = $A.get('$Token.sessionToken');
      if (token) {
        sessionId = token;
        console.log('[FoxLog Injected] ✅ Session Token trouvé via $A.sessionToken (valide pour API)');
        return sessionId;
      }
    } catch(e) {
      console.log('[FoxLog Injected] ❌ Erreur $A.sessionToken:', e);
    }
  }
  
  // MÉTHODE 2: Via window.__CACHE__ (fallback)
  if (window.__CACHE__ && window.__CACHE__.sid) {
    sessionId = window.__CACHE__.sid;
    console.log('[FoxLog Injected] ✅ Session trouvée via __CACHE__.sid');
    return sessionId;
  }
  
  console.log('[FoxLog Injected] ❌ Aucune session trouvée');
  return null;
}

// Écouter les demandes de User ID
window.addEventListener('foxlog_request_userid', function(event) {
  const userId = getUserId();
  console.log('[FoxLog Injected] 📤 Réponse User ID:', userId || 'null');
  
  window.dispatchEvent(new CustomEvent('foxlog_userid_response', {
    detail: { userId: userId }
  }));
});

// Écouter les demandes de session
window.addEventListener('foxlog_request_session', function(event) {
  try {
    const sessionId = getSessionToken();
    
    console.log('[FoxLog Injected] 📤 Réponse Session ID:', sessionId ? sessionId.substring(0, 20) + '...' : 'null');
    
    window.dispatchEvent(new CustomEvent('foxlog_session_response', {
      detail: { sessionId: sessionId }
    }));
  } catch(error) {
    console.error('[FoxLog Injected] ❌ Erreur:', error);
    window.dispatchEvent(new CustomEvent('foxlog_session_response', {
      detail: { sessionId: null }
    }));
  }
});

console.log('[FoxLog Injected] ✅ Script injecté avec succès');

// Debug: Afficher les objets disponibles
console.log('[FoxLog Injected] 🔍 Objets disponibles:', {
  hasAura: typeof $A !== 'undefined',
  hasUserContext: typeof window.UserContext !== 'undefined',
  hasCache: typeof window.__CACHE__ !== 'undefined'
});

})();