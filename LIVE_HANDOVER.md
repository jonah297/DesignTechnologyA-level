# Sharp Study Live Handover

Last updated: 2026-07-28

Project owner: Jonah Theo Stanwell-Smith

Primary local repo:

`/Users/jonahss/Documents/DT App/DesignTechnologyA-level`

Remote repo:

`https://github.com/jonah297/DesignTechnologyA-level`

Production project:

Vercel project `design-technology-a-level`

Firebase project:

`dt-study-hub`

Brand name:

Sharp Study

Baseline app commit when this handover was created:

`a441f9c Polish beta onboarding and report controls`

## Purpose Of This File

This is the live handover. It is the first document a future Codex agent, AI
developer, or human engineer should read before changing the app.

The goal is not to create a new handover from scratch each time. Future updates
should edit this file in place, refreshing the current state, completed work,
risks, and next tasks. Old facts should either be updated or moved into the
change log so stale information does not mislead the next agent.

## Live Handover Update Protocol

When Jonah asks to "update the live handover", do this:

1. Read this file first.
2. Inspect `git status --short`, latest commits, `README.md`, `firestore.rules`,
   `src/App.js`, `src/memoryModel.js`, `src/studentSupportAlgorithm.js`, and any
   files changed since the last handover update.
3. Update the "Current Product State", "Recently Completed", "Open Tasks",
   "Known Risks", and "Operational Commands" sections.
4. Update the "Last updated" date and current commit hash.
5. Do not paste secrets, passwords, Firebase API private material, recovery
   codes, personal browser session data, or the actual Super Admin key.
6. If the update changes app behaviour, run:

```bash
npm test -- --watchAll=false
npm run build
```

7. If Firestore rules changed and Java is available, also run:

```bash
npm run test:rules
```

8. Commit the updated handover with the related code changes when appropriate.
9. Create a fresh physical backup in `/Users/jonahss/Documents/DT App/app-saves`
   when Jonah asks for a full save or backup.

## Current Product State

Sharp Study is a React and Firebase learning platform originally built around
A-level Design Technology. It is being evolved into a controlled pilot product
for schools, with student practice tools, teacher dashboards, assignment
tracking, account-manager licensing, and Super Admin simulation tools.

The app now has:

- Public landing page for Sharp Study with tiered licence messaging.
- Email/password Firebase Auth for real users.
- Localhost-only Super Admin shortcut gated by `REACT_APP_LOCAL_SUPER_ADMIN_KEY`.
- Student dashboard with memory decay, active assignments, quiz, Blitz, Match,
  Learn, Info, leaderboard, teacher messages, and class joining.
- Real Firebase teacher/student/admin sessions restore the last safe dashboard or
  class page after refresh. The local Super Admin shortcut still does not persist.
- Teacher dashboard with class cards, live-countdown class join codes,
  assignments, student
  progress overview, report centre, class settings, approved student list,
  teacher sharing, support automation rules, and activity/readiness charts.
- Account Manager role for the lead teacher on a licence.
- Shared teacher invitations for up to 5 teacher access spaces per class.
- Super Admin Control Panel, simulation lab, curriculum editor, and pilot smoke
  test console.
- Firestore security rules covering users, public profiles, curriculums,
  flagged content, licences, teacher access codes, class invites, class join
  codes, assignments, nudges, and student approvals.

The current implementation is still a pilot-stage product. Some sensitive flows
are client-orchestrated under Firestore rules. For a wider launch, onboarding and
seat allocation should move into Firebase Functions or another trusted backend.

## User Roles

### Student

Students can:

- Sign up with an approved school email and a fresh 60 minute class join code.
- Stay connected to the class after the code expires.
- Be removed from a class by a teacher, then rejoin later with a fresh valid
  code if approved.
- Practise multiple-choice flashcards.
- Use Memory Repair for decayed learned cards.
- Use Blitz, Match, Learn, Info, leaderboard, and assignments.
- See active assignment widgets and deadlines.
- Receive automated teacher messages from nudge/reward rules.
- Flag content issues anonymously for admin review.

Important current rule:

A student streak is currently extended by answering at least one flashcard recall
question on a new UTC day. Opening the app, leaving it running, or only viewing
content does not count. Written-answer engagement is recorded, but at the time
of this handover the streak update path is tied to flashcard answer processing.

### Solo Student

Solo students can study without teacher-linked class controls. They are mainly
useful for individual access or public/student-only testing.

### Teacher

Teachers can:

