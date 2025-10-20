// Configuration
const CONFIG = {
  AUTO_REFRESH_INTERVAL: 30000, // 30 secondes
  MAX_LOGS: 100,
  DEBUG_MODE: true
};

// Définir l'URL absolue des icône FoxLog
//>LOGO
const FOXLOG_ICON_URL = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
  ? chrome.runtime.getURL('icon128.png') : 'icon128.png';
//>TAIL
const TAIL_ICON_URL = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
  ? chrome.runtime.getURL('tail128.png') : 'tail128.png';
//>TRASH
  const TRASH_ICON_URL = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
  ? chrome.runtime.getURL('trash.png') : 'trash.png';
//>REFRESH
  const REFRESH_ICON_URL = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
  ? chrome.runtime.getURL('refresh.png') : 'refresh.png';

// Variables globales
let logCount = 0;
let monitoringInterval = null;
let cachedSessionId = null;
let cachedUserId = null;
let cachedLogs = null; // ✅ Cache des logs
let lastFetchTime = null; // ✅ Timestamp du dernier fetch
let retryCount = 0;
const MAX_RETRIES = 2;
const CACHE_DURATION = 30000; // 30 secondes de cache
const REFRESH_INTERVAL = 60000; // 10 secondes

// Injecter le script dans le contexte de la page
function injectScript() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function() {
      debugLog('✅ Script injected.js chargé avec succès');
      this.remove();
    };
    script.onerror = function() {
      debugLog('❌ Erreur lors du chargement de injected.js');
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (error) {
    debugLog('❌ Erreur injection script:', error);
  }
}

// Appeler l'injection au chargement
if (isSalesforcePage()) {
  injectScript();
}

// Log de debug pour l'extension
function debugLog(message, data = null) {
  if (CONFIG.DEBUG_MODE) {
    console.log(`[FoxLog] ${message}`, data || '');
  }
}

// Vérifier si on est sur Salesforce
function isSalesforcePage() {
  const hostname = window.location.hostname;
  const isSF = hostname.includes('salesforce.com') || 
               hostname.includes('force.com') || 
               hostname.includes('visualforce.com');
  debugLog('Est une page Salesforce ?', isSF);
  return isSF;
}

// Création du bouton flottant
function createFloatingButton() {
  debugLog('Création du bouton flottant');
  
  if (document.getElementById('sf-debug-toggle')) {
    debugLog('Le bouton existe déjà');
    return;
  }
  
  const button = document.createElement('div');
  button.id = 'sf-debug-toggle';
  button.innerHTML = `<img src="${TAIL_ICON_URL}" alt="FoxLog" style="width:32px;height:32px;vertical-align:middle;">`;
  button.title = 'FoxLog - Ouvrir les logs Salesforce';
  document.body.appendChild(button);
  
  button.addEventListener('click', () => {
    debugLog('Bouton cliqué');
    togglePanel();
  });
  
  debugLog('Bouton créé avec succès');
}

// Création du panel latéral
function createPanel() {
  debugLog('Création du panel');
  
  if (document.getElementById('sf-debug-panel')) {
    debugLog('Le panel existe déjà');
    return;
  }
  
  const panel = document.createElement('div');
  panel.id = 'sf-debug-panel';
  panel.className = 'sf-panel-closed';
  
  panel.innerHTML = `
    <div class="sf-panel-header">
      <h3><img src="${FOXLOG_ICON_URL}" alt="FoxLog" style="width:28px;height:28px;vertical-align:left;">   FoxLog</h3>
      <div class="sf-panel-controls">
        <button id="sf-clear-logs" title="Effacer les logs">
          <img src="${TRASH_ICON_URL}" alt="Delete" style="width:18px;height:18px;vertical-align:middle;">
        </button>
        <button id="sf-refresh-logs" title="Rafraîchir">
          <img src="${REFRESH_ICON_URL}" alt="Refresh" style="width:18px;height:18px;vertical-align:middle;">
        </button>
        <button id="sf-close-panel" title="Fermer">✕</button>
      </div>
    </div>
    <div class="sf-panel-status">
      <span id="sf-status-indicator" class="sf-status-disconnected">●</span>
      <span id="sf-status-text">Prêt</span>
    </div>
    <div class="sf-panel-filters">
      <input type="text" id="sf-log-filter" placeholder="Filtrer les logs...">
      <select id="sf-log-level">
        <option value="all">Tous les niveaux</option>
        <option value="ERROR">ERROR</option>
        <option value="WARN">WARN</option>
        <option value="INFO">INFO</option>
        <option value="DEBUG">DEBUG</option>
      </select>
    </div>
    <div class="sf-panel-content" id="sf-logs-container">
      <div class="sf-empty-state">
        <p>👋 Bienvenue dans FoxLog !</p>
        <p class="sf-hint">Cliquez sur ▶️ pour démarrer le monitoring</p>
        <p class="sf-hint">Les logs apparaîtront automatiquement</p>
      </div>
    </div>
    <div class="sf-panel-footer">
      <span id="sf-version-display"></span>
      <span id="sf-last-update">Jamais mis à jour</span>
    </div>
  `;
  
  document.body.appendChild(panel);

  // Event listeners
  document.getElementById('sf-close-panel').addEventListener('click', togglePanel);
  document.getElementById('sf-clear-logs').addEventListener('click', clearLogs);
  document.getElementById('sf-refresh-logs').addEventListener('click', manualRefresh);
  document.getElementById('sf-log-filter').addEventListener('input', filterLogs);
  document.getElementById('sf-log-level').addEventListener('change', filterLogs);
  
  debugLog('Panel créé avec succès');
}

