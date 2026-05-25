const autoScrollBtn = document.getElementById("auto-scroll");
const openGalleryBtn = document.getElementById("open-gallery");
const clearBtn = document.getElementById("clear");
const videoCountEl = document.getElementById("video-count");
const statusEl = document.getElementById("status");
const versionEl = document.getElementById("version");
const langSelector = document.getElementById("lang-selector");
const coffeeBanner = document.getElementById("coffee-banner");
const coffeeBannerSupport = document.getElementById("coffee-banner-support");
const coffeeBannerDismiss = document.getElementById("coffee-banner-dismiss");
const aboutToggle = document.getElementById("about-toggle");
const aboutOverlay = document.getElementById("about-overlay");
const aboutClose = document.getElementById("about-close");
const COFFEE_URL = "https://buymeacoffee.com/thyproduction";
const USAGE_THRESHOLD = 15;

// ─── Core UI Helpers ─────────────────────────────────────────────────────────

const setStatus = (message) => {
  statusEl.textContent = message || "";
};

let _statusClearTimer = null;
const flashStatus = (message, ms = 3000) => {
  setStatus(message);
  if (_statusClearTimer) clearTimeout(_statusClearTimer);
  if (ms > 0) {
    _statusClearTimer = setTimeout(() => {
      setStatus("");
      _statusClearTimer = null;
    }, ms);
  }
};

const withActiveTab = (cb) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    if (!tab?.id) return;
    cb(tab);
  });
};

const updateAutoScrollButton = (running) => {
  const labelEl = autoScrollBtn.querySelector(".btn-label");
  const iconUse = autoScrollBtn.querySelector(".icon use");
  if (running) {
    if (labelEl) labelEl.textContent = I18n.getMessage("stopScroll", "Stop Scroll");
    if (iconUse) iconUse.setAttribute("href", "#i-stop");
    autoScrollBtn.classList.add("scrolling-active");
  } else {
    if (labelEl) labelEl.textContent = I18n.getMessage("autoScroll", "Auto Scroll");
    if (iconUse) iconUse.setAttribute("href", "#i-chevrons-down");
    autoScrollBtn.classList.remove("scrolling-active");
  }
};

const setVersion = () => {
  const version = chrome.runtime.getManifest().version;
  versionEl.textContent = `v${version}`;
};

// ─── Coffee Support ──────────────────────────────────────────────────────────

const trackUsageAndShowCoffeeBanner = () => {
  chrome.storage.local.get(
    { usageCount: 0, coffeeBannerDismissed: false },
    (data) => {
      const newCount = data.usageCount + 1;
      chrome.storage.local.set({ usageCount: newCount });
      if (newCount >= USAGE_THRESHOLD && !data.coffeeBannerDismissed) {
        coffeeBanner.classList.add("visible");
      }
    }
  );
};

const openCoffeeLink = () => {
  chrome.tabs.create({ url: COFFEE_URL });
};

const dismissCoffeeBanner = () => {
  coffeeBanner.classList.remove("visible");
  chrome.storage.local.set({ coffeeBannerDismissed: true });
};

// ─── Content Script ──────────────────────────────────────────────────────────

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

// ─── Video Count + Stats ─────────────────────────────────────────────────────

const updateVideoCount = () => {
  chrome.storage.local.get({ videoUrls: [] }, (data) => {
    const count = Array.isArray(data.videoUrls) ? data.videoUrls.length : 0;
    videoCountEl.textContent = count;
    document.body.classList.toggle("is-empty", count === 0);
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
    const isBookmarksPage = tab.url && /x\.com\/i\/bookmarks|twitter\.com\/i\/bookmarks/.test(tab.url);
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
            chrome.tabs.sendMessage(tab.id, { type: "STOP_AUTO_SCROLL" });
            updateAutoScrollButton(false);
            return;
          }
          chrome.tabs.sendMessage(tab.id, { type: startMessage });
          updateAutoScrollButton(true);
        }
      );
    });
  });
};

// ─── Event Listeners ─────────────────────────────────────────────────────────

autoScrollBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("auto_scroll", "popup");
  trackUsageAndShowCoffeeBanner();
  startOrStopScroll();
};

openGalleryBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("open_gallery", "popup");
  chrome.tabs.create({ url: chrome.runtime.getURL("gallery.html") });
};

let _clearPending = false;
let _clearPendingTimer = null;
const _resetClearPending = () => {
  _clearPending = false;
  clearBtn.classList.remove("is-confirming");
  if (_clearPendingTimer) {
    clearTimeout(_clearPendingTimer);
    _clearPendingTimer = null;
  }
};

clearBtn.onclick = () => {
  if (!_clearPending) {
    chrome.storage.local.get({ videoUrls: [] }, (data) => {
      const count = Array.isArray(data.videoUrls) ? data.videoUrls.length : 0;
      if (!count) {
        flashStatus(I18n.getMessage("nothingToClear", "Nothing to clear"));
        return;
      }
      _clearPending = true;
      clearBtn.classList.add("is-confirming");
      flashStatus(I18n.getMessage("clearConfirm", "Click Clear again to confirm"), 5000);
      _clearPendingTimer = setTimeout(_resetClearPending, 5000);
    });
    return;
  }
  if (window.Analytics) Analytics.trackButtonClick("clear_urls", "popup");
  _resetClearPending();
  chrome.runtime.sendMessage({ type: "CLEAR_URLS" });
  videoCountEl.textContent = "0";
  document.body.classList.add("is-empty");
  flashStatus(I18n.getMessage("cleared", "Cleared"));
};

coffeeBannerSupport.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("coffee_banner_support", "popup");
  dismissCoffeeBanner();
  openCoffeeLink();
};

coffeeBannerDismiss.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("coffee_banner_dismiss", "popup");
  dismissCoffeeBanner();
};

// ─── Easter-egg About overlay ─────────────────────────────────────────────────

const openAbout = () => {
  aboutOverlay.hidden = false;
  aboutOverlay.classList.add("visible");
  aboutOverlay.setAttribute("aria-hidden", "false");
  aboutClose.focus();
  if (window.Analytics) Analytics.trackButtonClick("about_open", "popup");
};

const closeAbout = () => {
  aboutOverlay.classList.remove("visible");
  aboutOverlay.setAttribute("aria-hidden", "true");
  aboutOverlay.hidden = true;
  aboutToggle.focus();
};

aboutToggle.onclick = openAbout;
aboutClose.onclick = closeAbout;
aboutOverlay.addEventListener("click", (e) => {
  if (e.target === aboutOverlay) closeAbout();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && aboutOverlay.classList.contains("visible")) {
    closeAbout();
  }
});

langSelector.onchange = async () => {
  const newLang = langSelector.value;
  const success = await I18n.setLanguage(newLang);
  if (success) {
    translatePage();
    updateVideoCount();
  }
};

// ─── i18n ────────────────────────────────────────────────────────────────────

const translatePage = () => {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = I18n.getMessage(key, el.textContent);
  });
  syncAutoScrollStatus();
};

// ─── Init ─────────────────────────────────────────────────────────────────────

const initializePopup = async () => {
  await I18n.init();
  const currentLang = I18n.getCurrentLanguage();
  langSelector.value = currentLang;
  translatePage();
  syncAutoScrollStatus();
  updateVideoCount();
  setInterval(updateVideoCount, 1500);
  setVersion();

  if (window.Analytics) {
    Analytics.trackPageView("popup");
  }
};

initializePopup();
