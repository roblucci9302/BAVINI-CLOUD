import { chromium } from '@playwright/test';

async function exportBusinessPlanPDF() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 794, height: 1123 } // A4 portrait at 96dpi
  });
  const page = await context.newPage();

  console.log('Loading business plan...');
  await page.goto('http://localhost:5173/BUSINESS_PLAN_BAVINI.html', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  // Wait for fonts to load
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.fonts.ready);

  // Force print media
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(1000);

  console.log('Generating PDF...');
  await page.pdf({
    path: '/Users/robespierreganro/Desktop/BAVINI_BUSINESS_PLAN.pdf',
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    preferCSSPageSize: true
  });

  await browser.close();
  console.log('PDF exported to Desktop: BAVINI_BUSINESS_PLAN.pdf');
}

exportBusinessPlanPDF().catch(console.error);
