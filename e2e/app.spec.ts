import { expect, test } from '@playwright/test';
import { createGame } from '../src/engine';

test('app settings are remembered on this device', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('title-settings').click();
  const sound = page.getByTestId('pref-sound').locator('input');
  await expect(sound).toBeChecked();
  await sound.uncheck();
  await page.reload();
  await page.getByTestId('title-settings').click();
  await expect(page.getByTestId('pref-sound').locator('input')).not.toBeChecked();
  // הגדרות של אנדרואיד בלבד לא מוצגות בדפדפן
  await expect(page.getByTestId('pref-immersive')).toHaveCount(0);
});

test('end of career: share as an image', async ({ page }) => {
  const g = createGame({
    name: 'נועה כהן', gender: 'f', background: 'journalist',
    ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
    partyId: 'merkaz', scenario: 'freshman',
    avatar: { seed: 3, cover: 'none', beard: false, glasses: false, age: 38 }, seed: 9,
  });
  g.eventQueue = [];
  g.gameOver = 'retired';
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('share-legacy').click()]);
  expect(dl.suggestedFilename()).toBe('hamishkan-legacy.png');
  const size = (await import('node:fs')).statSync((await dl.path())!).size;
  expect(size).toBeGreaterThan(20_000);
  if (process.env.SHOTS_DIR) await dl.saveAs(`${process.env.SHOTS_DIR}/legacy-card.png`);
});

test('share a knesset from the editor by link, and open the link', async ({ page }) => {
  let stored = '';
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, service: 'hamishkan' } }));
  await page.route('**/api/share', async (r) => {
    stored = JSON.parse(r.request().postData() ?? '{}').data;
    await r.fulfill({ json: { code: 'abcd2345' } });
  });
  await page.route('**/api/share/abcd2345', (r) => r.fulfill({ json: { code: 'abcd2345', kind: 'mod', title: 'הכנסת של דנה', data: stored } }));
  await page.goto('/');
  await page.getByRole('button', { name: /עורך כנסת/ }).click();
  await page.locator('.filter-row button').nth(1).click();
  await page.getByTestId('share-mod').click();
  await expect(page.getByTestId('share-msg')).toContainText('#s=abcd2345');
  expect(stored).toContain('parties');

  await page.goto('/#s=abcd2345');
  await expect(page.getByText('נפתחה כנסת ששיתפו איתך')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('election night: share the results as an image', async ({ page }) => {
  const g = createGame({
    name: 'נועה כהן', gender: 'f', background: 'journalist',
    ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
    partyId: 'merkaz', scenario: 'freshman',
    avatar: { seed: 3, cover: 'none', beard: false, glasses: false, age: 38 }, seed: 9,
  });
  g.eventQueue = [];
  const seats = Object.fromEntries(Object.values(g.parties).map((p) => [p.id, p.seats]));
  const votes = Object.fromEntries(Object.values(g.parties).map((p) => [p.id, p.seats * 40000 + 1000]));
  g.lastElection = { week: g.week, knesset: 26, votes, seats, playerElected: true, playerPosition: 12 };
  g.flags.showElection = true;
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
  await page.getByRole('button', { name: /לתוצאות הסופיות/ }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('share-election').click()]);
  expect(dl.suggestedFilename()).toBe('hamishkan-elections-26.png');
  if (process.env.SHOTS_DIR) await dl.saveAs(`${process.env.SHOTS_DIR}/election-card.png`);
});
