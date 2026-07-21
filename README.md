# D&T Hub

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

The app now treats Firestore `curriculums/{subjectId}` documents as the live curriculum source, with the legacy Design Technology data retained as a safe fallback and seed payload. Each curriculum document stores subject metadata plus chapter, subsection, flashcard, and written-question arrays. Student and teacher dashboards show a compact curriculum version badge so trial evidence can be tied back to the exact exam-board/content version in use.

**Directive 24: Immutable Question IDs & Live Editing**

Status: Implemented in `src/components/AdminCurriculumEditor.js`.

Admins can edit flashcard text, answer text, written questions, mark schemes, marks, and image URLs. The editor displays each content ID as immutable and never exposes it as an editable field, preserving historical progress keys such as `progress[cardId]`.

**Directive 25: Student Feedback Loop**

Status: Implemented in `src/components/QuizCards.js` and `src/App.js`.

Flashcard and written quiz cards now include a Flag Error action. Student reports write to Firestore `flagged_content` with the content ID, subject ID, content type, anonymous class/school context, comment, status, and timestamp. The admin review queue lets authorised reviewers add a short note and mark reports as resolved without exposing student email addresses.

### Section I: Enterprise Licensing & Seat Management

**Directive 26: The B2B License Schema**

Status: Rules and client model implemented.

The app supports Firestore `licenses/{licenseId}` documents containing `school_name`, `unlocked_subjects`, `max_classes`, `max_seats_per_class`, ownership/member fields, class allocation records, and the pilot invite code that created the trial license.

**Directive 27: IT / Teacher Allocation Dashboard**

Status: Implemented in `src/App.js`.

Teachers with an attached license can create classes within the license limit, see consumed seats, and lock or unlock licensed subjects per class. The lead teacher is the Account Manager; shared teachers can teach assigned classes while the Account Manager controls class names, subject access, support rules, and co-teacher invites.

### Pilot Teacher Access Codes

Teacher sign-up no longer uses a shared source-code key. On the free-plan route, a lead teacher needs a targeted `teacher_access_codes/{CODE}` Firestore document assigned to their email. Firestore rules validate the code while the app creates the pilot license, marks the teacher as Account Manager, and marks the code redeemed. Shared teachers can sign up from a pending `class_invites/{inviteId}` record for the same email address, then accept the class inside the teacher dashboard. Shared-teacher class access is tied to the pending invite and accepted in a batched write. A server-side Firebase Functions version is saved in `future-functions/teacher-onboarding/` for a later Blaze-plan upgrade.

The Super Admin `Admin Control` view now includes **Lead Teacher Pilot Codes** so the owner can generate those targeted one-time codes in the app. Live code creation still requires a real Firebase admin session, such as `dthub.app@gmail.com` with `role: "admin"` in `users/{email}`; the local `admin` shortcut remains useful for private simulation and layout QA.

### Pilot Student Join Codes

Students now join classes with a teacher-generated `class_join_codes/{CODE}` document. Codes expire after 60 minutes for new joins, but expiry does not remove students who have already joined. Teachers can remove a student from a class; the student loses that class access but can rejoin with a fresh valid join code.

The Account Manager dashboard now includes an **Approved Student List** with one-by-one approval plus CSV import/export. Approved student school emails consume allocated student seats before signup, for example `40/60 student seats allocated`, and student signup/rejoin requires both a valid class join code and a matching approved school email. For public launch, this should move to a backend function so seat counting, duplicate claims, and account claiming are atomic.

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
