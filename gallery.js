// ─── Session analytics ───────────────────────────────────────────────────────
const _galleryOpenTime = Date.now();
let _videosPlayedCount = 0;
let _gallerySent = false;
let _bubbleModeEnterTime = null;

const _sendGallerySession = () => {
  if (_gallerySent || !window.Analytics) return;
  _gallerySent = true;
  const payload = {
    time_spent_sec: Math.round((Date.now() - _galleryOpenTime) / 1000),
    videos_played: _videosPlayedCount,
  };
  if (_bubbleModeEnterTime) {
    payload.bubble_mode_sec = Math.round((Date.now() - _bubbleModeEnterTime) / 1000);
  }
  Analytics.sendEvent("gallery_session_end", payload);
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden) _sendGallerySession();
});
window.addEventListener("pagehide", _sendGallerySession);
// ─────────────────────────────────────────────────────────────────────────────

const grid = document.getElementById("grid");
const player = document.getElementById("player");
const btnClassic = document.getElementById("btn-classic");
const btnPrecog = document.getElementById("btn-precog");
const hudCount = document.getElementById("hud-count");
const bubbleField = document.getElementById("bubble-field");
const bubbleModal      = document.getElementById("bubble-modal");
const bubbleModalBg    = document.getElementById("bubble-modal-bg");
const bubbleModalVideo = document.getElementById("bubble-modal-video");
const bubbleModalClose = document.getElementById("bubble-modal-close");

let _modalBubble = null;

const openBubbleModal = (bubble) => {
  _modalBubble = bubble;
  bubbleModalVideo.src = bubble.url;
  bubbleModalVideo.currentTime = 0;
  bubbleModal.classList.add("open");
  // Reset animation so it plays every open
  const box = document.getElementById("bubble-modal-box");
  box.style.animation = "none";
  void box.offsetWidth;
  box.style.animation = "";
  bubbleModalVideo.play().catch(() => {});
};

const closeBubbleModal = () => {
  bubbleModalVideo.pause();
  bubbleModalVideo.src = "";
  bubbleModal.classList.remove("open");
  if (_modalBubble) {
    _modalBubble.pop();
    _modalBubble = null;
  }
};

bubbleModalClose.addEventListener("click", closeBubbleModal);
bubbleModalBg.addEventListener("click", closeBubbleModal);

// ─── View Mode ───────────────────────────────────────────────────────────────
const applyMode = (mode, animate = false) => {
  const isPrecog = mode === "precog";
  document.body.classList.toggle("precog-mode", isPrecog);
  btnClassic.classList.toggle("active-view", !isPrecog);
  btnPrecog.classList.toggle("active-view", isPrecog);
  if (isPrecog) {
    chrome.storage.local.get({ videoUrls: [] }, (data) => {
      startBubbles(data.videoUrls || []);
    });
    if (animate) {
      document.body.classList.add("precog-entering");
      setTimeout(() => document.body.classList.remove("precog-entering"), 500);
    }
  } else {
    stopBubbles();
  }
};

btnClassic.onclick = () => {
  if (_bubbleModeEnterTime && window.Analytics) {
    Analytics.sendEvent("bubble_mode_session", {
      time_spent_sec: Math.round((Date.now() - _bubbleModeEnterTime) / 1000),
      bubble_count: _bubbles.length,
    });
    _bubbleModeEnterTime = null;
  }
  applyMode("classic", true);
  chrome.storage.local.set({ galleryMode: "classic" });
  if (window.Analytics) Analytics.sendEvent("gallery_mode_switch", { mode: "classic" });
};

btnPrecog.onclick = () => {
  _bubbleModeEnterTime = Date.now();
  applyMode("precog", true);
  chrome.storage.local.set({ galleryMode: "precog" });
  if (window.Analytics) Analytics.sendEvent("gallery_mode_switch", { mode: "precog", bubble_count: _bubbles.length });
};
// ─────────────────────────────────────────────────────────────────────────────

// ─── Floating Bubble System ──────────────────────────────────────────────────
let _bubbles = [];
let _bubbleRafId = null;

class PrecogBubble {
  constructor(url, index, W, H) {
    this.url = url;
    this.index = index;
    this.size = 44 + Math.random() * 34;          // 44–78 px
    this.x = this.size + Math.random() * (W - this.size * 2);
    this.y = this.size + Math.random() * (H - this.size * 2);
    const speed = 0.35 + Math.random() * 0.55;
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.phase = Math.random() * Math.PI * 2;     // wobble phase offset
    this.freq  = 0.008 + Math.random() * 0.006;   // wobble frequency
    this.amp   = 0.25 + Math.random() * 0.3;      // wobble amplitude
    this.tick  = 0;
    this.hovered = false;
    this.el = this._build();
    bubbleField.appendChild(this.el);
  }

