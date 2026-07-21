# D&T Hub Pilot Launch Guide

Date: 2026-07-15

This guide is written so it can be printed or sent to a teacher before a small school trial.

## What D&T Hub Does

D&T Hub helps students practise Design Technology knowledge through short recall cards, written-answer practice, refresh questions, timed blitz practice, assignments, mastery tracking, class leaderboards, and teacher nudges.

The app is built around memory reinforcement. Students are encouraged to return little and often, because the mastery score decays over time if they do not revisit topics.

## Who Gets Access

There are three main account types:

- Student: joins a class using a 60 minute class join code from their teacher.
- Teacher: teaches assigned classes, sets assignments, views student progress, and uses the class support tools.
- Account Manager: the lead teacher for a subject or pilot. They create classes, invite co-teachers, manage class names, and control class settings.
- Super Admin: the system owner account. This stays with Jonah and is used for curriculum, simulations, security checks, and system-level setup.

For the pilot, keep access small and controlled: one Account Manager per subject, up to three classes, and only trusted co-teachers.

## Current Teacher Access Model

Lead teachers now need a one-time pilot invite code assigned to their school email address. Shared teachers join through a class invitation from the Account Manager.

Important: this is currently the free-plan route. Lead-teacher code redemption is protected by Firestore rules, not Firebase Functions. The safer server-side Functions version is saved in `future-functions/teacher-onboarding/`, but it is not active because Firebase Functions require the Blaze plan.

Recommended pilot process:

1. Super Admin creates one `teacher_access_codes/{CODE}` document in Firebase for the lead teacher.
2. Give that code only to the lead teacher for that subject.
3. The lead teacher signs up with the same email address listed on the code.
4. The app creates the school trial license under Firestore rule checks and makes that teacher the Account Manager.
5. The Account Manager creates classes and invites other teachers into specific classes from Class Settings.

Shared teacher access:

- A class can be shared with up to 5 teachers during the pilot.
- Invited teachers can view students, set assignments, and see automated support status for that class.
- The Account Manager controls class names, subject access, automated nudge rules, and reward rules.
- Co-teachers should use their own account, not the main teacher's login.

## Creating A Teacher Pilot Invite Code

Create the code manually in Firebase Console for now:

Collection: `teacher_access_codes`

Document ID: use uppercase letters and numbers only, for example `DTPILOTJSMITH2026A`.

Fields:

- `targetTeacherEmail`: the lead teacher's exact email address in lowercase
- `schoolName`: school or pilot name
- `subjectIds`: `["dt"]`
- `licenseId`: a stable license ID, for example `pilot-example-school-dt-2026`
- `maxClasses`: usually `3` for the pilot
- `maxSeatsPerClass`: usually `35`
- `trialDays`: usually `21`
- `status`: `active`
- `expiresAt`: timestamp for when the code should stop working
- `createdAt`: timestamp
- `createdBy`: `super-admin`
- `note`: optional internal note

Give the teacher the code. Hyphens/spaces are fine when typing it into the app because the app normalises the code, but the Firestore document ID itself should be the uppercase letters/numbers version.

## Teacher Setup Instructions

1. Open the app.
2. Choose Sign Up.
3. Select Teacher.
4. Enter name, the invited email address, password, and the one-time pilot invite code.
5. Log in. The teacher is now the Account Manager for that pilot license.
6. Rename the first class to something teacher-friendly, such as "Year 11 DT" or "12A Product Design".
7. Create any extra classes allowed by the pilot license.
8. Add student school emails to the Approved Student List on the teacher dashboard.
9. On the teacher dashboard, click Generate Code on the class card when students are ready to join.
10. Give students the 60 minute join code shown on the class card.

Shared teacher signup:

1. The Account Manager invites the shared teacher by email from Class Settings.
2. The shared teacher opens the app and chooses Sign Up.
3. They select Teacher and use the same email address that was invited.
4. They leave the lead teacher code field blank.
5. After signup, they open Teacher Dashboard and accept the shared class invitation.

The invitation only works for the exact invited email address. Accepting a shared class is checked against the pending invite, the school license, and the signed-in teacher account.

