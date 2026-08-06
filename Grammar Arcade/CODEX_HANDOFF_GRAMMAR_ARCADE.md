# Codex Handoff — Grammar Arcade / Case Lab Frontend

## Project location in uploaded zip
Work in:

`artifacts/grammar-case-lab`

This is a React + Vite + TypeScript frontend app. For the current phase, do **not** build or attach a backend. The goal is to make the existing frontend run locally, improve the student-facing wording/onboarding, and preserve the game feel.

## Current product goal
This app is the first homework release for Chinese G12 EAL students. It focuses on **Question Formation** only.

The learning flow should be:

**Start → Avatar → Mission Map → mandatory Case File → Practice → Official Attempts → Results/Grammar Diagnosis**

Policy:
- Case File is mandatory before practice.
- Practice unlocks after Case File.
- Official attempts unlock after at least one practice round.
- Practice attempts: 1–2.
- Official attempts: 3.
- Best official score counts.
- Extra credit = best score / 10.
- Keep everything localStorage-based for now.

## Most important instruction
Do not rebuild the app from scratch. Do not add backend code. Do not generate new question banks. Do not make it childish.

This is a surgical frontend pass.

## Known relevant files
- `src/App.tsx` — routes
- `src/context/GameContext.tsx` — localStorage progress, attempts, lesson lock
- `src/pages/MicroLesson.tsx` — mandatory Case File / lesson flow
- `src/pages/MissionMap.tsx` — mode unlocks and attempt buttons
- `src/pages/RepairRush.tsx` — Repair Rush game
- `src/pages/QuestionBuilder.tsx` — Case Board / sentence builder style mode
- `src/pages/BossInterview.tsx` — currently routed as Witness/Final Interview
- `src/pages/ResultsScreen.tsx` — results and diagnosis
- `src/pages/TeacherLite.tsx` — local teacher view
- `src/components/TermHighlight.tsx` — important word highlighting
- `src/components/game/TileBuilder.tsx` — tile interaction
- `src/data/questionFormationPackV1.json` — imported question pack
- `src/data/questions.ts` and `src/data/rules.ts` — older hardcoded content; do not let old labels leak into student UI

## Student-facing language rules
Students have not been taught grammar labels first. Every screen must be self-explanatory.

Avoid as main labels:
- Be Question
- auxiliary
- base verb
- state
- grammar frame
- action or state

Preferred wording:
- “Question with is / are / was / were”
- “helper word”
- “simple verb”
- “question pattern”
- “doing something or describing something?”
- “feeling, condition, description, or location”

## Exact wording to use

### Case File intro
Title: `Case File: How to Ask Better Follow-Up Questions`

Text:
`In this game, your job is to ask better follow-up questions.`

`A good follow-up question does three things:`
1. `It asks for useful information.`
2. `It is clear and specific.`
3. `It uses correct English question order.`

`You do not need to memorise grammar names. You need to choose the right question move.`

### Move 1
Title: `Question Move: Ask about something that happened`

Explanation:
`Use this when the action already happened.`

Examples:
- `Why did the team change the plan?`
- `What did the teacher say?`
- `When did the meeting start?`

Tiny rule:
`Use did + simple verb.`

Correct:
`Why did the team change the plan?`

Not:
`Why did the team changed the plan?`

Chinese hint:
`过去发生的动作，用 did + 动词原形。`

### Move 2
Title: `Question Move: Ask what / where / how something is or was`

Explanation:
`Use this when you are asking about identity, location, description, condition, or status.`

Simpler explanation:
`Use this when the question asks what something is, where something is or was, how something is or was, or why someone felt a certain way.`

These questions often use:
`is / are / was / were`

Examples:
- `What was the problem?`
- `Where was the meeting?`
- `Why was the student worried?`
- `How difficult was the task?`

Wrong:
`What the problem was?`

Correct:
`What was the problem?`

Tiny rule:
`Put is / are / was / were before the subject.`

Chinese hint:
`问身份、位置、状态或描述时，用 is / are / was / were，并放在主语前面。`

### Move 3
Title: `Question Move: Doing something or describing something?`

Explanation:
`Some questions ask about something someone does or did.`

Examples:
- `Why did the team change the plan?`
- `What did the teacher say?`
- `When did the meeting start?`

For these, use:
`did / do / does`

`Some questions describe how someone feels, where something is, what something is, or what something is like.`

Examples:
- `Why was the student worried?`
- `Where was the meeting?`
- `What was the problem?`
- `How difficult was the task?`

For these, use:
`is / are / was / were`

Wrong:
`Why did the student worried?`

Correct:
`Why was the student worried?`

Why:
`The student is not “doing” worried. Worried describes how the student felt.`

Wrong:
`What did the problem was?`

Correct:
`What was the problem?`

Why:
`This question is asking what the problem was, not what the problem did.`

Chinese hint:
`如果问动作，用 do / does / did。`
`如果描述感受、位置、身份或情况，用 is / are / was / were。`

### Move 4
Title: `Question Move: Make the question specific`

Explanation:
`A follow-up question is weak if people do not know what you are asking about.`

Weak:
`Why?`

Better:
`Why did the group change the research topic?`

Weak:
`Tell me about that thing.`

Better:
`Tell me about the feedback you received after the presentation.`

Tiny rule:
`Replace vague words like it, this, that, thing, and why with the specific idea.`

Chinese hint:
`不要只说 why / thing / it / that；要说清楚具体问什么。`

## Highlighting requirements
Use `TermHighlight` or similar component so key words visibly stand out. Important words should be coloured/bold/glowing but not overwhelming.

Highlight:
- `did`
- `do / does`
- `is / are / was / were`
- `simple verb`
- correct forms like `change`, `tell`
- wrong forms like `changed`, `told`
- vague words like `it`, `this`, `that`, `thing`, `why`

Use red/pink for wrong forms, green/cyan for correct or key terms.

## Required checks/fixes
1. Run the app locally.
2. Confirm `/lesson` shows the mandatory Case File.
3. Confirm Mission Map locks practice until Case File is complete.
4. Confirm official attempts are locked until at least one practice round is complete.
5. Confirm no student-facing screen uses “Be Question” as the main label.
6. Confirm “state” is not used as unexplained grammar jargon.
7. Confirm tile building is fast: source tiles stay in place; tapping copies to answer row; no slow flying animation.
8. Confirm results show score `/100`, extra credit `/10`, and weakest rule.
9. Run `pnpm --filter @workspace/grammar-case-lab run typecheck`.
10. Run `pnpm --filter @workspace/grammar-case-lab run build`.

## Local run commands
From repository root:

```bash
pnpm install
pnpm --filter @workspace/grammar-case-lab run dev
```

Then open the Vite localhost URL.

Build production frontend:

```bash
pnpm --filter @workspace/grammar-case-lab run build
```

The production static files should be in:

`artifacts/grammar-case-lab/dist`

## Hosting plan for frontend-only preview
For now, host only the built `dist` folder as static files. No Node server is needed for the student game preview.

Server requirements for frontend-only preview are tiny:
- static web server only: Nginx/Apache/cPanel static hosting is enough
- storage: usually under 50 MB for built files, likely much less
- RAM/CPU: negligible after build, because it is static
- bandwidth: depends on student count, but this should be lightweight unless many large images/audio files are added

## Future backend caution
When backend is added later, keep the game frontend independent:
1. Load assignment package at start.
2. Play locally in browser.
3. Submit final attempt result at the end.

Do not make the game call the server for every click/tile/answer animation.
