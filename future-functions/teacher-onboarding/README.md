# Future Upgrade: Server-Side Teacher Onboarding

This folder preserves the Firebase Functions implementation drafted on 20 July 2026.

It is not active in the free-plan DT app because Firebase Functions require the Firebase Blaze plan. When the project is ready to use Blaze, move this folder back to `functions/`, restore the `functions` block in `firebase.json`, and deploy with:

```bash
npx firebase-tools@latest deploy --only functions,firestore:rules --project dt-study-hub
```

Purpose:

- Redeem one-time lead-teacher access codes server-side.
- Create the teacher profile, public profile, pilot license, default class, and redeemed access-code audit trail in one transaction.
- Remove remaining race-condition risk from browser-side teacher onboarding.

Current free-plan app status:

- Lead-teacher invite codes are still protected by Firestore rules.
- This is acceptable for a tiny trusted pilot.
- Shared-teacher invite acceptance should also move server-side if/when Functions become available.
