# POLISH_QUEUE.md — small marking-room tweaks as they emerge

The teacher logs small UX tweaks here during real marking. Fable (or a
delegated model) picks them up in batches. Move an item to Done with the
commit hash when shipped.

## Open
(nothing queued)

## Done
- 2026-07-06 Comment anchoring bug fixed: hidden tooltip labels inside marks
  inflated the selection offset count; offsets now measured with tips stripped.
- 2026-07-06 Your comments card in the marking sidebar: find / edit / delete,
  backed by a new DELETE /api/native/annotations/:id endpoint.
- 2026-07-06 Needs-you marks now neon chartreuse #ccff00 (teacher: #fde047 blended in).
- 2026-07-05 Needs-you marks get a standout colour: highlighter-yellow wash
  with a dark dotted underline, distinct from every literacy code colour.
