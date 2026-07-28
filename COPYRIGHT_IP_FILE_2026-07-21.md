# Copyright Documentation and Intellectual Property File

## Title Page

**Project name:** D&T Hub / DesignTechnologyA-level  
**Document title:** Copyright Documentation and Intellectual Property File  
**Record date:** 21 July 2026  
**Timestamp captured during preparation:** 2026-07-21 13:46:52 BST  
**Local project path:** `/Users/jonahss/Documents/DT App/DesignTechnologyA-level`  
**Git repository:** `https://github.com/jonah297/DesignTechnologyA-level.git`  
**Branch:** `main`  
**Source snapshot commit:** `59585097cdec8b312917e0e3fe92bb4012049fad`  
**Firebase project:** `dt-study-hub`  
**Vercel project:** `design-technology-a-level`

### Copyright Declaration

Copyright (c) 2026 Jonah, project owner of D&T Hub / DesignTechnologyA-level. All rights reserved.

This file is prepared as a dated record of the original software, architecture, workflows, educational interaction design, data models, algorithms, user interface structure, documentation, and project-specific content selection and arrangement embodied in the D&T Hub application as of 21 July 2026.

The project owner asserts copyright ownership in the original code, original user workflows, original interface implementation, original architecture, original documentation, original authored educational content, proprietary data-model design, proprietary simulation design, proprietary learning-support logic, and the original compilation and arrangement of materials created for this application.

This record does not claim ownership over third-party software libraries, third-party platforms, browser APIs, Firebase, Vercel, GitHub, React, Create React App, Firebase SDKs, external exam board intellectual property, or any external source material that may be referenced for compatibility or curriculum mapping. Those rights remain with their respective owners. The copyright claim applies to the original implementation, authored content, compilation, structure, and product design created for D&T Hub.

This document is intended for private archival evidence. It is not a substitute for formal legal registration or professional legal advice.

**Owner signature:** ______________________________________  
**Printed name:** _________________________________________  
**Date signed:** __________________________________________

---

## Executive Summary

D&T Hub is a React and Firebase educational application designed to help A-level Design and Technology students study, practise, review, and strengthen long-term memory through structured retrieval practice. The application combines flashcards, written-answer practice, timed recall challenges, matching games, refresh questions, progress insights, class leaderboards, teacher-set assignments, mastery scoring, and automated support reminders.

The student side of the application is built around the idea that learning improves through repeated, active engagement rather than passive time spent on a page. Students work through curriculum content by chapter and subsection, reveal answers, self-mark flashcard responses, attempt written-answer questions, complete assigned work, view their rank, and monitor mastery. Student progress is tracked per question using stable content identifiers, allowing the app to preserve historical learning data even when question wording is edited later.

The teacher side of the application provides a class-management and analytics platform. Teachers can create and manage classes, generate short-lived student join codes, allocate approved student emails, invite co-teachers, set assignments by chapter, subsection, or long-answer question, define target mastery percentages, track whether assignments are active, overdue, complete, started, or not started, and inspect student topic progress. Teachers can view individual student drill-downs, parents' evening style progress summaries, assignment punctuality, mastery status, streaks, XP, and last active information.

The super-admin side of the application provides system-owner controls. It includes a hidden super-admin control panel, a curriculum editor, an anonymous flagged-content review queue, clean preview modes for student and teacher dashboards, and a simulation lab. The simulation lab allows mock schools, teachers, classes, students, assignments, progress patterns, nudges, rewards, time acceleration, and live telemetry to be tested without contaminating production Firestore data.

The product has evolved from a single-subject Design Technology revision tool into the early foundation of a white-label educational engine. It now includes support for Firestore-backed curriculums, multiple subjects, licensing structures, class seats, shared teacher access, account-manager permissions, one-time teacher access codes, approved student lists, 60-minute class join codes, anonymous student feedback, and a future-ready server-side onboarding path.

---

## Purpose of This File

This file records, in one place, the intellectual property embodied in the project as it exists on 21 July 2026. It is designed to be printed, signed, sealed, and archived as evidence of authorship and ownership at this point in time.

The file records:

- The application concept and educational purpose.
- The main user journeys and workflows.
- The roles and permissions model.
- The feature set currently present in the repository.
- The Firestore data structures and security architecture.
- The proprietary code inventory.
- The learning algorithms, assignment mechanics, simulation logic, and curriculum editor concepts.
- The current technical and deployment state.
- The boundaries between owned work and third-party dependencies.

---

## Product Identity

**Application name:** D&T Hub  
**Repository name:** DesignTechnologyA-level  
**Current primary subject:** A-level Design and Technology  
**Current default curriculum identifier:** `dt`  
**Current curriculum version label:** `pilot-2026-07`  
**Current deployment target:** Vercel web application connected to GitHub  
**Current database/auth target:** Firebase Authentication and Cloud Firestore  
**Current pilot project:** `dt-study-hub`

D&T Hub is intended to support classroom and independent revision for A-level Design and Technology. Its main educational goal is to help students keep knowledge active over time, identify weak areas, complete teacher-set preparation work, and give teachers a clear view of progress without requiring spreadsheet-heavy manual tracking.

---

## Core Product Principles

1. **Active recall over passive time:** The app rewards active engagement events such as revealing answers, submitting written answers, and completing tasks, not raw stopwatch time.

2. **Memory decay awareness:** Mastery is treated as something that can fade if a student does not revisit a topic, encouraging refresh work before knowledge becomes weak.

