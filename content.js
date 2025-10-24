// Configuration
const CONFIG = {
  AUTO_REFRESH_INTERVAL: 30000, // 30 secondes
  MAX_LOGS: 100,
  DEBUG_MODE: true
};

// Définir l'URL absolue des icône FoxLog
const FOXLOG_ICON_URL = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
  ? chrome.runtime.getURL('icon128.png') : 'icon128.png';
const TAIL_ICON_URL = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
  ? chrome.runtime.getURL('tail128.png') : 'tail128.png';
const TRASH_ICON_URL = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
  ? chrome.runtime.getURL('trash.png') : 'trash.png';
const REFRESH_ICON_URL = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
  ? chrome.runtime.getURL('refresh.png') : 'refresh.png';

// Variables globales
let logCount = 0;
let monitoringInterval = null;
let cachedSessionId = null;
let cachedUserId = null;
let cachedLogs = null;
let lastFetchTime = null;
const CACHE_DURATION = 30000; // 30 secondes
const REFRESH_INTERVAL = 10000; // 10 secondes

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

//let logParser = null;

// Charger le script log-parser.js
/*function loadParser() {
    try {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('log-parser.js');
        script.onload = function() {
            debugLog('✅ Parser chargé avec succès');
            this.remove();
        };
        script.onerror = function() {
            debugLog('❌ Erreur lors du chargement de log-parser.js');
            this.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    } catch (error) {
        debugLog('❌ Erreur chargement parser:', error);
    }
}*/

let parserInstance = null;

function getParser() {
    if (!parserInstance && typeof window.SalesforceLogParser !== 'undefined') {
        try {
            parserInstance = new window.SalesforceLogParser();
            debugLog('LogParser initialisé');
        } catch (error) {
            debugLog('Erreur initialisation parser', error);
            return null;
        }
    }
    return parserInstance;
}

// Appeler au chargement
if (isSalesforcePage()) {
  injectScript();
  //loadParser();
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
  if (monitoringInterval) return;
  
  debugLog('🔄 Auto-refresh activé (60s)');
  monitoringInterval = setInterval(async () => {
    const panel = document.getElementById('sf-debug-panel');
    if (panel && panel.classList.contains('sf-panel-open')) {
      debugLog('🔄 Auto-refresh des logs...');
      lastFetchTime = null;
      await loadLogs(false, true);
    }
  }, REFRESH_INTERVAL);
}

// Arrêter le monitoring
function stopMonitoring() {
  if (monitoringInterval) {
    debugLog('Monitoring arrêté');
    updateStatus('Prêt', 'disconnected');
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
}

// Toggle panel
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
    loadLogs();
    startAutoRefresh();
    debugLog('Panel ouvert');
  }
}

// Charger les logs (avec cache intelligent)
async function loadLogs(forceRefresh = false, autoRefresh = false) {
  try {
    if (!forceRefresh && isCacheValid() && cachedLogs && cachedLogs.raw) {
      debugLog('✅ Utilisation du cache (logs préchargés)');
      
      // Vérifier que c'est un tableau
      if (Array.isArray(cachedLogs.raw)) {
        displayLogs(cachedLogs.raw);
        showSuccess(`${cachedLogs.raw.length} log(s) chargé(s) (cache)`);
        updateStatus('Prêt', 'connected');
        return;
      } else {
        // Cache invalide, forcer le rechargement
        debugLog('⚠️ Cache invalide, rechargement');
        cachedLogs = null;
        lastFetchTime = null;
      }
    }
    
    debugLog('🔄 Chargement des logs depuis l\'API...');
    await startMonitoring(autoRefresh);
    
  } catch (error) {
    console.error('[FoxLog] Erreur loadLogs:', error);
    showError('Erreur: ' + error.message);
  }
}

