"""
Text extraction from .pdf and .docx files.
Raises ExtractionError with a human-readable message instead of crashing.
"""

import re
from pathlib import Path


class ExtractionError(Exception):
    pass


def extract_text(path: str | Path) -> str:
    p = Path(path)
    ext = p.suffix.lower()
    if ext == ".pdf":
        return _pdf(p)
    if ext in (".docx", ".doc"):
        return _docx(p)
    raise ExtractionError(
        f"Unsupported file type '{ext}'. Only .pdf and .docx files are accepted."
    )


def _pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        raise ExtractionError("pypdf not installed — run: pip install pypdf")

    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(pages).strip()
    if not text:
        raise ExtractionError(
            f"No extractable text in '{path.name}'.\n"
            "The PDF may be scanned or image-based. Please use a text-selectable PDF."
        )
    return _clean(text)


def _docx(path: Path) -> str:
    try:
        from docx import Document
    except ImportError:
        raise ExtractionError("python-docx not installed — run: pip install python-docx")

    doc = Document(str(path))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    text = "\n".join(paragraphs).strip()
    if not text:
        raise ExtractionError(
            f"No extractable text in '{path.name}'.\n"
            "The document appears to be empty or contains only images."
        )
    return _clean(text)


def _clean(text: str) -> str:
    text = text.replace("\xa0", " ").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
