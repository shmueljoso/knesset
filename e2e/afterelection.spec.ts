import { expect, test, type Page } from '@playwright/test';
import { createGame, type GameState } from '../src/engine';
import k2022 from '../mods/knesset-25-2022.json' with { type: 'json' };
import type { ModFile } from '../src/engine/mods';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function game(): GameState {
  const base = k2022 as unknown as ModFile;
  const big = [...base.parties].sort((a, b) => b.seats - a.seats)[0];
  const g = createGame({
    name: 'רונית לב', gender: 'f', background: 'journalist',
    ideology: { econ: 20, security: 40, religion: 10, judiciary: 30 },
    partyId: big.id, scenario: 'freshman', asLeader: true, mod: { ...base, afterElection: true },
    avatar: { seed: 5, cover: 'none', beard: false, glasses: false, age: 52 }, seed: 3,
  });
  g.eventQueue = [];
  g.report = null;
  return g;
}

test('start the day after the elections as a party leader: form a government or hand back the mandate', async ({ page }) => {
  await page.addInitScript((json) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('hamishkan.save.v1', json);
      sessionStorage.setItem('seeded', '1');
    }
  }, JSON.stringify(game()));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
  await page.getByText(/הרכבת ממשלה: \d+\/61/).click();
  await expect(page.getByTestId('return-mandate')).toBeVisible();
  await shot(page, '140-mandate');
  await page.getByTestId('return-mandate').click();
  await page.getByTestId('return-mandate').click();
  await expect(page.locator('.toast').last()).toContainText('החזרת את המנדט');
});

test('the create screen offers to play as the party leader', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'משחק חדש' }).click();
  await page.getByRole('button', { name: /ח"כ טרי/ }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'המשך ←' }).click();
  await expect(page.getByTestId('as-leader')).toContainText('יו"ר המפלגה');
});
