"""Frozen output contract for the regression case file.

Single source of truth for the 12 columns defined in LLM.md §3.5.
Additive changes only — never reorder, never rename.
"""

AUTHORED = "authored"
EXECUTION = "execution"

# (column header, class) — order is the contract.
COLUMNS: list[tuple[str, str]] = [
    ("Scenario TID", AUTHORED),
    ("TestCase Description", AUTHORED),
    ("PreCondition", AUTHORED),
    ("TestSteps", AUTHORED),
    ("Expected Result", AUTHORED),
    ("Actual Result", EXECUTION),
    ("Steps to Execute", AUTHORED),
    ("Status", EXECUTION),
    ("Executed QA Name", EXECUTION),
    ("Misc (Comments)", AUTHORED),
    ("Priority", AUTHORED),
    ("Is Automated", AUTHORED),
]

HEADERS = [name for name, _ in COLUMNS]
AUTHORED_HEADERS = [n for n, cls in COLUMNS if cls == AUTHORED]
EXECUTION_HEADERS = [n for n, cls in COLUMNS if cls == EXECUTION]

# Authored columns that may legitimately be empty.
AUTHORED_OPTIONAL = {"PreCondition"}

PRIORITIES = ("P0", "P1", "P2")
STEP_SEPARATOR = " | "
NOT_SPECIFIED = "\u00abnot specified in ticket\u00bb"


def duplicate_headers(headers: list[str] | None = None) -> list[str]:
    """Return header names that appear more than once.

    Duplicate CSV headers are silently destructive: csv.DictReader and pandas
    keep only the last occurrence, dropping the earlier columns with no error.
    """
    names = HEADERS if headers is None else headers
    return sorted({n for n in names if names.count(n) > 1})


def contract_drift(headers: list[str]) -> list[str] | None:
    """Return None when headers match the contract exactly, else a description."""
    if headers == HEADERS:
        return None
    if sorted(headers) == sorted(HEADERS):
        return f"column ORDER changed: got {headers}"
    missing = [h for h in HEADERS if h not in headers]
    extra = [h for h in headers if h not in HEADERS]
    return f"missing={missing} unexpected={extra}"
