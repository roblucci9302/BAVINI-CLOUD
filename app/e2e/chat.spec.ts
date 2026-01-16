/**
 * Chat E2E Tests - Tests pour l'interface de chat
 */

import { test, expect } from '@playwright/test';

test.describe('Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display chat input', async ({ page }) => {
    // Chercher un élément d'entrée de message (textarea ou input)
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
  });

  test('should show placeholder text', async ({ page }) => {
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // Vérifier qu'il y a un placeholder
    const placeholder = await chatInput.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
  });

  test('should allow typing in chat', async ({ page }) => {
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // Taper un message
    await chatInput.fill('Hello, BAVINI!');
    await expect(chatInput).toHaveValue('Hello, BAVINI!');
  });
});