3. **Stable question IDs:** Each flashcard and written question has an immutable ID so historical progress remains linked even if question wording, mark schemes, or image URLs are edited.

4. **Teacher clarity:** Teachers should be able to see class progress, assignment status, and topic weakness without needing technical knowledge.

5. **Controlled pilot access:** Teachers and students enter through controlled invite and join mechanisms rather than open public signup.

6. **Production data protection:** Super-admin simulation and preview workflows are designed to avoid polluting real student progress, XP, assignments, or leaderboard metrics.

7. **Multi-tenant foundation:** The app supports school/license/class structures so different institutions and classes can be logically separated.

8. **White-label curriculum direction:** The curriculum model is no longer limited to hardcoded `data.js`; Firestore-backed curriculum documents support future subject and exam-board expansion.

---

## Feature Breakdown

### 1. Authentication and Account Access

- Email and password authentication through Firebase Authentication.
- Student signup flow.
- Teacher signup flow.
- Solo learner signup path.
- Existing-account login flow.
- Password visibility toggle.
- Light/dark theme toggle.
- Error messaging for invalid credentials and unsafe signup states.
- Local session handling for normal users.
- Special handling that prevents root super-admin sessions from being silently restored from local storage.
- Role-based routing after login.
- Root super-admin gate using `REACT_APP_SUPER_ADMIN_KEY`.
- Root super-admin identity constant: `admin`.
- Admin role recognition through Firestore user profile.
- Separation between teacher, account-manager, shared-teacher, student, solo, and super-admin capabilities.

### 2. Student Dashboard

- Student identity card with name, streak, XP, and active engagement count.
- Student rank display next to the student identity where class ranking is available.
- Top-three leaderboard treatment using first, second, and third visual ranking states.
- Curriculum version badge.
- Active assignment panel on the dashboard.
- Assignment countdown and due-status display.
- Active assignment mini-widget inside learning sessions such as quiz and blitz.
- Teacher message and nudge inbox.
- Mark-as-read handling for student nudges.
- Main menu with study navigation cards:
  - Learn.
  - Quiz.
  - Refresh Memory.
  - Match.
  - Info / Insights.
  - Blitz.
  - Ranks / Leaderboard.
- Protected student class access based on valid class membership.
- Support for students studying alone where applicable.

### 3. Learn Workflow

- Chapter-based curriculum browsing.
- Expandable chapters.
- Subsection-level content grouping.
- Flashcard review content.
- Curriculum data loaded from Firestore when available.
- Legacy Design Technology curriculum fallback from `src/data.js`.
- Clean hierarchy matching the broader curriculum architecture:
  - Subject.
  - Chapter.
  - Subsection.
  - Questions.

### 4. Quiz Workflow

- Chapter picker for quiz practice.
- Expandable chapter structure matching the Learn layout.
- Subsection quiz launch.
- Whole-chapter quiz launch.
- Long-answer questions shown beneath the expanded chapter where relevant.
- Flashcard quiz session.
- Remaining-question count.
- Show Answer interaction.
- Right/Wrong self-marking.
- Active engagement tracking when answers are revealed.
- Per-card progress updates.
- Assignment-aware quiz loading when a student opens an assigned task.
- Completion screen after quiz session.
- Flag Error button on quiz cards.

### 5. Written-Answer Workflow

- Written-question session for long-answer practice.
- Question mark value display.
- Student answer textarea.
- Show Mark Scheme interaction.
- Mark scheme points displayed as selectable checkboxes.
- Self-mark submission based on selected points.
- Score tracking as marks awarded against maximum marks.
- Written progress storage.
- Written assignment support.
- Image URL and reference-image support for questions.
- Flag Error button on written quiz cards.

### 6. Refresh Memory Workflow

- Refresh mode identifies decayed or weaker cards.
- Refresh packet generation from topics that need reinforcement.
- Memory-decay based prioritisation.
- Quiz session reuse for refresh questions.
- Supports the product principle that knowledge should be revisited before it disappears.

### 7. Match Game Workflow

- Matching-card game for definitions and related recall prompts.
- Randomised card selection.
- Pair-selection interaction.
- Matched-state tracking.
- Mismatch feedback.
- Completion state when all pairs are matched.

### 8. Blitz Workflow

- Timed practice challenge.
- Topic filter selection.
- Countdown timer.
- Score tracking.
- Active engagement and XP support.
- Completion screen.
- Active assignment mini-widget visible where relevant.
- Designed to reward short, consistent recall rather than long idle sessions.

### 9. Insights and Student Progress

- Student mastery dashboard.
- Mastery ring component.
- Chapter and topic progress display.
- Green, amber, red, and gold readiness-style status logic.
- Current streak and longest streak tracking.
- XP total.
- Active engagement count.
- Academic readiness graph in the parents' evening / PR review model.
- Student-facing view of whether they are on track against a target course timeline.

### 10. Leaderboard and XP Economy

- Class leaderboard.
- Student rank calculation.
- Top-three ranking display with special status for first, second, and third.
- XP awarded from task completion and active learning.
- XP formula based on:
  - Base task value.
  - Accuracy multiplier.
  - Active daily streak multiplier.
- Anti-cheat design that does not reward raw time with the tab open.
- Leaderboard designed to reward steady, repeated study rather than cramming.

### 11. Assignment Engine

- Firestore-backed `assignments` collection.
- Teacher-created assignments.
- Assignment target types:
  - Whole chapter.
  - Subsection.
  - Essay / long-answer question.
