import { expect, test, type Page } from '@playwright/test';
import { createGame, type GameState } from '../src/engine';
import k2022 from '../mods/knesset-25-2022.json' with { type: 'json' };
import type { ModFile } from '../src/engine/mods';
import { openWindow } from '../src/engine/systems/climate';
import { startPresidentRace } from '../src/engine/systems/president';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function right(): GameState {
  return createGame({
    name: 'עדי לוי', gender: 'f', background: 'journalist',
    ideology: { econ: 40, security: 70, religion: 20, judiciary: 60 },
    partyId: 'likud', scenario: 'freshman',
    avatar: { seed: 2, cover: 'none', beard: false, glasses: false, age: 45 }, seed: 5,
    mod: k2022 as ModFile,
  });
}

async function load(page: Page, g: GameState) {
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
}

test('window of opportunity shows on the dashboard and warms the climate', async ({ page }) => {
  const g = right();
  openWindow(g, 'annexation', 26, 'אחרי המלחמה');
  await load(page, g);
  await page.locator('.tabbar').getByText('לוח').click();
  await expect(page.getByTestId('windows')).toContainText('סיפוח');
  await page.getByTestId('windows').scrollIntoViewIfNeeded();
  await shot(page, '90-windows');
  await page.locator('.tabbar').getByText('חקיקה').click();
  await page.getByRole('button', { name: /הצעת חוק חדשה/ }).click();
  await page.getByRole('button', { name: /🌋 מהפכות/ }).click();
  await page.getByRole('button', { name: /ריבונות מלאה/ }).click();
  await expect(page.getByTestId('radical-climate')).toContainText('חלון');
  await page.getByTestId('radical-climate').scrollIntoViewIfNeeded();
  await shot(page, '91-climate');
});

test('presidential election: ballot then a live count', async ({ page }) => {
  const g = right();
  startPresidentRace(g);
  await load(page, g);
  await expect(page.locator('.event-card')).toContainText('הבחירות לנשיאות');
  await page.locator('.event-card button.choice:not([disabled])').first().click();
  await expect(page.getByTestId('president-race')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, '92-president');
  await page.getByRole('button', { name: /לתוצאה/ }).click();
  await expect(page.getByTestId('president-race')).toContainText('נשיא/ת המדינה!');
});

test('government roster', async ({ page }) => {
  await load(page, right());
  await page.locator('.tabbar').getByText('אנשים').click();
  await page.locator('.filter-row').getByRole('button', { name: 'ממשלה', exact: true }).click();
  await expect(page.getByTestId('gov-roster')).toContainText('ראש/ת הממשלה');
  await shot(page, '93-gov');
});