- View assigned classes.
- Generate 60 minute student join codes.
- Set assignments for chapters, subsections, or long-answer questions.
- Inspect student progress, readiness, support state, and assignment outcomes.
- Use report filters and copy report summaries/CSV.
- Remove students from classes.

Shared teachers can teach assigned classes but do not control licence-wide
settings unless promoted through licence admin fields.

### Account Manager

The Account Manager is the lead teacher who redeems a Super Admin school code.

Account Managers can:

- Create classes within licence limits.
- Rename classes.
- Approve student emails and import/export the approved student list.
- Manage subject access per class.
- Manage default and advanced class-specific support automation settings.
- Invite co-teachers to classes.

### Super Admin

The Super Admin is Jonah/system-owner level access.

Local development Super Admin access uses:

- Login ID: `admin`
- Password field checked against local development environment variable
  `REACT_APP_LOCAL_SUPER_ADMIN_KEY`

The actual key must never be committed or written into this file. Production
admin access uses a real Firebase-authenticated admin account instead of a
frontend key.

The local Super Admin shortcut is intentionally limited to localhost development
and is not persisted after browser refresh because the key must not be saved into
the browser as a long-lived master session. Real Firebase teacher/student/admin
accounts restore via Firebase Auth, user profile hydration, and the
`sharp_study_last_session` browser key.

Super Admin tools include:

- Environment mirroring and simulation lab.
- Student, teacher, and account-manager preview/simulation views.
- Mock class/student generation.
- Pilot smoke test console.
- Lead teacher school-code generator.
- Curriculum editor.
- Flagged-content review.

## Licence And Access Model

### Tier 1: Starter Pilot

Current intended shape:

- 30 day controlled trial.
- Sample Chapter 1 access.
- Around 30 answered questions per student per day.
- GCSE or A-level tagging.
- Teacher dashboards, assignments, analytics, and controlled class joining.
- One trial claim per school/domain to prevent repeated free use.

### Tier 2: School Core

Current intended shape:

- Full selected-subject access.
- No daily answer cap.
- Standard class/seat limits.
- Shared teacher access.
- Assignment engine.
- Report centre and class analytics.
- 365 day default licence duration.

### Tier 3: Trust / Enterprise

Current intended shape:

- Full selected-subject access.
- Larger class allocation.
- Trust or department level access.
- Longer default licence duration.
- Built for multi-school or larger organisation reporting.

## Core Data Model

### `users/{email}`

Stores private user profile and role state.

Important fields include:

- `name`
- `role`
- `classCode`
- `classId`
- `classIds`
- `classes`
- `licenseId`
- `accountManager`
- `schoolName`
- `progress` legacy map fallback
- `writtenProgress`
- `streak`
- `trialUsage`
- `xpTotal`
- `activeEngagements`
- `lastEngagementAt`
- `lastUpdated`

Student flashcard progress is primarily stored in:

`users/{email}/progress/{cardId}`

Current progress documents are validated by Firestore rules against the memory
model fields used by `sharp-dsr-1`: `baseMastery`, `consecutiveCorrect`,
`lastSeen`, `status`, and optional scheduling fields such as `difficulty`,
`dueAt`, `lapses`, `lastMode`, `memoryModelVersion`,
`retrievabilityAtReview`, `reviews`, and `stabilityDays`. Students can only
write their own progress records, extra fields are rejected, and updates cannot
move `lastSeen` backwards.

### `public_profiles/{email}`

Small public/leaderboard-safe projection.

Used for teacher/class visibility and leaderboard display. It should not contain
private answer detail or sensitive data beyond what is needed for class display.

### `licenses/{licenseId}`

Licence and school allocation document.

Important fields include:

- `school_name`
- `tier`
- `qualification`
- `unlocked_subjects`
- `unlocked_chapters`
- `daily_answer_limit`
- `max_classes`
- `max_seats_per_class`
- `max_student_seats`
- `ownerId`
- `teacherIds`
- `adminIds`
- `classes`
- `status`
- `trialStartsAt`
- `trialEndsAt`
- `expiresAt`
- `trialClaimId`

Approved student seats are stored under:

`licenses/{licenseId}/approved_students/{studentEmail}`

### `teacher_access_codes/{CODE}`

One-time lead teacher onboarding codes created by Super Admin.

Important fields include:

- `targetTeacherEmail`
- `schoolName`
- `tier`
- `qualification`
- `subjectIds`
- `maxClasses`
- `maxSeatsPerClass`
- `maxStudentSeats`
- `trialDays`
- `dailyAnswerLimit`
- `unlockedChapterIds`
- `status`
- `expiresAt`
- `redeemedAt`
- `redeemedBy`

