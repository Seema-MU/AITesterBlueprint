# TEST PLAN

**Project / Product:** VWO (Visual Website Optimizer) — Login Dashboard
**Release / Version:** [Release Version]
**Document Version:** 1.0
**Prepared By:** [QA Lead Name]
**Reviewed By:** [Names / Roles]
**Approved By:** Seema
**Planned Test Start:** [Date]
**Planned Test Completion:** [Date]
**Target Release Date:** [Date]
**Status:** Approved

---

# 1. Document & Release Overview

## 1.1 Purpose

This Test Plan defines the quality assurance strategy, scope, test approach, risks, and release criteria for validating the **VWO Login Dashboard** described in JIRA ticket **SCRUM-1** ("Login page to VMO.com website", Priority: High, Status: To Do).

The objective is to establish a shared understanding among QA, Engineering, Product, and Business stakeholders of how the login experience will be validated — and which requirements are still missing or ambiguous enough to block that validation.

## 1.2 Release Overview

Per the PRD embedded in SCRUM-1, this release delivers a secure, intuitive login experience at `app.vwo.com` that connects users to VWO's experimentation, personalization, and analytics platform.

Scope highlights from the PRD:

* Email + password authentication with secure session management
* Remember Me persistent-session option
* Forgot Password / password reset flow
* Sign in with Google (social login)
* Sign in using SSO (enterprise)
* Sign in with Passkey
* Light and Dark mode theming
* Responsive / mobile-optimized design
* WCAG 2.1 AA accessibility
* Rate limiting against brute force
* Analytics integration for login success/failure tracking
* Free-trial signup CTA for new users

**Not confirmed:** which of the above are in this release vs. deferred to Phase 2 / Phase 3 (see Gaps & Questions).

## 1.3 References

| Ref | Document |
| --- | -------- |
| R1 | JIRA SCRUM-1 ticket (PRD embedded in description) |
| R2 | Ticket attachment: `image-20260812-132015.png` (login page mockup) |
| R3 | `Product Requirements Document.docx` (repo root) |
| R4 | VMO platform overview — `.commandcode/skills/testPlan_gen/assets/vmo_details.md` |

---

# 2. Objectives & Scope

## 2.1 Test Objectives

* Validate the login form and all sign-in paths work per the PRD and the attached mockup.
* Verify failed-authentication handling: error messages, field validation, rate limiting.
* Validate account recovery (Forgot Password) end to end.
* Verify post-login handoff to the VWO dashboard for each successful path.
* Validate security controls: HTTPS, credential handling, session lifecycle.
* Validate non-functional requirements: page load ≤ 2s, responsive layout, WCAG 2.1 AA.
* Confirm existing functionality is not regressed by the new login page.

## 2.2 In Scope

### Functional

* Email/password login (happy path + validation + error paths)
* Remember Me behavior (session persistence)
* Forgot Password flow (email-based reset)
* Google social login
* SSO login
* Passkey login
* "Start a FREE TRIAL" CTA and "New to Wingify?" redirect
* Light/Dark mode toggle on login page

### Integration

* Handoff to VWO dashboard post-login
* Analytics events on login success/failure
* Third-party identity providers (Google, SSO IdP, passkey provider)

### Data

* Login form field validation (email format, required fields)
* Session/token lifecycle and timeout

### Platforms

* Browsers: Chrome, Edge, Firefox, Safari (desktop)
* Mobile: iOS Safari, Android Chrome (responsive layout)

### Non-Functional

* Performance: Yes (page load ≤ 2s, concurrent login attempts)
* Security: Yes (encryption, rate limiting, session security)
* Accessibility: Yes (WCAG 2.1 AA)
* Compatibility: Yes (browser matrix above)

## 2.3 Out of Scope

* **Biometric / adaptive authentication** (Future Enhancements in PRD — not in a committed release)
* **Progressive Web App** (Future Enhancements)
* **A/B testing / personalization of the login page** (Future Enhancements)
* Marketing-tool integrations beyond login analytics
* Backend/API implementation details of the auth service (covered at API level only where needed for validation)
* Performance/load testing beyond login-page load-time and brute-force throttling

