"""Test Plan & E2E Test Case Agent — Streamlit UI.

Design direction: "Review desk". A light, document-led workspace where the test
plan is the hero artifact and the human review gate is visible architecture.

B.L.A.S.T. flow: prompt with a Jira ID -> fetch ticket -> gap analysis ->
test plan document -> HUMAN REVIEW GATE -> E2E regression cases (.md + .csv).

Deterministic logic lives in tools/; LLM prompting lives in planner.py and
case_builder.py. This file is presentation and orchestration only.
"""

from __future__ import annotations

import hashlib
import html
import inspect
import json
import os
import sys
from datetime import datetime

APP_DIR = os.path.dirname(os.path.abspath(__file__))
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

import markdown as md_lib
import streamlit as st

import case_builder
import llm_client
import planner
import settings_manager
from tools import contract, emit_cases, gate, jira, validate_cases

SAMPLE_TICKET = os.path.join(APP_DIR, "samples", "sample_ticket.json")

GAP_KIND = {"present": ("pass", "Present"), "ambiguous": ("warn", "Ambiguous"),
            "missing": ("fail", "Missing")}
GAP_GLYPH = {"present": "✓", "ambiguous": "!", "missing": "✕"}

STAGES = [
    ("1", "Ticket", "Fetch and analyse"),
    ("2", "Test plan", "Draft and review"),
    ("3", "Review gate", "Human approval"),
    ("4", "Case file", "E2E regression cases"),
]


# --------------------------------------------------------------------------- #
# Theme
# --------------------------------------------------------------------------- #

