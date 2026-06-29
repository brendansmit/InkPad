import csv
import io

# Recognised column name fragments (lowercase) for each field
_NAME_COLS = ["displayname", "student name", "name", "student"]
_EC_COLS   = ["officialextracredit", "extracredit", "extra credit", "extra_credit", "bonus", "ec points", "ec"]
_DONE_COLS = ["officialattemptcompleted", "attemptcompleted", "completed", "attempt completed"]

IGNORED_NAMES = {"test", "demo", "test student", "demo student", "sample", "example"}


def parse_extracredit_csv(file_bytes: bytes) -> list[dict]:
    """
    Returns list of {"name": str, "extra_credit": float}.
    Skips rows with no completed attempt, no EC value, or test/demo names.
    Column detection is flexible so future export formats still work.
    """
    text = file_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    headers = [h.strip() for h in (reader.fieldnames or [])]
    lower  = [h.lower() for h in headers]

    name_col = _find(headers, lower, _NAME_COLS)
    ec_col   = _find(headers, lower, _EC_COLS)
    done_col = _find(headers, lower, _DONE_COLS)

    if not name_col:
        raise ValueError(f"Could not find a name column. Headers: {headers}")
    if not ec_col:
        raise ValueError(f"Could not find an extra-credit column. Headers: {headers}")

    rows = []
    for row in reader:
        name   = row.get(name_col, "").strip()
        ec_raw = row.get(ec_col,   "").strip()

        if not name or name.lower() in IGNORED_NAMES:
            continue

        # Skip if the attempt wasn't completed
        if done_col:
            done = row.get(done_col, "").strip().lower()
            if done not in ("true", "yes", "1"):
                continue

        if not ec_raw:
            continue

        try:
            ec = float(ec_raw)
        except (ValueError, TypeError):
            continue

        rows.append({"name": name, "extra_credit": ec})

    return rows


def _find(headers, lower_headers, candidates):
    for candidate in candidates:
        for i, h in enumerate(lower_headers):
            if candidate in h:
                return headers[i]
    return None
