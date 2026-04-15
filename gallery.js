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
  // wait for modal close animation to finish, then pop the bubble
  const target = _modalBubble;
  _modalBubble = null;
  if (target) setTimeout(() => target.pop(), 380);
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
      startBubbles(normalizeVideoItems(data.videoUrls || []));
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

// ─── 2D Canvas Bubble Renderer ───────────────────────────────────────────────
let _bubbles = [];
let _bubbleRafId = null;
let _bubbleCanvas = null;
let _bubbleCtx = null;

// Draw one sphere onto the 2D canvas with proper lighting layers:
//   1. video texture (or dark placeholder)
//   2. diffuse gradient — light upper-left, shadow lower-right (key 3D cue)
//   3. limb darkening  — edges curve away from viewer
//   4. specular        — sharp bright dot upper-left
//   5. hover glow overlay + rim stroke
function _drawBubble(ctx, b) {
  if (b.alpha <= 0.01) return;
  const { x, y, currentR: r, video, hovered, glowT, alpha } = b;
  const sc = b._spawnScale;

  ctx.save();
  ctx.globalAlpha = alpha;
  // spawn scale-in: grow from 0 around the bubble's center
  if (sc < 1) {
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.translate(-x, -y);
  }

  // clip to circle
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();

  // 1. video texture — scrolled along the bubble's tilt axis to simulate
  //    rotation in a random direction (not all horizontal)
  //    Lighting stays fixed; only the surface texture moves.
  const dW = r * 2.12, dH = r * 2.12;
  const t   = (b.rotationY % (Math.PI * 2)) / (Math.PI * 2);
  const sX  = Math.cos(b.tiltAngle) * t * dW;
  const sY  = Math.sin(b.tiltAngle) * t * dH;
  const tx0 = x - r * 1.06 + sX;
  const ty0 = y - r * 1.06 + sY;
  if (video.readyState >= 2) {
    // 3×3 grid so wrap-around works in any scroll direction
    for (let row = -1; row <= 1; row++) {
      for (let col = -1; col <= 1; col++) {
        ctx.drawImage(video, tx0 + col * dW, ty0 + row * dH, dW, dH);
      }
    }
  } else {
    ctx.fillStyle = "#00091c";
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 2. diffuse gradient — simulates directional light from upper-left
  //    lit side (upper-left) stays clear; shadow side (lower-right) darkens
  const gDiff = ctx.createRadialGradient(
    x - r * 0.25, y - r * 0.30, r * 0.05,
    x + r * 0.35, y + r * 0.40, r * 1.4
  );
  gDiff.addColorStop(0,    "rgba(255,255,255,0.0)");  // bright side — no tint
  gDiff.addColorStop(0.40, "rgba(0,4,18,0.08)");
  gDiff.addColorStop(0.70, "rgba(0,3,14,0.40)");
  gDiff.addColorStop(1.0,  "rgba(0,1,8,0.72)");       // dark shadow side
  ctx.fillStyle = gDiff;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);

  // 3. limb darkening — radial falloff from center; edges nearly black
  const gLimb = ctx.createRadialGradient(x, y, r * 0.42, x, y, r);
  gLimb.addColorStop(0,    "rgba(0,0,0,0)");
  gLimb.addColorStop(0.60, "rgba(0,0,0,0)");
  gLimb.addColorStop(0.78, "rgba(0,2,12,0.42)");
  gLimb.addColorStop(0.90, "rgba(0,1,8,0.74)");
  gLimb.addColorStop(1.0,  "rgba(0,0,5,0.92)");
  ctx.fillStyle = gLimb;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);

  // 4. specular highlight — small, sharp, very bright dot upper-left
  const sx = x - r * 0.33, sy = y - r * 0.36;
  const gSpec = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.36);
  gSpec.addColorStop(0,    "rgba(255,255,255,0.96)");
  gSpec.addColorStop(0.15, "rgba(235,248,255,0.75)");
  gSpec.addColorStop(0.42, "rgba(180,222,255,0.28)");
  gSpec.addColorStop(1.0,  "rgba(0,0,0,0)");
  ctx.fillStyle = gSpec;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);

  // 5. hover glow tint
  if (glowT > 0.01) {
    const gGlow = ctx.createRadialGradient(x, y, 0, x, y, r);
    gGlow.addColorStop(0,   `rgba(0,100,200,0)`);
    gGlow.addColorStop(0.65,`rgba(0,90,190,${0.10 * glowT})`);
    gGlow.addColorStop(1.0, `rgba(0,212,255,${0.28 * glowT})`);
    ctx.fillStyle = gGlow;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  ctx.restore(); // end circular clip

  // 6. rim stroke — drawn outside clip so it's clean
  ctx.save();
  ctx.globalAlpha = alpha * (hovered ? 0.85 : 0.25);
  ctx.beginPath();
  ctx.arc(x, y, r - 0.8, 0, Math.PI * 2);
  ctx.strokeStyle = hovered ? "rgba(0,212,255,1)" : "rgba(0,150,220,1)";
  ctx.lineWidth = hovered ? 1.8 : 1.2;
  ctx.stroke();
  ctx.restore();
}

