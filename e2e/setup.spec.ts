import { expect, test, type Page } from '@playwright/test';

const shots = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
};

test('custom world: presidential system and a yeshiva exemption, locked for the whole game', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'משחק חדש' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /המשך/ }).click();
  await page.getByTestId('open-setup').click();
  await page.getByTestId('rule-presidential').locator('input').check();
  await page.getByTestId('setup-laws').click();
  await page.getByTestId('preset-exemption').click();
  await page.getByTestId('setup-state').click();
  await shot(page, '130-setup-state');
  await page.getByTestId('setup-done').click();
  await expect(page.getByTestId('setup-summary')).toContainText('שיטה נשיאותית');
  await expect(page.getByTestId('setup-summary')).toContainText('חוק מעמד לומדי התורה');
  await shot(page, '131-setup-summary');
  await page.locator('button.pick').first().click();
  await page.getByRole('button', { name: /יוצאים לדרך/ }).click();
  await expect(page.locator('.hud')).toBeVisible();
  // מצב המדינה מוצג בלוח
  for (let i = 0; i < 8 && (await page.locator('.event-overlay').count()); i++) {
    await page.locator('.event-overlay button.choice:not([disabled]), .event-overlay button.btn.primary').first().click();
  }
  await page.locator('.tabbar').getByText('לוח').click();
  await expect(page.getByTestId('state-facts')).toContainText('פטור מעוגן בחוק');
  // נעול: אין עריכת מספרים
  await page.getByLabel('תפריט').click();
  await page.getByTestId('open-tools').click();
  await expect(page.getByTestId('tools-locked')).toBeVisible();
});
