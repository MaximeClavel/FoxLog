// popup.js
'use strict';

// I18n
const browserLang = navigator.language.toLowerCase();
const isFrench = browserLang.startsWith('fr');

const i18n = {
  showButton: isFrench ? 'Afficher le bouton' : 'Show button',
  version: isFrench ? 'Version' : 'Version'
};

// Apply translations
document.querySelectorAll('[data-i18n]').forEach(element => {
  const key = element.getAttribute('data-i18n');
  if (i18n[key]) {
    element.textContent = i18n[key];
  }
});

// Get elements
const toggleButton = document.getElementById('toggle-button');

// Load current state
chrome.storage.local.get(['buttonVisible'], (result) => {
  const isVisible = result.buttonVisible !== false; // Default: true
  updateToggleUI(isVisible);
});

// Toggle button click
toggleButton.addEventListener('click', () => {
  chrome.storage.local.get(['buttonVisible'], (result) => {
    const currentState = result.buttonVisible !== false;
    const newState = !currentState;
    
    // Save new state
    chrome.storage.local.set({ buttonVisible: newState }, () => {
      updateToggleUI(newState);
      
      // Send message to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'toggleButton',
            visible: newState
          }).catch(err => {
            console.log('Content script not ready:', err);
          });
        }
      });
    });
  });
});

function updateToggleUI(isActive) {
  if (isActive) {
    toggleButton.classList.add('active');
  } else {
    toggleButton.classList.remove('active');
  }
}