function _initBubbleCanvas() {
  _bubbleCanvas = document.createElement("canvas");
  _bubbleCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:default;";
  bubbleField.appendChild(_bubbleCanvas);
  _bubbleCtx = _bubbleCanvas.getContext("2d");
  _resizeBubbleCanvas();
  _bubbleCanvas.addEventListener("mousemove",  _onBubbleMouseMove);
  _bubbleCanvas.addEventListener("mouseleave", _onBubbleMouseLeave);
  _bubbleCanvas.addEventListener("click",      _onBubbleClick);
}

function _resizeBubbleCanvas() {
  if (!_bubbleCanvas) return;
  const W = bubbleField.clientWidth  || window.innerWidth;
  const H = bubbleField.clientHeight || (window.innerHeight - 60);
  _bubbleCanvas.width  = W;
  _bubbleCanvas.height = H;
}

function _teardownBubbleCanvas() {
  if (_bubbleCanvas) {
    _bubbleCanvas.removeEventListener("mousemove",  _onBubbleMouseMove);
    _bubbleCanvas.removeEventListener("mouseleave", _onBubbleMouseLeave);
    _bubbleCanvas.removeEventListener("click",      _onBubbleClick);
    _bubbleCanvas.remove();
    _bubbleCanvas = null;
    _bubbleCtx = null;
  }
}

let _hoverLeaveTimer = null;

function _hitBubble(mx, my) {
  for (let i = _bubbles.length - 1; i >= 0; i--) {
    const b = _bubbles[i];
    if (b._popping || !b._ready) continue;
    const dx = mx - b.x, dy = my - b.y;
    if (Math.sqrt(dx * dx + dy * dy) <= b.currentR + 5) return b;
  }
  return null;
}
function _setHovered(hit) {
  for (const b of _bubbles) b.setHovered(b === hit);
}
function _onBubbleMouseMove(e) {
  const rect = _bubbleCanvas.getBoundingClientRect();
  const hit  = _hitBubble(e.clientX - rect.left, e.clientY - rect.top);
  if (_hoverLeaveTimer) { clearTimeout(_hoverLeaveTimer); _hoverLeaveTimer = null; }
  if (hit) _setHovered(hit);
  else _hoverLeaveTimer = setTimeout(() => _setHovered(null), 100);
  _bubbleCanvas.style.cursor = hit ? "pointer" : "default";
}
function _onBubbleMouseLeave() {
  if (_hoverLeaveTimer) clearTimeout(_hoverLeaveTimer);
  _hoverLeaveTimer = setTimeout(() => _setHovered(null), 150);
}
function _onBubbleClick(e) {
  const rect = _bubbleCanvas.getBoundingClientRect();
  const hit  = _hitBubble(e.clientX - rect.left, e.clientY - rect.top);
  if (!hit) return;
  _videosPlayedCount += 1;
  if (window.Analytics) {
    const p = {
      video_index: hit.index,
      format: hit.url.includes(".m3u8") ? "hls" : "mp4",
      video_path: normalizeUrl(hit.url),
      video_url: hit.url,
      tweet_url: hit.url,
      source: "bubble_expand",
    };
    Analytics.sendEvent("video_play", p);
  }
  openBubbleModal(hit);
}

