# Salesforce Login — Selenium + Java + Maven + TestNG Framework

## Objective
Enterprise-grade Selenium framework that automates and verifies the Salesforce login page
(`https://login.salesforce.com/?locale=in`) — valid and invalid login flows — using
Page Object Model + PageFactory, XPath-only locators, explicit waits (no `Thread.sleep`),
structured exception handling, and TestNG lifecycle annotations.

## Deliverables (files to create)
Maven standard project layout, created fresh in `C:\Users\seema\OneDrive\Desktop\AICommandCode\salesforce-login-framework\`:

```
salesforce-login-framework/
├── pom.xml                                # Maven build, TestNG + Selenium + WebDriverManager + Surefire
├── testng.xml                             # Suite definition pointing at both test classes
├── .gitignore                             # target/, screenshots/ (enterprise hygiene)
└── src/test/java/com/salesforce/qa/
    ├── pages/
    │   └── LoginPage.java                 # 1 Page Object (PageFactory, @FindBy, XPath only)
    └── tests/
        ├── ValidLoginTest.java            # 1 TestNG script — valid credentials + UI verification
        └── InvalidLoginTest.java          # 1 TestNG script — invalid + empty credential flows
```

## Key decisions (from user)
- **Credentials**: read from environment variables `SF_USERNAME` / `SF_PASSWORD`; if missing, tests `Assert.fail` with a clear message. Nothing hardcoded.
- **Browser**: Chrome only, driven via `WebDriverManager.chromedriver().setup()` (no manual driver binaries).
- **Structure**: setup/teardown lives inside each of the 2 test classes (`@BeforeTest` / `@AfterTest`). No BaseTest class.

## File-by-file design

### 1. `pom.xml`
- `selenium-java` — latest stable 4.x (verify exact version at implementation time).
- `testng` 7.10.x.
- `webdrivermanager` — latest stable (5.9+ / 6.x).
- `maven-surefire-plugin` configured with `<suiteXmlFiles>testng.xml</suiteXmlFiles>`.
- `maven.compiler.release=11` (Selenium 4 floor), UTF-8 encoding.

### 2. `LoginPage.java` (Page Object — the ONLY page class)
- Constructor `LoginPage(WebDriver driver)` → `PageFactory.initElements(driver, this)` + keeps driver reference.
- Locators — **XPath exclusively**, no CSS / `By.id` / `By.name`:
  - Username: `//input[@id='username']`
  - Password: `//input[@id='password']`
  - Login button: `//input[@id='Login']`
  - Remember-me checkbox: `//input[@id='rememberUn']`
  - Error message: `//div[@id='error']`
  - Forgot-password link: `//a[@id='forgot_password_link']` (used for page-readiness verification)
- Reusable action methods (all with explicit `WebDriverWait` via a private `waitForElement(By.xpath(...))` helper; **no `Thread.sleep` anywhere**):
  - `navigateToLoginPage()` — `driver.get(url)` + wait for username field visible.
  - `isLoginPageDisplayed()` — asserts title contains "Salesforce" and username/forgot-password link visible.
  - `isRememberMeCheckboxDisplayed()` — returns checkbox display state (UI verification of remember-me).
  - `enterUsername(String)`, `enterPassword(String)` — clear + sendKeys on the right field.
  - `clickLoginButton()` — click + explicit wait handling.
  - `doLogin(String user, String pass)` — orchestrated login; wraps steps in try-catch and rethrows as `RuntimeException` with element context (structured exception handling at PO level).
  - `isErrorDisplayed()` / `getErrorMessageText()` — wait for `//div[@id='error']`, return text.
  - `isUsernameFieldInErrorState()` — asserts `//input[@id='username']` carries class `error`.
  - `waitForRedirectAwayFromLogin()` — explicit wait until URL no longer contains `login.salesforce.com`; returns final URL (valid-login assertion).
- Readonly utility: `getRememberMeCheckboxState()` if needed for the checked-state assertion (checkbox on this page defaults to checked).

### 3. `ValidLoginTest.java`
- `@BeforeTest`: `WebDriverManager.chromedriver().setup()`, instantiate `ChromeDriver`, set window maximize + `driver.manage().timeouts().implicitlyWait(10s)` (implicit wait per spec), build `LoginPage`.
- `@Test(description = ...)`:
  1. `navigateToLoginPage()` + `isLoginPageDisplayed()` → verifies page title and key UI elements render.
  2. Verify remember-me checkbox is displayed/enabled (thorough UI check).
  3. Read `SF_USERNAME`/`SF_PASSWORD` env vars; `Assert.fail` with actionable message if absent.
  4. `doLogin(validUser, validPass)` inside try-catch; on exception capture screenshot + `Assert.fail` with the underlying error (structured exception handling at test level).
  5. `waitForRedirectAwayFromLogin()` → assert final URL contains `.salesforce.com` and login fields are no longer displayed (successful redirect verification).
- `@AfterTest` (always runs): quit driver in try-catch; screenshot capture helper `captureScreenshot(WebDriver, testName)` using `TakesScreenshot`, writing PNGs under `screenshots/` (created on demand) — invoked on failure paths.

### 4. `InvalidLoginTest.java`
- Same `@BeforeTest`/`@AfterTest` setup pattern.
- `@Test` — **wrong credentials**: enter clearly invalid user/password, click Login, wait for `//div[@id='error']`, assert error text contains "Please check your username and password", assert username field shows `error` class, assert still on `login.salesforce.com` (no redirect).
- `@Test` — **empty fields**: leave username/password blank, click Login, assert error area appears and page stays on login domain.
- Both tests: try-catch around the login + assertion steps → screenshot + `Assert.fail` on failure (identical structured pattern).

### 5. `testng.xml`
- Suite with both test classes; sequential execution (no parallel — avoids cross-test flakiness on a shared login environment).

## Salesforce-specific risks & mitigations
- **Dynamic redirect after valid login**: the org lands on a custom domain (`*.salesforce.com` or `*.my.salesforce.com`). Assertion is deliberately domain-based (`urlContains(".salesforce.com")` + login fields gone), never org-specific URLs — keeps it org-agnostic.
- **Captcha / email-verification interstitial**: Salesforce may challenge unknown IPs. Plan: if, after clicking Login, the username field is still visible past the wait window, the redirect wait throws `TimeoutException` → screenshot captured + clear failure message. Test data must be an allow-listed IP or the verification handled manually. Noted in plan, no code hacks.
- **Flaky error-locator timing**: `//div[@id='error']` is waited on explicitly (30s cap), so it appears before assertion.

## Verification
1. `cd salesforce-login-framework && mvn clean test` (Chrome installed locally; driver auto-resolved by WebDriverManager).
2. Expect: invalid + empty tests pass; valid test passes when `SF_USERNAME` / `SF_PASSWORD` env vars are set to working org creds (or fails cleanly with screenshot + "credentials not set" message otherwise).
3. Check `target/surefire-reports/` for the TestNG HTML/XML reports and `screenshots/` for any failure captures.
4. `mvn test -DsuiteXmlFile=testng.xml` as the canonical run command.

## Assumptions
- Java 11+ and Chrome available on the machine.
- Env vars `SF_USERNAME` / `SF_PASSWORD` supply the working credentials at runtime (user said external credentials will be provided — they go into env, not code).
- Output is code-only per spec; no README or explanatory comments inside the generated files.