THEME_CSS = """
<style>
:root{
  --bg:#FBFAF8; --panel:#FFFFFF; --sunken:#F4F2EE;
  --line:#E5E1DA; --line-2:#D6D1C7;
  --ink:#1B1A18; --ink-2:#55504A; --ink-3:#837C72;
  --accent:#8A2E56; --pass:#1F6F4A; --warn:#8A5A00; --fail:#A32318; --info:#3A5A8C;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif;
  --mono:ui-monospace,SFMono-Regular,"Cascadia Mono","Segoe UI Mono",Consolas,monospace;
}
#MainMenu, footer, header[data-testid="stHeader"], [data-testid="stToolbar"]{display:none !important;}
.stApp{background:var(--bg);}
.stMainBlockContainer{max-width:1180px;padding-top:1.6rem;padding-bottom:4rem;}
html,body,[class*="css"]{font-family:var(--sans);}
h1,h2,h3,h4{font-family:var(--sans);color:var(--ink);letter-spacing:-0.012em;}

/* ---------- rail ---------- */
.tp-brand{font-size:.95rem;font-weight:700;color:var(--ink);letter-spacing:-.01em;margin:0 0 .1rem;}
.tp-brand span{color:var(--accent);}
.tp-brand-sub{font-size:.71rem;color:var(--ink-3);margin:0 0 1.2rem;}
.tp-rail-label{font-size:.63rem;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-3);font-weight:700;margin:.2rem 0 .55rem;}
.tp-rail-run{border:1px solid var(--line);background:var(--panel);padding:.6rem .7rem;margin-bottom:1.1rem;}
.tp-rail-run .k{font-size:.63rem;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-3);font-weight:700;}
.tp-rail-run .v{font-size:.9rem;font-weight:700;color:var(--ink);font-family:var(--mono);}
.tp-rail-run .s{font-size:.72rem;color:var(--ink-2);}
.tp-stage{display:flex;gap:.55rem;align-items:flex-start;padding:.34rem 0;}
.tp-dot{width:21px;height:21px;flex:0 0 21px;border-radius:50%;border:1.5px solid var(--line-2);
        display:flex;align-items:center;justify-content:center;font-size:.66rem;font-weight:700;
        color:var(--ink-3);background:var(--panel);font-variant-numeric:tabular-nums;}
.tp-dot.done{background:var(--accent);border-color:var(--accent);color:#fff;}
.tp-dot.active{border-color:var(--accent);color:var(--accent);box-shadow:0 0 0 3px rgba(138,46,86,.09);}
.tp-stage .t{font-size:.82rem;font-weight:600;color:var(--ink);line-height:1.3;}
.tp-stage .d{font-size:.71rem;color:var(--ink-3);line-height:1.3;}
.tp-stage.locked .t,.tp-stage.locked .d{color:#A9A29A;}
.tp-env{display:flex;justify-content:space-between;align-items:center;gap:.5rem;padding:.28rem 0;
        border-bottom:1px dotted var(--line);}
.tp-env .n{font-size:.77rem;color:var(--ink-2);}
.tp-rail-foot{font-size:.67rem;color:var(--ink-3);margin-top:1.2rem;line-height:1.5;}

/* ---------- pills ---------- */
.tp-pill{display:inline-flex;align-items:center;gap:.3rem;font-family:var(--sans);font-size:.66rem;
         font-weight:700;letter-spacing:.045em;text-transform:uppercase;padding:.16rem .45rem;
         border-radius:2px;border:1px solid;white-space:nowrap;}
.tp-pass{color:var(--pass);border-color:#BED9CB;background:#EFF7F2;}
.tp-warn{color:var(--warn);border-color:#E6D3A8;background:#FBF5E7;}
.tp-fail{color:var(--fail);border-color:#E7C3BF;background:#FBEFEE;}
.tp-info{color:var(--info);border-color:#C3D0E3;background:#EFF3F9;}
.tp-mute{color:var(--ink-3);border-color:var(--line-2);background:var(--sunken);}
.tp-acc{color:var(--accent);border-color:#E2BFCE;background:#FAF1F5;}

/* ---------- page ---------- */
.tp-eyebrow{font-size:.66rem;text-transform:uppercase;letter-spacing:.12em;color:var(--ink-3);
            font-weight:700;margin:0 0 .3rem;}
.tp-h1{font-size:1.5rem;font-weight:700;color:var(--ink);letter-spacing:-.022em;margin:0 0 .35rem;}
.tp-lede{font-size:.9rem;color:var(--ink-2);margin:0 0 1.4rem;max-width:74ch;line-height:1.55;}
.tp-stats{display:flex;border:1px solid var(--line);background:var(--panel);margin:0 0 1.3rem;}
.tp-stat{flex:1;padding:.75rem .95rem;border-right:1px solid var(--line);}
.tp-stat:last-child{border-right:none;}
.tp-stat .k{font-size:.63rem;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-3);font-weight:700;}
.tp-stat .v{font-size:1.42rem;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.2;}
.tp-stat .s{font-size:.71rem;color:var(--ink-3);}
.tp-card{background:var(--panel);border:1px solid var(--line);border-top:2px solid var(--accent);
         padding:1rem 1.15rem;margin-bottom:1.1rem;}
.tp-card .tp-label{font-size:.64rem;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-3);
                   font-weight:700;margin-bottom:.3rem;}
.tp-card .tp-title{font-size:1.12rem;font-weight:700;color:var(--ink);line-height:1.3;margin:0 0 .3rem;}
.tp-card .tp-meta{font-size:.78rem;color:var(--ink-2);font-family:var(--mono);}
.tp-kv{display:flex;gap:.4rem;align-items:baseline;font-size:.78rem;color:var(--ink-2);padding:.16rem 0;}
.tp-kv .k{color:var(--ink-3);min-width:5.4rem;font-size:.7rem;text-transform:uppercase;
          letter-spacing:.06em;font-weight:700;}
.tp-section{font-size:.68rem;text-transform:uppercase;letter-spacing:.11em;color:var(--ink-3);
            font-weight:700;margin:1.7rem 0 .7rem;padding-bottom:.35rem;border-bottom:1px solid var(--line-2);}

/* ---------- registers (HTML tables) ---------- */
.tp-scroll{overflow-x:auto;border:1px solid var(--line);background:var(--panel);}
table.tp-tbl{width:100%;border-collapse:collapse;font-size:.79rem;font-family:var(--sans);
             font-variant-numeric:tabular-nums;}
table.tp-tbl th{background:var(--sunken);text-align:left;font-weight:700;font-size:.65rem;
                text-transform:uppercase;letter-spacing:.07em;color:var(--ink-2);
                border-bottom:1px solid var(--line-2);padding:.5rem .62rem;white-space:nowrap;
                position:sticky;top:0;}
table.tp-tbl td{border-bottom:1px solid var(--line);padding:.5rem .62rem;vertical-align:top;
                color:var(--ink-2);line-height:1.45;}
table.tp-tbl tbody tr:nth-child(even) td{background:#FCFBF9;}
table.tp-tbl td.tp-id{font-family:var(--mono);font-size:.72rem;color:var(--ink);white-space:nowrap;}
table.tp-tbl td.tp-strong{color:var(--ink);font-weight:600;}
table.tp-tbl td.tp-empty{color:#BDB6AD;}

/* ---------- document ---------- */
.tp-doc{background:var(--panel);border:1px solid var(--line);padding:46px 54px;max-width:1020px;}
.tp-doc h1{font-size:1.4rem;font-weight:700;letter-spacing:-.022em;margin:0 0 1.1rem;
           padding-bottom:.6rem;border-bottom:2px solid var(--ink);}
.tp-doc h2{font-size:1rem;font-weight:700;margin:2.3rem 0 .7rem;padding-bottom:.32rem;
           border-bottom:1px solid var(--line-2);}
.tp-doc h3{font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-3);
           font-weight:700;margin:1.5rem 0 .45rem;}
.tp-doc p,.tp-doc li{font-family:var(--serif);font-size:1rem;line-height:1.68;color:#26221F;}
.tp-doc ul,.tp-doc ol{padding-left:1.25rem;}
.tp-doc li{margin:.18rem 0;}
.tp-doc strong{color:var(--ink);}
.tp-doc table{width:100%;border-collapse:collapse;font-family:var(--sans);font-size:.78rem;
              margin:1rem 0 1.4rem;font-variant-numeric:tabular-nums;}
.tp-doc th{background:var(--sunken);text-align:left;font-weight:700;font-size:.65rem;
           text-transform:uppercase;letter-spacing:.07em;color:var(--ink-2);
           border-bottom:1px solid var(--line-2);padding:.5rem .6rem;}
.tp-doc td{border-bottom:1px solid var(--line);padding:.5rem .6rem;vertical-align:top;color:var(--ink-2);}
.tp-doc tr:nth-child(even) td{background:#FCFBF9;}
.tp-doc code{font-family:var(--mono);font-size:.78rem;background:var(--sunken);padding:.08rem .3rem;}
.tp-doc hr{border:none;border-top:1px solid var(--line);margin:2rem 0;}
.tp-doc blockquote{border-left:3px solid var(--accent);margin:1rem 0;padding:.15rem 0 .15rem .9rem;
                   color:var(--ink-2);}

/* ---------- gate ---------- */
.tp-gate{border:1px solid var(--line-2);border-left:4px solid var(--warn);background:#FCFAF5;
         padding:1rem 1.2rem;margin:1.3rem 0 .9rem;}
.tp-gate.ok{border-left-color:var(--pass);background:#F4FAF6;}
.tp-gate .h{font-size:.95rem;font-weight:700;color:var(--ink);margin:0 0 .3rem;}
.tp-gate .b{font-size:.83rem;color:var(--ink-2);line-height:1.55;max-width:78ch;}

/* ---------- controls ---------- */
.stButton>button{border-radius:2px;font-weight:600;font-size:.86rem;}
.stButton>button:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.stTextInput input,.stNumberInput input{border-radius:2px;font-size:.9rem;}
.stCheckbox label{font-size:.87rem;}
.stTabs [data-baseweb="tab"]{font-size:.85rem;font-weight:600;}
@media (prefers-reduced-motion: reduce){*{transition:none !important;animation:none !important;}}
</style>
"""


