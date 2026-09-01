import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/user', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: null, isOwner: false }),
    });
  });
  await page.route('**/api/games/stats**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });
});

test.describe('keyboard navigation', () => {
  test('starts at the skip link and keeps primary navigation reachable', async ({ page }) => {
    await page.goto('/');

    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toHaveAttribute('href', '#main-content');

    const primaryNavigation = page.getByRole('navigation', { name: 'Primary navigation' });
    const navigationLinks = primaryNavigation.getByRole('link');
    await expect(navigationLinks).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await navigationLinks.nth(index).focus();
      await expect(navigationLinks.nth(index)).toBeFocused();
      await expect(navigationLinks.nth(index)).toHaveAttribute('href', /^(\/|\/games|\/hire)$/);
    }
  });

  test('opens, closes, and dismisses the mobile menu with Escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const menuButton = page.locator('button.mobile-menu-btn');
    const primaryNavigation = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    await menuButton.click();
    await expect(menuButton).toHaveAttribute('aria-label', 'Close menu');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(primaryNavigation).toBeVisible();
    await expect(primaryNavigation.getByRole('link').first()).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(primaryNavigation).toBeHidden();
    await expect(menuButton).toHaveAttribute('aria-label', 'Open menu');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(menuButton).toBeFocused();

    await menuButton.click();
    await expect(primaryNavigation).toBeVisible();
    await menuButton.click();
    await expect(primaryNavigation).toBeHidden();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('dismisses the site switcher with Escape and an outside click', async ({ page }) => {
    await page.goto('/');

    const sitesButton = page.getByRole('button', { name: 'Sites' });
    const siteMenu = page.getByRole('link', { name: 'GSix Games Hub' }).locator('..');
    await sitesButton.click();
    await expect(sitesButton).toHaveAttribute('aria-expanded', 'true');
    await expect(siteMenu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(siteMenu).toBeHidden();
    await expect(sitesButton).toHaveAttribute('aria-expanded', 'false');

    await sitesButton.click();
    await expect(siteMenu).toBeVisible();
    await page.getByRole('heading', { name: /DISCOVER/ }).click();
    await expect(siteMenu).toBeHidden();
    await expect(sitesButton).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('visitor actions', () => {
  test('keeps each game detail link and star button separate and reachable', async ({ page }) => {
    await page.goto('/games');

    const firstTile = page.locator('.game-tile').first();
    const detailLink = firstTile.getByRole('link', { name: /^Open / }).first();
    const starButton = firstTile.getByRole('button', { name: /Star this game|Remove your star/ });

    await expect(firstTile.getByRole('link')).toHaveCount(2);
    await expect(detailLink).toBeVisible();
    await expect(detailLink).toHaveAttribute('href', /^\/games\/.+/);
    await expect(detailLink).toHaveAttribute('aria-label', /^Open /);
    await expect(starButton).toBeVisible();
    await expect(starButton).toHaveAttribute('type', 'button');
    await expect(starButton).toHaveAttribute('aria-pressed', 'false');

    await detailLink.focus();
    await expect(detailLink).toBeFocused();
    await starButton.focus();
    await expect(starButton).toBeFocused();
  });

  test('exposes labeled hire fields and completes the brief action', async ({ page }) => {
    await page.goto('/hire');

    await expect(page.getByLabel(/Your name/)).toBeVisible();
    await expect(page.getByLabel(/Contact frequency/)).toBeVisible();
    await expect(page.getByLabel(/What are we making/)).toBeVisible();
    await expect(page.getByLabel(/The transmission/)).toBeVisible();
    const submitButton = page.getByRole('button', { name: 'Send the brief' });
    await expect(submitButton).toBeVisible();

    await page.getByLabel(/Your name/).fill('Keyboard Visitor');
    await page.getByLabel(/Contact frequency/).fill('visitor@example.com');
    await page.getByLabel(/The transmission/).fill('A keyboard-friendly door.');
    await submitButton.click();

    await expect(page.getByRole('heading', { name: 'We found your note.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Return to the arcade' })).toHaveAttribute('href', '/games');
  });

  test('shows the signed-out control-room label and sign-in action', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByTestId('admin-sign-in-state')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Identify yourself.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in to control room' })).toBeVisible();
    await expect(page.getByText('Sign-in required')).toBeVisible();
  });
});