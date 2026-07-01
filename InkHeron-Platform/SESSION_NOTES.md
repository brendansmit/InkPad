# SESSION_NOTES.md — InkHeron Platform

**Rule (every session must honour this):** Keep this file under ~400 lines. When it grows
past that, move the OLDEST entries into `SESSION_NOTES_ARCHIVE.md` and keep only recent
sessions here. NEVER load the archive into context; grep it only when a specific past
decision needs checking.

**How to log:** newest entry at the TOP. One block per working session. Keep entries tight —
decisions and outcomes, not narration.

Entry format:
```
## YYYY-MM-DD — <short title>
- Phase/Step worked: 
- Built: 
- Decisions: 
- Open / next: 
- Gotchas hit: 
```

---

## 2026-07-01 - Make native writer zoom visual-only
- Asked: Limit native writer zoom to 80-125% and ensure zoom never changes the actual font size or text positioning.
- Built: Replaced browser `zoom` with transform-based visual scaling inside a sizing frame, capped stored and slider zoom at 125% and refreshed the frame as line count/page height changes.
- Verified: `node --check src/views/nativeWrite.js` and full `test/nativePads.test.js` passed 10/10. Deployed `src/views/nativeWrite.js`, restarted wrapper and public `/` returned 200.
- Decision: Zoom is now a viewport-only aid. Formatting and saved document HTML remain controlled by the actual editor commands, not the zoom slider.

## 2026-07-01 - Refine native toolbar and line-number gutter
- Asked: Keep the left-panel clear button as text, improve the standard-style toolbar icons and remove the coloured line-number gutter.
- Built: Restored `Clear` text in the task/reference marking toolbar, replaced indent/outdent with cleaner arrow-and-line CSS icons and removed the boxed background from line numbers.
- Verified: `node --check src/views/nativeWrite.js` and full `test/nativePads.test.js` passed 10/10. Deployed `src/views/nativeWrite.js`, restarted wrapper and public `/` plus `/assets/styles.css` returned 200.
- Decision: Line numbers now sit on transparent background so the writing page is the only framed surface.

## 2026-07-01 - Replace ugly toolbar SVGs and fix line numbers
- Asked: Replace bad-looking custom toolbar SVGs with standard symbols and fix the line-number gutter.
- Built: Removed SVG toolbar icons, replaced them with simpler standard glyph/CSS icons for undo/redo, lists, indent/outdent and alignment; narrowed the line-number gutter.
- Fixed: Line numbers now render only for actual text lines instead of forcing 30 rows and making the page look over-extended.
- Verified: Full `test/nativePads.test.js` passed 10/10. Deployed `src/views/nativeWrite.js`, restarted wrapper and public health returned 200.

## 2026-07-01 - Improve native writer toolbar icons
- Asked: Replace text-heavy toolbar controls with standard symbols and hide colour grids until clicked.
- Built: Added inline SVG toolbar icons for undo/redo, lists, indent/outdent, alignment, text colour, highlight and eraser; changed text/highlight and left-panel highlight controls to click-open palettes.
- Verified: Full `test/nativePads.test.js` passed 10/10. Deployed `src/views/nativeWrite.js`, restarted wrapper and public health returned 200.

## 2026-07-01 - Native writer polish and revision return
- Asked: Build the native writer polish batch and teacher return-for-revision.
- Built: Added fixed A4-style page, sans serif default text, save button, zoom slider, line numbers, font size dropdown, text/highlight colours, undo/redo, indent/outdent, active toolbar state and local task/reference marking.
- Built: Added teacher `return-revision` endpoint and review-page button, separate from green pen, allowing edits after deadline.
- Verified: Full `test/nativePads.test.js` passed 10/10. Deployed writer/routes/review page and public health returned 200.

## 2026-07-01 - Verify Personal Statements import count
- Asked: Check that `Personal Statements Second Draft` has 19 student works.
- Found: Live DB has 19 Etherpad pads and 19 native pads across assignment IDs `3`, `4` and `7`; EAP 1 has 8, EAP 2 has 10 and Audit Class has 1.
- Note: 17 of 19 native pads are non-empty. Empty imported pads are Carina in EAP 2 and Audit in Audit Class.

## 2026-07-01 - Import Etherpad essays to Native InkPad
- Asked: ASAP copy current Etherpad essays into Native InkPad without preserving revision history.
- Built: Added `scripts/import-etherpad-to-native.mjs` with dry-run, `--apply`, no-overwrite default, optional `--overwrite` and assignment-native flipping.
- Verified: Imported live assignments `9`, `8`, `7`, `4` and `3`, creating 21 native pads; tests passed, live counts match and public health returned 200.

