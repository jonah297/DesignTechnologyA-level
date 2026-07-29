# Sharp Study

React/Firebase revision app for Design & Technology A-level study, teacher analytics, assignments, and mastery-based spaced retrieval.

## Architecture Ledger

### Section B: React Lifecycle & Memory Optimizations

**Directive 22: Hidden Super-Admin Control Panel & Environment Mirroring System**

Status: Implemented in `src/App.js`.

The root administrator can open a dedicated `admin-control` workspace with a localhost-only development shortcut gated by `REACT_APP_LOCAL_SUPER_ADMIN_KEY`. Production admin access must use a real Firebase-authenticated admin user. The local admin session is not restored from local storage, and the root identity is excluded from Firestore profile, progress, assignment, XP, and engagement writes.

The control panel includes:

- A secure access status card for the local-only Super Admin shortcut and live Firebase admin write state.
- A mock data generator that creates three isolated test classes and five balanced test students in local React state only.
- An interface simulator that can switch into the student `menu` view or the `teacher-dashboard` view without logging out.
- A persistent floating return control shown only during a verified root-admin session.

### Section H: The Curriculum Architect

**Directive 23: Dynamic Curriculum Database**

Status: Initial migration implemented in `src/App.js`.

Sharp Study now treats Firestore `curriculums/{subjectId}` documents as the live curriculum source, with the legacy Design Technology data retained as a safe fallback and seed payload. The secure storage model is `chapter-subcollections-v1`: parent curriculum documents store subject metadata only, while chapters, subsections, flashcard arrays, and long-answer questions live under `curriculums/{subjectId}/chapters/{chapterId}` subcollections. Student and teacher dashboards show a compact curriculum version badge so trial evidence can be tied back to the exact exam-board/content version in use.

Normal users load exact curriculum metadata documents for licensed subjects instead of listing the full curriculum collection. Firestore rules reserve full curriculum listing for admins, block normal reads of legacy whole-subject curriculum documents that include all chapters, and enforce chapter-level access on the nested chapter/subsection/question documents. Tier 1 Chapter 1-only access is now enforceable by Firestore when the curriculum has been saved/imported in the split schema. The remaining transition caveat is the bundled `src/data.js` fallback, which keeps the app working before migrated Firestore content exists but should not be treated as final paid-content protection.

**Directive 24: Immutable Question IDs & Live Editing**

Status: Implemented in `src/components/AdminCurriculumEditor.js`.

Admins can edit flashcard text, answer text, written questions, mark schemes, marks, and image URLs. The editor displays each content ID as immutable and never exposes it as an editable field, preserving historical progress keys such as `progress[cardId]`.

The bulk import flow accepts `SHARPSTUDY_CURRICULUM_BLOCK_V1` JSON. Imports are normalised into the split Firestore schema, so future GCSE/A-level/exam-board datasets can be added without changing the app layout or changing existing immutable question IDs.

**Directive 25: Student Feedback Loop**

Status: Implemented in `src/components/QuizCards.js` and `src/App.js`.

Flashcard and written quiz cards now include a Flag Error action. Student reports write to Firestore `flagged_content` with the content ID, subject ID, content type, anonymous class/school context, comment, status, and timestamp. The admin review queue lets authorised reviewers add a short note and mark reports as resolved without exposing student email addresses.

Flagged-content writes are validated against the reporter's own role, class IDs, and licence ID so a user cannot file a report pretending to belong to a different class or school.

Public leaderboard/profile documents are also treated as projections, not free-form user data. Firestore rules require `public_profiles/{email}` writes to mirror the signed-in user's private `users/{email}` role, name, class IDs, and bounded XP/streak values, so a client cannot promote themselves to teacher visibility or claim a different class through the public profile layer.

Private `users/{email}` class records and `users/{email}/progress/{cardId}` progress records are stricter than public profiles. Teachers can read private student data only when the student shares one of their classes, the student belongs to the same licence, and that licence is still open. An expired teacher licence or same-looking class ID from another licence is not enough to read private student records.

### Section I: Enterprise Licensing & Seat Management

**Directive 26: The B2B License Schema**

Status: Rules and client model implemented.

The app supports Firestore `licenses/{licenseId}` documents containing `school_name`, `unlocked_subjects`, `unlocked_chapters`, `qualification`, `tier`, `daily_answer_limit`, `max_classes`, `max_seats_per_class`, ownership/member fields, class allocation records, and the school invite code that created the license. Tier 1 is a 30 day starter trial with sample Chapter 1 practice and a 30 answered-question daily cap for each student. Tier 2 is `school_core`: full selected-subject access, no daily answer cap, normal class/seat limits, assignments, analytics, shared-teacher access, and a 365 day default license length. Tier 3 is `trust_enterprise`: full selected-subject access, no daily answer cap, larger department/trust-scale class allocation, and a 1095 day default license length.

Licence manager updates are limited to class allocation data and cannot directly add arbitrary `teacherIds`. Approved Student List records now split create, manager update, and student-join update permissions so email, licence, created-at, and created-by fields remain locked after creation.

**Directive 27: IT / Teacher Allocation Dashboard**

Status: Implemented in `src/App.js`.

Teachers with an attached license can create classes within the license limit, see consumed seats, and lock or unlock licensed subjects per class. The lead teacher is the Account Manager; shared teachers can teach assigned classes while the Account Manager controls class names, subject access, support rules, and co-teacher invites.