Current note:

Live code creation requires a real Firebase admin session. If Super Admin is
only using the local `admin` shortcut, the app may generate an inactive preview.
That preview is explicitly marked as not usable.

### `trial_claims/{schoolDomainOrClaimId}`

Used for Tier 1 one-school-one-trial logic.

Tier 1 daily answer usage is stored on the student user profile as
`trialUsage`. Rules now validate the shape and prevent same-day decreases or
multi-answer jumps, but the day window is still client-orchestrated. Before a
large launch, move answer usage accounting to a backend function for stronger
server-time enforcement.

### `class_join_codes/{CODE}`

60 minute student join codes.

Important behaviour:

- Teachers generate a code from a class card.
- Code expires after 60 minutes.
- Expiry stops new joins only.
- Existing class membership remains.
- Student signup requires both valid code and approved email.
- Students can check a known active code by exact document ID.
- Students cannot broadly list the `class_join_codes` collection.
- Teachers can list their own generated codes with a `createdBy == email`
  query.

### `class_invites/{inviteId}`

Co-teacher invite flow.

Important fields include:

- `targetTeacherEmail`
- `invitedBy`
- `licenseId`
- `classId`
- `className`
- `classRecord`
- `status`
- `createdAt`

### `assignments/{assignmentId}`

Assignment engine.

Important fields include:

- `classId`
- `className`
- `subjectId`
- `targetType`
- `targetId`
- `targetLabel`
- `deadline`
- `targetMastery`
- `status`
- `completedBy`
- timestamps and owner fields

Assignment attempts may be combined from assignment maps and student progress.

### `nudges/{nudgeId}`

Student-facing automated support/reward messages.

During the pilot these are prepared from visible activity and support rules.
Rules are designed so teachers configure parameters rather than manually
pressing nudge buttons.

### `curriculums/{subjectId}`

Dynamic curriculum documents.

Current shape:

- subject metadata
- chapters
- subsections
- flashcard questions
- written questions
- image URLs
- immutable IDs

Legacy `src/data.js` remains the fallback/seed data source.

### `flagged_content/{flagId}`

Anonymous student content feedback.

Used for:

- Flashcard error reports.
- Written question issue reports.
- Auto-marking review requests.

The report includes content ID and class/school context, but should avoid
exposing student email to ordinary review surfaces.

## Key Local Files

### App Shell

- `src/App.js`
  Main application shell, routing state, role dashboards, simulation lab,
  teacher tools, assignment engine, login/signup, Firebase sync, licence logic,
  class join codes, reports, and support UI.

- `src/styles.css`
  Main visual system, responsive layout, glass panels, dashboard charts, tables,
  modals, loading screen, landing page, and accessibility/hover polish.

- `src/index.js`
  React entrypoint.

- `src/firebase.js`
  Firebase app initialization.

### Learning Engine

- `src/memoryModel.js`
  Memory decay model `sharp-dsr-1`.

- `src/studentSupportAlgorithm.js`
  Exam readiness, XP efficiency, support action, and engagement analysis.

- `src/answerEngine.js`
  Multiple-choice distractor generation and written-answer keyword marking.

- `src/components/QuizCards.js`
  Flashcard and written question UI, multiple-choice answer selection, flag
  error, and marking-review request.

- `src/components/MasteryRing.js`
  Visual mastery component.

- `src/components/AdminCurriculumEditor.js`
  Admin GUI for curriculum/question editing while preserving immutable IDs.

### Tests And QA

- `src/memoryModel.test.js`
- `src/memoryModelSimulation.test.js`
- `src/memoryModelBulkSimulation.test.js`
- `src/studentSupportAlgorithm.test.js`
- `src/answerEngine.test.js`
- `src/pilotSecurity.test.js`
- `src/firestoreRules.emulator.test.js`

### Rules And Backend-Ready Code

- `firestore.rules`
  Current live security rules.

- `future-functions/teacher-onboarding/`
  Saved Firebase Functions version of teacher onboarding for later Blaze upgrade.
  This is intentionally not live on the Spark/free Firebase plan.

### Documentation

- `README.md`
  Architecture ledger and current implementation notes.

- `docs/MEMORY_MODEL_DEEP_ANALYSIS_AND_ALGORITHM_REVIEW_2026-07-23.md`
- `docs/MEMORY_MODEL_INTENSIVE_QA_2026-07-23.md`
- `docs/MEMORY_MODEL_SIMULATION_REVIEW_2026-07-23.md`
- `docs/MEMORY_MODEL_TWO_YEAR_BULK_QA_2026-07-23.md`

