# Firestore Rules Emulator Tests

Date: 2026-07-28

This project now includes a real Firebase emulator rules test suite in `src/firestoreRules.emulator.test.js`.

The suite uses fake local data only. It does not read from, write to, or mutate the live `dt-study-hub` Firebase project.

## What The Suite Covers

- A lead teacher can redeem a targeted one-time invite code and create the trial license in one atomic write.
- Tier 2 School Core and Tier 3 Trust & Enterprise invite codes create the correct paid-license shapes.
- A student cannot sign up with only a class join code; their school email must also be on the Approved Student List.
- A student can check a known active class join code by exact document ID, but cannot broadly list all class join codes.
- Student memory progress records accept the current `sharp-dsr-1` model fields and reject injected fields, out-of-range mastery, and stale `lastSeen` updates.
- Tier 1 trial answer usage cannot be decreased or jumped by several answers within the same day.
- A shared teacher can create an account from their own pending class invite and then accept that class.
- Student feedback records must stay anonymous and cannot include a reporter email field.
- Assignment attempt summaries are class-scoped and can only increase one attempt at a time.

## How To Run

Run from the app folder:

```bash
cd "/Users/jonahss/Documents/DT App/DesignTechnologyA-level"
npm run test:rules
```

This starts the local Firestore emulator, runs the rules tests, then shuts the emulator down.

## Java Requirement

The Firestore emulator requires Java. On 2026-07-21, the first local run was blocked because this Mac did not have a Java Runtime installed:

```text
Unable to locate a Java Runtime.
```

Java 21 was then installed, and `npm run test:rules` passed locally. The suite
was run again on 2026-07-28 after the S2 rules-hardening update and passed with
11/11 Firestore rules tests.

If this suite is run on a new machine later, install Java 17 or newer first.

The normal app tests still run without Java:

```bash
npm test -- --watchAll=false
```
