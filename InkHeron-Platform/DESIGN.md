# DESIGN.md — InkHeron visual system

**Single source of truth for all UI.** The HTML mockups (`ui/inkheron_student_v2.html`
+ the three teacher-side files) are the reference IMPLEMENTATION; this file is the
reference SPECIFICATION. When building any screen, use these tokens exactly. Do not
invent colours, radii, or fonts. Do not redesign — wire backend to the existing look.

Self-host all fonts and CSS (no Google Fonts links, no CDNs — hard rule).

---

## 1. Colour tokens (CSS variables — copy verbatim)

```css
:root{
  /* surfaces */
  --bg:#F7F6F2;            /* warm off-white page background — the warmth starts here */
  --surface:#FFFFFF;
  --surface-2:#F1EFE9;
  --surface-3:#E7E5DD;
  /* lines + ink */
  --border:rgba(20,20,18,0.12);
  --border-2:rgba(20,20,18,0.22);
  --ink:#141412;
  --text:#1C1C1A;
  --text-2:#5C5B55;        /* secondary text */
  --text-3:#8C8B83;        /* tertiary / hints */
  /* green = primary brand */
  --green-50:#EAF3EC; --green-500:#2E7D52; --green-600:#246343; --green-700:#1B4A32;
  /* maroon = grammar errors / serious flags */
  --maroon-50:#F6E9EB; --maroon-500:#8C2F3B; --maroon-700:#6A2531;
  /* blue = tests / informational */
  --blue-50:#E8F0F7; --blue-500:#2C6E9C; --blue-700:#1F5076;
  /* amber = surface-level errors (spelling/punctuation), in-progress */
  --amber-50:#FBF0DC; --amber-700:#8A5A12;
  /* coral = THE warm accent. Use sparingly: green-pen return only. Never yellow, never dark. */
  --coral-50:#FBEEEA; --coral-100:#F6DCD3; --coral-500:#C96A4E; --coral-600:#B0563C;
  /* sage = soft positive accent (toast tick, gentle highlights) */
  --sage-50:#EEF3EC; --sage-500:#6E8A5E;
  --primary:#246343;       /* = green-600 */
  /* radii */
  --r-sm:10px; --r-md:14px; --r-lg:20px; --r-xl:26px;
  /* type */
  --font:'Inter',-apple-system,system-ui,sans-serif;
  --serif:'Source Serif 4',Georgia,serif;
  --mono:ui-monospace,'SF Mono',Menlo,monospace;
  /* shadows */
  --shadow-card:0 2px 14px rgba(20,20,18,0.05);
  --shadow-lift:0 10px 30px rgba(20,20,18,0.10);
  /* motion */
  --ease:cubic-bezier(.22,.61,.36,1);
}
```

---

## 2. Typography

- **Inter** for all UI text. Weights used: 400/500/600/700/800.
- **Source Serif 4** (500/600) for: the brand wordmark, big greetings/headings, and the
  WRITING SURFACE body text (the pad reads as serif — it should feel like writing, not UI).
- **Mono** for code tags (literacy codes like `Gra`, `RO`).
- Self-host both families with the exact weights above. No external font links.

---

## 3. Colour meaning (consistent across teacher + student)

- **Green** — primary actions, "done/submitted", strengths, success.
- **Maroon** — grammar-type errors (Gra, RO), serious/due-soon flags.
- **Amber** — surface errors (spelling Sp, punctuation P), "in progress".
- **Blue** — tests, informational.
- **Coral** — reserved almost entirely for the green-pen "feedback ready / needs rewrite"
  state. This is the one warm note that makes the student side inviting. Do not spread it.

---

## 4. Warmth principles (student side)

Warmth comes from these, NOT from warmer/darker colours or a mascot (no generated imagery):

1. **Space** — generous padding, roomy cards, lots of `--bg` cream showing.
2. **Soft geometry** — rounded corners (`--r-md`/`--r-lg`), soft shadows over hard borders.
3. **Motion** — cards lift gently on hover (`translateY(-3px)` + `--shadow-lift`, `--ease`).
   Save-state fades. Green-pen return card has a slow gentle pulse. Quick, soft, never flashy.
4. **Voice** — human copy. "You've got two things to look at today" not "2 assignments".
   "Ask your teacher to reset it" not "Password recovery". (Student copy obeys the house style:
   no em/en dashes, no Oxford commas, B1–C1 level.)
5. **One restrained accent** — coral, in small doses against calm cream.

Teacher side is the same token system but more restrained/professional (denser tables, less
motion). Same palette, different density.

---

## 5. Core components (as built in the mockups)

- **Buttons:** `.btn` (radius `--r-sm`, lift on hover). Variants: `.p` (primary green),
  `.coral` (green-pen resend), `.ghost` (outline), `.sm`. Primary/coral carry a soft coloured shadow.
- **Cards:** `.acard` assignment card — icon tile + body + status pill + chevron, lifts on hover.
- **Status pills:** `.pill` with `.todo .prog .done .fix .soon` — map to lifecycle states.
- **Type icons:** rounded tile, serif glyph. `.essay` (green) / `.test` (blue).
- **Pad frame:** `.padframe` — chrome bar (three dots + spellcheck/wordcount note) + formatting
  toolbar (`.fmtbar`) + serif `.padbody`. This wraps the real Etherpad iframe in the live build.
- **Green-pen marks:** `.mk.gr` (maroon underline) / `.mk.su` (amber underline). Hover shows
  CODE CATEGORY ONLY (e.g. "Grammar") — never the correction. `.codetag` is the superscript code.
- **Grammar legend:** code → meaning list, answer-free, with a footer telling students to use
  the literacy guide. Hover links legend row ↔ inline mark (mutual highlight).
- **Targets (`.exp`):** brief line expands on click to full COACHING explanation + a green
  "Try now" prompt. Targets teach so students can act immediately.
- **Strengths (`.exp.str`):** brief line expands to explanation of what worked and why.
- **Toast:** bottom-centre, dark, sage tick, auto-dismiss ~2.6s.
- **Dashboard view toggle:** pill toggle action-led ("What to do") vs timeline ("By due date").

---

## 6. Brand

- Wordmark: "InkHeron" in Source Serif 4 600.
- Logo: `assets/InkHeron Logo.png`, self-hosted. Used in appbar, login, and as favicon.
- Mockups use a placeholder serif "i" glyph tile (green, slight `rotate(-4deg)`); swap for the
  PNG in the real build.

---

## 7. Hard reminders that touch UI

- Self-host fonts/CSS/JS. No CDNs.
- Italics in flowing copy: styled span or reset `em`, never a bare `<em>` in a flex container.
- Metric units only anywhere measurements appear.
- Student-facing copy: no em/en dashes, no Oxford commas, B1–C1.
