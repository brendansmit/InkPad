"""
Word-level text diff engine using difflib.SequenceMatcher.

Returns DiffResult with:
  changes   – list of DiffChange objects (passed to AI classifier)
  left_spans  – coloured spans for the Original panel
  right_spans – coloured spans for the New Version panel
  counts    – {"insert": n, "delete": n, "move": n}

Move detection: a deletion whose text closely matches (>= MOVE_THRESHOLD)
an insertion at a different opcode index is classified as a move.
Only changes >= MIN_CHANGE_WORDS are recorded in `changes` (smaller ones
are shown visually but skipped for AI to reduce prompt size).
"""

import difflib
import re
from dataclasses import dataclass, field
from typing import Literal

MOVE_THRESHOLD = 0.72
MIN_CHANGE_WORDS = 3
CONTEXT_WORDS = 15   # words of unchanged context shown around each change block


ChangeKind = Literal["insert", "delete", "move"]
SpanKind = Literal["equal", "insert", "delete", "move_from", "move_to"]


@dataclass
class DiffChange:
    change_id: int
    diff_type: ChangeKind
    original_text: str
    new_text: str
    word_count: int


@dataclass
class Span:
    text: str
    kind: SpanKind


@dataclass
class DiffResult:
    changes: list[DiffChange] = field(default_factory=list)
    left_spans: list[Span] = field(default_factory=list)
    right_spans: list[Span] = field(default_factory=list)
    counts: dict = field(default_factory=lambda: {"insert": 0, "delete": 0, "move": 0})


def diff_texts(text_a: str, text_b: str) -> DiffResult:
    toks_a = _tokenise(text_a)
    toks_b = _tokenise(text_b)

    matcher = difflib.SequenceMatcher(None, toks_a, toks_b, autojunk=False)
    opcodes = list(matcher.get_opcodes())

    # Collect text for each change side by opcode index for move detection
    a_texts: dict[int, str] = {}
    b_texts: dict[int, str] = {}
    for idx, (tag, i1, i2, j1, j2) in enumerate(opcodes):
        if tag in ("delete", "replace"):
            a_texts[idx] = _join(toks_a[i1:i2])
        if tag in ("insert", "replace"):
            b_texts[idx] = _join(toks_b[j1:j2])

    # Detect moves: pair similar delete↔insert at different opcode positions
    move_a: set[int] = set()
    move_b: set[int] = set()
    used_b: set[int] = set()
    for a_idx, a_txt in a_texts.items():
        if len(a_txt.split()) < MIN_CHANGE_WORDS:
            continue
        best_ratio, best_b = MOVE_THRESHOLD, -1
        for b_idx, b_txt in b_texts.items():
            if b_idx in used_b or b_idx == a_idx:
                continue
            r = difflib.SequenceMatcher(None, a_txt.split(), b_txt.split()).ratio()
            if r > best_ratio:
                best_ratio, best_b = r, b_idx
        if best_b >= 0:
            move_a.add(a_idx)
            move_b.add(best_b)
            used_b.add(best_b)

    result = DiffResult()
    cid = 0

    for idx, (tag, i1, i2, j1, j2) in enumerate(opcodes):
        a_txt = _join(toks_a[i1:i2])
        b_txt = _join(toks_b[j1:j2])
        wc = max(len(a_txt.split()), len(b_txt.split()))

        if tag == "equal":
            result.left_spans.append(Span(a_txt, "equal"))
            result.right_spans.append(Span(b_txt, "equal"))

        elif tag == "delete":
            is_move = idx in move_a
            result.left_spans.append(Span(a_txt, "move_from" if is_move else "delete"))
            if wc >= MIN_CHANGE_WORDS:
                result.changes.append(DiffChange(cid, "move" if is_move else "delete", a_txt, "", wc))
                result.counts["move" if is_move else "delete"] += 1
                cid += 1

        elif tag == "insert":
            is_move = idx in move_b
            result.right_spans.append(Span(b_txt, "move_to" if is_move else "insert"))
            if wc >= MIN_CHANGE_WORDS and not is_move:
                result.changes.append(DiffChange(cid, "insert", "", b_txt, wc))
                result.counts["insert"] += 1
                cid += 1

        elif tag == "replace":
            is_move_a = idx in move_a
            is_move_b = idx in move_b
            result.left_spans.append(Span(a_txt, "move_from" if is_move_a else "delete"))
            result.right_spans.append(Span(b_txt, "move_to" if is_move_b else "insert"))
            if wc >= MIN_CHANGE_WORDS:
                kind: ChangeKind = "move" if is_move_a else "insert"
                result.changes.append(DiffChange(cid, kind, a_txt, b_txt, wc))
                result.counts["move" if kind == "move" else "insert"] += 1
                cid += 1

    return result


def condensed_spans(spans: list[Span]) -> list[Span]:
    """
    Replace long runs of 'equal' spans with a short summary token
    so the diff display stays readable for long essays.
    """
    out: list[Span] = []
    i = 0
    while i < len(spans):
        s = spans[i]
        if s.kind == "equal":
            words = s.text.split()
            if len(words) > CONTEXT_WORDS * 2:
                head = " ".join(words[:CONTEXT_WORDS])
                tail = " ".join(words[-CONTEXT_WORDS:])
                mid_count = len(words) - CONTEXT_WORDS * 2
                out.append(Span(head + " ", "equal"))
                out.append(Span(f"\n[… {mid_count} unchanged words …]\n", "context_skip"))
                out.append(Span(" " + tail, "equal"))
            else:
                out.append(s)
        else:
            out.append(s)
        i += 1
    return out


def _tokenise(text: str) -> list[str]:
    return re.split(r"(\s+)", text)


def _join(tokens: list[str]) -> str:
    return "".join(tokens)
