import { expect, test } from '@playwright/test';

const channel = 'gsix.kinetic-souls.settings.v1';

test('loads an unset account preference from local storage and saves later model changes', async ({ page }) => {
  let accountStyle: string | null = null;
  const writes: string[] = [];

  await page.route('**/api/auth/user', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: null, isOwner: false, role: 'member' }),
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
