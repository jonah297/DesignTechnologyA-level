# D&T Hub Pilot Blind Test Runbook

Date: 2026-07-22

Purpose: run the app as if a new school is seeing it for the first time. The tester should receive only normal teacher/student instructions, not developer explanations. Record every hesitation, confusing label, visual issue, or security concern.

## Test Rules

- Use test accounts only. Do not invite a real class until this run passes.
- Do not give any tester the Super Admin key or Firebase admin account.
- Use the live Vercel app, not localhost, for the final pass.
- Use one laptop and one phone during the test.
- If student emails, class access, assignment status, or feedback anonymity look wrong, stop the pilot and fix it before continuing.

## Roles To Test

- Super Admin: creates the lead teacher pilot code and reviews flagged content.
- Account Manager: lead teacher who redeems the code, creates classes, approves student emails, invites co-teachers, and manages class settings.
- Shared Teacher: invited teacher who can access only assigned classes.
- Student: approved school email user who joins with a 60 minute class code.

## Who Does What

- Owner: runs the Super Admin setup, creates the lead teacher code, watches the test, records hesitation, and decides whether the pilot can continue.
- Teacher tester: completes Account Manager and shared teacher workflows without being guided through the UI.
- Student tester: signs up with an approved email and fresh join code, completes work, flags a question, and checks messages/rank.
- Codex/developer follow-up: turns any failed, confusing, crowded, or unsafe step into a fix before a real class is invited.

## Smoke Test Checklist

### 1. Owner Setup

- [ ] Open the live Vercel app and confirm the login screen loads.
- [ ] Sign in as the Firebase admin account and open Admin Control.
- [ ] Create one lead teacher pilot code for the exact Account Manager email.
- [ ] Confirm the generated code is visible, copyable, and marked as saved.

### 2. Account Manager Setup

- [ ] Create the lead teacher account with the invited email and one-time code.
- [ ] Rename the default class to a teacher-friendly name.
- [ ] Create any extra pilot classes allowed by the license.
- [ ] Add approved student school emails and confirm allocated seats increase.

### 3. Teacher And Student Access

- [ ] Invite one co-teacher to a class and confirm the co-teacher can accept it.
- [ ] Generate a 60 minute student join code and confirm it appears on the class card.
- [ ] Create one approved student account using the join code.
- [ ] Confirm an unapproved student email cannot join with the same code.

### 4. Learning Workflow

- [ ] Set one assignment for a chapter, subsection, or long-answer question.
- [ ] Open the assignment as the student and complete enough work to reach target mastery.
- [ ] Confirm the teacher sees complete, started, and not-started statuses correctly.
- [ ] Flag one question as the student and resolve it from the admin review queue.

### 5. Blind Usability Notes

- [ ] Ask the tester to narrate where they hesitate without helping them immediately.
- [ ] Record any button labels, table headings, or flows they misunderstand.
- [ ] Check the same flow on one laptop and one phone before inviting a real class.
- [ ] Stop the pilot if student emails, class access, or assignment status look wrong.

## New Teacher Blind Test Script

Give the Account Manager tester this script and observe silently where possible:

1. Create your teacher account using the code you were given.
2. Find your class dashboard.
3. Rename your first class.
4. Add two approved student school emails.
5. Generate a student join code.
6. Create one short assignment for a chapter or subsection.
7. Invite another teacher to the class.
8. Open a student and explain whether they are on track.
9. Copy a parents' evening report.
10. Find where automated support messages are configured.

Record:

- First point where the tester hesitated.
- Any word or label they misunderstood.
- Any control they expected in a different place.
- Any table or panel that felt too crowded.
- Whether they could explain student risk, assignment progress, and class setup without help.

## Student Blind Test Script

Give the student tester this script:

1. Create your account using your school email and the class join code.
2. Find your active assignment.
3. Start the assignment from the dashboard.
4. Open Quiz or Blitz and confirm the active assignment is still visible.
5. Answer questions until your progress changes.
6. Flag one question as unclear.
7. Find your teacher messages.
8. Find your rank.

Record:

- Whether the student knows what to do next after login.
- Whether the active assignment is obvious.
- Whether Flag Error is easy to find but not distracting.
- Whether rank, streak, XP, and mastery feel motivating or confusing.

## Pass Criteria

- The lead teacher can create classes and approve students without developer help.
- A shared teacher can access only the invited class.
- A student can join only with both an approved email and a fresh class code.
- A removed student loses class access and can rejoin with a fresh code.
- Assignment status updates in teacher and student views.
- Student feedback reaches the admin review queue anonymously.
- The app remains usable on one phone and one laptop.

## Follow-Up Scoring

Use a simple 1 to 5 score after each tester:

- 5: completed unaided and understood the purpose of each screen.
- 4: completed with one or two minor hesitations.
- 3: completed, but needed guidance or misunderstood one important term.
- 2: could not complete a core flow without help.
- 1: flow failed, data looked wrong, or access control was unclear.

Any score below 4 should create a fix task before a real class trial.
