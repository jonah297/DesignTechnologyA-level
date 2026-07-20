# D&T Hub School Pilot Review

Date: 2026-07-15

This review tracks readiness for a small school trial and the work still needed before a wider launch.

## Current Pilot Position

The app is suitable for a small, trusted trial if access is controlled by Jonah and one lead teacher per subject.

Recommended trial shape:

- 1 school
- 1 lead teacher / Account Manager per subject
- 1 to 3 classes
- up to 5 shared teachers per class
- trial period of 2 to 3 weeks
- no public self-signup link

## Account Roles

- Super Admin: Jonah only. Controls curriculum, simulation, security checks, and system-wide setup.
- Account Manager: lead teacher for a school/subject. Creates classes, invites co-teachers, manages class settings, and controls class nudge rules.
- Teacher: shared teaching access for assigned classes.
- Student: joins using a one-day class join code created by a teacher. Once joined, the student keeps class access unless a teacher removes them from that class.

Schools should not receive the Super Admin credentials.

## Teacher Feedback Questions

Ask pilot teachers:

- If a student signs up with an unsuitable display name, is the current flow sensible: remove the student from the class, ask them to rejoin with a better name, and keep the account tied to the school email?
- Would teacher-editable student display names be useful, or could that create a safeguarding or audit concern if a teacher can rename a student in a way other users can see?
- If editable display names are added later, should the app keep an audit trail showing who changed the name, when, and what it changed from/to?

## Assignment And Prep Readiness

Implemented:

- Active assignments are visible to teachers and students.
- Overdue deadlines now display as overdue instead of just "due now".
- Completed assignments are tracked separately from general study mastery.
- Teachers can see complete/started/not started/overdue counts on the class page.
- Students can see active, overdue, and completed assignments separately.
- Student rows show assignment status without showing email addresses in the table.
- Student detail view includes a parents' evening snapshot.
- Teachers can copy/print a parents' evening report from the student detail view.
- Teachers can copy assignment links; students opening a valid class assignment link are taken straight into the assignment.

Still needed:

- Better separation of assignment attempt history from normal study attempts.
- A teacher-facing report filter for date range, subject, class, and assignment.

## Nudging Review

Implemented:

- Teachers can set class nudge thresholds.
- The app can suggest nudges based on incomplete assignments, overdue assignments, inactivity, and low mastery/high decay.
- Rewards are suggested for strong streaks or better-than-usual performance.

Still needed:

- True automated nudges should be handled by a scheduled backend process.
- Teachers should be able to preview/edit a nudge template before automation is enabled.
- Add a student-visible history of support messages.
- Add controls for school policy, such as "no nudges after 6pm" or "weekday only".

## Student Feedback Review

Implemented:

- Students can flag errors from quiz and written-answer cards.
- New feedback records are anonymous.
- Feedback still stores school/class context so the issue can be reviewed.

Still needed:

- Optional email alert to Super Admin when a high-priority content flag arrives.
- Admin workflow for resolving, commenting on, and archiving flags.

## Security Review

Good enough for controlled pilot:

- Super Admin is separate from school users.
- Teacher data access is class-scoped.
- Student emails are no longer shown in the main class table.
- Question feedback is anonymous from this point forward.
- Mock/simulation data is designed not to write production performance metrics.
- Lead teacher signup requires a targeted one-time pilot invite code stored in Firestore.
- Shared teacher signup and class acceptance are checked against a pending invitation for the same email address.

Not ready for public launch:

- One-time teacher access keys and shared-teacher invites are rules-backed for the pilot, but need backend Cloud Functions for public launch.
- The 5-teacher cap is enforced in the interface, not hard-enforced server-side.
- XP/streak writes are still partly client-controlled and should eventually move server-side.
- Firestore rules need a formal rules test suite.
- Firebase App Check should be enabled before public access.
- A UK school data-processing agreement, privacy notice, and retention policy are needed.

## One-Time Teacher Key Design

Current pilot approach:

1. Super Admin creates a `teacher_access_codes/{CODE}` document in Firebase.
2. The code is targeted to one teacher email, school, subject list, trial length, class limit, and seat limit.
3. The lead teacher signs up with that email and code.
4. Firestore rules require the code to be active and assigned to the signed-in email.
5. The app creates the trial license and marks the code redeemed.
6. The Account Manager can invite shared teachers into specific classes.
7. A shared teacher can sign up with the invited email and no lead code; Firestore rules require the pending class invitation before creating the teacher profile.

## Student Account Allocation Design

Current pilot approach:

