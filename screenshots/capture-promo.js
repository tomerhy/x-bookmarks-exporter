const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Set viewport to exact dimensions
  await page.setViewport({ width: 1200, height: 630 });
  
  // Navigate to the promo HTML
  const promoPath = path.resolve(__dirname, 'promo-clickbait.html');
  await page.goto(`file://${promoPath}`, { waitUntil: 'networkidle0' });
  
  // Wait a bit for fonts and animations
  await new Promise(r => setTimeout(r, 1000));
  
  // Capture screenshot
  await page.screenshot({
    path: path.resolve(__dirname, 'promo-reddit-clickbait.png'),
    type: 'png'
  });
  
  console.log('✓ Captured promo-reddit-clickbait.png (1200x630)');
  
  await browser.close();
})();
