# Sharp Study Sprint 8 Blind-Test Rehearsal Results

Date: 2026-07-27  
App: Sharp Study  
Scope: safe owner-led rehearsal using the local app with the current production code path.

## Purpose

Sprint 8 checked whether the app can be used as a first-time pilot rehearsal without relying on developer memory. The focus was the Super Admin run sheet, Account Manager preview, shared teacher preview, student preview, and obvious visual/layout failures.

## Test Environment

- Workspace: `/Users/jonahss/Documents/DT App/DesignTechnologyA-level`
- Browser: headless Google Chrome against `http://localhost:3000`
- App session: local Super Admin key from `.env.local`
- Firebase writes: not used for this safe pass
- Test type: UI rehearsal, visual overflow check, and workflow presence check

## What Passed

### Public Landing Page

- Sharp Study branding loads.
- `Start free pilot` and `Independent study` actions are visible.
- Teacher overview example is visible.
- No console errors were recorded in the rehearsal browser.
- No horizontal overflow was detected.

### Super Admin

- Super Admin login opens `Admin Control Panel`.
- `Lead Teacher School Codes` panel is visible.
- Firestore write state is clearly labelled as disabled when only the local admin key is used.
- `Pilot Smoke Test Console` is visible.
- Run-sheet status controls work: a step can be marked as `Pass`.
- Run-sheet progress updates: `1/20 checks passed` was detected after marking one check.
- No horizontal overflow was detected on desktop or mobile admin views.

### Account Manager Preview

- `Teacher Overview` is visible.
- `Your Classes` is visible.
- `Generate New Code` is visible on class cards.
- `Approved Student List` is visible.
- `Create Class` is visible.
- No horizontal overflow was detected.

### Shared Teacher Preview

- Shared teacher preview opens from Admin Control.
- Teacher dashboard stats and active assignments render.
- Student join-code controls render without overlapping.
- Active assignments render with `Copy Link` and `Edit` controls.
- No horizontal overflow was detected.

### Student Preview

- `Your Study Hub` is visible.
- `Memory Repair` is visible.
- `Subsection Progress` is visible.
- Join-class area is visible as `Join Another Class`.
- Teacher Messages and Assignments panels render.
- No horizontal overflow was detected.

## Visual Review Notes

- The admin mobile lead-teacher code form is now stacked correctly and avoids the squeezed multi-column layout.
- The teacher and student preview pages rely on vertical scrolling, which is expected.
- No table-style horizontal scroll issue appeared in this pass.
- The floating `Return to Admin Control` control remains visible during preview modes.

## Not Fully Tested Yet

These require real disposable live accounts and should be done on the deployed app before inviting a real class:

- Create a live lead-teacher school code while signed in as the Firebase admin user.
- Redeem the code with a disposable Account Manager teacher account.
- Confirm the teacher invite code is marked redeemed.
- Approve disposable student school emails.
- Generate a live 60-minute student join code.
- Create a disposable student account with an approved email and join code.
- Confirm an unapproved email cannot join.
- Remove a student from a class and confirm class access is removed.
- Rejoin the removed student with a fresh code.
- Set, complete, and inspect a live assignment.
- Flag a live question and resolve it in the admin review area.
- Confirm Vercel deployment has the latest commit.

## Current Decision

The safe UI rehearsal is passed. The app is ready for a controlled live smoke test with disposable teacher/student accounts. It is not yet signed off for a real school class until the live-only checks above pass.

## Follow-Up

Use the in-app Super Admin `Pilot Smoke Test Console` on the deployed app for the live pass. Mark each check `Pass` or `Needs Fix`, record tester hesitation in the notes field, then copy the run sheet after the rehearsal.
