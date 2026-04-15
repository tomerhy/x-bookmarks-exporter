(() => {
  if (window.__xBookmarksExporterInjected) return;
  window.__xBookmarksExporterInjected = true;
  const send = (url, tweetId) => {
    if (!url) return;
    if (!url.includes("video.twimg.com")) return;
    if (url.includes("mp4a") || url.includes("avc1")) return;
    if (url.includes(".mp4") || url.includes(".m3u8")) {
      try {
        if (!chrome?.runtime?.id) return;
        const msg = { type: "VIDEO_URL", url };
        if (tweetId) msg.tweetId = tweetId;
        chrome.runtime.sendMessage(msg);
      } catch {}
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
        clone.json().then(runExtractors).catch(() => {});
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
        runExtractors(JSON.parse(response));
      } catch {}
    });
    return originalSend.apply(this, args);
  };

  function shouldInspectJson(url, response) {
    if (!url) return false;
    const u = String(url).toLowerCase();
    const isGraphql = u.includes("graphql");
    if (!isGraphql && !u.includes("/timeline/") && !u.includes("bookmark")) return false;
    if (isGraphql) return true;
    const contentType =
      response?.headers?.get?.("content-type") ||
      response?.getResponseHeader?.("content-type") ||
      "";
    return contentType.includes("json");
  }

  function normalizeTweetId(raw) {
    if (raw == null || raw === "") return null;
    const s = String(raw).trim();
    return /^\d+$/.test(s) ? s : null;
  }

  /** Parse /status/123… from expanded_url (X often omits parent tweet id elsewhere). */
  function tweetIdFromExpandedUrl(m) {
    const candidates = [m?.expanded_url, m?.url, m?.display_url].filter(Boolean);
    for (const s of candidates) {
      const str = String(s);
      const m2 = str.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i);
      if (m2) return normalizeTweetId(m2[1]);
      const mWeb = str.match(/\/i\/web\/status\/(\d+)/i);
      if (mWeb) return normalizeTweetId(mWeb[1]);
      const m3 = str.match(/\/status\/(\d+)/);
      if (m3) return normalizeTweetId(m3[1]);
    }
    return null;
  }

  /** Tweet id for a media object (retweets point to original tweet). */
  function tweetIdForMedia(m, fallbackTweetId) {
    const fromMedia = normalizeTweetId(m?.source_status_id_str);
    if (fromMedia) return fromMedia;
    const fromUrl = tweetIdFromExpandedUrl(m);
    if (fromUrl) return fromUrl;
    return normalizeTweetId(fallbackTweetId);
  }

  /** Infer tweet id from a node that may be Tweet, TweetWithVisibilityResults, etc. */
  function tweetIdFromNode(node) {
    if (!node || typeof node !== "object") return null;
    const legacyId = normalizeTweetId(node.legacy?.id_str);
    if (legacyId) return legacyId;
    const rest = normalizeTweetId(node.rest_id);
    if (rest) return rest;
    return normalizeTweetId(node.id_str);
  }

  /**
   * Walk JSON with inherited tweet id so nested legacy/extended_entities
   * still get the id from the parent Tweet (fixes GA "Tweet URL" = not set).
   */
  function extractVideoVariants(root) {
    const stack = [{ node: root, tweetId: null }];
    while (stack.length) {
      const { node, tweetId: parentTweetId } = stack.pop();
      if (node == null) continue;
      if (typeof node !== "object") continue;

      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) {
          stack.push({ node: node[i], tweetId: parentTweetId });
        }
        continue;
      }

      const ownId = tweetIdFromNode(node);
      const tweetId = ownId || parentTweetId;

      const media =
        node.legacy?.extended_entities?.media ||
        node.extended_entities?.media ||
        node.entities?.media;

      if (media?.length) {
        for (const m of media) {
          if (!m?.video_info?.variants?.length) continue;
          const id = tweetIdForMedia(m, tweetId);
          if (!id) continue;
          m.video_info.variants.forEach((v) => send(v.url, id));
        }
      }

      const childTweetId = ownId || parentTweetId;
      for (const v of Object.values(node)) {
        stack.push({ node: v, tweetId: childTweetId });
      }
    }
  }

  /** Catch video media nodes that sit without a parent Tweet in the same branch. */
  function extractOrphanVideoMedia(root) {
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node)) {
        for (const x of node) stack.push(x);
        continue;
      }
      if (node.video_info?.variants?.length) {
        const id =
          tweetIdFromExpandedUrl(node) ||
          normalizeTweetId(node.source_status_id_str);
        if (id) {
          node.video_info.variants.forEach((v) => send(v.url, id));
        }
      }
      for (const v of Object.values(node)) stack.push(v);
    }
  }

  function runExtractors(json) {
    try {
      extractVideoVariants(json);
      extractOrphanVideoMedia(json);
    } catch {}
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