  _build() {
    const el = document.createElement("div");
    el.className = "precog-bubble";
    el.style.width  = `${this.size}px`;
    el.style.height = `${this.size}px`;
    el.style.transform = `translate(${this.x}px, ${this.y}px)`;
    // stagger the breathing animation so bubbles aren't in sync
    el.style.animationDelay = `${-Math.random() * 3}s`;

    const video = document.createElement("video");
    video.src = this.url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    // Seek to first frame so the sphere shows a thumbnail
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = 0.01;
    }, { once: true });
    el.appendChild(video);

    let _leaveTimer = null;

    el.addEventListener("mouseenter", () => {
      if (_leaveTimer) { clearTimeout(_leaveTimer); _leaveTimer = null; }
      this.hovered = true;
      el.classList.add("expanded");
      video.play().catch(() => {});
    });

    el.addEventListener("mouseleave", () => {
      _leaveTimer = setTimeout(() => {
        this.hovered = false;
        el.classList.remove("expanded");
        video.pause();
        video.currentTime = 0;
      }, 120);
    });

    el.addEventListener("click", () => {
      _videosPlayedCount += 1;
      if (window.Analytics) Analytics.sendEvent("video_play", {
        video_index: this.index,
        format: this.url.includes(".m3u8") ? "hls" : "mp4",
        video_path: normalizeUrl(this.url),
        source: "bubble_expand",
      });
      openBubbleModal(this);
    });

    return el;
  }

  update(W, H) {
    if (this.hovered) return;
    this.tick++;
    // gentle sine-wave wobble layered on top of linear velocity
    const wx = Math.sin(this.tick * this.freq + this.phase) * this.amp;
    const wy = Math.cos(this.tick * this.freq * 0.7 + this.phase) * this.amp;
    this.x += this.vx + wx;
    this.y += this.vy + wy;
    // soft bounce — flip velocity when hitting walls
    const m = this.size * 0.5;
    if (this.x < m)     { this.vx =  Math.abs(this.vx); }
    if (this.x > W - m) { this.vx = -Math.abs(this.vx); }
    if (this.y < m)     { this.vy =  Math.abs(this.vy); }
    if (this.y > H - m) { this.vy = -Math.abs(this.vy); }
    this.x = Math.max(m, Math.min(W - m, this.x));
    this.y = Math.max(m, Math.min(H - m, this.y));
    this.el.style.transform = `translate(${this.x}px, ${this.y}px)`;
  }

  pop() {
    this.hovered = false;
    this.el.classList.remove("expanded");
    this.el.classList.add("popping");
    const idx = _bubbles.indexOf(this);
    if (idx !== -1) _bubbles.splice(idx, 1);

    const cx = this.x + this.size / 2;
    const cy = this.y + this.size / 2;

    const ring = document.createElement("div");
    ring.className = "bubble-pop-ring";
    ring.style.left   = `${cx}px`;
    ring.style.top    = `${cy}px`;
    ring.style.width  = `${this.size}px`;
    ring.style.height = `${this.size}px`;
    bubbleField.appendChild(ring);

    const NUM_DROPS = 6;
    for (let i = 0; i < NUM_DROPS; i++) {
      const angle = (i / NUM_DROPS) * Math.PI * 2 + Math.random() * 0.5;
      const dist  = this.size * 0.6 + Math.random() * this.size * 0.4;
      const drop  = document.createElement("div");
      drop.className = "bubble-pop-drop";
      drop.style.left = `${cx}px`;
      drop.style.top  = `${cy}px`;
      drop.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      drop.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      drop.style.animationDelay = `${Math.random() * 40}ms`;
      bubbleField.appendChild(drop);
      setTimeout(() => drop.remove(), 560);
    }

    setTimeout(() => { this.el.remove(); ring.remove(); }, 480);
  }

  destroy() { this.el.remove(); }
}

