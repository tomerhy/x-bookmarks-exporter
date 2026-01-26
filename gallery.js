const grid = document.getElementById("grid");
const player = document.getElementById("player");
const copyBtn = document.getElementById("copy");
const clearBtn = document.getElementById("clear");
const exportBtn = document.getElementById("export");
const importBtn = document.getElementById("import");
const donateBtn = document.getElementById("donate");
const countEl = document.getElementById("count");
const fileInput = document.getElementById("file-input");
const versionEl = document.getElementById("version");

const normalizeUrl = (url) => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split("?")[0];
  }
};

const setPlayer = (url) => {
  if (!url) return;
  player.src = url;
  player.play().catch(() => {});
};

const setupLazyVideos = (root) => {
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        const src = video.dataset.src;
        if (entry.isIntersecting) {
          if (!video.src) {
            video.src = src;
            video.load();
          }
        } else {
          if (video.src) {
            video.pause();
            video.removeAttribute("src");
            video.load();
            video.dataset.previewed = "";
          }
        }
      });
    },
    { root, rootMargin: "300px", threshold: 0.1 }
  );

  const videos = root.querySelectorAll("video[data-src]");
  videos.forEach((video) => observer.observe(video));
};

const renderGrid = (urls) => {
  grid.innerHTML = "";
  if (!urls.length) {
    const empty = document.createElement("div");
    empty.textContent = "No videos captured yet.";
    empty.style.fontSize = "13px";
    empty.style.color = "#666";
    grid.appendChild(empty);
    countEl.textContent = "Videos: 0 (URLs: 0)";
    return;
  }

  const grouped = new Map();
  urls.forEach((url) => {
    const key = normalizeUrl(url);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(url);
  });

  const entries = Array.from(grouped.values()).map((list) => ({
    url: list[0],
    count: list.length
  }));
  countEl.textContent = `Videos: ${entries.length} (URLs: ${urls.length})`;

  entries.forEach((entry, index) => {
    const url = entry.url;
    const card = document.createElement("div");
    card.className = "card";
    card.title = url;

    const thumb = document.createElement("video");
    thumb.className = "thumb";
    thumb.dataset.src = url;
    thumb.muted = true;
    thumb.preload = "none";
    thumb.playsInline = true;
    thumb.controls = false;

    const onPreviewReady = () => {
      if (thumb.dataset.previewed) return;
      try {
        thumb.currentTime = 0.1;
      } catch {}
    };
    const onSeeked = () => {
      thumb.pause();
      thumb.dataset.previewed = "1";
    };
    thumb.addEventListener("loadeddata", onPreviewReady);
    thumb.addEventListener("seeked", onSeeked);

    if (entry.count > 1) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = `x${entry.count}`;
      card.appendChild(badge);
    }
    card.appendChild(thumb);
    card.addEventListener("click", () => setPlayer(url));

    grid.appendChild(card);

    if (index === 0) setPlayer(url);
  });

  setupLazyVideos(grid);
};

const loadUrls = () => {
  chrome.storage.local.get({ videoUrls: [] }, (data) => {
    renderGrid(data.videoUrls || []);
  });
};

const setVersion = () => {
  const version = chrome.runtime.getManifest().version;
  versionEl.textContent = `v${version}`;
};

copyBtn.onclick = () => {
  chrome.storage.local.get({ videoUrls: [] }, (data) => {
    const text = (data.videoUrls || []).join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
  });
};

exportBtn.onclick = () => {
  chrome.storage.local.get({ videoUrls: [] }, (data) => {
    const text = (data.videoUrls || []).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "x-bookmarks-video-urls.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
};

importBtn.onclick = () => {
  fileInput.value = "";
  fileInput.click();
};

donateBtn.onclick = () => {
  window.open("https://www.patreon.com/join/THYProduction", "_blank");
};

fileInput.onchange = () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    const urls = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length);
    chrome.storage.local.set({ videoUrls: urls }, () => {
      renderGrid(urls);
    });
  };
  reader.readAsText(file);
};

clearBtn.onclick = () => {
  chrome.runtime.sendMessage({ type: "CLEAR_URLS" });
  renderGrid([]);
  player.removeAttribute("src");
  player.load();
};

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.videoUrls) {
    renderGrid(changes.videoUrls.newValue || []);
  }
});

loadUrls();
setVersion();
