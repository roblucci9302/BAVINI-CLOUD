import { chromium } from '@playwright/test';

async function exportPDF() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1123, height: 794 } // A4 landscape at 96dpi
  });
  const page = await context.newPage();

  console.log('Loading pitch deck...');
  await page.goto('http://localhost:5174/PITCH_DECK_BAVINI.html', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  // Wait for fonts and images to load
  await page.waitForTimeout(2000);

  // Ensure all fonts are loaded
  await page.evaluate(() => document.fonts.ready);

  // Force print media styles
  await page.emulateMedia({ media: 'print' });

  // Wait for styles to apply
  await page.waitForTimeout(1000);

  console.log('Generating PDF...');
  await page.pdf({
    path: '/Users/robespierreganro/Desktop/BAVINI_PITCH_DECK.pdf',
    width: '297mm',
    height: '210mm',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: false,
    scale: 1
  });

  await browser.close();
  console.log('PDF exported to Desktop: BAVINI_PITCH_DECK.pdf');
}

exportPDF().catch(console.error);
