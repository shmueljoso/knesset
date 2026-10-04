import { expect, test, type Page } from '@playwright/test';
import { createGame, type GameState } from '../src/engine';
import { SHOCKS } from '../src/engine/data/shocks';
import { foundParty } from '../src/engine/systems/parties';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function leaderGame(): GameState {
  const g = createGame({
    name: 'מאיה לוי', gender: 'f', background: 'entrepreneur',
    ideology: { econ: -40, security: -20, religion: -50, judiciary: -40 },
    partyId: null, scenario: 'grassroots',
    avatar: { seed: 5, cover: 'none', beard: false, glasses: false, age: 41 }, seed: 77,
  });
  g.player.money = 400;
  g.player.fame = 30;
  foundParty(g, 'הדרך שלי', '#f59e0b');
  g.parties.smol.poll = 2.6;
  g.player.location = 'partyhq';
  return g;
}

async function load(page: Page, g: GameState) {
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
}

test('party leader opens alliances, sees a merger forecast and proposes', async ({ page }) => {
  const g = leaderGame();
  const target = g.parties.smol.name;
  await load(page, g);
  await page.getByRole('button', { name: /פעולות כאן/ }).click();
  await expect(page.locator('.sheet').last()).toContainText('➕');
  await page.getByRole('button', { name: /איחודים ובריתות/ }).click();
  await expect(page.locator('.sheet').last()).toContainText('מתחת לחסימה');
  await page.locator('.sheet').last().getByRole('button', { name: new RegExp(target) }).click();
  await expect(page.getByTestId('merge-forecast')).toContainText('יחד:');
  await shot(page, '50-alliances');
  await page.getByRole('button', { name: /להציע איחוד/ }).click();
  await expect(page.locator('.toast').first()).toBeVisible();
});

test('guide explains gains and risks', async ({ page }) => {
  await load(page, leaderGame());
  await page.locator('.tabbar').getByText('לוח').click();
  await page.locator('.hud button[aria-label="עזרה"], button:has-text("❓")').first().click();
  await page.getByRole('button', { name: /מה מרוויחים ומה מפסידים/ }).click();
  await expect(page.locator('.sheet').last()).toContainText('ראיון באולפן');
  await expect(page.locator('.sheet').last()).toContainText('חוג בית');
  await shot(page, '51-guide');
});

test('a shock spawns a new party with momentum and a reaction card', async ({ page }) => {
  const g = leaderGame();
  const ctx = SHOCKS.find((s) => s.id === 'shock_general')!.setup(g)!;
  g.eventQueue.push({ eventId: 'shock_general', ctx });
  await load(page, g);
  await expect(page.locator('.event-card')).toContainText('נכנס/ה לפוליטיקה');
  await shot(page, '52-shock');
  await page.locator('.event-card button').last().click();
  const overlay = page.locator('.event-overlay');
  if (await overlay.count()) await overlay.locator('button.btn.primary').first().click();
  await page.locator('.tabbar').getByText('לוח').click();
  await expect(page.getByTestId('momentum')).toContainText('▲');
  await page.getByTestId('momentum').scrollIntoViewIfNeeded();
  await shot(page, '53-momentum');
});