- Subject-aware assignment targets.
- Class-aware assignment targets.
- Deadline field.
- Target mastery percentage.
- Assignment status values such as active and cancelled.
- Deadline editing.
- Target mastery editing.
- Cancellation confirmation flow.
- Assignment label and short-label helpers.
- Assignment links that can load an assignment directly for a student.
- Student assignment panel.
- Teacher active assignments panel.
- Assignment completion calculated against target mastery.
- Completion only allowed when mastery is at or above the teacher-set target.
- Assignment completion subcollection for per-student completion evidence.
- Overdue, completed, started, and not-started interpretation for teacher dashboards.

### 12. Teacher Dashboard

- Educator Command Center.
- Trial/license status banner.
- Curriculum version badge.
- Classes shown at the top of the dashboard.
- Create Class flow when the license allows more classes.
- Class cards with seat counts.
- Class display-name editing.
- Compact class rename controls.
- Student join code panel on class cards.
- Generate Code button.
- Copy Code button.
- 60-minute class join-code expiry.
- Active assignments section on teacher dashboard.
- Assignment edit route into the relevant class.
- Shared Class Invitations panel for invited teachers.
- Account Manager only panels hidden from normal shared teachers.
- Shared teachers retain normal teaching powers for assigned classes.
- Teacher dashboard ordering designed around real use:
  - Trial/license information.
  - Classes.
  - Assignments.
  - Student list / class data.
  - Remaining management tools.

### 13. Class View

- Dynamic class view loaded from a selected class card.
- Student Progress Overview table.
- Professionalised naming away from informal "Roster" language.
- Table collapsing for large sections.
- Horizontal scrolling for dense tables on smaller screens.
- Student list sorted by rank/highest standing where implemented.
- Last active display instead of exposing excess activity text in crowded tables.
- Activity colour logic:
  - Recent activity treated positively.
  - Longer inactivity treated as watch/concern.
- Student name opens a detailed student modal.
- Student email hidden from main table and shown only in the selected student detail view.
- Assignment status visible per student.
- Low mastery and support-status badges.
- Remove student flow.
- Confirmation before sensitive actions.
- Assignment builder within class context.
- Assignment progress summary at top of class assignment view.

### 14. Student Detail and Drill-Down

- Student profile modal.
- Student name, streak, XP, email, and support indicators.
- Topic breakdown by chapter.
- Green, amber, red topic status.
- Assignment overview.
- Parents' Evening Snapshot / PR Review.
- Copyable parents' evening report.
- Print-friendly report support.
- Study mastery summary.
- Assignment punctuality summary:
  - Completed on time.
  - Completed late.
  - Not completed.
  - Active assignments ignored from final historical completion counts.
- On-track / watch / support-style interpretation.
- Academic readiness graph comparing real progress against a target line.

### 15. Account Manager Features

- Lead teacher becomes Account Manager for the subject/pilot license.
- Account Manager can create classes within the license limit.
- Account Manager can rename classes.
- Account Manager can manage subject access for classes.
- Account Manager can invite co-teachers.
- Account Manager can approve student school emails.
- Account Manager can import and export approved student CSV files.
- Account Manager can view consumed student seats.
- Account Manager can view used class count.
- Account Manager can set default nudge and reward automation rules.
- Account Manager can optionally use advanced per-class support settings.
- Shared teachers do not see Account Manager only controls.

### 16. Shared Teacher Access

- Co-teachers invited by email through `class_invites`.
- Shared teachers must sign up or log in using the exact invited email.
- Shared teachers can accept or decline pending class invitations.
- Shared teacher access is class-specific.
- Shared teachers can view assigned classes.
- Shared teachers can set assignments for assigned classes.
- Shared teachers can generate student join codes for assigned classes.
- Shared teacher access is capped in the interface at five teacher spaces per class including pending invites.
- Account Manager controls the wider license and class settings.

### 17. Student Join and Seat Allocation

- Approved Student List under license.
- Student school emails approved before signup or rejoin.
- CSV import for approved student setup.
- CSV export for audit/setup review.
- Seat usage displayed against purchased/allocated student seats.
- Student signup requires:
  - Valid Firebase Auth account.
  - Valid class join code.
  - Matching approved school email.
- Student join code documents expire after 60 minutes for new joins.
- Already joined students keep class access after join code expiry.
- Teachers can remove students from a class.
- Removed students lose class access.
- Removed students may rejoin using a fresh valid join code while still approved.
- Joined approval records are kept locked for audit safety.

### 18. Automated Nudges and Rewards

- Nudge system described to teachers as supportive reminders, not score changes.
- Reward system described as encouragement, not hidden marks.
- Class-level nudge and reward policies.
- Defaults applied across all classes.
- Advanced mode for per-class settings.
- Ability to disable entire systems or individual support triggers.
- Timing inputs fade and become uneditable when the related support feature is disabled.
- Automated assignment reminders.
- Automated study inactivity reminders.
- Automated streak warning reminders.
- Automated high-decay warnings.
- Automated assignment-success rewards.
- Automated streak rewards.
- Automated better-than-usual rewards.
- Teacher-facing support-status information shown in student tables and details.
- Manual nudge buttons removed from normal teacher workflows in favour of automation.

### 19. Super-Admin Control Panel

