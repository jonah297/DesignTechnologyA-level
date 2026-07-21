# Pilot QA Results - 2026-07-21

This pass covered the first four pilot-readiness checks:

1. Full pilot-flow wiring
2. Shared-teacher access
3. Student removal and rejoin behaviour
4. Responsive/device layout polish

## What Was Verified

- Lead teacher signup is still tied to one-time `teacher_access_codes`.
- Lead teacher signup creates the teacher profile, pilot license, default class, and redeemed invite marker.
- Approved Student List remains required before student signup.
- CSV import/export remains available for approved student setup.
- Student join codes expire after 60 minutes.
- Student signup requires both a valid join code and an approved school email.
- Assignment creation, completion tracking, student feedback flags, and admin resolution remain wired.
- Shared teacher signup requires a pending `class_invites` record for that exact email.
- Shared teacher access is capped at 5 teacher access spaces per class, including pending invites.
- Shared teacher simulation no longer inherits root-admin Account Manager controls.
- Shared teachers can still generate student join codes and use assignments.
- Account-manager-only panels, including Approved Student List and Class Settings, are hidden from shared-teacher simulation.
- Removing a student drops their class access from `users` and `public_profiles`.
- Joined approval records stay locked for audit safety.
- A removed student can rejoin later with a fresh valid join code because `approved` and `joined` approval states are both accepted.
- Anonymous flagged-content resolution is now tighter: reviewers may only set `status: "resolved"`, their own `reviewedBy`, an integer `reviewedAt`, and a text `adminNote`.

## Visual Pass

Tested locally with the super-admin simulation lab using generated sandbox classes and students.

Checked at:

- Desktop: 1440 x 900
- Tablet: 820 x 1180
- Phone: 390 x 844

Screens checked:

- Super Admin Simulation Lab
- Account Manager dashboard
- Shared Teacher dashboard
- Class view
- Student dashboard
- Quiz chapter picker
- Expanded quiz chapter with long-answer questions
- Assignment builder on phone

Result:

- No page-level horizontal overflow found.
- No browser console warnings or errors found.
- Dense student tables intentionally remain horizontally scrollable on small screens.

## Checks Run

- `npm run build`
- `CI=true npm test -- --watchAll=false`
- `git diff --check`
- Local browser layout scan across desktop/tablet/phone sizes

## Additional Local Pass

Later on 2026-07-21, the class page gained a collapsible teacher report filter panel above Student Progress Overview. It lets teachers narrow the visible student list by subject, assignment, assignment due-date window, assignment progress, mastery track, and last activity without changing saved data. The filtered report can also be copied as a readable summary or CSV without exposing student emails in the export.

The student dashboard also gained a persistent Teacher Messages panel. It separates new reminders/rewards from previous messages and keeps recent read messages visible for review.

Class support settings now include editable reminder/reward templates plus quiet-hours and weekdays-only timing limits. Those timing limits are saved for later backend automation; the free pilot route still avoids scheduled background sending.

Assignment activity now records a separate per-student attempt summary under each assignment. Teacher/student assignment status can use this summary for "started", attempt count, and last assignment attempt without relying only on the normal study progress map.

Checked after this update:

- `npm run build`
- `npm test -- --watchAll=false`
- `git diff --check`

## Not Run On Live Firebase

No live test teacher/student accounts were created in production Firebase during this pass. The production-like behaviour was covered through source/rules regression checks and localhost simulation so the real school database stays clean.

Before handing the app to a school, run one controlled live smoke test with known test emails:

1. Create one lead teacher code.
2. Sign up one lead teacher.
3. Create one class.
4. Approve one test student email.
5. Generate one 60-minute join code.
6. Sign up the test student.
7. Set and complete one assignment.
8. Flag one question.
9. Resolve the flag from the admin review queue.
