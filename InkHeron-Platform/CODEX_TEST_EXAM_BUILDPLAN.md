# Test and exam build plan

## Scope

Build the next test portal layer on top of the existing MCQ importer, question bank, multi-section test setup and model settings work. The core object is a test with ordered sections. Sections can be MCQ, SRQ or FRQ. FRQ uses the full native InkPad. SRQ uses a compact plain writing pad.

## Accepted requirements

- Student rules screen before a test attempt starts, with firm academic integrity wording in English and Chinese.
- Server-side timer authority. The browser timer is display only.
- Resume the same attempt after a browser or Wi-Fi issue. The timer keeps running unless the teacher pauses or unlocks the attempt.
- Fullscreen request on start. If the student returns to the tab, the page requests fullscreen again.
- Integrity tracking for fullscreen exits, tab visibility, window blur, copy, paste, context menu, question focus, answer input and idle gaps.
- First warning is kind and visual only. Later warnings can use a color pulse and sound unless disabled for that student.
- Teacher live test-day screen, refreshed every minute, with student name, current question, status, time left, warnings and latest activity.
- Teacher controls to pause the whole test, resume it, unlock an attempt, force submit, add time and excuse warnings with a reason.
- Question navigation map with answered, unanswered, current and flagged states.
- Student flag for review.
- Manual submit review prompt. If more than 15 min remain, push the student back to the question with the longest active time.
- Automatic autosubmit countdown when time expires, then blur the page and submit.
- SRQ mini pad with no toolbar, a word counter and about 4 to 5 visible lines.
- FRQ start opens the full native InkPad with an autosave banner and a back-to-test link.
- Importer follow-up: PDF and TXT import, confidence labels, source trace, raw source viewer and needs-answer handling.
- Cleanup and analysis follow-up: merge or rename topics and tags, archive duplicates, printable backup and CSV item analysis export.

## Checkpoints

1. Build plan checkpoint
   - Add this plan document.
   - Commit before app changes.

2. Exam attempt schema and backend foundation
   - Add a migration for attempt rules acknowledgement, server timer controls, per-student accessibility flags and integrity events.
   - Add student routes for rules acknowledgement and activity logging.
   - Add teacher live-monitor read route.
   - Add teacher mutation routes for pause, resume, unlock, add time, force submit and warning excusal.
   - Add focused backend tests.

3. Student test shell
   - Replace the simple start/take page with the rules gate, timer, navigation map, flag for review, fullscreen handling, warning ladder and activity logging.
   - Add the compact SRQ pad with word count and internal scroll.
   - Add manual submit review flow and autosubmit countdown.
   - Block copy, paste and context menu where strict test controls apply.

4. FRQ InkPad bridge
   - Add the autosave banner to the FRQ writing page when opened from a test.
   - Add a back-to-test button.
   - Make the test page link clearly to Start FRQ and track that navigation.

5. Teacher test-day screen
   - Upgrade test review into a live test-day view with one-minute refresh.
   - Show current question, answered count, warning count, latest activity and timer status.
   - Add teacher controls and warning excusal UI.

6. Importer flexibility
   - Extend bulk import to TXT and PDF.
   - Add detection metadata for answer source and confidence.
   - Preserve source snippets so teachers can inspect where an imported question came from.
   - Surface needs-answer and uncertain items in the question bank.

7. Bank cleanup, backup and analysis
   - Add topic or tag merge and rename tools.
   - Add duplicate archive helper.
   - Add printable backup export.
   - Add item-analysis CSV export with topic, answer rate, average time and revisit rate.

8. Final verification and notes
   - Run the full Node 24 test suite.
   - Check student-facing copy for forbidden dash punctuation and Oxford comma risk.
   - Update SESSION_NOTES.md and keep it under 400 lines.