- Hidden `admin-control` view.
- Access gated by `REACT_APP_SUPER_ADMIN_KEY`.
- Secure access status card.
- Admin-only routing.
- Admin Curriculum Editor link.
- Simulation Lab link.
- Clean student preview option.
- Clean teacher preview option.
- Account Manager preview option.
- Persistent floating return control during root-admin sessions.
- Ability to switch between admin control, curriculum editor, simulation lab, student view, teacher view, and account-manager view.
- Root-admin production metric writes neutralised to avoid polluting live student records.

### 20. Admin Curriculum Editor

- Component file: `src/components/AdminCurriculumEditor.js`.
- Firestore-backed curriculum editing.
- Subject selector.
- Seed Design Technology Curriculum action.
- Bulk curriculum import.
- Import format name: `DTHUB_CURRICULUM_BLOCK_V1`.
- Full subject import from JSON.
- Supports exam board, specification, version, chapters, subsections, flashcards, and long-answer questions.
- Live question editor.
- Flashcard editor fields:
  - Front/question text.
  - Back/answer text.
  - Image URL.
- Written-question editor fields:
  - Topic.
  - Question.
  - Marks.
  - Mark scheme points.
  - Image URL.
  - Image required/reference field.
- Immutable IDs displayed but not editable.
- Chapter accordion interface.
- Long-answer questions grouped beneath chapters.
- Flagged content review queue.
- Review note field.
- Mark Resolved action.

### 21. Student Feedback Loop

- Flag Error button in flashcard quiz cards.
- Flag Error button in written quiz cards.
- Prompt asks student what looks wrong.
- Firestore `flagged_content` write.
- Reports store:
  - Anonymous flag.
  - Content ID.
  - Content type.
  - Subject ID.
  - Class IDs.
  - Class labels.
  - License ID.
  - School name.
  - Reporter role.
  - Comment.
  - Open status.
  - Created timestamp.
- Student email is not stored in new feedback records.
- Admin can review and resolve flags.
- Firestore rules restrict resolution fields.

### 22. Simulation Lab

- Super-admin simulation workspace.
- Random cohort generation.
- Multiple mock teachers.
- Multiple mock classes.
- Teachers with multiple classes.
- Account Manager simulation.
- Teacher simulation.
- Student simulation.
- Clean preview without simulation.
- Configurable simulation duration up to 365 days.
- Time multiplier concept where simulated time can run faster than real time.
- Persistent play/pause/speed control dock across simulation views.
- Floating controls independent of the page grid.
- Day/hour simulation display.
- Live student telemetry.
- Simulated assignment progress.
- Simulated student current activity.
- Simulated current question.
- Simulated progress updates.
- Support for varied student archetypes and behaviour patterns.
- Simulated students who slack, respond to nudges, improve, or continue under-engaging.
- Simulated nudge and reward effects.
- Simulation summary.
- Simulation log table.
- Collapsible large tables.
- CSV-style simulation data export/copy for analysis.
- State is local to the browser/admin session and not written to production student metrics.

### 23. Responsive and Visual Design

- Full-screen gradient background.
- Glass-panel visual style.
- Light and dark theme support.
- Responsive layout constraints.
- Mobile and tablet layout polish.
- Dense tables use horizontal scrolling rather than page overflow.
- Collapsible large panels to reduce clutter.
- Compact action buttons for repeated management tasks.
- Class cards and assignment panels adjusted for smaller screens.
- Visual QA completed locally across:
  - Desktop 1440 x 900.
  - Tablet 820 x 1180.
  - Phone 390 x 844.
- Known design direction: keep improving clarity so non-technical teachers can use the app without guidance.

---

## Data Models and Architecture

### Technical Stack

- React 19.
- React DOM 19.
- Create React App via `react-scripts` 5.
- Firebase JavaScript SDK 12.12.1.
- Firebase Authentication.
- Cloud Firestore.
- Vercel deployment from GitHub.
- Node 24.x configured in `package.json`.
- Main app router implemented in React state inside `src/App.js`.
- Firestore security rules defined in `firestore.rules`.
- Firebase deployment configuration defined in `firebase.json`.

### Primary Application Files

- `src/index.js`: React application entry point.
- `src/App.js`: Main application shell, router, state orchestration, dashboards, workflows, simulation, assignment engine, onboarding flows, Firestore reads/writes, XP, mastery, and class management.
- `src/firebase.js`: Firebase app initialisation and exports for Firestore and Authentication.
- `src/data.js`: Legacy Design Technology curriculum dataset used as fallback and seed data.
- `src/styles.css`: Global styling, responsive layout, theme variables, glass-panel UI, tables, cards, dashboards, simulation controls, mobile breakpoints.
- `src/components/AdminCurriculumEditor.js`: Curriculum editor, bulk import parser, immutable ID editing interface, flagged-content review.
- `src/components/QuizCards.js`: Flashcard and written-answer quiz cards, reveal/answer/flag interactions.
- `src/components/MasteryRing.js`: Circular mastery progress visual.
- `src/components/Skeleton.js`: Loading skeleton component.
- `src/pilotSecurity.test.js`: Regression tests for pilot security assumptions and source/rules wiring.
- `firestore.rules`: Firestore access-control policy.
- `future-functions/teacher-onboarding/`: Saved future Firebase Functions onboarding implementation for a paid Firebase Blaze upgrade.

### Firestore Collections

#### `users/{userId}`

Stores the primary user profile and learning/account data. In the current app, user IDs are normalised around email-style IDs where appropriate.

Key fields include:

