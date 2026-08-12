R -> Role

You are a senior Python full-stack developer with strong expertise in building lightweight internal tools using Streamlit, REST API integrations (Jira Cloud API), and LLM orchestration (local LLMs via LM Studio and cloud APIs via Groq). You understand QA workflows and test case/test plan documentation standards.

---

I -> Instructions

- Build a simple 2-page Streamlit application named "Jira Test Case Generator."
- [Critical] Page 1 ("Chat/Generate") must have a ChatGPT-style single input box where the user types a prompt like "Write test cases for Jira ID 123" and clicks a Send button.
- [Critical] On submit, parse the Jira ID from the prompt, call the Jira REST API (using saved credentials) to fetch the issue's summary, description, and acceptance criteria.
- [Critical] Pass the fetched Jira details to the LLM (local LM Studio endpoint running gemma3:1b, OR Groq API as fallback) with an instruction to generate a test plan/test cases following the template stored in the `/templates` folder.
- [Mandatory] Page 2 ("Settings") must let the user enter and save: Jira URL, Jira email ID, Jira API token, Local LLM endpoint URL (LM Studio), Groq API token, and a toggle/dropdown to select which LLM provider to use (Local first, Groq as fallback if local is unreachable).
- [Mandatory] Settings must persist across sessions (e.g., saved to a local config/JSON file or `.env` — do not hardcode credentials).
- [Mandatory] Implement a fallback mechanism: if the local LM Studio endpoint is unreachable or times out, automatically retry using Groq (only if a Groq token is configured); otherwise show a clear error.
- [Mandatory] Read the test case/test plan template from the `templates` folder and use it to structure the LLM's output (don't let the LLM invent its own format).
- [Critical] Implement robust exception handling for: invalid Jira ID, Jira auth failure, Jira issue not found, LLM connection failure, and missing settings.
- Display the generated test plan/test cases on Page 1 in a readable format (e.g., markdown or table) after generation.
- [Don't] Don't expose raw API tokens in the UI after saving (mask them, similar to a password field).
- [Don't] Don't add unnecessary comments or placeholder/demo code — only functional, runnable code.
- Maintain modular structure: separate files/functions for Jira integration, LLM integration (local + Groq), settings management, and the Streamlit UI.

---

C -> Context

This is an internal QA productivity tool. The user has a local LM Studio instance running the `gemma3:1b` model, and optionally a Groq.com account for cloud LLM fallback. The tool's core purpose: take a Jira issue ID from a natural-language prompt, pull the issue details via Jira's REST API, and generate a structured test plan/test cases using an LLM, formatted per a template the user maintains in a `templates` folder. It is a 2-page app — no need for multi-page navigation complexity, just "Generate" and "Settings."

---

E -> Example

Example prompt behavior on Page 1:User input: "Write test cases for Jira ID 123"
App action:

Extract Jira ID -> "123"
Fetch issue via Jira API using saved credentials
Load template from /templates
Send issue details + template to LLM (local first, Groq fallback)
Render returned test cases in the UI

Example settings structure (conceptual, not literal code):
```python
settings = {
    "jira_url": "https://seemamu04.atlassian.net/",
    "jira_email": "seemamu04@gmail.com",
    "jira_token": "<YOUR_JIRA_API_TOKEN>",
    "local_llm_url": "http://localhost:1234/v1",
    "groq_api_key": "",
    "llm_provider_preference": "local"  # or "groq"
}
```

---

P -> Parameters

- Target a working MVP-level production script — functional and clean, not over-engineered.
- Use Streamlit for the frontend (confirm no other framework unless Streamlit can't support a requirement).
- I will provide my actual Jira URL, Jira email, and Jira API token separately once the app is built.
- The `templates` folder will contain a pre-existing test case/test plan template file (I will supply the format).
- Assume LM Studio is already running locally with `gemma3:1b` loaded and exposing an OpenAI-compatible API.

---

O -> Output

Provide only:
- `app.py` (Streamlit entry point with page navigation)
- `jira_client.py` (Jira API integration)
- `llm_client.py` (local LLM + Groq fallback logic)
- `settings_manager.py` (save/load settings)
- `requirements.txt`
- Brief setup instructions (how to run `streamlit run app.py`)

No unnecessary commentary — code should be complete and runnable.

---

T -> Tone

Practical, production-lean, developer-to-developer. Prioritize working code over exhaustive explanation.