# Question Answering Redesign Plan

Date: 2026-07-22

## Goal

Move the student quiz flow beyond self-marked flashcards while keeping it reliable, low-cost, and safe enough for a school pilot.

The target behaviour is:

- Some questions are multiple choice.
- Some questions are typed short answers.
- Students can challenge a mark if they believe the app marked them unfairly.
- The system improves the quality of feedback data without needing AI on day one.

## Phase 1: No-AI Multiple Choice

For each flashcard question, the app can generate four answer options:

- One correct answer from the current card.
- Three distractors pulled from the same subsection where possible.
- If the subsection has fewer than four cards, widen to the same chapter.
- If the chapter still has too few cards, fall back to the current subject.

This keeps wrong options plausible and avoids random nonsense answers.

Data needed per card:

- `id`
- `subjectId`
- `chapterId`
- `subsectionId`
- `front`
- `back`

Scoring:

- Correct choice increases mastery normally.
- Incorrect choice records the selected distractor ID as useful diagnostic data.
- Repeated confusion between two cards can be shown to teachers as a misconception pair.

## Phase 2: Deterministic Typed Answers

Typed answers can be marked without AI by adding marking metadata to each card:

- `acceptedKeywords`: required or high-value words.
- `acceptedPhrases`: exact or near-exact phrases.
- `optionalKeywords`: words that add confidence but are not mandatory.
- `blockedMisconceptions`: common wrong phrases that should trigger a wrong mark.

Marking approach:

- Blank answers are automatically wrong.
- The app normalises case, punctuation, and spacing.
- A minimum keyword threshold decides whether the answer is accepted.
- A strict exact phrase match can override the keyword threshold.
- A blocked misconception can force a wrong mark even if some keywords are present.

This is not as smart as AI, but it is transparent, cheap, and easy to explain to teachers.

## Phase 3: Student Challenge Flow

If a typed answer is marked wrong, the student can click:

`I think this should be correct`

That creates a review record with:

- `cardId`
- `studentAnswer`
- `expectedAnswer`
- `matchedKeywords`
- `missingKeywords`
- `schoolId` or `licenseId`
- `classId`
- `anonymous: true` for Super Admin review
- timestamp

The teacher/admin can then review whether the accepted keyword list needs improving.

## Phase 4: Optional AI-Assisted Marking Later

AI can be added later as a second opinion, not as the first pilot requirement.

Recommended use:

- Use deterministic marking first.
- If the deterministic score is uncertain, ask AI for a confidence judgement.
- Store only the minimum answer text needed for marking.
- Do not let AI directly change mastery without a clear audit trail.

Benefits:

- Better recognition of synonyms and phrasing.
- More natural feedback.
- Less manual keyword tuning.

Risks:

- Cost per typed answer.
- Privacy and data-processing requirements.
- Need for clear terms, consent, and school approval.
- Occasional false positives or false negatives.

## Recommended Build Order

1. Build no-AI multiple choice generation.
2. Add deterministic typed answer marking for a small set of pilot cards.
3. Add the challenge flow and admin review queue.
4. Use pilot challenge data to improve keywords.
5. Only then test AI-assisted marking on a controlled subset.