- `name`.
- `role`.
- `classCode`.
- `classId`.
- `classIds`.
- `classes`.
- `licenseId`.
- `joinCodeId`.
- `schoolName`.
- `writtenProgress`.
- `streak`.
- `xpTotal`.
- `activeEngagements`.
- `lastEngagementAt`.
- `lastEngagementType`.
- `lastEngagementMeta`.
- `lastXP`.
- `lastAcceptedInviteId`.
- `lastUpdated`.

The `users` collection supports role-aware access. Students can write tightly constrained progress and engagement updates for themselves. Teachers and admins can read relevant class/student data according to rules. Delete is disabled in normal use.

#### `users/{userId}/progress/{cardId}`

Stores per-card mastery information.

Key fields include:

- `baseMastery`.
- `consecutiveCorrect`.
- `lastSeen`.
- `status`.

The `cardId` links progress to immutable curriculum question IDs. This is critical because it means question text can be edited without breaking existing student history.

#### `public_profiles/{userId}`

Stores limited public profile information for class-visible features such as rankings and class lists.

Key fields include:

- `name`.
- `role`.
- `classId`.
- `classIds`.
- `xpTotal`.
- `streak`.
- `updatedAt`.

The intent is to reduce the need to expose full user documents for social/class features.

#### `curriculums/{subjectId}`

Stores live subject curriculum documents.

Key fields include:

- `id`.
- `subject`.
- `subjectName`.
- `title`.
- `examBoard`.
- `specification`.
- `version`.
- `importFormat`.
- `chapters`.
- `writtenQuestions`.
- `updatedAt`.

Curriculum hierarchy:

1. Subject.
2. Chapter.
3. Subsection.
4. Flashcard questions.
5. Long-answer questions.

Admins can create, update, and delete curriculum documents. Signed-in users can read curriculums.

#### `flagged_content/{flagId}`

Stores anonymous content issue reports from students and teachers.

Key fields include:

- `anonymous`.
- `contentId`.
- `contentType`.
- `subjectId`.
- `classIds`.
- `classLabels`.
- `licenseId`.
- `schoolName`.
- `reporterRole`.
- `comment`.
- `status`.
- `createdAt`.
- `reviewedBy`.
- `reviewedAt`.
- `adminNote`.

The current design avoids storing student email in new feedback records.

#### `nudges/{nudgeId}`

Stores automated support or reward messages.

Key fields include:

- `targetUserId`.
- `targetName`.
- `classId`.
- `className`.
- `teacherId`.
- `teacherName`.
- `message`.
- `reason`.
- `assignmentIds`.
- `status`.
- `createdAt`.
- `readAt`.

Students can mark their own nudges as read. Teachers and admins can read relevant support messages.

#### `class_join_codes/{codeId}`

Stores teacher-generated codes that let approved students join or rejoin a class.

Key fields include:

- `code`.
- `classId`.
- `className`.
- `licenseId`.
- `schoolName`.
- `createdBy`.
- `createdByName`.
- `status`.
- `expiresAt`.
- `createdAt`.
- `updatedAt`.

Current expiry rule: 60 minutes for new joins.

#### `class_invites/{inviteId}`

Stores shared-teacher invitations.

Key fields include:

- `targetTeacherEmail`.
- `invitedBy`.
- `inviterName`.
- `licenseId`.
- `schoolName`.
- `classId`.
- `className`.
- `classRecord`.
- `status`.
- `createdAt`.
- `updatedAt`.
- `acceptedAt`.
- `acceptedBy`.

Shared teacher access is tied to pending invite records and accepted by the exact invited email address.

#### `teacher_access_codes/{codeId}`

Stores one-time lead-teacher pilot access codes.

Key fields include:

- `targetTeacherEmail`.
- `schoolName`.
- `subjectIds`.
- `licenseId`.
- `maxClasses`.
- `maxSeatsPerClass`.
- `maxStudentSeats`.
- `trialDays`.
- `status`.
- `expiresAt`.
- `createdAt`.
- `createdBy`.
- `note`.
- `redeemedAt`.
- `redeemedBy`.
- `updatedAt`.

The current free-plan implementation validates these through Firestore rules and client-side batched writes. A server-side transaction implementation is preserved for future activation.

#### `licenses/{licenseId}`

Stores school, pilot, or organisation entitlement data.

Key fields include:

- `school_name`.
- `unlocked_subjects`.
- `max_classes`.
- `max_seats_per_class`.
- `max_student_seats`.
- `ownerId`.
- `teacherIds`.
- `adminIds`.
- `classes`.
- `status`.
- `trialStartsAt`.
- `trialEndsAt`.
- `expiresAt`.
- `createdFromAccessCodeId`.
- `createdAt`.
- `updatedAt`.

The license document is the core of the multi-tenant school/class allocation design.

#### `licenses/{licenseId}/approved_students/{studentId}`

Stores approved student access records.

Key fields include:

- `email`.
- `displayName`.
- `licenseId`.
- `schoolName`.
- `status`.
- `createdAt`.
- `createdBy`.
- `updatedAt`.
- `updatedBy`.
- `revokedAt`.
- `revokedBy`.
- `claimedBy`.
- `claimedAt`.
- `joinedClassIds`.

This collection supports seat allocation before signup and helps ensure only expected school emails can join classes.

#### `assignments/{assignmentId}`

Stores teacher-created assignment records.

Key fields include:

