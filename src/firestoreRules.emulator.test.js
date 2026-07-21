const nodeFetch = require("node-fetch");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");

global.fetch = global.fetch || nodeFetch;
global.Headers = global.Headers || nodeFetch.Headers;
global.Request = global.Request || nodeFetch.Request;
global.Response = global.Response || nodeFetch.Response;

const hasFirestoreEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeIfEmulator = hasFirestoreEmulator ? describe : describe.skip;

jest.setTimeout(30000);

const PROJECT_ID = "dt-hub-rules-test";
const LICENSE_ID = "pilot-school-dt-2026";
const CLASS_ID = "class-11y";
const CLASS_NAME = "Year 11 DT";
const SCHOOL_NAME = "Pilot School";
const NOW_MS = 1784660000000;
const FUTURE_DATE = new Date(NOW_MS + 7 * 24 * 60 * 60 * 1000);

const baseStreak = { current: 0, longest: 0, lastDate: 0 };
const classRecord = {
  id: CLASS_ID,
  name: CLASS_NAME,
  subjectIds: ["dt"],
  studentCount: 0,
};

const authDb = (testEnv, email) =>
  testEnv.authenticatedContext(email, { email }).firestore();

const seed = async (testEnv, records) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = db.batch();
    records.forEach(([docPath, data]) => {
      batch.set(db.doc(docPath), data);
    });
    await batch.commit();
  });
};

const studentUser = (email, overrides = {}) => ({
  name: "Student One",
  role: "student",
  writtenProgress: {},
  streak: baseStreak,
  xpTotal: 0,
  activeEngagements: 0,
  createdAt: NOW_MS,
  lastUpdated: NOW_MS,
  classCode: CLASS_ID,
  classId: CLASS_ID,
  classIds: [CLASS_ID],
  licenseId: LICENSE_ID,
  joinCodeId: "JOIN60",
  schoolName: SCHOOL_NAME,
  ...overrides,
});

const teacherUser = (email, overrides = {}) => ({
  name: "Teacher One",
  role: "teacher",
  writtenProgress: {},
  streak: baseStreak,
  xpTotal: 0,
  activeEngagements: 0,
  createdAt: NOW_MS,
  lastUpdated: NOW_MS,
  classCode: CLASS_ID,
  classId: CLASS_ID,
  classIds: [CLASS_ID],
  classes: [classRecord],
  licenseId: LICENSE_ID,
  accountManager: true,
  schoolName: SCHOOL_NAME,
  ...overrides,
});

const assignmentRecord = {
  teacherId: "teacher@school.com",
  classId: CLASS_ID,
  className: CLASS_NAME,
  licenseId: LICENSE_ID,
  subjectId: "dt",
  targetType: "chapter",
  targetId: "ch1",
  targetLabel: "Chapter 1",
  deadline: NOW_MS + 3 * 24 * 60 * 60 * 1000,
  targetMastery: 80,
  status: "active",
  completedBy: {},
  createdAt: NOW_MS,
  updatedAt: NOW_MS,
};

const assignmentAttempt = (email, overrides = {}) => ({
  assignmentId: "assignment-1",
  userId: email,
  userName: "Student One",
  classId: CLASS_ID,
  className: CLASS_NAME,
  targetType: "chapter",
  targetId: "ch1",
  targetLabel: "Chapter 1",
  attemptCount: 1,
  correctCount: 1,
  essayAttemptCount: 0,
  lastCardId: "ch1-sub1-card1",
  lastQuestionId: "",
  lastResult: "correct",
  lastScore: 0,
  latestMastery: 42,
  lastAttemptAt: NOW_MS,
  updatedAt: NOW_MS,
  ...overrides,
});

