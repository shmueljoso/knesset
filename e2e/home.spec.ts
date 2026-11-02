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
  g.eventQueue = [];
  endWeek(g);
  g.eventQueue = [];
  g.report = null;
  g.player.ap = 5;
  g.player.money = 4;
  return g;
}

test('home: urgent items, one-tap recommendations and labeled stats', async ({ page }) => {
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(game()));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByTestId('home-goal')).toContainText('היעד');
  await expect(page.getByTestId('home-alerts')).toContainText('הקופה');
  await shot(page, '120-home');
  const first = page.getByTestId('home-recs').locator('button[data-testid^="do-"]').first();
  await first.click();
  await expect(page.locator('.toast, .event-overlay').first()).toBeVisible();
  await expect(page.locator('.hud-stats')).toContainText('זמן');
  // הסבר על מדד בלחיצה
  await page.locator('.hud-stats .stat', { hasText: 'מוניטין' }).click();
  await expect(page.locator('.toast').last()).toContainText('עמיתים');
  // הלוח מחולק ללשוניות
  await page.locator('.tabbar').getByText('לוח').click();
  for (const sub of ['national', 'power', 'me', 'news']) {
    await page.getByTestId(`dash-tab-${sub}`).click();
    await expect(page.getByTestId(`dash-tab-${sub}`)).toHaveAttribute('aria-selected', 'true');
  }
  await shot(page, '121-dash-news');
});
