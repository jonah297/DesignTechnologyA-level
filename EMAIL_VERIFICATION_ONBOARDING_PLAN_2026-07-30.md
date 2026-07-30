# Sharp Study Email Verification And Onboarding Plan

Date opened: 2026-07-30

Scope:

- Teacher accounts.
- Student school accounts.
- Solo student accounts.
- Super Admin access.
- Future backend onboarding.

## Current Pilot Position

Sharp Study now sends Firebase email-verification messages after new email/password accounts are created. Logged-in unverified Firebase users see a non-blocking banner with:

- the current verification status,
- a resend verification email action,
- a refresh/check action after using the email link.

The banner is deliberately non-blocking during the current controlled pilot.

Reason:

- The current free-plan route creates Firebase Auth users and Firestore profile/licence/class records in one client-orchestrated sequence.
- If unverified users were blocked immediately after Auth creation, teachers or students could be stranded between account creation and Firestore setup.
- The safer broad-launch solution is a redesigned onboarding flow or backend function that verifies email before creating or attaching school access records.

## Current Implementation

Implemented in `src/App.jsx`:

- imports `sendEmailVerification` from `firebase/auth`;
- sends a verification email after successful signup;
- tracks `firebaseUser.emailVerified` from `onAuthStateChanged`;
- shows `EmailVerificationBanner` for real Firebase users who are signed in and unverified;
- excludes the local localhost-only Super Admin shortcut;
- allows resend and manual refresh of verification status;
- does not block the controlled pilot flow.

Implemented in `src/styles.css`:

- compact responsive banner styles;
- mobile wrapping so buttons remain usable on narrow screens.

Regression coverage:

- `src/pilotSecurity.test.js` checks that email verification is wired and documented.

## Required Firebase Console Checks

Before relying on the verification email flow, manually confirm:

1. Firebase Console -> Authentication -> Templates.
2. Email address verification template is enabled/configured.
3. Sender name is acceptable for Sharp Study.
4. Continue URL domain is authorised:
   - `app.sharpstudy.co.uk`
   - `localhost` for development.
5. Test teacher receives the verification email.
6. Test student receives the verification email.
7. Clicking the verification link marks the Firebase Auth user as verified.
8. Returning to the app and pressing "I verified it" hides the banner.

Do not paste email verification links, passwords, or recovery codes into project docs.

## Final Broad-Launch Target

Before wider rollout, move onboarding to a verified-first model.

Recommended target flow:

1. User creates an Auth account.
2. App sends verification email.
3. App shows a verification-only holding screen.
4. User verifies their email.
5. App reloads the Auth user and confirms `emailVerified === true`.
6. Only then does the app redeem:
   - lead teacher access code,
   - shared teacher class invite,
   - student approved-seat claim,
   - solo account profile creation.
7. Backend function performs the actual licence/class/seat writes atomically.

This prevents:

- typo email accounts consuming seats,
- unverified teacher accounts redeeming school codes,
- unverified student accounts binding approved seats,
- stranded Auth accounts with half-created school records.

## Backend Upgrade Target

The strongest version should use Firebase Cloud Functions:

- `startSignupSession`
- `redeemTeacherAccessCode`
- `acceptClassInvite`
- `claimApprovedStudentSeat`

Each function should:

- require Firebase Auth,
- require `request.auth.token.email_verified === true`,
- validate exact email match,
- validate code/invite expiry,
- validate licence status,
- enforce seat/class limits,
- write audit events,
- return clear user-facing failure reasons.

This likely requires Blaze.

## Pilot Wording

Recommended wording for testers:

"For this pilot you can continue after creating an account, but please verify your email when the app asks. Verification will become required before the app is used by a wider school group."

## Current Decision

For the current small pilot:

- send verification emails,
- show non-blocking reminders,
- do not block signup or login yet,
- manually verify the Firebase email template before live tester onboarding,
- implement verified-first backend onboarding before wider school rollout.
