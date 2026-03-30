const urls = new Set();
let allTimeCaptured = 0;

// Restore in-memory state from storage on service worker startup
chrome.storage.local.get({ videoUrls: [], allTimeCaptured: 0 }, (data) => {
  (data.videoUrls || []).forEach((url) => urls.add(url));
  allTimeCaptured = data.allTimeCaptured || 0;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "VIDEO_URL") {
    if (!urls.has(msg.url)) {
      urls.add(msg.url);
      allTimeCaptured += 1;
      chrome.storage.local.set({ videoUrls: [...urls], allTimeCaptured });
    }
    return;
  }

  if (msg.type === "GET_URLS") {
    sendResponse({ urls: [...urls] });
    return true;
  }

  if (msg.type === "CLEAR_URLS") {
    const sessionUrls = [...urls];
    urls.clear();
    if (sessionUrls.length > 0) {
      chrome.storage.local.get({ sessionHistory: [] }, (data) => {
        const session = {
          date: Date.now(),
          count: sessionUrls.length,
          urls: sessionUrls,
        };
        const updated = [session, ...(data.sessionHistory || [])].slice(0, 5);
        chrome.storage.local.set({ sessionHistory: updated, videoUrls: [] });
      });
    } else {
      chrome.storage.local.set({ videoUrls: [] });
    }
  }
});
