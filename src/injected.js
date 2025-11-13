// Script injected into the Salesforce page context
// This script has access to Salesforce global objects

(function() {
'use strict';

/**
 * Get User ID
 * 2 methods only
 */
function getUserId() {
  let userId = null;
  
  // METHOD 1: Via window.UserContext (Lightning Experience)
  if (window.UserContext && window.UserContext.userId) {
    userId = window.UserContext.userId;
    console.log('[FoxLog Injected] ✅ User ID found via UserContext:', userId);
    return userId;
  }
  
  // METHOD 2: Via $A (Aura Framework)
  if (typeof $A !== 'undefined') {
    try {
      userId = $A.get('$SObjectType.CurrentUser.Id');
      if (userId) {
        console.log('[FoxLog Injected] ✅ User ID found via $A:', userId);
        return userId;
      }
    } catch(e) {
      console.log('[FoxLog Injected] ❌ $A error:', e);
    }
  }
  
  console.log('[FoxLog Injected] ❌ User ID not found');
  return null;
}

/**
 * Get Session ID/Token
 * 2 methods only (Aura token priority)
 */
function getSessionToken() {
  let sessionId = null;
  
  // METHOD 1 (PRIORITY): Aura session token (valid for REST API)
  if (typeof $A !== 'undefined') {
    try {
      const token = $A.get('$Token.sessionToken');
      if (token) {
        sessionId = token;
        console.log('[FoxLog Injected] ✅ Session Token found via $A.sessionToken (valid for API)');
        return sessionId;
      }
    } catch(e) {
      console.log('[FoxLog Injected] ❌ $A.sessionToken error:', e);
    }
  }
  
  // METHOD 2: Via window.__CACHE__ (fallback)
  if (window.__CACHE__ && window.__CACHE__.sid) {
    sessionId = window.__CACHE__.sid;
    console.log('[FoxLog Injected] ✅ Session found via __CACHE__.sid');
    return sessionId;
  }
  
  console.log('[FoxLog Injected] ❌ No session found');
  return null;
}

// Listen for User ID requests
window.addEventListener('foxlog_request_userid', function(event) {
  const userId = getUserId();
  console.log('[FoxLog Injected] 📤 User ID response:', userId || 'null');
  
  window.dispatchEvent(new CustomEvent('foxlog_userid_response', {
    detail: { userId: userId }
  }));
});

// Listen for session requests
window.addEventListener('foxlog_request_session', function(event) {
  try {
    const sessionId = getSessionToken();
    
    console.log('[FoxLog Injected] 📤 Session ID response:', sessionId ? sessionId.substring(0, 20) + '...' : 'null');
    
    window.dispatchEvent(new CustomEvent('foxlog_session_response', {
      detail: { sessionId: sessionId }
    }));
  } catch(error) {
    console.error('[FoxLog Injected] ❌ Error:', error);
    window.dispatchEvent(new CustomEvent('foxlog_session_response', {
      detail: { sessionId: null }
    }));
  }
});

console.log('[FoxLog Injected] ✅ Script injected successfully');

// Debug: Display available objects
console.log('[FoxLog Injected] 🔍 Available objects:', {
  hasAura: typeof $A !== 'undefined',
  hasUserContext: typeof window.UserContext !== 'undefined',
  hasCache: typeof window.__CACHE__ !== 'undefined'
});

})();