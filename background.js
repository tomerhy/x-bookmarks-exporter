const urls = new Set();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "VIDEO_URL") {
    urls.add(msg.url);
    chrome.storage.local.set({ videoUrls: [...urls] });
  }

  if (msg.type === "GET_URLS") {
    sendResponse({ urls: [...urls] });
  }

  if (msg.type === "CLEAR_URLS") {
    urls.clear();
    chrome.storage.local.set({ videoUrls: [] });
  }
});
