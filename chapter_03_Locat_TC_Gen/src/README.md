# Jira Test Case Generator

A 2-page Streamlit app that fetches a Jira issue's details via the Jira Cloud REST API and generates a structured test plan / test cases with an LLM — local [LM Studio](https://lmstudio.ai) (`gemma3:1b`, OpenAI-compatible) first, with [Groq](https://groq.com) as an automatic fallback.

## Files

| File | Purpose |
|------|---------|
| `app.py` | Streamlit entry point (pages: Chat/Generate + Settings) |
| `jira_client.py` | Jira Cloud REST API integration |
| `llm_client.py` | Local LLM + Groq fallback logic |
| `settings_manager.py` | Save/load settings (`config.json`) |
| `requirements.txt` | Python dependencies |

## Setup

```bash
cd chapter_03_Locat_TC_Gen
pip install -r src/requirements.txt
streamlit run src/app.py
```

Open the **Settings** page and save:

- **Jira URL** — e.g. `https://your-domain.atlassian.net/`
- **Jira email ID** — the email of your Atlassian account
- **Jira API token** — generate at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- **Local LLM endpoint URL** — OpenAI-compatible server URL. Default `http://localhost:1234/v1` (LM Studio) or `http://localhost:11434/v1` (Ollama)
- **Groq API key** (optional) — used as a fallback if the local LLM is unreachable
- **LLM provider preference** — `local` (tries LM Studio first, then Groq) or `groq`

Credentials are stored in `config.json` next to the app — never hardcoded, never shown in the UI after saving (password-masked fields).

## Usage

1. Go to the **Chat/Generate** page.
2. Type a prompt containing a Jira ID, e.g. `Write test cases for Jira ID VWO-49`, and press Send.
3. The app extracts the ID, fetches the issue, loads the template from `../templates/testCaseGenerator.md`, and asks the LLM to produce test cases in that exact format.

The template lives in the `templates/` folder (`templates/testCaseGenerator.md`). It dictates the output format — the LLM is told to follow it exactly and not invent its own.

## Error handling

- No Jira ID in the prompt → clear message in the chat.
- Jira auth failure / issue not found / connection error → readable error, no stack traces.
- Local LLM unreachable → automatic retry via Groq if a key is configured; otherwise a clear error.
- Missing settings → prompt to open Settings.