def code_fingerprint() -> str:
    """Short hash of the *live imported* modules, not of the files on disk.

    Streamlit hot-reloads the entry script but **not** imported modules, so a
    long-running server can serve new page code against stale library code. That
    is exactly how a `build_cases()` arity error appeared after a signature change:
    the page was current, the module was not.

    Hashing the loaded callables' signatures detects that, where hashing file
    contents would not — the files on disk are always current.
    """
    watched = (
        ("case_builder.build_cases", case_builder.build_cases),
        ("case_builder.fallback_cases", case_builder.fallback_cases),
        ("case_builder.normalise_case", case_builder.normalise_case),
        ("planner.generate_scenarios", planner.generate_scenarios),
        ("planner.build_plan", planner.build_plan),
        ("gate.assess", gate.assess),
        ("gate.resolve_trace", gate.resolve_trace),
        ("emit_cases.write_case_files", emit_cases.write_case_files),
        ("jira.fetch_issue", jira.fetch_issue),
        ("validate_cases.validate", validate_cases.validate),
    )
    digest = hashlib.sha256()
    for name, func in watched:
        try:
            digest.update(f"{name}{inspect.signature(func)}".encode())
        except (TypeError, ValueError):
            digest.update(name.encode())
    return digest.hexdigest()[:8]


BUILD = code_fingerprint()


def inject_theme() -> None:
    st.markdown(THEME_CSS, unsafe_allow_html=True)


def pill(text: str, kind: str = "mute") -> str:
    """A status pill. Always carries a word, never colour alone."""
    return f'<span class="tp-pill tp-{kind}">{html.escape(text)}</span>'


def md_to_html(source: str) -> str:
    """Markdown -> HTML for the document surface.

    Ticket-derived text is untrusted, so angle brackets are neutralised before
    conversion; markdown syntax (#, *, |) is unaffected.
    """
    safe = source.replace("<", "&lt;").replace(">", "&gt;")
    return md_lib.markdown(safe, extensions=["tables", "sane_lists"])


def html_table(headers: list[str], rows: list[list[str]], mono_cols: set[int] | None = None,
               strong_cols: set[int] | None = None, empty_marker: str = "") -> str:
    mono_cols, strong_cols = mono_cols or set(), strong_cols or set()
    out = ['<div class="tp-scroll"><table class="tp-tbl"><thead><tr>']
    out += [f"<th>{html.escape(h)}</th>" for h in headers]
    out.append("</tr></thead><tbody>")
    for row in rows:
        out.append("<tr>")
        for idx, cell in enumerate(row):
            raw = "" if cell is None else str(cell)
            classes = []
            if idx in mono_cols:
                classes.append("tp-id")
            if idx in strong_cols:
                classes.append("tp-strong")
            if not raw:
                classes.append("tp-empty")
                raw = empty_marker
            cls = f' class="{" ".join(classes)}"' if classes else ""
            out.append(f"<td{cls}>{html.escape(raw)}</td>")
        out.append("</tr>")
    out.append("</tbody></table></div>")
    return "".join(out)


# --------------------------------------------------------------------------- #
# State
# --------------------------------------------------------------------------- #

def _init_state() -> None:
    for key in ("ticket", "gaps", "scenarios", "plan_md", "plan_file",
                "cases", "case_files", "validation", "notes", "checks", "refusal"):
        if key not in st.session_state:
            st.session_state[key] = {} if key == "checks" else None


def _reset_run() -> None:
    for key in ("ticket", "gaps", "scenarios", "plan_md", "plan_file",
                "cases", "case_files", "validation", "notes", "refusal"):
        st.session_state[key] = None


def _stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M")


# --------------------------------------------------------------------------- #
# Rail
# --------------------------------------------------------------------------- #