- `teacherId`.
- `classId`.
- `className`.
- `licenseId`.
- `subjectId`.
- `targetType`.
- `targetId`.
- `targetLabel`.
- `deadline`.
- `targetMastery`.
- `status`.
- `completedBy`.
- `createdAt`.
- `updatedAt`.

Assignments can target chapters, subsections, or written questions. Student completion depends on mastery reaching the teacher-set target.

#### `assignments/{assignmentId}/completions/{studentId}`

Stores student assignment completion evidence.

Key fields include:

- `userId`.
- `userName`.
- `classId`.
- `className`.
- `mastery`.
- `targetMastery`.
- `completedAt`.
- `status`.

Firestore rules require the student's mastery to meet or exceed the assignment target mastery before completion can be written.

---

## User Roles

### Student

Students use the app to study, answer questions, complete assignments, view personal progress, receive nudges/rewards, and compare class rank. Students join classes using a 60-minute join code and an approved school email.

### Solo Learner

Solo learners can use study flows without the same class/teacher management model. This role exists as a flexible access path separate from managed school classes.

### Teacher

Teachers view class progress, create assignments, generate student join codes, inspect student progress, view assignment status, and support learning interventions for assigned classes.

### Shared Teacher

Shared teachers are teachers invited to specific classes by the Account Manager. They can teach and manage assignments for their assigned classes but do not control the whole license or account-manager-only settings.

### Account Manager

The Account Manager is the lead teacher for a school/subject/pilot license. This role can create classes, manage class names, approve student seats, import/export approved students, configure default and advanced support settings, and invite shared teachers.

### Super Admin

The Super Admin is the system-owner role for Jonah. The Super Admin can access the hidden admin control panel, curriculum editor, flagged-content review queue, simulation lab, and preview modes. Super-admin simulation activity is designed not to write mock progress into production learner metrics.

---

## Proprietary Algorithms and Logic

### Mastery and Memory Decay

The app tracks question-level mastery through `baseMastery`, `consecutiveCorrect`, `lastSeen`, and `status`. It calculates current mastery using the stored progress state and the time since the learner last encountered the card. This allows mastery to decay over time and encourages students to refresh content before it becomes weak.

The app uses colour-coded mastery status, including green, amber, red, and gold-style readiness states, to make progress readable for students and teachers.

### Assignment Completion Logic

Assignments are not treated as complete simply because a student clicked through a task. They are complete only when the student's calculated mastery for the assigned target reaches the teacher's target percentage.

This supports repeat attempts and better learning evidence. A student may need to revisit assigned questions multiple times before the assignment becomes complete.

### XP Economy

The XP economy is based on active learning interactions rather than idle time. The design follows the formula:

```text
XP_Earned = (Base_Task_Value * Accuracy_Multiplier) * (1 + (0.05 * Active_Streak))
```

The implementation uses base values for different engagement types and applies accuracy/streak weighting so steady daily practice can outperform last-minute cramming.

### Active Engagement Tracking

The app tracks learning actions such as revealing an answer, submitting quiz answers, submitting written responses, completing assignments, and other meaningful interactions. Raw stopwatch time is intentionally not used as the base reward mechanism.

### Class Ranking

Class rankings are derived from student XP and visible class profile data. The app calculates rank, labels top performers, and shows leaderboard placement on the student dashboard and leaderboard view.

### Academic Readiness and PR Review Graph

The app includes a progress review concept designed around a two-year A-level timeline. It calculates an academic window from September start to a target date shortly before exams and compares:

- A dotted expected XP/readiness line.
- A solid student progress line.
- The student's current position.
- Whether the student is well ahead, on track, slightly behind, or needs support.

This is used in parents' evening style reporting and student insight views.

### Simulation Engine

The super-admin simulation logic generates mock schools, classes, teachers, students, assignments, XP history, mastery states, slacking patterns, nudge responses, reward responses, live telemetry, and summary data. It exists to test how the app behaves under realistic classroom conditions without affecting production metrics.

### Curriculum Import Parser

The Admin Curriculum Editor includes a parser for the `DTHUB_CURRICULUM_BLOCK_V1` JSON format. It converts a full curriculum block into the app's subject/chapter/subsection/card/written-question schema while creating stable IDs where needed.

### Approved Student CSV Parser

The app includes CSV parsing and export logic for approved student setup. This helps Account Managers prepare school email access lists and seat allocations in bulk.

### Join and Invite Code Handling

The app includes normalisation and validation logic for:

- Teacher access codes.
- Class join codes.
- Class invite records.
- Email matching.
- Expiry handling.
- Redeemed/active/revoked status transitions.

---

## Security and Data Protection Architecture

### Current Security Controls

- Firebase Authentication required for signed-in features.
- Firestore rules define role-based access.
- Super-admin key is read from `REACT_APP_SUPER_ADMIN_KEY`.
- Super-admin key is not stored in this documentation.
- `.env.local` is intentionally excluded from the IP record.
- Teacher signup no longer uses a shared hardcoded source-code teacher key.
- Lead teacher access uses one-time `teacher_access_codes`.
- Shared teachers use email-specific `class_invites`.
- Students require an approved school email and a valid 60-minute class join code.
- Student join code expiry applies to new joins.
- Student class removal removes class access from user and public profile data.
- Feedback reports are anonymous in the new flagged-content flow.
- Firestore rules limit what fields students can update.
- Firestore rules limit progress values to reasonable bounds.
- Firestore rules prevent normal deletes for critical records.
- Firestore rules require assignment completion mastery to meet the teacher target.
- Admin simulation avoids production progress/XP writes.