// Démarrer l'auto-refresh
function startAutoRefresh() {
  if (monitoringInterval) return; // Déjà actif
  
  debugLog('🔄 Auto-refresh activé (10s)');
  monitoringInterval = setInterval(async () => {
    const panel = document.getElementById('sf-debug-panel');
    if (panel && panel.classList.contains('sf-panel-open')) {
      debugLog('🔄 Auto-refresh des logs...');
      // Invalider le cache et recharger
      lastFetchTime = null;
      await loadLogs(false,true);
    }
  }, REFRESH_INTERVAL);
}

// Modifier togglePanel() pour démarrer/arrêter l'auto-refresh
function togglePanel() {
  const panel = document.getElementById('sf-debug-panel');
  const isOpen = panel.classList.contains('sf-panel-open');
  
  if (isOpen) {
    panel.classList.remove('sf-panel-open');
    panel.classList.add('sf-panel-closed');
    stopMonitoring();
    debugLog('Panel fermé');
  } else {
    panel.classList.remove('sf-panel-closed');
    panel.classList.add('sf-panel-open');
    
    // Charger les logs (avec cache intelligent)
    loadLogs();
    
    // ✅ Démarrer l'auto-refresh
    startAutoRefresh();
    
    debugLog('Panel ouvert');
  }
}

/**
 * Charger les logs (avec cache intelligent)
 * Utilise le cache si disponible, sinon fetch
 */
async function loadLogs(forceRefresh = false, autoRefresh = false) {
  try {
    // Si le cache est valide et pas de forceRefresh, utiliser le cache
    if (!forceRefresh && isCacheValid() && cachedLogs) {
      debugLog('✅ Utilisation du cache (logs préchargés)');
      displayLogs(cachedLogs);
      showSuccess(`${cachedLogs.length} log(s) chargé(s) (cache)`);
      updateStatus('Prêt', 'connected');
      return;
    }
    
    // Sinon, charger les logs depuis l'API
    debugLog('🔄 Chargement des logs depuis l\'API...');
    await startMonitoring();
    
  } catch (error) {
    console.error('[FoxLog] Erreur loadLogs:', error);
    showError('Erreur: ' + error.message);
  }
}

// Démarrer le monitoring
async function startMonitoring(autoRefresh = false) {
  try {
    debugLog('Démarrage du monitoring...');
    
    // Afficher le spinner
    if(!autoRefresh){showLoadingSpinner('Initialisation...', 'Connexion à Salesforce');}
    
    // Utiliser les données en cache si disponibles
    let userId = cachedUserId;
    let sessionId = cachedSessionId;
    
    // Si pas en cache, récupérer
    if (!userId || !sessionId) {
      // 0. Forcer la session sur my.salesforce.com
      if(!autoRefresh){showLoadingSpinner('Connexion...', 'Établissement de la session');}
      await ensureMySalesforceSession();
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 1. Récupérer l'User ID
      if(!autoRefresh){showLoadingSpinner('Authentification...', 'Récupération de l\'identifiant utilisateur');}
      userId = await getCurrentUserId();
      if (!userId) {
        hideLoadingSpinner();
        showError('Impossible de récupérer l\'User ID');
        return;
      }
      cachedUserId = userId;
      debugLog('User ID obtenu:', userId);
      
      // 2. Récupérer le Session ID depuis background.js (Chrome Cookies API)
      if(!autoRefresh){showLoadingSpinner('Authentification...', 'Récupération du token de session');}
      debugLog('🔍 Récupération Session ID via Chrome Cookies API...');
      sessionId = await extractViaBackground();
      
      if (!sessionId) {
        hideLoadingSpinner();
        showError('Impossible de récupérer le Session ID');
        return;
      }
      
      debugLog('✅ Session ID obtenu:', sessionId.substring(0, 30) + '...');
      cachedSessionId = sessionId;
    } else {
      debugLog('✅ Utilisation des credentials en cache');
    }
    
    // 3. Récupérer les logs
    if(!autoRefresh){showLoadingSpinner('Chargement des logs...', 'Requête vers l\'API Salesforce');}
    const logs = await fetchDebugLogs(sessionId, userId);
    
    // Mettre à jour le cache
    cachedLogs = logs;
    lastFetchTime = Date.now();
    
    // Masquer le spinner
    hideLoadingSpinner();
    
    if (logs && logs.length > 0) {
      displayLogs(logs);
      showSuccess(`${logs.length} log(s) chargé(s)`);
      updateBadge(logs.length);
    } else {
      showInfo('Aucun debug log trouvé');
      updateBadge(0);
    }
    
  } catch (error) {
    hideLoadingSpinner();
    console.error('[FoxLog] Erreur monitoring:', error);
    showError('Erreur: ' + error.message);
  }
}


// Arrêter le monitoring
function stopMonitoring() {
  if (monitoringInterval) {
    debugLog('Monitoring arrêté');
    addLogEntry('INFO', 'Monitoring en pause');
    updateStatus('Prêt', 'disconnected');
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
}

// Rafraîchissement manuel
async function manualRefresh() {
  debugLog('Rafraîchissement manuel demandé');
  
  // Vider le cache pour forcer un fetch
  cachedLogs = null;
  cachedSessionId = null;
  cachedUserId = null;
  lastFetchTime = null;
  retryCount = 0;
  
  // Effacer les logs affichés
  clearLogs();
  
  // Recharger avec forceRefresh
  await loadLogs(true);
}

// ============================================
// EXTRACTION SESSION ID - MÉTHODE LIGHTNING
// ============================================

// Forcer la création du cookie sur my.salesforce.com (méthode Salesforce Inspector)
async function ensureMySalesforceSession() {
  debugLog('🔄 Forçage session my.salesforce.com (méthode Inspector)...');
  
  return new Promise((resolve) => {
    try {
      // Construire l'URL my.salesforce.com
      const currentUrl = window.location.hostname;
      const instance = currentUrl.split('.')[0]; // ex: cgi82-dev-ed
      const mySfUrl = `https://${currentUrl.replace('lightning.force.com', 'my.salesforce.com')}`;
      
      debugLog('URL my.salesforce.com:', mySfUrl);
      
      // Créer un iframe invisible
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.id = 'foxlog-mysf-iframe';
      
      let resolved = false;
      
      // Timeout de 3 secondes
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            document.body.removeChild(iframe);
          } catch(e) {}
          debugLog('✓ Session my.salesforce.com forcée (timeout)');
          resolve(true);
        }
      }, 3000);
      
      iframe.onload = () => {
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            try {
              document.body.removeChild(iframe);
            } catch(e) {}
            debugLog('✓ Session my.salesforce.com forcée (onload)');
            resolve(true);
          }
        }, 500);
      };
      
      iframe.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          try {
            document.body.removeChild(iframe);
          } catch(e) {}
          debugLog('✗ Erreur iframe my.salesforce.com');
          resolve(false);
        }
      };
      
      document.body.appendChild(iframe);
      // Charger la page d'accueil my.salesforce.com
      iframe.src = mySfUrl;
      
    } catch (error) {
      debugLog('✗ Erreur ensureMySalesforceSession:', error);
      resolve(false);
    }
  });
}