describeIfEmulator("Firestore emulator security rules", () => {
  let testEnv;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host: "127.0.0.1",
        port: 8080,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  test("only admins can create lead teacher pilot invite codes", async () => {
    const adminEmail = "dthub.app@gmail.com";
    const teacherEmail = "teacher@school.com";
    const adminDb = authDb(testEnv, adminEmail);
    const teacherDb = authDb(testEnv, teacherEmail);
    const inviteCodePayload = {
      targetTeacherEmail: teacherEmail,
      schoolName: SCHOOL_NAME,
      subjectIds: ["dt"],
      licenseId: LICENSE_ID,
      maxClasses: 3,
      maxSeatsPerClass: 35,
      maxStudentSeats: 105,
      trialDays: 21,
      status: "active",
      expiresAt: FUTURE_DATE,
      createdAt: new Date(NOW_MS),
      createdBy: adminEmail,
      note: "Pilot code",
    };

    await seed(testEnv, [
      [
        `users/${adminEmail}`,
        {
          name: "Super Admin",
          role: "admin",
          writtenProgress: {},
          streak: baseStreak,
          xpTotal: 0,
          activeEngagements: 0,
          createdAt: NOW_MS,
          lastUpdated: NOW_MS,
        },
      ],
      [`users/${teacherEmail}`, teacherUser(teacherEmail)],
    ]);

    await assertSucceeds(
      adminDb.doc("teacher_access_codes/ADMINCODE1").set(inviteCodePayload)
    );
    await assertFails(
      teacherDb.doc("teacher_access_codes/TEACHERCODE1").set(inviteCodePayload)
    );
    await assertFails(
      adminDb.doc("teacher_access_codes/BADDATE1").set({
        ...inviteCodePayload,
        expiresAt: NOW_MS + 7 * 24 * 60 * 60 * 1000,
      })
    );
  });

  test("lead teacher can redeem a targeted invite code and create the trial license atomically", async () => {
    const teacherEmail = "teacher@school.com";
    const db = authDb(testEnv, teacherEmail);

    await seed(testEnv, [
      [
        "teacher_access_codes/LEADCODE",
        {
          targetTeacherEmail: teacherEmail,
          schoolName: SCHOOL_NAME,
          subjectIds: ["dt"],
          licenseId: LICENSE_ID,
          maxClasses: 3,
          maxSeatsPerClass: 35,
          maxStudentSeats: 105,
          trialDays: 21,
          status: "active",
          expiresAt: FUTURE_DATE,
          createdAt: new Date(NOW_MS),
          createdBy: "super-admin",
          note: "Pilot code",
        },
      ],
    ]);

    const batch = db.batch();
    batch.set(db.doc(`users/${teacherEmail}`), {
      ...teacherUser(teacherEmail),
      accessCodeId: "LEADCODE",
    });
    batch.set(db.doc(`licenses/${LICENSE_ID}`), {
      school_name: SCHOOL_NAME,
      unlocked_subjects: ["dt"],
      max_classes: 3,
      max_seats_per_class: 35,
      max_student_seats: 105,
      ownerId: teacherEmail,
      teacherIds: [teacherEmail],
      adminIds: [],
      classes: [classRecord],
      status: "trial",
      trialStartsAt: new Date(NOW_MS),
      trialEndsAt: FUTURE_DATE,
      expiresAt: FUTURE_DATE,
      createdFromAccessCodeId: "LEADCODE",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    batch.update(db.doc("teacher_access_codes/LEADCODE"), {
      status: "redeemed",
      redeemedAt: new Date(NOW_MS),
      redeemedBy: teacherEmail,
      licenseId: LICENSE_ID,
      updatedAt: NOW_MS,
    });

    await assertSucceeds(batch.commit());
  });

  test("student signup requires both a valid join code and an approved school email", async () => {
    const studentEmail = "student@school.com";
    const db = authDb(testEnv, studentEmail);
    const payload = studentUser(studentEmail);

    await seed(testEnv, [
      [
        "class_join_codes/JOIN60",
        {
          code: "JOIN60",
          classId: CLASS_ID,
          className: CLASS_NAME,
          licenseId: LICENSE_ID,
          schoolName: SCHOOL_NAME,
          createdBy: "teacher@school.com",
          createdByName: "Teacher One",
          status: "active",
          expiresAt: FUTURE_DATE,
          createdAt: NOW_MS,
          updatedAt: NOW_MS,
        },
      ],
    ]);

    await assertFails(db.doc(`users/${studentEmail}`).set(payload));

    await seed(testEnv, [
      [
        `licenses/${LICENSE_ID}/approved_students/${studentEmail}`,
        {
          email: studentEmail,
          displayName: "Student One",
          licenseId: LICENSE_ID,
          schoolName: SCHOOL_NAME,
          status: "approved",
          createdAt: NOW_MS,
          createdBy: "teacher@school.com",
          updatedAt: NOW_MS,
          updatedBy: "teacher@school.com",
        },
      ],
    ]);

    await assertSucceeds(db.doc(`users/${studentEmail}`).set(payload));
  });

  test("shared teacher accepts only their own pending class invite", async () => {
    const sharedEmail = "shared.teacher@school.com";
    const db = authDb(testEnv, sharedEmail);

    await seed(testEnv, [
      [
        "class_invites/invite-1",
        {
          targetTeacherEmail: sharedEmail,
          invitedBy: "teacher@school.com",
          inviterName: "Teacher One",
          licenseId: LICENSE_ID,
          schoolName: SCHOOL_NAME,
          classId: CLASS_ID,
          className: CLASS_NAME,
          classRecord,
          teacherShareCount: 1,
          status: "pending",
          createdAt: NOW_MS,
          updatedAt: NOW_MS,
        },
      ],
    ]);

    await assertSucceeds(
      db.doc(`users/${sharedEmail}`).set(
        teacherUser(sharedEmail, {
          classCode: "",
          classId: "",
          classIds: [],
          classes: [],
          accountManager: false,
          signupInviteId: "invite-1",
        })
      )
    );

    const batch = db.batch();
    batch.update(db.doc(`users/${sharedEmail}`), {
      classCode: CLASS_ID,
      classId: CLASS_ID,
      classIds: [CLASS_ID],
      classes: [classRecord],
      lastAcceptedInviteId: "invite-1",
      lastUpdated: NOW_MS + 1,
    });
    batch.update(db.doc("class_invites/invite-1"), {
      status: "accepted",
      acceptedAt: NOW_MS + 1,
      acceptedBy: sharedEmail,
      updatedAt: NOW_MS + 1,
    });

    await assertSucceeds(batch.commit());
  });

  test("student feedback stays anonymous and rejects reporter email fields", async () => {
    const studentEmail = "student@school.com";
    const db = authDb(testEnv, studentEmail);
    const flagPayload = {
      anonymous: true,
      contentId: "ch1-sub1-card1",
      contentType: "flashcard",
      subjectId: "dt",
      classIds: [CLASS_ID],
      classLabels: [CLASS_NAME],
      licenseId: LICENSE_ID,
      schoolName: SCHOOL_NAME,
      reporterRole: "student",
      comment: "The wording looks wrong.",
      status: "open",
      createdAt: NOW_MS,
    };

    await seed(testEnv, [[`users/${studentEmail}`, studentUser(studentEmail)]]);

    await assertSucceeds(db.doc("flagged_content/flag-1").set(flagPayload));
    await assertFails(
      db.doc("flagged_content/flag-2").set({
        ...flagPayload,
        reporterEmail: studentEmail,
      })
    );
  });

  test("assignment attempts are class-scoped and can only increase one step at a time", async () => {
    const studentEmail = "student@school.com";
    const db = authDb(testEnv, studentEmail);

    await seed(testEnv, [
      [`users/${studentEmail}`, studentUser(studentEmail)],
      ["assignments/assignment-1", assignmentRecord],
    ]);

    await assertSucceeds(
      db
        .doc(`assignments/assignment-1/attempts/${studentEmail}`)
        .set(assignmentAttempt(studentEmail))
    );

    await assertFails(
      db
        .doc(`assignments/assignment-1/attempts/${studentEmail}`)
        .set(assignmentAttempt(studentEmail, { attemptCount: 3 }), { merge: true })
    );

    await assertSucceeds(
      db
        .doc(`assignments/assignment-1/attempts/${studentEmail}`)
        .set(
          assignmentAttempt(studentEmail, {
            attemptCount: 2,
            correctCount: 1,
            latestMastery: 56,
            lastCardId: "ch1-sub1-card2",
            lastResult: "incorrect",
            lastAttemptAt: NOW_MS + 1,
            updatedAt: NOW_MS + 1,
          }),
          { merge: true }
        )
    );
  });
});