### Lead Teacher School Codes

Teacher sign-up no longer uses a shared source-code key. On the free-plan route, a lead teacher needs a targeted `teacher_access_codes/{CODE}` Firestore document assigned to their email. For Tier 1 only, Super Admin code creation also reserves a `trial_claims/{schoolDomain}` record so the same school/domain cannot quietly receive repeated starter trials. Firestore rules validate the code and, when applicable, the reserved claim while the app creates the license, marks the teacher as Account Manager, marks the code redeemed, and marks the Tier 1 claim used. Tier 2 School Core and Tier 3 Trust & Enterprise codes skip the trial claim and create active paid-license records with full selected-subject access. Shared teachers can sign up from a pending `class_invites/{inviteId}` record for the same email address, then accept the class inside the teacher dashboard. Shared-teacher class access is tied to the pending invite and accepted in a batched write. A server-side Firebase Functions version is saved in `future-functions/teacher-onboarding/` for a later Blaze-plan upgrade.

Targeted teacher access codes and trial-claim records are exact-read only for the assigned signed-in teacher. Broad collection listing is Super Admin only. Redeeming a teacher access code can only mark the assigned code as redeemed; it cannot change the licence ID or redirect the code to another licence.

The Super Admin `Admin Control` view now includes **Lead Teacher School Codes** so the owner can generate targeted one-time Tier 1, Tier 2, or Tier 3 codes in the app. Live code creation still requires a real Firebase admin session, such as `dthub.app@gmail.com` with `role: "admin"` in `users/{email}`; the local `admin` shortcut remains useful for private simulation and layout QA.

### Pilot Student Join Codes

Students now join classes with a teacher-generated `class_join_codes/{CODE}` document. Codes expire after 60 minutes for new joins, with a live countdown on the teacher class card and a Close Code control for manually revoking a still-active code. Expiry or manual closure does not remove students who have already joined. Teachers can remove a student from a class; the student loses that class access but can rejoin with a fresh valid join code.

Firestore rules now allow students to check a known active join code by exact document ID, but block broad listing of the `class_join_codes` collection. Teachers can still list their own generated codes by querying `createdBy == their signed-in email`.

Teacher operational writes now have the same licence boundary. Creating join codes, class invites, nudges, and assignments requires the signed-in teacher's active licence, the target class to be one of their classes, and, for assignments, an unlocked subject, a future deadline, and a target mastery between 1 and 100.

Assignment reads are also licence-scoped: teachers and students can read active assignment documents only through their own open licence and class membership. This prevents expired accounts or a reused class identifier from viewing another school's assignment data.

The Account Manager dashboard now includes an **Approved Student List** with one-by-one approval plus CSV import/export. Approved student school emails consume allocated student seats before signup, for example `40/60 student seats allocated`, and student signup/rejoin requires both a valid class join code and a matching approved school email. When a student first joins, the approval is bound to the signed-in Firebase Auth UID using `claimedUid`, so a later recycled account cannot quietly reclaim the same joined seat. Students without a class can still create a solo study account by choosing "I am studying alone"; that path is not attached to teacher analytics or a school class. For public launch, seat claiming should move to a backend function so seat counting, duplicate claims, and account claiming are fully atomic.

### Student Answer Engine

Flashcard quiz and Blitz cards now use a deterministic four-option multiple-choice engine. Distractors are pulled from the same subsection first, then the wider chapter and subject, so wrong answers remain curriculum-relevant without changing immutable card IDs. Written questions use a local keyword marker against the saved mark-scheme points, show matched and missing points, and offer an anonymous marking-review report when a student believes a valid answer has been missed.

### Firestore Rules Testing

The project includes static pilot security checks in `src/pilotSecurity.test.js` and a real local emulator suite in `src/firestoreRules.emulator.test.js`.

The emulator suite covers targeted teacher access codes, Tier 1/Tier 2/Tier 3 license creation, approved student signup, UID-bound joined-seat claims, known-code class joining, public profile projection checks, private user/progress read scoping, split-schema curriculum metadata/chapter reads, anonymous feedback with class/licence validation, active-licence teacher operational writes, licence update boundaries, approved-student immutable fields, assignment attempts, current memory-model progress records, and monotonic trial answer usage. Pure Firestore rules cannot fully prove server time for client-provided daily usage windows, so a backend redemption/usage function remains the stronger post-pilot upgrade.

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

The pilot blind-test script is saved in `PILOT_BLIND_TEST_RUNBOOK.md`. The Super Admin app now also exposes a **Pilot Smoke Test Console** with the same staged checklist, local pass/fix tracking, tester notes, reset, and copyable run-sheet output, so the owner can run a live teacher/student rehearsal without hunting through project notes. The console is split by role: the owner handles Super Admin setup and observation, while teacher and student testers complete normal workflows. The smoke-test state is saved only in the browser with `localStorage`; it does not write test results to Firebase.

### Multi-Class Reporting

Teachers now have a **Report Centre** from the Educator Command Center. It gives a read-only account-wide view across connected classes with class, subject, date, assignment-window, progress, mastery, and last-active filters. It avoids student emails in the report cards and can copy a readable summary or CSV including closed assignment history: on-time, late, and not-completed outcomes.