## 2026-07-01 - Native writer counters, formatting and resizing
- Asked: Add more formatting options, character and sentence counters, working reader/pad resizing and working zoom.
- Built: Added character and sentence counters, more formatting buttons, persisted simple HTML formatting, draggable reader split, page width controls and zoom controls.
- Verified: Deployed `src/views/nativeWrite.js`, restarted the wrapper, passed syntax/focused native writer checks and live health returned 200.

## 2026-07-01 - Fix native writer horror layout
- Asked: Native writer rendered as a tiny narrow writing strip.
- Fixed: Namespaced native writer CSS and markup, made the reference panel a sane fixed width and forced the writing surface to `width:min(100%,860px)`.
- Deployed: Updated `src/views/nativeWrite.js` on the droplet and restarted `inkheron-wrapper.service`.
- Verified: Syntax check and focused native writer test passed. Public health returned 200 and live logs show `/api/native/pads/1/policy` returning 200 from your browser.

## 2026-07-01 - Fix nginx route for Native InkPad
- Asked: `/native/write/9` showed `Cannot GET /native/write/9` after the native redirect fix.
- Found: Nginx routed `/native/...` to Etherpad on port `9001` because only older wrapper paths were whitelisted for port `3000`.
- Fixed: Updated both live nginx InkPad configs so `/native` and `/static` go to the InkPad wrapper, moved backups out of `sites-enabled`, tested config and reloaded nginx.
- Verified: Public `/native/write/9` now returns wrapper `401 unauthenticated` instead of Etherpad `Cannot GET`, which means logged-in students should reach the native page.

## 2026-07-01 - Fix native assignment opening Etherpad
- Asked: Native assignment still opened Etherpad despite Use Native InkPad being on.
- Fixed: Added a `/write/:assignmentId` guard that redirects native assignments to `/native/write/:assignmentId` before Etherpad pad provisioning; deployed `src/routes/pads.js` and restarted the wrapper.
- Verified: Local direct inject and regression test passed. Live wrapper restarted at 14:06:19 CST, public health returned 200 and logs showed no new missing-table or SQLite 500s.

## 2026-06-30 - Kill EP toolbar flash permanently

- Built: Three-layer suppression. (1) applyOuterCleanup() fires synchronously on iframe load with no delay, so toolbar never renders. (2) MutationObserver on padDoc forces display:none on EP chrome elements the instant EP adds them. (3) aceOuter load listener re-runs inner frame injection when EP reloads ace_outer mid-session, which was the main cause of recurring flashes.
- Commit: 4fa15ee

---

## 2026-06-30 - Fix submit button (Chinese browser blocks confirm())

- Built: Replaced window.confirm() + alert() with double-tap pattern. First click turns button amber and shows "Tap again to confirm" for 3 s; second click submits. Errors show as a fixed toast. Root cause: WeChat and Chinese browsers silently block confirm()/alert().
- Commit: a50d663

---

## 2026-06-30 - Native InkPad revision viewer

- Asked: continue the Native InkPad batch.
- Built: native review page now lets teachers click a revision snapshot, inspect its saved text in the main paper pane, then return to current marked text.
- Verification: native pad tests passed 6/6 and native review inline script parsed.
- Open / next: run final focused suite for the full batch.
- Gotchas hit: kept this as a simple snapshot viewer, not a full scrubber yet.

## 2026-06-30 - Native InkPad range marking tools

- Asked: continue the Native InkPad batch.
- Built: native teacher review page now has range annotation controls for inline comments, literacy-code marks and highlights. Literacy code metadata stores code/category/label.
- Verification: native pad tests passed 6/6 and native review inline script parsed.
- Open / next: native revision viewer affordance.
- Gotchas hit: mapped annotation types to CSS classes explicitly so inline/code/highlight marks render distinctly.

## 2026-06-30 - Native InkPad autosave version guard

- Asked: continue the Native InkPad batch.
- Built: native autosave now accepts `expected_version` and rejects stale saves with `409 version_conflict` plus current pad data. Student editor tracks the saved version and reports conflicts instead of overwriting newer text.
- Verification: native pad tests passed 6/6. `nativePads.js` and `nativeWrite.js` syntax checks passed.
- Open / next: review UI controls for literacy codes and highlights.
- Gotchas hit: an ad-hoc parser command failed because `nativeWrite.js` is an ES module; proper `node --check` passed.

## 2026-06-30 - Native InkPad opt-in controls

- Asked: do the next batch of Native InkPad steps.
- Built: added a teacher-facing Native InkPad toggle to new assignment and edit assignment screens. API tests cover explicit on/off behaviour.
- Verification: assignment tests passed 11/11 and edited dashboard scripts parsed.
- Open / next: autosave/version conflict hardening.
- Gotchas hit: explicit off removes the native flag, while normal edits without the field still preserve it.

## 2026-06-30 - Native InkPad dashboard integration

