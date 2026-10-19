import { expect, test } from '@playwright/test';

const channel = 'gsix.kinetic-souls.settings.v1';

test('loads an unset account preference from local storage and saves later model changes', async ({ page }) => {
  let accountStyle: string | null = null;
  const writes: string[] = [];

  await page.route('**/api/auth/user', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'member-1', email: null, firstName: 'Test', lastName: null, profileImageUrl: null }, isOwner: false, role: 'member' }),
  }));
  await page.route('**/api/games/stats**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/games/kinetic-souls-2-alpha/settings', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelStyle: accountStyle }) });
      return;
    }
    const body = route.request().postDataJSON() as { modelStyle: string };
    writes.push(body.modelStyle);
    accountStyle = body.modelStyle;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelStyle: accountStyle }) });
  });
  await page.route('https://ksouls2.vercel.app/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html><body><button id="choose-hd">Choose V2 / HD</button><script>
        const channel = '${channel}';
        const parentOrigin = new URL(document.referrer).origin;
        window.addEventListener('message', (event) => {
          if (event.source !== parent || event.origin !== parentOrigin || event.data?.channel !== channel) return;
          if (event.data.type === 'ready') parent.postMessage({ channel, type: 'load', localModelStyle: 'sabre' }, event.origin);
          if (event.data.type === 'loaded') window.modelSettings = event.data;
        });
        parent.postMessage({ channel, type: 'hello' }, parentOrigin);
        document.querySelector('#choose-hd').addEventListener('click', () => parent.postMessage({ channel, type: 'save', modelStyle: 'hd' }, parentOrigin));
      </script></body></html>`,
    });
  });

  await page.goto('/games/kinetic-souls-2-alpha', { waitUntil: 'domcontentloaded' });
  const gameFrame = page.frameLocator('iframe.game-frame');
  await expect.poll(async () => gameFrame.locator('body').evaluate((body) => (body.ownerDocument.defaultView as Window & { modelSettings?: { modelStyle?: string } }).modelSettings?.modelStyle)).toBe('sabre');
  expect(writes).toEqual(['sabre']);

  await gameFrame.getByRole('button', { name: 'Choose V2 / HD' }).click();
  await expect.poll(() => writes).toEqual(['sabre', 'hd']);
  expect(accountStyle).toBe('hd');
});

test('keeps a failed local choice and retries it after the player signs in again', async ({ page }) => {
  let signedIn = false;
  let accountStyle: string | null = 'classic';
  const writes: string[] = [];

  await page.route('**/api/auth/user', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      user: signedIn ? { id: 'member-1', email: null, firstName: 'Test', lastName: null, profileImageUrl: null } : null,
      isOwner: false,
      role: 'member',
    }),
  }));
  await page.route('**/api/games/stats**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/games/kinetic-souls-2-alpha/settings', async (route) => {
    if (!signedIn) {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Sign-in required' }) });
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelStyle: accountStyle }) });
      return;
    }
    const body = route.request().postDataJSON() as { modelStyle: string };
    writes.push(body.modelStyle);
    accountStyle = body.modelStyle;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelStyle: accountStyle }) });
  });
  await page.route('https://ksouls2.vercel.app/**', async (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><body><button id="choose-hd">Choose V2 / HD</button><script>
      const channel = '${channel}';
      const parentOrigin = new URL(document.referrer).origin;
      const styleKey = 'test-model-style';
      const pendingKey = 'test-pending-model-style';
      let localStyle = localStorage.getItem(styleKey) || 'sabre';
      let pendingStyle = localStorage.getItem(pendingKey);
      window.addEventListener('message', (event) => {
        if (event.source !== parent || event.origin !== parentOrigin || event.data?.channel !== channel) return;
        if (event.data.type === 'ready') parent.postMessage({ channel, type: 'load', localModelStyle: localStyle, pendingModelStyle: pendingStyle }, event.origin);
        if (event.data.type === 'loaded') {
          if (event.data.modelStyle) localStyle = event.data.modelStyle;
          if (event.data.savedPending) pendingStyle = null;
          localStorage.setItem(styleKey, localStyle);
          if (!pendingStyle) localStorage.removeItem(pendingKey);
          window.modelSettings = event.data;
        }
        if (event.data.type === 'saved' && event.data.modelStyle === pendingStyle) {
          pendingStyle = null;
          localStorage.removeItem(pendingKey);
        }
        if (event.data.type === 'save_failed') window.saveFailed = true;
      });
      parent.postMessage({ channel, type: 'hello' }, parentOrigin);
      document.querySelector('#choose-hd').addEventListener('click', () => {
        localStyle = 'hd';
        pendingStyle = 'hd';
        localStorage.setItem(styleKey, localStyle);
        localStorage.setItem(pendingKey, pendingStyle);
        parent.postMessage({ channel, type: 'save', modelStyle: localStyle }, parentOrigin);
      });
    </script></body></html>`,
  }));

  await page.goto('/games/kinetic-souls-2-alpha', { waitUntil: 'domcontentloaded' });
  const gameFrame = page.frameLocator('iframe.game-frame');
  await expect.poll(async () => gameFrame.locator('body').evaluate((body) => (body.ownerDocument.defaultView as Window & { modelSettings?: { signedIn?: boolean } }).modelSettings?.signedIn)).toBe(false);
  await gameFrame.getByRole('button', { name: 'Choose V2 / HD' }).click();
  await expect.poll(async () => gameFrame.locator('body').evaluate((body) => (body.ownerDocument.defaultView as Window & { saveFailed?: boolean }).saveFailed)).toBe(true);
  expect(writes).toEqual([]);

  signedIn = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloadedFrame = page.frameLocator('iframe.game-frame');
  await expect.poll(async () => reloadedFrame.locator('body').evaluate((body) => (body.ownerDocument.defaultView as Window & { modelSettings?: { modelStyle?: string } }).modelSettings?.modelStyle)).toBe('hd');
  expect(writes).toEqual(['hd']);
  expect(accountStyle).toBe('hd');
});