/**
 * Méthode principale d'extraction du Session ID
 * Compatible avec Lightning et Classic
 * PRIORITÉ: Chrome Cookies API (seule méthode fiable pour récupérer TOUS les cookies)
 */
async function extractSessionId() {
  console.log('%c⚡ EXTRACTION SESSION ID - DÉBUT', 'background: #0176d3; color: white; font-weight: bold; padding: 4px 8px; font-size: 13px');
  
  // Vérifier le cache
  if (cachedSessionId) {
    console.log('%c✅ SESSION TROUVÉE DANS LE CACHE', 'color: green; font-weight: bold; font-size: 12px');
    return cachedSessionId;
  }
  
  let sessionId = null;
  
  // ==================== MÉTHODE 1 (PRIORITAIRE): Chrome Cookies API via Background ====================
  console.log('%c🔍 Méthode 1: extractViaBackground (Chrome Cookies API - PRIORITAIRE)', 'color: #666; font-style: italic');
  sessionId = await extractViaBackground();
  if (sessionId) {
    console.log('%c✅ SUCCÈS - Méthode 1: extractViaBackground (Chrome Cookies API - Tous les cookies)', 'color: purple; font-weight: bold; font-size: 13px; background: #f3e6ff; padding: 3px 8px');
    console.log('   Session ID:', sessionId.substring(0, 30) + '...');
    cachedSessionId = sessionId;
    return sessionId;
  }
  console.log('%c❌ Méthode 1 échouée', 'color: #999');
  
  // ==================== MÉTHODE 2: Script injecté (Aura Token) ====================
  console.log('%c🔍 Méthode 2: extractFromLightningAPIs (Script injecté - Aura)', 'color: #666; font-style: italic');
  sessionId = await extractFromLightningAPIs();
  if (sessionId) {
    console.log('%c✅ SUCCÈS - Méthode 2: extractFromLightningAPIs (Token Aura)', 'color: blue; font-weight: bold; font-size: 13px; background: #e6f2ff; padding: 3px 8px');
    console.log('   Session ID:', sessionId.substring(0, 30) + '...');
    cachedSessionId = sessionId;
    return sessionId;
  }
  console.log('%c❌ Méthode 2 échouée', 'color: #999');
  
  // ==================== MÉTHODE 3: Page Context (window.__CACHE__, $A) ====================
  console.log('%c🔍 Méthode 3: extractViaPageContext (window.__CACHE__, $A)', 'color: #666; font-style: italic');
  sessionId = extractViaPageContext();
  if (sessionId) {
    console.log('%c✅ SUCCÈS - Méthode 3: extractViaPageContext', 'color: green; font-weight: bold; font-size: 13px; background: #e6ffe6; padding: 3px 8px');
    console.log('   Session ID:', sessionId.substring(0, 30) + '...');
    cachedSessionId = sessionId;
    return sessionId;
  }
  console.log('%c❌ Méthode 3 échouée', 'color: #999');
  
  // ==================== MÉTHODE 4: document.cookie (DERNIER RECOURS - souvent invalide) ====================
  console.log('%c🔍 Méthode 4: extractFromCookie (⚠️ document.cookie - peut être invalide)', 'color: #666; font-style: italic');
  sessionId = extractFromCookie();
  if (sessionId) {
    console.log('%c⚠️ SUCCÈS - Méthode 4: extractFromCookie (attention: peut causer erreur 401)', 'color: orange; font-weight: bold; font-size: 13px; background: #fff3e6; padding: 3px 8px');
    console.log('   Session ID:', sessionId.substring(0, 30) + '...');
    console.log('   ⚠️ Ce cookie peut ne pas être valide pour l\'API REST');
    cachedSessionId = sessionId;
    return sessionId;
  }
  console.log('%c❌ Méthode 4 échouée', 'color: #999');
  
  // ==================== MÉTHODE 5: Frontdoor.jsp ====================
  console.log('%c🔍 Méthode 5: extractViaFrontdoor (frontdoor.jsp)', 'color: #666; font-style: italic');
  sessionId = await extractViaFrontdoor();
  if (sessionId) {
    console.log('%c✅ SUCCÈS - Méthode 5: extractViaFrontdoor', 'color: orange; font-weight: bold; font-size: 13px; background: #fff3e6; padding: 3px 8px');
    console.log('   Session ID:', sessionId.substring(0, 30) + '...');
    cachedSessionId = sessionId;
    return sessionId;
  }
  console.log('%c❌ Méthode 5 échouée', 'color: #999');
  
  // ==================== MÉTHODE 6 (optionnelle): Developer Console ====================
  if (typeof extractViaDevConsole !== 'undefined') {
    console.log('%c🔍 Méthode 6: extractViaDevConsole (Developer Console iframe)', 'color: #666; font-style: italic');
    sessionId = await extractViaDevConsole();
    if (sessionId) {
      console.log('%c✅ SUCCÈS - Méthode 6: extractViaDevConsole', 'color: cyan; font-weight: bold; font-size: 13px; background: #e6ffff; padding: 3px 8px');
      console.log('   Session ID:', sessionId.substring(0, 30) + '...');
      cachedSessionId = sessionId;
      return sessionId;
    }
    console.log('%c❌ Méthode 6 échouée', 'color: #999');
  }
  
  // ==================== ÉCHEC TOTAL ====================
  console.log('%c❌ ÉCHEC: Aucune méthode n\'a réussi à extraire le Session ID', 'color: red; font-weight: bold; font-size: 14px; background: #ffe6e6; padding: 5px 10px');
  console.log('\n💡 Solutions possibles:');
  console.log('  1. Créer une page Visualforce avec {!$Api.Session_ID}');
  console.log('  2. Vérifier les permissions dans manifest.json');
  console.log('  3. Ouvrir la Developer Console et réessayer');
  debugLog('✗ Aucune méthode n\'a fonctionné');
  return null;
}

