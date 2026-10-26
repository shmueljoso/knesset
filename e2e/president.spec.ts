import { expect, test, type Page } from '@playwright/test';
import { createGame, endWeek, type GameState } from '../src/engine';
import { startPresidentRace } from '../src/engine/systems/president';
import { declareCandidacy } from '../src/engine/systems/presidency';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function game(seed = 5): GameState {
  const g = createGame({
    name: 'עדי לוי', gender: 'f', background: 'journalist',
    ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
    partyId: 'merkaz', scenario: 'freshman',
    avatar: { seed: 2, cover: 'none', beard: false, glasses: false, age: 45 }, seed,
  });
  g.player.fame = 85;
  g.player.reputation = 85;
  g.player.money = 300;
  g.player.capital = 30;
  g.presidentNextWeek = g.week + 60;
  for (let i = 0; i < 2; i++) {
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

function president(): GameState {
  for (let seed = 1; seed < 12; seed++) {
    const g = game(seed);
    declareCandidacy(g);
    for (const n of Object.values(g.npcs)) {
      if (n.isMK) g.presCampaign!.pledges.push(n.id);
      n.attitude = 90;
    }
    g.presCampaign!.momentum = 100;
    g.presidentNextWeek = g.week;
    startPresidentRace(g);
    if (g.presidentRace?.winner === 'player') {
      delete g.flags.showPresident;
      g.presidentRace = null;
      g.eventQueue = [];
      g.player.ap = 5;
      return g;
    }
  }
  throw new Error('no win');
}

test('declare candidacy early and run a campaign', async ({ page }) => {
  await load(page, game());
  await page.locator('.tabbar').getByText('לוח').click();
  await expect(page.getByTestId('pres-card')).toContainText('נשיאות המדינה');
  await page.getByTestId('pres-open').click();
  await shot(page, '110-president-before');
  await page.getByTestId('pres-declare').click();
  await expect(page.locator('.toast').first()).toContainText('הכרזת');
  await expect(page.getByTestId('pres-race')).toContainText('ספירת ראשים');
  await page.getByRole('button', { name: /מסע הופעות בציבור/ }).click();
  await expect(page.locator('.toast').last()).toContainText('מסע הופעות');
  await shot(page, '111-president-campaign');
});

test('the presidency tab: unity, actions, initiatives and mandate policy', async ({ page }) => {
  await load(page, president());
  await expect(page.locator('.tabbar')).toContainText('נשיאות');
  await page.locator('.tabbar').getByText('נשיאות').click();
  await expect(page.getByTestId('presidency')).toContainText('אחדות העם');
  await expect(page.getByTestId('unity-drivers')).toContainText('לכידות');
  await shot(page, '112-presidency');
  await page.getByRole('button', { name: /נאום לאומי/ }).click();
  await expect(page.locator('.toast').last()).toContainText('נאום');
  await page.getByTestId('init-heritage').click();
  await expect(page.locator('.toast').last()).toContainText('התקדמות');
  await page.getByTestId('mandate').getByRole('button', { name: 'ממשלה רחבה' }).click();
  await expect(page.getByTestId('mandate')).toContainText('אחדות רחבה');
  await shot(page, '113-presidency-initiatives');
});
