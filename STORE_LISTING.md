# Chrome Web Store Listing

Source of truth for the store listing copy. Edit this file when shipping a
new release, then paste the relevant sections into the Chrome Web Store
Developer Dashboard.

**Last updated for**: v1.4.0 (2026-05-25)

---

## Short description (manifest.json `description` field)

Limit: **132 characters** (Chrome Web Store hard limit). Shown in search
results and the listing card. Make it count.

```
Download videos from your X (Twitter) bookmarks. Auto-scroll capture, gallery preview, one-click MP4/HLS download.
```

(115 / 132 chars)

> ⚠️ This extension uses i18n for the manifest description
> (`"description": "__MSG_extDescription__"`). When this changes:
> 1. Update `_locales/en/messages.json` → `extDescription.message`.
> 2. Update `_locales/fr/`, `de/`, `es/` to match (or get them translated).
> 3. Update this section.
> 4. All four locale files + this doc should agree.

---

## Detailed description (Store listing → Detailed description)

Limit: **16,000 characters**. Use markdown-flavored text — Chrome Web
Store ignores most markdown but renders line breaks and bullet symbols.

```text
🎬 X Video Exporter — Save Videos from Your X (Twitter) Bookmarks

The simplest way to back up videos from your X (Twitter) bookmarks.
Auto-scroll through your saved posts, capture every video URL, and
download them as MP4 — all from your browser, with nothing uploaded
anywhere.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ KEY FEATURES:

📜 Auto-Scroll Capture
One click in the popup scrolls through your X bookmarks for you and
collects every video URL it finds along the way. Stop any time — your
captures stay saved.

🎥 Quality Selection
Automatically detects the highest-quality variant for each video
(1080p / 720p / 480p) so you always download the best version.

⬇️ One-Click Download
Download any video as MP4. Direct MP4 streams download instantly.
HLS streams are demuxed in-browser into a clean .mp4 file — no extra
tools required.

🖼️ Visual Gallery
Browse all captured videos in a clean dark gallery. Click any thumbnail
to preview it inline. Quality badge on every card so you know what
you're about to download.

📤 Export & Import URL Lists
Save your captured URL list as a .txt file you can re-import later, or
copy the whole list to your clipboard.

🌍 Multi-Language
Available in English, French, German, and Spanish.

🔒 100% Private
Everything runs locally in YOUR browser. No data is ever sent to
external servers. No account required. No tracking.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 HOW TO USE:

1️⃣ Go to your X bookmarks page (x.com → Bookmarks)
2️⃣ Click the X Video Exporter icon in your browser toolbar
3️⃣ Click "Auto Scroll" to start capturing — let it run while you grab
   a coffee
4️⃣ Click "Open Gallery" to browse and download your videos

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 PERFECT FOR:
• Content creators backing up reference clips from their bookmarks
• Social media managers saving examples for later
• Anyone who wants their favorite X videos available offline
• Video editors collecting reference material

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🆓 Completely FREE — no premium features, no subscriptions, no limits.

Questions or feedback? Click the extension icon, then click the logo
to see contact info — or email tomer.haryoffi@gmail.com.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Note: This extension is not affiliated with X Corp or Twitter. Please
respect copyright and only download content you have the right to save.
```

---

## What's New in this version (Store listing → What's new in this version)

This is the changelog shown to existing users when they update. Keep it
short — only the most recent release. Past entries are still useful for
context but compress them.

### v1.4.0 — UI refresh

```text
v1.4.0 — UI refresh + safety nets

NEW
• Brand new look: X-blue palette across the popup, gallery, and landing
  page — feels native to X now
• Sharper icons throughout (Lucide-style line icons replace every emoji
  in the UI for crisp, themable visuals)
• Helpful empty states in both the popup and the gallery — clear hint
  for what to do next when there's nothing captured yet
• Two-click confirmation on Clear so you don't accidentally lose your
  captured library
• Toast confirmations after Copy / Export / Import / Clear so you know
  the action actually fired
• About-the-maker card — click the logo in the popup

POLISH
• Gallery stacks gracefully on narrower windows
• Visible focus rings everywhere for keyboard navigation
• Honors prefers-reduced-motion for users with motion sensitivity
• No more auto-play when you open the gallery — silent until you pick
  a video

Recent shipped:
v1.3.0 — Analytics improvements (cleaner video / tweet URL tracking)
v1.2.1 — Bubble Mode UI polish
v1.2.0 — Bubble Mode gallery (an immersive 2D-canvas video field)
v1.1.1 — Buy Me a Coffee support
v1.1.0 — Multi-language support (en / fr / de / es)
```

---

## Screenshots

Listed at `screenshots/screenshot-*-1280x800.png`. All 1280×800.

| # | File | Description |
|---|---|---|
| 1 | screenshot-popup-1280x800.png | Popup toolbar — "Auto-scroll your bookmarks, capture every video URL." |
| 2 | screenshot-gallery-1280x800.png | Gallery view — "Browse captured videos with one-click MP4 download." |

To regenerate after UI changes:
1. Update the mock pages in `screenshots/mock-*.html` if the UI moved.
2. Run `node screenshots/capture.js` (or whichever the current capture
   script is) to produce fresh `screenshot-*-1280x800.png` images.
3. Upload the resulting files via the store dashboard.

---

## Category / tags (Store listing → Category)

- **Category**: Productivity
- **Tags / search keywords**: x, twitter, bookmarks, video, download,
  exporter, backup, mp4, hls, gallery

---

## Pre-submission checklist

Before clicking "Submit for review" on a new version:

- [ ] `manifest.json` version bumped (X.Y.Z, integers only — Chrome
      rejects any non-numeric suffix)
- [ ] `package.json` version bumped to match (the `bump-version.js`
      script only touches manifest — package.json must be updated by
      hand or you'll ship a mismatch)
- [ ] `extDescription` in **all four** locale files (`en`, `fr`, `de`,
      `es`) matches the **Short description** section above
- [ ] Built zip is fresh: `./build.sh` produces
      `dist/x-bookmarks-exporter.zip` and it loads cleanly via
      "Load unpacked" before upload
- [ ] Manual QA pass on a real X account — at minimum:
      Auto Scroll on the bookmarks page → captures show up → gallery
      grid renders → MP4 download works → HLS download works →
      Export / Import roundtrip → Clear with two-click confirm
- [ ] Detailed description above updated to reflect any new
      user-visible features
- [ ] "What's new in this version" section above updated with the
      latest changes
- [ ] Screenshots regenerated if any UI moved significantly
- [ ] Tag the release commit: `git tag -a vX.Y.Z -m "vX.Y.Z release"`
      and `git push origin vX.Y.Z`

---

## Notes on past versions

- **v1.4.0** (2026-05-25): UI refresh — X-blue palette, Lucide icon
  sprite, empty states, two-click clear confirmation, action toasts,
  About-the-maker easter egg, gallery responsive at <1024px, Bubble
  Mode moved behind Cmd/Ctrl+Shift+B hotkey, no auto-play on gallery
  open.
- **v1.3.0**: Analytics improvements — strip query/hash from video URLs
  so the .m3u8 URL in GA matches the export line, drop the amplify
  guess for tweet_url.
- **v1.2.1**: Bubble Mode UI polish.
- **v1.2.0**: Bubble Mode gallery — immersive 2D-canvas video field
  with floating sphere previews.
- **v1.1.1**: Buy Me a Coffee support banner.
- **v1.1.0**: Multi-language support (en / fr / de / es).
