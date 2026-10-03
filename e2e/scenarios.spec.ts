import { expect, test, type Page } from '@playwright/test';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

async function toPartyStep(page: Page) {
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /המשך/ }).click();
}

test('start the 2026 election scenario as a sitting MK', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: 'משחק חדש' }).click();
  await page.getByText('ח"כ טרי').click();
  await toPartyStep(page);
  await page.getByRole('button', { name: /לקראת הבחירות/ }).click();
  await expect(page.locator('.card').first()).toContainText('27 באוקטובר');
  await shot(page, '40-scenario-pick');
  await page.locator('button.pick').filter({ hasText: 'הליכוד' }).click();
  await page.getByRole('button', { name: /יוצאים לדרך/ }).click();
  await expect(page.locator('.hud')).toBeVisible();
  await page.locator('.tabbar').getByText('לוח').click();
  await expect(page.locator('.page')).toContainText('בחירות בעוד 3 שבועות');
  await expect(page.locator('.page')).toContainText('בנימין נתניהו');
  await shot(page, '41-scenario-dashboard');
});

test('build a Knesset in the editor and play it', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: /עורך כנסת/ }).click();
  await expect(page.locator('.page')).toContainText('120/120');
  await page.getByRole('button', { name: /הוספת מפלגה/ }).click();
  await page.getByLabel('מושבים').fill('10');
  await expect(page.locator('.page')).toContainText('130/120');
  await expect(page.getByRole('button', { name: /יש לתקן/ })).toBeDisabled();
  await shot(page, '42-editor-error');
  // לתקן: להוריד 10 מהמפלגה הראשונה
  await page.locator('.card button.spread').first().click();
  await page.getByLabel('מושבים').fill('52');
  await expect(page.locator('.page')).toContainText('120/120');
  await shot(page, '43-editor-ok');
  await page.getByRole('button', { name: /לשחק עם הכנסת הזו/ }).click();
  await toPartyStep(page);
  await expect(page.locator('.card').first()).toContainText('הכנסת שלי');
  await page.locator('button.pick').first().click();
  await page.getByRole('button', { name: /יוצאים לדרך/ }).click();
  await expect(page.locator('.hud')).toBeVisible();
});