// Démarrer le monitoring
async function startMonitoring(autoRefresh = false) {
  try {
    debugLog('Démarrage du monitoring...');
    
    if (!autoRefresh) {
      showLoadingSpinner('Initialisation...', 'Connexion à Salesforce');
    }
    
    let userId = cachedUserId;
    let sessionId = cachedSessionId;
    
    if (!userId || !sessionId) {
      // Récupérer l'User ID
      if (!autoRefresh) {
        showLoadingSpinner('Authentification...', 'Récupération de l\'identifiant utilisateur');
      }
      userId = await getCurrentUserId();
      if (!userId) {
        hideLoadingSpinner();
        showError('Impossible de récupérer l\'User ID');
        return;
      }
      cachedUserId = userId;
      debugLog('User ID obtenu:', userId);
      
      // Récupérer le Session ID
      if (!autoRefresh) {
        showLoadingSpinner('Authentification...', 'Récupération du token de session');
      }
      sessionId = await extractSessionId();
      
      // ✅ Si pas de Session ID, forcer la création puis réessayer
      if (!sessionId) {
        debugLog('⚠️ Pas de Session ID, tentative de création via my.salesforce.com...');
        if (!autoRefresh) {
          showLoadingSpinner('Connexion...', 'Établissement de la session Salesforce');
        }
        await ensureMySalesforceSession();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Réessayer après avoir forcé la session
        sessionId = await extractSessionId();
        
        if (!sessionId) {
          hideLoadingSpinner();
          showError('Impossible de récupérer le Session ID. Essayez d\'ouvrir la Developer Console puis rechargez.');
          return;
        }
      }
      
      debugLog('✅ Session ID obtenu:', sessionId.substring(0, 30) + '...');
      cachedSessionId = sessionId;
    } else {
      debugLog('✅ Utilisation des credentials en cache');
    }
    
    // Récupérer les logs
    if (!autoRefresh) {
      showLoadingSpinner('Chargement des logs...', 'Requête vers l\'API Salesforce');
    }
    const logs = await fetchDebugLogs(sessionId, userId);
    
    const parsedLogs = [];
    if (logs && logs.length > 0 && getParser()) {
      for (const log of logs) {
        parsedLogs.push({
          metadata: log,
          parsed: null,
          summary: {
            id: log.Id,
            operation: log.Operation,
            status: log.Status,
            duration: log.DurationMilliseconds,
            logLength: log.LogLength
          }
        });
      }
    }

    cachedLogs = {
      raw: logs,
      parsed: parsedLogs
    };
    lastFetchTime = Date.now();
    
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

// Rafraîchissement manuel
async function manualRefresh() {
  debugLog('Rafraîchissement manuel demandé');
  
  cachedLogs = null;
  cachedSessionId = null;
  cachedUserId = null;
  lastFetchTime = null;
  
  clearLogs();
  await loadLogs(true);
}

// ============================================
// EXTRACTION SESSION ID - VERSION SIMPLIFIÉE
// ============================================

// Forcer la création du cookie sur my.salesforce.com (méthode non-intrusive)
async function ensureMySalesforceSession() {
  debugLog('🔄 Forçage session my.salesforce.com...');
  
  return new Promise((resolve) => {
    try {
      const currentUrl = window.location.hostname;
      const mySfUrl = `https://${currentUrl.replace('lightning.force.com', 'my.salesforce.com')}`;
      
      debugLog('URL my.salesforce.com:', mySfUrl);
      
      // ✅ SOLUTION: Utiliser une image au lieu d'un iframe
      // Cela déclenche une requête vers my.salesforce.com sans risque de refresh
      const img = document.createElement('img');
      img.style.display = 'none';
      img.style.width = '1px';
      img.style.height = '1px';
      img.id = 'foxlog-mysf-trigger';
      
      let resolved = false;
      
      // Timeout de 2 secondes (réduit de 3 à 2)
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            document.body.removeChild(img);
          } catch(e) {}
          debugLog('✓ Session my.salesforce.com forcée (timeout)');
          resolve(true);
        }
      }, 2000);
      
      img.onload = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          try {
            document.body.removeChild(img);
          } catch(e) {}
          debugLog('✓ Session my.salesforce.com forcée (onload)');
          resolve(true);
        }
      };
      
      img.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          try {
            document.body.removeChild(img);
          } catch(e) {}
          debugLog('✓ Session my.salesforce.com forcée (onerror - normal)');
          resolve(true); // Résoudre même en cas d'erreur (l'important c'est la requête)
        }
      };
      
      document.body.appendChild(img);
      // Charger une ressource inexistante pour déclencher la requête + cookies
      img.src = `${mySfUrl}/favicon.ico?t=${Date.now()}`;
      
    } catch (error) {
      debugLog('✗ Erreur ensureMySalesforceSession:', error);
      resolve(false);
    }
  });
}