/**
 * Méthode 1: Cookie sid
 */
function extractFromCookie() {
  debugLog('Méthode 1: Extraction depuis cookie sid');
  const cookies = document.cookie.split(';');
  
  for (let cookie of cookies) {
    cookie = cookie.trim();
    if (cookie.startsWith('sid=')) {
      const sessionId = cookie.substring(4);
      if (sessionId.startsWith('00D')) {
        debugLog('✓ Session ID trouvé via cookie', sessionId.substring(0, 20) + '...');
        return sessionId;
      }
    }
  }
  
  debugLog('✗ Pas de cookie sid valide');
  return null;
}

/**
 * Méthode 2: Accès direct aux objets globaux de la page
 * Contourne le CSP en accédant directement aux objets window
 */
async function extractViaPageContext() {
  debugLog('Méthode 2: Extraction via objets globaux de la page');
  
  return new Promise((resolve) => {
    try {
      let sessionId = null;
      
      // Méthode 1: Tenter d'accéder à window.__CACHE__ via wrappedJSObject (Firefox) ou directement
      try {
        const cache = window.wrappedJSObject?.__CACHE__ || window.__CACHE__;
        if (cache && cache.sid) {
          sessionId = cache.sid;
          debugLog('✓ Session trouvée dans __CACHE__:', sessionId.substring(0, 20) + '...');
          resolve(sessionId);
          return;
        }
      } catch(e) {
        debugLog('__CACHE__ non accessible:', e.message);
      }
      
      // Méthode 2: Parser les scripts inline de la page pour trouver le token
      try {
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const content = script.textContent || script.innerText;
          
          // Chercher des patterns de Session ID
          const patterns = [
            /"sessionToken":"(00D[a-zA-Z0-9]{15,18})"/,
            /'sessionToken':'(00D[a-zA-Z0-9]{15,18})'/,
            /sid["\s:=]+"(00D[a-zA-Z0-9]{15,18})"/,
            /"sid":"(00D[a-zA-Z0-9]{15,18})"/,
            /token["\s:=]+"(00D[a-zA-Z0-9]{15,18})"/
          ];
          
          for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match && match[1]) {
              sessionId = match[1];
              debugLog('✓ Session trouvée via parsing script:', sessionId.substring(0, 20) + '...');
              resolve(sessionId);
              return;
            }
          }
        }
      } catch(e) {
        debugLog('Erreur parsing scripts:', e.message);
      }
      
      // Méthode 3: Chercher dans les meta tags
      try {
        const metas = document.querySelectorAll('meta[name*="session"], meta[name*="token"]');
        for (const meta of metas) {
          const content = meta.getAttribute('content') || '';
          if (content.startsWith('00D')) {
            sessionId = content;
            debugLog('✓ Session trouvée dans meta tag:', sessionId.substring(0, 20) + '...');
            resolve(sessionId);
            return;
          }
        }
      } catch(e) {
        debugLog('Erreur meta tags:', e.message);
      }
      
      // Méthode 4: Chercher dans localStorage/sessionStorage
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          const value = localStorage.getItem(key);
          
          if (value && typeof value === 'string') {
            // Chercher un pattern de Session ID
            const match = value.match(/00D[a-zA-Z0-9]{15,18}/);
            if (match) {
              sessionId = match[0];
              debugLog('✓ Session trouvée dans localStorage[' + key + ']:', sessionId.substring(0, 20) + '...');
              resolve(sessionId);
              return;
            }
          }
        }
        
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          const value = sessionStorage.getItem(key);
          
          if (value && typeof value === 'string') {
            const match = value.match(/00D[a-zA-Z0-9]{15,18}/);
            if (match) {
              sessionId = match[0];
              debugLog('✓ Session trouvée dans sessionStorage[' + key + ']:', sessionId.substring(0, 20) + '...');
              resolve(sessionId);
              return;
            }
          }
        }
      } catch(e) {
        debugLog('Erreur storage:', e.message);
      }
      
      debugLog('✗ Aucune session trouvée via page context');
      resolve(null);
      
    } catch (error) {
      debugLog('✗ Erreur page context:', error);
      resolve(null);
    }
  });
}

/**
 * Méthode 3: Via frontdoor.jsp (méthode Salesforce Inspector)
 * Cette méthode fonctionne très bien en Lightning
 */
