# Sharp Study Security Review Addendum

Date: 29 July 2026  
Project: Sharp Study / DesignTechnologyA-level  
Firebase project: `dt-study-hub`  
Purpose: current security-status addendum separate from the printed copyright/IP archive.

## Archive Handling Decision

The copyright/IP file dated 21 July 2026 should remain a fixed historical record. It should not be edited after printing or sealing. Current security changes and security findings should be tracked in dated addenda like this file, then rolled into a future full IP/legal archive when the app reaches a stable launch milestone.

## Executive Security Status

The app is in a substantially safer state than the early pilot build:

- The old production super-admin key flow is removed from active source.
- Production super-admin access is intended to use Firebase Authentication plus a Firestore `users/{email}` profile with role `admin`.
- The local super-admin shortcut is development-only, localhost-only, and reads `VITE_LOCAL_SUPER_ADMIN_KEY` from ignored `.env.local`.
- Firestore rules now cover teacher onboarding, class join codes, approved student records, assignment records, flagged content, class invites, trial limits, curriculum reads, and progress writes.
- The emulator rules suite passes and now includes open-license fixtures for join-code and anonymous-feedback checks.
- Vercel security headers are configured through `vercel.json`.

This is suitable for a small controlled pilot if the deployed Firestore rules match the local rules. It is not yet sufficient for broad public/self-serve rollout because server-side onboarding, email verification, retention policy, and formal backup policy remain incomplete.

## Checks Completed

### Firestore Rules

Command:

```bash
npm run test:rules
```

Result:

- Passed.
- 16/16 Firestore emulator security-rule tests passed.
- The warning messages in the output were expected denied-write/read cases being tested.

Representative rules checked:

- Student signup requires both a valid, unexpired class join code and an approved school email.
- Student join codes cannot be broadly listed by students.
- Teacher access codes must be active, email-specific, and unexpired.
- Class join codes expire after a maximum of 60 minutes.
- Shared teacher invites are email-specific and time-limited.
- Flagged content is anonymous and rejects reporter email fields.
- Assignments are class-scoped and cannot be freely deleted.
- Approved-student records keep immutable license/email fields locked.

### App Tests

Command:

```bash
npm test
```

Result:

- Passed.
- 6 test suites passed, 1 skipped.
- 61 tests passed, 16 skipped.

### Production Build

Command:

```bash
npm run build
```

Result:

- Passed.
- Production bundle compiled successfully.
- Vite emitted a non-blocking bundle-size warning because the main JavaScript chunk is larger than 500 kB after minification. This is a performance/code-splitting task, not a failed build.

### Whitespace / Patch Hygiene

Command:

```bash
git diff --check
```

Result:

- Passed.

### Secret and Source Scan

Checks searched for:

- old super-admin key strings,
- the retired production admin variable name,
- plain email admin references,
- private-key/client-secret style strings,
- dangerous browser injection patterns.

Result:

- No literal old admin key found in active source.
- No hardcoded super-admin email gate found in active source.
- Firebase web config is present in `src/firebase.js`. This is expected for Firebase web apps and is not a Firebase Admin SDK secret. Security depends on Auth and Firestore rules.
- `.env.local` is ignored by Git and is not tracked.
- The old tracked `.env.production` CRA sourcemap toggle has been removed; production sourcemaps are disabled in `vite.config.js`.
- `.env.example` is tracked and contains only a placeholder local admin key name/value.

### Dependency Advisory Scan

Command:

```bash
pnpm audit --prod --audit-level moderate
```

Result:

- Passed after migrating from Create React App to Vite.
- No known production dependency vulnerabilities found.

Assessment:

The previous `react-scripts` advisory surface has been removed. The app now builds with Vite and tests run through Vitest. `pnpm peers check` also passes after adding a workspace-level pnpm override for the optional Rolldown WASM peer chain.

## Current Strong Controls

### Authentication and Admin Access

