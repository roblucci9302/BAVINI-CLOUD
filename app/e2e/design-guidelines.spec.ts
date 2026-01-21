/**
 * Design Guidelines E2E Tests
 *
 * Tests for the design guidelines settings in the Interface panel.
 *
 * @module e2e/design-guidelines.spec
 */

import { test, expect } from '@playwright/test';

test.describe('Design Guidelines Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the page to be fully loaded
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });
  });

  test('should open settings modal via sidebar', async ({ page }) => {
    // Trigger the sidebar menu by moving mouse to left edge
    await page.mouse.move(10, 300);
    await page.waitForTimeout(500);

    // Click the settings button
    const settingsButton = page.locator('button[title="Paramètres"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();

    // Verify the modal opens
    await expect(page.locator('text=Paramètres').first()).toBeVisible({ timeout: 5000 });
  });

  test('should navigate to Interface tab', async ({ page }) => {
    // Open sidebar and settings
    await page.mouse.move(10, 300);
    await page.waitForTimeout(500);

    const settingsButton = page.locator('button[title="Paramètres"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();

    // Wait for modal to appear
    await expect(page.locator('text=Paramètres').first()).toBeVisible({ timeout: 5000 });

    // Click on Interface tab
    const interfaceTab = page.locator('button[role="tab"]', { hasText: 'Interface' });
    await expect(interfaceTab).toBeVisible({ timeout: 5000 });
    await interfaceTab.click();

    // Verify the Interface panel content is visible
    await expect(page.locator('text=Personnalisez l\'apparence')).toBeVisible({ timeout: 5000 });
  });

  test('should display design guidelines section', async ({ page }) => {
    // Open settings and navigate to Interface tab
    await page.mouse.move(10, 300);
    await page.waitForTimeout(500);

    const settingsButton = page.locator('button[title="Paramètres"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();

    // Click on Interface tab
    const interfaceTab = page.locator('button[role="tab"]', { hasText: 'Interface' });
    await expect(interfaceTab).toBeVisible({ timeout: 5000 });
    await interfaceTab.click();

    // Verify design guidelines section exists
    await expect(page.locator('text=Design Guidelines')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Activer les guidelines')).toBeVisible({ timeout: 5000 });
  });

  test('should toggle design guidelines on/off', async ({ page }) => {
    // Open settings and navigate to Interface tab
    await page.mouse.move(10, 300);
    await page.waitForTimeout(500);

    const settingsButton = page.locator('button[title="Paramètres"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();

    // Click on Interface tab
    const interfaceTab = page.locator('button[role="tab"]', { hasText: 'Interface' });
    await expect(interfaceTab).toBeVisible({ timeout: 5000 });
    await interfaceTab.click();

    // Find the design guidelines toggle switch
    const guidelinesToggle = page.locator('button[role="switch"][aria-label="Activer les design guidelines"]');
    await expect(guidelinesToggle).toBeVisible({ timeout: 5000 });

    // Get initial state
    const initialState = await guidelinesToggle.getAttribute('aria-checked');

    // Toggle the switch
    await guidelinesToggle.click();
    await page.waitForTimeout(300);

    // Verify state changed
    const newState = await guidelinesToggle.getAttribute('aria-checked');
    expect(newState).not.toBe(initialState);

    // Toggle back
    await guidelinesToggle.click();
    await page.waitForTimeout(300);

    // Verify returned to initial state
    const finalState = await guidelinesToggle.getAttribute('aria-checked');
    expect(finalState).toBe(initialState);
  });

  test('should show level selector when guidelines enabled', async ({ page }) => {
    // Open settings and navigate to Interface tab
    await page.mouse.move(10, 300);
    await page.waitForTimeout(500);

    const settingsButton = page.locator('button[title="Paramètres"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();

    // Click on Interface tab
    const interfaceTab = page.locator('button[role="tab"]', { hasText: 'Interface' });
    await expect(interfaceTab).toBeVisible({ timeout: 5000 });
    await interfaceTab.click();

    // Find the design guidelines toggle
    const guidelinesToggle = page.locator('button[role="switch"][aria-label="Activer les design guidelines"]');
    await expect(guidelinesToggle).toBeVisible({ timeout: 5000 });

    // Ensure guidelines are enabled
    const isEnabled = await guidelinesToggle.getAttribute('aria-checked');
    if (isEnabled === 'false') {
      await guidelinesToggle.click();
      await page.waitForTimeout(300);
    }

    // Verify level selector is visible
    await expect(page.locator('text=Niveau de détail')).toBeVisible({ timeout: 5000 });

    // Verify all three levels are shown
    await expect(page.locator('text=Minimal')).toBeVisible();
    await expect(page.locator('text=Standard')).toBeVisible();
    await expect(page.locator('text=Full')).toBeVisible();
  });

  test('should hide level selector when guidelines disabled', async ({ page }) => {
    // Open settings and navigate to Interface tab
    await page.mouse.move(10, 300);
    await page.waitForTimeout(500);

    const settingsButton = page.locator('button[title="Paramètres"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();

    // Click on Interface tab
    const interfaceTab = page.locator('button[role="tab"]', { hasText: 'Interface' });
    await expect(interfaceTab).toBeVisible({ timeout: 5000 });
    await interfaceTab.click();

    // Find the design guidelines toggle
    const guidelinesToggle = page.locator('button[role="switch"][aria-label="Activer les design guidelines"]');
    await expect(guidelinesToggle).toBeVisible({ timeout: 5000 });

    // Ensure guidelines are disabled
    const isEnabled = await guidelinesToggle.getAttribute('aria-checked');
    if (isEnabled === 'true') {
      await guidelinesToggle.click();
      await page.waitForTimeout(300);
    }

    // Verify level selector is NOT visible
    await expect(page.locator('text=Niveau de détail')).not.toBeVisible();
  });

  test('should change guidelines level', async ({ page }) => {
    // Open settings and navigate to Interface tab
    await page.mouse.move(10, 300);
    await page.waitForTimeout(500);

    const settingsButton = page.locator('button[title="Paramètres"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();

    // Click on Interface tab
    const interfaceTab = page.locator('button[role="tab"]', { hasText: 'Interface' });
    await expect(interfaceTab).toBeVisible({ timeout: 5000 });
    await interfaceTab.click();

    // Ensure guidelines are enabled
    const guidelinesToggle = page.locator('button[role="switch"][aria-label="Activer les design guidelines"]');
    await expect(guidelinesToggle).toBeVisible({ timeout: 5000 });

    const isEnabled = await guidelinesToggle.getAttribute('aria-checked');
    if (isEnabled === 'false') {
      await guidelinesToggle.click();
      await page.waitForTimeout(300);
    }

    // Click on "Full" level
    const fullLevelButton = page.locator('button', { hasText: 'Full' }).first();
    await expect(fullLevelButton).toBeVisible({ timeout: 5000 });
    await fullLevelButton.click();
    await page.waitForTimeout(300);

    // Verify Full level is selected (should have accent color class)
    const fullLevelSelected = page.locator('button', { hasText: 'Full' }).first();
    await expect(fullLevelSelected).toHaveClass(/bg-accent-500/);

    // Verify token count is displayed
    await expect(page.locator('text=~1200 tokens')).toBeVisible();

    // Click on "Standard" level
    const standardLevelButton = page.locator('button', { hasText: 'Standard' }).first();
    await standardLevelButton.click();
    await page.waitForTimeout(300);

    // Verify Standard level is selected
    await expect(page.locator('text=~500 tokens')).toBeVisible();
  });

  test('should display token usage info when enabled', async ({ page }) => {
    // Open settings and navigate to Interface tab
    await page.mouse.move(10, 300);
    await page.waitForTimeout(500);

    const settingsButton = page.locator('button[title="Paramètres"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();

    // Click on Interface tab
    const interfaceTab = page.locator('button[role="tab"]', { hasText: 'Interface' });
    await expect(interfaceTab).toBeVisible({ timeout: 5000 });
    await interfaceTab.click();

    // Ensure guidelines are enabled
    const guidelinesToggle = page.locator('button[role="switch"][aria-label="Activer les design guidelines"]');
    await expect(guidelinesToggle).toBeVisible({ timeout: 5000 });

    const isEnabled = await guidelinesToggle.getAttribute('aria-checked');
    if (isEnabled === 'false') {
      await guidelinesToggle.click();
      await page.waitForTimeout(300);
    }

    // Verify token info message is visible
    await expect(page.locator('text=Les tokens sont ajoutés au prompt système')).toBeVisible({ timeout: 5000 });
  });

  test('should persist settings after page reload', async ({ page }) => {
    // Open settings and enable guidelines with "full" level
    await page.mouse.move(10, 300);
    await page.waitForTimeout(500);

    const settingsButton = page.locator('button[title="Paramètres"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();

    // Click on Interface tab
    const interfaceTab = page.locator('button[role="tab"]', { hasText: 'Interface' });
    await expect(interfaceTab).toBeVisible({ timeout: 5000 });
    await interfaceTab.click();

    // Enable guidelines if not already
    const guidelinesToggle = page.locator('button[role="switch"][aria-label="Activer les design guidelines"]');
    await expect(guidelinesToggle).toBeVisible({ timeout: 5000 });

    const isEnabled = await guidelinesToggle.getAttribute('aria-checked');
    if (isEnabled === 'false') {
      await guidelinesToggle.click();
      await page.waitForTimeout(300);
    }

    // Select "Full" level
    const fullLevelButton = page.locator('button', { hasText: 'Full' }).first();
    await expect(fullLevelButton).toBeVisible({ timeout: 5000 });
    await fullLevelButton.click();
    await page.waitForTimeout(500);

    // Reload the page
    await page.reload();
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

    // Re-open settings
    await page.mouse.move(10, 300);
    await page.waitForTimeout(500);

    const settingsButtonAfterReload = page.locator('button[title="Paramètres"]');
    await expect(settingsButtonAfterReload).toBeVisible({ timeout: 5000 });
    await settingsButtonAfterReload.click();

    // Navigate to Interface tab
    const interfaceTabAfterReload = page.locator('button[role="tab"]', { hasText: 'Interface' });
    await expect(interfaceTabAfterReload).toBeVisible({ timeout: 5000 });
    await interfaceTabAfterReload.click();

    // Verify settings persisted
    const guidelinesToggleAfterReload = page.locator('button[role="switch"][aria-label="Activer les design guidelines"]');
    await expect(guidelinesToggleAfterReload).toHaveAttribute('aria-checked', 'true');

    // Verify Full level is still selected (token count visible)
    await expect(page.locator('text=~1200 tokens')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Design Guidelines - Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

    // Open settings
    await page.mouse.move(10, 300);
    await page.waitForTimeout(500);

    const settingsButton = page.locator('button[title="Paramètres"]');
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
    await settingsButton.click();

    // Navigate to Interface tab
    const interfaceTab = page.locator('button[role="tab"]', { hasText: 'Interface' });
    await expect(interfaceTab).toBeVisible({ timeout: 5000 });
    await interfaceTab.click();
  });

  test('should toggle guidelines with keyboard', async ({ page }) => {
    // Focus the toggle
    const guidelinesToggle = page.locator('button[role="switch"][aria-label="Activer les design guidelines"]');
    await expect(guidelinesToggle).toBeVisible({ timeout: 5000 });

    // Get initial state
    const initialState = await guidelinesToggle.getAttribute('aria-checked');

    // Focus and press Space to toggle
    await guidelinesToggle.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    // Verify state changed
    const newState = await guidelinesToggle.getAttribute('aria-checked');
    expect(newState).not.toBe(initialState);
  });

  test('should navigate tabs with arrow keys', async ({ page }) => {
    // Focus the Interface tab
    const interfaceTab = page.locator('button[role="tab"]', { hasText: 'Interface' });
    await interfaceTab.focus();

    // Press ArrowDown to go to next tab
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);

    // Verify Connectors tab is now focused and selected
    const connectorsTab = page.locator('button[role="tab"]', { hasText: 'Connecteurs' });
    await expect(connectorsTab).toBeFocused();
  });
});