class PrecogBubble {
  constructor(url, tweetId, index, W, H) {
    this.url = url;
    this.tweetId = tweetId;
    this.index = index;
    const r    = 32 + Math.random() * 24;   // 32–56 px radius → 64–112 px diameter
    this._r    = r;
    this.currentR = r;
    this.x     = r + Math.random() * (W - r * 2);
    this.y     = r + Math.random() * (H - r * 2);
    const spd  = 0.12 + Math.random() * 0.18;
    const ang  = Math.random() * Math.PI * 2;
    this.vx    = Math.cos(ang) * spd;
    this.vy    = Math.sin(ang) * spd;
    this.phase = Math.random() * Math.PI * 2;
    this.freq  = 0.004 + Math.random() * 0.003;
    this.amp   = 0.10  + Math.random() * 0.12;
    this.tick  = 0;
    this.hovered   = false;
    this._popping  = false;
    this.glowT     = 0;
    this.alpha      = 0;     // hidden until first frame is decoded
    this._spawnScale = 0;    // grows 0→1 on reveal
    this._ready     = false;
    this.rotationY  = Math.random() * Math.PI * 2;
    this.rotSpeedY  = (0.003 + Math.random() * 0.004) * (Math.random() < 0.5 ? 1 : -1);
    // random tilt axis: 0 = pure horizontal scroll, π/2 = pure vertical, etc.
    this.tiltAngle  = Math.random() * Math.PI;

    const v = document.createElement("video");
    v.src = url; v.muted = true; v.loop = true; v.playsInline = true; v.preload = "metadata";
    // seek to first frame on metadata load, then wait for seeked to confirm frame is ready
    v.addEventListener("loadedmetadata", () => { v.currentTime = 0.01; }, { once: true });
    v.addEventListener("seeked", () => { this._ready = true; }, { once: true });
    this.video = v;
  }

  setHovered(h) {
    if (this.hovered === h || this._popping) return;
    this.hovered = h;
    if (h) this.video.play().catch(() => {});
    else   { this.video.pause(); this.video.currentTime = 0; }
  }

  update(W, H) {
    if (this._popping) {
      this.alpha -= 0.07;
      if (this.alpha <= 0) {
        const i = _bubbles.indexOf(this);
        if (i !== -1) _bubbles.splice(i, 1);
        this.video.pause(); this.video.src = "";
      }
      return;
    }
    // animate spawn reveal once first frame is decoded
    if (this._ready && this._spawnScale < 1) {
      this._spawnScale = Math.min(1, this._spawnScale + 0.055); // ~18 frames ≈ 0.3s
      this.alpha       = Math.min(1, this.alpha       + 0.055);
    }
    if (!this._ready) return; // stay invisible while loading

    const tR = this.hovered ? this._r * 1.45 : this._r;
    this.currentR += (tR - this.currentR) * 0.10;
    this.glowT    += ((this.hovered ? 1 : 0) - this.glowT) * 0.10;
    if (this.hovered) return;

    this.tick++;
    this.rotationY += this.rotSpeedY;
    const wx = Math.sin(this.tick * this.freq + this.phase) * this.amp;
    const wy = Math.cos(this.tick * this.freq * 0.7 + this.phase) * this.amp;
    this.x += this.vx + wx;
    this.y += this.vy + wy;

    const r = this._r;
    if (this.x < r)     this.vx =  Math.abs(this.vx);
    if (this.x > W - r) this.vx = -Math.abs(this.vx);
    if (this.y < r)     this.vy =  Math.abs(this.vy);
    if (this.y > H - r) this.vy = -Math.abs(this.vy);
    this.x = Math.max(r, Math.min(W - r, this.x));
    this.y = Math.max(r, Math.min(H - r, this.y));
  }

  pop() {
    if (this._popping) return;
    this._popping = true;
    this.hovered  = false;
    this.video.pause();

    const ring = document.createElement("div");
    ring.className = "bubble-pop-ring";
    ring.style.cssText = `left:${this.x}px;top:${this.y}px;width:${this.currentR * 2}px;height:${this.currentR * 2}px`;
    bubbleField.appendChild(ring);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const d = this.currentR * 1.2 + Math.random() * this.currentR * 0.8;
      const drop = document.createElement("div");
      drop.className = "bubble-pop-drop";
      drop.style.cssText = `left:${this.x}px;top:${this.y}px;animation-delay:${Math.random() * 40}ms`;
      drop.style.setProperty("--dx", `${Math.cos(a) * d}px`);
      drop.style.setProperty("--dy", `${Math.sin(a) * d}px`);
      bubbleField.appendChild(drop);
      setTimeout(() => drop.remove(), 580);
    }
    setTimeout(() => ring.remove(), 500);
  }

  destroy() { this.video.pause(); this.video.src = ""; }
}

