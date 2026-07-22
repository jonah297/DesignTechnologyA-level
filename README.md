# Sharp Study

React/Firebase revision app for Design & Technology A-level study, teacher analytics, assignments, and mastery-based spaced retrieval.

## Architecture Ledger

### Section B: React Lifecycle & Memory Optimizations

**Directive 22: Hidden Super-Admin Control Panel & Environment Mirroring System**

Status: Implemented in `src/App.js`.

The root administrator can open a dedicated `admin-control` workspace after passing `REACT_APP_SUPER_ADMIN_KEY`. The admin session is not restored from local storage, and the root identity is excluded from Firestore profile, progress, assignment, XP, and engagement writes.

The control panel includes:

- A secure access status card for the configured super-admin key.
- A mock data generator that creates three isolated test classes and five balanced test students in local React state only.
- An interface simulator that can switch into the student `menu` view or the `teacher-dashboard` view without logging out.
- A persistent floating return control shown only during a verified root-admin session.

### Section H: The Curriculum Architect

**Directive 23: Dynamic Curriculum Database**

Status: Initial migration implemented in `src/App.js`.

Sharp Study now treats Firestore `curriculums/{subjectId}` documents as the live curriculum source, with the legacy Design Technology data retained as a safe fallback and seed payload. Each curriculum document stores subject metadata plus chapter, subsection, flashcard, and written-question arrays. Student and teacher dashboards show a compact curriculum version badge so trial evidence can be tied back to the exact exam-board/content version in use.

**Directive 24: Immutable Question IDs & Live Editing**

Status: Implemented in `src/components/AdminCurriculumEditor.js`.

Admins can edit flashcard text, answer text, written questions, mark schemes, marks, and image URLs. The editor displays each content ID as immutable and never exposes it as an editable field, preserving historical progress keys such as `progress[cardId]`.

**Directive 25: Student Feedback Loop**

Status: Implemented in `src/components/QuizCards.js` and `src/App.js`.

Flashcard and written quiz cards now include a Flag Error action. Student reports write to Firestore `flagged_content` with the content ID, subject ID, content type, anonymous class/school context, comment, status, and timestamp. The admin review queue lets authorised reviewers add a short note and mark reports as resolved without exposing student email addresses.

### Section I: Enterprise Licensing & Seat Management

**Directive 26: The B2B License Schema**

Status: Rules and client model implemented.

The app supports Firestore `licenses/{licenseId}` documents containing `school_name`, `unlocked_subjects`, `unlocked_chapters`, `qualification`, `tier`, `daily_answer_limit`, `max_classes`, `max_seats_per_class`, ownership/member fields, class allocation records, and the school invite code that created the license. Tier 1 is a 14 day starter trial with sample Chapter 1 practice and a 30 answered-question daily cap for each student. Tier 2 is `school_core`: full selected-subject access, no daily answer cap, normal class/seat limits, assignments, analytics, shared-teacher access, and a 365 day default license length. Tier 3 is `trust_enterprise`: full selected-subject access, no daily answer cap, larger department/trust-scale class allocation, and a 1095 day default license length.

**Directive 27: IT / Teacher Allocation Dashboard**

Status: Implemented in `src/App.js`.

Teachers with an attached license can create classes within the license limit, see consumed seats, and lock or unlock licensed subjects per class. The lead teacher is the Account Manager; shared teachers can teach assigned classes while the Account Manager controls class names, subject access, support rules, and co-teacher invites.

### Lead Teacher School Codes

Teacher sign-up no longer uses a shared source-code key. On the free-plan route, a lead teacher needs a targeted `teacher_access_codes/{CODE}` Firestore document assigned to their email. For Tier 1 only, Super Admin code creation also reserves a `trial_claims/{schoolDomain}` record so the same school/domain cannot quietly receive repeated starter trials. Firestore rules validate the code and, when applicable, the reserved claim while the app creates the license, marks the teacher as Account Manager, marks the code redeemed, and marks the Tier 1 claim used. Tier 2 School Core and Tier 3 Trust & Enterprise codes skip the trial claim and create active paid-license records with full selected-subject access. Shared teachers can sign up from a pending `class_invites/{inviteId}` record for the same email address, then accept the class inside the teacher dashboard. Shared-teacher class access is tied to the pending invite and accepted in a batched write. A server-side Firebase Functions version is saved in `future-functions/teacher-onboarding/` for a later Blaze-plan upgrade.

The Super Admin `Admin Control` view now includes **Lead Teacher School Codes** so the owner can generate targeted one-time Tier 1, Tier 2, or Tier 3 codes in the app. Live code creation still requires a real Firebase admin session, such as `dthub.app@gmail.com` with `role: "admin"` in `users/{email}`; the local `admin` shortcut remains useful for private simulation and layout QA.

### Pilot Student Join Codes

Students now join classes with a teacher-generated `class_join_codes/{CODE}` document. Codes expire after 60 minutes for new joins, but expiry does not remove students who have already joined. Teachers can remove a student from a class; the student loses that class access but can rejoin with a fresh valid join code.

The Account Manager dashboard now includes an **Approved Student List** with one-by-one approval plus CSV import/export. Approved student school emails consume allocated student seats before signup, for example `40/60 student seats allocated`, and student signup/rejoin requires both a valid class join code and a matching approved school email. For public launch, this should move to a backend function so seat counting, duplicate claims, and account claiming are atomic.

### Student Answer Engine

Flashcard quiz and Blitz cards now use a deterministic four-option multiple-choice engine. Distractors are pulled from the same subsection first, then the wider chapter and subject, so wrong answers remain curriculum-relevant without changing immutable card IDs. Written questions use a local keyword marker against the saved mark-scheme points, show matched and missing points, and offer an anonymous marking-review report when a student believes a valid answer has been missed.

### Firestore Rules Testing

The project includes static pilot security checks in `src/pilotSecurity.test.js` and a real local emulator suite in `src/firestoreRules.emulator.test.js`.

Run the normal tests with:

```bash
npm test -- --watchAll=false
```

Run the Firestore emulator rules suite with:

```bash
npm run test:rules
```

The emulator suite requires Java 17 or newer. It uses fake local data and does not touch the live Firebase project.

### Blind Pilot Testing

The pilot blind-test script is saved in `PILOT_BLIND_TEST_RUNBOOK.md`. The Super Admin app now also exposes a **Pilot Smoke Test Console** with the same staged checklist and a copy button, so the owner can run a live teacher/student rehearsal without hunting through project notes. The console is split by role: the owner handles Super Admin setup and observation, while teacher and student testers complete normal workflows.
