# Sharp Study Backup And Retention Plan

Date opened: 2026-07-29

Scope:

- App code and documentation.
- Firebase Auth continuity.
- Firestore production data in `dt-study-hub`.
- Pilot school/student data retention expectations.

This plan is intentionally split into what can be done on the current free route and what must be upgraded before handling a wider school rollout.

## Current State

Code recovery is covered by:

- GitHub repository: `jonah297/DesignTechnologyA-level`
- Local Git bundle backups in `/Users/jonahss/Documents/DT App/app-saves`
- Local source zip backups in `/Users/jonahss/Documents/DT App/app-saves`
- `RECOVERY_RUNBOOK.md`
- `LIVE_HANDOVER.md`

Firestore production data is not yet protected by an automated daily backup schedule.

This is acceptable only for a small trusted pilot where:

- test users are used first,
- no real sensitive student dataset is imported in bulk,
- pilot schools understand the app is still in trial,
- manual checks are run before issuing access.

## Official Platform Constraints

Firestore scheduled backups require the Blaze pricing plan.

Firestore backups are consistent point-in-time copies of the database and restore into a new database. Backup schedules can be daily or weekly, with configurable retention. A database can have up to one daily backup schedule and one weekly backup schedule.

Backups are billed for backup storage used, and restores are billed based on backup size restored. Backup storage and restore operations are not part of the free Firestore quota.

Firestore managed export/import can export all documents or selected collection groups to Cloud Storage. Exports incur one document read per exported document and are not exact snapshots from the start time; changes made while export is running may be included.

Point-in-time recovery can export from PITR data for a whole-minute timestamp within the past seven days, but PITR storage is billed separately.

Reference links:

- Firebase Firestore backups: https://firebase.google.com/docs/firestore/backups
- Firebase Firestore export/import: https://firebase.google.com/docs/firestore/manage-data/export-import
- Firebase Firestore PITR: https://firebase.google.com/docs/firestore/use-pitr
- Firebase Firestore billing: https://firebase.google.com/docs/firestore/pricing

## Phase 0: Current Free-Route Minimum

Use this while still testing with fake or very small pilot data.

Actions:

1. Keep every meaningful app change committed and pushed to GitHub.
2. Keep the live handover updated after major architectural changes.
3. Create a local Git bundle and source zip after major sprint groups.
4. Keep secrets outside GitHub and outside the source zip.
5. Keep Firebase owner/admin recovery information in a password manager or encrypted local vault.
6. Do not rely on CodeSandbox as the source of truth.

Recovery expectation:

- App code can be restored from GitHub or local bundle.
- Handover context can be restored from `LIVE_HANDOVER.md`.
- Firebase live data recovery is limited if data is accidentally deleted before a paid backup strategy exists.

## Phase 1: Before Real School Pilot Data

Minimum recommended upgrade before a real school gives meaningful student data:

1. Upgrade Firebase/Google Cloud project to Blaze.
2. Enable Firestore scheduled backups.
3. Create one daily backup schedule.
4. Use a retention period long enough to catch accidental deletion, initially 14 to 30 days.
5. Create one weekly backup schedule if the pilot becomes more than a few classes.
6. Perform a restore drill into a separate test database before relying on the backups.
7. Document who can initiate backup, restore, and deletion actions.

Suggested starting policy:

| Backup type | Frequency | Retention | Purpose |
|---|---:|---:|---|
| Daily Firestore backup | Daily | 14 days | Recover from accidental deletion or bad app write |
| Weekly Firestore backup | Weekly | 8 weeks | Recover from slower-discovered corruption |
| Git bundle | After major sprint or release | Keep latest 3+ | Restore code history locally |
| Source zip | After major sprint or release | Keep latest 3+ | Easy handover to another developer/AI |

## Phase 2: Wider Launch Readiness

Before paid schools or multiple schools:

1. Enable budget alerts in Google Cloud Billing.
2. Add a documented restore runbook.
3. Add a quarterly restore drill.
4. Add least-privilege IAM:
   - owner/admin access for Jonah only,
   - backup schedule admin only where required,
   - read-only backup viewer for audit if ever needed.
5. Decide Firestore PITR separately from scheduled backups.
6. Create a data retention policy for:
   - student profiles,
   - progress records,
   - assignment attempts,
   - flagged content,
   - teacher/class metadata,
   - inactive trial schools.
7. Add a data deletion/export process for school requests.
8. Add incident response steps for accidental deletion, unauthorised access, and bad writes.

## Recommended Retention Rules

These are product/legal defaults to review before pilots:

- Trial school data: delete or anonymise after the trial plus agreed feedback period unless the school explicitly continues.
- Student progress: keep while the school licence is active and only as long as educationally necessary.
- Flagged content: keep the content report and class/school context, but avoid storing student identity unless needed for safeguarding.
- Deleted class membership: keep enough audit detail to explain access changes, not indefinite extra personal data.
- Super Admin simulation data: keep local-only where possible; do not sync mock metrics into production.

## Restore Runbook Draft

When data loss or bad writes are suspected:

1. Stop making further production writes if the bug is still active.
2. Record the incident time in UTC and UK local time.
3. Identify affected collections and schools/classes.
4. Check whether the problem is app code, Firestore rules, user action, or manual admin action.
5. If scheduled backups exist, restore the chosen backup into a new database.
6. Compare restored data with current production data.
7. Decide whether to:
   - manually repair specific documents,
   - migrate selected restored records,
   - or cut over to the restored database.
8. Record what happened and what changed.
9. Add a regression test or rule test if the incident came from app code or rules.

Do not overwrite production blindly. Firestore backup restore creates a new database, which should be inspected before any recovery action.

## Cost Notes

Current free route:

- Code backups cost nothing beyond local disk/GitHub usage.
- Proper Firestore scheduled backups are not available on Spark/free plan.

Blaze route:

- Backup storage cost depends mainly on database size and retention length.
- Restore cost depends on the size of the backup being restored.
- PITR costs are separate and can be similar in scale to database storage.
- Managed exports charge document reads and use Cloud Storage.

Practical implication:

- A small pilot database should be low cost, but exact monthly cost must be checked in Google Cloud pricing before enabling this for real schools.
- Set billing alerts before enabling paid backup features.

## Current Decision

For the next small pilot:

- Keep the repo, live handover, and local app-save backups current.
- Do not promise automatic Firestore recovery until Blaze scheduled backups are enabled and a restore drill has passed.
- Before a school uses real student data at scale, enable scheduled Firestore backups or formally accept the recovery risk in writing.