---

# 3. Product & Quality Risk Overview

## 3.1 Product Overview

* **Application:** VWO login dashboard at `app.vwo.com`
* **Architecture:** Web app with a login form, third-party OAuth/SSO/passkey providers, and a backend auth service; analytics events on auth outcomes.
* **User types:** Digital marketers, product managers, UX designers, developers, CRO specialists, data analysts (individual accounts); enterprise users via SSO.
* **Critical workflows:** Any successful authentication → dashboard access; password reset; account recovery.
* **External systems:** Google identity provider, enterprise SSO IdP (SAML/OAuth), passkey/WebAuthn provider, analytics.

## 3.2 Critical Business Flows

* Email/password sign-in → dashboard
* Google sign-in → dashboard
* SSO sign-in → dashboard
* Passkey sign-in → dashboard
* Forgot password → reset email → new password → sign-in
* Remember Me → session persists across browser restarts

## 3.3 Quality Risks

| Risk | Impact | Probability | Risk Level | Mitigation |
| ---- | ------ | ----------- | ---------- | ---------- |
| SSO/Google/passkey provider integration failure | High | Medium | High | API + E2E validation of each provider |
| Session/Remember Me security flaw (token leakage, hijack) | High | Low | High | Security review + session lifecycle tests |
| Brute-force rate limiting not effective | High | Medium | High | Negative tests on throttling thresholds |
| Login page load > 2s on mobile/slow networks | Medium | Medium | Medium | Performance tests on standard + throttled connections |
| WCAG 2.1 AA gaps block keyboard/screen-reader users | Medium | Medium | Medium | Manual + automated a11y checks |
| Dark mode rendering defects | Low | Low | Low | Visual regression on both themes |

## 3.4 Risk-Based Testing Prioritization

Priorities follow: business criticality (login is the entry point for every user), security exposure (auth data, session tokens), third-party integration complexity, and accessibility/compliance obligations. High-risk areas get higher test depth and earlier execution.

---

# 4. Test Strategy

## 4.1 Overall Testing Approach

Risk-based and layered: API/service-level validation of the auth endpoints plus E2E validation of every sign-in path in the UI, with security and performance checks on the areas of highest exposure.

## 4.2 Test Levels

| Test Level | Purpose | Primary Owner |
| ---------- | ------- | ------------- |
| Unit Testing | Validate individual components | Development |
| API/Service Testing | Validate auth endpoints, validation, rate limiting | QA/Development |
| Integration Testing | Validate IdP integrations (Google, SSO, passkey) | QA/Development |
| System Testing | Validate complete login behavior | QA |
| End-to-End Testing | Validate each sign-in path end to end | QA |
| UAT | Validate business acceptance | Business/Product |

## 4.3 Test Types

* Functional, Integration, Regression, Smoke, Sanity, API, UI, Database, Exploratory, Compatibility, Performance (load-time), Security (auth-specific), Accessibility

## 4.4 Test Design Approach

* Positive scenarios for each sign-in path
* Negative scenarios (wrong password, unregistered email, malformed email, locked account)
* Boundary conditions (empty fields, max-length inputs, whitespace-only)
* Error handling (network failure, IdP cancellation, expired reset token)
* Role/permission combinations (individual user vs. enterprise SSO user)
* Integration failures (IdP down, analytics down)
* Exploratory testing on the login flows

## 4.5 Regression Strategy

Regression focuses on: core sign-in paths, session persistence, password reset, and any existing dashboard functionality reachable post-login. The regression suite is reviewed against the release impact analysis before execution.

---

# 5. Test Coverage & Traceability

## 5.1 Coverage Strategy

Coverage is established against the PRD functional requirements, the mockup attachment, business-critical workflows, and identified security/performance risks. Because the ticket has **no acceptance criteria**, traceability is mapped to PRD requirement statements (see 5.2); each Gaps & Questions item that stays open is treated as an untestable requirement until resolved.

