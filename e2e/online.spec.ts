import { expect, test, type Page } from '@playwright/test';
import { createGame, endWeek, type GameState } from '../src/engine';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

function game(): GameState {
  const g = createGame({
    name: 'מיכל אור', gender: 'f', background: 'journalist',
    ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
    partyId: 'merkaz', scenario: 'freshman',
    avatar: { seed: 4, cover: 'none', beard: false, glasses: false, age: 41 }, seed: 12,
  });
  for (let i = 0; i < 60; i++) {
    g.eventQueue = [];
    endWeek(g);
  }
  g.eventQueue = [];
  g.report = null;
  return g;
}

/** שרת מדומה במקום Supabase (אותו ממשק) */
async function boot(page: Page, g: GameState | null, mock = true) {
  await page.addInitScript(
    ([json, m]) => {
      if (sessionStorage.getItem('seeded')) return;
      if (m) localStorage.setItem('hamishkan.onlineMock', '1');
      if (json) localStorage.setItem('hamishkan.save.v1', json);
      sessionStorage.setItem('seeded', '1');
    },
    [g ? JSON.stringify(g) : '', mock] as const,
  );
  await page.goto('/');
}

test('without a server: the game says so and still keeps local records', async ({ page }) => {
  await boot(page, game(), false);
  await page.getByRole('button', { name: /המשך משחק/ }).click();
  await page.getByLabel('תפריט').click();
  await page.getByTestId('open-account').click();
  await expect(page.getByTestId('online-unconfigured')).toContainText('עוד לא הוגדר');
});

test('sign up, pick a name, publish a score and see it on the leaderboard', async ({ page }) => {
  await boot(page, game());
  await page.getByRole('button', { name: /המשך משחק/ }).click();
  await page.getByLabel('תפריט').click();
  await page.getByTestId('open-account').click();
  await page.getByRole('button', { name: 'הרשמה' }).click();
  await page.getByTestId('auth-email').fill('michal@example.com');
  await page.getByTestId('auth-password').fill('secret123');
  await page.getByTestId('auth-submit').click();
  await expect(page.getByTestId('account-info')).toBeVisible();
  await page.getByTestId('display-name').fill('מיכל');
  await page.getByTestId('save-name-btn').click();
  await expect(page.getByTestId('account-info')).toContainText('מיכל');
  await page.getByTestId('sync-now').click();
  await expect(page.locator('.toast').last()).toContainText('הועלה לענן');
  await shot(page, '130-account');
  // סגירת החשבון מחזירה לתפריט
  await page.locator('.sheet-head').getByLabel('סגירה').click();
  await page.getByTestId('open-board').click();
  await expect(page.getByTestId('score-card')).toContainText('ניקוד מנורמל');
  await page.getByTestId('publish-score').click();
  await expect(page.getByTestId('publish-score')).toContainText('פורסם');
  await page.getByTestId('board-mine').click();
  await page.getByTestId('board-all').click();
  await expect(page.getByTestId('board-rows')).toContainText('מיכל');
  await shot(page, '131-leaderboard');
});

test('cloud save follows you to another device; weekly challenge locks the world', async ({ page }) => {
  await boot(page, game());
  await page.getByRole('button', { name: /המשך משחק/ }).click();
  await page.getByLabel('תפריט').click();
  await page.getByTestId('open-account').click();
  await page.getByTestId('auth-guest').click();
  await expect(page.getByTestId('account-info')).toBeVisible();
  await page.getByTestId('sync-now').click();
  await expect(page.locator('.toast').last()).toContainText('הועלה לענן');
  // "מכשיר אחר": המשחק המקומי נמחק, החשבון נשאר
  await page.evaluate(() => localStorage.removeItem('hamishkan.save.v1'));
  await page.reload();
  await expect(page.getByTestId('resume-cloud')).toContainText('מיכל אור');
  await shot(page, '132-title-online');
  await page.getByTestId('resume-cloud').click();
  await expect(page.locator('.hud')).toContainText('מיכל אור');
  await page.getByLabel('תפריט').click();
  await page.getByRole('button', { name: /למסך הפתיחה/ }).click();
  await page.getByTestId('start-challenge').click();
  await expect(page.getByTestId('challenge-banner')).toContainText('אתגר שבוע');
  await shot(page, '133-challenge');
});