test('sends completed matches through the GSix account API without exposing credentials to the iframe', async ({ page }) => {
  const submitted: unknown[] = [];
  await page.route('**/api/auth/user', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'member-1', email: null, firstName: 'Test', lastName: null, profileImageUrl: null }, isOwner: false, role: 'member' }),
  }));
  await page.route('**/api/games/stats**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/api/games/kinetic-souls-2-alpha/results', async (route) => {
    submitted.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ accepted: true, duplicate: false }) });
  });
  await page.route('https://ksouls2.vercel.app/**', async (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: `<!doctype html><html><body><script>
      const channel = '${channel}';
      const parentOrigin = new URL(document.referrer).origin;
      window.addEventListener('message', (event) => {
        if (event.source !== parent || event.origin !== parentOrigin || event.data?.channel !== channel) return;
        if (event.data.type === 'ready') parent.postMessage({ channel, type: 'result', result: { version: 1, sessionId: '00000000-0000-4000-8000-000000000005', mode: 'score', durationSeconds: 45, score: 900 } }, event.origin);
        if (event.data.type === 'result_saved') window.resultReceipt = event.data;
      });
      parent.postMessage({ channel, type: 'hello' }, parentOrigin);
    </script></body></html>`,
  }));

  await page.goto('/games/kinetic-souls-2-alpha', { waitUntil: 'domcontentloaded' });
  const gameFrame = page.frameLocator('iframe.game-frame');
  await expect.poll(() => submitted.length).toBe(1);
  await expect.poll(async () => gameFrame.locator('body').evaluate((body) => (body.ownerDocument.defaultView as Window & { resultReceipt?: { accepted?: boolean } }).resultReceipt?.accepted)).toBe(true);
  expect(submitted).toEqual([{ version: 1, sessionId: '00000000-0000-4000-8000-000000000005', mode: 'score', durationSeconds: 45, score: 900 }]);
});