/**
 * Extraction Session ID - VERSION SIMPLIFIÉE
 * 2 méthodes uniquement (comme Salesforce Inspector)
 */
async function extractSessionId() {
  console.log('%c⚡ EXTRACTION SESSION ID', 'background: #0176d3; color: white; font-weight: bold; padding: 4px 8px; font-size: 13px');
  
  if (cachedSessionId) {
    console.log('%c✅ SESSION TROUVÉE DANS LE CACHE', 'color: green; font-weight: bold; font-size: 12px');
    return cachedSessionId;
  }
  
  let sessionId = null;
  
  // MÉTHODE 1 (PRIORITAIRE): Chrome Cookies API via Background
  console.log('%c🔍 Méthode 1: Chrome Cookies API', 'color: #666; font-style: italic');
  sessionId = await extractViaBackground();
  if (sessionId) {
    console.log('%c✅ SUCCÈS - Chrome Cookies API', 'color: purple; font-weight: bold; font-size: 13px; background: #f3e6ff; padding: 3px 8px');
    console.log('   Session ID:', sessionId.substring(0, 30) + '...');
    cachedSessionId = sessionId;
    return sessionId;
  }
  console.log('%c❌ Méthode 1 échouée', 'color: #999');
  
  // MÉTHODE 2: Script injecté (Aura Token)
  console.log('%c🔍 Méthode 2: Script injecté (Aura)', 'color: #666; font-style: italic');
  sessionId = await extractFromLightningAPIs();
  if (sessionId) {
    console.log('%c✅ SUCCÈS - Token Aura', 'color: blue; font-weight: bold; font-size: 13px; background: #e6f2ff; padding: 3px 8px');
    console.log('   Session ID:', sessionId.substring(0, 30) + '...');
    cachedSessionId = sessionId;
    return sessionId;
  }
  console.log('%c❌ Méthode 2 échouée', 'color: #999');
  
  // ÉCHEC
  console.log('%c❌ ÉCHEC: Aucune méthode n\'a réussi', 'color: red; font-weight: bold; font-size: 14px; background: #ffe6e6; padding: 5px 10px');
  debugLog('✗ Impossible de récupérer le Session ID');
  return null;
}

/**
 * Méthode 1: Chrome Cookies API (via background script)
 */
