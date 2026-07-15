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
- Student: joins using a class ID.

Schools should not receive the Super Admin credentials.

## Assignment And Prep Readiness

Implemented:

- Active assignments are visible to teachers and students.
- Overdue deadlines now display as overdue instead of just "due now".
- Completed assignments are tracked separately from general study mastery.
- Teachers can see complete/started/not started/overdue counts on the class page.
- Students can see active, overdue, and completed assignments separately.
- Student rows show assignment status without showing email addresses in the table.
- Student detail view includes a parents' evening snapshot.

Still needed:

- A full printable/exportable parents' evening report.
- Better separation of assignment attempt history from normal study attempts.
- Assignment deep links/share links.
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

Not ready for public launch:

- Teacher signup still uses a shared pilot access key.
- One-time teacher access keys need a backend or Cloud Function to be genuinely one-time.
- The 5-teacher cap is enforced in the interface, not hard-enforced server-side.
- XP/streak writes are still partly client-controlled and should eventually move server-side.
- Firestore rules need a formal rules test suite.
- Firebase App Check should be enabled before public access.
- A UK school data-processing agreement, privacy notice, and retention policy are needed.

## One-Time Teacher Key Design

Safe production approach:

1. Super Admin creates a teacher invite key from the admin panel.
2. Key includes school, subject, expiry date, max classes, max teachers, and max seats.
3. Teacher redeems key once.
4. A backend function checks the key atomically.
5. Backend creates or attaches the teacher to the correct license.
6. Key is marked used and cannot be redeemed again.

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
2. Test teacher signup, Account Manager setup, class creation, student signup, and assignment completion.
3. Test anonymous feedback as a student and confirm it appears in Super Admin review.
4. Manually test on at least one phone and one laptop.
5. Create a real one-time teacher key backend before inviting more than a tiny trusted group.
6. Build printable parents' evening reports.
7. Add assignment deep links.
8. Add automated nudge backend.
9. Add Firestore rules tests.
10. Plan Firebase backup/PITR before storing real long-term school data.
