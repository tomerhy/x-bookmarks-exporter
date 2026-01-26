const autoScrollBtn = document.getElementById("auto-scroll");
const autoScrollVideosBtn = document.getElementById("auto-scroll-videos");
const openGalleryBtn = document.getElementById("open-gallery");
const donateBtn = document.getElementById("donate");
const copyBtn = document.getElementById("copy");
const clearBtn = document.getElementById("clear");
const bookmarkCount = document.getElementById("bookmark-count");
const statusEl = document.getElementById("status");
const versionEl = document.getElementById("version");

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

const updateAutoScrollButtons = (running, mode) => {
  const isBookmarks = running && mode === "bookmarks";
  const isVideos = running && mode === "videos";
  autoScrollBtn.textContent = isBookmarks
    ? "Stop Bookmarks Scroll"
    : "Start Bookmarks Scroll";
  autoScrollVideosBtn.textContent = isVideos
    ? "Stop Videos Scroll"
    : "Start Videos Scroll";
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

const updateBookmarkCount = () => {
  let loadedCount = null;
  let totalUrls = null;

  const render = () => {
    if (loadedCount === null && totalUrls === null) {
      bookmarkCount.textContent = "";
      return;
    }
    const loadedText =
      typeof loadedCount === "number" ? `Loaded bookmarks: ${loadedCount}` : "";
    const totalText =
      typeof totalUrls === "number" ? `Total videos: ${totalUrls}` : "";
    bookmarkCount.textContent = [loadedText, totalText].filter(Boolean).join(" · ");
  };

  chrome.storage.local.get({ videoUrls: [] }, (data) => {
    totalUrls = Array.isArray(data.videoUrls) ? data.videoUrls.length : 0;
    render();
  });

  withActiveTab((tab) => {
    ensureContentScript(tab.id, (ok) => {
      if (!ok) return;
      chrome.tabs.sendMessage(
        tab.id,
        { type: "GET_BOOKMARK_COUNT" },
        (res) => {
          if (chrome.runtime.lastError) return;
          loadedCount = typeof res?.count === "number" ? res.count : null;
          render();
        }
      );
    });
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
          updateAutoScrollButtons(!!res?.running, res?.mode);
        }
      );
    });
  });
};

const startOrStopScroll = (mode) => {
  const isBookmarksMode = mode === "bookmarks";
  const startMessage = isBookmarksMode
    ? "AUTO_SCROLL_BOOKMARKS"
    : "AUTO_SCROLL_VIDEOS";

  setStatus("");
  withActiveTab((tab) => {
    if (
      !tab.url ||
      !/x\.com\/i\/bookmarks|twitter\.com\/i\/bookmarks/.test(tab.url)
    ) {
      if (isBookmarksMode) {
        setStatus("Open your X Bookmarks page first.");
        return;
      }
    }
    ensureContentScript(tab.id, (ok) => {
      if (!ok) {
        setStatus("Unable to connect to the page. Reload and try again.");
        return;
      }
      chrome.tabs.sendMessage(
        tab.id,
        { type: "GET_AUTO_SCROLL_STATUS" },
        (res) => {
          if (chrome.runtime.lastError) {
            setStatus("Unable to connect to the page. Reload and try again.");
            return;
          }
          const running = !!res?.running;
          const runningMode = res?.mode;
          if (running && runningMode === mode) {
            chrome.tabs.sendMessage(tab.id, { type: "STOP_AUTO_SCROLL" });
            updateAutoScrollButtons(false);
            return;
          }
          if (running && runningMode !== mode) {
            chrome.tabs.sendMessage(tab.id, { type: "STOP_AUTO_SCROLL" });
          }
          chrome.tabs.sendMessage(tab.id, { type: startMessage });
          updateAutoScrollButtons(true, mode);
        }
      );
    });
  });
};

autoScrollBtn.onclick = () => startOrStopScroll("bookmarks");
autoScrollVideosBtn.onclick = () => startOrStopScroll("videos");

openGalleryBtn.onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("gallery.html") });
};

donateBtn.onclick = () => {
  chrome.tabs.create({ url: "https://www.patreon.com/join/THYProduction" });
};

copyBtn.onclick = () => {
  chrome.runtime.sendMessage({ type: "GET_URLS" }, res => {
    const urls = res?.urls || [];
    const text = urls.join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
  });
};

clearBtn.onclick = () => {
  chrome.runtime.sendMessage({ type: "CLEAR_URLS" });
};

syncAutoScrollStatus();
updateBookmarkCount();
setInterval(updateBookmarkCount, 1500);
setVersion();
