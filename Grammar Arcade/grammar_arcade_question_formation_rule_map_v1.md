# Grammar Arcade — Question Formation Pack v1

## Purpose
This first homework release focuses only on question formation, but the structure is designed to expand later into pronouns, tense, articles, word forms, and sentence boundaries.

## Homework policy
- Practice attempts: 1–2
- Official attempts: 3
- Best official score counts
- Extra credit conversion: best score ÷ 10 = score out of 10

## Scoring
- 80 points: accuracy / successful correction
- 10 points: learning recovery
- 10 points: time bonus

Time is a bonus, not a harsh punishment.

## Rules

### Missing auxiliary in WH-questions (`qf_missing_auxiliary`)

**Rule:** Use WH-word + did/do/does + subject + base verb for most action questions.


**Wrong pattern:** WH-word + subject + verb?


**Wrong:** Why the student council cancelled the meeting?


**Correct:** Why did the student council cancel the meeting?


**Chinese hint:** 英语特殊疑问句通常需要助动词：did / do / does。


**Diagnosis:** You often made a statement-order question and missed the helper verb.


### After did, use the base verb (`qf_did_base_verb`)

**Rule:** After did, the main verb must be the base form: did + cancel, not did + cancelled.


**Wrong pattern:** did + past tense verb


**Wrong:** What did the coach told the team?


**Correct:** What did the coach tell the team?


**Chinese hint:** did 已经表示过去，所以后面的动词用原形。


**Diagnosis:** You often used a past-tense verb after did.


### Be-question order (`qf_be_question_order`)

**Rule:** For questions with is/are/was/were, use WH-word + be + subject.


**Wrong pattern:** WH-word + subject + be?


**Wrong:** What the announcement was about?


**Correct:** What was the announcement about?


**Chinese hint:** 直接疑问句里，be 动词要放在主语前面。


**Diagnosis:** You often kept statement word order in be-questions.


### Be vs do/did (`qf_be_vs_do`)

**Rule:** Use do/did for action verbs; use be for states, adjectives, identity, location, and descriptions.


**Wrong pattern:** Using did with an adjective/state, or be with an action verb.


**Wrong:** Why did you worried about the interview?


**Correct:** Why were you worried about the interview?


**Chinese hint:** 动作动词用 do/did；状态或形容词常用 be。


**Diagnosis:** You mixed action-question grammar with be-question grammar.


### Interested / interesting / interests (`qf_interested_forms`)

**Rule:** Use 'be interested in' for a person's feeling, 'interests me' for the cause, and 'interesting' for the quality.


**Wrong pattern:** interest used as adjective or adjective used as verb.


**Wrong:** Why do you interest in media studies?


**Correct:** Why are you interested in media studies?


**Chinese hint:** 人的感受：be interested in；事物特点：interesting；引起兴趣：interests me。


**Diagnosis:** You mixed up interested, interesting, and interests.


### Duration with take (`qf_duration_take`)

**Rule:** To ask about time needed, use: How long did it take + person + to + verb?


**Wrong pattern:** How long did you get/go/arrive?


**Wrong:** How long did you arrive at the interview?


**Correct:** How long did it take you to arrive at the interview?


**Chinese hint:** 问“花了多长时间”用：How long did it take...?


**Diagnosis:** You used go/get/arrive when the question needed take.


### Vague reference repair (`qf_vague_reference`)

**Rule:** A useful follow-up question should replace vague words like thing, it, this, and that with a specific noun or detail.


**Wrong pattern:** Why? / What thing? / Tell me about that thing.


**Wrong:** Tell me about that thing.


**Correct:** Tell me about the research mistake you mentioned in your presentation.


**Chinese hint:** thing / it / this / that 太模糊；要说清楚具体指什么。


**Diagnosis:** Your question was grammatical enough, but it was too vague to get useful information.


## Content bank summary

- Total items: 75

- Level 1: 25 items

- Level 2: 25 items

- Level 3: 25 items


## Level principle
- Level 1: controlled accuracy, but still age-appropriate.
- Level 2: applied school-life context with plausible distractors.
- Level 3: discourse-level contexts involving research, applications, debate, evidence, or reasoning.


## Example item
```json

{
  "id": "qf_l1_001",
  "module": "question_formation",
  "level": 1,
  "ruleId": "qf_missing_auxiliary",
  "theme": "student_council",
  "gameType": "case_board",
  "caseTitle": "The Vanishing Club Budget",
  "context": "The student council cancelled the budget meeting after lunch.",
  "task": "Ask why the meeting was cancelled.",
  "correctAnswer": "Why did the student council cancel the budget meeting?",
  "acceptedAnswers": [
    "Why did the student council cancel the budget meeting?"
  ],
  "commonWrongAnswers": [
    "Why the student council cancelled the budget meeting?",
    "Why did the student council cancelled the budget meeting?",
    "Why was the student council cancel the budget meeting?"
  ],
  "choices": [
    "Why did the student council cancel the budget meeting?",
    "Why the student council cancelled the budget meeting?",
    "Why did the student council cancelled the budget meeting?",
    "Why was the student council cancel the budget meeting?"
  ],
  "feedback": "Use did for a past action question: Why did + subject + base verb.",
  "feedbackChinese": "过去动作提问用 did + 动词原形。",
  "clueUnlocked": "The treasurer asked for more time to check the receipts.",
  "expectedTimeSeconds": 20
}

```
