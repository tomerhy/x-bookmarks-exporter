// Smoke test for popup.html and gallery.html — loads each in puppeteer with
// stubbed chrome.* APIs, surfaces JS errors / console.errors, and saves a
// screenshot so you can visually verify the new UI renders correctly without
// installing the extension.
//
// Usage: node screenshots/smoke-test.js
// Exits with code 1 if any page emitted a JS error.

const puppeteer = require('puppeteer');
const path = require('path');

const chromeStub = () => {
  const noop = () => {};
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: '1.4.0' }),
      sendMessage: noop,
      getURL: (p) => `file://${p}`,
      lastError: null,
    },
    storage: {
      local: {
        get: (defaults, cb) => cb(typeof defaults === 'object' ? defaults : {}),
        set: (_data, cb) => cb && cb(),
      },
      onChanged: { addListener: noop },
    },
    tabs: {
      query: (_q, cb) => cb([]),
      sendMessage: noop,
      create: noop,
    },
    scripting: { executeScript: noop },
    i18n: { getMessage: () => '' },
  };
};

// i18n.js fetches _locales/<lang>/messages.json relative to the page. Under
// file://, Chrome blocks cross-origin fetches. Filter these as expected
// non-extension noise; flag anything else as a real bug.
const isExpectedNoise = (msg) =>
  /CORS policy|ERR_FAILED|Failed to load language|_locales\//.test(msg);

const test = async (browser, name, file, viewport) => {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errors = [];
  const noise = [];
  const collect = (entry) => {
    (isExpectedNoise(entry) ? noise : errors).push(entry);
  };
  page.on('pageerror', (err) => collect(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') collect(`console.error: ${msg.text()}`);
  });
  await page.evaluateOnNewDocument(chromeStub);
  const url = `file://${path.resolve(__dirname, '..', file)}`;
  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 800));
  const out = path.join(__dirname, `smoke-${name}.png`);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  return { name, errors, noise, out };
};

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const results = [];
  results.push(await test(browser, 'popup', 'popup.html', { width: 420, height: 700 }));
  results.push(await test(browser, 'gallery', 'gallery.html', { width: 1280, height: 900 }));
  await browser.close();

  let failed = 0;
  for (const r of results) {
    const ok = r.errors.length === 0;
    const noiseNote = r.noise.length ? ` (${r.noise.length} expected file:// noise filtered)` : '';
    console.log(`${ok ? '✓' : '✗'} ${r.name}  → ${r.out}  (${r.errors.length} real error${r.errors.length === 1 ? '' : 's'})${noiseNote}`);
    for (const e of r.errors) console.log(`    ${e}`);
    if (!ok) failed++;
  }
  process.exit(failed === 0 ? 0 : 1);
})();
