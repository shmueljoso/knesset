import { expect, test, type Page } from '@playwright/test';
import { createGame, endWeek, type GameState } from '../src/engine';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function game(): GameState {
  const g = createGame({
    name: 'עדי לוי', gender: 'f', background: 'journalist',
    ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
    partyId: 'merkaz', scenario: 'freshman',
    avatar: { seed: 2, cover: 'none', beard: false, glasses: false, age: 45 }, seed: 5,
  });
  g.world.security = 25;
  for (let i = 0; i < 12; i++) {
    g.eventQueue = [];
    endWeek(g);
  }
  g.eventQueue = [];
  g.report = null;
  return g;
}

async function load(page: Page, g: GameState) {
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
}

test('full poll sheet from the dashboard', async ({ page }) => {
  await load(page, game());
  await page.locator('.tabbar').getByText('לוח').click();
  await page.getByTestId('open-polls').click();
  await expect(page.getByTestId('pm-fit')).toContainText('מתאים/ה');
  await expect(page.getByTestId('polls-view')).toContainText('קואליציה');
  await shot(page, '98-polls');
  await page.getByTestId('pm-fit').scrollIntoViewIfNeeded();
  await shot(page, '98b-pmfit');
});

test('papers: each paper has its own front page', async ({ page }) => {
  await load(page, game());
  await page.locator('.tabbar').getByText('חדשות').click();
  await page.getByRole('button', { name: /🗞️ עיתונים/ }).click();
  await page.getByRole('button', { name: /המבשר הנאמן/ }).click();
  await expect(page.getByTestId('paper-haredi')).toBeVisible();
  await expect(page.getByTestId('paper-money')).toHaveCount(0);
  await page.getByRole('button', { name: /כל העיתונים/ }).click();
  await expect(page.getByTestId('paper-money')).toContainText('מדד המשק');
  await page.getByTestId('paper-social').scrollIntoViewIfNeeded();
  await shot(page, '99-papers');
});
