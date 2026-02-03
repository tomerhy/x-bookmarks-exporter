const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Capture gallery screenshot
  await page.setViewport({ width: 1280, height: 800 });
  const galleryPath = path.join(__dirname, 'mock-gallery.html');
  await page.goto(`file://${galleryPath}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({
    path: path.join(__dirname, 'screenshot-gallery-1280x800.png'),
    type: 'png'
  });
  console.log('Screenshot saved: screenshot-gallery-1280x800.png');
  
  // Capture popup screenshot
  await page.setViewport({ width: 380, height: 420 });
  const popupPath = path.join(__dirname, 'mock-popup.html');
  await page.goto(`file://${popupPath}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({
    path: path.join(__dirname, 'screenshot-popup.png'),
    type: 'png'
  });
  console.log('Screenshot saved: screenshot-popup.png');
  
  await browser.close();
})();
