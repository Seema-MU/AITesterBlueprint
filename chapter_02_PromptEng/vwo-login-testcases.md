# VWO Login — Test Cases (10)

**Source:** PRD "Product Requirements Document: VWO Login Dashboard" + observed live login page (https://app.vwo.com/#/login)
**Constraints honored:** PRD content only; no invented error codes/messages; unclear items marked "Needs clarification".

---

## TC-01 — Valid credentials log the user into the VWO dashboard

- **Category:** Functional (happy path)
- **Priority:** High
- **Pre-conditions:** Valid VWO email & password available (Needs clarification — external creds to be supplied); login page loaded at https://app.vwo.com/#/login
- **Steps:**
  1. Enter valid email in "Enter email ID" field.
  2. Enter valid password in "Enter password" field.
  3. Click "Sign in" button.
- **Expected:** User is navigated away from the login page (dashboard loads); no error notification box displayed; login form no longer visible.

---

## TC-02 — Remember me checkbox is displayed and its selection state is respected

- **Category:** Functional (happy path)
- **Priority:** Medium
- **Pre-conditions:** Login page loaded; valid credentials available (Needs clarification)
- **Steps:**
  1. Verify "Remember me" checkbox is displayed next to the password field.
  2. Note default selection state (observed: unchecked — Inference, low confidence).
  3. Check "Remember me".
  4. Enter valid credentials and click "Sign in".
- **Expected:** Checkbox is visible and clickable; selecting it does not block login; session persistence behavior after browser restart (Needs clarification — not specified in PRD).

---

## TC-03 — Password visibility toggle shows/hides the typed password

- **Category:** Functional (happy path)
- **Priority:** Medium
- **Pre-conditions:** Login page loaded; any value entered in "Enter password" field
- **Steps:**
  1. Type a value in "Enter password" field.
  2. Click the password visibility toggle (eye icon).
  3. Click the toggle again.
- **Expected:** Password text is displayed in plain text after first toggle; masked (dots) again after second toggle.

---

## TC-04 — Invalid credentials display an inline error and stay on the login page

- **Category:** Negative
- **Priority:** High
- **Pre-conditions:** Login page loaded
- **Steps:**
  1. Enter an invalid email (e.g., invalid.user@example.com).
  2. Enter an invalid password.
  3. Click "Sign in".
- **Expected:** Error notification box is displayed with a message (observed text: "Your email, password, IP address or location did not match"); user remains on the login page; no navigation to dashboard.

---

## TC-05 — Submitting with empty email and password shows validation/error

- **Category:** Negative
- **Priority:** High
- **Pre-conditions:** Login page loaded
- **Steps:**
  1. Leave both "Enter email ID" and "Enter password" fields empty.
  2. Click "Sign in".
- **Expected:** User remains on login page; validation or error notification displayed (exact message Needs clarification — not specified in PRD); no navigation.

---

## TC-06 — Valid email with wrong password is rejected

- **Category:** Negative
- **Priority:** High
- **Pre-conditions:** Valid email available (Needs clarification); login page loaded
- **Steps:**
  1. Enter a valid email.
  2. Enter an incorrect password.
  3. Click "Sign in".
- **Expected:** Error notification box displayed (message Needs clarification — observed text for bad creds: "Your email, password, IP address or location did not match"); user stays on login page.

---

## TC-07 — "Forgot Password?" link opens the password recovery flow

- **Category:** Functional
- **Priority:** High
- **Pre-conditions:** Login page loaded
- **Steps:**
  1. Verify "Forgot Password?" link is displayed below the password field.
  2. Click the "Forgot Password?" link.
- **Expected:** User is taken to the password recovery view (observed route: forgot-password form — Inference, low confidence); the recovery flow outcome (email dispatch, reset link) Needs clarification — not specified in PRD.

---

## TC-08 — Boundary-length email and password inputs are handled

- **Category:** Boundary
- **Priority:** Medium
- **Pre-conditions:** Login page loaded
- **Steps:**
  1. Enter a 1-character value in the email field.
  2. Enter a 1-character value in the password field.
  3. Click "Sign in".
  4. Repeat with very long values (e.g., 256+ chars — exact max limit Needs clarification).
- **Expected:** No crash or UI breakage; application responds with validation or login error (exact message Needs clarification); page remains functional.

---

## TC-09 — Special characters and email aliases in credentials are handled

- **Category:** Boundary
- **Priority:** Medium
- **Pre-conditions:** Login page loaded
- **Steps:**
  1. Enter a password containing special characters (e.g., P@ssw0rd!$#).
  2. Enter an email with a plus alias (e.g., user+tag@example.com).
  3. Click "Sign in".
- **Expected:** Application handles the input without error; either login proceeds (if credentials valid — Needs clarification) or an error notification is displayed (observed message format); no crash.

---

## TC-10 — Whitespace padding in credentials is handled

- **Category:** Edge
- **Priority:** Medium
- **Pre-conditions:** Login page loaded
- **Steps:**
  1. Enter a valid email with a leading/trailing space (e.g., " user@example.com ").
  2. Enter a valid password with a trailing space (e.g., "password ").
  3. Click "Sign in".
- **Expected:** Application either trims the whitespace and proceeds, or shows a validation/error notification (exact behavior Needs clarification — not specified in PRD); no crash, no unexpected navigation.

---

*All content traceable to the PRD or the observed live login page. Unknowns marked "Needs clarification"; inferred details labeled "Inference (low confidence)".*