### Current Free-Plan Limitation

The strongest version of teacher onboarding would use Firebase Cloud Functions so teacher-code redemption, license creation, teacher profile creation, and audit marking happen in one server-side transaction. That implementation has been drafted and saved under `future-functions/teacher-onboarding/`, but it is not active because Firebase Cloud Functions require the Firebase Blaze plan.

The current pilot implementation uses Firestore rules and client-side batched writes. It is suitable for a small trusted pilot but should be upgraded before wider paid rollout.

### Recommended Future Security Upgrades

- Activate server-side teacher onboarding through Firebase Functions when the project is ready for Blaze.
- Move student seat claiming into a backend function.
- Add formal email verification.
- Add hard server-side caps for teacher sharing.
- Add automated backups.
- Add a retention policy.
- Add a school data-processing agreement.
- Add a privacy notice and terms of use before a wider pilot.
- Consider a separate Firebase project or sandbox collections for persistent simulation datasets.

---

## Codebase Inventory

The following inventory records the main proprietary files in the application as of the source snapshot identified above.

| File | Approx. lines | Purpose |
| --- | ---: | --- |
| `src/App.js` | 10,152 | Main React application shell, router, state management, dashboards, study modes, assignments, teacher tools, admin panel, simulation lab, Firebase reads/writes, mastery, XP, onboarding, class management, and support automation. |
| `src/styles.css` | 2,467 | Main visual system, responsive layout, glass panels, cards, tables, forms, badges, overlays, simulation dock, dashboards, mobile/tablet adjustments, and theme styles. |
| `src/data.js` | 2,801 | Legacy Design Technology flashcard and written-question dataset used as fallback and seed curriculum material. |
| `src/components/AdminCurriculumEditor.js` | 623 | Curriculum editor, bulk curriculum import format/parser, immutable ID editing, chapter accordions, long-answer editing, image URL support, and flagged-content review. |
| `src/components/QuizCards.js` | 198 | Flashcard and written-answer card interfaces, show-answer behaviour, answer submission, self-marking, image rendering, and Flag Error reporting. |
| `src/components/MasteryRing.js` | 57 | Circular mastery/progress visual component. |
| `src/components/Skeleton.js` | 10 | Reusable loading skeleton. |
| `src/firebase.js` | 19 | Firebase app initialisation and exports for Firestore and Authentication. |
| `src/index.js` | 13 | React app bootstrap. |
| `src/pilotSecurity.test.js` | 211 | Regression tests covering pilot access, shared teacher invites, student join gating, feedback anonymity, curriculum version visibility, and future function preservation. |
| `firestore.rules` | 1,055 | Cloud Firestore security rules for users, progress, public profiles, curriculums, flags, nudges, join codes, invites, teacher access codes, licenses, approved students, assignments, and completions. |
| `firebase.json` | 5 | Firebase deploy configuration for Firestore rules. |
| `README.md` | 64 | Architecture ledger and current feature status. |
| `PILOT_LAUNCH_GUIDE.md` | 242 | Teacher/student setup, pilot instructions, launch commands, known pilot limits, and privacy notes. |
| `SCHOOL_PILOT_REVIEW.md` | 248 | Pilot readiness review, security notes, style/accessibility notes, data safety notes, and future task list. |
| `APP_SAVE_2026-07-15.md` | 168 | Earlier saved app checkpoint and feature handover. |
| `PILOT_QA_RESULTS_2026-07-21.md` | 58 | QA record for pilot-flow wiring, shared-teacher access, student removal/rejoin, and responsive layout checks. |
| `future-functions/teacher-onboarding/index.js` | 242 | Preserved future server-side teacher onboarding Cloud Function implementation. |
| `future-functions/teacher-onboarding/README.md` | 17 | Explanation of the future Functions upgrade and why it is not active on the free plan. |
| `future-functions/teacher-onboarding/package.json` | 16 | Package metadata for future Firebase Functions. |
| `public/index.html` | 43 | Static HTML entry shell. |
| `package.json` | 24 | Project scripts, Node engine, dependencies, and metadata. |
| `pnpm-lock.yaml` | Not counted here | Dependency lockfile preserving package resolution state. |

Generated build files are present under `build/` and represent compiled output from the source files. They are not the primary authored source, but they are part of the deployable application artifact.

---

## Interface and Workflow Inventory

### View Routing States

The main app uses string-based view routing in `src/App.js`. Important views include:

- `login`.
- `admin-control`.
- `admin-curriculum`.
- `admin-simulation`.
- `teacher-dashboard`.
- `class-view`.
- `menu`.
- `learn-dashboard`.
- `learn-page`.
- `quiz-dashboard`.
- `quiz-session`.
- `quiz-done`.
- `written-session`.
- `written-done`.
- `match-game`.
- `match-done`.
- `blitz-setup`.
- `speed-blitz`.
- `blitz-done`.
- `insights-dashboard`.
- `leaderboard`.

### Main UI Components and Panels

