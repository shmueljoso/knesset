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
  g.demo.haredi = 1.25;
  g.player.money = 300;
  for (let i = 0; i < 3; i++) {
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

test('dashboard shows population change', async ({ page }) => {
  await load(page, game());
  await page.locator('.tabbar').getByText('לוח').click();
  await expect(page.getByTestId('demography')).toContainText('חרדים');
  await page.getByTestId('demography').scrollIntoViewIfNeeded();
  await shot(page, '100-demography');
});

test('settings: dynamics level and the advanced tools behind a warning', async ({ page }) => {
  await load(page, game());
  await page.getByLabel('תפריט').click();
  await page.getByTestId('dyn-strong').click();
  await expect(page.getByTestId('dyn-strong')).toHaveClass(/on/);
  await page.getByTestId('open-tools').click();
  await expect(page.getByTestId('tools-warning')).toContainText('אזהרה');
  await shot(page, '101-tools');
  await page.getByTestId('tools-ack').check();
  const money = page.getByTestId('edit-player.money');
  await money.fill('777');
  await money.blur();
  await page.getByRole('button', { name: 'מצב המדינה' }).click();
  await page.getByTestId('edit-world.economy').fill('12');
  await page.getByTestId('edit-world.economy').blur();
  await expect(page.getByTestId('edit-world.economy')).toHaveValue('12');
  await shot(page, '102-tools-edit');
  await page.getByTestId('skip-4').click();
  await expect(page.locator('.toast').first()).toContainText('דילגת');
});

test('long-term projects show on the dashboard', async ({ page }) => {
  const g = game();
  g.projects = [{ id: 'prj1', kind: 'tour', start: g.week - 2, weeks: 6, sector: 'traditional', level: 1 }];
  g.flags.machine = 2;
  await load(page, g);
  await page.locator('.tabbar').getByText('לוח').click();
  await expect(page.getByTestId('projects')).toContainText('סיור שטח');
  await expect(page.getByTestId('assets')).toContainText('מכונה ארגונית ברמה 2');
  await page.getByTestId('projects').scrollIntoViewIfNeeded();
  await shot(page, '103-projects');
});

test('coalition talks: a signed party can be cancelled', async ({ page }) => {
  const { startFormateur } = await import('../src/engine/systems/coalition');
  const g = game();
  g.parties.merkaz.leaderId = 'player';
  startFormateur(g);
  const t = g.negotiation!.talks[0];
  t.signed = true;
  await load(page, g);
  await page.getByText('הרכבת ממשלה', { exact: false }).first().click();
  await page.getByTestId(`cancel-${t.partyId}`).click();
  await expect(page.getByTestId(`cancel-${t.partyId}`)).toHaveCount(0);
});

test('bill builder: search, hot topics and the details screen', async ({ page }) => {
  const g = game();
  g.issues.housing = 85;
  await load(page, g);
  await page.locator('.tabbar').getByText('חקיקה').click();
  await page.getByRole('button', { name: /הצעת חוק חדשה/ }).click();
  await expect(page.getByRole('button', { name: /בוער עכשיו/ })).toBeVisible();
  await shot(page, '104-builder-list');
  await page.getByTestId('bill-search').fill('שבת');
  await expect(page.locator('.law-row')).toHaveCount(await page.locator('.law-row').count());
  await page.locator('.law-row').first().click();
  await expect(page.getByTestId('bill-odds')).toContainText('סיכוי');
  await shot(page, '105-builder-details');
});

test('polls: pollster is visible and what-if polls show', async ({ page }) => {
  const g = game();
  g.player.fame = 50;
  for (let i = 0; i < 8; i++) {
    g.eventQueue = [];
    endWeek(g);
  }
  g.eventQueue = [];
  g.report = null;
  await load(page, g);
  await page.locator('.tabbar').getByText('לוח').click();
  await expect(page.getByTestId('dash-pollster')).toContainText('סקר');
  await expect(page.getByTestId('party-status')).toBeVisible();
  await page.getByTestId('open-polls').click();
  await expect(page.getByTestId('pollster-tabs')).toBeVisible();
  await expect(page.getByTestId('hypos')).toContainText('אם');
  await expect(page.getByTestId('resign')).toContainText('לחץ ציבורי');
  await shot(page, '106-polls-whatif');
});

test('a PM who split from the party gets options: dissolve, continue or resign', async ({ page }) => {
  const { splitFaction } = await import('../src/engine/systems/parties');
  const g = game();
  const mine = g.parties.merkaz;
  mine.leaderId = 'player';
  mine.list = ['player', ...mine.list.filter((x) => x !== 'player')];
  g.coalition.parties.push('merkaz');
  g.coalition.satisfaction.merkaz = 70;
  g.coalition.pmId = 'player';
  g.ministers.pm = 'player';
  for (const n of Object.values(g.npcs)) if (n.partyId === 'merkaz') { n.attitude = 80; n.trust = 80; }
  g.eventQueue = [];
  expect(splitFaction(g, 'דרך חדשה', '#22c55e').ok).toBe(true);
  await load(page, g);
  await expect(page.locator('.event-card')).toContainText('עזב/ה את מפלגתו');
  await shot(page, '107-pm-split');
  await page.getByRole('button', { name: /להתפטר ולהעביר את הממשלה/ }).click();
  await page.getByRole('button', { name: /^המשך$/ }).click().catch(() => undefined);
});
