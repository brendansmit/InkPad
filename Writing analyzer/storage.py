"""
Plain-text submission file storage.

Saved at:
  ~/.writing_analyzer/submissions/{Class}/{Student}/{Assignment}/v{N}.txt

Versions are numbered automatically by counting existing files in the folder.
The SQLite record stores the returned path for external access / backup.
"""

import re
from pathlib import Path

SUBMISSIONS_DIR = Path.home() / ".writing_analyzer" / "submissions"


def _safe(name: str) -> str:
    """Sanitise a name for use as a directory component."""
    name = name.strip()
    name = re.sub(r"[^\w\s\-]", "", name)
    name = re.sub(r"\s+", "_", name)
    return name or "unnamed"


def save_text(
    class_name: str,
    student_name: str,
    assignment_name: str,
    text: str,
) -> Path:
    """Write text to the next versioned file and return its path."""
    folder = (
        SUBMISSIONS_DIR
        / _safe(class_name)
        / _safe(student_name)
        / _safe(assignment_name)
    )
    folder.mkdir(parents=True, exist_ok=True)
    version = len(list(folder.glob("v*.txt"))) + 1
    path = folder / f"v{version}.txt"
    path.write_text(text, encoding="utf-8")
    return path


def read_text(path: str | Path) -> str | None:
    """Read a stored text file. Returns None if missing."""
    try:
        return Path(path).read_text(encoding="utf-8")
    except (FileNotFoundError, OSError):
        return None
