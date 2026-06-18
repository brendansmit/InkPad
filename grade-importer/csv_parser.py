import csv
import io
import re


def parse_csv(file_bytes: bytes) -> list[dict]:
    """
    Parses a grade CSV. Tries to auto-detect name and score columns.
    Returns list of {"name": str, "score": float}.
    """
    text = file_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    headers = [h.strip() for h in (reader.fieldnames or [])]

    name_col = _find_col(headers, ["student first name", "student name", "name", "student"])
    score_col = _find_col(headers, ["earned points", "score", "points", "grade", "marks", "final score"])

    if not name_col or not score_col:
        raise ValueError(
            f"Could not detect name/score columns. Found headers: {headers}"
        )

    rows = []
    for row in reader:
        name = row.get(name_col, "").strip()
        raw_score = row.get(score_col, "").strip()
        if not name:
            continue
        try:
            score = float(raw_score)
        except (ValueError, TypeError):
            score = None
        rows.append({"name": name, "score": score})

    return rows


def _find_col(headers: list[str], candidates: list[str]) -> str | None:
    lower = [h.lower() for h in headers]
    for candidate in candidates:
        for i, h in enumerate(lower):
            if candidate in h:
                return headers[i]
    return None
