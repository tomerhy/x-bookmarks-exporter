const autoScrollBtn = document.getElementById("auto-scroll");
const openGalleryBtn = document.getElementById("open-gallery");
const donateBtn = document.getElementById("header-donate");
const clearBtn = document.getElementById("clear");
const videoCountEl = document.getElementById("video-count");
const statusEl = document.getElementById("status");
const versionEl = document.getElementById("version");
const langSelector = document.getElementById("lang-selector");

const setStatus = (message) => {
  statusEl.textContent = message || "";
};

const withActiveTab = (cb) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    if (!tab?.id) return;
    cb(tab);
  });
};

const updateAutoScrollButton = (running) => {
  if (running) {
    autoScrollBtn.textContent = I18n.getMessage("stopScroll", "Stop Scroll");
    autoScrollBtn.classList.add("scrolling-active");
    autoScrollBtn.style.borderColor = "rgba(255, 107, 107, 0.6)";
  } else {
    autoScrollBtn.textContent = I18n.getMessage("autoScroll", "Auto Scroll");
    autoScrollBtn.classList.remove("scrolling-active");
    autoScrollBtn.style.background = "linear-gradient(180deg, #1a2332, #131a26)";
    autoScrollBtn.style.borderColor = "rgba(255, 255, 255, 0.08)";
  }
};

const setVersion = () => {
  const version = chrome.runtime.getManifest().version;
  versionEl.textContent = `v${version}`;
};

const ensureContentScript = (tabId, cb) => {
  chrome.tabs.sendMessage(tabId, { type: "PING_CONTENT" }, () => {
    if (!chrome.runtime.lastError) {
      cb(true);
      return;
    }
    chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
      if (chrome.runtime.lastError) {
        cb(false);
        return;
      }
      cb(true);
    });
  });
};

const updateVideoCount = () => {
  chrome.storage.local.get({ videoUrls: [] }, (data) => {
    const count = Array.isArray(data.videoUrls) ? data.videoUrls.length : 0;
    videoCountEl.textContent = count;
  });
};

const syncAutoScrollStatus = () => {
  withActiveTab((tab) => {
    ensureContentScript(tab.id, (ok) => {
      if (!ok) return;
      chrome.tabs.sendMessage(
        tab.id,
        { type: "GET_AUTO_SCROLL_STATUS" },
        (res) => {
          if (chrome.runtime.lastError) return;
          updateAutoScrollButton(!!res?.running);
        }
      );
    });
  });
};

const startOrStopScroll = () => {
  setStatus("");
  withActiveTab((tab) => {
    // Auto-detect mode based on current page
    const isBookmarksPage = tab.url && /x\.com\/i\/bookmarks|twitter\.com\/i\/bookmarks/.test(tab.url);
    const mode = isBookmarksPage ? "bookmarks" : "videos";
    const startMessage = isBookmarksPage ? "AUTO_SCROLL_BOOKMARKS" : "AUTO_SCROLL_VIDEOS";

    ensureContentScript(tab.id, (ok) => {
      if (!ok) {
        setStatus(I18n.getMessage("unableToConnect", "Unable to connect to the page. Reload and try again."));
        return;
      }
      chrome.tabs.sendMessage(
        tab.id,
        { type: "GET_AUTO_SCROLL_STATUS" },
        (res) => {
          if (chrome.runtime.lastError) {
            setStatus(I18n.getMessage("unableToConnect", "Unable to connect to the page. Reload and try again."));
            return;
          }
          const running = !!res?.running;
          
          if (running) {
            // Stop scrolling
            chrome.tabs.sendMessage(tab.id, { type: "STOP_AUTO_SCROLL" });
            updateAutoScrollButton(false);
            return;
          }
          
          // Start scrolling
          chrome.tabs.sendMessage(tab.id, { type: startMessage });
          updateAutoScrollButton(true);
        }
      );
    });
  });
};

autoScrollBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("auto_scroll", "popup");
  startOrStopScroll();
};

openGalleryBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("open_gallery", "popup");
  chrome.tabs.create({ url: chrome.runtime.getURL("gallery.html") });
};

donateBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("donate", "popup");
  chrome.tabs.create({ url: "https://www.patreon.com/join/THYProduction" });
};

clearBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("clear_urls", "popup");
  chrome.runtime.sendMessage({ type: "CLEAR_URLS" });
  videoCountEl.textContent = "0";
};

// Language selector
langSelector.onchange = async () => {
  const newLang = langSelector.value;
  const success = await I18n.setLanguage(newLang);
  if (success) {
    translatePage();
    updateVideoCount();
  }
};

// Translate all elements with data-i18n attribute
const translatePage = () => {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = I18n.getMessage(key, el.textContent);
  });
  // Update button state after translation
  syncAutoScrollStatus();
};

// Initialize i18n and UI
const initializePopup = async () => {
  await I18n.init();
  const currentLang = I18n.getCurrentLanguage();
  langSelector.value = currentLang;
  translatePage();
  syncAutoScrollStatus();
  updateVideoCount();
  setInterval(updateVideoCount, 1500);
  setVersion();
  
  // Analytics: Track popup page view
  if (window.Analytics) {
    Analytics.trackPageView("popup");
  }
};

initializePopup();