## 5.2 Requirement Traceability

**Requirement → Test Scenario → Test Case → Execution Result → Defect**

Traceability will be maintained in **[Jira/ALM/Xray/Zephyr/etc.]** once the test scenarios below are approved and converted to cases.

| Req (PRD section) | Scenario(s) |
| ----------------- | ----------- |
| Login Process — email/password | S-01, S-02, S-03 |
| Remember Me | S-04 |
| Password Management — forgot/reset | S-05, S-06 |
| Social Login (Google) | S-07 |
| SSO | S-08 |
| Passkey | S-09 |
| Session Management / timeout | S-10 |
| Security — rate limiting | S-11 |
| Security — HTTPS / token handling | S-12 |
| User Input Validation | S-02, S-03 |
| Interface Design — responsive | S-13 |
| Accessibility (WCAG 2.1 AA) | S-14 |
| Branding — Light/Dark mode | S-15 |
| Integration — dashboard handoff | S-01, S-07, S-08, S-09 |
| Analytics integration | S-16 |
| Free Trial CTA | S-17 |
| Performance — page load | S-18 |

## 5.3 Coverage Expectations

* Requirement coverage (all PRD functional requirements mapped)
* Critical workflow coverage (every sign-in path)
* Risk coverage (security + performance + accessibility items)
* Test execution coverage and automation coverage tracked in the test management tool

---

# 6. Test Environment & Test Data

## 6.1 Test Environments

| Environment | Purpose | Owner | Status |
| ----------- | ------- | ----- | ------ |
| DEV | Developer validation | Engineering | [Status] |
| QA/SIT | Functional & integration testing | QA | [Status] |
| UAT | Business validation | Product/Business | [Status] |
| Staging | Production-like validation | Engineering/QA | [Status] |

## 6.2 Environment Requirements

* Application version and build for the login dashboard
* Backend auth service with test-mode IdPs (Google test account, SSO test IdP, passkey test provider)
* Email service for password-reset and verification emails
* Analytics endpoint to capture login events
* Browsers/devices per the matrix in 2.2

## 6.3 Test Data Strategy

* Positive data: valid email/password accounts (individual), enterprise SSO test account
* Negative data: unregistered email, wrong password, malformed email, whitespace inputs
* Boundary data: max-length email/password, empty fields, 1-char password
* Role-based data: standard user vs. SSO/enterprise user
* Integration data: test Google account, test SSO IdP users
* Production-like data only where permitted and masked per privacy policy

## 6.4 Environment/Data Risks

* Real IdPs may not offer full test environments → mock or use dedicated test accounts
* Reset emails may be delayed in QA environments → allow for delivery time in scheduling
* No seed test data is defined in the ticket → data set must be created and approved

---

# 7. Test Automation Strategy

## 7.1 Automation Objectives

Automation targets repeatability of the highest-risk flows: every sign-in path, session persistence, rate limiting, and smoke checks — to shorten regression cycles and support release confidence.

## 7.2 Automation Scope

* All sign-in paths (email/password, Google, SSO, passkey) as E2E (existing repo framework: Selenium — see repo README)
* API-level auth validation and rate-limit checks
* Smoke: page loads, form renders, sign-in with a known-good account
* Session timeout / Remember Me behavior

## 7.3 Manual Testing Scope

* Exploratory testing of error states and edge cases
* Visual/design validation (Light/Dark mode, responsive layouts)
* Accessibility validation (screen readers, keyboard-only)
* Usability judgment calls (error-message clarity)

## 7.4 Automation Framework

* Framework: [Selenium/Playwright per repo convention — to be confirmed]
* Language: [to be confirmed]
* Test management integration: [Jira/Xray/Zephyr — to be confirmed]
* CI/CD integration, reporting, parallel execution, test data management: [to be confirmed]

## 7.5 Automation Quality

Effectiveness is evaluated via pass rate, stability/flakiness, execution time, maintenance effort, defect detection effectiveness, and useful regression coverage.

---

# 8. Defect Management

## 8.1 Defect Lifecycle

