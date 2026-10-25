import { expect, test, type Page } from '@playwright/test';
import { createGame, type GameState } from '../src/engine';
import { runElection } from '../src/engine/systems/elections';
import { onLawPassed } from '../src/engine/systems/issues';
import { applyTransform } from '../src/engine/systems/transforms';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function game(): GameState {
  return createGame({
    name: 'עדי לוי', gender: 'f', background: 'journalist',
    ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
    partyId: 'merkaz', scenario: 'freshman',
    avatar: { seed: 2, cover: 'none', beard: false, glasses: false, age: 45 }, seed: 5,
  });
}

async function load(page: Page, g: GameState) {
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
}

test('direct election: election night shows the PM race', async ({ page }) => {
  const g = game();
  g.rules.directPM = true;
  runElection(g);
  g.flags.showElection = true;
  await load(page, g);
  await page.getByRole('button', { name: /לתוצאות הסופיות/ }).click();
  await expect(page.getByTestId('pm-race')).toContainText('נבחר');
  await page.getByTestId('pm-race').scrollIntoViewIfNeeded();
  await shot(page, '95-pm-race');
});

test('active rules are listed, and contradicting bills are blocked', async ({ page }) => {
  const g = game();
  onLawPassed(g, { templateId: 'norwegian', title: 'החוק הנורבגי', scope: 2, sponsor: 'npc' });
  applyTransform(g, 'halacha', 2, 'npc', 'r_halacha');
  g.eventQueue = [];
  await load(page, g);
  await page.locator('.tabbar').getByText('לוח').click();
  await expect(page.getByTestId('rules')).toContainText('החוק הנורבגי');
  await page.getByTestId('rules').scrollIntoViewIfNeeded();
  await shot(page, '96-rules');
  await page.locator('.tabbar').getByText('חקיקה').click();
  await page.getByRole('button', { name: /הצעת חוק חדשה/ }).click();
  await page.getByRole('button', { name: /^חברה$/ }).click();
  await page.getByRole('button', { name: /ברית הזוגיות/ }).click();
  await expect(page.getByTestId('bill-blocked')).toContainText('מדינת הלכה');
});
