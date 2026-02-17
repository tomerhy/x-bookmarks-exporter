// i18n (internationalization) helper for the extension
const I18n = (() => {
  let currentLang = null;
  let messages = {};
  
  const AVAILABLE_LANGUAGES = {
    'en': 'English',
    'fr': 'Français',
    'de': 'Deutsch',
    'es': 'Español'
  };

  // Get user's preferred language or browser default
  const getPreferredLanguage = async () => {
    return new Promise((resolve) => {
      chrome.storage.local.get({ userLanguage: null }, (data) => {
        if (data.userLanguage && AVAILABLE_LANGUAGES[data.userLanguage]) {
          resolve(data.userLanguage);
        } else {
          // Use browser language or default to 'en'
          const browserLang = navigator.language.split('-')[0];
          resolve(AVAILABLE_LANGUAGES[browserLang] ? browserLang : 'en');
        }
      });
    });
  };

  // Load messages for a specific language
  const loadMessages = async (lang) => {
    try {
      const response = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
      const data = await response.json();
      messages = data;
      currentLang = lang;
      return true;
    } catch (error) {
      console.error(`Failed to load language: ${lang}`, error);
      return false;
    }
  };

  // Get translated message
  const getMessage = (key, fallback = '') => {
    if (messages[key] && messages[key].message) {
      return messages[key].message;
    }
    return fallback || key;
  };

  // Initialize i18n system
  const init = async () => {
    const lang = await getPreferredLanguage();
    await loadMessages(lang);
    return currentLang;
  };

  // Change language
  const setLanguage = async (lang) => {
    if (!AVAILABLE_LANGUAGES[lang]) {
      console.error(`Language not supported: ${lang}`);
      return false;
    }
    
    const success = await loadMessages(lang);
    if (success) {
      chrome.storage.local.set({ userLanguage: lang });
      return true;
    }
    return false;
  };

  // Get current language
  const getCurrentLanguage = () => currentLang;

  // Get available languages
  const getAvailableLanguages = () => AVAILABLE_LANGUAGES;

  return {
    init,
    getMessage,
    setLanguage,
    getCurrentLanguage,
    getAvailableLanguages
  };
})();
