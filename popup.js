const autoScrollBtn = document.getElementById("auto-scroll");
const openGalleryBtn = document.getElementById("open-gallery");
const donateBtn = document.getElementById("header-donate");
const clearBtn = document.getElementById("clear");
const videoCountEl = document.getElementById("video-count");
const allTimeCountEl = document.getElementById("all-time-count");
const statusEl = document.getElementById("status");
const versionEl = document.getElementById("version");
const levelBadgeEl = document.getElementById("level-badge");
const langSelector = document.getElementById("lang-selector");
const coffeeBanner = document.getElementById("coffee-banner");
const coffeeBannerSupport = document.getElementById("coffee-banner-support");
const coffeeBannerDismiss = document.getElementById("coffee-banner-dismiss");
const coffeeLink = document.getElementById("coffee-link");
const shareBtn = document.getElementById("share-btn");
const lastSessionEl = document.getElementById("last-session");
const lastSessionTextEl = document.getElementById("last-session-text");
const recallBtn = document.getElementById("recall-btn");
const milestoneToastEl = document.getElementById("milestone-toast");

const COFFEE_URL = "https://buymeacoffee.com/thyproduction";
const USAGE_THRESHOLD = 15;
const MILESTONES = [10, 50, 100, 500, 1000];

// ─── Collector Levels ────────────────────────────────────────────────────────

const LEVELS = [
  { min: 500, name: "Diamond", emoji: "💎", color: "#b9f2ff", border: "rgba(185, 242, 255, 0.4)", bg: "rgba(185, 242, 255, 0.08)" },
  { min: 200, name: "Gold",    emoji: "🥇", color: "#ffd700", border: "rgba(255, 215, 0, 0.4)",   bg: "rgba(255, 215, 0, 0.08)"   },
  { min: 50,  name: "Silver",  emoji: "🥈", color: "#c0c0c0", border: "rgba(192, 192, 192, 0.4)", bg: "rgba(192, 192, 192, 0.08)" },
  { min: 0,   name: "Bronze",  emoji: "🥉", color: "#cd7f32", border: "rgba(205, 127, 50, 0.4)",  bg: "rgba(205, 127, 50, 0.1)"   },
];

const getLevel = (count) => LEVELS.find((l) => count >= l.min);

let _lastRenderedLevel = null;

const updateLevelBadge = (allTimeCount) => {
  const level = getLevel(allTimeCount);
  levelBadgeEl.textContent = `${level.emoji} ${level.name}`;
  levelBadgeEl.style.color = level.color;
  levelBadgeEl.style.borderColor = level.border;
  levelBadgeEl.style.background = level.bg;

  if (_lastRenderedLevel && _lastRenderedLevel !== level.name) {
    if (window.Analytics) {
      Analytics.sendEvent("level_up", { from: _lastRenderedLevel, to: level.name, all_time: allTimeCount });
    }
  }
  _lastRenderedLevel = level.name;
};

// ─── Milestone Toasts ────────────────────────────────────────────────────────

let _milestoneTimeout = null;

const showMilestoneToast = (threshold) => {
  const msgs = {
    10:   "🎉 10 videos captured — you're just getting started!",
    50:   "🔥 50 videos! You've hit Silver Collector.",
    100:  "💯 100 videos all-time. You're on fire!",
    500:  "💎 500 videos! Diamond Collector unlocked.",
    1000: "🚀 1,000 videos. Absolute legend status.",
  };
  milestoneToastEl.textContent = msgs[threshold] || `🏆 ${threshold} videos milestone reached!`;
  milestoneToastEl.style.display = "block";
  if (_milestoneTimeout) clearTimeout(_milestoneTimeout);
  _milestoneTimeout = setTimeout(() => {
    milestoneToastEl.style.display = "none";
  }, 4000);
};

const checkMilestones = (allTimeCount) => {
  chrome.storage.local.get({ nextMilestoneIndex: 0 }, (data) => {
    let idx = data.nextMilestoneIndex || 0;
    while (idx < MILESTONES.length && allTimeCount >= MILESTONES[idx]) {
      showMilestoneToast(MILESTONES[idx]);
      if (window.Analytics) {
        Analytics.sendEvent("milestone_reached", {
          milestone: MILESTONES[idx],
          all_time_count: allTimeCount,
          level: getLevel(allTimeCount).name,
        });
      }
      idx += 1;
    }
    chrome.storage.local.set({ nextMilestoneIndex: idx });
  });
};