async function extractViaFrontdoor() {
  debugLog('Méthode 3: Extraction via frontdoor.jsp');
  
  try {
    const instanceUrl = window.location.origin;
    const frontdoorUrl = `${instanceUrl}/secur/frontdoor.jsp?sid=&retURL=/services/data`;
    
    // Attendre un peu pour laisser le cookie se définir
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const response = await fetch(frontdoorUrl, {
      method: 'GET',
      credentials: 'include',
      redirect: 'follow'
    });
    
    // Attendre encore un peu
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Le frontdoor redirige et définit le cookie sid
    const cookieSessionId = extractFromCookie();
    if (cookieSessionId) {
      debugLog('✓ Session ID obtenu via frontdoor');
      return cookieSessionId;
    }
    
    debugLog('✗ Frontdoor n\'a pas défini de cookie');
    return null;
  } catch (error) {
    debugLog('✗ Erreur frontdoor:', error);
    return null;
  }
}

/**
 * Méthode 4: Via script injecté
 */
async function extractFromLightningAPIs() {
  debugLog('Méthode 4: Extraction via script injecté (Lightning API)');
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      debugLog('✗ Timeout script injecté');
      resolve(null);
    }, 5000);
    
    const listener = (event) => {
      clearTimeout(timeout);
      window.removeEventListener('foxlog_session_response', listener);
      
      const sessionId = event.detail?.sessionId;
      if (sessionId) {
        debugLog('✓ Session ID reçu du script injecté:', sessionId.substring(0, 20) + '...');
        resolve(sessionId);
      } else {
        debugLog('✗ Pas de session dans la réponse');
        resolve(null);
      }
    };
    
    window.addEventListener('foxlog_session_response', listener);
    window.dispatchEvent(new CustomEvent('foxlog_request_session'));
  });
}

/**
 * Méthode 5: Via background script avec accès aux cookies
 * Méthode prioritaire car peut accéder aux cookies HttpOnly
 */
async function extractViaBackground() {
  debugLog('Méthode 5: Extraction via background script (Chrome Cookies API)');
  
  try {
    return new Promise((resolve, reject) => {
      // Timeout de 5 secondes
      const timeout = setTimeout(() => {
        debugLog('⚠️ Timeout: background script ne répond pas');
        resolve(null);
      }, 5000);
      
      chrome.runtime.sendMessage({
        action: 'getSessionId',
        url: window.location.href  // ✅ Passer l'URL actuelle pour cibler my.salesforce.com
      }, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          debugLog('✗ Erreur Chrome runtime:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        
        if (response && response.sessionId) {
          debugLog('✅ Session ID obtenu via background (Chrome Cookies API)');
          debugLog('   Longueur:', response.sessionId.length, 'caractères');
          debugLog('   Début:', response.sessionId.substring(0, 20) + '...');
          resolve(response.sessionId);
        } else {
          debugLog('✗ Background n\'a pas trouvé de cookie sid');
          resolve(null);
        }
      });
    });
  } catch (error) {
    debugLog('✗ Erreur extractViaBackground:', error);
    return null;
  }
}

// Méthode 6: Forcer la session via Developer Console (iframe invisible)
async function extractViaDevConsole() {
  debugLog('Méthode 6: Extraction via Developer Console iframe');
  
  return new Promise((resolve) => {
    try {
      // Créer un iframe invisible vers la Developer Console
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.style.width = '0';
      iframe.style.height = '0';
      
      const instanceUrl = window.location.origin.replace('lightning.force.com', 'my.salesforce.com');
      iframe.src = `${instanceUrl}/_ui/common/apex/debug/ApexCSIPage`;
      
      // Timeout de 3 secondes
      const timeout = setTimeout(() => {
        document.body.removeChild(iframe);
        debugLog('✗ Timeout Developer Console iframe');
        resolve(null);
      }, 3000);
      
      // Quand l'iframe charge, attendre un peu puis chercher le cookie
      iframe.onload = async () => {
        await new Promise(r => setTimeout(r, 500));
        
        clearTimeout(timeout);
        document.body.removeChild(iframe);
        
        // Maintenant le cookie devrait exister sur my.salesforce.com
        const sessionId = await extractViaBackground();
        
        if (sessionId) {
          debugLog('✓ Session ID obtenu via Developer Console iframe');
          resolve(sessionId);
        } else {
          debugLog('✗ Pas de session même après Developer Console iframe');
          resolve(null);
        }
      };
      
      iframe.onerror = () => {
        clearTimeout(timeout);
        document.body.removeChild(iframe);
        debugLog('✗ Erreur Developer Console iframe');
        resolve(null);
      };
      
      document.body.appendChild(iframe);
      
    } catch (error) {
      debugLog('✗ Erreur création iframe:', error);
      resolve(null);
    }
  });
}