const startBubbles = (urls) => {
  stopBubbles();
  // deduplicate same as renderGrid
  const seen = new Set();
  const unique = urls.filter(u => {
    const k = normalizeUrl(u);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const W = bubbleField.offsetWidth  || window.innerWidth;
  const H = bubbleField.offsetHeight || window.innerHeight;
  _bubbles = unique.map((url, i) => new PrecogBubble(url, i, W, H));

  const loop = () => {
    const W = bubbleField.offsetWidth;
    const H = bubbleField.offsetHeight;
    _bubbles.forEach(b => b.update(W, H));
    _bubbleRafId = requestAnimationFrame(loop);
  };
  _bubbleRafId = requestAnimationFrame(loop);
};

const stopBubbles = () => {
  if (_bubbleRafId) { cancelAnimationFrame(_bubbleRafId); _bubbleRafId = null; }
  _bubbles.forEach(b => b.destroy());
  _bubbles = [];
  bubbleModalVideo.pause();
  bubbleModalVideo.src = "";
  bubbleModal.classList.remove("open");
  _modalBubble = null;
};
// ─────────────────────────────────────────────────────────────────────────────
const copyBtn = document.getElementById("copy");
const clearBtn = document.getElementById("clear");
const exportBtn = document.getElementById("export");
const importBtn = document.getElementById("import");
const donateBtn = document.getElementById("header-donate");
const mp4OnlyToggle = document.getElementById("mp4-only");
const countEl = document.getElementById("count");
const statusEl = document.getElementById("status");
const progressBar = document.getElementById("progress-bar");
const fileInput = document.getElementById("file-input");
const versionEl = document.getElementById("version");
const langSelector = document.getElementById("lang-selector");

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

const setPlayer = (url, cardEl) => {
  if (!url) return;
  if (cardEl) {
    document.querySelectorAll(".card.precog-selected").forEach((c) => c.classList.remove("precog-selected"));
    cardEl.classList.add("precog-selected");
  }
  if (document.body.classList.contains("precog-mode")) {
    // Glitch, then load new video
    player.classList.remove("glitching");
    void player.offsetWidth; // force reflow to restart animation
    player.classList.add("glitching");
    setTimeout(() => {
      player.classList.remove("glitching");
      player.src = url;
      player.play().catch(() => {});
    }, 260);
  } else {
    player.src = url;
    player.play().catch(() => {});
  }
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
  if (!response.ok) throw new Error(I18n.getMessage("failedToLoadPlaylist", "Failed to load playlist"));
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
      if (!response.ok) throw new Error(I18n.getMessage("failedToDownloadSegment", "Failed to download segment"));
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
  if (!response.ok) throw new Error(I18n.getMessage("failedToDownloadMp4", "Failed to download MP4"));
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
  setStatus(I18n.getMessage("loadingPlaylist", "Loading playlist..."));
  setProgress(2);
  let playlistUrl = url;
  let text = await fetchText(playlistUrl);
  if (text.includes("#EXT-X-KEY")) throw new Error(I18n.getMessage("encryptedHlsNotSupported", "Encrypted HLS not supported."));

  const variant = parseVariantPlaylist(text);
  if (variant) {
    playlistUrl = resolveUrl(playlistUrl, variant);
    text = await fetchText(playlistUrl);
    if (text.includes("#EXT-X-KEY")) throw new Error(I18n.getMessage("encryptedHlsNotSupported", "Encrypted HLS not supported."));
  }

  const initSegment = parseInitSegment(text);
  if (!initSegment) {
    throw new Error(I18n.getMessage("onlyFmp4Supported", "Only fMP4 playlists (EXT-X-MAP) are supported."));
  }

  const segmentUrls = parseSegments(text).map((seg) =>
    resolveUrl(playlistUrl, seg)
  );
  if (!segmentUrls.length) throw new Error(I18n.getMessage("noSegmentsFound", "No segments found."));

  const initUrl = resolveUrl(playlistUrl, initSegment);
  setStatus(`${I18n.getMessage("downloadingSegments", "Downloading segments...")} ${segmentUrls.length}`);
  setProgress(5);
  const initBuffer = await fetch(initUrl).then((r) => r.arrayBuffer());
  const segments = await fetchSegments(
    segmentUrls,
    4,
    (done, total) => {
      if (done % 10 === 0 || done === total) {
        setStatus(`${I18n.getMessage("downloadingSegments", "Downloading segments...")} ${done}/${total}`);
      }
      setProgress(5 + Math.round((done / total) * 75));
    }
  );

  setStatus(I18n.getMessage("muxingToMp4", "Muxing to MP4..."));
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
  setStatus(I18n.getMessage("downloadComplete", "Download complete."));
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
    empty.textContent = I18n.getMessage("noVideosYet", "No videos captured yet.");
    empty.style.fontSize = "13px";
    empty.style.color = "#666";
    grid.appendChild(empty);
    countEl.textContent = `${I18n.getMessage("videos", "Videos")}: 0 (${I18n.getMessage("urls", "URLs")}: 0)`;
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
  countEl.textContent = `${I18n.getMessage("videos", "Videos")}: ${entries.length} (${I18n.getMessage("urls", "URLs")}: ${urls.length})`;
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
    downloadBtn.title = I18n.getMessage("downloadMp4", "Download MP4");
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

    card.addEventListener("click", () => {
      setPlayer(url, card);
      _videosPlayedCount += 1;
      if (window.Analytics) {
        Analytics.sendEvent("video_play", {
          video_index: index,
          resolution: entry.bestResolution
            ? `${entry.bestResolution.height}p`
            : entry.hasMp4 ? "mp4" : "hls",
          format: entry.hasHls ? "hls" : "mp4",
          total_in_grid: entries.length,
          video_path: normalizeUrl(url),
        });
      }
    });

    downloadBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const isHls = url.includes(".m3u8");
      if (window.Analytics) {
        Analytics.trackFeatureUsage("video_download", {
          format: isHls ? "hls" : "mp4",
          video_path: normalizeUrl(url),
        });
      }
      try {
        setProgress(0);
        if (isHls) {
          await downloadM3u8AsMp4(url);
        } else {
          setProgress(15);
          await downloadMp4(url);
          setStatus(I18n.getMessage("downloadComplete", "Download complete."));
          setProgress(100);
        }
      } catch (error) {
        setStatus(error?.message || I18n.getMessage("downloadFailed", "Download failed."));
        setProgress(0);
      }
    });

    grid.appendChild(card);

    if (index === 0) setPlayer(url, card);
  });

  // Update HUD count for precog mode
  if (hudCount) hudCount.textContent = entries.length;

  setupLazyVideos(grid);
};