**New → Assigned → In Progress → Fixed → Retest → Closed** (organization process applies).

## 8.2 Severity

| Severity | Definition |
| -------- | ---------- |
| Critical | Login unavailable for all users, credential/session data exposure, severe security issue |
| High | One sign-in path fully broken, password reset broken, rate limiting bypassed |
| Medium | Functionality impacted with workaround (e.g., dark-mode rendering issue) |
| Low | Minor functional/cosmetic issue |

## 8.3 Defect Reporting

Each defect: summary, environment, build/version, preconditions, steps to reproduce, expected result, actual result, severity/priority, evidence, logs/API response.

## 8.4 Defect Triage

Triage conducted **[daily/weekly/as required]** with QA, Engineering, Product/Business. Critical and high defects escalated per agreed timelines.

## 8.5 Defect Closure Criteria

* Fix deployed to the appropriate environment
* Original issue successfully retested
* Relevant regression completed
* No related issues remain open

---

# 9. Entry, Exit & Quality Gates

## 9.1 Entry Criteria

* Approved requirements / resolved Gaps & Questions (see §2) — **currently blocking**
* Testable build deployed
* Environment stable, test data available
* Critical dependencies (IdPs, email service, analytics) available
* Build smoke testing successful

## 9.2 Exit Criteria

* Planned critical/high-priority testing completed (all sign-in paths)
* Critical business workflows passed
* Required regression completed
* No unresolved Critical defects (unless explicitly accepted)
* High-severity defects within agreed risk threshold
* Non-functional testing (perf, security, a11y) completed
* Test results and risks communicated to stakeholders

## 9.3 Quality Gates

**Gate 1 — Build Acceptance:** Build deployed, smoke tests passed, no deployment blockers.
**Gate 2 — Functional Test Completion:** Critical functionality validated, major defects triaged.
**Gate 3 — Regression Completion:** Planned regression executed, results reviewed, outstanding risks assessed.
**Gate 4 — Release Readiness:** Exit criteria met, remaining risks documented, business acceptance obtained, QA release recommendation issued.

---

# 10. Roles, Responsibilities & Dependencies

## 10.1 Roles

| Activity | QA Lead | QA Engineer | Developer | Product/BA |
| -------- | ------- | ----------- | --------- | ---------- |
| Test Strategy | A/R | C | C | C |
| Test Design | A | R | C | C |
| Automation | A | R | C | I |
| Defect Triage | A/R | R | R | C |
| Requirement Clarification | C | C | C | A/R |
| Release Recommendation | A/R | C | C | C |
| UAT | C | C | I | A/R |

## 10.2 Dependencies

* Development build availability
* QA environment availability
* Google/SSO/passkey test provider readiness
* Email service availability (reset flow)
* Analytics endpoint availability
* Test data approval
* Business/UAT availability

## 10.3 Assumptions

* Requirements are approved before test design begins (currently the PRD is narrative-only — see Gaps)
* Environments are available per schedule
* External IdPs are accessible during testing
* Defects are resolved per agreed priorities

## 10.4 Constraints

* No acceptance criteria in the ticket
* IdP test environments may be limited
* Reset-email delivery delays in QA envs
* Unknown release window

Mitigations: see Gaps & Questions and 6.4.

---

# 11. Metrics, Reporting & Deliverables

## 11.1 QA Metrics

Test execution progress, pass/fail/blocked %, requirement coverage, risk coverage, defect distribution by severity, defect aging, defect reopen rate, regression pass rate, automation coverage, automation stability, production defect leakage.

## 11.2 Reporting

Daily/periodic test status, defect status, risk status, test execution dashboard, release readiness status, final test summary.

## 11.3 Test Deliverables

Test Plan, test scenarios/cases, automation suite, test data, defect reports, test execution results, QA status reports, Test Summary Report, release recommendation.

---

# 12. Release Readiness & Post-Release Validation

## 12.1 Release Readiness

QA recommendation based on test execution results, defect status, risk assessment, critical workflow status, regression results, non-functional results, exit criteria, outstanding known issues.

