# Writing Analyzer

macOS desktop app for tracking student essay revisions and writing development over time.
Runs fully offline after initial model download. Built with Python + Flet + MLX.

---

## Requirements

- macOS (Apple Silicon — M1/M2/M3/M4)
- Python 3.11+
- ~6 GB free disk space for the model
- ~5–6 GB free RAM when the model is loaded (shared with the rest of your system)

---

## Setup

```bash
# 1. Clone / copy the project folder, then:
cd "Writing analyzer"

# 2. Create a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Pull the MLX model (one-time, ~4.5 GB download)
python -c "from mlx_lm import load; load('mlx-community/Qwen3-8B-4bit')"
#
# The model is cached in ~/.cache/huggingface/hub/
# To use a different model, edit the MODEL_ID constant at the top of classifier.py.
```

---

## Run

```bash
source .venv/bin/activate   # if not already active
python app.py
```

The app window opens. The AI model loads in the background (30–60 s on first run,
faster afterwards). The diff view is available immediately; classification appears
once the model is ready.

---

## Data

Student names, submissions, and classification results are stored in:

```
~/.writing_analyzer/db.sqlite3
```

The roster is pre-seeded on first launch:

| Class    | Students |
|----------|----------|
| EAP 1    | 9        |
| EAP 2    | 11       |
| EAP 3    | 22       |
| AP Lang  | 8        |

Click the pencil icon next to any student name to rename them.

---

## Bundle to a clickable .app (PyInstaller)

```bash
pip install pyinstaller

pyinstaller \
  --name "Writing Analyzer" \
  --windowed \
  --onedir \
  --add-data ".venv/lib/python*/site-packages/flet:flet" \
  --hidden-import pypdf \
  --hidden-import docx \
  --hidden-import mlx \
  --hidden-import mlx_lm \
  app.py
```

The `.app` bundle appears in `dist/Writing Analyzer.app`.
Drag it to `/Applications` or double-click from `dist/`.

> **Note:** The first launch after bundling will still need the model cached in
> `~/.cache/huggingface/hub/` — the model is not embedded in the .app because it
> is ~4.5 GB. Run the pull command from Setup step 4 on the target machine if needed.

---

## Swapping the model

Open `classifier.py` and change the one-line constant:

```python
MODEL_ID = "mlx-community/Qwen3-8B-4bit"   # ← change this
```

Any `mlx-community/*` model on HuggingFace or a local path works here.

---

## Architecture notes (v2 hooks)

The data model is ready for v2 features without schema changes:

- `students.voice_profile` (BLOB, NULL in v1) — will store a serialised embedding
  computed from `type_tag = 'baseline'` submissions only, for voice-divergence scoring.
- `submissions.classification_results` stores structured JSON per-comparison,
  so IDEAS-tagging output (thesis + paragraph-level Identify/Define/Explain/Apply)
  can be added as an additional key in that JSON without a schema migration.

---

## Key files to tweak

| File | What to change |
|------|---------------|
| `classifier.py` top | `MODEL_ID` — swap the local model |
| `classifier.py` `_USER_TEMPLATE` | Classification prompt — adjust category definitions |
| `database.py` `CREATE_SQL` | SQLite schema — add columns for v2 features |
| `database.py` `INITIAL_CLASSES` | Pre-seeded roster |