1. Teachers create a one-day student join code for a class.
2. The Account Manager adds approved student school emails to the Approved Student List.
3. Approved students consume purchased student seats immediately. Example: a 60-seat license with 40 approved students shows `40/60 student seats allocated`.
4. A student signs up with their school email, chosen display name, password, and the join code.
5. Student signup requires both a valid one-day class join code and a matching approved school email for that license.
6. The join code only controls joining. Once joined, the student remains connected to that class after the code expires.
7. If a teacher removes the student, the student loses that class access but can rejoin later with a fresh teacher-generated code.

Still needed before public launch:

1. Add CSV import/export for the Approved Student List.
2. Decide whether approved reference names should ever become student-visible display names.
3. Move seat claiming into a backend function so counts, duplicate claims, and expiry checks are atomic.
4. Add email verification once the legal/compliance pack is ready.

Recommended wording:

- Use **Approved Student List**, **Allocated Seats**, or **Student Roster**.
- Avoid "whitelist" in teacher-facing UI because it is technical and less familiar.

Important security note:

- Email address should be the stable identity, not the typed display name.
- Before a wider launch, add email verification so a student cannot create an account using someone else's school email without proving they control that inbox.

## Teacher Account Allocation Design

Recommended model:

- Do not charge schools separately for normal teacher access during the early product stage.
- Price mainly by student seats because student learning volume is the core value.
- Include teacher seats with the student-seat package to reduce friction.

Suggested included teacher allowance:

- 1 Account Manager per subject/license.
- 1 additional teacher seat per 25 purchased student seats, rounded up.
- Keep the per-class sharing limit at 5 teachers for the pilot unless a school gives a clear reason to raise it.

Example:

- 60 student seats includes 1 Account Manager plus 3 shared teacher seats.
- Extra teacher/admin seats can become a paid add-on later if larger departments need wider access.

Safer production approach for teacher onboarding:

1. Super Admin creates a lead teacher invite key from the admin panel.
2. Key includes school, subject, expiry date, max classes, max teachers, and max seats.
3. Lead teacher redeems key once.
4. Account Managers invite shared teachers into specific classes.
5. A backend function checks keys and class invites atomically.
6. Backend creates or attaches the teacher to the correct license.
7. Key is marked used and cannot be redeemed again.

Do not rely on frontend-only one-time keys for a public launch.

## Data Safety And Backups

For the pilot:

- Manual Firebase export before the trial starts is enough.
- Manual export after the trial ends is recommended.

Before wider use:

- Enable scheduled Firestore backups or point-in-time recovery.
- Decide retention periods for student accounts and assignment data.
- Add a process for deleting a student's data if requested by a school.
- Keep curriculum/content data separate from student performance data.

Potential costs:

- Firestore backup/PITR can add storage cost.
- For a small pilot this should be low, but it should be checked in Firebase billing before enabling.

## Style And Device Review

Implemented:

- Tables are collapsible and horizontally scrollable.
- Student emails are moved out of the main table.
- Assignment and nudge controls are more compact.
- Deadline status is clearer.

Needs real-device QA:

- iPhone Safari
- Android Chrome
- iPad/tablet landscape and portrait
- Mac Chrome/Safari
- Windows Chrome/Edge
- School display/projector size

Accessibility checks still needed:

- Keyboard-only navigation
- Focus states on all buttons
- Screen-reader labels for icon/compact controls
- Color contrast in light and dark modes
- Reduced motion preference for animated/simulation elements

## Curriculum And Question QA

Still needed before a real trial:

- Check every question for syllabus accuracy.
- Check mark schemes for clarity.
- Check long-answer questions match the exam board.
- Confirm topic IDs are stable and will not change after students start using the app.
- Review image URLs and copyright permissions.
- Add a version label for the curriculum being trialled.

## Immediate To-Do List

1. Deploy the latest app and Firestore rules.
2. Test one-time lead teacher code signup, Account Manager setup, class creation, shared teacher invite signup, student signup, and assignment completion.
3. Test anonymous feedback as a student and confirm it appears in Super Admin review.
4. Manually test on at least one phone and one laptop.
5. Fix any pilot polish bugs found during live QA.
6. Keep the saved teacher-code Cloud Function in the future-upgrade folder; only activate it if the project moves to Blaze, then move shared-teacher invite redemption server-side too.
7. Add a full Firebase emulator rules test suite.
8. Add automated nudge backend.
9. Plan Firebase backup/PITR before storing real long-term school data.
10. Add CSV import/export and backend seat-claiming for the Approved Student List before public launch.