// Extraction de l'User ID
function extractUserId() {
  // 1. UserContext
  if (window.UserContext && window.UserContext.userId) {
    return window.UserContext.userId;
  }
  // 2. $A (Aura)
  if (typeof window.$A !== 'undefined' && window.$A.get) {
    try {
      const auraId = window.$A.get('$SObjectType.CurrentUser.Id');
      if (auraId) return auraId;
    } catch(e) {}
  }
  // 3. Script injecté (si extension injecte l'ID)
  if (window.FoxLogUserId) {
    return window.FoxLogUserId;
  }
  // 4. Chercher dans les scripts inline
  try {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const content = script.textContent || script.innerText;
      const match = content.match(/userId["':\s=]+([a-zA-Z0-9]{15,18})/);
      if (match && match[1]) return match[1];
    }
  } catch(e) {}
  // 5. Chercher dans meta tags
  try {
    const metas = document.querySelectorAll('meta[name*="user"], meta[name*="userid"]');
    for (const meta of metas) {
      const content = meta.getAttribute('content') || '';
      if (/^[a-zA-Z0-9]{15,18}$/.test(content)) return content;
    }
  } catch(e) {}
  // 6. Rien trouvé
  return null;
}

// Fonction pour récupérer l'User ID
async function getCurrentUserId() {
  debugLog('Récupération de l\'User ID...');
  
  // MÉTHODE 1: Utiliser extractUserId() directement (plus fiable)
  const directUserId = extractUserId();
  if (directUserId) {
    debugLog('✅ User ID récupéré via extractUserId():', directUserId);
    return directUserId;
  }
  
  // MÉTHODE 2: Essayer via le script injecté (fallback)
  return new Promise((resolve) => {
    debugLog('Tentative de récupération via script injecté...');
    
    // Timeout de 3 secondes (réduit de 5 à 3)
    const timeout = setTimeout(() => {
      debugLog('⚠️ Timeout: User ID non récupéré via script injecté');
      
      // FALLBACK: Essayer d'extraire depuis l'URL ou le DOM
      const urlUserId = extractUserIdFromUrl();
      if (urlUserId) {
        debugLog('✅ User ID extrait depuis URL:', urlUserId);
        resolve(urlUserId);
      } else {
        debugLog('❌ Impossible de récupérer l\'User ID');
        resolve(null);
      }
    }, 3000);
    
    // Écouter la réponse du script injecté
    const listener = (event) => {
      clearTimeout(timeout);
      window.removeEventListener('foxlog_userid_response', listener);
      
      const userId = event.detail?.userId;
      if (userId) {
        debugLog('✅ User ID récupéré via script injecté:', userId);
        resolve(userId);
      } else {
        debugLog('❌ User ID non trouvé dans la réponse du script injecté');
        resolve(null);
      }
    };
    
    window.addEventListener('foxlog_userid_response', listener);
    
    // Demander l'User ID au script injecté
    window.dispatchEvent(new CustomEvent('foxlog_request_userid'));
  });
}

// Fonction helper pour extraire l'User ID depuis l'URL ou le contexte
function extractUserIdFromUrl() {
  try {
    // Méthode 1: Depuis window.USER_CONTEXT (parfois disponible)
    if (window.USER_CONTEXT && window.USER_CONTEXT.userId) {
      return window.USER_CONTEXT.userId;
    }
    
    // Méthode 2: Depuis les meta tags
    const metaTags = document.querySelectorAll('meta[name*="user"], meta[property*="user"]');
    for (const meta of metaTags) {
      const content = meta.getAttribute('content') || '';
      // Les User ID Salesforce commencent par 005 et font 15 ou 18 caractères
      if (/^005[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/.test(content)) {
        return content;
      }
    }
    
    // Méthode 3: Depuis le DOM (script tags)
    const scripts = document.querySelectorAll('script:not([src])');
    for (const script of scripts) {
      const text = script.textContent || '';
      // Chercher des patterns comme "userId":"005..."
      const match = text.match(/"userId"\s*:\s*"(005[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?)"/);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  } catch (error) {
    debugLog('Erreur extractUserIdFromUrl:', error);
    return null;
  }
}

// Récupération des logs depuis l'API Salesforce
async function fetchDebugLogs(sessionId, userId) {
  try {
    debugLog('Récupération des logs pour userId:', userId);
    
    // Construire l'URL de base (my.salesforce.com ou instance)
    const hostname = window.location.hostname;
    let baseUrl = window.location.origin;
    
    // Si on est sur lightning.force.com, basculer vers my.salesforce.com
    if (hostname.includes('lightning.force.com')) {
      baseUrl = baseUrl.replace('lightning.force.com', 'my.salesforce.com');
    }
    
    // Query SOQL pour récupérer les ApexLog
    const query = `SELECT Id, StartTime, DurationMilliseconds, Operation, Status, LogLength, LogUserId, Request, Application
                   FROM ApexLog 
                   WHERE LogUserId = '${userId}' 
                   ORDER BY StartTime DESC 
                   LIMIT 20`;
    
    const url = `${baseUrl}/services/data/v59.0/tooling/query/?q=${encodeURIComponent(query)}`;
    
    debugLog('URL API:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionId}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    debugLog('Logs récupérés:', data.records?.length || 0);
    
    return data.records || [];
    
  } catch (error) {
    console.error('[FoxLog] Erreur fetchDebugLogs:', error);
    return [];
  }
}


// Mise à jour du statut
function updateStatus(text, type = 'info') {
  const statusText = document.getElementById('sf-status-text');
  const statusIndicator = document.getElementById('sf-status-indicator');
  
  if (statusText) statusText.textContent = text;
  
  if (statusIndicator) {
    statusIndicator.className = 'sf-status-' + 
      (type === 'connected' ? 'connected' : 
       type === 'error' ? 'error' : 
       type === 'warning' ? 'warning' : 'disconnected');
  }
}

// Afficher un message d'erreur dans le panel
function showError(message) {
  debugLog('Affichage erreur:', message);
  updateStatus('error', message);
  
  // Optionnel: afficher aussi dans le panel de logs
  const logsContainer = document.getElementById('sf-logs-container');
  if (logsContainer) {
    logsContainer.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #dc2626;">
        <div style="font-size: 32px; margin-bottom: 10px;">⚠️</div>
        <div style="font-weight: 600; margin-bottom: 5px;">Erreur</div>
        <div style="font-size: 13px; color: #666;">${message}</div>
      </div>
    `;
  }
}

// Afficher un message d'info dans le panel
function showInfo(message) {
  debugLog('Affichage info:', message);
  updateStatus('info', message);
  
  // Optionnel: afficher aussi dans le panel de logs
  const logsContainer = document.getElementById('sf-logs-container');
  if (logsContainer) {
    logsContainer.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #0176d3;">
        <div style="font-size: 32px; margin-bottom: 10px;">ℹ️</div>
        <div style="font-weight: 600; margin-bottom: 5px;">Information</div>
        <div style="font-size: 13px; color: #666;">${message}</div>
      </div>
    `;
  }
}

// Afficher un message de succès
function showSuccess(message) {
  debugLog('Affichage succès:', message);
  updateStatus('success', message);
}

// Affichage des logs
function displayLogs(logs) {
  debugLog('Affichage de', logs.length, 'logs');
  
  logs.forEach(log => {
    const timestamp = new Date(log.StartTime).toLocaleString('fr-FR');
    const duration = log.DurationMilliseconds || 'N/A';
    const status = log.Status || 'INFO';
    
    const message = `${log.Operation || 'Operation'} - ${log.Request || 'No request'} (${duration}ms)`;
    const details = {
      user: log.LogUserId,
      application: log.Application,
      logId: log.Id,
      size : log.LogLength
    };
    
    addLogEntry(status, message, details, timestamp);
  });
}

// Ajouter une entrée de log
function addLogEntry(level, message, details = {}, customTimestamp = null) {
    const container = document.getElementById('sf-logs-container');
    if (!container) return;
    
    const emptyState = container.querySelector('.sf-empty-state');
    if (emptyState) emptyState.remove();
    
    const logEntry = document.createElement('div');
    logEntry.className = 'sf-log-entry sf-log-live';
    logEntry.dataset.level = level;
    
    const timestamp = customTimestamp || new Date().toLocaleTimeString('fr-FR');
    
    let detailsHtml = '';
    if (details.user) detailsHtml += `<div class="sf-log-user">User: ${details.user}</div>`;
    if (details.application && details.size) detailsHtml += `<div class="sf-log-app">App: ${details.application} - Size: ${details.size}B</div>`;
    
    // Créer le bouton sans onclick inline
    let buttonHtml = '';
    if (details.logId) {
        buttonHtml = `<button class="sf-view-details" data-log-id="${details.logId}">Details</button>`;
    }
    
    logEntry.innerHTML = `
        <div class="sf-log-header">
            <span class="sf-log-level ${level}">${level}</span>
            <span class="sf-log-time">${timestamp}</span>
        </div>
        <div class="sf-log-body">
            <div class="sf-log-message">${message}</div>
            ${detailsHtml}
            ${buttonHtml}
        </div>
    `;
    
    // Attacher l'événement après création du DOM
    if (details.logId) {
        const button = logEntry.querySelector('.sf-view-details');
        button.addEventListener('click', () => {
            window.viewLogDetails(details.logId);
        });
    }
    
    container.insertBefore(logEntry, container.firstChild);
    logCount++;
    
    const entries = container.querySelectorAll('.sf-log-entry');
    if (entries.length > CONFIG.MAX_LOGS) {
        entries[entries.length - 1].remove();
        logCount--;
    }
    
    updateLogCount(logCount);
    updateLastUpdate();
    debugLog('Log ajouté:', level, message);
}

// Filtrer les logs
function filterLogs() {
  const filterText = document.getElementById('sf-log-filter').value.toLowerCase();
  const levelFilter = document.getElementById('sf-log-level').value;
  
  const entries = document.querySelectorAll('.sf-log-entry');
  let visibleCount = 0;
  
  entries.forEach(entry => {
    const text = entry.textContent.toLowerCase();
    const level = entry.dataset.level || '';
    
    const matchesText = !filterText || text.includes(filterText);
    const matchesLevel = levelFilter === 'all' || level === levelFilter;
    
    if (matchesText && matchesLevel) {
      entry.style.display = '';
      visibleCount++;
    } else {
      entry.style.display = 'none';
    }
  });
  
  updateLogCount(visibleCount);
}

// Effacer les logs
function clearLogs() {
  const container = document.getElementById('sf-logs-container');
  container.innerHTML = '<div class="sf-empty-state"><p>Logs effacés</p><p class="sf-hint">Les nouveaux logs apparaîtront ici</p></div>';
  logCount = 0;
  updateLogCount(0);
  debugLog('Logs effacés');
}

// Mettre à jour le compteur
function updateLogCount(count) {
  const elem = document.getElementById('sf-log-count');
  if (elem) elem.textContent = `${count} log${count > 1 ? 's' : ''}`;
}

// Mettre à jour l'heure de dernière mise à jour
function updateLastUpdate() {
  const elem = document.getElementById('sf-last-update');
  if (elem) {
    const now = new Date().toLocaleTimeString('fr-FR');
    elem.textContent = `Mis à jour: ${now}`;
  }
}

// Voir les détails d'un log
window.viewLogDetails = async function(logId) {
  debugLog('Demande de détails pour log:', logId);
  
  try {
    // Afficher un mini-spinner dans le statut
    updateStatus('Chargement des détails...', 'info');
    
    const sessionId = await extractSessionId();
    if (!sessionId) {
      addLogEntry('ERROR', 'Session ID manquant - Impossible de récupérer les détails');
      updateStatus('Erreur', 'error');
      return;
    }
    
    const hostname = window.location.hostname;
    let instanceUrl = window.location.origin;

    // Si on est sur lightning.force.com, basculer vers my.salesforce.com
    if (hostname.includes('lightning.force.com')) {
      instanceUrl = instanceUrl.replace('lightning.force.com', 'my.salesforce.com');
    }
    const response = await fetch(`${instanceUrl}/services/data/v59.0/tooling/sobjects/ApexLog/${logId}/Body`, {
      headers: {
        'Authorization': `Bearer ${sessionId}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const logBody = await response.text();
      updateStatus('Détails chargés', 'connected');
      showLogModal(logBody);
    } else {
      addLogEntry('ERROR', 'Impossible de récupérer les détails du log');
      updateStatus('Erreur', 'error');
    }
  } catch (error) {
    debugLog('Erreur lors de la récupération des détails:', error);
    addLogEntry('ERROR', 'Erreur: ' + error.message);
    updateStatus('Erreur', 'error');
  }
};

// Afficher une modal avec le contenu du log
function showLogModal(content) {
    // Retirer l'ancienne modal si elle existe
    const existingModal = document.querySelector('.sf-log-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.className = 'sf-log-modal';
    
    // Ne pas utiliser onclick inline - CSP violation
    modal.innerHTML = `
        <div class="sf-modal-content">
            <div class="sf-modal-header">
                <h3>Détails du log Salesforce</h3>
                <button class="sf-modal-close-btn">×</button>
            </div>
            <pre class="sf-modal-body">${content}</pre>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Attacher les event listeners après création du DOM
    const closeBtn = modal.querySelector('.sf-modal-close-btn');
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });
    
    // Cliquer en dehors pour fermer
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    debugLog('Modal affichée avec z-index maximum');
}

// Récupérer et afficher la version de l'extension
async function displayExtensionVersion() {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getExtensionVersion' });
      if (response && response.version) {
        const versionElement = document.getElementById('sf-version-display');
        if (versionElement) {
          versionElement.textContent = `v${response.version}`;
        }
      }
    } catch (error) {
      debugLog("Impossible de récupérer la version de l'extension", error);
    }
  }
}

// Ajout d'un indicateur de statut pour l'extraction du Session ID
function addStatusIndicator() {
  const statusDiv = document.querySelector('.sf-panel-status');
  if (statusDiv && !document.getElementById('sf-session-status')) {
    const sessionStatus = document.createElement('span');
    sessionStatus.id = 'sf-session-status';
    sessionStatus.style.fontSize = '11px';
    sessionStatus.style.marginLeft = '10px';
    statusDiv.appendChild(sessionStatus);
  }
}

// ========== FONCTIONS SPINNER DE CHARGEMENT ==========

/**
 * Afficher le spinner de chargement
 * @param {string} message - Message principal à afficher
 * @param {string} subtext - Sous-texte optionnel
 */
function showLoadingSpinner(message = 'Chargement...', subtext = '') {
  const container = document.getElementById('sf-logs-container');
  if (!container) return;
  
  // Supprimer le spinner existant si présent
  hideLoadingSpinner();
  
  const spinner = document.createElement('div');
  spinner.className = 'sf-loading-overlay';
  spinner.id = 'sf-loading-spinner';
  
  spinner.innerHTML = `
    <div class="sf-spinner"></div>
    <div class="sf-loading-text">${message}</div>
    ${subtext ? `<div class="sf-loading-subtext">${subtext}</div>` : ''}
  `;
  
  container.appendChild(spinner);
  debugLog('🔄 Spinner affiché:', message);
}

/**
 * Masquer le spinner de chargement
 */
function hideLoadingSpinner() {
  const spinner = document.getElementById('sf-loading-spinner');
  if (spinner) {
    spinner.remove();
    debugLog('✅ Spinner masqué');
  }
}

// ========== PRÉCHARGEMENT DES LOGS EN ARRIÈRE-PLAN ==========

/**
 * Précharger les logs en arrière-plan (sans ouvrir le panel)
 * Cette fonction s'exécute automatiquement au chargement de la page
 */
async function preloadLogsInBackground() {
  try {
    debugLog('🔄 Préchargement des logs en arrière-plan...');
    
    // Forcer la session sur my.salesforce.com
    await ensureMySalesforceSession();
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Récupérer l'User ID
    const userId = await getCurrentUserId();
    if (!userId) {
      debugLog('⚠️ Impossible de précharger : User ID non trouvé');
      return;
    }
    cachedUserId = userId;
    debugLog('✅ User ID en cache:', userId);
    
    // Récupérer le Session ID
    const sessionId = await extractViaBackground();
    if (!sessionId) {
      debugLog('⚠️ Impossible de précharger : Session ID non trouvé');
      return;
    }
    cachedSessionId = sessionId;
    debugLog('✅ Session ID en cache');
    
    // Récupérer les logs
    const logs = await fetchDebugLogs(sessionId, userId);
    if (logs && logs.length > 0) {
      cachedLogs = logs;
      lastFetchTime = Date.now();
      debugLog(`✅ ${logs.length} log(s) préchargé(s) en arrière-plan`);
      
      // Mettre à jour le badge (optionnel - nombre de logs)
      updateBadge(logs.length);
    } else {
      debugLog('ℹ️ Aucun log à précharger');
    }
    
  } catch (error) {
    debugLog('❌ Erreur préchargement:', error);
  }
}

/**
 * Vérifier si le cache est encore valide
 */
function isCacheValid() {
  if (!cachedLogs || !lastFetchTime) return false;
  const cacheAge = Date.now() - lastFetchTime;
  const isValid = cacheAge < CACHE_DURATION;
  debugLog(`🔍 Cache valide: ${isValid} (âge: ${Math.round(cacheAge / 1000)}s)`);
  return isValid;
}

/**
 * Mettre à jour le badge du bouton avec le nombre de logs
 */
function updateBadge(count) {
  const button = document.getElementById('sf-debug-toggle');
  if (!button) return;
  
  // Supprimer l'ancien badge si existant
  const oldBadge = button.querySelector('.sf-badge');
  if (oldBadge) oldBadge.remove();
  
  if (count > 0) {
    const badge = document.createElement('div');
    badge.className = 'sf-badge';
    badge.textContent = count > 99 ? '99+' : count;
    button.appendChild(badge);
  }
}

// Initialisation
function init() {
  debugLog('=== Initialisation de FoxLog ===');
  debugLog('URL:', window.location.href);
  
  if (!isSalesforcePage()) {
    debugLog('Pas une page Salesforce - Extension désactivée');
    return;
  }
  
  debugLog('Page Salesforce détectée - Initialisation de l\'UI');
  
  try {
    createFloatingButton();
    createPanel();
    displayExtensionVersion();
    addStatusIndicator();
    debugLog('=== FoxLog initialisé avec succès ===');
    
    // ✅ PRÉCHARGER LES LOGS EN ARRIÈRE-PLAN
    // Attendre 2 secondes que la page soit bien chargée
    setTimeout(() => {
      preloadLogsInBackground();
    }, 2000);

  } catch (error) {
    debugLog('❌ Erreur lors de l\'initialisation:', error);
  }
}

// Démarrage
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