const startBubbles = (items) => {
  stopBubbles();
  const seen = new Set();
  const unique = [];
  for (const it of items) {
    const u = typeof it === "string" ? it : it?.url;
    if (!u) continue;
    const k = normalizeUrl(u);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(typeof it === "string" ? { url: it } : it);
  }
  _initBubbleCanvas();
  const W = _bubbleCanvas.width, H = _bubbleCanvas.height;
  _bubbles = unique.map((it, i) => new PrecogBubble(it.url, it.tweetId, i, W, H));
  const loop = () => {
    const W = _bubbleCanvas.width, H = _bubbleCanvas.height;
    _bubbleCtx.clearRect(0, 0, W, H);
    for (const b of [..._bubbles]) b.update(W, H);
    for (const b of _bubbles) _drawBubble(_bubbleCtx, b);
    _bubbleRafId = requestAnimationFrame(loop);
  };
  _bubbleRafId = requestAnimationFrame(loop);
};

const stopBubbles = () => {
  if (_bubbleRafId) { cancelAnimationFrame(_bubbleRafId); _bubbleRafId = null; }
  for (const b of _bubbles) b.destroy();
  _bubbles = [];
  _teardownBubbleCanvas();
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

let _tweetMap = {};

const normalizeVideoItems = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return { url: item };
      if (item && typeof item.url === "string") {
        return {
          url: item.url,
          tweetId: item.tweetId ? String(item.tweetId) : undefined,
        };
      }
      return null;
    })
    .filter((x) => x && x.url && x.url.includes("video.twimg.com"));
};

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

const renderGrid = (raw) => {
  const items = normalizeVideoItems(Array.isArray(raw) ? raw : []);
  grid.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.textContent = I18n.getMessage("noVideosYet", "No videos captured yet.");
    empty.style.fontSize = "13px";
    empty.style.color = "#666";
    grid.appendChild(empty);
    countEl.textContent = `${I18n.getMessage("videos", "Videos")}: 0 (${I18n.getMessage("urls", "URLs")}: 0)`;
    return;
  }

  const grouped = new Map();
  items.forEach((item) => {
    const key = normalizeUrl(item.url);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });

  const entries = Array.from(grouped.values()).map((list) => {
    const urls = list.map((x) => x.url);
    const tweetId = list.map((x) => x.tweetId).find(Boolean);
    return {
      url: list[0].url,
      tweetId,
      variantUrls: urls,
      count: list.length,
      bestResolution: getBestResolution(urls),
      hasHls: urls.some((u) => u.includes(".m3u8")),
      hasMp4: urls.some((u) => u.includes(".mp4")),
    };
  });
  countEl.textContent = `${I18n.getMessage("videos", "Videos")}: ${entries.length} (${I18n.getMessage("urls", "URLs")}: ${items.length})`;
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
          video_url: url,
          tweet_url: url,
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
          video_url: url,
          tweet_url: url,
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
  chrome.storage.local.get({ videoUrls: [], videoTweetMap: {} }, (data) => {
    _tweetMap = { ...(data.videoTweetMap || {}) };
    const items = normalizeVideoItems(data.videoUrls || []);
    items.forEach(({ url, tweetId }) => {
      if (!tweetId) return;
      _tweetMap[url] = tweetId;
      try {
        const u = new URL(url);
        _tweetMap[`${u.origin}${u.pathname}`] = tweetId;
      } catch {}
    });
    renderGrid(items);
    if (document.body.classList.contains("precog-mode")) {
      startBubbles(items);
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
    const lines = normalizeVideoItems(data.videoUrls || []).map((x) => x.url);
    const text = lines.join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
  });
};

exportBtn.onclick = () => {
  if (window.Analytics) Analytics.trackButtonClick("export_urls", "gallery");
  chrome.storage.local.get({ videoUrls: [] }, (data) => {
    const lines = normalizeVideoItems(data.videoUrls || []).map((x) => x.url);
    const text = lines.join("\n");
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
    const urlLines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length);
    if (window.Analytics) {
      Analytics.trackFeatureUsage("import_urls", { url_count: urlLines.length });
    }
    const videoUrls = urlLines.map((u) => ({ url: u }));
    chrome.storage.local.set({ videoUrls }, () => {
      renderGrid(videoUrls);
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
  if (changes.videoTweetMap) {
    Object.assign(_tweetMap, changes.videoTweetMap.newValue || {});
  }
  if (changes.videoUrls) {
    const raw = changes.videoUrls.newValue || [];
    const items = normalizeVideoItems(raw);
    renderGrid(items);
    if (document.body.classList.contains("precog-mode")) {
      startBubbles(items);
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

  // Always start in classic mode (bubble mode hidden for now)
  applyMode("classic", false);

  if (window.Analytics) {
    Analytics.trackPageView("gallery");
  }
};

initializeGallery();