## 12.2 Release Decision

**GO** — all critical quality gates satisfied, remaining risks acceptable.
**GO WITH ACCEPTED RISKS** — known issues reviewed and accepted by business/product.
**NO-GO** — one or more critical gates not satisfied or unacceptable risk remains.

## 12.3 Production Validation

Production smoke: login page loads, email/password + at least one third-party path (Google) sign-in, dashboard handoff, error/log monitoring, integration health checks.

## 12.4 Post-Release Review

Review production defects, escaped defects, coverage gaps, automation gaps, environment issues, process issues, lessons learned; feed improvements into the next release.

---

# Test Scenarios (P0/P1/P2)

| ID | Priority | Trace | Scenario | Precondition | Expected Result |
| -- | -------- | ----- | -------- | ------------ | --------------- |
| S-01 | P0 | PRD Login Process | Email + password with valid credentials signs in and lands on the VWO dashboard | Valid account exists | User authenticated, redirected to dashboard, success state visible |
| S-02 | P0 | PRD Input Validation | Field validation: empty, malformed, whitespace-only email/password | On login form | Inline error per field, no submit of invalid data |
| S-03 | P0 | PRD Login Process | Invalid credentials (wrong password / unregistered email) | Login form | Clear actionable error, no session created |
| S-04 | P0 | PRD Remember Me | Remember Me checked → session persists after browser restart; unchecked → session expires | Valid account | Session behavior matches the checkbox state |
| S-05 | P0 | PRD Forgot Password | Forgot Password → reset email → set new password → sign in with new password | Registered email | Full reset flow succeeds; old password no longer works |
| S-06 | P1 | PRD Password Recovery | Expired/used reset token handled gracefully | Reset token issued | Clear error; user can request a new link |
| S-07 | P0 | PRD Social Login | Sign in with Google succeeds → dashboard; cancel → returns to login | Test Google account | Successful auth or clean cancel, no partial state |
| S-08 | P1 | PRD SSO | Sign in using SSO (enterprise account) succeeds → dashboard | Test SSO IdP account | Enterprise user authenticated and redirected |
| S-09 | P1 | PRD Passkey | Sign in with Passkey succeeds; passkey unavailable path handled | Passkey test device | Passkey auth works or graceful fallback message |
| S-10 | P1 | PRD Session Mgmt | Session timeout: idle session expires per configured timeout | Logged-in session | Session ends at timeout; re-login required |
| S-11 | P0 | PRD Rate Limiting | Repeated failed attempts trigger rate limiting; legitimate user not blocked | Login form | Throttling activates after N failures; valid user can still log in |
| S-12 | P1 | PRD Security | HTTPS enforced on login; no credentials in URLs/logs | Browser devtools | All login traffic over HTTPS, no credential leakage |
| S-13 | P1 | PRD Responsive | Login renders correctly on mobile and tablet viewports | Browser at mobile widths | No overlap/clipping; touch targets usable |
| S-14 | P1 | PRD A11y | WCAG 2.1 AA: keyboard-only navigation, screen reader labels, focus states | Login page | Full keyboard operability, labeled inputs, visible focus |
| S-15 | P2 | PRD Theme | Light and Dark mode both render correctly with VWO branding | Theme toggle | Both themes consistent, no contrast issues |
| S-16 | P1 | PRD Analytics | Login success/failure analytics events fire correctly | Analytics endpoint | Events recorded for success and failure outcomes |
| S-17 | P2 | PRD Free Trial CTA | "Start a FREE TRIAL" navigates to the signup/trial flow | Login page | Correct destination page opens |
| S-18 | P1 | PRD Perf | Login page loads within 2s on standard and throttled connections | Clean session | Load ≤ 2s on standard connection; degradation measured on throttled |

---

# Gaps & Questions for the author

These are the findings from the requirement gap-analysis (✅ present / ⚠️ ambiguous / ❌ missing). They block or constrain test design — please resolve before sign-off.

## ❌ Missing / blocking

