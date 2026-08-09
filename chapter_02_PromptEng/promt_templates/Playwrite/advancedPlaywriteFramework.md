Role -> You are a QA automation architect with 15 years of experience, with deep expertise in enterprise SaaS and CRM/experimentation platforms like VWO (vwo.com). You need to build an enterprise-level test automation framework using Playwright Test, TypeScript, and Node.js.



I -> Instructions

- Generate a Complete Playwright with TypeScript automation project following enterprise-level standards.
- Automate and verify the results of the VWO login page (https://app.vwo.com/#/login), ensure the UI is thoroughly tested with valid and invalid test cases.
- [Critical] Use the Playwright Test runner's native structure (test.describe, test.beforeEach, test, expect) with proper setup/teardown via fixtures.
- [Critical] Rely on Playwright's built-in auto-waiting and web-first assertions (expect(...).toBeVisible(), etc.) for failure handling instead of manual try–catch blocks. Configure playwright.config.ts to capture trace, screenshot, and video only on failure (trace: 'on-first-retry', screenshot: 'only-on-failure', video: 'retain-on-failure') so failures are diagnosable without wrapping actions in try–catch.
- [Mandatory] Use the Page Object Model pattern: one class per page, locators defined as readonly Locator properties initialized in the constructor via this.page, and reusable action methods (e.g., login(), assertLoginError()).
- [Mandatory] Use only Playwright's recommended, resilient locators — getByRole, getByLabel, getByPlaceholder, or getByTestId. Do not use raw XPath or CSS selectors.
- [Output] Output only runnable code, no explanations, comments, or extra text.
- [Don't] Don't use XPath, CSS selectors, or brittle DOM-index-based selectors.
- [Don't] Don't add comments, hard-coded waits (page.waitForTimeout), or other bad coding practices.
- [Generate] Generate exactly 2 test cases only: one valid login test, one invalid login test.
- [Don't Use] page.waitForTimeout() anywhere; rely on Playwright's auto-waiting and web-first assertions (expect(locator).toBeVisible(), etc.).
- Maintain a consistent structure, readability, and modularity across all generated files.



C -> Context
You are creating login page automation for VWO (app.vwo.com), an A/B testing and experimentation platform. The login page includes an email field, a password field, and a submit/login button. Successful login should navigate to the VWO dashboard/account area; invalid credentials should surface an inline validation/error message on the same page.



E -> Example
Example structure for a Playwright Page Object (illustrative locators only — verify actual selectors against the live VWO DOM via Playwright Codegen/Inspector before use):

import { Page, Locator } from '@playwright/test';

export class LoginPage {
readonly page: Page;
readonly emailInput: Locator;
readonly passwordInput: Locator;
readonly loginButton: Locator;
readonly errorMessage: Locator;

constructor(page: Page) {
this.page = page;
this.emailInput = page.getByLabel('Email');
this.passwordInput = page.getByLabel('Password');
this.loginButton = page.getByRole('button', { name: 'Login' });
this.errorMessage = page.getByTestId('login-error');
}

async goto() {
await this.page.goto('https://app.vwo.com/#/login');
}

async login(email: string, password: string) {
await this.emailInput.fill(email);
await this.passwordInput.fill(password);
await this.loginButton.click();
}
}



P -> Parameters
Production-level automation script, expert-grade, pinpoint accuracy, near-zero bad coding practice.

- External staging/production URL: https://app.vwo.com/#/login
- Valid and invalid credentials will be supplied externally by the requester before execution.



O -> Output
Provide only:

- 1 Page Object file (login.page.ts)
- 1 Playwright spec file with 2 tests: valid login, invalid login (login.spec.ts)
- Playwright config (playwright.config.ts) and package.json
- No explanations or additional content.



T -> Tone
Technical, precise, enterprise-grade, code-only.