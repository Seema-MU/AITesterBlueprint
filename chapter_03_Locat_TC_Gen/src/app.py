"""Jira Test Case Generator — Streamlit entry point (2 pages: Chat/Generate + Settings)."""

import os
import re

import streamlit as st

import jira_client
import llm_client
import settings_manager

APP_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_PATH = os.path.join(APP_DIR, "..", "templates", "testCaseGenerator.md")


def load_template():
    """Read the test case template file. Returns (content, error)."""
    path = os.path.normpath(TEMPLATE_PATH)
    if not os.path.exists(path):
        return None, f"Template file not found at {path}. Place it in the templates folder."
    with open(path, "r", encoding="utf-8") as f:
        return f.read(), None


DEFAULT_HEADER = ["Test ID", "Description", "Pre-conditions", "Steps", "Expected Result", "Priority"]


def parse_table(text, expected_columns=None, expected_header=None):
    """Parse a pipe-delimited table into (headers, rows). Returns (None, None) if not tabular."""
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    cell_rows = []
    for line in lines:
        if "|" not in line:
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if cells and all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
            continue  # separator row like |---|---|
        cell_rows.append(cells)
    if not cell_rows:
        return None, None

    if len(cell_rows) == 1 and expected_columns:
        # All rows packed on one line (no separator row): use the known width.
        ncols = expected_columns
    else:
        ncols = len(cell_rows[0])
    if ncols < 2:
        return None, None
    flat = [cell for row in cell_rows for cell in row]
    rows = [flat[i:i + ncols] for i in range(0, len(flat), ncols)]
    if len(rows[-1]) != ncols:
        rows.pop()  # drop an incomplete trailing row
    if len(rows) < 2:
        return None, None

    # Determine whether the first row is a real header or a data row (TC-xxx).
    first_is_data = bool(rows[0]) and re.match(r"(?i)^TC[-_\s]?\d+", rows[0][0].strip())
    if first_is_data:
        # No header was emitted — every row is data.
        return expected_header[:ncols] if expected_header else rows[0], rows

    # First row is a header; the rest are data.
    return rows[0], rows[1:]


def render_message(content, expected_columns=None, expected_header=None, max_rows=None):
    """Render an assistant message, using a dataframe for tables, markdown otherwise."""
    import pandas as pd

    header, rows = parse_table(content, expected_columns, expected_header)
    if header and rows:
        if max_rows is not None:
            rows = rows[:max_rows]
        st.dataframe(pd.DataFrame(rows, columns=header), use_container_width=True, hide_index=True)
    else:
        st.markdown(content)


def render_chat_page(settings):
    st.title("Jira Test Case Generator")
    st.caption("Type a prompt like *Write test cases for Jira ID VWO-49* to generate test cases.")

    if "messages" not in st.session_state:
        st.session_state["messages"] = []

    num_cases = st.number_input(
        "Number of test cases", min_value=1, max_value=50, value=10, step=1
    )

    for message in st.session_state["messages"]:
        with st.chat_message(message["role"]):
            if message["role"] == "assistant":
                render_message(
                    message["content"],
                    expected_columns=6,
                    expected_header=DEFAULT_HEADER,
                    max_rows=message.get("max_rows"),
                )
            else:
                st.markdown(message["content"])

    prompt = st.chat_input("e.g. Write test cases for Jira ID VWO-49")
    if not prompt:
        return

    st.session_state["messages"].append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    if not settings_manager.settings_ready(settings):
        response = "⚠️ Missing Jira settings. Open the **Settings** page and save your Jira URL, email, and API token first."
    else:
        issue_id = jira_client.extract_jira_id(prompt)
        if not issue_id:
            response = "⚠️ No Jira ID found in your prompt. Try something like: *Write test cases for Jira ID VWO-49*"
        else:
            try:
                template_text, template_error = load_template()
                if template_error:
                    response = f"⚠️ {template_error}"
                else:
                    with st.chat_message("assistant"):
                        with st.spinner(f"Fetching {issue_id} and generating test cases…"):
                            issue = jira_client.fetch_issue(settings, issue_id)
                            response = llm_client.generate_test_cases(
                                settings, issue, template_text, int(num_cases)
                            )
            except (jira_client.JiraError, llm_client.LLMError) as exc:
                response = f"❌ {exc}"

    requested = int(num_cases)
    st.session_state["messages"].append(
        {"role": "assistant", "content": response, "max_rows": requested if settings_manager.settings_ready(settings) else None}
    )
    with st.chat_message("assistant"):
        render_message(
            response,
            expected_columns=6,
            expected_header=DEFAULT_HEADER,
            max_rows=requested if settings_manager.settings_ready(settings) else None,
        )


def render_settings_page():
    st.title("Settings")
    settings = settings_manager.load_settings()

    jira_url = st.text_input("Jira URL", value=settings.get("jira_url", ""), placeholder="https://your-domain.atlassian.net/")
    jira_email = st.text_input("Jira email ID", value=settings.get("jira_email", ""), placeholder="you@example.com")
    jira_token = st.text_input(
        "Jira API token", value=settings.get("jira_token", ""), type="password",
        help="Stored locally in config.json. Generate at id.atlassian.com/manage-profile/security/api-tokens",
    )
    local_llm_url = st.text_input(
        "Local LLM endpoint URL (OpenAI-compatible)", value=settings.get("local_llm_url", "http://localhost:1234/v1"),
        help="LM Studio: http://localhost:1234/v1 · Ollama: http://localhost:11434/v1",
    )
    groq_api_key = st.text_input(
        "Groq API key", value=settings.get("groq_api_key", ""), type="password",
        help="Optional. Used as a fallback when the local LLM is unreachable.",
    )
    provider = st.radio(
        "LLM provider preference",
        options=["local", "groq"],
        index=0 if settings.get("llm_provider_preference", "local") == "local" else 1,
        help="'local' tries LM Studio first, then falls back to Groq if it's unreachable.",
    )

    if st.button("Save settings"):
        settings_manager.save_settings({
            "jira_url": jira_url.strip(),
            "jira_email": jira_email.strip(),
            "jira_token": jira_token.strip(),
            "local_llm_url": local_llm_url.strip() or "http://localhost:1234/v1",
            "groq_api_key": groq_api_key.strip(),
            "llm_provider_preference": provider,
        })
        st.success("Settings saved.")

    st.divider()
    st.subheader("Connection tests")
    col1, col2 = st.columns(2)
    with col1:
        if st.button("Test LM Studio connection", use_container_width=True):
            ok, message = llm_client.test_local_connection(settings)
            if ok:
                st.success(message)
            else:
                st.error(message)
    with col2:
        if st.button("Test Groq connection", use_container_width=True):
            ok, message = llm_client.test_groq_connection(settings)
            if ok:
                st.success(message)
            else:
                st.error(message)


def main():
    st.set_page_config(page_title="Jira Test Case Generator", page_icon="🧪", layout="wide")
    page = st.sidebar.radio("Navigation", ["Chat/Generate", "Settings"])
    if page == "Settings":
        render_settings_page()
    else:
        settings = settings_manager.load_settings()
        render_chat_page(settings)


if __name__ == "__main__":
    main()
