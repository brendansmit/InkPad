# Writing Analyzer — Session Notes
Last updated: 2026-05-31

---

## Project Location
`/Users/brendansmit/Documents/Claude/Writing analyzer/`

## How to Run
```bash
cd "/Users/brendansmit/Documents/Claude/Writing analyzer"
source .venv/bin/activate
export SSL_CERT_FILE=$(python -c "import certifi; print(certifi.where())" 2>/dev/null)
python app.py
```
Or double-click `Launch Writing Analyzer.command` (run `chmod +x` on it first if needed).

---

## Stack
- **GUI**: Flet 0.24.1 (pinned — 0.85.x has breaking API changes)
- **Database**: SQLite at `~/.writing_analyzer/db.sqlite3`
- **AI inference**: MLX-LM — `mlx-community/Qwen3-8B-4bit` (~5 GB RAM)
- **Model constant**: top of `classifier.py` → `MODEL_ID`
- **Python**: 3.12.1 (python.org install, not Homebrew)

---

## Files
| File | Purpose |
|------|---------|
| `app.py` | Main Flet GUI (~1800 lines) |
| `database.py` | SQLite schema + all CRUD |
| `classifier.py` | MLX model singleton, diff classification |
| `coder.py` | Literacy code annotator (latest rewrite) |
| `diff_engine.py` | Word-level diff engine |
| `text_extraction.py` | PDF + DOCX text extraction |
| `storage.py` | Plain-text file storage under `~/.writing_analyzer/submissions/` |
| `settings.py` | Persistent user settings (last folder opened, etc.) |

---

## Nav Tabs (in order)
1. **Roster** — classes, students, rename/add/delete/move students
2. **Upload** — upload PDF/DOCX submission, assign to student/assignment
3. **Compare** — side-by-side diff + MLX classification (surface/developmental/structural)
4. **Assignments** — assignment CRUD, see all submissions per assignment
5. **Code** — Literacy Code Annotator (see below)

---

## Literacy Code Annotator — Current State

### What it does
- Upload one or many DOCX/PDF essays → processes them paragraph by paragraph
- Each paragraph: AI returns `{"sentence": ..., "quote": ..., "code": ...}` JSON
- Verified verbatim before applying — anything not found is dropped
- Outputs `~/.writing_analyzer/coded/[name] coded.docx`
- Persistent job queue (survives restarts), per-job Save As button turns green after download

### Color scheme (matches teacher examples)
| Color | Hex | Codes |
|-------|-----|-------|
| Orange | `#E67E22` | Sp, Caps, ^, WW, AA/Adj, Rep |
| Red | `#C0392B` | Gra, VT, V, WO, del, inc, RO, STR, Exp (error) |
| Blue | `#2980B9` | P, FOR, //, Embed |
| Green | `#27AE60` | ✓ (positive only) |

### Architecture (latest — `coder.py` rewrite)
Key design from `code_essay.py` the user provided:
- Model returns sentence anchor + quote + code (not just quote + code)
- `_locate()` is whitespace-tolerant, uses `(?<!\w)` word boundaries
- `_find_quote_span()` scopes search to sentence first, falls back to paragraph
- **Non-destructive insertion**: runs are split surgically at span boundaries, NOT rebuilt from scratch — preserves original DOCX formatting
- Tags inserted right-to-left so offsets stay valid
- `temp=0.0` removed (not supported by installed mlx_lm version — generate signature is `model, tokenizer, prompt, verbose, **kwargs`)

### Known remaining issues / next steps
1. **`temp=0.0` not supported** — was removed because installed mlx_lm's `generate()` only accepts `model, tokenizer, prompt, verbose, kwargs`. Consider using `**{"temperature": 0}` if mlx_lm accepts it via kwargs.
2. **Folder memory (last open/save folder)** — code is written in `settings.py` and wired into all pickers with `initial_directory=app_settings.get("last_upload_dir")`. NOT YET CONFIRMED WORKING — the `temp=0.0` error was crashing the coder before this could be tested. Needs verification after the temp fix.
3. **AI accuracy** — improved significantly with sentence-anchor prompt but still not perfect. Teacher needs to review output. "Exp" as a positive marker (`✓`) is excluded from auto-coding by design — it's a teacher judgement.
4. **Positive markers** — currently only `✓` is green/positive. In the original `code_essay.py` the positive markers were intentionally excluded from auto-coding. Teacher adds these manually.

---

## Database Schema (key tables)

```sql
classes (id, name)
students (id, class_id, name, slot_number, voice_profile)  -- voice_profile NULL = v2
assignments (id, name, class_id)
submissions (id, student_id, assignment_id, filename, text, upload_date, 
             type_tag CHECK('baseline'|'regular'), classification_results, text_path)
coder_jobs (id, original_filename, source_path, output_path, created_at,
            status CHECK('queued'|'processing'|'done'|'error'),
            annotation_count, downloaded, error_msg)
```

Pre-seeded: EAP1/9, EAP2/11, EAP3/22, AP Lang/8

---

## v2 Hooks (not built)
- `students.voice_profile BLOB` — baseline-derived voice embedding
- `submissions.classification_results JSON` — can absorb IDEAS tags as extra key
- Divergence view comparing against baseline voice profile

---

## Known Flet 0.24.1 API Quirks
- `ft.Colors.` → must be `ft.colors.` (lowercase)
- `ft.Icons.` → must be `ft.icons.` (lowercase)
- `ft.app(target=main)` not `ft.run(main)`
- `ft.border.all()` removed → use `_border(width, color)` helper in app.py
- `page.window.width` → must be `page.window_width`
- `ft.FilePicker(on_result=handler)` — `on_result` IS valid in 0.24.1
- `page.snack_bar = ft.SnackBar(...)` deprecated but works
- `page.dialog = dialog; dialog.open = True` for dialogs

---

## Outstanding TODO (from last session)
- [ ] Verify folder memory actually works after temp fix
- [ ] Test `temp` via kwargs: `generate(model, tok, prompt=p, verbose=False, **{"temperature": 0.0})`
- [ ] Run accuracy test on Emily/Elle/Isabella essays with latest coder.py
- [ ] Fix window property deprecation warnings (low priority)
