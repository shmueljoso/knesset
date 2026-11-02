import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/engine';
import { runElection } from '../src/engine/systems/elections';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

async function clearOverlays(page: Page) {
  for (let i = 0; i < 8 && (await page.locator('.event-overlay').count()); i++) {
    await page.locator('.event-overlay button.choice:not([disabled]), .event-overlay button.btn.primary').first().click();
  }
}

test('choose the UK system and a home district, then explore the district map', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'משחק חדש' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /המשך/ }).click();
  await page.getByTestId('home-district').getByRole('button', { name: 'חיפה' }).click();
  await page.getByTestId('open-setup').click();
  await page.getByTestId('share-100').click();
  await page.getByTestId('rule-compulsory').locator('input').check();
  await page.getByTestId('setup-done').click();
  await expect(page.getByTestId('setup-summary')).toContainText('100% מהמושבים במחוזות');
  await page.locator('button.pick').first().click();
  await page.getByRole('button', { name: /יוצאים לדרך/ }).click();
  await expect(page.locator('.hud')).toBeVisible();
  await clearOverlays(page);
  await page.locator('.tabbar').getByText('לוח').click();
  await expect(page.getByTestId('district-card')).toContainText('חיפה והקריות');
  await expect(page.getByTestId('state-facts')).toContainText('בחירות מחוזיות');
  await page.getByTestId('open-districts').click();
  await expect(page.getByTestId('system-note')).toContainText('מחוזית מלאה');
  await expect(page.locator('[data-testid^="dtile-"]')).toHaveCount(12);
  await page.getByTestId('dtile-bnei_brak').click();
  await expect(page.getByTestId('district-detail')).toContainText('בני ברק');
  await shot(page, '140-district-map');
  await page.getByTestId('dtile-negev').click();
  await page.getByTestId('visit-district').click();
  await expect(page.locator('.toast').last()).toContainText('ביקרת');
  // הלוח ננעל בעולם מותאם
  await page.getByTestId('dtile-sharon').click();
  await page.getByTestId('move-home').click();
  await expect(page.locator('.toast').last()).toContainText('מחוז הבית');
});

test('election night shows the district map', async ({ page }) => {
  const g = createGame({
    name: 'נועה כהן', gender: 'f', background: 'journalist',
    ideology: { econ: 0, security: 0, religion: 0, judiciary: 0 },
    partyId: 'merkaz', scenario: 'freshman',
    avatar: { seed: 3, cover: 'none', beard: false, glasses: false, age: 38 }, seed: 9, district: 'telaviv',
  });
  g.eventQueue = [];
  g.rules.districtShare = 0.5;
  g.rules.directPM = true;
  g.rules.electoral = true;
  runElection(g);
  g.eventQueue = [];
  g.negotiation = null;
  g.flags.showElection = true;
  await page.addInitScript((json) => localStorage.setItem('hamishkan.save.v1', json), JSON.stringify(g));
  await page.goto('/');
  await page.getByRole('button', { name: /המשך משחק/ }).click();
  await page.getByRole('button', { name: /לתוצאות הסופיות/ }).click();
  await expect(page.getByTestId('election-map')).toContainText('מעורבת');
  await expect(page.locator('[data-testid^="dtile-"]')).toHaveCount(12);
  await expect(page.getByTestId('electoral-count')).toContainText('אלקטורים');
  await shot(page, '141-election-map');
});