// ─── Session History ─────────────────────────────────────────────────────────

const formatRelativeDate = (timestamp) => {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 2) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}d ago`;
};

const updateLastSession = () => {
  chrome.storage.local.get({ sessionHistory: [] }, (data) => {
    const history = data.sessionHistory || [];
    if (!history.length) {
      lastSessionEl.style.display = "none";
      return;
    }
    const last = history[0];
    lastSessionTextEl.textContent = `Last: ${formatRelativeDate(last.date)} · ${last.count} videos`;
    lastSessionEl.style.display = "flex";
  });
};

const recallLastSession = () => {
  chrome.storage.local.get({ sessionHistory: [] }, (data) => {
    const history = data.sessionHistory || [];
    if (!history.length) return;
    const last = history[0];
    chrome.storage.local.set({ videoUrls: last.urls }, () => {
      videoCountEl.textContent = last.count;
      if (window.Analytics) {
        Analytics.sendEvent("session_recalled", { video_count: last.count });
      }
    });
  });
};

// ─── Share Haul ──────────────────────────────────────────────────────────────

const shareHaul = (count) => {
  const text = encodeURIComponent(
    `Just archived ${count} video${count === 1 ? "" : "s"} from my X bookmarks 🎬 Never lose a saved video again — X Bookmarks Exporter`
  );
  chrome.tabs.create({ url: `https://twitter.com/intent/tweet?text=${text}` });
  if (window.Analytics) {
    Analytics.sendEvent("share_haul", { video_count: count });
  }
};

// ─── Core UI Helpers ─────────────────────────────────────────────────────────

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

// ─── Coffee Support ──────────────────────────────────────────────────────────

const trackUsageAndShowCoffeeBanner = () => {
  chrome.storage.local.get(
    { usageCount: 0, coffeeBannerDismissed: false },
    (data) => {
      const newCount = data.usageCount + 1;
      chrome.storage.local.set({ usageCount: newCount });
      if (newCount >= USAGE_THRESHOLD && !data.coffeeBannerDismissed) {
        coffeeBanner.style.display = "flex";
      }
    }
  );
};

const openCoffeeLink = () => {
  chrome.tabs.create({ url: COFFEE_URL });
};

const dismissCoffeeBanner = () => {
  coffeeBanner.style.display = "none";
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
  chrome.storage.local.get({ videoUrls: [], allTimeCaptured: 0 }, (data) => {
    const count = Array.isArray(data.videoUrls) ? data.videoUrls.length : 0;
    const allTime = data.allTimeCaptured || 0;

    videoCountEl.textContent = count;
    allTimeCountEl.textContent = allTime;

    // Show/hide share button
    shareBtn.style.display = count > 0 ? "block" : "none";
    shareBtn.textContent = `🐦 Share your haul (${count} video${count === 1 ? "" : "s"})`;

    updateLevelBadge(allTime);
    checkMilestones(allTime);
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

donateBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("donate", "popup");
  chrome.tabs.create({ url: "https://www.patreon.com/join/THYProduction" });
};

clearBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("clear_urls", "popup");
  chrome.runtime.sendMessage({ type: "CLEAR_URLS" });
  videoCountEl.textContent = "0";
  shareBtn.style.display = "none";
  // Refresh last-session after a tick (background saves async)
  setTimeout(updateLastSession, 300);
};

shareBtn.onclick = () => {
  chrome.storage.local.get({ videoUrls: [] }, (data) => {
    shareHaul(data.videoUrls?.length || 0);
  });
};

recallBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("recall_session", "popup");
  recallLastSession();
};

coffeeLink.onclick = (e) => {
  e.preventDefault();
  if (window.Analytics) Analytics.trackButtonClick("coffee_footer", "popup");
  openCoffeeLink();
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
  updateLastSession();
  setInterval(updateVideoCount, 1500);
  setVersion();

  if (window.Analytics) {
    Analytics.trackPageView("popup");
  }
};

initializePopup();
