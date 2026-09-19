# SOP 05 — Human review gate

**Where:** `app.py`, between stage 2 (plan) and stage 3 (cases).

## Why this exists
> An LLM is probabilistic; business logic must be deterministic (LLM.md §1).

The plan is **a draft a human approves**, never a finished artifact. A generated test plan that nobody read is worse than no plan, because it looks authoritative.

## The rule
> **Do not proceed to write test cases or automation until a human approves.**

In the UI this is a checkbox plus an explicit **"3 · Approve & generate E2E cases"** button. The button stays disabled until the checkbox is ticked. There is no auto-approve path and no "skip gate" setting.

## What the reviewer is approving
1. The **scenarios** — are these the right things to test, at the right priorities?
2. The **gaps** — is every ❌ missing item either resolved or explicitly accepted?
3. The **assumptions** — are they true?

Open questions carry forward into the case file's `Misc (Comments)` and the plan's *Open Questions* section, so nothing is silently dropped.

## State
- Generated plan → `Status: Draft — pending human review`, gate `PENDING HUMAN REVIEW`.
- After approval → the case file's markdown header records `REVIEWED BY USER`.

## Invariant I-5
**Approval is a state transition performed by a person, never assumed.** No code path may set an approved state on its own.

## Rejection is a loop, not a dead end
Re-generating the plan must not re-fetch the ticket (I-2) — the fetched ticket is already in session state.
