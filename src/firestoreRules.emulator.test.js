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
const ENTERPRISE_LICENSE_ID = "enterprise-trust-dt-2026";
const CLASS_ID = "class-11y";
const CLASS_NAME = "Year 11 DT";
const SCHOOL_NAME = "Pilot School";
const TRIAL_CLAIM_ID = "school-com";
const NOW_MS = Date.now();
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

const authDbWithUid = (testEnv, uid, email) =>
  testEnv.authenticatedContext(uid, { email }).firestore();

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
  authUid: email,
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
  authUid: email,
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

const adminUser = (email, overrides = {}) => ({
  name: "Super Admin",
  role: "admin",
  writtenProgress: {},
  streak: baseStreak,
  xpTotal: 0,
  activeEngagements: 0,
  createdAt: NOW_MS,
  lastUpdated: NOW_MS,
  ...overrides,
});

const licenseRecord = (teacherEmail = "teacher@school.com", overrides = {}) => ({
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

const memoryProgressRecord = (overrides = {}) => ({
  baseMastery: 82,
  consecutiveCorrect: 1,
  difficulty: 6.4,
  dueAt: NOW_MS + 2 * 24 * 60 * 60 * 1000,
  lapses: 0,
  lastMode: "flashcard",
  lastSeen: NOW_MS,
  memoryModelVersion: "sharp-dsr-1",
  retrievabilityAtReview: 0.93,
  reviews: 1,
  stabilityDays: 2.2,
  status: "correct",
  ...overrides,
});

const publicProfileRecord = (email, overrides = {}) => ({
  name: "Student One",
  role: "student",
  classId: CLASS_ID,
  classIds: [CLASS_ID],
  xpTotal: 0,
  streak: { current: 0, longest: 0 },
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
    await assertSucceeds(
      adminDb.doc("teacher_access_codes/ENTERPRISE1").set({
        ...inviteCodePayload,
        licenseId: ENTERPRISE_LICENSE_ID,
        trialClaimId: "",
        tier: "trust_enterprise",
        qualification: "a-level",
        unlockedChapterIds: [],
        dailyAnswerLimit: 0,
        maxClasses: 25,
        maxSeatsPerClass: 35,
        maxStudentSeats: 875,
        trialDays: 1095,
        note: "Trust Enterprise code",
      })
    );
    await assertSucceeds(teacherDb.doc("teacher_access_codes/ADMINCODE1").get());
    await assertFails(
      teacherDb
        .collection("teacher_access_codes")
        .where("targetTeacherEmail", "==", teacherEmail)
        .get()
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

    await assertSucceeds(db.doc(`trial_claims/${TRIAL_CLAIM_ID}`).get());
    await assertFails(
      db
        .collection("trial_claims")
        .where("targetTeacherEmail", "==", teacherEmail)
        .get()
    );

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

  test("lead teacher can redeem a targeted invite code and create a Tier 3 enterprise license", async () => {
    const teacherEmail = "teacher@school.com";
    const db = authDb(testEnv, teacherEmail);

    await seed(testEnv, [
      [
        "teacher_access_codes/ENTERPRISE",
        {
          targetTeacherEmail: teacherEmail,
          schoolName: SCHOOL_NAME,
          subjectIds: ["dt"],
          licenseId: ENTERPRISE_LICENSE_ID,
          trialClaimId: "",
          tier: "trust_enterprise",
          qualification: "a-level",
          unlockedChapterIds: [],
          dailyAnswerLimit: 0,
          maxClasses: 25,
          maxSeatsPerClass: 35,
          maxStudentSeats: 875,
          trialDays: 1095,
          status: "active",
          expiresAt: FUTURE_DATE,
          createdAt: new Date(NOW_MS),
          createdBy: "super-admin",
          note: "Trust Enterprise code",
        },
      ],
    ]);

    const batch = db.batch();
    batch.set(db.doc(`users/${teacherEmail}`), {
      ...teacherUser(teacherEmail, {
        accessCodeId: "ENTERPRISE",
        licenseId: ENTERPRISE_LICENSE_ID,
      }),
    });
    batch.set(db.doc(`licenses/${ENTERPRISE_LICENSE_ID}`), {
      school_name: SCHOOL_NAME,
      unlocked_subjects: ["dt"],
      unlocked_chapters: [],
      daily_answer_limit: 0,
      qualification: "a-level",
      tier: "trust_enterprise",
      max_classes: 25,
      max_seats_per_class: 35,
      max_student_seats: 875,
      ownerId: teacherEmail,
      teacherIds: [teacherEmail],
      adminIds: [],
      classes: [classRecord],
      status: "active",
      trialStartsAt: null,
      trialEndsAt: null,
      expiresAt: new Date(NOW_MS + 1095 * 24 * 60 * 60 * 1000),
      trialClaimId: "",
      createdFromAccessCodeId: "ENTERPRISE",
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    batch.update(db.doc("teacher_access_codes/ENTERPRISE"), {
      status: "redeemed",
      redeemedAt: new Date(NOW_MS),
      redeemedBy: teacherEmail,
      licenseId: ENTERPRISE_LICENSE_ID,
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

  test("class join codes can be checked by known code but cannot be broadly listed by students", async () => {
    const studentEmail = "student@school.com";
    const teacherEmail = "teacher@school.com";
    const studentDb = authDb(testEnv, studentEmail);
    const teacherDb = authDb(testEnv, teacherEmail);

    await seed(testEnv, [
      [`users/${teacherEmail}`, teacherUser(teacherEmail)],
      [
        "class_join_codes/JOIN60",
        {
          code: "JOIN60",
          classId: CLASS_ID,
          className: CLASS_NAME,
          licenseId: LICENSE_ID,
          schoolName: SCHOOL_NAME,
          createdBy: teacherEmail,
          createdByName: "Teacher One",
          status: "active",
          expiresAt: FUTURE_DATE,
          createdAt: NOW_MS,
          updatedAt: NOW_MS,
        },
      ],
      [
        "class_join_codes/OLD60",
        {
          code: "OLD60",
          classId: CLASS_ID,
          className: CLASS_NAME,
          licenseId: LICENSE_ID,
          schoolName: SCHOOL_NAME,
          createdBy: teacherEmail,
          createdByName: "Teacher One",
          status: "active",
          expiresAt: new Date(NOW_MS - 60 * 60 * 1000),
          createdAt: NOW_MS - 2 * 60 * 60 * 1000,
          updatedAt: NOW_MS - 2 * 60 * 60 * 1000,
        },
      ],
      [
        "class_join_codes/REVOKED60",
        {
          code: "REVOKED60",
          classId: CLASS_ID,
          className: CLASS_NAME,
          licenseId: LICENSE_ID,
          schoolName: SCHOOL_NAME,
          createdBy: teacherEmail,
          createdByName: "Teacher One",
          status: "revoked",
          expiresAt: FUTURE_DATE,
          createdAt: NOW_MS,
          updatedAt: NOW_MS + 1,
        },
      ],
    ]);

    await assertSucceeds(studentDb.doc("class_join_codes/JOIN60").get());
    await assertFails(studentDb.doc("class_join_codes/OLD60").get());
    await assertFails(studentDb.doc("class_join_codes/REVOKED60").get());
    await assertFails(studentDb.collection("class_join_codes").get());
    await assertSucceeds(
      teacherDb.collection("class_join_codes").where("createdBy", "==", teacherEmail).get()
    );
  });

  test("curriculum reads are scoped to admin listing or exact licensed subject access", async () => {
    const adminEmail = "dthub.app@gmail.com";
    const studentEmail = "student@school.com";
    const fullStudentEmail = "full.student@school.com";
    const soloEmail = "solo@school.com";
    const adminDb = authDb(testEnv, adminEmail);
    const studentDb = authDb(testEnv, studentEmail);
    const fullStudentDb = authDb(testEnv, fullStudentEmail);
    const soloDb = authDb(testEnv, soloEmail);
    const fullLicenseId = "full-school-dt-2026";
    const curriculumMetadata = {
      subject: "dt",
      subjectName: "Design Technology",
      title: "Design Technology",
      examBoard: "AQA",
      specification: "7552",
      version: "pilot",
      importFormat: "SHARPSTUDY_CURRICULUM_BLOCK_V1",
      storageModel: "chapter-subcollections-v1",
      chapterOrder: ["ch1", "ch2"],
      updatedAt: NOW_MS,
      updatedBy: adminEmail,
    };
    const chapterOne = {
      id: "ch1",
      subjectId: "dt",
      title: "Chapter 1",
      order: 0,
      updatedAt: NOW_MS,
      updatedBy: adminEmail,
    };
    const chapterTwo = {
      id: "ch2",
      subjectId: "dt",
      title: "Chapter 2",
      order: 1,
      updatedAt: NOW_MS,
      updatedBy: adminEmail,
    };
    const subsectionOne = {
      id: "sub1",
      subjectId: "dt",
      chapterId: "ch1",
      title: "1.1",
      order: 0,
      cards: [{ id: "card-1", front: "Q", back: "A", imageUrl: "" }],
      updatedAt: NOW_MS,
      updatedBy: adminEmail,
    };
    const writtenOne = {
      id: "wq-1",
      subjectId: "dt",
      chapterId: "ch1",
      topic: "1.1",
      question: "Explain one point.",
      marks: 2,
      points: ["Point"],
      imageUrl: "",
      imageRequired: "",
      order: 0,
      updatedAt: NOW_MS,
      updatedBy: adminEmail,
    };

    await seed(testEnv, [
      [`users/${adminEmail}`, adminUser(adminEmail)],
      [`users/${studentEmail}`, studentUser(studentEmail)],
      [
        `users/${fullStudentEmail}`,
        studentUser(fullStudentEmail, { licenseId: fullLicenseId }),
      ],
      [
        `users/${soloEmail}`,
        {
          name: "Solo Learner",
          role: "solo",
          writtenProgress: {},
          streak: baseStreak,
          trialUsage: {},
          xpTotal: 0,
          activeEngagements: 0,
          createdAt: NOW_MS,
          lastUpdated: NOW_MS,
        },
      ],
      [`licenses/${LICENSE_ID}`, licenseRecord()],
      [
        `licenses/${fullLicenseId}`,
        licenseRecord("teacher@school.com", {
          status: "active",
          unlocked_chapters: [],
          daily_answer_limit: 0,
        }),
      ],
      ["curriculums/dt", curriculumMetadata],
      ["curriculums/dt/chapters/ch1", chapterOne],
      ["curriculums/dt/chapters/ch2", chapterTwo],
      [
        "curriculums/dt/chapters/ch1/subsections/sub1",
        subsectionOne,
      ],
      [
        "curriculums/dt/chapters/ch2/subsections/sub2",
        {
          ...subsectionOne,
          id: "sub2",
          chapterId: "ch2",
          title: "2.1",
        },
      ],
      [
        "curriculums/dt/chapters/ch1/writtenQuestions/wq-1",
        writtenOne,
      ],
      [
        "curriculums/dt/chapters/ch2/writtenQuestions/wq-2",
        {
          ...writtenOne,
          id: "wq-2",
          chapterId: "ch2",
          topic: "2.1",
        },
      ],
      [
        "curriculums/physics",
        {
          ...curriculumMetadata,
          subject: "physics",
          subjectName: "Physics",
          title: "Physics",
          specification: "7408",
          chapterOrder: ["phys-ch1"],
        },
      ],
      [
        "curriculums/physics/chapters/phys-ch1",
        {
          id: "phys-ch1",
          subjectId: "physics",
          title: "Physics Chapter 1",
          order: 0,
          updatedAt: NOW_MS,
          updatedBy: adminEmail,
        },
      ],
    ]);

    await assertSucceeds(adminDb.collection("curriculums").get());
    await assertSucceeds(
      adminDb.doc("curriculums/admin-created/chapters/ch1").set({
        ...chapterOne,
        subjectId: "admin-created",
      })
    );
    await assertFails(
      adminDb.doc("curriculums/legacy-dt").set({
        ...curriculumMetadata,
        subject: "legacy-dt",
        chapters: [],
        writtenQuestions: [],
      })
    );

    await assertSucceeds(studentDb.doc("curriculums/dt").get());
    await assertSucceeds(studentDb.doc("curriculums/dt/chapters/ch1").get());
    await assertSucceeds(studentDb.collection("curriculums/dt/chapters/ch1/subsections").get());
    await assertSucceeds(studentDb.doc("curriculums/dt/chapters/ch1/writtenQuestions/wq-1").get());
    await assertFails(studentDb.doc("curriculums/dt/chapters/ch2").get());
    await assertFails(studentDb.collection("curriculums/dt/chapters/ch2/subsections").get());
    await assertFails(studentDb.doc("curriculums/dt/chapters/ch2/writtenQuestions/wq-2").get());
    await assertFails(studentDb.doc("curriculums/physics").get());
    await assertFails(studentDb.collection("curriculums").get());

    await assertSucceeds(fullStudentDb.doc("curriculums/dt/chapters/ch2").get());
    await assertSucceeds(fullStudentDb.collection("curriculums/dt/chapters/ch2/subsections").get());

    await assertSucceeds(soloDb.doc("curriculums/dt").get());
    await assertSucceeds(soloDb.doc("curriculums/dt/chapters/ch2").get());
    await assertFails(soloDb.doc("curriculums/physics").get());
  });

  test("student progress accepts current memory records and rejects malformed or stale writes", async () => {
    const studentEmail = "student@school.com";
    const db = authDb(testEnv, studentEmail);
    const progressRef = db.doc(`users/${studentEmail}/progress/ch1-sub1-card1`);

    await seed(testEnv, [[`users/${studentEmail}`, studentUser(studentEmail)]]);

    await assertSucceeds(progressRef.set(memoryProgressRecord()));
    await assertSucceeds(
      progressRef.set(
        memoryProgressRecord({
          baseMastery: 88,
          consecutiveCorrect: 2,
          dueAt: NOW_MS + 4 * 24 * 60 * 60 * 1000,
          lastSeen: NOW_MS + 1,
          reviews: 2,
          stabilityDays: 4.8,
        }),
        { merge: true }
      )
    );
    await assertFails(
      progressRef.set(
        memoryProgressRecord({
          lastSeen: NOW_MS - 1,
        }),
        { merge: true }
      )
    );
    await assertFails(
      progressRef.set(
        {
          ...memoryProgressRecord({ lastSeen: NOW_MS + 2 }),
          injectedField: "not allowed",
        },
        { merge: true }
      )
    );
    await assertFails(
      progressRef.set(memoryProgressRecord({ baseMastery: 140, lastSeen: NOW_MS + 3 }), {
        merge: true,
      })
    );
  });

  test("public profiles must mirror the signed-in user's private profile", async () => {
    const studentEmail = "student@school.com";
    const db = authDb(testEnv, studentEmail);

    await seed(testEnv, [[`users/${studentEmail}`, studentUser(studentEmail)]]);

    await assertSucceeds(
      db.doc(`public_profiles/${studentEmail}`).set(publicProfileRecord(studentEmail))
    );
    await assertFails(
      db.doc(`public_profiles/${studentEmail}`).set(
        publicProfileRecord(studentEmail, {
          role: "teacher",
        }),
        { merge: true }
      )
    );
    await assertFails(
      db.doc(`public_profiles/${studentEmail}`).set(
        publicProfileRecord(studentEmail, {
          classId: "OTHER-CLASS",
          classIds: ["OTHER-CLASS"],
        }),
        { merge: true }
      )
    );
    await assertFails(
      db.doc(`public_profiles/${studentEmail}`).set(
        publicProfileRecord(studentEmail, {
          name: "Someone Else",
        }),
        { merge: true }
      )
    );
  });

  test("private class records and assignments require the reader's active license", async () => {
    const teacherEmail = "teacher@school.com";
    const expiredTeacherEmail = "expired.teacher@school.com";
    const studentEmail = "student@school.com";
    const otherStudentEmail = "other.student@school.com";
    const otherLicenseId = "other-school-dt-2026";
    const expiredLicenseId = "expired-school-dt-2026";
    const teacherDb = authDb(testEnv, teacherEmail);
    const expiredTeacherDb = authDb(testEnv, expiredTeacherEmail);
    const studentDb = authDb(testEnv, studentEmail);

    await seed(testEnv, [
      [`users/${teacherEmail}`, teacherUser(teacherEmail)],
      [`users/${expiredTeacherEmail}`, teacherUser(expiredTeacherEmail, { licenseId: expiredLicenseId })],
      [`users/${studentEmail}`, studentUser(studentEmail)],
      [
        `users/${otherStudentEmail}`,
        studentUser(otherStudentEmail, {
          licenseId: otherLicenseId,
          schoolName: "Other School",
        }),
      ],
      [`licenses/${LICENSE_ID}`, licenseRecord(teacherEmail)],
      [`licenses/${otherLicenseId}`, licenseRecord("other.teacher@school.com", { school_name: "Other School" })],
      [
        `licenses/${expiredLicenseId}`,
        licenseRecord(expiredTeacherEmail, {
          status: "expired",
          expiresAt: new Date(NOW_MS - 24 * 60 * 60 * 1000),
        }),
      ],
      [`users/${studentEmail}/progress/ch1-sub1-card1`, memoryProgressRecord()],
      [`users/${otherStudentEmail}/progress/ch1-sub1-card1`, memoryProgressRecord()],
      ["assignments/assignment-1", assignmentRecord],
      [
        "assignments/assignment-other-license",
        {
          ...assignmentRecord,
          teacherId: "other.teacher@school.com",
          licenseId: otherLicenseId,
        },
      ],
    ]);

    await assertSucceeds(teacherDb.doc(`users/${studentEmail}`).get());
    await assertSucceeds(teacherDb.doc(`users/${studentEmail}/progress/ch1-sub1-card1`).get());
    await assertSucceeds(teacherDb.doc("assignments/assignment-1").get());
    await assertFails(teacherDb.doc(`users/${otherStudentEmail}`).get());
    await assertFails(teacherDb.doc(`users/${otherStudentEmail}/progress/ch1-sub1-card1`).get());
    await assertFails(teacherDb.doc("assignments/assignment-other-license").get());

    await assertSucceeds(studentDb.doc("assignments/assignment-1").get());
    await assertFails(studentDb.doc("assignments/assignment-other-license").get());

    await assertFails(expiredTeacherDb.doc(`users/${studentEmail}`).get());
    await assertFails(expiredTeacherDb.doc(`users/${studentEmail}/progress/ch1-sub1-card1`).get());
    await assertFails(expiredTeacherDb.doc("assignments/assignment-1").get());
  });

  test("trial answer usage is limited to one increment inside a rolling 24 hour window", async () => {
    const studentEmail = "student@school.com";
    const expiredWindowStudentEmail = "expired-window@school.com";
    const db = authDb(testEnv, studentEmail);
    const expiredWindowDb = authDb(testEnv, expiredWindowStudentEmail);
    const userRef = db.doc(`users/${studentEmail}`);
    const expiredWindowUserRef = expiredWindowDb.doc(`users/${expiredWindowStudentEmail}`);
    const usage = {
      dayKey: "2026-07-28",
      windowStartedAt: NOW_MS,
      answerCount: 3,
      dailyLimit: 30,
      tier: "starter_trial",
      lastAnswerAt: NOW_MS,
    };
    const expiredWindowUsage = {
      ...usage,
      windowStartedAt: NOW_MS - 86400001,
      answerCount: 30,
      lastAnswerAt: NOW_MS - 86400000,
    };

    await seed(testEnv, [
      [`users/${studentEmail}`, studentUser(studentEmail, { trialUsage: usage })],
      [
        `users/${expiredWindowStudentEmail}`,
        studentUser(expiredWindowStudentEmail, { trialUsage: expiredWindowUsage }),
      ],
    ]);

    await assertSucceeds(
      userRef.update({
        trialUsage: { ...usage, answerCount: 4, lastAnswerAt: NOW_MS + 1 },
        lastUpdated: NOW_MS + 1,
      })
    );
    await assertFails(
      userRef.update({
        trialUsage: { ...usage, answerCount: 2, lastAnswerAt: NOW_MS + 2 },
        lastUpdated: NOW_MS + 2,
      })
    );
    await assertFails(
      userRef.update({
        trialUsage: { ...usage, answerCount: 8, lastAnswerAt: NOW_MS + 3 },
        lastUpdated: NOW_MS + 3,
      })
    );
    await assertFails(
      userRef.update({
        trialUsage: {
          ...usage,
          answerCount: 5,
          dailyLimit: 500,
          lastAnswerAt: NOW_MS + 4,
        },
        lastUpdated: NOW_MS + 4,
      })
    );
    await assertFails(
      userRef.update({
        trialUsage: {
          ...usage,
          windowStartedAt: NOW_MS - 1000,
          answerCount: 1,
          lastAnswerAt: NOW_MS + 5,
        },
        lastUpdated: NOW_MS + 5,
      })
    );
    await assertSucceeds(
      expiredWindowUserRef.update({
        trialUsage: {
          ...usage,
          windowStartedAt: NOW_MS,
          answerCount: 1,
          lastAnswerAt: NOW_MS + 6,
        },
        lastUpdated: NOW_MS + 6,
      })
    );
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

  test("teacher operational writes require their own active license and class membership", async () => {
    const teacherEmail = "teacher@school.com";
    const studentEmail = "student@school.com";
    const teacherDb = authDb(testEnv, teacherEmail);
    const activeJoinCodePayload = {
      code: "NEW60",
      classId: CLASS_ID,
      className: CLASS_NAME,
      licenseId: LICENSE_ID,
      schoolName: SCHOOL_NAME,
      createdBy: teacherEmail,
      createdByName: "Teacher One",
      status: "active",
      expiresAt: new Date(NOW_MS + 60 * 60 * 1000),
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    };
    const nudgePayload = {
      targetUserId: studentEmail,
      targetName: "Student One",
      classId: CLASS_ID,
      className: CLASS_NAME,
      teacherId: teacherEmail,
      teacherName: "Teacher One",
      message: "Please check your active assignment.",
      reason: "incomplete-prep",
      assignmentIds: ["assignment-1"],
      status: "unread",
      createdAt: NOW_MS,
    };
    const invitePayload = {
      targetTeacherEmail: "shared.teacher@school.com",
      invitedBy: teacherEmail,
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
    };

    await seed(testEnv, [
      [`users/${teacherEmail}`, teacherUser(teacherEmail)],
      [`users/${studentEmail}`, studentUser(studentEmail)],
      [`licenses/${LICENSE_ID}`, licenseRecord(teacherEmail)],
    ]);

    await assertSucceeds(teacherDb.doc("class_join_codes/NEW60").set(activeJoinCodePayload));
    await assertFails(
      teacherDb.doc("class_join_codes/BAD60").set({
        ...activeJoinCodePayload,
        code: "BAD60",
        licenseId: "",
      })
    );
    await assertSucceeds(teacherDb.doc("class_invites/invite-active").set(invitePayload));
    await assertSucceeds(teacherDb.doc("nudges/nudge-active").set(nudgePayload));
    await assertSucceeds(
      teacherDb.doc("assignments/assignment-created").set({
        ...assignmentRecord,
        teacherId: teacherEmail,
        deadline: NOW_MS + 3 * 24 * 60 * 60 * 1000,
      })
    );
    await assertFails(
      teacherDb.doc("assignments/assignment-no-license").set({
        ...assignmentRecord,
        teacherId: teacherEmail,
        licenseId: "",
        deadline: NOW_MS + 3 * 24 * 60 * 60 * 1000,
      })
    );
    await assertFails(
      teacherDb.doc("assignments/assignment-wrong-subject").set({
        ...assignmentRecord,
        teacherId: teacherEmail,
        subjectId: "physics",
        deadline: NOW_MS + 3 * 24 * 60 * 60 * 1000,
      })
    );

    await seed(testEnv, [
      [
        `licenses/${LICENSE_ID}`,
        licenseRecord(teacherEmail, {
          status: "expired",
          expiresAt: new Date(NOW_MS - 24 * 60 * 60 * 1000),
        }),
      ],
    ]);

    await assertFails(
      teacherDb.doc("assignments/assignment-expired-license").set({
        ...assignmentRecord,
        teacherId: teacherEmail,
        deadline: NOW_MS + 3 * 24 * 60 * 60 * 1000,
      })
    );
    await assertFails(
      teacherDb.doc("class_invites/invite-expired").set({
        ...invitePayload,
        updatedAt: NOW_MS + 1,
      })
    );
    await assertFails(
      teacherDb.doc("nudges/nudge-expired").set({
        ...nudgePayload,
        createdAt: NOW_MS + 1,
      })
    );
  });

  test("student feedback stays anonymous and rejects reporter email fields", async () => {
    const studentEmail = "student@school.com";
    const teacherEmail = "teacher@school.com";
    const otherTeacherEmail = "other.teacher@school.com";
    const soloEmail = "solo@school.com";
    const db = authDb(testEnv, studentEmail);
    const teacherDb = authDb(testEnv, teacherEmail);
    const otherTeacherDb = authDb(testEnv, otherTeacherEmail);
    const soloDb = authDb(testEnv, soloEmail);
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

    await seed(testEnv, [
      [`users/${studentEmail}`, studentUser(studentEmail)],
      [`users/${teacherEmail}`, teacherUser(teacherEmail)],
      [
        `users/${otherTeacherEmail}`,
        teacherUser(otherTeacherEmail, {
          classCode: "OTHER-CLASS",
          classId: "OTHER-CLASS",
          classIds: ["OTHER-CLASS"],
          classes: [{ id: "OTHER-CLASS", name: "Other Class", subjectIds: ["dt"] }],
          licenseId: "other-license",
        }),
      ],
      [
        `users/${soloEmail}`,
        {
          name: "Solo Learner",
          role: "solo",
          writtenProgress: {},
          streak: baseStreak,
          trialUsage: {},
          xpTotal: 0,
          activeEngagements: 0,
          createdAt: NOW_MS,
          lastUpdated: NOW_MS,
        },
      ],
    ]);

    await assertSucceeds(db.doc("flagged_content/flag-1").set(flagPayload));
    await assertSucceeds(teacherDb.doc("flagged_content/flag-1").get());
    await assertFails(otherTeacherDb.doc("flagged_content/flag-1").get());
    await assertFails(
      db.doc("flagged_content/flag-2").set({
        ...flagPayload,
        reporterEmail: studentEmail,
      })
    );
    await assertFails(
      db.doc("flagged_content/flag-3").set({
        ...flagPayload,
        classIds: ["OTHER-CLASS"],
      })
    );
    await assertFails(
      db.doc("flagged_content/flag-4").set({
        ...flagPayload,
        reporterRole: "teacher",
      })
    );
    await assertSucceeds(
      soloDb.doc("flagged_content/flag-5").set({
        ...flagPayload,
        classIds: [],
        classLabels: [],
        licenseId: "",
        schoolName: "",
        reporterRole: "solo",
      })
    );
  });

  test("license class updates and approved student records keep immutable fields locked", async () => {
    const teacherEmail = "teacher@school.com";
    const studentEmail = "student@school.com";
    const teacherDb = authDb(testEnv, teacherEmail);
    const studentDb = authDb(testEnv, studentEmail);
    const recycledStudentDb = authDbWithUid(testEnv, "recycled-auth-uid", studentEmail);
    const approvalRef = teacherDb.doc(
      `licenses/${LICENSE_ID}/approved_students/${studentEmail}`
    );
    const approvalPayload = {
      email: studentEmail,
      displayName: "Student One",
      licenseId: LICENSE_ID,
      schoolName: SCHOOL_NAME,
      status: "approved",
      createdAt: NOW_MS,
      createdBy: teacherEmail,
      updatedAt: NOW_MS,
      updatedBy: teacherEmail,
    };

    await seed(testEnv, [
      [`users/${teacherEmail}`, teacherUser(teacherEmail)],
      [`users/${studentEmail}`, studentUser(studentEmail)],
      [`licenses/${LICENSE_ID}`, licenseRecord(teacherEmail)],
    ]);

    await assertSucceeds(
      teacherDb.doc(`licenses/${LICENSE_ID}`).set(
        {
          classes: [
            classRecord,
            { id: "CLASS-12Z", name: "Year 12 DT", subjects: ["dt"], seatCount: 0 },
          ],
          updatedAt: NOW_MS + 1,
        },
        { merge: true }
      )
    );
    await assertFails(
      teacherDb.doc(`licenses/${LICENSE_ID}`).set(
        {
          teacherIds: [teacherEmail, "uninvited@school.com"],
          updatedAt: NOW_MS + 2,
        },
        { merge: true }
      )
    );
    await assertFails(
      teacherDb.doc(`licenses/${LICENSE_ID}`).set(
        {
          classes: [
            classRecord,
            { id: "CLASS-2", name: "Class 2", subjects: ["dt"] },
            { id: "CLASS-3", name: "Class 3", subjects: ["dt"] },
            { id: "CLASS-4", name: "Class 4", subjects: ["dt"] },
          ],
          updatedAt: NOW_MS + 3,
        },
        { merge: true }
      )
    );

    await assertSucceeds(approvalRef.set(approvalPayload));
    await assertSucceeds(
      approvalRef.set(
        {
          displayName: "Student One Updated",
          updatedAt: NOW_MS + 1,
          updatedBy: teacherEmail,
        },
        { merge: true }
      )
    );
    await assertFails(
      approvalRef.set(
        {
          createdBy: "spoofed@school.com",
          updatedAt: NOW_MS + 2,
          updatedBy: teacherEmail,
        },
        { merge: true }
      )
    );
    await assertSucceeds(
      studentDb.doc(`licenses/${LICENSE_ID}/approved_students/${studentEmail}`).set(
        {
          status: "joined",
          claimedBy: studentEmail,
          claimedUid: studentEmail,
          claimedAt: new Date(NOW_MS + 2),
          joinedClassIds: [CLASS_ID],
          updatedAt: NOW_MS + 2,
          updatedBy: studentEmail,
        },
        { merge: true }
      )
    );
    await assertFails(
      studentDb.doc(`licenses/${LICENSE_ID}/approved_students/${studentEmail}`).set(
        {
          status: "joined",
          claimedBy: studentEmail,
          claimedUid: studentEmail,
          claimedAt: new Date(NOW_MS + 3),
          joinedClassIds: ["OTHER-CLASS"],
          updatedAt: NOW_MS + 3,
          updatedBy: studentEmail,
        },
        { merge: true }
      )
    );
    await assertFails(
      recycledStudentDb.doc(`licenses/${LICENSE_ID}/approved_students/${studentEmail}`).set(
        {
          status: "joined",
          claimedBy: studentEmail,
          claimedUid: "recycled-auth-uid",
          claimedAt: new Date(NOW_MS + 4),
          joinedClassIds: [CLASS_ID],
          updatedAt: NOW_MS + 4,
          updatedBy: studentEmail,
        },
        { merge: true }
      )
    );
    await assertFails(
      approvalRef.set(
        {
          status: "approved",
          updatedAt: NOW_MS + 5,
          updatedBy: teacherEmail,
        },
        { merge: true }
      )
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
