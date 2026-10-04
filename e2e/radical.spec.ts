import { expect, test, type Page } from '@playwright/test';
import { createGame, type GameState } from '../src/engine';
import { applyTransform } from '../src/engine/systems/transforms';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function mk(): GameState {
  return createGame({
    name: 'דנה אור', gender: 'f', background: 'journalist',
    ideology: { econ: 0, security: 0, religion: -30, judiciary: -20 },
    partyId: 'merkaz', scenario: 'freshman',
    avatar: { seed: 9, cover: 'none', beard: false, glasses: false, age: 44 }, seed: 31,
  });
}

async function load(page: Page, g: GameState) {
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
}

test('radical proposals tab explains what would change', async ({ page }) => {
  await load(page, mk());
  await page.locator('.tabbar').getByText('חקיקה').click();
  await page.getByRole('button', { name: /הצעת חוק חדשה/ }).click();
  await page.getByRole('button', { name: /🌋 מהפכות/ }).click();
  await page.getByRole('button', { name: /התורה/ }).click();
  await expect(page.getByTestId('radical-info')).toContainText('משפט התורה');
  await expect(page.locator('.sheet').last()).toContainText('משאל עם');
  await shot(page, '60-radical-builder');
});

test('a transformed state shows on the dashboard', async ({ page }) => {
  const g = mk();
  applyTransform(g, 'peace', 2, 'player', 'r_peace');
  g.eventQueue = [];
  await load(page, g);
  await page.locator('.tabbar').getByText('לוח').click();
  await expect(page.getByTestId('transforms')).toContainText('שלום');
  await page.getByTestId('transforms').scrollIntoViewIfNeeded();
  await shot(page, '61-transformed');
});
