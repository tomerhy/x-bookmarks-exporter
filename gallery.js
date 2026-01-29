const grid = document.getElementById("grid");
const player = document.getElementById("player");
const copyBtn = document.getElementById("copy");
const clearBtn = document.getElementById("clear");
const exportBtn = document.getElementById("export");
const importBtn = document.getElementById("import");
const donateBtn = document.getElementById("donate");
const mp4OnlyToggle = document.getElementById("mp4-only");
const countEl = document.getElementById("count");
const statusEl = document.getElementById("status");
const progressBar = document.getElementById("progress-bar");
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

const extractResolution = (url) => {
  const match = url.match(/\/vid\/(\d+)x(\d+)\//);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
};

const getBestResolution = (list) => {
  let best = null;
  list.forEach((candidate) => {
    const res = extractResolution(candidate);
    if (!res) return;
    if (!best) {
      best = res;
      return;
    }
    if (res.width * res.height > best.width * best.height) {
      best = res;
    }
  });
  return best;
};

const setPlayer = (url) => {
  if (!url) return;
  player.src = url;
  player.play().catch(() => {});
};

const setStatus = (message) => {
  statusEl.textContent = message || "";
};

const setProgress = (value) => {
  const safe = Math.max(0, Math.min(100, value));
  progressBar.style.width = `${safe}%`;
};

const resolveUrl = (base, relative) => {
  try {
    return new URL(relative, base).toString();
  } catch {
    return relative;
  }
};

const parseVariantPlaylist = (text) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const variants = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
      const bandwidth = bandwidthMatch ? Number(bandwidthMatch[1]) : 0;
      const nextLine = lines[i + 1];
      if (nextLine && !nextLine.startsWith("#")) {
        variants.push({ url: nextLine, bandwidth });
      }
    }
  }
  if (!variants.length) return null;
  variants.sort((a, b) => b.bandwidth - a.bandwidth);
  return variants[0].url;
};

const parseInitSegment = (text) => {
  const match = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
  return match ? match[1] : null;
};

const parseSegments = (text) => {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
};

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to load playlist");
  return response.text();
};

const fetchSegments = async (urls, concurrency, onProgress) => {
  const results = new Array(urls.length);
  let index = 0;
  let completed = 0;

  const worker = async () => {
    while (index < urls.length) {
      const current = index;
      index += 1;
      const response = await fetch(urls[current]);
      if (!response.ok) throw new Error("Failed to download segment");
      const buffer = await response.arrayBuffer();
      results[current] = new Uint8Array(buffer);
      completed += 1;
      if (onProgress) onProgress(completed, urls.length);
    }
  };

  const pool = [];
  for (let i = 0; i < concurrency; i += 1) {
    pool.push(worker());
  }
  await Promise.all(pool);
  return results;
};

const concatBuffers = (buffers) => {
  const total = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  buffers.forEach((buf) => {
    merged.set(buf, offset);
    offset += buf.length;
  });
  return merged;
};

const downloadMp4 = async (url, filenameOverride) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to download MP4");
  const blob = await response.blob();
  const fallback = url.split("/").pop()?.split("?")[0] || "video.mp4";
  const name = filenameOverride || (fallback.endsWith(".mp4") ? fallback : `${fallback}.mp4`);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
};

const downloadM3u8AsMp4 = async (url) => {
  setStatus("Loading playlist...");
  setProgress(2);
  let playlistUrl = url;
  let text = await fetchText(playlistUrl);
  if (text.includes("#EXT-X-KEY")) throw new Error("Encrypted HLS not supported.");

  const variant = parseVariantPlaylist(text);
  if (variant) {
    playlistUrl = resolveUrl(playlistUrl, variant);
    text = await fetchText(playlistUrl);
    if (text.includes("#EXT-X-KEY")) throw new Error("Encrypted HLS not supported.");
  }

  const initSegment = parseInitSegment(text);
  if (!initSegment) {
    throw new Error("Only fMP4 playlists (EXT-X-MAP) are supported.");
  }

  const segmentUrls = parseSegments(text).map((seg) =>
    resolveUrl(playlistUrl, seg)
  );
  if (!segmentUrls.length) throw new Error("No segments found.");

  const initUrl = resolveUrl(playlistUrl, initSegment);
  setStatus(`Downloading ${segmentUrls.length} segments...`);
  setProgress(5);
  const initBuffer = await fetch(initUrl).then((r) => r.arrayBuffer());
  const segments = await fetchSegments(
    segmentUrls,
    4,
    (done, total) => {
      if (done % 10 === 0 || done === total) {
        setStatus(`Downloading segments... ${done}/${total}`);
      }
      setProgress(5 + Math.round((done / total) * 75));
    }
  );

  setStatus("Muxing to MP4...");
  setProgress(90);
  const merged = concatBuffers([new Uint8Array(initBuffer), ...segments]);
  const blob = new Blob([merged], { type: "video/mp4" });
  const fallback = playlistUrl.split("/").pop()?.split("?")[0] || "video.mp4";
  const name = fallback.replace(/\.m3u8$/i, ".mp4");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  setStatus("Download complete.");
  setProgress(100);
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
    count: list.length,
    bestResolution: getBestResolution(list),
    hasHls: list.some((u) => u.includes(".m3u8")),
    hasMp4: list.some((u) => u.includes(".mp4"))
  }));
  countEl.textContent = `Videos: ${entries.length} (URLs: ${urls.length})`;
  setStatus("");

  entries.forEach((entry, index) => {
    const url = entry.url;
    const card = document.createElement("div");
    card.className = "card";
    card.title = url;

    const cardActions = document.createElement("div");
    cardActions.className = "card-actions";
    const downloadBtn = document.createElement("button");
    downloadBtn.className = "card-btn";
    downloadBtn.type = "button";
    downloadBtn.title = "Download MP4";
    downloadBtn.textContent = "⬇";
    cardActions.appendChild(downloadBtn);

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

    if (entry.bestResolution || entry.hasHls || entry.hasMp4) {
      const quality = document.createElement("span");
      quality.className = "quality-badge";
      if (entry.bestResolution) {
        quality.textContent = `${entry.bestResolution.height}p`;
      } else if (entry.hasMp4) {
        quality.textContent = "MP4";
      } else {
        quality.textContent = "HLS";
      }
      card.appendChild(quality);
    }
    if (entry.count > 1) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = `x${entry.count}`;
      card.appendChild(badge);
    }
    card.appendChild(cardActions);
    card.appendChild(thumb);
    card.addEventListener("click", () => setPlayer(url));

    downloadBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        setProgress(0);
        if (url.includes(".m3u8")) {
          await downloadM3u8AsMp4(url);
        } else {
          setProgress(15);
          await downloadMp4(url);
          setStatus("Download complete.");
          setProgress(100);
        }
      } catch (error) {
        setStatus(error?.message || "Download failed.");
        setProgress(0);
      }
    });

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