### Local Legal/IP Files

Currently present but untracked at the time of this handover:

- `COPYRIGHT_IP_FILE_2026-07-21.md`
- `COPYRIGHT_IP_FILE_2026-07-21.docx`
- `legal/LEGAL_IMPLEMENTATION_CHECKLIST_2026-07-22.md`

These are local evidence/legal planning documents. Do not commit or delete them
unless Jonah explicitly asks.

## Memory Model Summary

The memory model is in `src/memoryModel.js`.

Version:

`sharp-dsr-1`

Main ideas:

- Each card has a memory record.
- Correct answers raise base mastery and stability.
- Incorrect answers reduce base mastery and stability, and increase lapses.
- Mastery decays over time using a forgetting curve.
- Different modes have different profiles:
  - flashcard
  - blitz
  - essay/written
- Memory Repair targets learned cards whose current mastery is below the target.

The model was validated with focused simulations and a 50-student two-year bulk
simulation. Supporting review files are in `docs/`.

## Exam Readiness And XP

XP is intentionally not a grade.

The current model treats XP as engagement evidence. Exam Readiness is the
teacher-facing learning signal and combines:

- course coverage
- current mastery
- refresh load
- assignment outcomes
- activity consistency
- support/nudge response signals

This lives in `src/studentSupportAlgorithm.js`.

Important concept:

High XP plus weak readiness means the student may be busy but not learning
securely. Low XP plus strong readiness means they may be efficient. Low XP plus
weak readiness means they likely need support.

## Current Beta Notes From Anja

Recently addressed after commit `a441f9c`:

- Login fields now keep labels visible after typing.
- Email input strips spaces and lowercases while typing.
- Class and teacher code inputs uppercase while typing.
- Inactive Super Admin preview codes are clearly marked as not usable.
- Account Manager can invite a teacher from the class view.
- Nudge/reward timing settings use dropdowns rather than fiddly number inputs.
- Student overview modal scrolls to the top when opened.
- Student dashboard includes a clear explanation of coverage, mastery, active
  decay, Memory Repair, and streaks.
- Report filter labels and summaries use readable text rather than raw internal
  values.
- Real Firebase accounts restore their last safe page on refresh.
- Student detail popups lock page scroll and open at the top of the modal.
- Student join code cards now show a live seconds countdown, hide expired codes,
  block copying expired codes, and include a Close Code action.

Needs manual review with a real beta tester:

- Whether the report filters now feel understandable.
- Whether random letters in email were user/device error or a remaining UI issue.
- Whether the live Firebase admin account can create usable lead teacher codes.
- Whether the actual deployed app layout is visually correct on the tester's
  laptop/phone, since the sandbox could not run a browser visual check.

## Open Product Tasks

High priority:

1. Run real beta smoke test with Anja using the deployed app.
2. Confirm Vercel deployment for the latest pushed commit.
3. Verify live lead teacher code creation while signed in as the Firebase admin
   user, not the local Super Admin shortcut.
4. Verify class join code flow:
   - Account Manager approves student email.
   - Teacher generates 60 minute class join code and confirms the live countdown.
   - Student signs up with matching approved email and code.
   - Student remains in class after code expiry.
   - Teacher removes student.
   - Student can rejoin with fresh code if still approved.
5. Decide whether written answers should extend streaks. Currently flashcard
   recall answers extend streaks.
6. Decide whether teachers should be allowed to edit student display names.
   This has safeguarding implications and should be asked during pilot feedback.

Medium priority:

1. Improve Report Centre based on teacher tester feedback.
2. Add more in-app explanations for:
   - readiness
   - mastery
   - refresh load
   - coverage
   - assignment status
   - nudge/reward rules
3. Continue visual polish on small/mobile screens.
4. Expand GCSE curriculum support.
5. Plan real privacy policy, terms, consent, and data processing documentation
   before wider pilot use.
6. Plan Firebase backup/export strategy.

Later/backend priority:

1. Move teacher onboarding, seat allocation, and one-time code redemption into
   trusted server-side code.
2. Consider scheduled Firestore exports/backups. This may require paid Google
   Cloud/Firebase features depending on the final method.
3. Build safer billing/payment/licence automation.
4. Consider AI-assisted answer marking only after privacy, cost, and safeguards
   are designed.

## Security State

Current strengths:

