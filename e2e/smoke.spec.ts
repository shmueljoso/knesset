import { expect, test, type Page } from '@playwright/test';

const shots = process.env.SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}

async function closeSheets(page: Page) {
  for (let i = 0; i < 5 && (await page.locator('.sheet').count()); i++) {
    await page.locator('.sheet button[aria-label="סגירה"]').last().click();
  }
}

async function clearOverlays(page: Page) {
  for (let i = 0; i < 12; i++) {
    const overlay = page.locator('.event-overlay');
    if (!(await overlay.count())) return;
    const choice = overlay.locator('button.choice:not([disabled])').first();
    if (await choice.count()) await choice.click();
    else await overlay.locator('button.btn.primary').first().click();
  }
}

test('grassroots aide: create, act, end weeks, persist', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'משחק חדש' }).click();
  await shot(page, '01-scenario');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /המשך/ }).click();
  await shot(page, '02-party');
  await page.locator('button.pick').first().click();
  await page.getByRole('button', { name: /יוצאים לדרך/ }).click();
  await expect(page.locator('.hud')).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, '03-map');

  await page.getByRole('button', { name: /פעולות כאן/ }).click();
  await expect(page.locator('.sheet')).toBeVisible();
  await shot(page, '04-location');
  await page.locator('.sheet .action-item:not([disabled])').nth(1).click();
  await closeSheets(page);

  for (const tab of ['לוח', 'אנשים', 'חקיקה', 'חדשות']) {
    await page.locator('.tabbar').getByText(tab).click();
    await page.waitForTimeout(150);
    await shot(page, `05-tab-${tab}`);
  }
  await page.locator('.tabbar').getByText('מפה').click();

  for (let w = 0; w < 4; w++) {
    await clearOverlays(page);
    await page.getByRole('button', { name: /סיום שבוע/ }).first().click();
    if (w === 0) await shot(page, '06-report');
    await clearOverlays(page);
  }
  await expect(page.locator('.hud')).toContainText('שבוע 5');

  await page.reload();
  await expect(page.getByRole('button', { name: /המשך משחק/ })).toBeVisible();
});

test('freshman MK proposes a bill and opens the vote counter', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: 'משחק חדש' }).click();
  await page.getByText('ח"כ טרי').click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: /המשך/ }).click();
  await page.locator('button.pick').first().click();
  await page.getByRole('button', { name: /יוצאים לדרך/ }).click();
  await clearOverlays(page);
  await page.locator('.tabbar').getByText('חקיקה').click();
  await page.getByRole('button', { name: /הצעת חוק חדשה/ }).click();
  await shot(page, '07-builder');
  await page.getByRole('button', { name: /להניח על שולחן הכנסת/ }).click();
  await expect(page.locator('.sheet')).toContainText('הונחה על שולחן הכנסת');
  await shot(page, '08-bill');
  await closeSheets(page);
  // מקדמים זמן עד שההצעה מוכנה לטרומית
  for (let w = 0; w < 10; w++) {
    await clearOverlays(page);
    await page.locator('.tabbar').getByText('מפה').click();
    await page.getByRole('button', { name: /סיום שבוע/ }).first().click();
    await clearOverlays(page);
  }
  await page.locator('.tabbar').getByText('חקיקה').click();
  await shot(page, '09-laws');
  const voteBtn = page.locator('.card').filter({ hasText: 'להצבעה' }).first();
  if (await voteBtn.count()) {
    await voteBtn.click();
    await page.getByRole('button', { name: /ספירת קולות/ }).click();
    await shot(page, '10-vote');
  }
});
