// מול ה-Worker האמיתי (wrangler dev): CF_URL=http://127.0.0.1:8787 npx playwright test e2e/cloudflare.spec.ts
import { expect, test } from '@playwright/test';

const CF = process.env.CF_URL;
test.skip(!CF, 'רק כשה-Worker רץ (npm run cf:dev)');

test('real Cloudflare worker: guest account, name, cloud sync, leaderboard', async ({ page }) => {
  await page.goto(`${CF}/`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${CF}/`);
  await page.getByRole('button', { name: 'משחק חדש' }).click();
  await page.getByRole('button', { name: /ח"כ טרי/ }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'המשך ←' }).click();
  await page.locator('button.pick').first().click();
  await page.getByRole('button', { name: /יוצאים לדרך/ }).click();
  await page.getByLabel('תפריט').click();
  await page.getByTestId('open-account').click();
  await page.getByTestId('auth-guest').click();
  await expect(page.getByTestId('account-info')).toBeVisible();
  await page.getByTestId('display-name').fill(`בודק${Date.now() % 10000}`);
  await page.getByTestId('save-name-btn').click();
  await page.getByTestId('sync-now').click();
  await expect(page.locator('.toast').last()).toContainText('הועלה לענן');
  await page.locator('.sheet-head').getByLabel('סגירה').click();
  await page.getByTestId('open-board').click();
  await page.getByTestId('publish-score').click();
  await expect(page.getByTestId('publish-score')).toContainText('פורסם');
  await expect(page.getByTestId('board-rows')).toContainText('בודק');
});
