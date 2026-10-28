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
  for (let i = 0; i < 2; i++) {
    g.eventQueue = [];
    endWeek(g);
  }
  g.eventQueue = [];
  g.report = null;
  return g;
}

async function load(page: Page, g: GameState) {
  await page.addInitScript((json) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('hamishkan.save.v1', json);
      sessionStorage.setItem('seeded', '1');
    }
  }, JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
}

test('manual save, weekly backup, and loading a save back', async ({ page }) => {
  await load(page, game());
  await page.getByLabel('תפריט').click();
  await page.getByTestId('open-saves').click();
  await expect(page.getByTestId('saves-info')).toContainText('גיבוי אוטומטי');
  await page.getByTestId('save-name').fill('לפני ההצבעה');
  await page.getByTestId('save-now').click();
  await expect(page.getByTestId('saves-list')).toContainText('לפני ההצבעה');
  await shot(page, '120-saves');
  await page.getByTestId('load').first().click();
  await page.getByTestId('confirm-load').click();
  await expect(page.locator('.toast').last()).toContainText('נטען');
});

test('if the main save is lost, the title screen offers the latest backup', async ({ page }) => {
  await load(page, game());
  await page.getByLabel('תפריט').click();
  await page.getByTestId('open-saves').click();
  await page.getByTestId('save-now').click();
  await expect(page.getByTestId('saves-list').locator('.save-row')).toHaveCount(1);
  await page.evaluate(() => localStorage.removeItem('hamishkan.save.v1'));
  await page.reload();
  await expect(page.getByTestId('restore-latest')).toContainText('נועה כהן');
  await shot(page, '121-restore');
  await page.getByTestId('restore-latest').click();
  await expect(page.locator('.hud')).toContainText('נועה כהן');
});

test('tablet layout: wider app, two-column dashboard, centred sheets', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, isMobile: false, hasTouch: true });
  const page = await ctx.newPage();
  await load(page, game());
  await page.locator('.tabbar').getByText('לוח').click();
  const width = await page.locator('.app').evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(800);
  expect(await page.locator('.page.dash').evaluate((el) => getComputedStyle(el).columnCount)).toBe('2');
  await shot(page, '122-tablet-dashboard');
  await page.getByLabel('תפריט').click();
  const sheet = await page.locator('.sheet').evaluate((el) => el.getBoundingClientRect().width);
  expect(sheet).toBeLessThanOrEqual(650);
  await shot(page, '123-tablet-sheet');
  await ctx.close();
});
