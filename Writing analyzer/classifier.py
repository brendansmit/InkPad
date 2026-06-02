"""
MLX-based essay revision classifier.

MODEL_ID  – change this one line to swap the local model.
  Current: mlx-community/Qwen3-8B-4bit (~5 GB RAM, 4-bit, Apple Silicon native)
  This is the closest published mlx-community build to the requested "Qwen 3.5 9B 4-bit".
  If Qwen released a 9B variant after this was written, update MODEL_ID accordingly.

Pull command (run once before first launch):
    python -m mlx_lm.convert --hf-path Qwen/Qwen3-8B --mlx-path ~/.cache/mlx/Qwen3-8B-4bit -q
  OR let mlx_lm.load() auto-download from Hub:
    python -c "from mlx_lm import load; load('mlx-community/Qwen3-8B-4bit')"

The model is loaded once on startup in a background thread and reused for all calls.
"""

import json
import logging
import threading
from typing import Callable, Optional

logger = logging.getLogger(__name__)

# ── Model selection ────────────────────────────────────────────────────────────
MODEL_ID = "mlx-community/Qwen3-8B-4bit"
# ──────────────────────────────────────────────────────────────────────────────

# ── Classification prompt ──────────────────────────────────────────────────────
# Tight JSON-only prompt.  /no_think suppresses Qwen3's chain-of-thought.
# Categories:
#   surface      – mechanics, spelling, punctuation, word swaps with no meaning change
#   developmental – added/strengthened evidence, reasoning, or explanation
#   structural   – reordered or reorganised content
_SYSTEM = "/no_think You are a writing-development analyst. Return ONLY valid JSON. No preamble, no markdown fences, no explanation."

_USER_TEMPLATE = """\
Classify each revision change below as exactly one of:
  surface       – mechanics, spelling, punctuation, word swaps with no meaning change
  developmental – added or strengthened evidence, reasoning, or explanation
  structural    – reordered or reorganised content; paragraph or argument order changed

Return ONLY a JSON array. Each element: {{"change_id": <int>, "type": "<surface|developmental|structural>", "reason": "<one sentence>"}}

Changes:
{changes_json}"""
# ──────────────────────────────────────────────────────────────────────────────

VALID_TYPES = {"surface", "developmental", "structural"}
MAX_CHANGES_PER_CALL = 30
MAX_CHARS_PER_CHANGE = 600


class ClassificationModel:
    _instance: Optional["ClassificationModel"] = None
    _lock = threading.Lock()

    def __init__(self):
        self._model = None
        self._tokenizer = None
        self.ready = False
        self.loading = False
        self.error: Optional[str] = None

    @classmethod
    def get(cls) -> "ClassificationModel":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def load_async(
        self,
        on_ready: Optional[Callable] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ) -> None:
        if self.ready or self.loading:
            return
        self.loading = True

        def _worker():
            try:
                from mlx_lm import load as mlx_load  # noqa: PLC0415
                self._model, self._tokenizer = mlx_load(MODEL_ID)
                self.ready = True
                logger.info("MLX model loaded: %s", MODEL_ID)
                if on_ready:
                    on_ready()
            except Exception as exc:
                self.error = str(exc)
                logger.error("MLX model load failed: %s", exc)
                if on_error:
                    on_error(str(exc))
            finally:
                self.loading = False

        threading.Thread(target=_worker, daemon=True).start()

    def classify(self, changes: list[dict]) -> list[dict]:
        """
        changes: list of dicts with keys change_id, diff_type, original_text, new_text
        Returns: list of dicts with keys change_id, type, reason
        Falls back to [] (never raises) so raw diff always shows even if AI fails.
        """
        if not self.ready or not changes:
            return []

        trimmed = [
            {
                "change_id": c["change_id"],
                "diff_type": c["diff_type"],
                "original_text": (c.get("original_text") or "")[:MAX_CHARS_PER_CHANGE],
                "new_text": (c.get("new_text") or "")[:MAX_CHARS_PER_CHANGE],
            }
            for c in changes[:MAX_CHANGES_PER_CALL]
        ]

        prompt = self._build_prompt(trimmed)
        try:
            from mlx_lm import generate  # noqa: PLC0415
            response = generate(
                self._model,
                self._tokenizer,
                prompt=prompt,
                max_tokens=2048,
                verbose=False,
            )
            return _parse(response)
        except Exception as exc:
            logger.error("Classification inference failed: %s", exc)
            return []

    def _build_prompt(self, trimmed: list[dict]) -> str:
        changes_json = json.dumps(trimmed, indent=2)
        user_msg = _USER_TEMPLATE.format(changes_json=changes_json)
        tok = self._tokenizer
        if hasattr(tok, "apply_chat_template"):
            msgs = [
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": user_msg},
            ]
            return tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        return f"{_SYSTEM}\n\n{user_msg}"


def _parse(response: str) -> list[dict]:
    text = response.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        inner = [l for l in lines[1:] if l.strip() != "```"]
        text = "\n".join(inner)
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end < 0:
        logger.warning("No JSON array in model response: %.200s", text)
        return []
    try:
        raw = json.loads(text[start : end + 1])
        if not isinstance(raw, list):
            return []
        out = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            t = str(item.get("type", "")).lower().strip()
            if t not in VALID_TYPES:
                t = "surface"
            out.append({
                "change_id": int(item.get("change_id", 0)),
                "type": t,
                "reason": str(item.get("reason", ""))[:300],
            })
        return out
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("JSON parse error: %s | response: %.300s", exc, text)
        return []
