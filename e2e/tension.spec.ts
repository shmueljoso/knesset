import { expect, test, type Page } from '@playwright/test';
import { createGame, type GameState } from '../src/engine';
import { buildLists } from '../src/engine/systems/elections';
import { createBill } from '../src/engine/systems/legislation';
import type { Bill } from '../src/engine/types';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function mk(partyId = 'tikva', scenario: 'freshman' | 'grassroots' = 'freshman'): GameState {
  return createGame({
    name: 'טל ברק', gender: 'f', background: 'journalist',
    ideology: { econ: 10, security: 40, religion: 0, judiciary: 30 },
    partyId, scenario,
    avatar: { seed: 6, cover: 'none', beard: false, glasses: true, age: 41 }, seed: 19,
  });
}

async function load(page: Page, g: GameState) {
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
}

test('live vote has a ticking clock and slows down', async ({ page }) => {
  const g = mk();
  g.player.ap = 5;
  const b = createBill(g, 'border', 2) as Bill;
  b.stage = 'preliminary';
  b.govPosition = 'support';
  await load(page, g);
  await page.locator('.tabbar').getByText('חקיקה').click();
  await page.getByText('חוק חיזוק יישובי הגבולות').first().click();
  await page.getByRole('button', { name: /ספירת קולות והצבעה/ }).click();
  await page.getByRole('button', { name: /להעלות להצבעה במליאה/ }).click();
  await expect(page.getByTestId('vote-clock')).toContainText('0:');
  await page.waitForTimeout(5000);
  await expect(page.getByTestId('live-vote')).toContainText('נספרו');
  await shot(page, '80-vote-clock');
});

test('primaries night reveals the list slowly', async ({ page }) => {
  const g = mk('tikva', 'grassroots');
  g.player.wantsList = true;
  g.player.partyStanding = 70;
  g.player.fame = 40;
  buildLists(g);
  await load(page, g);
  await expect(page.getByTestId('primaries-night')).toContainText('ליל הפריימריז');
  await page.waitForTimeout(1200);
  await shot(page, '81-primaries');
  await page.getByRole('button', { name: /לתוצאה הסופית/ }).click();
  await expect(page.getByTestId('primaries-pos')).toContainText(`מקום ${g.player.listPosition}`);
  await page.getByTestId('primaries-night').getByRole('button', { name: 'המשך' }).click();
  await expect(page.getByTestId('primaries-night')).toHaveCount(0);
});

test('interview: three live questions', async ({ page }) => {
  const g = mk();
  g.player.location = 'studio';
  g.player.ap = 5;
  await load(page, g);
  await page.getByRole('button', { name: /פעולות כאן/ }).click();
  await page.getByRole('button', { name: /ראיון באולפן/ }).click();
  await expect(page.locator('.event-card')).toContainText('שאלה 1/3');
  await shot(page, '82-interview');
  for (let i = 0; i < 3; i++) {
    await expect(page.locator('.event-card')).toContainText(`שאלה ${i + 1}/3`);
    await page.locator('.event-card button.choice:not([disabled])').first().click();
    await page.locator('.event-card button.btn.primary').first().click();
  }
  await expect(page.locator('.event-card')).toHaveCount(0);
});

test('newspapers, gossip and polls', async ({ page }) => {
  await load(page, mk());
  await page.locator('.tabbar').getByText('חדשות').click();
  await page.getByRole('button', { name: /עיתונים/ }).click();
  await expect(page.getByTestId('gossip')).toBeVisible();
  await expect(page.locator('.page')).toContainText('ישראל בבוקר');
  await shot(page, '83-papers');
  await page.getByRole('button', { name: /סקרים/ }).click();
  await expect(page.getByTestId('polls-view')).toBeVisible();
  await expect(page.locator('.page')).toContainText('מי מתאים יותר לראשות הממשלה');
  await shot(page, '84-polls');
});

test('editor: write your own event; pick the 1996 scenario', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: /עורך כנסת/ }).click();
  await page.getByRole('button', { name: /אירוע חדש/ }).click();
  await page.getByLabel('כותרת אירוע').fill('הח"כ שנתקע במעלית');
  await expect(page.getByTestId('custom-event')).toHaveCount(1);
  await page.getByTestId('custom-event').scrollIntoViewIfNeeded();
  await shot(page, '85-custom-event');
  await page.getByRole('button', { name: /הבחירה הישירה/ }).first().click();
  await expect(page.locator('.page')).toContainText('הליכוד-גשר-צומת');
});