- Asked: do the next two native InkPad steps.
- Built: student assignment API now returns native flags and `write_url`; student dashboard uses that URL. Teacher assignment dashboard now returns `pad_kind`, native paste evidence and `review_url`; teacher assignment page uses that URL so native pads open the native review page. Assignment PATCH preserves hidden `native_inkpad` flags.
- Verification: Node 24 assignment/native/Etherpad/migration focused suite passed 25/25. Student and teacher dashboard inline scripts parse.
- Open / next: add a teacher-facing opt-in control for creating/editing native assignments without direct DB/test setup.
- Gotchas hit: dashboard SQL needed native paste summary columns explicitly selected after joining the native paste aggregate.

## 2026-06-30 - Native InkPad teacher review UI

- Asked: build the next native InkPad step after the review and paste policy foundation.
- Built: added `/teacher/native-review`, a separate sidecar review page for native pads with text highlights, general comments, inline comments, annotation list, paste policy controls, paste evidence and revision summaries.
- Verification: Node 24 app syntax check passed, native migration/page tests passed, extracted browser script parsed, Etherpad API plus native focused suite passed.
- Open / next: integrate native pad links/status into student and teacher dashboards behind the opt-in flag.
- Gotchas hit: kept this separate from the Etherpad review page so current classes are not affected.

## 2026-06-30 - Native InkPad review and paste policy foundation

- Asked: prepare native InkPad for teacher review modes, general comments, Word-style inline comments, literacy-code style marks and live paste toggling.
- Built: migration `013_native_review_policy.sql`, native pad versioning, per-pad policies, range annotations, teacher events, teacher review API, annotation create/update APIs, paste-event API and student-side policy polling.
- Verification: Node 24 syntax checks pass. `etherpad`, migration and native pad focused tests pass.
- Open / next: build the actual teacher review page UI and dashboard integration for native pads.
- Gotchas hit: kept this as sidecar-only; no `/write` cutover or dashboard link changes yet.

## 2026-06-30 - Native InkPad sidecar foundation

- Asked: start building an Etherpad replacement on the side while Etherpad stays live until confidence is high.
- Built: added `NATIVE_INKPAD.md`, migration `012_native_inkpad.sql`, hidden native routes, a simple native write view, autosave, submit locking and revision snapshots. Native routes only work when assignment settings include `native_inkpad: true`.
- Verification: Node 24 syntax checks pass. Focused migration and native pad tests pass. Existing Etherpad pad test run still has unrelated failures in old expectations.
- Open / next: add teacher review for native pads, native dashboard status integration and richer editor behaviour after save/submit proves stable.
- Gotchas hit: local default Node is 20 and cannot load `node:sqlite`; use bundled Node 24 for tests.

## 2026-06-30 - Permanent random pad suffixes

- Asked: give each newly used pad a random `1 letter + 4 digit` suffix so deleted local pad rows do not reuse the same Etherpad pad.
- Built: added `pad_allocations`, generated suffixes like `K4821`, reserved suffixes before Etherpad pad creation, retried collisions and reused existing active pad rows unchanged.
- Verification: focused migration, Etherpad and pad allocation tests pass. Live smoke created `g.Tff3JsxD9Dv6MfWE$a9_s5_D2565`, then confirmed the allocation stayed recorded after deleting the throwaway assignment.
- Open / next: full local suite still has unrelated dirty-work failures in auth, EAP admin, write-view UI, timeslider and submission review expectations.
- Gotchas hit: live restart initially failed because current dirty `app.js` imports library routes and multipart support that were not on the droplet; deployed the missing route/assets and installed the missing package, then health checks passed.

## 2026-06-30 — PDF TextLayer: text selection + canvas highlight

- Built: Replaced canvas-only PDF.js render with per-page structure: pdf-canvas + hl-canvas + TextLayer div. Students can now select and copy text from the passage PDF. Highlight buttons paint selection rects onto the hl-canvas using `getClientRects()` with `mix-blend-mode:multiply`. Used named imports (`getDocument`, `TextLayer`) from pdf.min.mjs (PDF.js v5 API).
- Decisions: Highlight is canvas-drawn (not DOM spans) — simpler, no EP conflict, but not persistent across zoom re-renders (acceptable for in-session use).
- Commit: 9edcadc

---

## 2026-06-30 — Batch fixes: zoom, line numbers, sidebar, teacher comments

