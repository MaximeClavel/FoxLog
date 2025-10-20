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
const REFRESH_INTERVAL = 60000; // 60 secondes

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
    if (!forceRefresh && isCacheValid() && cachedLogs) {
      debugLog('✅ Utilisation du cache (logs préchargés)');
      displayLogs(cachedLogs);
      showSuccess(`${cachedLogs.length} log(s) chargé(s) (cache)`);
      updateStatus('Prêt', 'connected');
      return;
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
      // Forcer la session sur my.salesforce.com
      if (!autoRefresh) {
        showLoadingSpinner('Connexion...', 'Établissement de la session');
      }
      await ensureMySalesforceSession();
      await new Promise(resolve => setTimeout(resolve, 1500));
      
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
    
    // Récupérer les logs
    if (!autoRefresh) {
      showLoadingSpinner('Chargement des logs...', 'Requête vers l\'API Salesforce');
    }
    const logs = await fetchDebugLogs(sessionId, userId);
    
    cachedLogs = logs;
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

// Forcer la création du cookie sur my.salesforce.com
async function ensureMySalesforceSession() {
  debugLog('🔄 Forçage session my.salesforce.com...');
  
  return new Promise((resolve) => {
    try {
      const currentUrl = window.location.hostname;
      const mySfUrl = `https://${currentUrl.replace('lightning.force.com', 'my.salesforce.com')}`;
      
      debugLog('URL my.salesforce.com:', mySfUrl);
      
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.id = 'foxlog-mysf-iframe';
      
      let resolved = false;
      
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
      iframe.src = mySfUrl;
      
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
      size: log.LogLength
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
  debugLog('Demande de détails pour log:', logId);
  
  try {
    updateStatus('Chargement des détails...', 'info');
    
    const sessionId = await extractSessionId();
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
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const logBody = await response.text();
      updateStatus('Détails chargés', 'connected');
      showLogModal(logBody);
    } else {
      showError('Impossible de récupérer les détails du log');
    }
  } catch (error) {
    debugLog('Erreur lors de la récupération des détails:', error);
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
    
    await ensureMySalesforceSession();
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const userId = await getCurrentUserId();
    if (!userId) {
      debugLog('⚠️ Impossible de précharger : User ID non trouvé');
      return;
    }
    cachedUserId = userId;
    debugLog('✅ User ID en cache:', userId);
    
    const sessionId = await extractSessionId();
    if (!sessionId) {
      debugLog('⚠️ Impossible de précharger : Session ID non trouvé');
      return;
    }
    cachedSessionId = sessionId;
    debugLog('✅ Session ID en cache');
    
    const logs = await fetchDebugLogs(sessionId, userId);
    if (logs && logs.length > 0) {
      cachedLogs = logs;
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
  if (!cachedLogs || !lastFetchTime) return false;
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