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

---

## 2026-06-14 — Skeuomorphic screen mockups

**Asked:** Pasted the Writing Analyzer design system (base SaaS tokens plus neu/flat/skeuo variants) and asked me to render the three screens with `class="theme-skeuo"` on the body, using `.card` for paper panels, `.card--dark` for the leather binder, `.card--ruled` for the marking surface. On the clarifying question the answer was "all 3", delivered as a saved .html only.

**Did:**
- Pulled the real literacy codes and colour groups from `coder.py` (`LITERACY_CODES`) so the marking mockup uses true codes: Sp/Caps/WW = surface (amber), Gra/VT/RO = grammar (maroon), P/FOR/Embed = format (blue), ✓ = good (green).
- Wrote one self-contained file `mockups/skeuo_screens.html`: full base design system plus the skeuo theme inlined, body set to `theme-skeuo`, Inter from Google Fonts.
- Rendered all five app screens (the 5 nav tabs) so "all 3" is fully covered: 1 Roster, 2 Student detail (leather binder card with stitching, target/strength tags, carved progress bars incl. one green `bar__fill--green`), 3 Literacy coder marking (`.card--ruled` essay with embossed code chips and coloured underlines), 4 Upload, 5 Compare drafts.
- Added a `bar__fill--green` modifier in the skeuo block for positive trend bars (only the maroon fill existed).
- Mockup-only scaffolding (window chrome, page background) kept clearly separate from the design-system classes.

**Verified:** Served via new `wa-mockups` launch config (python http.server on 3461). Screenshotted Roster, Student detail and Marking screens at desktop width. Felt desk, paper sheen, raised buttons, pressed nav pill, gold dashed binder stitching, ruled margin line and embossed chips all render. No console errors. Server stopped after.

**Notes/decisions:**
- Interpreted "all 3" as "render the whole app in skeuo" rather than one of the three option sets, since the screens map cleanly onto the 5 existing nav tabs.
- This is a static HTML design exploration, not wired into the Flet app. Translating chosen styling back into Flet is a separate task.
- Added `wa-mockups` entry to `.claude/launch.json`.

### 2026-06-14 (follow-up) — Four-theme switcher

Added a fixed pill switcher to `mockups/skeuo_screens.html` flipping the body between Soft SaaS (default, no class), Neumorphism (`theme-neu`), Flat (`theme-flat`) and Skeuomorphic (`theme-skeuo`). Made the page chrome (title, subtitle, screen tab chips) theme-aware so it reads correctly on both the light desk and the dark felt; subtitle updates with the active theme name. Verified all four render with no console errors. Pure CSS class swap, no design-system tokens changed.

### 2026-06-14 (follow-up 2) — Differentiated the Flat theme

Flat and Soft SaaS were nearly identical (shadow depth only). Gave `theme-flat` a real graphic identity in `mockups/skeuo_screens.html`: tighter geometric radii (xl 22px to 10px), crisp 1.5px borders on cards/buttons/inputs/avatars, deeper desk bg so white panels pop, outlined tags and code chips, secondary buttons as tinted blocks, bordered segmented nav with active pill in brand green (not black), and square-ended flat progress meters. Verified, no console errors. Tokens for other themes untouched.

### 2026-06-14 (follow-up 3) — 5th theme: Frosted (SaaS + glassmorphism)

Added a fifth switcher option `theme-glass` to `mockups/skeuo_screens.html`: keeps the SaaS geometry/radii but makes panels translucent frosted glass (backdrop-filter blur+saturate) floating over a soft brand-tinted aurora desk (green/blue/maroon radial gradients). Leather binder becomes a smoky deep-green glass card. Picked glass as the complement because it shares SaaS DNA (light, soft, layered) while adding depth.
- Gotcha fixed: `background-attachment: fixed` + `backdrop-filter` breaks compositing. Moved the aurora to a `position:fixed` `::before` layer behind everything instead.
- Headless preview screenshot tool renders backdrop-filter panels blank after a scroll; verified styles via computed style + a scroll-0 capture (hid screen 1 to bring screen 2 to top). Real browsers are fine.
Verified, no console errors. Switcher now offers 5: Soft SaaS, Frosted, Neumorphism, Flat, Skeuomorphic.

### 2026-06-14 (follow-up 4) — Two more themes: Brutalist + Editorial

User found the first 5 too samey (all soft/modern). Added two that break direction, in `mockups/skeuo_screens.html`:
- `theme-brutal` (Brutalist): butter desk, 2.5px ink borders everywhere, hard offset shadows (no blur), zero radius, saturated colour blocks, heavy 700/800 type, maroon active tab, green primary with black border. Translate-on-press button.
- `theme-editorial` (Editorial): full serif (Source Serif 4, loaded via Google Fonts), underlined ruled tab bar with maroon active underline, hairline-bordered cards, small-caps outlined tags, restrained maroon accent, cream avatars. Reads like a literary journal; best thematic fit for an essay tool.
Loaded Inter 700/800 and Source Serif 4 in the font link. Switcher now has 7 options (width ~652px, still fits centered). Verified both across roster/student/marking screens, no console errors.