async function extractViaBackground() {
  debugLog('Méthode 1: Chrome Cookies API');
  
  try {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        debugLog('⚠️ Timeout: background script ne répond pas');
        resolve(null);
      }, 5000);
      
      chrome.runtime.sendMessage({
        action: 'getSessionId',
        url: window.location.href
      }, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          debugLog('✗ Erreur Chrome runtime:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        
        if (response && response.sessionId) {
          debugLog('✅ Session ID obtenu via Chrome Cookies API');
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

/**
 * Méthode 2: Script injecté (Aura Token)
 */
async function extractFromLightningAPIs() {
  debugLog('Méthode 2: Script injecté (Aura Token)');
  
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

// ============================================
// EXTRACTION USER ID - VERSION SIMPLIFIÉE
// ============================================

/**
 * Récupérer l'User ID
 * 2 méthodes uniquement
 */
async function getCurrentUserId() {
  debugLog('Récupération de l\'User ID...');
  
  // MÉTHODE 1: Via window.UserContext (Lightning)
  if (window.UserContext && window.UserContext.userId) {
    debugLog('✅ User ID via UserContext:', window.UserContext.userId);
    return window.UserContext.userId;
  }
  
  // MÉTHODE 2: Via script injecté (Aura)
  return new Promise((resolve) => {
    debugLog('Tentative via script injecté...');
    
    const timeout = setTimeout(() => {
      debugLog('⚠️ Timeout: User ID non récupéré');
      resolve(null);
    }, 3000);
    
    const listener = (event) => {
      clearTimeout(timeout);
      window.removeEventListener('foxlog_userid_response', listener);
      
      const userId = event.detail?.userId;
      if (userId) {
        debugLog('✅ User ID via script injecté:', userId);
        resolve(userId);
      } else {
        debugLog('❌ User ID non trouvé');
        resolve(null);
      }
    };
    
    window.addEventListener('foxlog_userid_response', listener);
    window.dispatchEvent(new CustomEvent('foxlog_request_userid'));
  });
}

// Récupération des logs depuis l'API Salesforce
async function fetchDebugLogs(sessionId, userId) {
  try {
    debugLog('Récupération des logs pour userId:', userId);
    
    const hostname = window.location.hostname;
    let baseUrl = window.location.origin;
    
    if (hostname.includes('lightning.force.com')) {
      baseUrl = baseUrl.replace('lightning.force.com', 'my.salesforce.com');
    }
    
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

// Afficher un message d'erreur
function showError(message) {
  debugLog('Affichage erreur:', message);
  updateStatus('error', message);
  
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

// Afficher un message d'info
function showInfo(message) {
  debugLog('Affichage info:', message);
  updateStatus('info', message);
  
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
    // Vérifier que logs est un tableau
    if (!logs || !Array.isArray(logs)) {
        debugLog('displayLogs: logs invalide', logs);
        showInfo('Aucun log disponible');
        return;
    }
    
    if (logs.length === 0) {
        showInfo('Aucun debug log trouvé');
        return;
    }
    
    debugLog(`Affichage de ${logs.length} logs`);
    
    logs.forEach(log => {
        const timestamp = new Date(log.StartTime).toLocaleString('fr-FR');
        const duration = log.DurationMilliseconds || 'N/A';
        const status = log.Status || 'INFO';
        const message = `${log.Operation} - ${log.Request || 'No request'} (${duration}ms)`;
        const details = {
            user: log.LogUserId,
            application: log.Application,
            logId: log.Id,
            size: log.LogLength
        };
        addLogEntry(status, message, details, timestamp);
    });
    
    filterLogs();
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
    console.log('🔍 viewLogDetails appelée avec logId:', logId);
    
    try {
        updateStatus('Chargement des détails...', 'info');
        const sessionId = await extractSessionId();
        
        console.log('🔑 Session ID:', sessionId ? 'OK' : 'MANQUANT');
        
        if (!sessionId) {
            showError('Session ID manquant');
            return;
        }

        const hostname = window.location.hostname;
        let instanceUrl = window.location.origin;
        if (hostname.includes('lightning.force.com')) {
            instanceUrl = instanceUrl.replace('lightning.force.com', 'my.salesforce.com');
        }

        const response = await fetch(`${instanceUrl}/services/data/v59.0/tooling/sobjects/ApexLog/${logId}/Body`, {
            headers: {
                'Authorization': `Bearer ${sessionId}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        });

        console.log('📡 Response status:', response.status);

        if (response.ok) {
            const logBody = await response.text();
            
            console.log('📄 Log body reçu, longueur:', logBody.length);
            console.log('🔍 getParser():', getParser());
            console.log('📦 cachedLogs:', cachedLogs);
            
            // PARSER LE LOG si le parser est disponible
            if (getParser() && cachedLogs) {
                console.log('✅✅✅ BRANCHE PARSED - showParsedLogModal VA ÊTRE APPELÉE');
                
                showLoadingSpinner('Analyse du log...', 'Parsing en cours');
                const logMetadata = cachedLogs.raw.find(l => l.Id === logId);
                
                console.log('🏷️ logMetadata:', logMetadata);
                
                const parsedLog = getParser().parse(logBody, logMetadata);
                
                console.log('✅ Log parsé:', parsedLog);
                console.log('📊 Stats:', parsedLog.stats);
                
                hideLoadingSpinner();
                updateStatus('Détails chargés', 'connected');
                
                console.log('🚀 Appel de showParsedLogModal...');
                showParsedLogModal(parsedLog);
                console.log('✅ showParsedLogModal appelée');
            } else {
                console.log('❌❌❌ BRANCHE NON-PARSED - showLogModal VA ÊTRE APPELÉE');
                console.log('Raison: getParser() =', getParser(), 'cachedLogs =', cachedLogs);
                
                hideLoadingSpinner();
                updateStatus('Détails chargés', 'connected');
                showLogModal(logBody);
            }
        } else {
            console.log('❌ Erreur response:', response.status, response.statusText);
            showError('Impossible de récupérer les détails du log');
        }
    } catch (error) {
        console.error('❌ Erreur dans viewLogDetails:', error);
        debugLog('Erreur lors de la récupération des détails', error);
        showError('Erreur: ' + error.message);
    }
};

// Afficher une modal avec le contenu du log
function showLogModal(content) {
  const existingModal = document.querySelector('.sf-log-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  const modal = document.createElement('div');
  modal.className = 'sf-log-modal';
  
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
  
  const closeBtn = modal.querySelector('.sf-modal-close-btn');
  closeBtn.addEventListener('click', () => {
    modal.remove();
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  debugLog('Modal affichée');
}

// Afficher le log parsé
function showParsedLogModal(parsedLog) {
  console.log('🎯 showParsedLogModal APPELÉE !');
  console.log('📊 parsedLog reçu:', parsedLog);

  const existingModal = document.querySelector('.sf-log-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  const summary = getParser().getSummary(parsedLog);
  console.log('📋 Summary créé:', summary);

  const modal = document.createElement('div');
  modal.className = 'sf-log-modal';

  console.log('🏗️ Modal créée, classe:', modal.className);
  
  modal.innerHTML = `
    <div class="sf-modal-content">
      <div class="sf-modal-header">
        <h3>📋 Détails du log Salesforce (Parsé)</h3>
        <button class="sf-modal-close-btn">×</button>
      </div>
      <div class="sf-modal-tabs">
        <button class="sf-tab-btn active" data-tab="summary">Résumé</button>
        <button class="sf-tab-btn" data-tab="timeline">Timeline</button>
        <button class="sf-tab-btn" data-tab="raw">Log brut</button>
      </div>
      <div class="sf-modal-body-tabs">
        <div class="sf-tab-content active" id="tab-summary">
          ${renderSummaryTab(summary, parsedLog)}
        </div>
        <div class="sf-tab-content" id="tab-timeline">
          ${renderTimelineTab(parsedLog)}
        </div>
        <div class="sf-tab-content" id="tab-raw">
          <pre class="sf-modal-body">${parsedLog.rawContent}</pre>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);

  console.log('✅ Modal ajoutée au DOM');
  console.log('🔍 Recherche des tabs...');

  const tabs = document.querySelectorAll('.sf-modal-tabs');
  const tabBtns = document.querySelectorAll('.sf-tab-btn');
  
  console.log('📊 Tabs trouvés:', tabs.length);
  console.log('🔘 Boutons trouvés:', tabBtns.length);

  if (tabs.length === 0) {
      console.error('❌ PROBLÈME: Aucun .sf-modal-tabs trouvé !');
  }
  
  // Gérer les tabs
  modal.querySelectorAll('.sf-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.sf-tab-btn').forEach(b => b.classList.remove('active'));
      modal.querySelectorAll('.sf-tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      modal.querySelector(`#tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
  
  const closeBtn = modal.querySelector('.sf-modal-close-btn');
  closeBtn.addEventListener('click', () => {
    modal.remove();
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  debugLog('Modal parsée affichée');
}

// ✅ Rendu de l'onglet Résumé
function renderSummaryTab(summary, parsedLog) {
  return `
    <div class="sf-summary-container">
      <div class="sf-summary-section">
        <h4>🎯 Informations générales</h4>
        <div class="sf-summary-grid">
          <div class="sf-summary-item">
            <span class="sf-label">Opération:</span>
            <span class="sf-value">${summary.metadata.operation}</span>
          </div>
          <div class="sf-summary-item">
            <span class="sf-label">Statut:</span>
            <span class="sf-value sf-status-${summary.metadata.status.toLowerCase()}">${summary.metadata.status}</span>
          </div>
          <div class="sf-summary-item">
            <span class="sf-label">Durée:</span>
            <span class="sf-value">${summary.duration}ms</span>
          </div>
          <div class="sf-summary-item">
            <span class="sf-label">Lignes:</span>
            <span class="sf-value">${summary.totalLines}</span>
          </div>
        </div>
      </div>
      
      <div class="sf-summary-section">
        <h4>📊 Limites Salesforce</h4>
        <div class="sf-limits-grid">
          <div class="sf-limit-item">
            <span class="sf-label">SOQL Queries:</span>
            <div class="sf-limit-bar">
              <div class="sf-limit-fill" style="width: ${(parsedLog.stats.limits.soqlQueries / parsedLog.stats.limits.maxSoqlQueries) * 100}%"></div>
            </div>
            <span class="sf-limit-value">${summary.limits.soql}</span>
          </div>
          <div class="sf-limit-item">
            <span class="sf-label">DML Statements:</span>
            <div class="sf-limit-bar">
              <div class="sf-limit-fill" style="width: ${(parsedLog.stats.limits.dmlStatements / parsedLog.stats.limits.maxDmlStatements) * 100}%"></div>
            </div>
            <span class="sf-limit-value">${summary.limits.dml}</span>
          </div>
          <div class="sf-limit-item">
            <span class="sf-label">CPU Time:</span>
            <div class="sf-limit-bar">
              <div class="sf-limit-fill" style="width: ${(parsedLog.stats.limits.cpuTime / parsedLog.stats.limits.maxCpuTime) * 100}%"></div>
            </div>
            <span class="sf-limit-value">${summary.limits.cpu}</span>
          </div>
          <div class="sf-limit-item">
            <span class="sf-label">Heap Size:</span>
            <div class="sf-limit-bar">
              <div class="sf-limit-fill" style="width: ${(parsedLog.stats.limits.heapSize / parsedLog.stats.limits.maxHeapSize) * 100}%"></div>
            </div>
            <span class="sf-limit-value">${summary.limits.heap}</span>
          </div>
        </div>
      </div>
      
      ${parsedLog.stats.errors.length > 0 ? `
      <div class="sf-summary-section sf-summary-errors">
            <h4>❌ Erreurs (${parsedLog.stats.errors.length})</h4>
            <div class="sf-errors-list">
                ${parsedLog.stats.errors.map(error => `
                    <div class="sf-error-item">
                        <div class="sf-error-type">${error.type}</div>
                        <div class="sf-error-details">
                            <div class="sf-error-message">${error.exceptionType || 'Exception'}: ${error.message}</div>
                            ${error.method ? `<div class="sf-error-location">📍 Location : <code>${error.method}</code></div>` : ''}
                            <div class="sf-error-time">${error.timestamp}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
      ` : ''}
      
      <div class="sf-summary-section">
        <h4>🔧 Méthodes (${summary.methods})</h4>
        <div class="sf-methods-list">
          ${parsedLog.stats.methods.slice(0, 10).map(m => `
            <div class="sf-method-item">
              <span class="sf-method-name">${m.class}.${m.method}</span>
              <span class="sf-method-calls">${m.calls} appel${m.calls > 1 ? 's' : ''}</span>
            </div>
          `).join('')}
          ${parsedLog.stats.methods.length > 10 ? `<div class="sf-hint">...et ${parsedLog.stats.methods.length - 10} autres</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

// ✅ Rendu de l'onglet Timeline
function renderTimelineTab(parsedLog) {
    const importantLines = parsedLog.lines.filter(line => 
        ['METHOD_ENTRY', 'METHOD_EXIT', 'SOQL_EXECUTE_BEGIN', 'DML_BEGIN', 'USER_DEBUG', 'EXCEPTION_THROWN'].includes(line.type)
    ).slice(0, 100);
    
    return `
        <div class="sf-timeline-container">
            <div class="sf-timeline-wrapper">
                ${importantLines.map(line => {
                    const indent = (line.details?.depth || 0) * 20;
                    
                    return `
                        <div class="sf-timeline-item sf-timeline-${line.type.toLowerCase()}" style="padding-left: ${indent}px">
                            <div class="sf-timeline-time">${line.timestamp}</div>
                            <div class="sf-timeline-type">${line.type}</div>
                            <div class="sf-timeline-content">${line.content}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
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

// ========== SPINNER DE CHARGEMENT ==========

function showLoadingSpinner(message = 'Chargement...', subtext = '') {
  const container = document.getElementById('sf-logs-container');
  if (!container) return;
  
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

function hideLoadingSpinner() {
  const spinner = document.getElementById('sf-loading-spinner');
  if (spinner) {
    spinner.remove();
    debugLog('✅ Spinner masqué');
  }
}

// ========== PRÉCHARGEMENT DES LOGS ==========

async function preloadLogsInBackground() {
  try {
    debugLog('🔄 Préchargement des logs en arrière-plan...');
    
    // ❌ NE PAS forcer la session au préchargement (cause des refresh)
    // await ensureMySalesforceSession();
    
    const userId = await getCurrentUserId();
    if (!userId) {
      debugLog('⚠️ Impossible de précharger : User ID non trouvé');
      return;
    }
    cachedUserId = userId;
    debugLog('✅ User ID en cache:', userId);
    
    const sessionId = await extractSessionId();
    if (!sessionId) {
      debugLog('⚠️ Impossible de précharger : Session ID non trouvé (normal au 1er chargement)');
      return;
    }
    cachedSessionId = sessionId;
    debugLog('✅ Session ID en cache');
    
    const logs = await fetchDebugLogs(sessionId, userId);
    if (logs && logs.length > 0) {
      const parsedLogs = [];
      if (logs && logs.length > 0 && getParser()) {
        for (const log of logs) {
          parsedLogs.push({
            metadata: log,
            parsed: null,
            summary: {
              id: log.Id,
              operation: log.Operation,
              status: log.Status,
              duration: log.DurationMilliseconds,
              logLength: log.LogLength
            }
          });
        }
      }

      cachedLogs = {
        raw: logs,
        parsed: parsedLogs
      };
      lastFetchTime = Date.now();
      debugLog(`✅ ${logs.length} log(s) préchargé(s) en arrière-plan`);
      updateBadge(logs.length);
    } else {
      debugLog('ℹ️ Aucun log à précharger');
    }
    
  } catch (error) {
    debugLog('❌ Erreur préchargement:', error);
  }
}

function isCacheValid() {
  if (!cachedLogs || !cachedLogs.raw || !Array.isArray(cachedLogs.raw) || !lastFetchTime){
    debugLog('🔍 Cache invalide ou vide');
    return false;
  }
  const cacheAge = Date.now() - lastFetchTime;
  const isValid = cacheAge < CACHE_DURATION;
  debugLog(`🔍 Cache valide: ${isValid} (âge: ${Math.round(cacheAge / 1000)}s)`);
  return isValid;
}

function updateBadge(count) {
  const button = document.getElementById('sf-debug-toggle');
  if (!button) return;
  
  const oldBadge = button.querySelector('.sf-badge');
  if (oldBadge) oldBadge.remove();
  
  if (count > 0) {
    const badge = document.createElement('div');
    badge.className = 'sf-badge';
    badge.textContent = count > 99 ? '99+' : count;
    button.appendChild(badge);
  }
}

// ========== INITIALISATION ==========

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
    debugLog('=== FoxLog initialisé avec succès ===');
    
    // Précharger les logs en arrière-plan après 2 secondes
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