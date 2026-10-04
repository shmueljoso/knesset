import { expect, test, type Page } from '@playwright/test';
import { createGame, type GameState } from '../src/engine';
import { runElection } from '../src/engine/systems/elections';
import { createBill, queueOtherVote } from '../src/engine/systems/legislation';
import type { Bill } from '../src/engine/types';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function mk(): GameState {
  const g = createGame({
    name: 'רון שגב', gender: 'm', background: 'journalist',
    ideology: { econ: 10, security: 50, religion: 10, judiciary: 40 },
    partyId: 'tikva', scenario: 'freshman',
    avatar: { seed: 4, cover: 'none', beard: true, glasses: false, age: 46 }, seed: 12,
  });
  g.startDate = '2026-11-15';
  return g;
}

async function load(page: Page, g: GameState) {
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
}

test('own bill: live vote counts seat by seat', async ({ page }) => {
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
  await expect(page.getByTestId('live-vote')).toBeVisible();
  await expect(page.getByTestId('live-vote')).toContainText('נספרו');
  await page.waitForTimeout(1500);
  await shot(page, '70-live-vote');
  await page.getByRole('button', { name: /לדלג לתוצאה/ }).click();
  await expect(page.getByTestId('live-vote')).toContainText(/התקבלה|נדחתה/);
  await shot(page, '71-live-vote-done');
  await page.getByTestId('live-vote').getByRole('button', { name: 'המשך' }).click();
  await expect(page.getByTestId('live-vote')).toHaveCount(0);
});

test("voting on someone else's law", async ({ page }) => {
  const g = mk();
  const sponsor = Object.values(g.npcs).find((n) => n.isMK && n.notable && n.partyId !== g.player.partyId)!;
  queueOtherVote(g, sponsor.id, 'cannabis', 2);
  await load(page, g);
  await expect(page.locator('.event-card')).toContainText('הצבעה במליאה');
  await shot(page, '72-plenum-vote-card');
  await page.locator('.event-card button').filter({ hasText: 'נגד ❌' }).first().click();
  const overlay = page.locator('.event-overlay');
  if (await overlay.locator('button.btn.primary').filter({ hasText: /המשך|סגירה/ }).count()) await overlay.locator('button.btn.primary').first().click();
  await expect(page.getByTestId('live-vote')).toBeVisible();
  await page.getByRole('button', { name: /לדלג לתוצאה/ }).click();
  await expect(page.getByTestId('live-vote')).toContainText('הצבעת: נגד');
});

test('ministerial committee blocks: ultimatum button', async ({ page }) => {
  const g = mk();
  g.player.ap = 5;
  g.player.capital = 10;
  const b = createBill(g, 'civil', 2) as Bill;
  b.stage = 'preliminary';
  b.govPosition = 'oppose';
  await load(page, g);
  await page.locator('.tabbar').getByText('חקיקה').click();
  await page.getByText('חוק ברית הזוגיות').first().click();
  await expect(page.getByTestId('cabinet-pressure')).toContainText('אולטימטום');
  await shot(page, '73-ultimatum');
  await page.getByRole('button', { name: /אולטימטום/ }).click();
  await expect(page.locator('.toast').first()).toBeVisible();
});

test('election night: exit poll, then the count', async ({ page }) => {
  const g = mk();
  runElection(g);
  g.flags.showElection = true;
  g.negotiation = null;
  await load(page, g);
  await expect(page.getByTestId('count-phase')).toContainText('מדגם');
  await shot(page, '74-exit-poll');
  await page.getByRole('button', { name: /לתוצאות הסופיות/ }).click();
  await expect(page.getByTestId('count-phase')).toContainText('תוצאות סופיות');
});
