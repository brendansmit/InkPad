"""
Lightweight persistent settings — stored in ~/.writing_analyzer/settings.json.
Used for things like "last folder opened" that should survive app restarts.
"""

import json
from pathlib import Path

_PATH = Path.home() / ".writing_analyzer" / "settings.json"


def load() -> dict:
    try:
        return json.loads(_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save(data: dict) -> None:
    _PATH.parent.mkdir(parents=True, exist_ok=True)
    _PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get(key: str, default=None):
    return load().get(key, default)


def set(key: str, value) -> None:
    data = load()
    data[key] = value
    save(data)
