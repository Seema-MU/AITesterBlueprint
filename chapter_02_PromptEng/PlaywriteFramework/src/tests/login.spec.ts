import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';

test.describe('VWO Login', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.expectLoginFormVisible();
  });

  test('valid login navigates to the VWO dashboard', async ({ page }) => {
    const username = process.env.VWO_USERNAME;
    const password = process.env.VWO_PASSWORD;

    test.skip(!username || !password,
      'VWO_USERNAME and VWO_PASSWORD environment variables must be set to run the valid login test.');

    await loginPage.login(username as string, password as string);
    await expect(page).toHaveURL(/dashboard/);
  });

  test('invalid credentials display an inline login error and stay on the login page', async ({ page }) => {
    await loginPage.login('invalid.user@example.com', 'WrongPass123!');
    await loginPage.expectLoginErrorVisible();
    await expect(page).toHaveURL(/#\/login/);
  });
});