1. **No acceptance criteria.** The PRD is narrative. There is no Given/When/Then or observable pass/fail for any requirement. Convert the PRD bullets into testable ACs, or confirm each scenario in §Test Scenarios.
2. **Scope is not defined for this release.** SSO, Passkey, Google, 2FA, Remember Me, dark mode, analytics — the PRD lists all as requirements but does not say which ship in this release vs. Phase 2/3. Which sign-in paths are actually in scope?
3. **"VMO.com" vs "VWO"** — the ticket summary says "VMO.com website" while the PRD and mockup say VWO (`app.vwo.com`). Which host is the real target? A typo here could point tests at the wrong environment.
4. **Test data & environments not defined.** No seed users, no test accounts for Google/SSO/passkey, no environment list. Confirm what QA can use, especially for third-party IdPs.
5. **2FA/MFA** is listed as "Optional 2FA support" — is it in scope? If yes, which methods (TOTP, SMS, authenticator app)?
6. **Session timeout value** is "configurable" but not specified. What is the actual timeout for this release?

## ⚠️ Ambiguous

7. **Rate limiting thresholds** — "protection against brute force through request throttling" with no numbers. How many failed attempts before lockout, and for how long?
8. **Password complexity rules** — "enforced security standards" but no minimum length, complexity, or expiry policy.
9. **Remember Me semantics** — persistent session for how long? Any security trade-off (e.g., token rotation) expected?
10. **"Seamless transition to main dashboard"** — what state carries over (recent activity, context preservation)?
11. **Error message inventory** — none of the exact messages are specified ("clear, actionable" only). Provide the expected messages for each failure type so tests can assert exact text.
12. **Analytics integration** — which events, names, and payloads are expected for login success/failure?
13. **Passkey/SSO/Google fallback behavior** — if a provider is unavailable, what should the user see?

## ✅ Present (usable as-is)

- Login form fields and layout (from mockup attachment)
- Page load ≤ 2s target
- WCAG 2.1 AA compliance target
- HTTPS enforcement
- Light/Dark mode theming
- Responsive design requirement
- Free-trial CTA flow

---

# Risks & Assumptions

* **Assumption:** the attached mockup (`image-20260812-132015.png`) reflects the intended final UI — to be confirmed against the actual build.
* **Assumption:** Google, SSO, and passkey providers offer test environments usable by QA.
* **Risk:** without acceptance criteria, test pass/fail is subjective — QA sign-off may be contested.
* **Risk:** third-party IdP instability can block sign-in path testing.
* **Risk:** if "VMO" vs "VWO" is unresolved, tests may run against the wrong host.

---

# Entry / Exit criteria

(Consolidated from §9.)

**Entry:** approved requirements + resolved gaps; testable build; stable environment; test data; critical dependencies available; smoke passed.
**Exit:** P0 scenarios passed; critical workflows validated; regression complete; no unresolved Critical defects; high-severity within threshold; non-functional checks done; results communicated.

---

## --- HUMAN REVIEW GATE ---

**Status: APPROVED on 2026-08-19 by Seema.**

The open questions below remain open for the ticket author and should be resolved before test case design begins, but they no longer block this test plan.

**Assumptions made:**

* I assumed the mockup attachment is the intended UI for this release.
* I assumed the repo's existing Selenium-based framework (per repo commits) is the automation base — to be confirmed.
* I assumed Google/SSO/passkey providers provide QA test environments.
* I assumed this release is scoped to Phase 1 (Core Authentication) plus the visible mockup elements, since the ticket does not state scope.

**Open questions (carry forward to test case design):**

1. Which sign-in paths are in scope for this release (email/password, Google, SSO, Passkey — all? some)?
2. Is there an updated/authoritative version of the acceptance criteria, or should the scenarios above be treated as the ACs pending your review?
3. Is the target host `app.vwo.com` (ticket title says "VMO.com" — typo?).
4. What test accounts and environments can QA use (esp. Google/SSO/passkey)?
5. What are the rate-limiting and password-complexity rules for this release?
6. What is the configured session timeout and Remember Me duration?
