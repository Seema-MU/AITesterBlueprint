# VWO Login — Playwright + TypeScript + Node.js Framework

## Objective
Enterprise-grade Playwright Test framework that automates and verifies the VWO login page
(`https://app.vwo.com/#/login`) — exactly 2 test cases (valid + invalid login) — following the
RICEPOT prompt in `chapter_02_PromptEng/promt_templates/Playwrite/advancedPlaywriteFramework.md`:
native Playwright structure, web-first assertions (no try-catch), Page Object Model with
resilient locators only (no XPath/CSS), and trace/screenshot/video capture on failure.

## Deliverables (files to create)
Fresh folder `chapter_02_PromptEng/VwoPlaywrightFramework/`:

```
VwoPlaywrightFramework/
├── package.json                 # deps: @playwright/test; scripts: test, test:headed, codegen
├── playwright.config.ts         # 3 browsers, trace/screenshot/video on failure, env creds
├── .gitignore                   # node_modules/, test-results/, playwright-report/, .env
├── src/
│   ├── pages/
│   │   └── login.page.ts        # 1 Page Object (POM) for VWO login
│   └── tests/
│       └── login.spec.ts        # 1 spec, exactly 2 tests: valid + invalid
```

## Key decisions (from user)
- **Location**: `chapter_02_PromptEng/VwoPlaywrightFramework/`
- **Credentials**: env vars `VWO_USERNAME` / `VWO_PASSWORD`; tests fail fast with a clear message if unset. Nothing hardcoded.
- **Browsers**: Chromium, Firefox, WebKit (3 Playwright projects).

## File-by-file design

### 1. `package.json`
- `"devDependencies": { "@playwright/test": "latest-stable" }`
- Scripts: `test` → `playwright test`, `test:headed` → `playwright test --headed`, `codegen` → `playwright codegen https://app.vwo.com/#/login`
- `"type": "commonjs"` omitted (default) — plain TS, no ESM complications.

### 2. `playwright.config.ts`
- `testDir: './src/tests'`, fullyParallel: true.
- `reporter`: `[['list'], ['html', { open: 'never' }]]`.
- `use`: `baseURL: 'https://app.vwo.com'`, `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`, `viewport`, and `testIdAttribute: 'data-testid'`.
- `projects`: `chromium`, `firefox`, `webkit` (desktop).
- `webServer`: none (external URL — do not start a local server).

### 3. `src/pages/login.page.ts` (the 1 Page Object)
- `export class LoginPage` with `readonly page: Page` + `readonly` Locator props, init in constructor via `this.page`.
- Locators — **resilient, no XPath/CSS** (matching the prompt's example; VERIFY against live VWO DOM with Codegen before use):
  - `emailInput` → `page.getByLabel('Email')` (fallback: `getByPlaceholder`)
  - `passwordInput` → `page.getByLabel('Password')` (fallback: `getByPlaceholder`)
  - `loginButton` → `page.getByRole('button', { name: 'Login' })`
  - `errorMessage` → `page.getByTestId('login-error')` (fallback: text `page.getByText(...)` for the inline error)
- Reusable action methods (no `waitForTimeout`, no try-catch — auto-waiting + web-first assertions):
  - `async goto()` — `page.goto('/#/login')`, rely on auto-wait.
  - `async login(email, password)` — `fill` both inputs, `click` login.
  - `async expectLoginErrorVisible()` — `await expect(errorMessage).toBeVisible()` + assert text (e.g., contains "Invalid" / VWO's actual message) — web-first, no manual wait.
  - `async expectDashboardVisible()` — `await expect(page).toHaveURL(/dashboard/)` or a dashboard landmark visible, per live DOM.
  - `async expectLoginFormVisible()` — for the invalid case, confirm the form is still displayed (no redirect).

### 4. `src/tests/login.spec.ts` (the 1 spec, exactly 2 tests)
- `test.describe('VWO Login', ...)` with `test.beforeEach(async ({ page }) => { loginPage = new LoginPage(page); await loginPage.goto(); })`.
- **Test 1 — valid login**: read `VWO_USERNAME`/`VWO_PASSWORD` (fail fast if unset → `test.skip` or `expect` fail with clear msg); `login(username, password)`; `expectDashboardVisible()`.
- **Test 2 — invalid login**: `login('invalid@example.com', 'WrongPass123!')`; `expectLoginErrorVisible()`; confirm still on login form (no dashboard).
- No try-catch anywhere; failures diagnosed via trace/screenshot/video.

### 5. `.gitignore`
`node_modules/`, `test-results/`, `playwright-report/`, `.env`, `.env.*`, `*.log`.

## VWO-specific risks & mitigations
- **SPA route** (`/#/login`): use `page.goto('/#/login')` relative to `baseURL`; after login VWO redirects to its own dashboard path — assert on URL pattern / dashboard landmark per live DOM.
- **Locators are illustrative**: the prompt's example selectors must be verified against the live VWO DOM. Plan includes running `npx playwright codegen https://app.vwo.com/#/login` (or the `codegen` script) during implementation to capture real `data-testid`/roles; if the page uses placeholders instead of labels, use `getByPlaceholder` (allowed).
- **No local webServer**: VWO is external; config intentionally has no `webServer`.

## Environment check (first implementation step)
- Verify `node --version` (≥18, required by modern Playwright) and `npm --version`; if Node is missing, install Node LTS (winget `OpenJS.NodeJS.LTS` or binary) — same pattern as the earlier Java/Maven setup.
- `npm install` will fetch `@playwright/test`; run `npx playwright install` to download the 3 browser binaries (large, may need time).

## Verification
1. `cd VwoPlaywrightFramework && npx playwright test` (or `npm test`).
2. Expect: invalid test passes; valid test passes when `VWO_USERNAME`/`VWO_PASSWORD` env vars are set to working VWO creds (or skips/fails cleanly with a clear message when unset).
3. Check `test-results/` for trace/screenshot/video on any failure; `playwright-report/` for the HTML report.
4. `npx playwright test --project=chromium` / `--project=firefox` / `--project=webkit` to run per-browser; `npx playwright test --headed` for visual debugging.
5. Codegen command available for locator verification.

## Assumptions
- Node.js ≥ 18 available or installed as part of implementation.
- Env vars `VWO_USERNAME`/`VWO_PASSWORD` supply valid creds at runtime (external creds will be provided before execution).
- Output is code-only per the RICEPOT prompt; no README or extra comments inside the generated files.