def _env_state(settings: dict, key: str, configured: bool) -> str:
    """Honest readiness: 'Configured' means a value exists, not that it works."""
    check = (st.session_state.get("checks") or {}).get(key)
    if check is not None:
        return "pass" if check[0] else "fail"
    return "warn" if configured else "mute"


def _env_label(settings: dict, key: str, configured: bool) -> str:
    check = (st.session_state.get("checks") or {}).get(key)
    if check is not None:
        return "Reachable" if check[0] else "Unreachable"
    return "Configured" if configured else "Not set"


def render_rail(settings: dict, page: str) -> None:
    ticket = st.session_state.get("ticket")
    plan_md = st.session_state.get("plan_md")
    cases = st.session_state.get("cases")

    done = [bool(ticket), bool(plan_md), bool(cases), bool(cases)]
    active = 0
    if cases:
        active = 4
    elif plan_md:
        active = 2
    elif ticket:
        active = 1

    with st.sidebar:
        st.markdown(
            '<div class="tp-brand">Test Plan <span>&amp;</span> TestCase Agent</div>'
            '<div class="tp-brand-sub">Jira in, reviewable artefacts out</div>',
            unsafe_allow_html=True,
        )

        st.markdown('<div class="tp-rail-label">Run</div>', unsafe_allow_html=True)
        run_html = (
            f'<div class="tp-rail-run"><div class="k">Ticket</div>'
            f'<div class="v">{html.escape(ticket["issue_key"])}</div>'
            f'<div class="s">{html.escape(ticket["summary"][:58])}</div></div>'
            if ticket else
            '<div class="tp-rail-run"><div class="k">Ticket</div>'
            '<div class="s">No run yet. Enter a Jira ID.</div></div>'
        )
        st.markdown(run_html, unsafe_allow_html=True)

        st.markdown('<div class="tp-rail-label">Stages</div>', unsafe_allow_html=True)
        stage_html = []
        for idx, (num, name, desc) in enumerate(STAGES):
            cls, dot = "", str(num)
            if done[idx]:
                cls, dot = "done", "✓"
            elif idx == active:
                cls, dot = "active", str(num)
            elif idx > active:
                cls = "locked"
            detail = desc if not (idx > active) else "Locked until this stage"
            stage_html.append(
                f'<div class="tp-stage {cls}"><div class="tp-dot {cls}">{dot}</div>'
                f'<div><div class="t">{html.escape(name)}</div>'
                f'<div class="d">{html.escape(detail)}</div></div></div>'
            )
        st.markdown("".join(stage_html), unsafe_allow_html=True)

        st.markdown('<div class="tp-rail-label" style="margin-top:1.3rem">Environment</div>',
                    unsafe_allow_html=True)
        jira_ok = settings_manager.settings_ready(settings)
        env_rows = [
            ("Jira", "jira", jira_ok),
            ("Local LLM", "local", bool(settings.get("local_llm_url"))),
            ("Groq", "groq", bool(settings.get("groq_api_key"))),
        ]
        st.markdown("".join(
            f'<div class="tp-env"><span class="n">{html.escape(name)}</span>'
            f'{pill(_env_label(settings, key, ok), _env_state(settings, key, ok))}</div>'
            for name, key, ok in env_rows
        ), unsafe_allow_html=True)

        st.markdown(
            '<div class="tp-rail-foot">"Configured" means a value is saved. It does not mean the '
            'connection works, run a test in Settings to verify.</div>'
            f'<div class="tp-rail-foot">build <code>{BUILD}</code> — if this does not change after '
            f'a code edit, the server is stale. Restart it.</div>',
            unsafe_allow_html=True,
        )


# --------------------------------------------------------------------------- #
# Stages
# --------------------------------------------------------------------------- #

def stage_fetch(settings: dict, issue_id: str) -> None:
    with st.spinner(f"Fetching {issue_id} from Jira…"):
        ticket = jira.fetch_issue(settings, issue_id)
    st.session_state["ticket"] = ticket
    st.session_state["gaps"] = planner.analyze(ticket)
    st.success(f"Fetched {ticket['issue_key']}")


