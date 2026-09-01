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

test.describe('signed-in actions', () => {
  test('keeps the private feedback form keyboard reachable through success', async ({ page }) => {
    await page.unroute('**/api/auth/user');
    await page.route('**/api/auth/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'keyboard-player',
            email: 'keyboard.player@example.com',
            firstName: 'Keyboard',
            lastName: 'Player',
            profileImageUrl: null,
          },
          isOwner: false,
        }),
      });
    });

    let feedbackBody: unknown;
    await page.route('**/api/games/616-survivor/feedback', async (route) => {
      feedbackBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          received: true,
          message: 'Your note is in the private review queue.',
        }),
      });
    });

    await page.goto('/games/616-survivor');

    await expect(page.getByText('Private channel / signed in')).toBeVisible();
    const feedback = page.getByLabel('Private feedback');
    const submitButton = page.getByRole('button', { name: 'Send private note' });
    await expect(feedback).toBeVisible();
    await expect(submitButton).toBeVisible();

    await feedback.focus();
    await expect(feedback).toBeFocused();
    await feedback.fill('A thoughtful keyboard test note.');
    await submitButton.focus();
    await expect(submitButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect.poll(() => feedbackBody).toEqual({ content: 'A thoughtful keyboard test note.' });
    await expect(page.getByRole('heading', { name: 'Your note is in the queue.' })).toBeVisible();
    await expect(page.getByText('Transmission received')).toBeVisible();
  });

  test('keeps owner review and sign-out controls keyboard reachable', async ({ page }) => {
    await page.unroute('**/api/auth/user');
    await page.route('**/api/auth/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'gsix-owner',
            email: 'owner@example.com',
            firstName: 'GSix',
            lastName: 'Owner',
            profileImageUrl: null,
          },
          isOwner: true,
        }),
      });
    });

    let feedbackStatus: 'pending' | 'reviewed' = 'pending';
    let reviewBody: unknown;
    const feedbackNote = () => ({
      id: 42,
      gameSlug: '616-survivor',
      content: 'The atmosphere landed immediately.',
      status: feedbackStatus,
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
      author: {
        id: 'keyboard-player',
        email: 'keyboard.player@example.com',
        firstName: 'Keyboard',
        lastName: 'Player',
      },
    });

    await page.route('**/api/games/feedback', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ gameSlug: '616-survivor', notes: [feedbackNote()] }]),
      });
    });
    await page.route('**/api/games/feedback/42', async (route) => {
      reviewBody = route.request().postDataJSON();
      feedbackStatus = 'reviewed';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(feedbackNote()),
      });
    });

    let logoutRequested = false;
    await page.route('**/api/logout**', async (route) => {
      logoutRequested = true;
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: 'Signed out',
      });
    });

    await page.goto('/admin');

    const reviewButton = page.getByRole('button', { name: 'Mark reviewed' });
    await expect(reviewButton).toBeVisible();
    await reviewButton.focus();
    await expect(reviewButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect.poll(() => reviewBody).toEqual({ status: 'reviewed' });
    await expect(page.getByTestId('feedback-status-42')).toHaveText('Reviewed');
    await expect(page.getByRole('button', { name: 'Mark reviewed' })).toHaveCount(0);

    const signOutButton = page.getByRole('button', { name: 'Sign out' });
    await expect(signOutButton).toBeVisible();
    await signOutButton.focus();
    await expect(signOutButton).toBeFocused();
    await signOutButton.press('Enter');
    await expect.poll(() => logoutRequested).toBe(true);
  });
});