- Real users authenticate through Firebase Auth.
- Production super-admin should be based on authenticated user profile role, not a frontend production key.
- Local shortcut is limited by:
  - `import.meta.env.DEV`,
  - localhost host check,
  - alphanumeric 24+ character key format,
  - ignored `.env.local`.

### Firestore Rule Controls

- No broad `allow read, write: if true` rule was found.
- Sensitive operational records are role-scoped and license-scoped.
- Student writes are constrained to allowed fields and expected ownership.
- Teacher writes are constrained to their license/classes.
- Assignment completion and progress writes are bounded.
- Student feedback does not allow reporter email fields in the new anonymous feedback flow.
- Class and teacher codes are time-limited.

### Hosting Headers

Configured in `vercel.json`:

- Content Security Policy.
- `X-Frame-Options: DENY`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- restrictive `Permissions-Policy` for camera, microphone, geolocation, payment, and USB.

## Material Risks Remaining

### High Priority: Deployment Parity

Local rules are strong, but production safety depends on the deployed Firebase rules matching the local `firestore.rules` file.

Required action after each rules change:

```bash
npx firebase-tools@latest deploy --only firestore:rules --project dt-study-hub
```

### High Priority: Server-Side Onboarding Not Active

The safest teacher onboarding and license redemption flow should happen in Firebase Cloud Functions:

- validate one-time teacher code,
- create license,
- attach lead teacher,
- mark invite redeemed,
- write audit event.

Current free-plan route uses client-side batched writes with strict Firestore rules. This is acceptable for a small trusted pilot, but not the final security architecture for public rollout.

### Medium Priority: Bundle Size

The Vite migration is complete and production dependency audit is clean. The remaining build-tooling concern is performance: Vite reports the main JavaScript chunk is larger than 500 kB after minification. This should be handled with route/component code-splitting before a larger public launch, but it is not a current security blocker.

### Medium Priority: Email Verification

Current account access relies heavily on approved emails, join codes, and Firestore rules. Formal Firebase email verification should be added before wider rollout, especially for school users.

### Medium Priority: Backups and Retention

Automated backup and retention rules are not active yet. For a tiny pilot, manual export is acceptable. For wider school use, define:

- backup frequency,
- retention period,
- restore process,
- who can access backups,
- deletion process for school/student data.

### Medium Priority: Legal/Data Documents

Draft legal documents exist, but they need final review before serious external use:

- Terms and Conditions.
- Privacy Notice.
- school data-processing agreement.
- safeguarding/data-handling notes for teachers.
- retention/deletion policy.

### Low/Medium Priority: CSP Inline Styles

The current CSP allows `style-src 'unsafe-inline'` because of the current React/CSS setup. This is common for this build stage but not maximum hardening. Tightening it should happen after build-tool migration and stylesheet review.

## Files Changed During This Review

- `src/firestoreRules.emulator.test.js`
  - Added open-license fixtures to three emulator tests so the tests match the hardened rules.
- `APP_SAVE_2026-07-15.md`
  - Updated stale setup notes to describe the current localhost-only admin shortcut and production Firebase-admin role model.
- `SECURITY_REVIEW_2026-07-29.md`
  - Added this review addendum.

The printed copyright/IP archive files were restored to their original snapshot and should remain historical evidence rather than live engineering documentation.

## Recommended Next Security Sprint

1. Commit this security review and emulator fixture update.
2. Deploy Firestore rules if local `firestore.rules` has not already been deployed.
3. Add a production smoke-test checklist for:
   - lead teacher invite,
   - teacher login,
   - shared teacher invite,
   - approved student import,
   - 60-minute join code,
   - assignment creation/completion,
   - anonymous flagged content,
   - student removal/rejoin.
4. Add email verification requirements to the teacher/student onboarding flow.
5. Create the backup and retention plan before expanding the pilot.
6. Plan code-splitting for the large Vite production bundle before wider rollout.