## Inviting Another Teacher

1. Log in as the Account Manager.
2. Open Teacher Dashboard.
3. Open Class Settings.
4. Find the class.
5. Enter the other teacher's email address.
6. Click Invite.
7. The invited teacher signs up or logs in, then accepts the shared class invitation.

The invited teacher must use the same email address that was entered in the invitation.

## Student Setup Instructions

1. Open the app.
2. Choose Sign Up.
3. Select Student.
4. Enter name, email, and password.
5. Enter the 60 minute class join code from the teacher.
6. Log in.

Students should not use teacher keys. They need the class join code and their school email must already be on the Approved Student List.

Important:

- The join code is only needed to connect the account to the class.
- The Approved Student List controls which school emails are allowed to use class join codes and counts towards purchased student seats.
- After a student has joined, their account stays connected to that class even when the join code expires.
- If a teacher removes a student from a class, the student loses access to that class but can rejoin later with a fresh join code.
- If a student signs up with an unsuitable display name, the pilot-safe fix is to remove them from the class and ask them to rejoin with a sensible name. Later, ask teachers whether editable student display names would be helpful or a safeguarding/audit concern.

## How Students Use The App

Student menu:

- Learn: browse the course by chapter and subsection.
- Quiz: practise flashcard questions.
- Refresh: revisit topics that may be fading from memory.
- Match: practise definitions.
- Insights: see mastery progress.
- Blitz: short timed practice.
- Ranks: class leaderboard.

If the teacher sets an assignment, students will see an Active Assignment box on the dashboard and inside quiz/blitz areas. Clicking it loads the correct questions. The assignment is complete only when the student reaches the target mastery percentage.

Teacher reminders and rewards appear in the Teacher Messages panel. New messages are separated from previous messages so students can check what support has been sent without losing the history after marking a message as read.

## How Teachers Use The App

Teacher dashboard:

- Your Classes: open a class and see student progress.
- Approved Student List: approve school emails one by one, import/export CSV files, and monitor allocated student seats.
- Student join code: generate a 60 minute code on each class card when students need to join or rejoin.
- Active Assignments: quickly see current assignments and edit them.
- Create Class: add another class if the pilot license allows it.
- Class Settings: rename classes, check subject access, set fair automated nudge/reward rules, edit support message templates, save school timing limits, and invite co-teachers.

Inside a class:

- Student Progress Overview shows mastery, assignment status, last active time, and action buttons.
- Report Filters let the teacher narrow the class list by subject, assignment, due-date window, assignment progress, mastery track, and last active time.
- Copy Summary and Copy CSV export the currently filtered class report without putting student emails into the table export.
- Select a student name to inspect their topic mastery.
- The student detail popup includes a parents' evening snapshot: on track/watch closely/needs support, study mastery, and assignment status. Use Copy Report to paste the summary into notes, or Print for a paper copy.
- Automated Support explains whether reminder or reward rules apply to each student. Teachers do not need to manually nudge students during the pilot.
- Account Managers can edit the wording used for automated reminders and rewards. Quiet hours and weekdays-only settings are saved ready for the later backend automation step.
- Set Assignment lets the teacher select a chapter, subsection, or long-answer question, choose a due date, set a mastery target, and submit.
- Copy Link on an assignment creates a direct student link. A student opening that link will load the assignment automatically if it belongs to their class.

Assignment status:

- Active: assignment is open and not past the deadline.
- Overdue: assignment is incomplete and past the deadline.
- Completed: student has reached the teacher's target mastery percentage.
- Started: student has begun the assigned work but has not reached the target yet. The app now keeps assignment attempt summaries separate from general study progress.
- Not started: no evidence of assignment work yet.

## Student Feedback And Question Errors

Students can report a question by pressing Flag Error during quiz or written-answer practice.

That report is saved to the `flagged_content` area in Firebase and appears in the admin review area of the app. New reports are anonymous: they keep school/class context, but do not store the student's email in the feedback record. Authorised reviewers can add a short note and mark a report as resolved after checking the question. It does not currently email the Super Admin automatically. For the pilot, the Super Admin should check the admin dashboard regularly. Later, this can be upgraded to send an email notification.

