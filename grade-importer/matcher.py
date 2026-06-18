import difflib
import re
import os
import requests


DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
FUZZY_THRESHOLD = 0.82


def _normalize(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def match_name(csv_name: str, students: list[dict]) -> tuple[dict | None, float, str]:
    """
    Returns (student, confidence, method).
    confidence is 0.0-1.0. method is one of: exact, fuzzy, chinese, deepseek, none.
    """
    normed = _normalize(csv_name)
    if not normed:
        return None, 0.0, "none"

    # 1. Exact match on english_name
    for s in students:
        if _normalize(s["english_name"]) == normed:
            return s, 1.0, "exact"

    # 2. Fuzzy match on english_name
    names = [_normalize(s["english_name"]) for s in students]
    matches = difflib.get_close_matches(normed, names, n=1, cutoff=FUZZY_THRESHOLD)
    if matches:
        idx = names.index(matches[0])
        score = difflib.SequenceMatcher(None, normed, matches[0]).ratio()
        return students[idx], score, "fuzzy"

    # 3. Chinese name exact match (in case CSV contains Chinese)
    for s in students:
        if s["chinese_name"].strip() == csv_name.strip():
            return s, 1.0, "chinese"

    # 4. DeepSeek fallback
    if DEEPSEEK_API_KEY:
        result = _deepseek_match(csv_name, students)
        if result:
            return result, 0.95, "deepseek"

    return None, 0.0, "none"


def _deepseek_match(csv_name: str, students: list[dict]) -> dict | None:
    roster = "\n".join(
        f"{s['english_name']} / {s['chinese_name']}" for s in students
    )
    prompt = (
        f"A CSV file contains the student name: \"{csv_name}\"\n"
        f"Match it to exactly one student from this roster (English / Chinese):\n{roster}\n\n"
        "Reply with ONLY the exact English name from the roster, or 'NO_MATCH' if none fits."
    )
    try:
        resp = requests.post(
            "https://api.deepseek.com/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 50,
                "temperature": 0,
            },
            timeout=10,
        )
        resp.raise_for_status()
        answer = resp.json()["choices"][0]["message"]["content"].strip()
        if answer == "NO_MATCH":
            return None
        for s in students:
            if _normalize(s["english_name"]) == _normalize(answer):
                return s
    except Exception:
        pass
    return None


def match_csv_rows(rows: list[dict], students: list[dict]) -> dict:
    """
    rows: list of {"name": str, "score": float}
    Returns: {
        "matched": [{"student": ..., "score": ..., "confidence": ..., "method": ..., "csv_name": ...}],
        "unmatched": [{"csv_name": ..., "score": ...}]
    }
    """
    matched = []
    unmatched = []
    used_ids = set()

    for row in rows:
        student, confidence, method = match_name(row["name"], students)
        if student and student["student_id"] not in used_ids:
            matched.append({
                "student": student,
                "score": row["score"],
                "confidence": round(confidence, 3),
                "method": method,
                "csv_name": row["name"],
            })
            used_ids.add(student["student_id"])
        else:
            unmatched.append({"csv_name": row["name"], "score": row["score"]})

    return {"matched": matched, "unmatched": unmatched}
