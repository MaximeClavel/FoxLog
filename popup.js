// popup.js
'use strict';

// Version (from manifest.json - single source of truth)
const versionElement = document.getElementById('version-number');
if (versionElement) {
  versionElement.textContent = chrome.runtime.getManifest().version;
}

// I18n
const browserLang = navigator.language.toLowerCase();
const isFrench = browserLang.startsWith('fr');

const i18n = {
  showButton: isFrench ? 'Afficher le bouton' : 'Show button',
  errorAlerts: isFrench ? 'Alertes d\'erreur' : 'Error alerts',
  errorAlertsHint: isFrench ? 'Badge et notification quand un nouveau log contient une erreur' : 'Badge and notification when a new log has an error',
  version: isFrench ? 'Version' : 'Version'
};

// Apply translations
document.querySelectorAll('[data-i18n]').forEach(element => {
  const key = element.getAttribute('data-i18n');
  if (i18n[key]) {
    element.textContent = i18n[key];
  }
});

/**
 * Bind a switch to a chrome.storage.local flag that is on unless explicitly turned off
 * @param {HTMLElement} switchElement
 * @param {string} storageKey
 * @param {Function} [onChange] - Called with the new state once saved
 */
function bindSwitch(switchElement, storageKey, onChange) {
  // Load current state
  chrome.storage.local.get([storageKey], (result) => {
    updateSwitchUI(switchElement, result[storageKey] !== false); // Default: true
  });

  switchElement.addEventListener('click', () => {
    chrome.storage.local.get([storageKey], (result) => {
      const newState = result[storageKey] === false;

      // Save new state
      chrome.storage.local.set({ [storageKey]: newState }, () => {
        updateSwitchUI(switchElement, newState);
        onChange?.(newState);
      });
    });
  });
}

function updateSwitchUI(switchElement, isActive) {
  switchElement.classList.toggle('active', isActive);
  switchElement.setAttribute('aria-checked', String(isActive));
}

bindSwitch(document.getElementById('toggle-button'), 'buttonVisible', (visible) => {
  // Send message to content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'toggleButton',
        visible
      }).catch(err => {
        console.log('Content script not ready:', err);
      });
    }
  });
});

// Every Salesforce tab follows this one through chrome.storage.onChanged (polling, badge, toast)
bindSwitch(document.getElementById('toggle-alerts'), 'errorAlertsEnabled');
