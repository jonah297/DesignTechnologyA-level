# Sharp Study Production Smoke Test

Date opened: 2026-07-29

Environment:

- Live app: `https://app.sharpstudy.co.uk`
- Firebase project: `dt-study-hub`
- GitHub repo: `jonah297/DesignTechnologyA-level`
- Latest pushed commit at time of setup: `a489f53`

Purpose: prove the live app, real Firebase admin account, teacher onboarding, class joining, assignments, feedback, and recovery-critical access work before inviting a school pilot.

## Rules

- Use test users only.
- Do not use real student data.
- Do not share the local `VITE_LOCAL_SUPER_ADMIN_KEY`.
- Do not save passwords or codes in this file.
- Stop the smoke test if student emails, class access, assignment status, or feedback anonymity look wrong.

## Terminal / Deployment Checks

| Check | Status | Evidence / Notes |
|---|---|---|
| Git worktree clean before sprint | Passed | `git status --short` clean before edits |
| App unit/security tests | Passed | `npm test`: 61 passed, 16 skipped |
| Production build | Passed | `npm run build` with Vite; non-blocking bundle-size warning remains |
| Firestore emulator rules | Passed | `npm run test:rules`: 16 passed |
| Production dependency audit | Passed | `pnpm audit --prod --audit-level moderate`: no known vulnerabilities |
| Peer dependency health | Passed | `pnpm peers check`: no issues |
| Live HTTPS app response | Passed | `https://app.sharpstudy.co.uk` returned HTTP/2 200 |
| Live security headers | Passed | CSP, HSTS, `X-Frame-Options`, `nosniff`, referrer policy, permissions policy present |
| Live Vite assets | Passed | HTML, JS, CSS, and favicon returned 200 |

## Manual Firebase Admin Continuity Checks

These require Jonah's signed-in Firebase/Vercel/browser session.

| Check | Status | Notes |
|---|---|---|
| Firebase Auth admin user exists | Pending | Firebase Console -> Authentication -> Users |
| Firestore admin profile has `role: "admin"` | Pending | Firestore -> `users/{admin-email}` |
| Admin can log in on live app | Pending | Use production admin account, not local shortcut |
| Admin Control opens on live app | Pending | Confirm dashboard shows live admin write access |
| Local `admin` shortcut is not needed for live setup | Pending | Live school-code creation must use Firebase admin session |
| Firebase Auth verification template sends email | Pending | Check teacher/student test signup inbox |
| Unverified account banner appears | Pending | Banner should be non-blocking during controlled pilot |
| Verified account can refresh and hide banner | Pending | Press "I verified it" after using verification link |

## Lead Teacher / Licence Smoke Flow

Use a test school name and test email addresses only.

| Check | Status | Notes |
|---|---|---|
| Admin creates a one-time Tier 1 lead teacher code | Pending | Exact target teacher email |
| Code is visible, copyable, and saved | Pending | Do not paste code into docs |
| Lead teacher signs up with exact invited email and code | Pending | Code should redeem once |
| Teacher becomes Account Manager | Pending | Teacher dashboard should show licence/classes |
| Invite code is marked redeemed | Pending | Verify in app or Firestore |
| Same code cannot be reused | Pending | Expected failure |

## Class / Shared Teacher / Student Smoke Flow

| Check | Status | Notes |
|---|---|---|
| Account Manager renames first class | Pending | Friendly class name |
| Account Manager creates allowed extra class | Pending | Within licence limit |
| Account Manager approves a test student email | Pending | Seat count increases |
| Account Manager invites shared teacher | Pending | Exact teacher email |
| Shared teacher signs up/logs in and accepts class | Pending | Access only invited class |
| Teacher generates 60-minute student join code | Pending | Countdown visible |
| Approved student signs up with code | Pending | Student joins class |
| Unapproved student cannot join with valid code | Pending | Expected failure |
| Student remains in class after join code expires | Pending | Existing access retained |
| Teacher removes student | Pending | Student loses class access |
| Removed student can rejoin with fresh code if still approved | Pending | Rejoin path works |

## Assignment / Feedback Smoke Flow

| Check | Status | Notes |
|---|---|---|
| Teacher creates chapter/subsection assignment | Pending | Future deadline, target mastery 1-100 |
| Student sees active assignment on dashboard | Pending | Widget visible |
| Student opens assignment from dashboard | Pending | Correct question set loads |
| Active assignment appears inside quiz/blitz | Pending | Small active prep/assignment box visible |
| Student completes to target mastery | Pending | Assignment marks complete |
| Teacher sees complete/started/not-started statuses | Pending | Class view and dashboard |
| Student flags one question anonymously | Pending | No student email in feedback record |
| Admin sees flagged question | Pending | Admin review queue |
| Admin resolves flagged question with note | Pending | Status becomes resolved |

## Device Smoke Flow

| Check | Status | Notes |
|---|---|---|
| Mac laptop layout | Pending | Live app |
| iPhone layout | Pending | Live app |
| Android phone layout | Pending | If available |
| iPad/tablet layout | Pending | If available |
| Windows/chromebook layout | Pending | If available during pilot |

## Result

Overall status: Pending manual account-flow test.

Blocking issues found:

- None recorded yet.

Follow-up fixes:

- Deploy the split-chunk Vite build after commit `656de99`; local build now keeps
  the main app chunk below the default 500 kB warning threshold.
- Complete email verification plan before wider rollout.
- Complete Firebase backup/retention plan before wider rollout.
