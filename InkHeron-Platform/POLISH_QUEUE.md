# POLISH_QUEUE.md — small marking-room tweaks as they emerge

The teacher logs small UX tweaks here during real marking. Fable (or a
delegated model) picks them up in batches. Move an item to Done with the
commit hash when shipped.

## Open
- 2026-07-06 Show the teacher's own comments in the sidebar during marking so
  they can be edited or deleted after placement.
- 2026-07-06 BUG: inline comments do not anchor to the exact text the teacher
  highlighted; they land elsewhere. Investigate selection-offset handling in
  the comment placement path.

## Done
- 2026-07-06 Needs-you marks now neon chartreuse #ccff00 (teacher: #fde047 blended in).
- 2026-07-05 Needs-you marks get a standout colour: highlighter-yellow wash
  with a dark dotted underline, distinct from every literacy code colour.