### 2026-06-14 (follow-up 5) — Four more themes: Midnight, Claymorphism, Material, Swiss

Added 4 distinct directions to `mockups/skeuo_screens.html` (switcher now 11 options, wraps to 2 rows; bumped page padding-top and made .switcher flex-wrap with max-width):
- `theme-dark` (Midnight): explicit dark UI (near-black green-tinted ground, dark surfaces), green active pill, glowing green primary, dark-50 tag variants. Not media-query based.
- `theme-clay` (Claymorphism): puffy inflated 3D, lilac ground, big radii (30px cards), double shadow (outer drop + inner highlight) + inset; pillowy nav/inputs. Distinct from neumorphism (more rounded, coloured ground, puffier).
- `theme-material` (Material): grey ground, crisp elevation shadows, uppercase tracked buttons, underline tab indicator, tonal chips, filled-with-bottom-border inputs.
- `theme-swiss` (Swiss/International Typographic): pure white, 1px black hairline grid, uppercase bold headings, single red accent (#E2342B) on nav/primary/figures, square black avatars, zero radius, no shadows. Note: deviates from the green/maroon/blue palette by design (red is the Swiss signature).
Verified all four across the roster screen, no console errors. Total styles available: 11.

### 2026-06-14 (follow-up 6) — Four paradigm-break themes: Sketch, Terminal, Comic, Vaporwave

User found the 11 too samey (all "card + surface treatment"). Added 4 that abandon the card model in `mockups/skeuo_screens.html`:
- `theme-sketch`: hand-drawn exercise book. Handwriting fonts (Caveat display, Patrick Hand body), dotted-grid paper bg, uneven asymmetric border-radius to fake wobbly hand-drawn lines without distorting text, marker-highlight active tab, dashed rows, hatch-fill progress bars.
- `theme-terminal`: monospace TUI. Dark green-on-black, `[ bracketed ]` buttons via ::before/::after, inverted active tab, segmented (repeating-gradient) meters, fixed scanline overlay (::before z-index 40, pointer-events none).
- `theme-comic`: pop-art. Yellow halftone-dot bg (radial-gradient), Bangers display + stat numbers, 3px ink outlines + hard offset shadows, blue/maroon action fills. Differs from brutalist via comic font + halftone + rounded corners + coloured fills.
- `theme-vapor`: synthwave. Purple perspective grid + pink glow bg, neon-glow text-shadow headings, pink/cyan gradient pills/buttons/avatars, translucent cards, per-variant neon tag colours.
Loaded Caveat, Patrick Hand, Bangers. Switcher now 15 options; shrank switcher buttons (fs-xs, tighter padding) and bumped page padding-top to 156px so the wrapped 2-3 row switcher never overlaps the title. Switcher labels inherit each theme's --font (charming side effect). Verified all 4 across screens, no console errors. Total styles: 15.

NB: this file is now a 15-style museum. Recommended trimming to a shortlist next.

### 2026-06-14 (follow-up 7) — Five more themes + packaged file

Added 5 more paradigm-distinct themes to the mockup (total now 20):
- `theme-deco` (Art Deco): emerald ground, Poiret One gold display type, double gold-frame cards (inset box-shadow), gold uppercase controls, sharp corners.
- `theme-cyber` (Cyberpunk): near-black grid + cyan glow, clip-path notched HUD corners on cards/buttons/avatars, neon cyan accents, warning-yellow section tag, neon status chips.
- `theme-bauhaus` (Bauhaus): off-white, primary red/yellow/blue colour-blocking (nth-child top bars on the 3 stat cards), red active pill, blue primary, yellow circular avatars, heavy uppercase.
- `theme-botanical` (Botanical): sage-cream, serif headings, organic asymmetric blob border-radius, terracotta accent, calm.
- `theme-riso` (Risograph): grainy paper, two spot inks (fluoro pink + blue), offset misregistration (text-shadow + offset box-shadow), flat fills.
Loaded Poiret One. Bumped page padding-top to 224px (switcher now 3 rows / 20 buttons). Verified all 5 across roster screen, no console errors.
Packaged a clean-named copy: `mockups/writing_analyzer_themes.html` (81K, self-contained, 20 themes). Original `skeuo_screens.html` kept.

### 2026-06-15 — Structural layouts (not skins)

User's blunt and correct critique: all 20 themes were the identical skeleton (window bar + top nav pills + 3 stat cards + list) with only paint changed. Asked for genuinely different core looks. Offered 4 structural layouts; user said "I dont know" so I chose.
Built new file `mockups/writing_analyzer_layouts.html` — ONE calm neutral style across all three so the comparison is STRUCTURE not paint. Layout switcher + live JS:
1. Gradebook table: left sidebar nav rail + dense sortable table (avatars, error-rate meters, SVG sparkline trends, code chips, trend arrows). Scan-whole-class IA.
2. Master-detail split: 64px icon rail + 300px student list (status dots) + wide detail pane; clicking a student re-renders detail in place (data-driven, 4 students). No page nav.
3. Draft timeline: single-student, drafts-over-time horizontal track (D1-D6 nodes, falling error counts, progress line) + two-draft compare panes (marked essay text). Document-centric.
Added `wa-layouts` launch config (port 3462). Verified all three + interactions, no console errors.
NB: these are the real answer to the "all the same" complaint. Theme skins (writing_analyzer_themes.html, 20 styles) are separate and orthogonal — a chosen layout can wear any chosen skin.

### 2026-06-15 (follow-up) — Component kit for mix & match

User wants to frankenstein a design from individual parts rather than pick a whole theme/layout. Built `mockups/writing_analyzer_kit.html`: a labelled component catalogue in ONE neutral style (compare pattern not paint). 9 categories, 43 variants, each with a mono label badge so the user can specify a combo (e.g. "N2 + C5 + L3 + S4 + T1 + B1 + P3 + A4 + M1"):
- Navigation N1-N5 (top pills / left sidebar / icon rail / underline / segmented)
- Card C1-C5 (soft / flat / hairline-serif / hard-offset / accent-bar)
- List item L1-L5 (card row / table row / mail two-line+dot / kanban / grid tile)
- Stat S1-S5 (big card / inline / sparkline / meter+delta / pill)
- Tag T1-T5 (soft / outline / dot / small-caps / square)
- Button B1-B5 (solid+outline / pill / uppercase / mono bracket / hard)
- Progress P1-P5 (bar / bar+delta / sparkline / segmented / ring)
- Avatar A1-A5 (circle / square / blob / ring / presence dot)
- Marked text M1-M3 (underline+superscript / highlight+chip / numbered margin notes)
Verified all 43 variants laid out (DOM sweep, none collapsed), no console errors. Note: preview screenshot tool flaked on scrolled captures again (returns blank after scroll) — verified via getBoundingClientRect instead.
Mental model established with user: layout (structure) and paint (theme) are separate axes; kit lets them pick at component granularity. Next step: user gives a combo, I assemble real screens.

### 2026-06-15 (follow-up 2) — Kit expanded with interactive elements

User liked the kit, asked for more elements incl. popouts and hover effects. Extended `mockups/writing_analyzer_kit.html` with an "Interactive & overlays" section (now 27 categories total). New, all working via vanilla JS:
- Hover H1-H6 (lift / border / tint / scale / reveal-actions / animated underline)
- Popouts PO1-PO4 (centre modal / slide-over drawer / confirm dialog / anchored popover)
- Dropdown DD1-DD3 (kebab actions / select / multi-select filter)
- Tooltip TIP1-3, Toast TST1-3 (success/error/action), Context menu CTX1 (right-click)
- Form controls FC1-5 (switch / checkbox / radio / range / stepper)
- Search SR1-2, Empty EM1-2, Loading LD1-3 (spinner/skeleton/top-bar), Pagination PG1-2
- Accordion AC1, Badge BG1-3, Steps ST1, Avatar stack AS1, Breadcrumb BC1, Command palette CM1
Verified interactions programmatically (modal open/close, drawer, menu toggle+outside-close, toast, switch, stepper, accordion, context menu) and a modal screenshot. No console errors.

## 2026-06-15 — Kit: standard components (resumed after API overload)
Asked: add the standard app components I'd under-covered (banners, batch progress, bottom sheet, form fields, content tabs, upload/dropzone, filter+sort bar, calendar/due dates, photo+masked avatars, all-caught-up empty state).
The previous turn crashed mid-edit on API Overload. Styles and several markup blocks had landed (banner/dropzone/sheet/calendar CSS, A6/A7 photo+masked avatars, EM3 all-caught-up, LD4 batch progress, PG3 queue), but the final markup blocks + bottom-sheet element + two JS handlers had not. Resumed and finished:
- Added markup blocks: Banner BN1-3 (success/alert/sync), Form fields FF1-5 (text/search/select/textarea/inset well), Content tabs CT1-3 (underline/pill/boxed), Upload UP1-3 (dropzone/button/paste), Filter+sort bar FS1-2, Calendar CL1-3 (month+due dot / week strip / agenda)
- Added bottom-sheet overlay element (back-s1) wired to PO5
- Added JS: data-sheet open/close, data-queue prev/next counter, content-tab switching, dropzone hover state, week-strip selection
Verified in preview (writing_analyzer_kit.html via wa-mockups :3461): all blocks present (3 banners, 5 fields, 3 ctab sets, dropzone, 2 fsbars, 3 calendar variants), sheet opens, queue advanced 3→5, content tab switches. No console errors. Not committed (no request to).

## 2026-06-15 — Assembled example app from kit parts
Asked: build a fleshed-out example wiring a named subset of kit parts into real screens (N2, C1, L1, S1/S3/S5, T1+T2 combined, B1, P2/P3, A5, M1 with words highlighted to error-code colour, M1+M3 combined, H1-4/H6, PO1-5, DD1-3, TIP1-3, TST1-3, FC1-5, SR1-2, EM1-3, LD3/LD4, PG1, BG2, ST1, BC1, CM1, BN1-3, FF1-5, CT2, UP1, FS1+FS2 combined, CL3).
Built new file writing_analyzer_app.html (self-contained, neutral palette from kit tokens). N2 sidebar shell with BG2 count badges + A5 presence-dot avatar, BC1 breadcrumb, CM1 ⌘K palette. Five screens:
- Roster: BN1-3 banners, S1+S3+S5 stat row, FS1+FS2 combined bar (search+chips+sort popover), L1 card rows (data-driven, 5 students) with T1+T2 combined chips, alternating P2 bar / P3 sparkline trend, B1 Mark button, DD1 kebab menu, H1 row lift, PG1 pager, plus an H1-4/H6 hover demo strip. Row click opens PO2 drawer.
- Upload: ST1 steps, UP1 dropzone, EM1 empty, FF1-5 fields, FC1-5 controls, LD3+LD4 loading (run button animates batch progress to 100% then toast).
- Mark: CT2 pill tabs, M1+M3 combined marked essay — each error word highlighted in its code colour (su/gr/fo/go) with superscript code + numbered marker, colour-matched numbered margin notes; clicking a word scrolls+outlines its note. PO5 sheet, PO3 confirm, PO4 legend popover, TIP, TST.
- Codes: T1/T2 chip reference + EM3.
- Calendar: CL3 agenda.
PO1 modal, DD2/3 (select/multi via popover+mchk), TIP1-3, TST1-3 all wired. ⌘K + Esc keyboard handling.
Verified in preview (:3461): 5 rows, screen switching, word→note linking (note 3 outlined), palette opens, drawer opens with correct student, 3 banners, 9 notes, both trend styles render. No console errors. Screenshotted Roster + Mark. Not committed (no request to).

---
2026-06-23 — Grade-importer launcher fix

User asked why grade-importer wasn't opening via the launcher despite starting manually in 3 seconds.

Root cause: `launcher_server.py` runs with `use_reloader=True`. Werkzeug's reloader sets `WERKZEUG_RUN_MAIN=true` in its own environment. `_bg()` did `{**os.environ}` which copied that flag into every child process. Any child using Flask saw `WERKZEUG_RUN_MAIN=true` and behaved as a reloader child (skipped binding its port), so the server never came up.

Fix: one line in `launcher/launcher_server.py` — `merged.pop('WERKZEUG_RUN_MAIN', None)` before the `Popen` call.

Verified: `curl -s http://localhost:5099/launch/grade-importer` → `{"ok":true}`.

---
2026-06-23 — Fix convert 400 error

"Provider returned error" on convert. Cause: `response_format: { type: 'json_object' }` was passed to Kimi K2 (spec mode conversion model) which doesn't support that parameter. Removed `response_format` entirely from the `/convert` request; also dropped `max_tokens` from 32000 to 8000. `extractJson` already handles plain JSON in model output.

---
2026-06-23 — Prototype Coder: three output quality fixes

Reviewed latest "To Spec" build output (AP_Lang_Reference_Dashboard).

1. **Spec mode ignored**: BUILD_RECEIPT showed only deepseek/deepseek-chat. Root cause: plan JSON returned by conversion model included explicit model fields in `defaults` which overwrote SPEC_DEFAULTS in the merge. Fix: strip generator/fastGenerator/hardGenerator/reviewer/repairer from plan defaults before merging in runner.js.

2. **stripFences missing preamble**: server.js had "Here's the complete server.js file:\n\n```javascript" — regex only stripped fences at position 0. Fix: find first ``` anywhere, extract between its newline and the closing ```.

3. **response_format on reviewer**: same 400-risk as convert — removed `response_format: { type: 'json_object' }` from reviewFile call; extractJson handles bare JSON.
