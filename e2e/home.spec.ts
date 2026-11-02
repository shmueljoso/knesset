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

test('why it happened: the sheet and the weekly report', async ({ page }) => {
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(game()));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
  await page.getByTestId('home-recs').locator('button[data-testid^="do-"]').first().click();
  for (let i = 0; i < 6 && (await page.locator('.event-overlay').count()); i++) {
    const c = page.locator('.event-overlay button.choice:not([disabled])').first();
    if (await c.count()) await c.click();
    else await page.locator('.event-overlay button.btn.primary').first().click();
  }
  await page.getByTestId('open-why').click();
  await expect(page.locator('.sheet')).toContainText('השבוע עד עכשיו');
  await expect(page.locator('.sheet [data-testid="why-list"]').first()).toBeVisible();
  await shot(page, '122-why');
  await page.locator('.sheet button[aria-label="סגירה"]').click();
  await page.getByRole('button', { name: /סיום שבוע/ }).first().click();
  await expect(page.locator('.event-card')).toContainText('למה זה קרה – אצלך');
  await expect(page.getByTestId('front-page')).toContainText('המשכן היומי');
  await shot(page, '123-report-why');
});

test('simple mode: switch in the menu, small events are decided for you', async ({ page }) => {
  const g = game();
  g.settings.simple = true;
  // אירוע שהוכרע אוטומטית בשבוע שעבר
  g.autoDecisions = [{ week: g.week, title: 'עיתונאי מבקש תגובה', choice: 'להגיב בקצרה', line: 'מוכרות +1' }];
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
  await page.getByRole('button', { name: /סיום שבוע/ }).first().click();
  await expect(page.getByTestId('auto-decision').first()).toContainText('עיתונאי מבקש תגובה');
  await shot(page, '124-auto');
  await page.getByRole('button', { name: /קדימה לשבוע/ }).click();
  for (let i = 0; i < 6 && (await page.locator('.event-overlay').count()); i++) {
    const c = page.locator('.event-overlay button.choice:not([disabled])').first();
    if (await c.count()) await c.click();
    else await page.locator('.event-overlay button.btn.primary').first().click();
  }
  await page.getByLabel('תפריט').click();
  await expect(page.getByTestId('mode-simple')).toHaveClass(/on/);
  await page.getByTestId('mode-expert').click();
  await expect(page.getByTestId('mode-expert')).toHaveClass(/on/);
});

test('seasons: goals on the home screen and the season review', async ({ page }) => {
  const g = game();
  g.seasonLog = [{ n: 1, start: 0, end: 52, grade: 'B', done: 2, total: 3, goals: [{ text: '📜 להעביר חוק', done: true }, { text: '📣 מוכרות 50', done: true }, { text: '🎖️ מוניטין 60', done: false }], laws: 1, fameDelta: 12 }];
  g.season.n = 2;
  g.flags.showSeason = true;
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
  await expect(page.getByTestId('season-review')).toContainText('עונה טובה');
  await shot(page, '125-season-review');
  await page.getByRole('button', { name: /לעונה 2/ }).click();
  await expect(page.getByTestId('season-review')).toHaveCount(0);
  await expect(page.getByTestId('season-card')).toContainText('עונה 2');
  await page.getByTestId('season-card').scrollIntoViewIfNeeded();
  await shot(page, '126-season-card');
});

test('rivals, the TV debate and the moments gallery', async ({ page }) => {
  const g = game();
  const foe = Object.values(g.npcs).find((n) => n.notable && n.isMK && !n.outside)!;
  foe.attitude = -70;
  g.rivals = { nemesis: foe.id, nemesisSince: 0 };
  g.moments = [{ week: 0, icon: '⚔️', text: `${foe.name} הפך/ה ליריב/ה המר/ה שלך` }];
  g.player.fame = 50;
  g.player.money = 100;
  g.player.location = 'studio';
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
  await expect(page.getByTestId('rivals-card')).toContainText(foe.name);
  await page.getByTestId('open-moments').click();
  await expect(page.getByTestId('moments')).toContainText('יריב');
  await shot(page, '127-moments');
  await page.locator('.sheet button[aria-label="סגירה"]').click();
  await page.locator('.tabbar').getByText('מפה').click();
  await page.getByRole('button', { name: /פעולות כאן/ }).click();
  await page.locator('.sheet .action-item', { hasText: 'עימות טלוויזיוני' }).click();
  for (let i = 0; i < 3; i++) {
    await expect(page.locator('.event-card')).toContainText(`סבב ${i + 1}/3`);
    if (i === 0) await shot(page, '128-debate');
    await page.locator('.event-overlay button.choice').nth(i).click();
    // תוצאת הסבב – ממשיכים
    const cont = page.locator('.event-overlay button.btn.primary');
    if (i < 2 && (await cont.count()) && !(await page.locator('.event-overlay button.choice').count())) await cont.first().click();
  }
  await expect(page.locator('.event-card')).toContainText('עימות');
});
