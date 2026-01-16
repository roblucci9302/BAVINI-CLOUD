import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

async function takeScreenshots() {
  const screenshotsDir = path.join(process.cwd(), 'pitch-screenshots');

  // Create directory if it doesn't exist
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  console.log('Taking screenshots of BAVINI...');

  // Screenshot 1: Main interface
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(screenshotsDir, '01-main-interface.png'), fullPage: false });
  console.log('Screenshot 1: Main interface');

  await browser.close();
  console.log(`Screenshots saved to ${screenshotsDir}`);
}

takeScreenshots().catch(console.error);
