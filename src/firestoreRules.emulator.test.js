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
const SCHOOL_CORE_LICENSE_ID = "school-core-dt-2026";
const CLASS_ID = "class-11y";
const CLASS_NAME = "Year 11 DT";
const SCHOOL_NAME = "Pilot School";
const TRIAL_CLAIM_ID = "school-com";
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
  trialUsage: {},
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
  trialUsage: {},
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

  test("only admins can create lead teacher school invite codes", async () => {
    const adminEmail = "dthub.app@gmail.com";
    const teacherEmail = "teacher@school.com";
    const adminDb = authDb(testEnv, adminEmail);
    const teacherDb = authDb(testEnv, teacherEmail);
    const inviteCodePayload = {
      targetTeacherEmail: teacherEmail,
      schoolName: SCHOOL_NAME,
      subjectIds: ["dt"],
      licenseId: LICENSE_ID,
      trialClaimId: TRIAL_CLAIM_ID,
      tier: "starter_trial",
      qualification: "a-level",
      unlockedChapterIds: ["ch1"],
      dailyAnswerLimit: 30,
      maxClasses: 3,
      maxSeatsPerClass: 35,
      maxStudentSeats: 105,
      trialDays: 14,
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
    await assertSucceeds(
      adminDb.doc("teacher_access_codes/SCHOOLCORE1").set({
        ...inviteCodePayload,
        licenseId: SCHOOL_CORE_LICENSE_ID,
        trialClaimId: "",
        tier: "school_core",
        qualification: "gcse",
        unlockedChapterIds: [],
        dailyAnswerLimit: 0,
        maxClasses: 5,
        maxStudentSeats: 175,
        trialDays: 365,
        note: "School Core code",
      })
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
        `trial_claims/${TRIAL_CLAIM_ID}`,
        {
          id: TRIAL_CLAIM_ID,
          schoolName: SCHOOL_NAME,
          targetTeacherEmail: teacherEmail,
          accessCodeId: "LEADCODE",
          licenseId: LICENSE_ID,
          status: "reserved",
          tier: "starter_trial",
          qualification: "a-level",
          createdAt: new Date(NOW_MS),
          createdBy: "super-admin",
          updatedAt: NOW_MS,
        },
      ],
      [
        "teacher_access_codes/LEADCODE",
        {
          targetTeacherEmail: teacherEmail,
          schoolName: SCHOOL_NAME,
          subjectIds: ["dt"],
          licenseId: LICENSE_ID,
          trialClaimId: TRIAL_CLAIM_ID,
          tier: "starter_trial",
          qualification: "a-level",
          unlockedChapterIds: ["ch1"],
          dailyAnswerLimit: 30,
          maxClasses: 3,
          maxSeatsPerClass: 35,
          maxStudentSeats: 105,
          trialDays: 14,
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
      unlocked_chapters: ["ch1"],
      daily_answer_limit: 30,
      qualification: "a-level",
      tier: "starter_trial",
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
      trialClaimId: TRIAL_CLAIM_ID,
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
    batch.update(db.doc(`trial_claims/${TRIAL_CLAIM_ID}`), {
      status: "claimed",
      claimedAt: new Date(NOW_MS),
      claimedBy: teacherEmail,
      updatedAt: NOW_MS,
    });

    await assertSucceeds(batch.commit());
  });

  test("lead teacher can redeem a targeted invite code and create a Tier 2 school license", async () => {
    const teacherEmail = "teacher@school.com";
    const db = authDb(testEnv, teacherEmail);

    await seed(testEnv, [
      [
        "teacher_access_codes/SCHOOLCORE",
        {
          targetTeacherEmail: teacherEmail,
          schoolName: SCHOOL_NAME,
          subjectIds: ["dt"],
          licenseId: SCHOOL_CORE_LICENSE_ID,
          trialClaimId: "",
          tier: "school_core",
          qualification: "gcse",
          unlockedChapterIds: [],
          dailyAnswerLimit: 0,
          maxClasses: 5,
          maxSeatsPerClass: 35,
          maxStudentSeats: 175,
          trialDays: 365,
          status: "active",
          expiresAt: FUTURE_DATE,
          createdAt: new Date(NOW_MS),
          createdBy: "super-admin",
          note: "School Core code",
        },
      ],
    ]);

    const batch = db.batch();
    batch.set(db.doc(`users/${teacherEmail}`), {
      ...teacherUser(teacherEmail, {
        accessCodeId: "SCHOOLCORE",
        licenseId: SCHOOL_CORE_LICENSE_ID,
      }),
    });
    batch.set(db.doc(`licenses/${SCHOOL_CORE_LICENSE_ID}`), {
      school_name: SCHOOL_NAME,
      unlocked_subjects: ["dt"],
      unlocked_chapters: [],
      daily_answer_limit: 0,
      qualification: "gcse",
      tier: "school_core",
      max_classes: 5,
      max_seats_per_class: 35,
      max_student_seats: 175,
      ownerId: teacherEmail,
      teacherIds: [teacherEmail],
      adminIds: [],
      classes: [classRecord],
      status: "active",
      trialStartsAt: null,
      trialEndsAt: null,
      expiresAt: new Date(NOW_MS + 365 * 24 * 60 * 60 * 1000),
      trialClaimId: "",
      createdFromAccessCodeId: "SCHOOLCORE",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    batch.update(db.doc("teacher_access_codes/SCHOOLCORE"), {
      status: "redeemed",
      redeemedAt: new Date(NOW_MS),
      redeemedBy: teacherEmail,
      licenseId: SCHOOL_CORE_LICENSE_ID,
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