## Launch Commands

Use these commands from Terminal when launching a new version:

```bash
cd "/Users/jonahss/Documents/DT App/DesignTechnologyA-level"
npm run build
npm test -- --watchAll=false
git status
git add src/App.js src/firebase.js src/styles.css src/pilotSecurity.test.js src/firestoreRules.emulator.test.js firestore.rules firebase.json future-functions README.md PILOT_LAUNCH_GUIDE.md SCHOOL_PILOT_REVIEW.md FIRESTORE_RULES_TESTING.md
git commit -m "Prepare pilot launch access and security"
git push origin main
npx firebase-tools@latest deploy --only firestore:rules --project dt-study-hub
```

Vercel should redeploy from GitHub after the push. If it does not, open the Vercel project and redeploy the latest commit.

The deeper Firestore rules test command is:

```bash
npm run test:rules
```

That command requires Java 17 or newer because Firebase's local Firestore emulator runs on Java.

## Pilot Checklist

Before giving access to a school:

- Confirm the app opens on the Vercel URL.
- Confirm the Super Admin account can log in.
- Confirm a teacher can sign up using a one-time pilot invite code.
- Confirm the invite code is marked redeemed after signup.
- Confirm an invited co-teacher can sign up with no code, then accept the shared class invite.
- Confirm a teacher can create and rename a class.
- Confirm the Account Manager can approve a student school email and see the allocated seat count increase.
- Confirm a teacher can generate and copy a student join code.
- Confirm a student can join using the 60 minute class join code.
- Confirm an unapproved student email cannot join even with a valid class join code.
- Confirm the student remains in the class after the join code expires.
- Confirm a removed student loses class access and can rejoin with a fresh join code.
- Confirm a teacher can set an assignment.
- Confirm a teacher can copy an assignment link and a student can open it.
- Confirm a student can complete the assignment.
- Confirm the teacher can see completion status.
- Confirm a teacher can copy or print a parents' evening report.
- Confirm a student can flag a question.
- Confirm the admin can see the flagged question.
- Confirm a co-teacher can accept a shared class invite.
- If Java is installed, run `npm run test:rules` before the live smoke test.

## Known Pilot Limits

- Lead teacher sign-up now uses one-time Firestore pilot invite codes on the free-plan route. Shared teacher sign-up and class acceptance are rules-checked against pending invitations. The saved backend version in `future-functions/teacher-onboarding/` should be activated only if the Firebase project moves to Blaze.
- Student join codes and the Approved Student List are rules-backed on the free-plan route. The later public-launch upgrade is moving student seat claiming into a backend function and adding email verification once legal/compliance documents are ready.
- The 5-teacher class cap is enforced in the app interface. A hard server-side cap should be added later with a Cloud Function.
- Automatic email notifications are not built yet.
- Firebase backups are not enabled yet.
- The curriculum still needs full exam-board QA before a serious paid launch.
- The app should be manually checked on iPhone, Android, iPad/tablet, Mac, and Windows before the first school trial.

## Data Privacy Notes

- Student emails are not shown in the class table.
- A teacher can see a student's account email only after opening that student.
- New question feedback reports are anonymous and keep only class/school context.
- Do not export, print, or share student progress tables outside the school trial without permission.
- Before a wider UK rollout, add a privacy notice, retention policy, and school data-processing agreement.

## Recommended Next Security Upgrade

Before expanding beyond a small trusted pilot, move teacher onboarding fully server-side:

1. Admin creates one-time lead teacher invitation codes.
2. Each code has a school name, expiry date, max class count, and max teacher count.
3. A lead teacher can redeem a code once through a backend function.
4. Account Managers can invite shared teachers into specific classes.
5. Shared-teacher invite acceptance should move from rules-backed batched writes into a server-side function.
6. The server creates or attaches each teacher to the correct license.

The lead-teacher backend function has already been drafted and saved in `future-functions/teacher-onboarding/`. It is not active on the free Firebase plan.