def stage_load_sample() -> None:
    """Load the bundled fixture so the flow can be demonstrated offline."""
    with open(SAMPLE_TICKET, "r", encoding="utf-8") as handle:
        ticket = json.load(handle)
    ticket["fetched_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    _reset_run()
    st.session_state["ticket"] = ticket
    st.session_state["gaps"] = planner.analyze(ticket)
    st.info("Loaded the bundled sample ticket. This is not a real Jira issue; "
            "add a valid Jira token in Settings to use live tickets.")


def stage_plan(settings: dict) -> None:
    ticket = st.session_state["ticket"]
    gaps = st.session_state["gaps"]
    with st.spinner("Deriving scenarios and rendering the plan…"):
        scenarios, provider, note = planner.generate_scenarios(settings, ticket, gaps)
        markdown, unfilled = planner.build_plan(ticket, gaps, scenarios, settings)
        if unfilled:
            st.warning(f"Unreplaced template tokens: {', '.join(unfilled)}")
        out_dir = settings_manager.output_dir(settings)
        plan_path = os.path.join(out_dir, f"{ticket['issue_key']}_{_stamp()}_Test_Plan.md")
        with open(plan_path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(markdown)
    st.session_state.update({
        "scenarios": scenarios, "plan_md": markdown, "plan_file": plan_path,
        "notes": (st.session_state["notes"] or []) + [f"Plan: {note} (provider: {provider})"],
        "cases": None, "case_files": None, "validation": None,
    })


def stage_cases(settings: dict, max_cases: int) -> None:
    ticket = st.session_state["ticket"]
    scenarios = st.session_state["scenarios"]
    gaps = st.session_state["gaps"]
    with st.spinner("Generating end-to-end regression cases…"):
        cases, provider, note = case_builder.build_cases(
            settings, ticket, scenarios, gaps, max_cases)

        if not cases:
            st.session_state.update({
                "cases": None, "case_files": None, "validation": None, "refusal": note,
                "notes": (st.session_state["notes"] or []) + [note],
            })
            return

        files = emit_cases.write_case_files(
            cases, settings_manager.output_dir(settings), ticket, _stamp(),
            meta_extra={
                "plan_file": os.path.basename(st.session_state["plan_file"] or ""),
                "gate_status": "REVIEWED BY USER",
                "gaps_summary": _gaps_summary(),
                "basis": gate.evidence_basis(ticket),
            },
            scenario_ids=[s["id"] for s in scenarios],
        )
        validation = validate_cases.validate(
            cases, files["rows"], files["csv"], _count_doc_rows(files["md"]))
    st.session_state.update({
        "cases": cases, "case_files": files, "validation": validation, "refusal": None,
        "notes": (st.session_state["notes"] or []) + [f"Cases: {note} (provider: {provider})"],
    })


def _count_doc_rows(path: str) -> int:
    count = 0
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            if line.startswith("| ") and not set(line.strip()) <= set("|-: "):
                count += 1
    return max(0, count - 1)


def _gaps_summary() -> str:
    counts = (st.session_state.get("gaps") or {}).get("counts", {})
    return (f"{counts.get('present', 0)} present · {counts.get('ambiguous', 0)} ambiguous · "
            f"{counts.get('missing', 0)} missing")


# --------------------------------------------------------------------------- #
# Renderers
# --------------------------------------------------------------------------- #

def render_stats() -> None:
    ticket = st.session_state["ticket"]
    gaps = st.session_state["gaps"]
    counts = gaps["counts"]
    scen = st.session_state.get("scenarios") or []
    cases = st.session_state.get("cases") or []
    ac = "Yes" if ticket.get("acceptance_criteria") else "None"

    cells = [
        ("Acceptance criteria", ac, "in the ticket"),
        ("Gaps", str(counts["missing"] + counts["ambiguous"]), f"{counts['missing']} blocking"),
        ("Scenarios", str(len(scen)), "P0/P1/P2"),
        ("Cases", str(len(cases)) if cases else "—", "after approval"),
    ]
    st.markdown(
        '<div class="tp-stats">' + "".join(
            f'<div class="tp-stat"><div class="k">{html.escape(k)}</div>'
            f'<div class="v">{html.escape(v)}</div><div class="s">{html.escape(s)}</div></div>'
            for k, v, s in cells
        ) + "</div>",
        unsafe_allow_html=True,
    )


def render_ticket() -> None:
    ticket = st.session_state["ticket"]
    gaps = st.session_state["gaps"]
    sample = ticket.get("source") == "sample_fixture"

    st.markdown('<div class="tp-section">1 · Ticket</div>', unsafe_allow_html=True)
    st.markdown(
        f'<div class="tp-card">'
        f'<div class="tp-label">{html.escape(ticket["issue_key"])}'
        f'{" · sample fixture" if sample else ""}</div>'
        f'<div class="tp-title">{html.escape(ticket["summary"])}</div>'
        f'<div class="tp-meta">{html.escape(ticket["issue_type"])} · '
        f'{html.escape(ticket["priority"])} · {html.escape(ticket["status"])}</div>'
        f'</div>',
        unsafe_allow_html=True,
    )

    left, right = st.columns([3, 2])
    with left:
        st.markdown('<div class="tp-section">Gap register</div>', unsafe_allow_html=True)
        rows = []
        for item in gaps["items"]:
            kind, word = GAP_KIND[item["status"]]
            rows.append([
                item["id"],
                f"{GAP_GLYPH[item['status']]} {word}",
                item["category"].replace("_", " "),
                item["statement"],
                item.get("question", ""),
            ])
        st.markdown(html_table(["ID", "Status", "Category", "Finding", "Question"], rows,
                               mono_cols={0}, empty_marker="—"), unsafe_allow_html=True)
    with right:
        st.markdown('<div class="tp-section">Ticket detail</div>', unsafe_allow_html=True)
        for label, value in (
            ("Components", ", ".join(ticket.get("components") or []) or "Not specified"),
            ("Labels", ", ".join(ticket.get("labels") or []) or "None"),
            ("Fix version", ", ".join(ticket.get("fix_versions") or []) or "Needs clarification"),
            ("Links", ", ".join(l.get("key", "") for l in ticket.get("links") or []) or "None"),
            ("Criteria from", ticket.get("ac_source", "none_found").replace("_", " ")),
            ("Source hash", (ticket.get("source_hash") or "")[:26]),
        ):
            st.markdown(
                f'<div class="tp-kv"><span class="k">{html.escape(label)}</span>'
                f'<span>{html.escape(str(value))}</span></div>',
                unsafe_allow_html=True,
            )

        attachments = ticket.get("attachments") or []
        st.markdown('<div class="tp-section">Attachments</div>', unsafe_allow_html=True)
        if not attachments:
            st.caption("None on this ticket.")
        for attachment in attachments:
            status = attachment.get("status", "unknown")
            kind = {"read": "pass", "error": "fail", "skipped": "mute"}.get(status, "mute")
            detail = (f"{attachment.get('chars', 0)} chars" if status == "read"
                      else attachment.get("note", "") or status)
            st.markdown(
                f'{pill(status, kind)} <span style="font-size:.8rem">'
                f'{html.escape(attachment.get("filename", ""))}</span>'
                f'<div style="font-size:.74rem;color:#837C72;margin:.1rem 0 .5rem 0">'
                f'{html.escape(detail)}</div>',
                unsafe_allow_html=True,
            )
        if any(a.get("text") for a in attachments):
            with st.expander("Read attachment text"):
                for attachment in attachments:
                    if attachment.get("text"):
                        st.caption(attachment.get("filename", ""))
                        st.text(attachment["text"][:6000])

        with st.expander("Ticket description"):
            st.text(ticket.get("description_text", "")[:8000])


def render_plan() -> None:
    scenarios = st.session_state["scenarios"]
    plan_md = st.session_state["plan_md"]
    plan_name = os.path.basename(st.session_state["plan_file"])

    st.markdown('<div class="tp-section">2 · Test plan</div>', unsafe_allow_html=True)

    doc_tab, scen_tab, cov_tab = st.tabs(
        ["Test plan document", f"Scenario register ({len(scenarios)})", "Coverage"])

    with doc_tab:
        st.download_button("Download .md", data=plan_md.encode("utf-8"),
                           file_name=plan_name, mime="text/markdown")
        st.html(f'<div class="tp-doc">{md_to_html(plan_md)}</div>')

    with scen_tab:
        rows = [[s["id"], s["priority"], ", ".join(s["trace"]), s["scenario"], s["expected"]]
                for s in scenarios]
        st.markdown(html_table(["ID", "Priority", "Trace", "Scenario", "Expected result"], rows,
                               mono_cols={0}, empty_marker="—"), unsafe_allow_html=True)

    with cov_tab:
        grouped: dict[str, list[str]] = {}
        for s in scenarios:
            for t in s["trace"]:
                grouped.setdefault(t, []).append(s["id"])
        rows = [[req, ", ".join(ids)] for req, ids in sorted(grouped.items())]
        st.markdown(html_table(["Traced to", "Scenarios"], rows, mono_cols={0}),
                    unsafe_allow_html=True)
        open_count = len((st.session_state["gaps"] or {}).get("blocking", []))
        st.markdown(
            f'<div class="tp-gate"><div class="h">Coverage note</div><div class="b">'
            f'{len(scenarios)} scenarios, each traced to a requirement or a gap id. '
            f'{open_count} blocking gap(s) remain open, so parts of this plan cannot be '
            f'validated definitively until the ticket author responds.</div></div>',
            unsafe_allow_html=True,
        )


def render_evidence(assessment: dict) -> None:
    """Show whether the ticket carries enough to generate from, and why."""
    kind = {"ok": "pass", "constrain": "warn", "refuse": "fail"}[assessment["decision"]]
    word = {"ok": "Sufficient", "constrain": "Limited — sparse-ticket mode",
            "refuse": "Insufficient — generation blocked"}[assessment["decision"]]
    st.markdown(
        f'{pill(f"Evidence: {word}", kind)} '
        f'<span style="font-size:.8rem;color:#55504A">'
        f'{html.escape(assessment["reason"])}</span>'
        f'<div style="font-size:.76rem;color:#837C72;margin-top:.35rem">'
        f'Cases would rest on {html.escape(assessment["basis"])}.</div>',
        unsafe_allow_html=True,
    )


def render_gate() -> bool:
    approved = st.checkbox("I have reviewed this plan and approve it for E2E case generation.",
                           key="gate_approve")
    state = "ok" if approved else ""
    word = "Approved" if approved else "Awaiting review"
    st.markdown(
        f'<div class="tp-gate {state}"><div class="h">Human review gate · {word}</div>'
        f'<div class="b">The plan above is a draft. Regression cases are generated only after a '
        f'person approves it, so nothing downstream is treated as authoritative on the model\'s '
        f'say-so alone. Open questions carry forward into the case file.</div></div>',
        unsafe_allow_html=True,
    )
    return approved


def render_cases() -> None:
    files = st.session_state["case_files"]
    validation = st.session_state["validation"]
    rows = files["rows"]

    st.markdown('<div class="tp-section">4 · Case file</div>', unsafe_allow_html=True)

    flagged = sum(1 for c in st.session_state["cases"] if c.get("clarification_needed"))
    unverified = validation["metrics"].get("invented_traces", 0)
    if validation["ok"]:
        st.markdown(
            f'{pill(f"{len(rows)} cases · contract valid", "pass")} '
            f'{pill("12-column contract", "info")} '
            + (pill(f"{flagged} need clarification", "warn") if flagged else "")
            + (pill(f"{unverified} invented trace(s)", "fail") if unverified else ""),
            unsafe_allow_html=True)
    else:
        st.markdown(pill(f"{len(validation['contract_issues'])} contract failure(s)", "fail"),
                    unsafe_allow_html=True)

    for issue in validation.get("grounding_issues", [])[:5]:
        st.warning(f"[{issue['code']}] {issue['message']}")
    for issue in validation.get("contract_issues", [])[:10]:
        st.error(f"[{issue['code']}] {issue['message']}")

    st.markdown(
        html_table(contract.HEADERS, [[r.get(h, "") for h in contract.HEADERS] for r in rows],
                   mono_cols={0}, empty_marker="—"),
        unsafe_allow_html=True,
    )

    left, right = st.columns(2)
    with left:
        with open(files["md"], "rb") as handle:
            st.download_button("Download cases .md", data=handle.read(),
                               file_name=os.path.basename(files["md"]), mime="text/markdown")
    with right:
        with open(files["csv"], "rb") as handle:
            st.download_button("Download cases .csv", data=handle.read(),
                               file_name=os.path.basename(files["csv"]), mime="text/csv")

    st.markdown(
        '<div class="tp-gate"><div class="h">Generated, not executed</div><div class="b">'
        'The Actual Result, Status and Executed QA Name columns are intentionally empty. '
        'This agent writes cases; it never runs them, so it must not invent an outcome.</div></div>',
        unsafe_allow_html=True,
    )
    st.caption("Written to " + os.path.dirname(files["csv"]))


# --------------------------------------------------------------------------- #
# Pages
# --------------------------------------------------------------------------- #

def render_run(settings: dict) -> None:
    st.markdown('<div class="tp-eyebrow">Quality engineering workspace</div>', unsafe_allow_html=True)
    st.markdown('<div class="tp-h1">Test plan and E2E regression cases from a Jira ticket</div>',
                unsafe_allow_html=True)
    st.markdown(
        '<div class="tp-lede">Enter a Jira ID. The agent fetches the ticket, analyses what is '
        'missing from it, drafts a test plan for review, and, once you approve that plan, writes '
        'the end-to-end regression cases as a markdown and CSV file for your automation suite.</div>',
        unsafe_allow_html=True,
    )

    ready = settings_manager.settings_ready(settings)
    if not ready:
        st.markdown(pill("Jira not configured · open Settings", "warn"), unsafe_allow_html=True)

    prompt = st.text_input("Jira ticket", value="Create test plan and E2E regression cases for SCRUM-1",
                           label_visibility="collapsed",
                           placeholder="e.g. Create test plan and E2E regression cases for SCRUM-1")
    detected = jira.extract_jira_id(prompt)

    c1, c2, c3, _ = st.columns([1.1, 1.1, 1.1, 3])
    with c1:
        fetch = st.button("Fetch and analyse", type="primary", width="stretch",
                          disabled=not detected or not ready)
    with c2:
        sample = st.button("Load sample ticket", width="stretch")
    with c3:
        reset = st.button("Reset", width="stretch")

    if detected:
        st.caption(f"Detected Jira ID: **{detected}**")
    else:
        st.caption("No Jira ID detected in the prompt.")

    if reset:
        _reset_run()
        st.rerun()
    if sample:
        stage_load_sample()
        st.rerun()
    if fetch and detected:
        _reset_run()
        try:
            stage_fetch(settings, detected)
            st.rerun()
        except jira.JiraError as exc:
            st.error(f"[{exc.code}] {exc}")
        except Exception as exc:  # noqa: BLE001
            st.error(f"Unexpected error while fetching: {exc}")

    if not st.session_state["ticket"]:
        return

    render_stats()
    render_ticket()

    if not st.session_state["plan_md"]:
        st.markdown('<div class="tp-section">2 · Test plan</div>', unsafe_allow_html=True)
        st.markdown(
            '<div class="tp-gate"><div class="h">Stage locked</div><div class="b">'
            'Generate the plan to derive test scenarios from the ticket, then review it before '
            'any cases are produced.</div></div>', unsafe_allow_html=True)
        if st.button("Generate test plan", type="primary", disabled=not detected):
            try:
                stage_plan(settings)
                st.rerun()
            except Exception as exc:  # noqa: BLE001
                st.error(f"Failed to build the test plan: {exc}")
        return

    render_plan()

    st.markdown('<div class="tp-section">3 · Review gate</div>', unsafe_allow_html=True)
    assessment = gate.assess(st.session_state["ticket"], st.session_state["gaps"])
    render_evidence(assessment)
    blocked = assessment["decision"] == "refuse"
    approved = render_gate()
    max_cases = st.number_input("Maximum cases to generate", min_value=1, max_value=50,
                                value=12, step=1, disabled=blocked)
    if st.button("Approve and generate E2E cases", type="primary",
                 disabled=(not approved) or blocked):
        try:
            stage_cases(settings, int(max_cases))
            st.rerun()
        except Exception as exc:  # noqa: BLE001
            st.error(f"Failed to generate cases: {exc}")

    if st.session_state.get("refusal"):
        st.error(st.session_state["refusal"])

    if st.session_state["cases"]:
        render_cases()

    if st.session_state["notes"]:
        with st.expander("Run notes"):
            for note in st.session_state["notes"]:
                st.write(f"- {note}")


def render_settings_page() -> None:
    st.markdown('<div class="tp-eyebrow">Configuration</div>', unsafe_allow_html=True)
    st.markdown('<div class="tp-h1">Settings</div>', unsafe_allow_html=True)
    settings = settings_manager.load_settings()
    if settings.get("_env_source"):
        st.markdown(pill(f"seeded from {os.path.basename(settings['_env_source'])}", "info"),
                    unsafe_allow_html=True)

    st.markdown('<div class="tp-section">Jira</div>', unsafe_allow_html=True)
    a, b = st.columns(2)
    with a:
        jira_url = st.text_input("Base URL", value=settings.get("jira_url", ""),
                                 placeholder="https://your-domain.atlassian.net")
        jira_email = st.text_input("Email", value=settings.get("jira_email", ""),
                                   placeholder="you@example.com")
    with b:
        jira_token = st.text_input("API token", value=settings.get("jira_token", ""), type="password",
                                   help="Create at id.atlassian.com → Security → API tokens.")
        qa_name = st.text_input("Your name (used as Prepared By)", value=settings.get("qa_name", ""))

    st.markdown('<div class="tp-section">Local LLM — LM Studio or Ollama, OpenAI-compatible</div>',
                unsafe_allow_html=True)
    a, b = st.columns(2)
    with a:
        local_url = st.text_input("Endpoint URL", value=settings.get("local_llm_url", ""),
                                  placeholder="http://localhost:1234/v1")
    with b:
        local_model = st.text_input("Model", value=settings.get("local_llm_model", ""),
                                    placeholder="google/gemma-3-1b")

    st.markdown('<div class="tp-section">Groq — fallback provider</div>', unsafe_allow_html=True)
    a, b = st.columns(2)
    with a:
        groq_key = st.text_input("API key", value=settings.get("groq_api_key", ""), type="password")
    with b:
        groq_model = st.text_input("Model", value=settings.get("groq_model", ""),
                                   placeholder="llama-3.3-70b-versatile")

    st.markdown('<div class="tp-section">Run preferences</div>', unsafe_allow_html=True)
    a, b = st.columns(2)
    with a:
        provider = st.radio("Provider preference", ["local", "groq"], horizontal=True,
                            index=0 if settings.get("llm_provider_preference", "local") == "local" else 1,
                            help="'local' tries the endpoint above first, then falls back to Groq.")
    with b:
        output_dir = st.text_input("Output folder", value=settings.get("output_dir", "TestPlans"))

    if st.button("Save settings", type="primary"):
        settings_manager.save_settings({
            "jira_url": jira_url.strip().rstrip("/"),
            "jira_email": jira_email.strip(),
            "jira_token": jira_token.strip(),
            "qa_name": qa_name.strip(),
            "local_llm_url": local_url.strip(),
            "local_llm_model": local_model.strip() or "google/gemma-3-1b",
            "groq_api_key": groq_key.strip(),
            "groq_model": groq_model.strip() or "llama-3.3-70b-versatile",
            "llm_provider_preference": provider,
            "output_dir": output_dir.strip() or "TestPlans",
        })
        st.success("Saved to config.json.")
        st.rerun()
    st.caption("Credentials are written to config.json, which is gitignored.")

    st.markdown('<div class="tp-section">Connection tests</div>', unsafe_allow_html=True)
    st.caption("A saved value is not a working connection. Run these to find out which it is.")
    current = settings_manager.load_settings()
    a, b, c = st.columns(3)
    checks = st.session_state.setdefault("checks", {})

    with a:
        if st.button("Test Jira", width="stretch"):
            checks["jira"] = jira.test_connection(current)
            st.rerun()
    with b:
        if st.button("Test local LLM", width="stretch"):
            checks["local"] = llm_client.test_local_connection(current)
            st.rerun()
    with c:
        if st.button("Test Groq", width="stretch"):
            checks["groq"] = llm_client.test_groq_connection(current)
            st.rerun()

    for name, key in (("Jira", "jira"), ("Local LLM", "local"), ("Groq", "groq")):
        check = checks.get(key)
        if check is None:
            continue
        ok, message = check
        st.markdown(
            f'{pill("Reachable" if ok else "Unreachable", "pass" if ok else "fail")} '
            f'<span style="font-size:.82rem;color:#55504A">{html.escape(name)}: '
            f'{html.escape(message)}</span>',
            unsafe_allow_html=True,
        )


def main() -> None:
    st.set_page_config(page_title="Test Plan & TestCase Agent", layout="wide",
                       initial_sidebar_state="expanded")
    inject_theme()
    _init_state()
    settings = settings_manager.load_settings()

    with st.sidebar:
        page = st.radio("Navigation", ["Run", "Settings"], label_visibility="collapsed")
    render_rail(settings, page)

    if page == "Settings":
        render_settings_page()
    else:
        render_run(settings)


if __name__ == "__main__":
    main()