- Login card.
- Signup card.
- Role selector.
- Password show/hide button.
- Student dashboard header.
- Teacher dashboard header.
- Super-admin control header.
- Curriculum version badge.
- Trial/license status banner.
- Class cards.
- Student join-code card.
- Active assignment cards.
- Assignment builder.
- Approved Student List table.
- Shared Class Invitations panel.
- Class Settings panel.
- Support Automation Editor.
- Student Progress Overview table.
- Student detail modal.
- Parents' Evening Review panel.
- Progress review graph.
- Topic mastery breakdown.
- Leaderboard table.
- Quiz card.
- Written quiz card.
- Match game board.
- Blitz setup filters.
- Simulation control dock.
- Simulation telemetry table.
- Simulation log table.
- Admin flagged-content review cards.
- Admin curriculum bulk import textarea.
- Admin live editor.

---

## Documentation Inventory

### `README.md`

The README acts as the architecture ledger. It records implemented directives including:

- Hidden Super-Admin Control Panel and Environment Mirroring System.
- Dynamic Curriculum Database.
- Immutable Question IDs and Live Editing.
- Student Feedback Loop.
- B2B License Schema.
- IT / Teacher Allocation Dashboard.
- Pilot Teacher Access Codes.
- Pilot Student Join Codes.

### `PILOT_LAUNCH_GUIDE.md`

This is a practical guide for running a small school trial. It explains:

- What the app does.
- Account types.
- Teacher access model.
- Creating teacher pilot invite codes.
- Teacher setup.
- Shared teacher setup.
- Student setup.
- Student workflows.
- Teacher workflows.
- Assignment statuses.
- Student feedback.
- Launch commands.
- Pilot checklist.
- Known pilot limits.
- Data privacy notes.
- Recommended security upgrades.

### `SCHOOL_PILOT_REVIEW.md`

This records a broader school-readiness review, including security, accessibility, data safety, visual polish, question readiness, and remaining tasks.

### `APP_SAVE_2026-07-15.md`

This records an earlier project checkpoint, including features, file locations, deployment notes, and unfinished tasks at that earlier moment.

### `PILOT_QA_RESULTS_2026-07-21.md`

This records the 21 July 2026 QA pass covering:

- Full pilot-flow wiring.
- Shared teacher access.
- Student removal and rejoin behaviour.
- Responsive/device layout polish.
- Build and test commands.
- Known live Firebase smoke-test steps still to run.

---

## Build, Test, and Deployment State

### Build Commands

The project defines these scripts:

```bash
npm run start
npm run build
npm run test
```

### Current QA Evidence

The QA record dated 21 July 2026 confirms:

- `npm run build` passed.
- `CI=true npm test -- --watchAll=false` passed.
- `git diff --check` passed.
- Local browser layout scans were performed at desktop, tablet, and phone sizes.
- No page-level horizontal overflow was found.
- No browser console warnings or errors were found in the checked flows.
- Dense student tables intentionally remain horizontally scrollable on small screens.

### Deployment Model

- Source code is stored in the GitHub repository `jonah297/DesignTechnologyA-level`.
- Vercel redeploys from GitHub.
- Firestore rules are deployed separately using Firebase CLI.
- Firebase Functions are intentionally not active in `firebase.json` on the free-plan route.

---

## Known Pilot Limits and Future Work

The following items are known, documented, and intentionally separated from the current ownership record:

- Full server-side teacher onboarding is drafted but not active because Firebase Functions require Blaze.
- Student seat claiming should move server-side before a wider public or paid rollout.
- Email verification should be added before broader use.
- Terms and conditions, privacy notice, retention policy, and school data-processing agreement are needed before serious external rollout.
- Automated Firebase backup strategy is not yet enabled.
- Full curriculum QA is still needed before relying on the question bank in a real assessment-heavy context.
- Wider real-device testing should be run on iPhone, Android, iPad/tablet, Mac, and Windows before school deployment.
- Live Firebase smoke testing with controlled test accounts should be completed before a school trial.
- Teacher display-name editing for students remains an open safeguarding question for pilot teacher feedback.

---

## Third-Party Dependencies and Exclusions

This project uses third-party tools and libraries. The project owner does not claim ownership of these third-party works.

Third-party dependencies and platforms include:

- React.
- React DOM.
- Create React App / `react-scripts`.
- Firebase SDK.
- Firebase Authentication.
- Cloud Firestore.
- Vercel.
- GitHub.
- Node.js.
- npm / pnpm ecosystem packages.
- Browser APIs.

Exam board names, curriculum standards, or referenced external educational specifications are used only for compatibility, mapping, or descriptive purposes. External exam-board materials remain owned by their respective rights holders unless separately licensed.

The proprietary claim recorded here concerns the app's original source code, data model design, workflows, UI implementation, authored learning content, compiled curriculum arrangement, simulation system, access model, and educational product architecture.

---

## Evidence Statement

As of 21 July 2026, the repository working tree was clean before this file was created, and the recorded source snapshot was:

```text
59585097cdec8b312917e0e3fe92bb4012049fad
```

This file was then added as a new documentation artifact to preserve a written record of the intellectual property and implementation state of D&T Hub on the same date.

For strongest evidential value, this file should be:

1. Printed.
2. Signed and dated by the owner.
3. Stored with a copy of the source repository snapshot.
4. Stored with a copy of the matching Git commit hash.
5. Stored privately and not edited after signing.

---

## Owner Confirmation

I confirm that this document records the D&T Hub / DesignTechnologyA-level application and its original intellectual property as of 21 July 2026.

**Owner signature:** ______________________________________  
**Printed name:** _________________________________________  
**Date signed:** __________________________________________  
**Witness signature, if used:** ___________________________  
**Witness printed name, if used:** ________________________  
**Witness date, if used:** ________________________________
