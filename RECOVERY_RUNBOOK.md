# Sharp Study Recovery Runbook

Last updated: 2026-07-29

Owner: Jonah Theo Stanwell-Smith

Purpose: disaster recovery and access continuity for Sharp Study if the local laptop, hard drive, browser sessions, or local Codex context are lost.

This file is safe to store in GitHub. It must never contain passwords, admin keys, browser recovery codes, Firebase private keys, OAuth tokens, or real student data.

## Recovery Principle

The laptop should never be the only copy of the project.

The minimum safe recovery set is:

- GitHub repo for code and project documentation.
- Firebase project for live Auth/Firestore data.
- Vercel project for deployment and domain configuration.
- Password manager or offline sealed record for account credentials and recovery codes.
- Current `LIVE_HANDOVER.md`, `README.md`, and this runbook for Codex/project understanding.

## Source Of Truth

Primary code repo:

`https://github.com/jonah297/DesignTechnologyA-level`

Primary local path when available:

`/Users/jonahss/Documents/DT App/DesignTechnologyA-level`

Current production app domain:

`https://app.sharpstudy.co.uk`

Firebase project:

`dt-study-hub`

Vercel project:

`design-technology-a-level`

The current project knowledge should be kept in:

- `LIVE_HANDOVER.md`
- `README.md`
- `SECURITY_REVIEW_2026-07-29.md`
- `RECOVERY_RUNBOOK.md`
- `PILOT_LAUNCH_GUIDE.md`
- `FIRESTORE_RULES_TESTING.md`
- `docs/`

## If The Laptop Fails

1. Sign in to the Google account that owns Firebase.
2. Sign in to GitHub and Vercel.
3. Clone the repo:

```bash
git clone https://github.com/jonah297/DesignTechnologyA-level.git
cd DesignTechnologyA-level
```

4. Install dependencies:

```bash
pnpm install
```

If `pnpm` is unavailable on the new machine:

```bash
corepack enable
pnpm install
```

5. Verify:

```bash
npm test
npm run build
npm run test:rules
```

6. Recreate local-only development settings if needed:

```bash
cp .env.example .env.local
```

Then put the private local Super Admin shortcut value into `.env.local`.
Do not commit `.env.local`.

## Admin Account Recovery

Production Super Admin access should not depend on the laptop.

The live admin route should be:

1. Firebase Authentication account controlled by Jonah.
2. Matching Firestore user document:

```txt
users/{admin-email}
role: "admin"
```

The local-only shortcut is only for localhost development. It uses:

```txt
VITE_LOCAL_SUPER_ADMIN_KEY
```

That key lives only in `.env.local` and must be stored outside the repo, for example in a password manager or printed sealed recovery record. If the laptop dies, recreate `.env.local` on the new machine.

Important: losing `.env.local` should not lock Jonah out of production if the Firebase Auth admin account and Google/Firebase owner account are recoverable.

## Account Recovery Items To Store Offline

Store these outside the laptop, ideally in a password manager plus a sealed printed backup:

- Google account email that owns Firebase.
- Google account recovery codes.
- GitHub account recovery codes.
- Vercel account recovery codes.
- Domain registrar login and recovery method.
- The private local `VITE_LOCAL_SUPER_ADMIN_KEY`.
- Any future Stripe/payment provider recovery codes.

Do not store these secrets in GitHub, CodeSandbox, Codex chat, README files, or screenshots.

## CodeSandbox Security Position

CodeSandbox is optional. It is not the source of truth.

Use CodeSandbox only as a cloud editor/preview if it is still useful. Security posture should be:

- Delete obsolete draft sandboxes that contain old app copies.
- Avoid storing secrets in CodeSandbox.
- Avoid real student data in CodeSandbox.
- Restrict CodeSandbox GitHub access to selected repositories, or remove it entirely if it is no longer needed.
- Prefer GitHub plus local development for production work.

If CodeSandbox access is removed, the app still works because GitHub, Vercel, and Firebase do not depend on CodeSandbox.

## GitHub And Vercel Recovery

GitHub stores the code and documentation. Vercel deploys the latest pushed code from GitHub.

After a recovery clone:

```bash
git log -5 --oneline
git status --short
npm test
npm run build
```

To deploy app changes:

```bash
git add <changed files>
git commit -m "Clear commit message"
git push origin main
```

Vercel should deploy automatically after the push.

## Firebase Recovery

Firestore rules are in:

`firestore.rules`

Firebase CLI project:

`dt-study-hub`

Deploy rules from the project directory:

```bash
npx firebase-tools@latest deploy --only firestore:rules --project dt-study-hub
```

Run rules tests:

```bash
npm run test:rules
```

Current limitation: automated Firestore backups are not yet active. Before wider rollout, create a formal backup and retention plan.

## Local Backup Commands

Local backups should be copied to an external drive or cloud storage. A backup that only lives on the same laptop does not protect against hard-drive failure.

Recommended save directory:

`/Users/jonahss/Documents/DT App/app-saves`

Create a Git history bundle and a clean source zip:

```bash
cd "/Users/jonahss/Documents/DT App/DesignTechnologyA-level"
mkdir -p "/Users/jonahss/Documents/DT App/app-saves"
SHORT_SHA=$(git rev-parse --short HEAD)
git bundle create "/Users/jonahss/Documents/DT App/app-saves/SharpStudy-git-$(date +%F)-$SHORT_SHA.bundle" --all
git archive --format=zip --output="/Users/jonahss/Documents/DT App/app-saves/SharpStudy-source-$(date +%F)-$SHORT_SHA.zip" HEAD
```

These backups do not include `.env.local`, `node_modules`, or untracked local files.

## What To Give A Future Codex Or Developer

Give them:

1. GitHub repo link.
2. `LIVE_HANDOVER.md`.
3. `README.md`.
4. `RECOVERY_RUNBOOK.md`.
5. Latest commit hash from:

```bash
git rev-parse --short HEAD
```

6. The current priority list from the latest chat, if it has not yet been moved into `LIVE_HANDOVER.md`.

Do not give them:

- Admin passwords.
- Recovery codes.
- `.env.local`.
- Firebase private/admin SDK keys.
- Real student data exports.

## Immediate Security Priorities After Recovery

1. Confirm GitHub account has strong 2FA and recovery codes.
2. Confirm Google/Firebase account has strong 2FA and recovery codes.
3. Confirm Vercel account access and domain connection.
4. Confirm Firebase Auth admin user still exists and has `role: "admin"`.
5. Confirm `npm test`, `npm run build`, and `npm run test:rules` pass.
6. Confirm live site loads at `https://app.sharpstudy.co.uk`.
7. Confirm no secrets are committed:

```bash
git grep -n "PRIVATE KEY\\|client_secret\\|BEGIN .* KEY\\|recovery-code"
```
