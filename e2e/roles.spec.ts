import { expect, test, type Page } from '@playwright/test';
import { createGame, endWeek, type GameState } from '../src/engine';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function game(): GameState {
  const g = createGame({
    name: 'נועה כהן', gender: 'f', background: 'journalist',
    ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
    partyId: 'merkaz', scenario: 'freshman',
    avatar: { seed: 3, cover: 'none', beard: false, glasses: false, age: 38 }, seed: 9,
  });
  g.eventQueue = [];
  endWeek(g);
  g.eventQueue = [];
  g.report = null;
  g.player.capital = 60;
  g.player.ap = 5;
  return g;
}

async function load(page: Page, g: GameState) {
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
  await page.locator('.tabbar').getByText('לוח').click();
}

test('my roles: resign from the Knesset', async ({ page }) => {
  await load(page, game());
  await page.getByTestId('dash-roles').click();
  const mk = page.getByTestId('role-knesset');
  await expect(mk).toContainText('הבא/ה ברשימה');
  await shot(page, '120-roles');
  await mk.getByRole('button', { name: 'לעזוב' }).click();
  await mk.getByRole('button', { name: 'בטוח?' }).click();
  await expect(page.locator('.toast').last()).toContainText('התפטרת מהכנסת');
  await expect(page.getByTestId('role-knesset')).toHaveCount(0);
});

test('behind the scenes: defectors, new parties, mergers and revolts', async ({ page }) => {
  await load(page, game());
  await page.getByTestId('dash-sway').click();
  await expect(page.getByTestId('court-defector-blocked').first()).toContainText('מעמד');
  await shot(page, '121-sway');
  await page.getByTestId('sway-found').click();
  await expect(page.getByTestId('urge-found').first()).toBeVisible();
  await page.getByTestId('sway-merge').click();
  await expect(page.getByTestId('urge-merge')).toBeVisible();
  await page.getByTestId('sway-oust').click();
  const oust = page.getByTestId('oust').first();
  await expect(oust).toBeVisible();
  await oust.click();
  await expect(page.locator('.toast').last()).toBeVisible();
});
