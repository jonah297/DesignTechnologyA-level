# Firestore Rules Emulator Tests

Date: 2026-07-21

This project now includes a real Firebase emulator rules test suite in `src/firestoreRules.emulator.test.js`.

The suite uses fake local data only. It does not read from, write to, or mutate the live `dt-study-hub` Firebase project.

## What The Suite Covers

- A lead teacher can redeem a targeted one-time invite code and create the trial license in one atomic write.
- A student cannot sign up with only a class join code; their school email must also be on the Approved Student List.
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

Install Java 17 or newer, then rerun `npm run test:rules`.

The normal app tests still run without Java:

```bash
npm test -- --watchAll=false
```
