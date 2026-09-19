# TEST PLAN — {{PROJECT_NAME}}

**Project / Product:** {{PROJECT_NAME}}
**Release / Version:** {{FIX_VERSIONS}}
**Document Version:** {{DOC_VERSION}}
**Prepared By:** {{PREPARED_BY}}
**Reviewed By:** {{REVIEWED_BY}}
**Approved By:** {{APPROVED_BY}}
**Planned Test Start:** {{PLANNED_START}}
**Planned Test Completion:** {{PLANNED_COMPLETION}}
**Target Release Date:** {{TARGET_RELEASE}}
**Status:** Draft — pending human review

**Source:** Jira {{ISSUE_KEY}} — {{SUMMARY}} ({{ISSUE_TYPE}} · {{PRIORITY}} · {{STATUS}})
**Components:** {{COMPONENTS}} · **Labels:** {{LABELS}} · **Sprint:** {{SPRINT}}
**Attachments:** {{ATTACHMENTS}} · **Source hash:** `{{SOURCE_HASH}}`
**Generated:** {{GENERATED_AT}}

---

# 1. Overview, Objectives & Scope

## 1.1 Overview

{{OVERVIEW}}

## 1.2 Test Objectives

{{OBJECTIVES}}

## 1.3 Scope

### In Scope

{{IN_SCOPE}}

### Platforms (proposed — Needs clarification)

{{PLATFORMS}}

### Non-Functional (proposed — Needs clarification)

{{NON_FUNCTIONAL}}

### Out of Scope

{{OUT_OF_SCOPE}}

---

# 2. Quality & Risk Assessment

## 2.1 Product & Quality Risks

{{RISK_TABLE}}

## 2.2 Risk-Based Testing Prioritization

{{RISK_PRIORITIZATION}}

---

# 3. Test Strategy & Coverage

## 3.1 Overall Approach

Risk-based, layered testing: smoke → functional → UI/visual → regression → exploratory, with the levels below. Depth follows the risk table in section 2.

## 3.2 Test Types

{{TEST_TYPES}}

## 3.3 Test Design Approach

{{TEST_DESIGN}}

## 3.4 Coverage Mapping (Requirement Traceability)

Traceability target: Requirement → Test Scenario → Test Case → Execution Result → Defect.

{{TRACEABILITY_TABLE}}

## 3.5 Coverage Expectations

Coverage is measured by capability coverage, critical workflow coverage, risk coverage, execution coverage, and automation coverage. Currently {{COVERAGE_NOTE}}

---

# 4. Test Environment, Data & Automation

## 4.1 Test Environments

{{ENVIRONMENTS_TABLE}}

{{ENVIRONMENT_NOTES}}

## 4.2 Test Data Strategy

{{TEST_DATA_STRATEGY}}

## 4.3 Test Automation Strategy

{{AUTOMATION_STRATEGY}}

## 4.4 Environment / Data Risks

{{ENV_RISKS}}

---

# 5. Defect & Quality Management

## 5.1 Defect Lifecycle

New → Assigned → In Progress → Fixed → Retest → Closed (organizational variations apply).

## 5.2 Severity

| Severity | Definition |
| -------- | ---------- |
| Critical | Business-critical functionality unavailable; data loss/corruption; severe security issue |
| High | Major functionality impacted with significant business or customer impact |
| Medium | Functionality impacted but a workaround is available |
| Low | Minor functional or cosmetic issue |

## 5.3 Defect Reporting

Each defect records: Summary, Environment, Build/version, Preconditions, Steps to Reproduce, Expected Result, Actual Result, Severity/Priority, Evidence, and Logs where applicable.

Specific error messages and codes are recorded **verbatim from the application** — they are never invented.

## 5.4 Defect Triage

Triage cadence and participants follow the organizational process (Needs clarification).

## 5.5 Defect Closure Criteria

Fix deployed to the appropriate environment; original issue retested successfully; relevant regression completed; no related open issues.

---

# 6. Entry / Exit Criteria & Release Readiness

## 6.1 Entry Criteria

{{ENTRY_CRITERIA}}

## 6.2 Exit Criteria

{{EXIT_CRITERIA}}

## 6.3 Quality Gates

- **Gate 1 — Build Acceptance:** build deployed; smoke passes; no deployment blockers.
- **Gate 2 — Functional Completion:** critical functionality validated; major defects triaged.
- **Gate 3 — Regression Completion:** planned regression executed and reviewed; residual risk assessed.
- **Gate 4 — Release Readiness:** exit criteria met; remaining risks documented; QA recommendation issued.

## 6.4 Release Recommendation

**GO** — all quality gates satisfied and residual risk acceptable.
**GO WITH ACCEPTED RISKS** — known issues reviewed and explicitly accepted by stakeholders.
**NO-GO** — a critical gate is unsatisfied or unacceptable risk remains.

## 6.5 Post-Release Validation

Production smoke on the critical workflows, error and log monitoring, and integration health checks.

---

# 7. Resources, Dependencies & Deliverables

## 7.1 Roles & Responsibilities

| Activity | QA Lead | QA Engineer | Developer | Product/BA |
| -------- | ------- | ----------- | --------- | ---------- |
| Test Strategy | A/R | C | C | C |
| Test Design | A | R | C | C |
| Automation | A | R | C | I |
| Defect Triage | A/R | R | R | C |
| Requirement Clarification | C | C | C | A/R |
| Release Recommendation | A/R | C | C | C |

## 7.2 Dependencies

{{DEPENDENCIES}}

## 7.3 Assumptions

{{ASSUMPTIONS}}

## 7.4 Constraints

{{CONSTRAINTS}}

## 7.5 QA Metrics & Reporting

Metrics: test execution progress, pass/fail/blocked %, capability coverage, defect distribution by severity, defect aging, regression pass rate, automation coverage, automation stability.
Reporting: periodic test status, defect status, risk status, release readiness, final test summary.

## 7.6 Test Deliverables

- This Test Plan
- Test scenarios and E2E regression cases (`Regression_Cases.md` + `.csv`)
- Automation suite (consumes the case file)
- Test data (as supplied or created)
- Defect reports, test execution results, Test Summary Report, release recommendation

---

# Test Scenarios (P0/P1/P2)

{{SCENARIO_TABLE}}

---

# Gaps & Questions for the author

Findings from the requirement gap analysis (✅ present / ⚠️ ambiguous / ❌ missing). Every open item is treated as an untestable requirement until resolved.

{{GAPS_SECTION}}

---

# Open Questions (carry forward)

{{OPEN_QUESTIONS}}

---

## --- HUMAN REVIEW GATE ---

**Status: {{GATE_STATUS}}**

This plan was generated from Jira {{ISSUE_KEY}} and has **not** been approved. Review the scenarios, gaps, and assumptions above, then approve to unlock E2E regression case generation.

*Generated by the Test Plan & Test Case Agent.*
