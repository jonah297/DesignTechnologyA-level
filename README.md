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

The app now treats Firestore `curriculums/{subjectId}` documents as the live curriculum source, with the legacy Design Technology data retained as a safe fallback and seed payload. Each curriculum document stores subject metadata plus chapter, subsection, flashcard, and written-question arrays.

**Directive 24: Immutable Question IDs & Live Editing**

Status: Implemented in `src/components/AdminCurriculumEditor.js`.

Admins can edit flashcard text, answer text, written questions, mark schemes, marks, and image URLs. The editor displays each content ID as immutable and never exposes it as an editable field, preserving historical progress keys such as `progress[cardId]`.

**Directive 25: Student Feedback Loop**

Status: Implemented in `src/components/QuizCards.js` and `src/App.js`.

Flashcard and written quiz cards now include a Flag Error action. Student reports write to Firestore `flagged_content` with the content ID, subject ID, content type, student ID, comment, status, and timestamp.

### Section I: Enterprise Licensing & Seat Management

**Directive 26: The B2B License Schema**

Status: Rules and client model implemented.

The app supports Firestore `licenses/{licenseId}` documents containing `school_name`, `unlocked_subjects`, `max_classes`, `max_seats_per_class`, ownership/member fields, and class allocation records.

**Directive 27: IT / Teacher Allocation Dashboard**

Status: Implemented in `src/App.js`.

Teachers with an attached license can create classes within the license limit, see consumed seats, and lock or unlock licensed subjects per class. Class cards now surface seat usage and active subject access alongside assignment progress.
