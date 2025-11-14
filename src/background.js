// src/background.js
'use strict';

// ============================================
// LOGGER LOCAL
// ============================================
const DEBUG_MODE = false; 

const logger = {
  _isEnabled() {
    return DEBUG_MODE;
  },
  
  log: (msg, data) => {
    if (!logger._isEnabled()) return;
    if (data !== null && data !== undefined && data !== '') {
      console.log(`[FoxLog BG] ${msg}`, data);
    } else {
      console.log(`[FoxLog BG] ${msg}`);
    }
  },
  
  success: (msg, data) => {
    if (!logger._isEnabled()) return;
    if (data !== null && data !== undefined && data !== '') {
      console.log(`[FoxLog BG] ✅ ${msg}`, data);
    } else {
      console.log(`[FoxLog BG] ✅ ${msg}`);
    }
  },
  
  warn: (msg, data) => {
    if (!logger._isEnabled()) return;
    if (data !== null && data !== undefined && data !== '') {
      console.warn(`[FoxLog BG] ⚠️ ${msg}`, data);
    } else {
      console.warn(`[FoxLog BG] ⚠️ ${msg}`);
    }
  },
  
  error: (msg, err) => {
    // Toujours logger les erreurs, même en production
    if (err !== null && err !== undefined && err !== '') {
      console.error(`[FoxLog BG] ❌ ${msg}`, err);
    } else {
      console.error(`[FoxLog BG] ❌ ${msg}`);
    }
  }
};

logger.log('Service worker started');

// ============================================
// CONSTANTS
// ============================================
const COOKIE_PRIORITY = [
  'my.salesforce.com',
  '.salesforce.com',
  '.force.com',
  'lightning.force.com'
];

// ============================================
// COOKIE SERVICE
// ============================================
class CookieService {
  async findSessionCookie(url) {
    logger.log('Starting cookie search', url);
    
// Try direct domain first
    const directCookie = await this._tryDirectCookie(url);
    if (directCookie) return directCookie;

// Fallback: search all cookies
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
      // Get ALL cookies
      const allCookies = await chrome.cookies.getAll({});
      
      // Filter Salesforce 'sid' cookies
      const sidCookies = allCookies.filter(c =>
        c.name === 'sid' &&
        (c.domain.includes('salesforce') || c.domain.includes('force.com'))
      );

      logger.log(`Found ${sidCookies.length} Salesforce sid cookies`);

      if (sidCookies.length === 0) {
        logger.error('No sid cookie found in any Salesforce domain');
        return null;
      }

      // Try in priority order
      for (const priority of COOKIE_PRIORITY) {
        const cookie = sidCookies.find(c => c.domain.includes(priority));
        if (cookie && cookie.value) {
          logger.success(`Cookie found on priority domain: ${cookie.domain}`);
          logger.log(`Cookie value: ${cookie.value.substring(0, 30)}...`);
          return cookie.value;
        }
      }

      // If no priority cookie, take the first available
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
// INITIALIZATION
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
    
    // IMPORTANT: return true to keep channel open (async)
    return true;
  }
  
  // Other message types
  logger.warn(`Unknown message action: ${request.action}`);
  sendResponse({ error: 'Unknown action' });
});

logger.success('✅ FoxLog Background service worker initialized successfully');