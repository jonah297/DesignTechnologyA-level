# D&T Hub Pilot Launch Guide

Date: 2026-07-15

This guide is written so it can be printed or sent to a teacher before a small school trial.

## What D&T Hub Does

D&T Hub helps students practise Design Technology knowledge through short recall cards, written-answer practice, refresh questions, timed blitz practice, assignments, mastery tracking, class leaderboards, and teacher nudges.

The app is built around memory reinforcement. Students are encouraged to return little and often, because the mastery score decays over time if they do not revisit topics.

## Who Gets Access

There are three main account types:

- Student: joins a class using a class ID from their teacher.
- Teacher: teaches assigned classes, sets assignments, views student progress, and uses the class support tools.
- Account Manager: the lead teacher for a subject or pilot. They create classes, invite co-teachers, manage class names, and control class settings.
- Super Admin: the system owner account. This stays with Jonah and is used for curriculum, simulations, security checks, and system-level setup.

For the pilot, keep access small and controlled: one or two main teachers, up to three classes, and only trusted co-teachers.

## Current Teacher Access Model

Teachers currently need the pilot teacher access key to create a teacher account.

Important: the current teacher access key is suitable for a controlled pilot, not a public launch. Anyone with that key could try to create another teacher account. Before a paid or public launch, replace this with one-time teacher invitation codes checked by a server-side function.

Recommended pilot process:

1. Give the teacher access key only to one lead teacher per subject.
2. That lead teacher creates the first teacher account.
3. That teacher becomes the Account Manager by starting free pilot access inside the Teacher Dashboard.
4. The Account Manager creates the classes.
5. The Account Manager invites other teachers into specific classes from Class Settings.

Shared teacher access:

- A class can be shared with up to 5 teachers during the pilot.
- Invited teachers can view students, set assignments, and send nudges for that class.
- The Account Manager controls class names, subject access, and automated nudge rules.
- Co-teachers should use their own account, not the main teacher's login.

## Teacher Setup Instructions

1. Open the app.
2. Choose Sign Up.
3. Select Teacher.
4. Enter name, email, password, and the pilot teacher access key.
5. Log in.
6. On the Teacher Dashboard, select Become Account Manager.
7. Enter the school or pilot name.
8. Create the first class.
9. Rename the class to something teacher-friendly, such as "Year 11 DT" or "12A Product Design".
10. Give students the class ID shown on the class card.

## Inviting Another Teacher

1. Log in as the teacher who owns or manages the class.
2. Open Teacher Dashboard.
3. Open Class Settings.
4. Find the class.
5. Enter the other teacher's email address.
6. Click Invite.
7. The invited teacher logs in and accepts the shared class invitation.

The invited teacher must use the same email address that was entered in the invitation.

## Student Setup Instructions

1. Open the app.
2. Choose Sign Up.
3. Select Student.
4. Enter name, email, and password.
5. Enter the class ID from the teacher.
6. Log in.

Students should not use teacher keys. They only need the class ID.

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

## How Teachers Use The App

Teacher dashboard:

- Your Classes: open a class and see student progress.
- Active Assignments: quickly see current assignments and edit them.
- Create Class: add another class if the pilot license allows it.
- Class Settings: rename classes, check subject access, set fair automated nudge rules, and invite co-teachers.

Inside a class:

- Student Progress Overview shows mastery, assignment status, last active time, and action buttons.
- Select a student name to inspect their topic mastery.
- The student detail popup includes a parents' evening snapshot: on track/watch closely/needs support, study mastery, and assignment status.
- Use Nudge only when the student is falling behind, has low mastery, or has incomplete work.
- Use Reward when the student is performing better than usual or keeping a strong streak.
- Set Assignment lets the teacher select a chapter, subsection, or long-answer question, choose a due date, set a mastery target, and submit.

Assignment status:

- Active: assignment is open and not past the deadline.
- Overdue: assignment is incomplete and past the deadline.
- Completed: student has reached the teacher's target mastery percentage.
- Started: student has begun but has not reached the target yet.
- Not started: no evidence of assignment work yet.

## Student Feedback And Question Errors

Students can report a question by pressing Flag Error during quiz or written-answer practice.

That report is saved to the `flagged_content` area in Firebase and appears in the admin review area of the app. New reports are anonymous: they keep school/class context, but do not store the student's email in the feedback record. It does not currently email the Super Admin automatically. For the pilot, the Super Admin should check the admin dashboard regularly. Later, this can be upgraded to send an email notification.

## Launch Commands

Use these commands from Terminal when launching a new version:

```bash
cd "/Users/jonahss/Documents/DT App/DesignTechnologyA-level"
npm run build
git status
git add src/App.js src/styles.css firestore.rules APP_SAVE_2026-07-15.md PILOT_LAUNCH_GUIDE.md
git commit -m "Prepare pilot launch access and guidance"
git push origin main
npx firebase-tools@latest deploy --only firestore:rules --project dt-study-hub
```

Vercel should redeploy from GitHub after the push. If it does not, open the Vercel project and redeploy the latest commit.

## Pilot Checklist

Before giving access to a school:

- Confirm the app opens on the Vercel URL.
- Confirm the Super Admin account can log in.
- Confirm a teacher can create a pilot license.
- Confirm a teacher can create and rename a class.
- Confirm a student can join using the class ID.
- Confirm a teacher can set an assignment.
- Confirm a student can complete the assignment.
- Confirm the teacher can see completion status.
- Confirm a student can flag a question.
- Confirm the admin can see the flagged question.
- Confirm a co-teacher can accept a shared class invite.

## Known Pilot Limits

- Teacher sign-up is still protected by a shared pilot key, not backend-checked one-time invitation codes.
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

Before expanding beyond a small trusted pilot, build a secure teacher onboarding flow:

1. Admin creates one-time teacher invitation codes.
2. Each code has a school name, expiry date, max class count, and max teacher count.
3. A teacher can redeem a code once.
4. The code is checked by a server-side function, not by frontend code.
5. The server creates or attaches the teacher to the correct license.

That upgrade prevents random teacher account creation even if someone guesses or shares an old key.