const loadUrls = () => {
  chrome.storage.local.get({ videoUrls: [] }, (data) => {
    const urls = data.videoUrls || [];
    renderGrid(urls);
    if (document.body.classList.contains("precog-mode")) {
      startBubbles(urls);
    }
  });
};

const setVersion = () => {
  const version = chrome.runtime.getManifest().version;
  versionEl.textContent = `v${version}`;
};

copyBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("copy_urls", "gallery");
  chrome.storage.local.get({ videoUrls: [] }, (data) => {
    const text = (data.videoUrls || []).join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
  });
};

exportBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("export_urls", "gallery");
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
  if (window.Analytics) Analytics.trackButtonClick("import_urls", "gallery");
  fileInput.value = "";
  fileInput.click();
};

donateBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("donate", "gallery");
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
    if (window.Analytics) {
      Analytics.trackFeatureUsage("import_urls", { url_count: urls.length });
    }
    chrome.storage.local.set({ videoUrls: urls }, () => {
      renderGrid(urls);
    });
  };
  reader.readAsText(file);
};

clearBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("clear_urls", "gallery");
  chrome.runtime.sendMessage({ type: "CLEAR_URLS" });
  stopBubbles();
  renderGrid([]);
  player.removeAttribute("src");
  player.load();
};

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.videoUrls) {
    const urls = changes.videoUrls.newValue || [];
    renderGrid(urls);
    if (document.body.classList.contains("precog-mode")) {
      startBubbles(urls);
    }
  }
});

// Language selector
langSelector.onchange = async () => {
  const newLang = langSelector.value;
  const success = await I18n.setLanguage(newLang);
  if (success) {
    translatePage();
    // Re-render grid to update translated messages
    chrome.storage.local.get({ videoUrls: [] }, (data) => {
      renderGrid(data.videoUrls || []);
    });
  }
};

// Translate all elements with data-i18n attribute
const translatePage = () => {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = I18n.getMessage(key, el.textContent);
  });
};

// Initialize i18n and UI
const initializeGallery = async () => {
  await I18n.init();
  const currentLang = I18n.getCurrentLanguage();
  langSelector.value = currentLang;
  translatePage();
  loadUrls();
  setVersion();

  // Restore saved view mode
  chrome.storage.local.get({ galleryMode: "classic" }, (data) => {
    const mode = data.galleryMode || "classic";
    if (mode === "precog") _bubbleModeEnterTime = Date.now();
    applyMode(mode, false);
  });

  if (window.Analytics) {
    Analytics.trackPageView("gallery");
  }
};

initializeGallery();
