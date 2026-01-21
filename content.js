(() => {
  if (window.__xBookmarksExporterInjected) return;
  window.__xBookmarksExporterInjected = true;
  const send = (url) => {
    if (!url) return;
    if (!url.includes("video.twimg.com")) return;
    if (url.includes("mp4a") || url.includes("avc1")) return;
    if (url.includes(".mp4") || url.includes(".m3u8")) {
      chrome.runtime.sendMessage({
        type: "VIDEO_URL",
        url
      });
    }
  };

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const url = args[0]?.url || args[0];
      send(url);
      if (response?.ok && shouldInspectJson(url, response)) {
        const clone = response.clone();
        clone.json().then(extractVideoVariants).catch(() => {});
      }
    } catch {}
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    try {
      send(args[1]);
    } catch {}
    return originalOpen.apply(this, args);
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        if (!shouldInspectJson(this.responseURL, this)) return;
        const response =
          this.responseType === "" || this.responseType === "text"
            ? this.responseText
            : JSON.stringify(this.response || {});
        extractVideoVariants(JSON.parse(response));
      } catch {}
    });
    return originalSend.apply(this, args);
  };

  function shouldInspectJson(url, response) {
    if (!url) return false;
    if (!url.includes("/graphql/") && !url.includes("/timeline/")) return false;
    const contentType =
      response?.headers?.get?.("content-type") ||
      response?.getResponseHeader?.("content-type") ||
      "";
    return contentType.includes("json");
  }

  function extractVideoVariants(root) {
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node)) {
        stack.push(...node);
        continue;
      }
      if (node.video_info?.variants?.length) {
        node.video_info.variants.forEach(v => send(v.url));
      }
      Object.values(node).forEach(v => stack.push(v));
    }
  }

  try {
    const observer = new PerformanceObserver(list => {
      list.getEntries().forEach(e => send(e.name));
    });
    observer.observe({ type: "resource", buffered: true });
  } catch {}

  let autoScrollRunning = false;
  let autoScrollMode = null;
  let waitingForNextBatch = false;

  const showToast = (message) => {
    const id = "x-bookmarks-exporter-toast";
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = id;
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      background: "rgba(0,0,0,0.85)",
      color: "#fff",
      padding: "10px 12px",
      borderRadius: "6px",
      fontSize: "12px",
      zIndex: 999999,
      maxWidth: "280px"
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  };

  const isBookmarksPage = () => {
    return /x\.com\/i\/bookmarks|twitter\.com\/i\/bookmarks/.test(
      window.location.href
    );
  };

  const getBookmarkItemCount = () => {
    const selectors = [
      'article[data-testid="tweet"]',
      'div[data-testid="cellInnerDiv"] article'
    ];
    for (const selector of selectors) {
      const count = document.querySelectorAll(selector).length;
      if (count) return count;
    }
    return document.querySelectorAll("article").length;
  };

  const startAutoScroll = async ({ mode, label, requireBookmarks }) => {
    if (autoScrollRunning) return;
    if (requireBookmarks && !isBookmarksPage()) {
      showToast("Open your Bookmarks page first.");
      return;
    }
    autoScrollRunning = true;
    autoScrollMode = mode;
    waitingForNextBatch = false;
    showToast(`${label} scroll started...`);

    let unchangedCount = 0;
    let lastHeight = 0;
    let lastPromptCount = getBookmarkItemCount();
    const batchSize = 50;

    const step = () => {
      if (!autoScrollRunning) return;
      const itemCount = getBookmarkItemCount();
      if (itemCount - lastPromptCount >= batchSize) {
        autoScrollRunning = false;
        waitingForNextBatch = true;
        autoScrollMode = mode;
        showToast(
          `Loaded ${batchSize} more items (${itemCount} total). Click ${label} scroll to continue.`
        );
        return;
      }

      setTimeout(() => {
        window.scrollTo(0, document.body.scrollHeight);
      }, 1000);
      const currentHeight = document.body.scrollHeight;
      if (currentHeight === lastHeight) {
        unchangedCount += 1;
      } else {
        unchangedCount = 0;
        lastHeight = currentHeight;
      }

      if (unchangedCount >= 6) {
        autoScrollRunning = false;
        waitingForNextBatch = false;
        autoScrollMode = null;
        showToast(`Reached the end of ${label.toLowerCase()}.`);
        return;
      }

      setTimeout(step, 1200);
    };

    setTimeout(step, 1200);
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "PING_CONTENT") {
      sendResponse({ ok: true });
      return;
    }
    if (msg?.type === "AUTO_SCROLL_BOOKMARKS") {
      if (waitingForNextBatch) {
        waitingForNextBatch = false;
      }
      startAutoScroll({ mode: "bookmarks", label: "Bookmarks", requireBookmarks: true });
    }
    if (msg?.type === "AUTO_SCROLL_VIDEOS") {
      if (waitingForNextBatch) {
        waitingForNextBatch = false;
      }
      startAutoScroll({ mode: "videos", label: "Videos", requireBookmarks: false });
    }
    if (msg?.type === "STOP_AUTO_SCROLL") {
      autoScrollRunning = false;
      waitingForNextBatch = false;
      autoScrollMode = null;
      showToast("Auto-scroll stopped.");
    }
    if (msg?.type === "GET_BOOKMARK_COUNT") {
      sendResponse({ count: getBookmarkItemCount() });
    }
    if (msg?.type === "GET_AUTO_SCROLL_STATUS") {
      sendResponse({ running: autoScrollRunning, mode: autoScrollMode });
    }
  });
})();
