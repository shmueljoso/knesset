import { expect, test, type Page } from '@playwright/test';
import { createGame, type GameState } from '../src/engine';
import { onLawPassed } from '../src/engine/systems/issues';
import { addMemory } from '../src/engine/systems/relationships';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function game(): GameState {
  return createGame({
    name: 'נועה כהן', gender: 'f', background: 'journalist',
    ideology: { econ: -20, security: 10, religion: -40, judiciary: -30 },
    partyId: 'merkaz', scenario: 'freshman',
    avatar: { seed: 8, cover: 'none', beard: false, glasses: true, age: 39 }, seed: 2024,
  });
}

async function load(page: Page, g: GameState) {
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
}

test('dashboard shows missions, power map and burning issues', async ({ page }) => {
  const g = game();
  onLawPassed(g, { templateId: 'housing', title: 'חוק הדיור בהישג יד', scope: 2, sponsor: 'player' });
  await load(page, g);
  await page.locator('.tabbar').getByText('לוח').click();
  await expect(page.locator('.page')).toContainText('משימות');
  await expect(page.locator('.page')).toContainText('מפת הכוח');
  await expect(page.locator('.page')).toContainText('סוגיות בוערות');
  await page.getByText('מפת הכוח').scrollIntoViewIfNeeded();
  await shot(page, '30-power');
  await page.getByText('סוגיות בוערות').scrollIntoViewIfNeeded();
  await shot(page, '31-issues');
});

test('NPC profile shows memory and what they can do for you', async ({ page }) => {
  const g = game();
  const n = Object.values(g.npcs).find((x) => x.partyId === 'merkaz' && x.isMK && x.notable && g.parties.merkaz.leaderId !== x.id)!;
  addMemory(g, n.id, 'תקף/ה אותי בתקשורת', -25);
  addMemory(g, n.id, 'עזר/ה לי כשהייתי צריך', 8);
  n.knownTraits = [n.traits[0]];
  await load(page, g);
  await page.locator('.tabbar').getByText('אנשים').click();
  await page.locator('.search').fill(n.name.split(' ')[0]);
  await page.locator('.list-item').filter({ hasText: n.name }).first().click();
  await expect(page.locator('.sheet')).toContainText('זוכר/ת עליך');
  await expect(page.locator('.sheet')).toContainText('מה הוא/היא יכול/ה לעשות בשבילך');
  await shot(page, '32-npc');
});

test('retiring shows the legacy screen', async ({ page }) => {
  const g = game();
  onLawPassed(g, { templateId: 'civil', title: 'חוק ברית הזוגיות', scope: 2, sponsor: 'player' });
  g.player.achievements.push('first_law');
  await load(page, g);
  await page.getByRole('button', { name: 'תפריט' }).click();
  await page.getByRole('button', { name: /לפרוש מהפוליטיקה/ }).click();
  await page.getByRole('button', { name: /הקש\/י שוב לפרישה/ }).click();
  await expect(page.locator('.event-overlay')).toContainText('המורשת שלך');
  await shot(page, '33-legacy');
  await page.getByRole('button', { name: 'להמשיך לשחק' }).click();
  await expect(page.locator('.hud')).toBeVisible();
});

test('bill builder shows Basic Law requirements', async ({ page }) => {
  await load(page, game());
  await page.locator('.tabbar').getByText('חקיקה').click();
  await page.getByRole('button', { name: /הצעת חוק חדשה/ }).click();
  await page.locator('.sheet .seg button').filter({ hasText: 'חוקי יסוד' }).click();
  await expect(page.locator('.sheet')).toContainText('דרוש רוב של');
  await shot(page, '34-basic-law');
});
