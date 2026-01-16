/**
 * Smoke Tests E2E - Tests de base pour vérifier que l'application fonctionne
 */

import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');

    // Vérifier que la page charge
    await expect(page).toHaveTitle(/BAVINI/i);
  });

  test('should have main layout elements', async ({ page }) => {
    await page.goto('/');

    // Vérifier les éléments de base
    await expect(page.locator('main')).toBeVisible();
  });

  test('should be responsive', async ({ page }) => {
    // Test mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();

    // Test tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();

    // Test desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
  });
});