- Built:
  - **Zoom (#3):** `applyZoom` now sets `body.style.zoom` on both padDoc and aceOuter body so gutter + editor scale together. Tracks `currentZoom`, reapplies after cleanup. Old approach targeted `#editorcontainerbox` which didn't scale the gutter.
  - **Line numbers (#6):** Changed `#sidediv` `padding-top: 55px → 40px` in layout.css on server (matches iframe padding). Also fires resize on `aceOuter.contentWindow` 200ms after cleanup so EP recalculates gutter positions after CSS applies.
  - **Instructions sidebar (#4):** Prompt now shows in left sidebar panel (`.split-left`) instead of a collapsible panel above the pad. Sidebar appears whenever there is a prompt or passage or both. Removed prompt-btn, prompt-panel, and prompt-panel-toggle JS.
  - **Teacher comments (#2, general only):** Migration 010 adds `submission_comments` table. `PUT /api/submissions/:id/comment` upserts a general comment. Review page includes a comment textarea; saving feedback also saves the comment in parallel.
  - **Targets/strengths (#5):** Verified already working — `feedbackLibrary` IDs match string keys stored in DB.
- Decisions: Inline comments deferred (complex); general comments cover the immediate need. Line numbers fix is empirical (40px = iframe padding-top); may need fine-tuning after visual check.
- Open: Verify line numbers and zoom work visually. Inline teacher comments still not built. Task #1 (review page redesign) and #7 (iframe deep-debug) still pending.
- Gotchas: `sed` failed on multi-line layout.css edit; used Python instead.
- Commit: 487f870

## 2026-06-30 — Fix word count (MutationObserver from parent frame)

- Built: Replaced injected `<script>` approach with MutationObserver set up in parent frame observing `innerdocbody` directly via same-origin cross-frame DOM. The injected script was being blocked by aceInner's CSP (which allows `<style>` but not `<script>` injection). Joins `.ace-line` divs with space before counting so adjacent lines don't merge. Fallback poll reduced 2000ms → 500ms. Commit: 38ca4c4

## 2026-06-30 — Fix Etherpad rate limiting disconnecting students

- Built: Two changes to `/opt/etherpad-lite/settings.json` (not in repo):
  - `trustProxy: false → true` — Etherpad was ignoring nginx's `X-Real-IP` header, treating all students as the same IP
  - `commitRateLimiting.points: 10 → 100` — with all students sharing one IP bucket, 10 changes/sec was blown through instantly by simultaneous Chinese IME typing, causing mass disconnects every ~30s
- Root cause: Alex's specific 30s reconnect loop was everyone's problem; teacher only noticed Alex as the demo student. All students were hitting the shared rate limit.
- Gotcha: `settings.json` is NOT in the InkHeron repo — changes made directly on server. Backup at `settings.json.bak`.
- Commit: none (server-only config file)

## 2026-06-30 — Fix timeslider back nav + false paste events

- Built:
  - **Timeslider opens in new tab**: Changed `window.location.href` to `window.open(..., '_blank')` in review.html. Root cause: Etherpad timeslider uses `history.pushState` while scrubbing; those iframe navigations stack in the parent history, so `history.back()` stepped through timeslider positions instead of returning to review.
  - **Paste plugin rewritten**: Switched from `beforeinput`/`input` + `inputType === 'insertFromPaste'` to the `paste` DOM event. Chinese IMEs (Sogou etc.) route composition text through the clipboard internally — browsers label this `insertFromPaste`, causing false positives. The `paste` event only fires for explicit user paste gestures (Ctrl+V, right-click > Paste), not IME input. Plugin deployed to `/opt/etherpad-lite/local_plugins/ep_inkheron_paste/static/js/index.js` and Etherpad restarted.
- Commit: cce62c2

## 2026-06-30 — Teacher preview-pad route for self-testing

- Built:
  - **`GET /teacher/preview-pad/:padId`** — teacher-only route that renders the full student write view using a teacher Etherpad author session. Sets the EP session cookie, opens the pad in the write shell, disables paste blocking (teacher shouldn't log their own keystrokes). `pasteBlock: false` prevents the student-facing paste event listener from firing.
  - **"Preview pad" button** in `teacher/review.html` sidebar — opens the route in a new tab. Teacher can now test word count, line numbers, toolbar, and all write-view UI without needing a student account active.
- Decision: Teacher edits in preview mode are attributed to the teacher EP author, not the student. Fine for debugging; teacher should not heavily edit student work via preview.
- Commit: be94695

## 2026-06-30 — Etherpad pad already exists error; session persistence; literacy analysis fix

- Built:
  - **Etherpad "already exists" fix**: `createGroupPad` now catches the "already exist" error and returns the existing pad id instead of throwing. Triggered when an assignment was deleted from InkHeron DB but the pad remained in Etherpad. Confirmed fixed by user.
  - **Session persistence**: replaced in-memory session store with SQLite-backed store using existing `db`. Sessions survive restarts, last 30 days. Migration 009_sessions.sql added.
  - **Literacy analysis method name fix**: `service.getText()` doesn't exist on `EtherpadService` — corrected to `service.getPadText()` in both the submit background handler and the new `/analyse` endpoint.
- Commits: 258d417 (sessions), d1b4f60 (method fix), 0a87b9c (pad exists)

## 2026-06-30 — Assignment card actions + manual literacy analysis trigger

- Built:
  - **Assignment list cards** now show Archive/Unarchive and Delete buttons alongside Students/Edit, so the teacher can act on a whole assignment from the list without opening the detail view. Archive toggles `is_archived` via the existing endpoint; Delete calls `DELETE /api/assignments/:id`. Both buttons call `fetchAssignments()` then `renderList()` to refresh in-place.
  - **Manual literacy analysis**: Added "Run analysis" button to the Codes section in `teacher/review.html`. Calls new `POST /api/submissions/:id/analyse` endpoint which reads the Etherpad pad text via `service.getText()`, runs `analyseSubmission()`, and returns the fresh codes. Page reloads after 1 s on success.
  - **New endpoint**: `POST /api/submissions/:submissionId/analyse` in `src/routes/pads.js` — teacher-auth + CSRF-protected. Needed for submissions that predated the auto-coding feature deployed on Jun 30.
- Decisions: Analysis endpoint deletes existing codes and replaces them (handled inside `analyseSubmission` which calls `DELETE FROM submission_codes WHERE submission_id = ?` before inserting). Re-running is safe.
- Commit: 9b118d3

## 2026-06-29 — Add persistent font size; fix undo/redo icons

- Built: Installed ep_font_size@0.3.19 (no ep_plugin_helpers dep). Added font size selector (10/12/14/16/18/24/40pt) to padchrome; routes through ep_font_size's hidden `#font-size select.size-selection` and dispatches `change` so size persists in changesets. Hides ep_font_size native toolbar element via CSS. Fixed undo/redo icons to Unicode ↶↷.

- Built: Replaced broken SVG path arrows on undo/redo with Unicode ↶↷ (&#8630;/&#8631;). Removed font-size `<select>` — `execCommand('fontSize')` gets overwritten by Etherpad's changeset processor within ~1 second because no `ep_font_size` plugin is installed. Font size needs `ep_font_size` plugin to persist; noted for future phase.
- Open / next: If persistent font size is needed, install ep_font_size compatible with EP 3.3.2.

## 2026-06-29 — Fix timeslider (third attempt): #rev/latest hash on pad URL

- Built: Switched timeslider redirect from `/timeslider?embed=1` to `/p/PADID#rev/latest`. The `?embed=1` timeslider is designed to run INSIDE the pad page's own iframe and fails standalone (controls flash then vanish because it can't reach parent socket.io). EP 3.3.2 `padMode.bootstrapFromHash()` reads the `#rev/latest` hash and auto-enters in-pad history mode on load. This is the correct standalone approach.

## 2026-06-29 — Fix timeslider redirect + author color (purple) suppression

- Phase/Step worked: Phase 8 — bug fixes post-toolbar merge
- Built:
  - **Timeslider fix**: EP 3.3.2 changed `/p/PADID/timeslider` to ALWAYS redirect back to the pad unless `?embed=1` is present (for iframe-embedded use). Direct visits are expected to use the in-pad history mode. Fixed by appending `?embed=1` to the redirect in `/api/pads/:padId/timeslider`. Confirmed 200 OK with curl after fix.
  - **Author color fix**: Etherpad injects `.authorColors .author-XXX { background-color: purple }` (2-class specificity) which beat the old `span[class^="author-"]` selector. Replaced with `#innerdocbody span { background: none !important }` (id + element = higher specificity than any class-only rule).
- Decisions: `?embed=1` is the EP 3.3.2 contract for standalone timeslider rendering in an iframe. Do not change this unless EP is upgraded.
- Open / next: Verify author colors are gone in live pad. Phase 8.6.

## 2026-06-29 — Single-row toolbar + paste field name fix

- Phase/Step worked: Phase 8 write view — toolbar consolidation, paste blocking repair
- Built:
  - Merged all formatting into one padchrome row: added B/I/U/S, OL/UL/indent/outdent, undo/redo buttons alongside existing alignment/color/font-size controls. All in padchrome; Etherpad's `#editbar` hidden via `#editbar{display:none!important}` CSS injection in `applyPadUiCleanup`.
  - B/I/U/S, list, indent/outdent, undo/redo wired via `clickEditbarBtn(key)` which finds `[data-key="..."]` in `padDoc` and clicks it — goes through Etherpad's changeset system.
  - Fixed paste blocking field name mismatch: route was reading `settings.paste_block` (never set); assignments store `settings.paste_detection`. Changed to `settings.paste_detection !== false`.
- Decisions: Route all text-format buttons through Etherpad's hidden editbar buttons (not execCommand) so formatting persists in changesets properly.
- Open / next: Verify alignment + paste blocking + B/I/U/S in live pad. Phase 8.6 — Strengths + Targets.
- Gotchas hit: rsync of individual files to a directory destination flattens paths — must rsync to explicit remote file path (`remote:/path/to/file.js`), not just the directory.

## 2026-06-29 — Fix ep_colors crash; ep_align 0.3.121 installed, alignment persistent
- Phase/Step worked: Phase 8 write view — plugin crash fixes
- Built:
  - Identified the real crash source: **ep_colors@0.0.3** not ep_align. Crash was `TypeError: U2 is not a function` in padbootstrap where `U2` = underscore `_`. ep_colors called `_(doInsertColors).bind(context)` but in EP 3.3.2 underscore is an ES module export (Object), not a callable wrapper. Patched line 89 on the server: `_(doInsertColors).bind(context)` → `doInsertColors.bind(context)`.
  - ep_align@11.0.40 was also crashing for the same reason (ep_plugin_helpers dependency may have introduced similar patterns). Replaced with ep_align@0.3.121 which has no such issues.
  - Etherpad now loads 3 plugins cleanly: ep_colors@0.0.3, ep_align@0.3.121, ep_plugin_helpers@0.6.7. No client TypeErrors observed.
  - **Patch location**: `/opt/etherpad-lite/src/plugin_packages/.versions/ep_colors@0.0.3/static/js/index.js` line 89. Note: this patch is NOT in version control — if ep_colors is reinstalled it will revert. The fix is: remove `_(fn)` wrapper, use `fn.bind(context)` directly.
- Decisions: Direct server-side patch rather than forking ep_colors. If ep_colors is ever reinstalled, re-apply patch.
- Open / next: Verify alignment (L/C/R) and color swatches work in pad. Phase 8.6.

## 2026-06-29 — ep_align 0.3.121 installed, alignment now persistent
- Phase/Step worked: Phase 8 write view — alignment persistence fix
- Built:
  - Diagnosed why ep_align@11.0.40 crashed Etherpad 3.3.2: `postToolbarInit` hook uses `editbar.registerCommand()` which exists, but the combination with `ep_plugin_helpers` and some internal interaction triggered `TypeError: U2 is not a function` in padbootstrap.min.js.
  - Installed ep_align@0.3.121 (no `ep_plugin_helpers` dep, uses `padInitToolbar` + `eejsBlock_editbarMenuLeft`). Loads cleanly, no crash.
  - Updated write.js: padchrome L/C/R buttons now click ep_align's (hidden) `.ep_align_left/.ep_align_center/.ep_align_right` buttons programmatically. This routes through ep_align's changeset system so alignment PERSISTS across reloads.
  - Fallback to execCommand if ep_align buttons aren't injected yet.
  - ep_align's toolbar buttons hidden via CSS; padchrome is the only visible alignment UI.
- Decisions: Route through ep_align's DOM buttons rather than execCommand; same result for user, but changeset-based persistence.
- Open / next: Verify alignment works (student opens pad, selects text, clicks L/C/R). Phase 8.6 — Strengths + Targets.

## 2026-06-29 — Write view: ep_align removal, custom formatting toolbar, paste fix
- Phase/Step worked: Phase 8 write view fixes (session resumed from context summary)
- Built:
  - Removed ep_align@11.0.40 from plugin_packages (symlink + .versions folder). It was incompatible with EP 3.3.2 and caused `TypeError: U2 is not a function` crash for all students. Uninstall via tsx plugins.ts failed ("Expected at least one argument") — fixed by direct symlink removal.
  - Replaced ep_align with 3 custom alignment buttons (L/C/R SVG icons) in padchrome. Use `execCommand('justifyLeft/Center/Right')` on ace_inner. Visual-only in current session (no changeset persistence without ep_align).
  - Replaced ep_colors dropdown UI with 5 color swatches in padchrome (Black/Red/Green/Blue/Orange). Clicks programmatically set ep_colors' `#color-selection` select and dispatch `change` event, so color persists in Etherpad changesets.
  - Added font size selector (Small/Normal/Large/X-Large) using `execCommand('fontSize')`.
  - Fixed paste blocking: `lastCopyFromPage` flag tracks copy/cut in parent frame (passage panel). Both `lastCopyFromPad` (ace_inner) and `lastCopyFromPage` (parent) are accepted; everything else is blocked when `PASTE_BLOCK=true`.
  - Consolidated two duplicate `getAceInnerDoc` functions into one `getAceInner()`.
  - `onmousedown="return false"` on alignment/color buttons preserves ace_inner selection when buttons are clicked.
  - ep_colors native UI hidden via `#color,#color-selection{display:none!important}`.
- Decisions: ep_align was causing a total Etherpad crash (all pads broken). Alignment persistence sacrificed temporarily; acceptable. ep_colors' changeset mechanism used for color so it persists properly.
- Open / next: Try a compatible ep_align version for persistent alignment. Phase 8.6 — Strengths + Targets upload + AI marking suggestions.
- Gotchas hit: ep_align was a symlink to .versions/ep_align@11.0.40 — needed to remove both symlink and .versions folder. The `grep` returning empty on ep_align caused exit code 1 but was actually success. The changeset null error in logs is a different pre-existing Etherpad bug, not ep_align.

## 2026-06-29 — Write view polish (chrome, zoom, author colors, word count, alignment, color swatch)
- Phase/Step worked: Phase 8 write view polish
- Built:
  - Removed decorative dots and spellcheck label from pad chrome. Bar now shows only: Task button (if prompt exists) + word count + Zoom selector.
  - Word count moved into chrome bar; reads text directly from `ace_inner` iframe via `innerText` split, not ep_countable (which was never visible in the wrapper).
  - Zoom now targets `#editorcontainerbox` so formatting toolbar stays fixed; only the writing area scales.
  - Author color suppression: traverse outer iframe → `ace_outer[name]` → `ace_inner[name]`, inject `background:transparent!important` CSS into both. Previous code tried wrong selectors.
  - ep_colors color select: injected CSS makes it a 28px swatch; JS updates `backgroundColor` on change (targets `#color-selection`).
  - ep_align installed via `cd /opt/etherpad-lite/bin && tsx plugins.ts install ep_align`. Permissions on `plugin_packages` were root-owned; fixed with `chown -R inkheron:inkheron`. ep_align now loads and injects alignment buttons (left/center/justify/right) into the toolbar.
  - Etherpad toolbar config added to settings.json (previously fully commented out). Does NOT include alignLeft/Center/Right so ep_align auto-injects via its `eejsBlock_editbarMenuLeft` hook.
- Decisions: ep_countable and ep_headings2 are in `src/node_modules` but not loaded; only `plugin_packages` plugins load. Alignment buttons from ep_align auto-inject (don't add to toolbar config or they fail). Case-insensitive login added in previous session.
- Open / next: Phase 8.6 — Strengths and Targets upload + AI marking suggestions.
- Gotchas hit: ep_align in `src/node_modules` is NOT loaded — only `plugin_packages`. ep_align installed via tsx but permissions were root after install, blocking load. ep_colors template uses `#color-selection` (not `#font-color`).

## 2026-06-29 — Prompt button + reference passage panel
- Phase/Step worked: Phase 8 student write view polish
- Built:
  - "Task" button in pad chrome opens a slide-down panel showing the assignment prompt. Panel closes/reopens on click; button label toggles between "Task" and "Hide task". No prompt = no button.
  - Reference passage: if an assignment has `passage_text` or a PDF, the write view splits into a left 340px passage panel and a right pad area.
  - Passage text stored in `settings_json.passage_text` (up to 20k chars).
  - PDF stored at `data/passages/{id}.pdf` via `PUT/DELETE/GET /api/assignments/:id/passage-pdf`. PDF endpoint accepts student or teacher sessions (no auth = 401).
  - Content type parser registered for `application/pdf` in assignments plugin.
  - Teacher edit view: new "Reference passage" card with Text tab (textarea) and PDF tab (file input + remove button). `openEdit` HEAD-checks for existing PDF; `saveEdit` includes `passage_text` in settings PATCH, then separately PUT-uploads PDF if a file is selected.
  - Prompt hint text updated: students can read it via the Task button (was "Students do not see this").
- Decisions: PDF uploaded only to the primary assignment in a multi-class group (first in editGroup). passage_text cleared from settings_json if textarea is empty on save — correct, expected behaviour.
- Open / next: Phase 8.6 — Strengths and Targets upload + AI marking suggestions. Also: Server酱 pricing.
- Gotchas hit: SSH key not loaded in agent; needed `ssh-add` + `-i` flag; root user is the correct login.

## 2026-06-29 — Unread submission badge + password fixes
- Phase/Step worked: Phase 8 polish
- Built:
  - `GET /api/teacher/notifications` counts submissions since `notifications_cleared_at` in settings table (excluding demo/ghost). `POST /api/teacher/notifications/clear` updates the watermark.
  - Teacher dashboard shows red badge on Assignments tile when count > 0. Clears on assignments page load.
  - Reset password endpoint now always uses `ChangeMe1` (was `generateTempPassword()`). Frontend message updated accordingly.
  - `must_change_password` defaulted to 1 on new student creation. 53 existing students patched in DB.
  - ChangeMe1 shown in purple on roster while `must_change_password = 1`; nothing shown once changed.
- Decisions: Badge clears on page visit (not on per-submission view). Silent clear — no explicit dismiss button needed at this scale.
- Open / next: Phase 8.6 — Strengths and Targets upload + AI marking. Also: investigate Server酱 pricing for WeChat notifications.
- Gotchas hit: All existing students had `must_change_password = 0` — needed one-off DB patch.

## 2026-06-29 — Fix cross-class student modal contamination
- Phase/Step worked: Phase 8 bug fix
- Built: `GET /api/assignments/:id/students` scoped to `WHERE s.class_id = assignment.class_id` (was returning all classes). `PUT /api/assignments/:id/students` now builds a `classStudentIds` set and silently skips any student IDs from other classes before inserting. Deployed commit `654a335`.
- Decisions: Cross-class IDs are silently dropped on PUT rather than errored — the scoped GET means the UI should never send them; error would only confuse a race condition edge case.
- Open / next: Phase 8.6 — Strengths and Targets upload + AI marking suggestions.
- Gotchas hit: Session resumed from summary after context limit.

## 2026-06-29 — Multi-class assignment creation
- Phase/Step worked: Phase 8 teacher UX polish
- Built: Updated `new-assignment.html` to replace the single class dropdown with a
  checkbox list. `loadClasses()` renders one `<label><input type=checkbox>` per class
  into `#classChecks`. Submit handler collects all checked IDs, validates at least one
  is selected, then loops `POST /api/assignments` once per class. Button shows count
  while creating. Redirects to assignments page on full success; shows error count
  if any POSTs fail. No backend change needed.
- Decisions: One assignment row per class (existing schema, no migration). Last created
  ID used for the `?highlight` redirect.
- Open / next: Strengths and Targets upload + AI marking suggestions (Phase 8.6)
- Gotchas hit: none.

## 2026-06-29 — Flexible column-picker for student import
- Phase/Step worked: Phase 8 teacher UX polish
- Built: Reworked spreadsheet import in students.html. After dropping a file,
  two dropdowns let the teacher pick which column is the name and which is the
  class. Auto-guesses column from header text ("English Name", "Admin Class" etc).
  Class cells matched case-insensitively against existing classes — green tick if
  matched, red X with manual fallback picker if not. Import blocked until all
  students have a class. Username auto-generated from name.
- Decisions: class match is exact case-insensitive; no fuzzy match to avoid
  false positives across similar class names.
- Open / next: Strengths and Targets upload + AI marking suggestions (Phase 8.6)
- Gotchas hit: none.

## 2026-07-01 - Native InkPad Phase 7 rubrics
- Asked: Build the next two native InkPad phases, starting with rubric grading beside strengths, targets, comments and literacy codes.
- Built: Added `014_native_rubrics.sql` with assignment rubric criteria, score bands and per-native-pad rubric scores. Added teacher APIs to create assignment rubrics and save half-step pad scores. Review payload now includes rubric criteria and scores.
- UI: Native review page can create a default five-criterion rubric, choose whole or half scores with an X marker and save notes for each criterion.
- Verified: `node --check src/routes/nativePads.js` and Node 24 `--test test/migration.test.js test/nativePads.test.js` passed 8/8.
- Decision: Rubric scores stay separate from numeric grades for now so they can later feed visible feedback packages and student profiles.

## 2026-07-01 - Native InkPad Phase 8 student writing profiles
- Asked: Keep the long-term student writing and voice profile goal built into the native InkPad work.
- Built: Added `015_student_writing_profiles.sql` with student writing profiles, literacy issue stats and literacy evidence. Literacy-code annotations now sync into student profile evidence and update total/open/resolved counts.
- UI/API: Review payloads include `student_profile`, teachers can fetch `/api/native/students/:studentId/profile` and the native review rail shows top tracked profile issues while marking.
- Verified: `node --check src/routes/nativePads.js` and Node 24 `--test test/migration.test.js test/nativePads.test.js` passed 8/8.
- Decision: This phase stores structured evidence only. AI-written summaries, voice analysis and personalised exam practice stay later phases built on these tables.

## 2026-07-01 - Native InkPad Phase 9 backup and recovery
- Asked: Add a backup of student work in case the server goes down and allow a teacher to upload or paste recovered student work.
- Built: Added teacher-only JSON backup export for all native pads or one assignment. Backup includes current pad data, revisions, annotations, paste events, rubric data and profile evidence.
- UI/API: Native review page now has an assignment backup download link, pasted-text recovery and `.txt` upload recovery. Imports can create a manual revision only or replace current pad text.
- Verified: Node 24 `--check src/routes/nativePads.js` and `--test test/migration.test.js test/nativePads.test.js` passed 9/9. Broader stable suite `--test test/etherpad.test.js test/migration.test.js test/assignments.test.js test/nativePads.test.js` passed 29/29.
- Decision: Recovery revisions use existing `manual` reason because the schema check does not allow `teacher_import`; detailed source is recorded in `native_teacher_events`.
