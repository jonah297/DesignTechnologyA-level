const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const REGION = "europe-west2";
const DEFAULT_SUBJECT_ID = "dt";
const TIER_ONE_TRIAL_TIER = "starter_trial";
const TIER_ONE_TRIAL_DAYS = 14;
const TIER_ONE_DAILY_ANSWER_LIMIT = 30;
const TIER_ONE_DEFAULT_CHAPTER_IDS = ["ch1"];
const TIER_TWO_SCHOOL_TIER = "school_core";
const TIER_TWO_LICENSE_DAYS = 365;
const TIER_TWO_MAX_CLASSES = 5;
const TIER_TWO_SEATS_PER_CLASS = 35;
const TIER_THREE_ENTERPRISE_TIER = "trust_enterprise";
const TIER_THREE_LICENSE_DAYS = 1095;
const TIER_THREE_MAX_CLASSES = 25;
const TIER_THREE_SEATS_PER_CLASS = 35;
const DEFAULT_QUALIFICATION = "a-level";
const DAY_MS = 86400000;
const DEFAULT_STREAK = { current: 0, longest: 0, lastDate: 0 };
const DEFAULT_NUDGE_POLICY = {
  enabled: true,
  assignmentNudgeEnabled: true,
  studyNudgeEnabled: true,
  streakNudgeEnabled: true,
  highDecayNudgeEnabled: true,
  assignmentIdleDays: 2,
  studyIdleDays: 4,
  streakWarningHours: 24,
  highDecayMastery: 65,
};
const DEFAULT_REWARD_POLICY = {
  enabled: true,
  assignmentRewardEnabled: true,
  streakRewardEnabled: true,
  improvementRewardEnabled: true,
  assignmentMasteryThreshold: 80,
  streakRewardDays: 5,
  improvementXpThreshold: 90,
};

const normalizeTeacherAccessCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const normalizeName = (value) => String(value || "").trim().replace(/\s+/g, " ");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const normalizeLicenseId = (value) =>
  String(value || "")
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

const clampPilotNumber = (value, fallback, min, max) => {
  const numeric = Number(value);
  const candidate = Number.isFinite(numeric) ? numeric : fallback;
  return Math.max(min, Math.min(max, candidate));
};

const normalizeChapterIds = (codeData, tier = TIER_ONE_TRIAL_TIER) => {
  if (tier === TIER_TWO_SCHOOL_TIER || tier === TIER_THREE_ENTERPRISE_TIER) return [];
  const rawChapterIds = Array.isArray(codeData.unlockedChapterIds)
    ? codeData.unlockedChapterIds
    : Array.isArray(codeData.unlocked_chapters)
      ? codeData.unlocked_chapters
      : TIER_ONE_DEFAULT_CHAPTER_IDS;
  const chapterIds = rawChapterIds
    .map((chapterId) => String(chapterId || "").trim())
    .filter(Boolean);
  return chapterIds.length > 0 ? Array.from(new Set(chapterIds)).slice(0, 20) : TIER_ONE_DEFAULT_CHAPTER_IDS;
};

const getTeacherClassCode = (email) => {
  const localPart = (email || "").split("@")[0] || "CLASS";
  return `${localPart.slice(0, 5).toUpperCase()}-CLASS`;
};

const createDefaultClass = (email, subjects) => {
  const id = getTeacherClassCode(email);
  const label = id.replace(/-/g, " ");
  return {
    id,
    name: label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
    subjects,
    nudgePolicy: DEFAULT_NUDGE_POLICY,
    rewardPolicy: DEFAULT_REWARD_POLICY,
  };
};

const normalizeSubjectIds = (codeData) => {
  const rawSubjects = Array.isArray(codeData.subjectIds)
    ? codeData.subjectIds
    : Array.isArray(codeData.unlocked_subjects)
      ? codeData.unlocked_subjects
      : [DEFAULT_SUBJECT_ID];
  const subjects = rawSubjects
    .map((subject) => String(subject || "").trim().toLowerCase())
    .filter(Boolean);
  return subjects.length > 0 ? Array.from(new Set(subjects)).slice(0, 12) : [DEFAULT_SUBJECT_ID];
};

const timestampToMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
};

const getPublicProfilePayload = (userData, now) => ({
  name: userData.name || "",
  role: userData.role || "student",
  classId: Array.isArray(userData.classIds) ? userData.classIds[0] || "" : "",
  classIds: Array.isArray(userData.classIds) ? userData.classIds : [],
  xpTotal: 0,
  streak: {
    current: 0,
    longest: 0,
  },
  updatedAt: now,
});

exports.redeemTeacherAccessCode = onCall({ region: REGION }, async (request) => {
  const authEmail = normalizeEmail(request.auth?.token?.email);
  if (!authEmail) {
    throw new HttpsError("unauthenticated", "Sign in before redeeming a teacher invite code.");
  }

  const accessCodeId = normalizeTeacherAccessCode(request.data?.accessCode);
  const teacherName = normalizeName(request.data?.name);
  if (accessCodeId.length < 10) {
    throw new HttpsError("invalid-argument", "That teacher invite code is too short.");
  }
  if (!teacherName) {
    throw new HttpsError("invalid-argument", "Teacher name is required.");
  }
  if (teacherName.length > 90) {
    throw new HttpsError("invalid-argument", "Teacher name is too long.");
  }

  const now = Date.now();
  const codeRef = db.collection("teacher_access_codes").doc(accessCodeId);
  const userRef = db.collection("users").doc(authEmail);
  const publicProfileRef = db.collection("public_profiles").doc(authEmail);

  return db.runTransaction(async (transaction) => {
    const [codeSnap, userSnap] = await Promise.all([
      transaction.get(codeRef),
      transaction.get(userRef),
    ]);

    if (!codeSnap.exists) {
      throw new HttpsError("not-found", "That teacher invite code was not found.");
    }
    if (userSnap.exists) {
      throw new HttpsError("already-exists", "This teacher profile already exists.");
    }

    const codeData = codeSnap.data() || {};
    if (codeData.status !== "active") {
      throw new HttpsError(
        "failed-precondition",
        "That teacher invite code has already been used or closed."
      );
    }

    const targetTeacherEmail = normalizeEmail(codeData.targetTeacherEmail);
    if (!targetTeacherEmail || targetTeacherEmail !== authEmail) {
      throw new HttpsError(
        "permission-denied",
        "That teacher invite code is not assigned to this email address."
      );
    }

    const expiresAt = timestampToMillis(codeData.expiresAt);
    if (expiresAt && expiresAt < now) {
      throw new HttpsError("deadline-exceeded", "That teacher invite code has expired.");
    }

    const licenseTier =
      normalizeName(codeData.tier).toLowerCase() === TIER_TWO_SCHOOL_TIER
        ? TIER_TWO_SCHOOL_TIER
        : normalizeName(codeData.tier).toLowerCase() === TIER_THREE_ENTERPRISE_TIER
          ? TIER_THREE_ENTERPRISE_TIER
          : TIER_ONE_TRIAL_TIER;
    const isStarterTrial = licenseTier === TIER_ONE_TRIAL_TIER;
    const isEnterpriseLicense = licenseTier === TIER_THREE_ENTERPRISE_TIER;
    const subjectIds = normalizeSubjectIds(codeData);
    const maxClasses = clampPilotNumber(
      codeData.maxClasses,
      isStarterTrial
        ? 3
        : isEnterpriseLicense
          ? TIER_THREE_MAX_CLASSES
          : TIER_TWO_MAX_CLASSES,
      1,
      isEnterpriseLicense ? 50 : 10
    );
    const maxSeatsPerClass = clampPilotNumber(
      codeData.maxSeatsPerClass,
      isStarterTrial
        ? 35
        : isEnterpriseLicense
          ? TIER_THREE_SEATS_PER_CLASS
          : TIER_TWO_SEATS_PER_CLASS,
      1,
      60
    );
    const trialDays = clampPilotNumber(
      codeData.trialDays,
      isStarterTrial
        ? TIER_ONE_TRIAL_DAYS
        : isEnterpriseLicense
          ? TIER_THREE_LICENSE_DAYS
          : TIER_TWO_LICENSE_DAYS,
      1,
      isStarterTrial ? 120 : isEnterpriseLicense ? 1825 : 1095
    );
    const dailyAnswerLimit = isStarterTrial
      ? clampPilotNumber(codeData.dailyAnswerLimit, TIER_ONE_DAILY_ANSWER_LIMIT, 1, 100)
      : 0;
    const qualification =
      normalizeName(codeData.qualification).toLowerCase() === "gcse"
        ? "gcse"
        : DEFAULT_QUALIFICATION;
    const unlockedChapterIds = normalizeChapterIds(codeData, licenseTier);
    const schoolName =
      normalizeName(codeData.schoolName || codeData.school_name) || `${teacherName} School`;
    const defaultClass = createDefaultClass(authEmail, subjectIds);
    const licenseId =
      normalizeLicenseId(codeData.licenseId) ||
      `pilot-${accessCodeId.toLowerCase()}`;
    const licenseRef = db.collection("licenses").doc(licenseId);
    const trialClaimId = isStarterTrial ? normalizeLicenseId(codeData.trialClaimId) : "";
    const trialClaimRef = trialClaimId ? db.collection("trial_claims").doc(trialClaimId) : null;
    const [licenseSnap, trialClaimSnap] = await Promise.all([
      transaction.get(licenseRef),
      trialClaimRef ? transaction.get(trialClaimRef) : Promise.resolve(null),
    ]);

    if (licenseSnap.exists) {
      throw new HttpsError(
        "already-exists",
        "A license already exists for this invite code. Ask the Super Admin to issue a new code."
      );
    }
    if (
      isStarterTrial &&
      (
        !trialClaimRef ||
        !trialClaimSnap?.exists ||
        trialClaimSnap.data()?.status !== "reserved" ||
        trialClaimSnap.data()?.accessCodeId !== accessCodeId
      )
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This school trial claim is missing or already used."
      );
    }

    const userData = {
      name: teacherName,
      role: "teacher",
      writtenProgress: {},
      streak: DEFAULT_STREAK,
      trialUsage: {},
      xpTotal: 0,
      activeEngagements: 0,
      createdAt: now,
      lastUpdated: now,
      classCode: defaultClass.id,
      classes: [defaultClass],
      classIds: [defaultClass.id],
      licenseId,
      accessCodeId,
      accountManager: true,
      schoolName,
    };

    const trialStartsAt = admin.firestore.Timestamp.fromMillis(now);
    const trialEndsAt = admin.firestore.Timestamp.fromMillis(now + trialDays * DAY_MS);
    const licensePayload = {
      school_name: schoolName,
      unlocked_subjects: subjectIds,
      unlocked_chapters: unlockedChapterIds,
      daily_answer_limit: dailyAnswerLimit,
      qualification,
      tier: licenseTier,
      max_classes: maxClasses,
      max_seats_per_class: maxSeatsPerClass,
      max_student_seats: maxClasses * maxSeatsPerClass,
      ownerId: authEmail,
      teacherIds: [authEmail],
      adminIds: [],
      classes: [{ ...defaultClass, seatCount: 0 }],
      status: isStarterTrial ? "trial" : "active",
      trialStartsAt: isStarterTrial ? trialStartsAt : null,
      trialEndsAt: isStarterTrial ? trialEndsAt : null,
      expiresAt: trialEndsAt,
      trialClaimId,
      createdFromAccessCodeId: accessCodeId,
      createdAt: now,
      updatedAt: now,
    };

    transaction.set(userRef, userData);
    transaction.set(publicProfileRef, getPublicProfilePayload(userData, now), { merge: true });
    transaction.set(licenseRef, licensePayload);
    if (isStarterTrial) {
      transaction.update(trialClaimRef, {
        status: "claimed",
        claimedAt: trialStartsAt,
        claimedBy: authEmail,
        updatedAt: now,
      });
    }
    transaction.set(
      codeRef,
      {
        status: "redeemed",
        redeemedAt: trialStartsAt,
        redeemedBy: authEmail,
        licenseId,
        updatedAt: now,
      },
      { merge: true }
    );

    return {
      ok: true,
      licenseId,
      classId: defaultClass.id,
      schoolName,
      role: "teacher",
      accountManager: true,
    };
  });
});
