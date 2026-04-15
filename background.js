const byUrl = new Map();
let allTimeCaptured = 0;

function pathKey(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

function migrateStorage(data) {
  const legacyMap = data.videoTweetMap || {};
  (data.videoUrls || []).forEach((item) => {
    const url = typeof item === "string" ? item : item?.url;
    if (!url || !url.includes("video.twimg.com")) return;
    let tid =
      (typeof item === "object" && item.tweetId && String(item.tweetId)) ||
      legacyMap[url] ||
      legacyMap[pathKey(url)];
    byUrl.set(url, {
      url,
      tweetId: tid ? String(tid) : undefined,
    });
  });
  if (typeof data.allTimeCaptured === "number") {
    allTimeCaptured = data.allTimeCaptured;
  } else {
    allTimeCaptured = byUrl.size;
  }
}

chrome.storage.local.get(
  { videoUrls: [], allTimeCaptured: 0, videoTweetMap: {} },
  migrateStorage
);

function persist() {
  const videoTweetMap = {};
  for (const { url, tweetId } of byUrl.values()) {
    if (tweetId) {
      videoTweetMap[url] = tweetId;
      try {
        videoTweetMap[pathKey(url)] = tweetId;
      } catch {}
    }
  }
  chrome.storage.local.set({
    videoUrls: [...byUrl.values()],
    allTimeCaptured,
    videoTweetMap,
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "VIDEO_URL") {
    if (!msg.url || !msg.url.includes("video.twimg.com")) return;
    const prev = byUrl.get(msg.url);
    const mergedTid =
      (msg.tweetId && String(msg.tweetId)) || prev?.tweetId;
    const isNew = !prev;
    byUrl.set(msg.url, { url: msg.url, tweetId: mergedTid });
    if (isNew) allTimeCaptured += 1;
    persist();
    return;
  }

  if (msg.type === "GET_URLS") {
    sendResponse({ urls: [...byUrl.keys()] });
    return true;
  }

  if (msg.type === "CLEAR_URLS") {
    const sessionUrls = [...byUrl.values()];
    byUrl.clear();
    if (sessionUrls.length > 0) {
      chrome.storage.local.get({ sessionHistory: [] }, (data) => {
        const session = {
          date: Date.now(),
          count: sessionUrls.length,
          urls: sessionUrls.map((x) => x.url),
        };
        const updated = [session, ...(data.sessionHistory || [])].slice(0, 5);
        chrome.storage.local.set({
          sessionHistory: updated,
          videoUrls: [],
          videoTweetMap: {},
        });
      });
    } else {
      chrome.storage.local.set({ videoUrls: [], videoTweetMap: {} });
    }
  }
});
