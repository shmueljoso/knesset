import { expect, test, type Page } from '@playwright/test';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

async function toPartyStep(page: Page, freshman = true) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: 'משחק חדש' }).click();
  if (freshman) await page.getByRole('button', { name: /ח"כ טרי/ }).click();
}

test('play as an existing figure: the party leader of a real Knesset', async ({ page }) => {
  await toPartyStep(page);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'המשך ←' }).click();
  await page.getByRole('button', { name: /הכנסת ה-25/ }).click();
  await page.locator('button.pick').first().click();
  await page.getByTestId('figure-toggle').click();
  await page.getByTestId('figure-option').first().click();
  await expect(page.getByTestId('figure-pick')).toContainText('תשחק/י בתור');
  await shot(page, '150-figure-pick');
  await page.getByRole('button', { name: /יוצאים לדרך/ }).click();
  await expect(page.locator('.hud')).toBeVisible();
});

test('a famous journalist enters politics, with real media and bylined columns', async ({ page }) => {
  await toPartyStep(page, false);
  await page.getByRole('button', { name: 'המשך ←' }).click();
  await page.getByRole('button', { name: 'המשך ←' }).click();
  await page.getByTestId('journalist-pick').getByRole('button', { name: /עמית סגל/ }).click();
  await shot(page, '151-journalist');
  await page.getByRole('button', { name: 'המשך ←' }).click();
  await page.getByRole('button', { name: 'המשך ←' }).click();
  await page.getByRole('button', { name: /יוצאים לדרך/ }).click();
  await expect(page.locator('.hud')).toContainText('עמית סגל');
  await page.locator('.tabbar').getByText('חדשות').click();
  await expect(page.locator('.page')).toContainText('נכנס/ת לפוליטיקה');
  await page.getByLabel('תפריט').click();
  await expect(page.getByTestId('media-real')).toHaveClass(/on/);
});
