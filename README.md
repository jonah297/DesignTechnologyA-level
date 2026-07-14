# D&T Hub

React/Firebase revision app for Design & Technology A-level study, teacher analytics, assignments, and mastery-based spaced retrieval.

## Architecture Ledger

### Section B: React Lifecycle & Memory Optimizations

**Directive 22: Hidden Super-Admin Control Panel & Environment Mirroring System**

Status: Implemented in `src/App.js`.

The root administrator can open a dedicated `admin-control` workspace after passing `REACT_APP_SUPER_ADMIN_KEY`. The admin session is not restored from local storage, and the root identity is excluded from Firestore profile, progress, assignment, XP, and engagement writes.

The control panel includes:

- A secure access status card for the configured super-admin key.
- A mock data generator that creates three isolated test classes and five balanced test students in local React state only.
- An interface simulator that can switch into the student `menu` view or the `teacher-dashboard` view without logging out.
- A persistent floating return control shown only during a verified root-admin session.
