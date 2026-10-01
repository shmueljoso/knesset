import { expect, test, type Page } from '@playwright/test';
import { createGame, type GameState } from '../src/engine';
import { runElection } from '../src/engine/systems/elections';
import { appointPlayerMinister } from '../src/engine/systems/government';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function baseGame(): GameState {
  return createGame({
    name: 'יעל לוי',
    gender: 'f',
    background: 'officer',
    ideology: { econ: 40, security: 60, religion: 10, judiciary: 50 },
    partyId: 'tikva',
    scenario: 'freshman',
    avatar: { seed: 3, cover: 'none', beard: false, glasses: false, age: 45 },
    seed: 777,
  });
}

async function loadState(page: Page, g: GameState) {
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
}

test('formateur negotiates a coalition from the UI', async ({ page }) => {
  const g = baseGame();
  const party = g.parties.tikva;
  party.leaderId = 'player';
  party.list = ['player', ...party.list.filter((x) => x !== 'player')];
  party.poll = 34;
  runElection(g);
  delete g.flags.showElection;
  g.eventQueue = [];
  expect(g.negotiation?.mode).toBe('formateur');
  await loadState(page, g);
  await page.getByText(/הרכבת ממשלה:/).click();
  await expect(page.locator('.sheet')).toContainText('הרכבת הממשלה');
  const firstTalk = page.locator('.sheet .card').nth(1);
  await firstTalk.locator('button.spread').click();
  const demands = firstTalk.locator('.list-item:not([disabled])');
  const count = await demands.count();
  for (let i = 0; i < count; i++) await demands.nth(i).click();
  await shot(page, '20-negotiation');
  await firstTalk.getByRole('button', { name: /להציע הסכם/ }).click();
  await expect(page.locator('.toast').first()).toBeVisible();
});

test('minister launches a program and holds a cabinet meeting', async ({ page }) => {
  const g = baseGame();
  appointPlayerMinister(g, 'housing');
  g.player.location = 'ministry';
  await loadState(page, g);
  await page.locator('.tabbar').getByText('לוח').click();
  await expect(page.locator('.page')).toContainText('שרת הבינוי והשיכון');
  await page.getByRole('button', { name: /שרת הבינוי והשיכון/ }).click();
  await expect(page.locator('.sheet')).toContainText('תכניות דגל');
  await shot(page, '21-ministry');
  await page.getByRole('button', { name: /להשיק/ }).first().click();
  await expect(page.locator('.toast').first()).toContainText('יוצאת לדרך');
  await page.locator('.sheet button[aria-label="סגירה"]').click();
  await page.locator('.tabbar').getByText('מפה').click();
  await page.locator('[aria-label="משרד ראש הממשלה"]').dispatchEvent('click');
  await page.getByText('ישיבת ממשלה').first().click();
  await expect(page.locator('.event-overlay')).toContainText('ישיבת ממשלה');
  await shot(page, '22-cabinet');
});
