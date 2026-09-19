# SOP 01 — Fetch the Jira ticket

**Tool:** `tools/jira.py` · **Deterministic** — no LLM.

## Goal
Turn a Jira ID into one normalized `TicketPayload` (LLM.md §3.1), exactly once per run.

## Steps
1. `extract_jira_id(prompt)` — regex `\b([A-Z][A-Z0-9]+-\d+)\b`, else a bare 2–6 digit number.
2. `GET {jira_url}/rest/api/3/issue/{key}?fields=<FIELDS>` with Basic auth `base64(email:token)`.
3. Flatten `fields.description` from ADF to text (`flatten_adf`). **v3 returns an ADF object, never a string.**
4. **Read the attachments** (`fetch_attachments`) — see below.
5. Extract acceptance criteria with `ACCEPTANCE_CRITERIA_RE` (acceptance criteria / definition of done / acceptance test), falling back to the attachment text when the description has none.
6. Hash the raw response → `source_hash` for provenance (I-7).

## Attachments are requirements, not metadata

The description is frequently empty while the real requirements sit in an attached PRD or mockup.
KAN-4 is the canonical case: 4-word summary, 0-char description, and both the PRD and the page mockup
attached. Analysing only the description means inventing the requirements.

1. Readable suffixes (`.md`, `.txt`, `.csv`, `.json`, `.xml`, `.yaml`, `.html`, `.docx`) are downloaded over the authenticated `content` URL.
2. HTML is stripped to text; `.docx` is unzipped and its document XML reduced to text (no third-party dependency).
3. Caps: `ATTACHMENT_MAX_CHARS` per file, `ATTACHMENT_TOTAL_CHARS` overall, `ATTACHMENT_MAX_BYTES` per download. Context stays predictable (LLM.md §7).
4. Every attachment records `status` (`read` / `skipped` / `error`), `chars`, and a `note`. **A failure is reported, never fatal** — the ticket is still analysable from its description.
5. Extracted text is concatenated into `attachment_text`, which feeds the gap haystack, both LLM prompts, and the plan Overview.

## Field notes
- `fields=` is sparse on purpose — it keeps the payload small and the token cost down.
- Sprint lives in `customfield_10020`/`customfield_10018`, which vary by instance; absence is tolerated.
- Attachments are downloaded and reduced to text (see above). Unreadable types are recorded as `skipped` with a reason rather than silently dropped.

## Error taxonomy (LLM.md §6)
| Code | Cause | Action |
| ---- | ----- | ------ |
| `JIRA-401` | Bad email/token | Halt; point the user at Settings. Never print the token |
| `JIRA-403` | No permission on the issue | Halt with the issue key |
| `JIRA-404` | Key not found / typo | Halt; ask for the correct key |
| `JIRA-429` | Rate limited | Halt; tell the user to retry |
| `JIRA-TIMEOUT` / `JIRA-UNREACHABLE` | Network | Halt with the URL |

## Edge cases
- Empty description → `description_text = "Not specified"`; the gap analysis will flag it.
- Description over 12 000 chars → truncated with an ellipsis (keeps context bounded).
- No acceptance criteria → **valid payload**, `ac_source = "none_found"`. This is a headline finding, not a failure.

## Do not
- Do not fetch the same ticket twice in a run (I-2).
- Do not invent or cache credentials anywhere except `config.json` / `.env`.