- No hardcoded Super Admin password in source.
- Local Super Admin shortcut is development and localhost only.
- Production admin access relies on Firebase Auth plus `role: "admin"`.
- Local Super Admin shortcut excluded from Firestore sync loops.
- Firestore rules define role/member checks.
- Students need both approved email and fresh class join code for school signup.
- Teacher lead-code flow is targeted to a teacher email.
- Shared teacher flow is invite-based.
- Flagged content is designed to avoid exposing student email in ordinary admin
  review surfaces.
- Static security checks exist in `src/pilotSecurity.test.js`.
- Firestore emulator rules test file exists.

Known limitations:

- Some onboarding and seat allocation logic is still client-orchestrated and
  rule-protected. This is acceptable for a small trusted pilot, but not ideal for
  scale.
- Firebase Functions deployment would require Blaze. A future-functions version
  is saved but not deployed.
- A formal privacy policy, terms, data retention policy, and school data
  processing agreement are not complete.
- Live penetration testing has not yet been performed.
- Browser visual verification can be blocked by the Codex sandbox; use manual
  browser tests when needed.

## Deployment And Environment

### Local Dev

```bash
cd "/Users/jonahss/Documents/DT App/DesignTechnologyA-level"
npm start
```

If binding to all interfaces fails:

```bash
HOST=127.0.0.1 npm start
```

### Tests

```bash
cd "/Users/jonahss/Documents/DT App/DesignTechnologyA-level"
npm test -- --watchAll=false
```

### Production Build

```bash
cd "/Users/jonahss/Documents/DT App/DesignTechnologyA-level"
npm run build
```

### Firestore Rules

Deploy rules only from the project directory:

```bash
cd "/Users/jonahss/Documents/DT App/DesignTechnologyA-level"
npx firebase-tools@latest deploy --only firestore:rules --project dt-study-hub
```

Run emulator rules tests if Java is installed:

```bash
npm run test:rules
```

### Push To GitHub / Trigger Vercel

```bash
cd "/Users/jonahss/Documents/DT App/DesignTechnologyA-level"
git status --short
git add <changed files>
git commit -m "Clear commit message"
git push origin main
```

Vercel should deploy after `main` is pushed.

## Physical Backup Plan

Backups should live in:

`/Users/jonahss/Documents/DT App/app-saves`

Use two backup types:

1. Git bundle
   - Complete Git history up to the saved commit.
   - Best for restoring the repository exactly.

2. Source zip
   - Source snapshot that another AI/human can inspect without Git.
   - Should exclude `node_modules`, build artifacts unless specifically needed,
     `.env*`, and other secrets.

Recommended naming pattern:

`SharpStudy-git-YYYY-MM-DD-<shortsha>.bundle`

`SharpStudy-source-YYYY-MM-DD-<shortsha>.zip`

Recommended commands:

```bash
cd "/Users/jonahss/Documents/DT App/DesignTechnologyA-level"
SHORT_SHA=$(git rev-parse --short HEAD)
SAVE_DIR="/Users/jonahss/Documents/DT App/app-saves"
git bundle create "$SAVE_DIR/SharpStudy-git-$(date +%F)-$SHORT_SHA.bundle" --all
git archive --format=zip --output="$SAVE_DIR/SharpStudy-source-$(date +%F)-$SHORT_SHA.zip" HEAD
```

If local untracked legal/IP files need to be included in a separate backup, ask
Jonah first. Do not silently include sensitive or legal files in a normal source
zip.

## How To Restore From Backup

From git bundle:

```bash
git clone "/Users/jonahss/Documents/DT App/app-saves/SharpStudy-git-YYYY-MM-DD-SHA.bundle" SharpStudy-restored
cd SharpStudy-restored
npm install
npm test -- --watchAll=false
npm run build
```

From source zip:

```bash
unzip SharpStudy-source-YYYY-MM-DD-SHA.zip -d SharpStudy-source-restored
cd SharpStudy-source-restored
npm install
npm test -- --watchAll=false
npm run build
```

## What A Future AI Should Do First

1. Read this file.
2. Read `README.md`.
3. Run `git status --short`.
4. Check the latest commit:

```bash
git log -5 --oneline
```

5. Inspect the files relevant to the requested task.
6. Do not revert user changes or untracked legal/IP files.
7. Do not expose or commit secrets.
8. Keep changes small, tested, and committed with clear messages.

## Change Log

### 2026-07-28

- Created initial live handover system.
- Documented current Sharp Study architecture, roles, data models, algorithms,
  security state, open tasks, deployment commands, and physical backup method.
- Baseline app commit before this handover file was added: `a441f9c`.
- Added reload session restore for real Firebase users, a top-opening student
  detail modal, and live-countdown class join code controls.
