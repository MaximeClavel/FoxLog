// src/background.js
'use strict';

console.log('[FoxLog Background] Service worker started');

// ============================================
// CONSTANTES (copiées localement)
// ============================================
const COOKIE_PRIORITY = [
  'my.salesforce.com',
  '.salesforce.com',
  '.force.com',
  'lightning.force.com'
];

// ============================================
// LOGGER SIMPLE (pas d'import)
// ============================================
const logger = {
  log: (msg, data) => console.log(`[FoxLog BG] ${msg}`, data || ''),
  success: (msg, data) => console.log(`[FoxLog BG] ✅ ${msg}`, data || ''),
  error: (msg, err) => console.error(`[FoxLog BG] ❌ ${msg}`, err || ''),
  warn: (msg, data) => console.warn(`[FoxLog BG] ⚠️ ${msg}`, data || '')
};

// ============================================
// COOKIE SERVICE
// ============================================
class CookieService {
  async findSessionCookie(url) {
    logger.log('Starting cookie search', url);
    
    // Essayer d'abord le domaine direct
    const directCookie = await this._tryDirectCookie(url);
    if (directCookie) return directCookie;

    // Fallback : chercher dans tous les cookies
    return this._tryAllCookies();
  }

  async _tryDirectCookie(url) {
    if (!url) {
      logger.warn('No URL provided');
      return null;
    }

    try {
      const hostname = new URL(url).hostname;
      const myDomain = hostname.replace('lightning.force.com', 'my.salesforce.com');
      
      logger.log(`Checking direct cookie on: ${myDomain}`);
      
      const cookie = await chrome.cookies.get({
        url: `https://${myDomain}`,
        name: 'sid'
      });

      if (cookie && cookie.value) {
        logger.success(`Cookie found on ${myDomain}`);
        logger.log(`Cookie value: ${cookie.value.substring(0, 30)}...`);
        return cookie.value;
      }
      
      logger.log(`No cookie found on ${myDomain}`);
    } catch (error) {
      logger.error('Error checking direct cookie', error);
    }

    return null;
  }

  async _tryAllCookies() {
    logger.log('Searching all cookies...');
    
    try {
      // Récupérer TOUS les cookies
      const allCookies = await chrome.cookies.getAll({});
      
      // Filtrer les cookies 'sid' de Salesforce
      const sidCookies = allCookies.filter(c =>
        c.name === 'sid' &&
        (c.domain.includes('salesforce') || c.domain.includes('force.com'))
      );

      logger.log(`Found ${sidCookies.length} Salesforce sid cookies`);

      if (sidCookies.length === 0) {
        logger.error('No sid cookie found in any Salesforce domain');
        return null;
      }

      // Essayer dans l'ordre de priorité
      for (const priority of COOKIE_PRIORITY) {
        const cookie = sidCookies.find(c => c.domain.includes(priority));
        if (cookie && cookie.value) {
          logger.success(`Cookie found on priority domain: ${cookie.domain}`);
          logger.log(`Cookie value: ${cookie.value.substring(0, 30)}...`);
          return cookie.value;
        }
      }

      // Si aucun cookie prioritaire, prendre le premier disponible
      if (sidCookies.length > 0) {
        const fallbackCookie = sidCookies[0];
        logger.warn(`Using fallback cookie from: ${fallbackCookie.domain}`);
        logger.log(`Cookie value: ${fallbackCookie.value.substring(0, 30)}...`);
        return fallbackCookie.value;
      }

      logger.error('No valid sid cookie found');
      return null;
      
    } catch (error) {
      logger.error('Error searching cookies', error);
      return null;
    }
  }
}

// ============================================
// INITIALISATION
// ============================================
const cookieService = new CookieService();

// ============================================
// MESSAGE LISTENER
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  logger.log(`Message received: ${request.action}`);
  
  if (request.action === 'getSessionId') {
    logger.log('Processing getSessionId request');
    
    cookieService.findSessionCookie(request.url)
      .then(sessionId => {
        if (sessionId) {
          logger.success('Session ID found, sending response');
        } else {
          logger.error('No session ID found');
        }
        sendResponse({ sessionId });
      })
      .catch(error => {
        logger.error('Error in findSessionCookie', error);
        sendResponse({ sessionId: null });
      });
    
    // IMPORTANT : return true pour garder le canal ouvert (async)
    return true;
  }
  
  // Autres types de messages
  logger.warn(`Unknown message action: ${request.action}`);
  sendResponse({ error: 'Unknown action' });
});

logger.success('✅ FoxLog Background service worker initialized successfully');