import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  flashcardData as legacyFlashcardData,
  writtenData as legacyWrittenData,
} from "./data";
import { db, auth } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { MasteryRing } from "./components/MasteryRing";
import { QuizCard, WrittenQuizCard } from "./components/QuizCards";
import { Skeleton } from "./components/Skeleton";
import { AdminCurriculumEditor } from "./components/AdminCurriculumEditor";
import "./styles.css";

const DEFAULT_STREAK = { current: 0, longest: 0, lastDate: 0 };
const TEACHER_ACCESS_CODE_MIN_LENGTH = 10;
const MAX_TEACHERS_PER_CLASS = 5;
const ROOT_ADMIN_ID = "admin";
const SUPER_ADMIN_KEY = process.env.REACT_APP_SUPER_ADMIN_KEY || "";
const DEFAULT_SUBJECT_ID = "dt";
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
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
const MAX_SIMULATION_DAYS = 365;
const BASE_XP = {
  flashcard: 10,
  essay: 30,
  assignment: 80,
  blitz: 5,
};
const A_LEVEL_TARGET_MASTERY = 90;
const MIN_TWO_YEAR_TARGET_XP = 9000;
const DEFAULT_CURRICULUM = {
  id: DEFAULT_SUBJECT_ID,
  subject: DEFAULT_SUBJECT_ID,
  subjectName: "Design Technology",
  title: "Design Technology",
  chapters: legacyFlashcardData,
  writtenQuestions: legacyWrittenData,
  updatedAt: 0,
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isValidSuperAdminKey = (value) =>
  /^[A-Za-z0-9]{24,}$/.test(SUPER_ADMIN_KEY) && value === SUPER_ADMIN_KEY;
const normalizeTeacherAccessCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const getTeacherAccessCodeError = (codeData, teacherEmail) => {
  if (!codeData) return "That pilot invite code was not found.";
  if (codeData.status !== "active") {
    return "That pilot invite code has already been used or has been closed.";
  }

  const targetEmail = String(codeData.targetTeacherEmail || "").trim().toLowerCase();
  if (!targetEmail || targetEmail !== teacherEmail) {
    return "That pilot invite code is not assigned to this email address.";
  }

  const expiresAt = timestampToMillis(codeData.expiresAt);
  if (expiresAt && expiresAt < Date.now()) {
    return "That pilot invite code has expired.";
  }

  return "";
};

const clampPilotNumber = (value, fallback, min, max) =>
  Math.max(min, Math.min(max, Number(value) || fallback));

const normalizeCurriculum = (curriculum = {}) => {
  const id = String(curriculum.id || curriculum.subject || DEFAULT_SUBJECT_ID)
    .trim()
    .toLowerCase();
  const subject = String(curriculum.subject || id || DEFAULT_SUBJECT_ID)
    .trim()
    .toLowerCase();

  return {
    id,
    subject,
    subjectName:
      curriculum.subjectName ||
      curriculum.title ||
      (id === DEFAULT_SUBJECT_ID ? "Design Technology" : id.toUpperCase()),
    title:
      curriculum.title ||
      curriculum.subjectName ||
      (id === DEFAULT_SUBJECT_ID ? "Design Technology" : id.toUpperCase()),
    examBoard: curriculum.examBoard || "",
    specification: curriculum.specification || "",
    version: curriculum.version || "",
    importFormat: curriculum.importFormat || "",
    chapters: Array.isArray(curriculum.chapters) ? curriculum.chapters : [],
    writtenQuestions: Array.isArray(curriculum.writtenQuestions)
      ? curriculum.writtenQuestions
      : [],
    updatedAt: curriculum.updatedAt || 0,
  };
};

const getClassSubjectIds = (classItem = {}, fallbackSubjects = [DEFAULT_SUBJECT_ID]) => {
  const subjects = Array.isArray(classItem.subjects) ? classItem.subjects : fallbackSubjects;
  return Array.from(new Set(subjects.map((subject) => String(subject).trim().toLowerCase())));
};

const normalizeNudgePolicy = (policy = {}) => ({
  enabled: policy.enabled !== false,
  assignmentNudgeEnabled: policy.assignmentNudgeEnabled !== false,
  studyNudgeEnabled: policy.studyNudgeEnabled !== false,
  streakNudgeEnabled: policy.streakNudgeEnabled !== false,
  highDecayNudgeEnabled: policy.highDecayNudgeEnabled !== false,
  assignmentIdleDays: Math.max(
    1,
    Math.min(14, Number(policy.assignmentIdleDays) || DEFAULT_NUDGE_POLICY.assignmentIdleDays)
  ),
  studyIdleDays: Math.max(
    1,
    Math.min(14, Number(policy.studyIdleDays) || DEFAULT_NUDGE_POLICY.studyIdleDays)
  ),
  streakWarningHours: Math.max(
    1,
    Math.min(48, Number(policy.streakWarningHours) || DEFAULT_NUDGE_POLICY.streakWarningHours)
  ),
  highDecayMastery: Math.max(
    1,
    Math.min(100, Number(policy.highDecayMastery) || DEFAULT_NUDGE_POLICY.highDecayMastery)
  ),
});

const normalizeRewardPolicy = (policy = {}) => ({
  enabled: policy.enabled !== false,
  assignmentRewardEnabled: policy.assignmentRewardEnabled !== false,
  streakRewardEnabled: policy.streakRewardEnabled !== false,
  improvementRewardEnabled: policy.improvementRewardEnabled !== false,
  assignmentMasteryThreshold: Math.max(
    1,
    Math.min(
      100,
      Number(policy.assignmentMasteryThreshold) ||
        DEFAULT_REWARD_POLICY.assignmentMasteryThreshold
    )
  ),
  streakRewardDays: Math.max(
    1,
    Math.min(30, Number(policy.streakRewardDays) || DEFAULT_REWARD_POLICY.streakRewardDays)
  ),
  improvementXpThreshold: Math.max(
    1,
    Math.min(
      500,
      Number(policy.improvementXpThreshold) || DEFAULT_REWARD_POLICY.improvementXpThreshold
    )
  ),
});

const getTeacherClassCode = (email) => {
  const localPart = (email || "").split("@")[0] || "CLASS";
  return `${localPart.slice(0, 5).toUpperCase()}-CLASS`;
};

const createDefaultClass = (email, fallbackCode = "") => {
  const id = fallbackCode || getTeacherClassCode(email);
  const label = id.replace(/-/g, " ");
  return {
    id,
    name: label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
    subjects: [DEFAULT_SUBJECT_ID],
    nudgePolicy: DEFAULT_NUDGE_POLICY,
    rewardPolicy: DEFAULT_REWARD_POLICY,
  };
};

const normalizeClasses = (user = {}) => {
  if (Array.isArray(user.classes) && user.classes.length > 0) {
    return user.classes
      .filter((classItem) => classItem?.id)
      .map((classItem) => ({
        id: String(classItem.id).trim().toUpperCase(),
        name: classItem.name || String(classItem.id).trim().toUpperCase(),
        subjects: getClassSubjectIds(classItem),
        nudgePolicy: normalizeNudgePolicy(classItem.nudgePolicy),
        rewardPolicy: normalizeRewardPolicy(classItem.rewardPolicy),
      }));
  }

  if (user.role === "teacher" || user.classCode) {
    return [createDefaultClass(user.id || "", user.classCode || "")];
  }

  return [];
};

const getStudentClassIds = (user = {}) => {
  const ids = Array.isArray(user.classIds) ? user.classIds : [];
  const legacyIds = [user.classId, user.classCode].filter(Boolean);
  return Array.from(new Set([...ids, ...legacyIds].map((id) => String(id).trim().toUpperCase())));
};

const getPublicProfilePayload = (user = {}) => {
  const classIds = getStudentClassIds(user);
  const streak = user.streak || DEFAULT_STREAK;

  return {
    name: user.name || "",
    role: user.role || "student",
    classId: classIds[0] || "",
    classIds,
    xpTotal: Math.round(user.xpTotal || 0),
    streak: {
      current: Math.max(0, Math.round(streak.current || 0)),
      longest: Math.max(0, Math.round(streak.longest || 0)),
    },
    updatedAt: Date.now(),
  };
};

const slugifyClassName = (value) =>
  String(value || "class")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 18) || "class";

const generateClassJoinCodeValue = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const length = 10;
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const values = new Uint32Array(length);
    window.crypto.getRandomValues(values);
    return Array.from(values, (value) => chars[value % chars.length]).join("");
  }
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const getChapterNumber = (value) => {
  const match = String(value || "").match(/\d+/);
  return match ? match[0] : "";
};

const getTopicCode = (value, fallback = "") => {
  const match = String(value || "").match(/\b\d+(?:\.\d+)*\b/);
  return match ? match[0] : String(fallback || value || "");
};

const getOrdinalRank = (rank) => {
  if (!rank) return "";
  const suffix =
    rank % 100 >= 11 && rank % 100 <= 13
      ? "th"
      : rank % 10 === 1
        ? "st"
        : rank % 10 === 2
          ? "nd"
          : rank % 10 === 3
            ? "rd"
            : "th";
  return `${rank}${suffix}`;
};

const getRankTier = (rank) => {
  if (rank === 1) return { label: "1st", className: "rank-badge gold" };
  if (rank === 2) return { label: "2nd", className: "rank-badge silver" };
  if (rank === 3) return { label: "3rd", className: "rank-badge bronze" };
  return { label: getOrdinalRank(rank), className: "rank-badge" };
};

const formatDateTimeLocal = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

const formatTimeRemaining = (deadline, now = Date.now()) => {
  const rawRemaining = (deadline || 0) - now;
  const remaining = Math.abs(rawRemaining);
  const isOverdue = rawRemaining < 0;
  const suffix = isOverdue ? "overdue" : "left";
  if (remaining <= 0) return "Due now";
  const days = Math.floor(remaining / DAY_MS);
  const hours = Math.floor((remaining % DAY_MS) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h ${suffix}`;
  if (hours > 0) return `${hours}h ${minutes}m ${suffix}`;
  if (minutes <= 0) return isOverdue ? "Overdue" : "Due now";
  return `${minutes}m ${suffix}`;
};

const pluralize = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const chunkArray = (items, size = 10) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const timestampToMillis = (value) => {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  if (Number.isFinite(value.seconds)) return value.seconds * 1000;
  return 0;
};

const formatShortDate = (timestamp) => {
  const millis = timestampToMillis(timestamp);
  if (!millis) return "";
  return new Date(millis).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const getLicenseStatusInfo = (license, now = Date.now()) => {
  if (!license) {
    return {
      label: "No school license connected",
      detail: "Core practice mode is available, but school trial controls are not active.",
      tone: "watch",
      expired: false,
      blocksNewWork: false,
    };
  }

  const rawStatus = String(
    license.status || (license.trialEndsAt || license.trial_ends_at ? "trial" : "active")
  ).toLowerCase();
  const trialEndsAt = timestampToMillis(
    license.trialEndsAt || license.trial_ends_at || license.expiresAt || license.expires_at
  );
  const expiredByDate = trialEndsAt > 0 && trialEndsAt < now;
  const expired = rawStatus === "expired" || rawStatus === "cancelled" || expiredByDate;

  if (expired) {
    return {
      label: rawStatus === "cancelled" ? "License cancelled" : "Trial ended",
      detail: trialEndsAt
        ? `Access ended on ${formatShortDate(trialEndsAt)}. New classes and assignments are paused.`
        : "New classes and assignments are paused.",
      tone: "risk",
      expired: true,
      blocksNewWork: true,
    };
  }

  if (rawStatus === "trial") {
    const daysLeft = trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt - now) / DAY_MS))
      : null;
    return {
      label: daysLeft === null ? "Trial active" : `Trial active · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
      detail: trialEndsAt
        ? `Trial access runs until ${formatShortDate(trialEndsAt)}.`
        : "Trial access is active with no end date set yet.",
      tone: daysLeft !== null && daysLeft <= 3 ? "watch" : "fresh",
      expired: false,
      blocksNewWork: false,
    };
  }

  return {
    label: "License active",
    detail: "School access is active.",
    tone: "fresh",
    expired: false,
    blocksNewWork: false,
  };
};

const getActivityTone = (daysInactive) => {
  if (!Number.isFinite(daysInactive)) return "unknown";
  if (daysInactive <= 3) return "fresh";
  if (daysInactive <= 10) return "watch";
  return "risk";
};

const formatLastActiveFromDays = (daysInactive) => {
  if (!Number.isFinite(daysInactive)) {
    return { label: "No activity yet", days: null, tone: "unknown" };
  }

  const safeDays = Math.max(0, Math.round(daysInactive));
  if (safeDays === 0) return { label: "Today", days: 0, tone: "fresh" };
  if (safeDays === 1) return { label: "1 day ago", days: 1, tone: "fresh" };
  return {
    label: `${safeDays} days ago`,
    days: safeDays,
    tone: getActivityTone(safeDays),
  };
};

const formatLastActive = (timestamp, now = Date.now()) => {
  if (!timestamp) return formatLastActiveFromDays(Number.NaN);
  return formatLastActiveFromDays((now - timestamp) / DAY_MS);
};

const formatAdaptiveGraphDuration = (durationMs, totalMs) => {
  const days = Math.max(0, durationMs / DAY_MS);
  const totalDays = Math.max(1, totalMs / DAY_MS);
  let value = days;
  let unit = "day";

  if (totalDays > 45 && totalDays <= 210) {
    value = days / 7;
    unit = "week";
  } else if (totalDays > 210 && totalDays <= 1095) {
    value = days / 30.44;
    unit = "month";
  } else if (totalDays > 1095) {
    value = days / 365.25;
    unit = "year";
  }

  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${unit}${rounded === 1 ? "" : "s"}`;
};

const getAcademicProgressWindow = (now = Date.now(), anchorNow = Date.now()) => {
  const date = new Date(anchorNow);
  const academicStartYear = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  const start = new Date(academicStartYear, 8, 1, 0, 0, 0, 0).getTime();
  const target = new Date(academicStartYear + 2, 4, 15, 23, 59, 59, 999).getTime();
  const total = Math.max(1, target - start);
  const elapsed = Math.max(0, Math.min(total, now - start));
  const elapsedRatio = Math.max(0, Math.min(1, elapsed / total));

  return {
    start,
    target,
    elapsedMs: elapsed,
    totalMs: total,
    elapsedRatio,
    elapsedLabel: formatAdaptiveGraphDuration(elapsed, total),
    totalLabel: formatAdaptiveGraphDuration(total, total),
    monthsElapsed: Math.max(0, Math.round(((now - start) / DAY_MS / 30.44) * 10) / 10),
    totalMonths: Math.round((total / DAY_MS / 30.44) * 10) / 10,
    startLabel: formatShortDate(start),
    targetLabel: formatShortDate(target),
  };
};

const formatSimulationDuration = (durationMs) => {
  if (durationMs < 1000) {
    return `${Math.max(0.01, durationMs / 1000).toFixed(2)}s`;
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];

const shuffleItems = (items) =>
  [...items].sort(() => Math.random() - 0.5);

const clampValue = (value, min, max) =>
  Math.max(min, Math.min(max, Number(value) || min));

const getMasteryStatus = (score) => {
  if (score >= 80) return "Green";
  if (score >= 50) return "Amber";
  return "Red";
};

const buildMockProgress = (cards, profileIndex) => {
  const levels = [
    { baseMastery: 95, consecutiveCorrect: 4, ageDays: 0 },
    { baseMastery: 78, consecutiveCorrect: 2, ageDays: 1 },
    { baseMastery: 45, consecutiveCorrect: 1, ageDays: 3 },
    { baseMastery: 100, consecutiveCorrect: 3, ageDays: 5 },
  ];

  return cards.slice(0, 36).reduce((acc, card, index) => {
    const level = levels[(index + profileIndex) % levels.length];
    acc[card.id] = {
      baseMastery: level.baseMastery,
      consecutiveCorrect: level.consecutiveCorrect,
      lastSeen: Date.now() - level.ageDays * DAY_MS,
      status: level.baseMastery >= 70 ? "correct" : "incorrect",
    };
    return acc;
  }, {});
};

const SIM_ID_PREFIX = "SIM-";
const SIM_CLASS_ID = "SIM-11Y";
const SIM_ASSIGNMENT_ID = "sim-week-prep";
const SIM_CLASS_LABELS = [
  "10X DT",
  "10Y DT",
  "11Y DT",
  "11Z DT",
  "12A DT",
  "12Z DT",
  "13B DT",
];
const SIM_TEACHER_NAMES = [
  "Ms Carter",
  "Mr Singh",
  "Dr Morgan",
  "Mrs Ahmed",
  "Mr Lewis",
];
const SIM_FIRST_NAMES = [
  "Aisha",
  "Ben",
  "Cara",
  "Dev",
  "Ella",
  "Finn",
  "Grace",
  "Hassan",
  "Ivy",
  "Jacob",
  "Keira",
  "Luca",
  "Mia",
  "Noah",
  "Orla",
  "Priya",
  "Quinn",
  "Ruby",
  "Samir",
  "Talia",
  "Uma",
  "Victor",
  "Will",
  "Xanthe",
  "Yasmin",
  "Zara",
  "Theo",
  "Nina",
  "Owen",
  "Leah",
];
const SIM_LAST_NAMES = [
  "Khan",
  "Carter",
  "Evans",
  "Patel",
  "Morgan",
  "Hughes",
  "Lee",
  "Ali",
  "Brooks",
  "Price",
  "Singh",
  "Rossi",
  "Clarke",
  "Turner",
  "Walsh",
  "Shah",
  "Edwards",
  "Scott",
  "Ahmed",
  "Green",
  "Wilson",
  "Young",
  "Foster",
  "Moore",
  "Bell",
  "Lewis",
  "Hill",
  "King",
  "Ward",
  "Cook",
];
const SIM_ACTIVITY_LABELS = [
  "Reading theory notes",
  "Showing flashcard answers",
  "Retrying weak cards",
  "Checking mark scheme",
  "Writing a long answer plan",
  "Speed quiz attempt",
  "Refresh review",
];
const SIM_REVIEW_LABELS = [
  "Maintaining streak",
  "Refreshing green topics",
  "Helping future memory decay",
  "Light review after completion",
];

const SIM_ARCHETYPES = [
  {
    label: "High Streak",
    accuracy: 0.93,
    streak: 12,
    consistency: 88,
    motivation: 86,
    pace: 1.2,
    slackProbability: 0.06,
    nudgeResponse: 0.86,
    nonCompletionRisk: 0.02,
  },
  {
    label: "Steady",
    accuracy: 0.84,
    streak: 7,
    consistency: 74,
    motivation: 72,
    pace: 1,
    slackProbability: 0.14,
    nudgeResponse: 0.72,
    nonCompletionRisk: 0.08,
  },
  {
    label: "Late Finisher",
    accuracy: 0.77,
    streak: 3,
    consistency: 58,
    motivation: 61,
    pace: 0.86,
    slackProbability: 0.24,
    nudgeResponse: 0.52,
    nonCompletionRisk: 0.18,
  },
  {
    label: "Needs Nudging",
    accuracy: 0.68,
    streak: 1,
    consistency: 44,
    motivation: 46,
    pace: 0.72,
    slackProbability: 0.38,
    nudgeResponse: 0.64,
    nonCompletionRisk: 0.32,
  },
  {
    label: "At Risk",
    accuracy: 0.52,
    streak: 0,
    consistency: 28,
    motivation: 34,
    pace: 0.55,
    slackProbability: 0.58,
    nudgeResponse: 0.22,
    nonCompletionRisk: 0.62,
  },
];

const getSafeAuthError = (error, mode) => {
  if (mode === "login") return "Invalid account credentials.";
  if (error?.code === "auth/operation-not-allowed") {
    return "Account creation is not available right now.";
  }
  return "We could not create that account. Check the details and try again.";
};

const areEqual = (left, right) => {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || !left || !right) return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((item, index) => areEqual(item, right[index]));
  }

  if (typeof left === "object") {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => areEqual(left[key], right[key]));
  }

  return false;
};

function AdminControlPanel({
  assignments,
  classes,
  isConfigured,
  onAccountManagerView,
  onCurriculumEditor,
  onLogout,
  onPreviewAccountManagerView,
  onPreviewStudentView,
  onPreviewTeacherView,
  onSeedMockEnvironment,
  onSimulationLab,
  onStudentView,
  onTeacherView,
  students,
}) {
  const activeAssignments = assignments.filter((assignment) => assignment.status === "active");

  return (
    <>
      <div
        className="user-bar glass-panel"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div>
          <span style={{ fontSize: "1.2rem" }}>
            <b>Super-Admin Control</b>
          </span>
          <div style={{ fontSize: "0.85rem", color: "var(--orange)", marginTop: "4px" }}>
            Directive 22 · Environment Mirroring System
          </div>
        </div>
        <button className="logout-btn" onClick={onLogout}>
          Logout
        </button>
      </div>

      <h1 style={{ marginBottom: "10px" }}>Admin Control Panel</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "25px" }}>
        Spawn isolated mock classrooms and switch between mirrored student and teacher
        dashboards without writing test metrics to production leaderboards.
      </p>

      <div className="glass-panel" style={{ marginBottom: "20px" }}>
        <h2>Secure Access Gate</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: 0 }}>
          Super-admin key status:{" "}
          <b style={{ color: isConfigured ? "var(--green)" : "var(--red)" }}>
            {isConfigured ? "Configured" : "Missing REACT_APP_SUPER_ADMIN_KEY"}
          </b>
        </p>
      </div>

      <div className="glass-panel" style={{ marginBottom: "20px" }}>
        <h2>Simulation Lab</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Use the full simulation engine for realistic classes, shared teachers,
          assignments, automated support, PR graphs, and time controls up to a year.
        </p>
        <div className="btn-group">
          <button className="btn-primary" onClick={onSimulationLab}>
            Open Simulation Lab
          </button>
          <button className="logout-btn" onClick={onSeedMockEnvironment}>
            Quick Demo Seed
          </button>
        </div>
        <p className="helper-text" style={{ marginTop: "10px", marginBottom: 0 }}>
          Quick Demo Seed is the old lightweight 5-student setup for fast layout
          previews only. The Simulation Lab is the current testing system.
        </p>
      </div>

      <div className="glass-panel" style={{ marginBottom: "20px" }}>
        <h2>Interface Simulator</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Masquerade locally as a student, shared teacher, or Account Manager
          while retaining the floating admin return control.
        </p>
        <div className="btn-group">
          <button className="btn-primary" onClick={onStudentView}>
            Open Student Dashboard
          </button>
          <button className="btn-primary" onClick={onTeacherView}>
            Open Teacher View
          </button>
          <button className="btn-primary" onClick={onAccountManagerView}>
            Open Account Manager View
          </button>
          <button className="btn-primary" onClick={onCurriculumEditor}>
            Open Curriculum Architect
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ marginBottom: "20px" }}>
        <h2>Layout Preview</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Open clean student, shared teacher, or Account Manager layouts with static
          mock data and no simulation overlay.
        </p>
        <div className="btn-group">
          <button className="btn-primary" onClick={onPreviewTeacherView}>
            Preview Teacher Layout
          </button>
          <button className="btn-primary" onClick={onPreviewAccountManagerView}>
            Preview Account Manager
          </button>
          <button className="btn-primary" onClick={onPreviewStudentView}>
            Preview Student Layout
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
        <div className="glass-panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--primary)" }}>
            {classes.length}
          </div>
          <div style={{ color: "var(--text-muted)" }}>Mock Classes</div>
        </div>
        <div className="glass-panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--primary)" }}>
            {students.length}
          </div>
          <div style={{ color: "var(--text-muted)" }}>Mock Students</div>
        </div>
        <div className="glass-panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--primary)" }}>
            {activeAssignments.length}
          </div>
          <div style={{ color: "var(--text-muted)" }}>Active Assignments</div>
        </div>
        <div className="glass-panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--green)" }}>
            Local
          </div>
          <div style={{ color: "var(--text-muted)" }}>Cloud Writes Neutralized</div>
        </div>
      </div>
    </>
  );
}

function SimulationControlDock({
  onHideTools,
  onOpenLab,
  onRunToggle,
  realDayDurationLabel,
  realHourDurationLabel,
  setSimulationSpeed,
  simulationDay,
  simulationDurationDays,
  simulationHour,
  simulationRunning,
  simulationSpeed,
  simulationTotalHours,
}) {
  const hourOfDay = simulationHour % 24;

  return (
    <div className="simulation-control-dock" role="region" aria-label="Simulation controls">
      <button type="button" className="dock-play-btn" onClick={onRunToggle}>
        {simulationRunning ? "Pause" : "Play"}
      </button>
      <div className="dock-clock">
        <b>
          Day {simulationDay}/{simulationDurationDays}
        </b>
        <span>
          Hour {String(hourOfDay).padStart(2, "0")}:00 · {simulationHour}/
          {simulationTotalHours}
        </span>
      </div>
      <label className="dock-speed-control">
        <span>Speed</span>
        <select
          value={simulationSpeed}
          onChange={(event) => setSimulationSpeed(Number(event.target.value))}
        >
          <option value="1">1x</option>
          <option value="2">2x</option>
          <option value="10">10x</option>
          <option value="100">100x</option>
          <option value="1000">1,000x</option>
          <option value="10000">10,000x</option>
          <option value="86400">86,400x</option>
          <option value="604800">604,800x</option>
        </select>
      </label>
      <div className="dock-speed-note">
        1 sim day: {realDayDurationLabel}
        <span>1 sim hour: {realHourDurationLabel}</span>
      </div>
      <button type="button" className="dock-lab-btn" onClick={onOpenLab}>
        Lab
      </button>
      <button type="button" className="dock-lab-btn" onClick={onHideTools}>
        Hide
      </button>
    </div>
  );
}

function AdminSimulationLab({
  onAccountManagerView,
  onCopySimulationData,
  onCurriculum,
  onGenerate,
  onLogout,
  onReset,
  onRunToggle,
  onStepHour,
  onStudentView,
  onTeacherView,
  realDayDurationLabel,
  realHourDurationLabel,
  setSimulationClassFilter,
  simulationCsv,
  simulationClassFilter,
  simulationClasses,
  simulationDay,
  simulationDurationDays,
  simulationHour,
  simulationLog,
  simulationRows,
  simulationRunning,
  simulationSpeed,
  simulationSummary,
  simulationTotalHours,
  telemetryTableOpen = true,
  onToggleTelemetryTable = () => {},
  simulationLogOpen = false,
  onToggleSimulationLog = () => {},
  analysisTableOpen = false,
  onToggleAnalysisTable = () => {},
  setSimulationDurationDays,
  setSimulationSpeed,
}) {
  const hourOfDay = simulationHour % 24;

  return (
    <>
      <div className="user-bar glass-panel">
        <div>
          <span style={{ fontSize: "1.2rem" }}>
            <b>Admin Simulation Lab</b>
          </span>
          <div style={{ fontSize: "0.85rem", color: "var(--orange)", marginTop: "4px" }}>
            Local QA sandbox · no production learner metrics are written
          </div>
        </div>
        <div className="btn-group" style={{ marginTop: 0 }}>
          <button className="logout-btn" onClick={onCurriculum}>
            Curriculum
          </button>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <h1 style={{ marginBottom: "10px" }}>Simulation Lab</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "25px" }}>
        Generate a random mini-school, run realistic class activity, inspect live
        learner behaviour, and test the teacher/student dashboards without writing
        sandbox results to production.
      </p>

      <div className="simulation-grid">
        <div className="glass-panel stat-card">
          <b>{simulationSummary.completed}/{simulationSummary.total}</b>
          <span>Completed assignments</span>
        </div>
        <div className="glass-panel stat-card">
          <b>{simulationSummary.averageMastery}%</b>
          <span>Average assignment mastery</span>
        </div>
        <div className="glass-panel stat-card">
          <b>{simulationSummary.atRisk}</b>
          <span>Still at risk</span>
        </div>
        <div className="glass-panel stat-card">
          <b>{simulationSummary.activeNow}</b>
          <span>Active now</span>
        </div>
        <div className="glass-panel stat-card">
          <b>{simulationSummary.classCount}</b>
          <span>Classes</span>
        </div>
        <div className="glass-panel stat-card">
          <b>{simulationSummary.teacherCount}</b>
          <span>Teachers</span>
        </div>
        <div className="glass-panel stat-card">
          <b>Day {simulationDay}/{simulationDurationDays}</b>
          <span>
            Hour {String(hourOfDay).padStart(2, "0")}:00 · {simulationHour}/
            {simulationTotalHours}
          </span>
        </div>
      </div>

      <div className="glass-panel" style={{ marginBottom: "20px" }}>
        <h2>Run Controls</h2>
        <div className="control-grid">
          <label>
            <span className="label">Timescale</span>
            <select
              className="input-field"
              value={simulationSpeed}
              onChange={(event) => setSimulationSpeed(Number(event.target.value))}
            >
              <option value="1">1x real time</option>
              <option value="2">2x half-day pace</option>
              <option value="10">10x slow classroom replay</option>
              <option value="100">100x long QA replay</option>
              <option value="1000">1,000x fast QA</option>
              <option value="10000">10,000x stress replay</option>
              <option value="86400">86,400x one simulated day per second</option>
              <option value="604800">604,800x one simulated week per second</option>
            </select>
            <span className="helper-text">
              At {simulationSpeed.toLocaleString()}x, one simulated day takes{" "}
              {realDayDurationLabel}; one simulated hour takes {realHourDurationLabel}.
            </span>
          </label>
          <label>
            <span className="label">Simulation Window (Days)</span>
            <input
              className="input-field"
              type="number"
              min="1"
              max={MAX_SIMULATION_DAYS}
              value={simulationDurationDays}
              onChange={(event) =>
                setSimulationDurationDays(
                  Math.max(1, Math.min(MAX_SIMULATION_DAYS, Number(event.target.value) || 7))
                )
              }
            />
            <span className="helper-text">
              Up to {MAX_SIMULATION_DAYS} days, so the lab can replay a full year.
            </span>
          </label>
          <label>
            <span className="label">Class Filter</span>
            <select
              className="input-field"
              value={simulationClassFilter}
              onChange={(event) => setSimulationClassFilter(event.target.value)}
            >
              <option value="all">All simulated classes</option>
              {simulationClasses.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="btn-group">
          <button className="btn-primary" onClick={onGenerate}>
            Run New Random School
          </button>
          <button className="btn-primary" onClick={onRunToggle}>
            {simulationRunning ? "Pause Simulation" : "Run Simulation"}
          </button>
          <button className="btn-primary" onClick={onStepHour}>
            Step One Simulated Hour
          </button>
          <button className="logout-btn" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ marginBottom: "20px" }}>
        <h2>Interface Simulator</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Open role-specific dashboards to compare the exact student, shared teacher,
          and Account Manager experiences against the same sandbox learners.
        </p>
        <div className="btn-group">
          <button className="btn-primary" onClick={onTeacherView}>
            Open Shared Teacher View
          </button>
          <button className="btn-primary" onClick={onAccountManagerView}>
            Open Account Manager View
          </button>
          <button className="btn-primary" onClick={onStudentView}>
            Open Simulated Student View
          </button>
        </div>
      </div>

      <div className="glass-panel table-panel" style={{ marginBottom: "20px" }}>
        <div className="section-title-row table-panel-header">
          <div>
            <h2 style={{ marginBottom: 0 }}>Live Student Telemetry</h2>
            <span className="table-panel-count">
              {simulationRows.length} simulated learner
              {simulationRows.length === 1 ? "" : "s"}
            </span>
          </div>
          <button
            type="button"
            className="logout-btn"
            onClick={onToggleTelemetryTable}
          >
            {telemetryTableOpen ? "Hide Table" : "Open Table"}
          </button>
        </div>
        {telemetryTableOpen ? (
          <div className="responsive-table table-panel-body">
          <table className="simulation-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>Teacher</th>
                <th>Profile</th>
                <th>Status</th>
                <th>Current Activity</th>
                <th>Current Question</th>
                <th>Assignment</th>
                <th>Mastery</th>
                <th>Streak</th>
                <th>XP</th>
                <th>Automated Support</th>
              </tr>
            </thead>
            <tbody>
              {simulationRows.length === 0 ? (
                <tr>
                  <td colSpan="12">Run a new random school to create live learners.</td>
                </tr>
              ) : (
                simulationRows.map((row) => (
                  <tr key={row.id}>
                    <td className="student-cell wrap-cell">
                      <b>{row.name}</b>
                      {row.message && <span className="table-subtext">{row.message}</span>}
                    </td>
                    <td>{row.className}</td>
                    <td>{row.teacherName}</td>
                    <td>{row.profile}</td>
                    <td>
                      <span className={`status-pill ${row.status.toLowerCase()}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="activity-cell wrap-cell">{row.currentActivity}</td>
                    <td className="question-cell wrap-cell">{row.currentQuestion}</td>
                    <td>
                      {row.completed
                        ? `Day ${row.completedDay}, hour ${row.completedHour}`
                        : "In progress"}
                    </td>
                    <td>{row.mastery}%</td>
                    <td>{row.streak}d</td>
                    <td>{row.xp}</td>
                    <td className="support-summary-cell wrap-cell">
                      <b>{row.nudgeCount} reminders · {row.rewardCount} rewards</b>
                      <span className="table-subtext">
                        {row.message || "No automated support event yet"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        ) : (
          <p className="table-panel-note">
            Telemetry table hidden. Open it again when you want the full live learner feed.
          </p>
        )}
      </div>

      <div className="glass-panel table-panel" style={{ marginBottom: "20px" }}>
        <div className="section-title-row table-panel-header">
          <div>
            <h2 style={{ marginBottom: 0 }}>Simulation Log</h2>
            <span className="table-panel-count">
              {simulationLog.length} checkpoint{simulationLog.length === 1 ? "" : "s"}
            </span>
          </div>
          <button
            type="button"
            className="logout-btn"
            onClick={onToggleSimulationLog}
          >
            {simulationLogOpen ? "Hide Log" : "Open Log"}
          </button>
        </div>
        {simulationLogOpen ? (
          <div className="table-panel-body compact-panel-body">
            {simulationLog.length === 0 ? (
              <p className="muted-copy">Run or step the simulation to create log entries.</p>
            ) : (
              <div className="question-list compact-scroll-list">
                {simulationLog.map((entry) => (
                  <div key={entry.hour} className="selected-content-card">
                    <b>Day {entry.day}, hour {entry.hourOfDay}:00</b>
                    <span>
                      {entry.completed}/{entry.total} complete · {entry.averageMastery}% average
                      mastery · {entry.activeNow} active · {entry.atRisk} at risk
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="table-panel-note">
            Log hidden. Open it when you want the hour-by-hour simulation history.
          </p>
        )}
      </div>

      <div className="glass-panel table-panel">
        <div className="section-title-row table-panel-header">
          <div>
            <h2 style={{ marginBottom: 0 }}>Analysis Data Table</h2>
            <span className="table-panel-count">
              Exportable simulation data for later review
            </span>
          </div>
          <button
            type="button"
            className="logout-btn"
            onClick={onToggleAnalysisTable}
          >
            {analysisTableOpen ? "Hide Data" : "Open Data"}
          </button>
        </div>
        {analysisTableOpen ? (
          <div className="table-panel-body compact-panel-body">
            <p style={{ color: "var(--text-muted)" }}>
              Copy this table into chat when you want me to analyse completion patterns,
              mastery movement, or whether the algorithm is rewarding the right behavior.
            </p>
            <textarea className="input-field data-table-output" readOnly value={simulationCsv} />
            <button className="btn-primary" onClick={onCopySimulationData}>
              Copy Data Table
            </button>
          </div>
        ) : (
          <p className="table-panel-note">
            Data export hidden. Open it only when you need to copy simulation results.
          </p>
        )}
      </div>
    </>
  );
}

function SupportAutomationEditor({
  nudgePolicy,
  onNudgeChange,
  onRewardChange,
  onSave,
  rewardPolicy,
  title = "Support automation",
}) {
  const nudgeToggles = [
    {
      key: "assignmentNudgeEnabled",
      label: "Assignment reminders",
      detail: "Students are reminded if active assignments are not started or become overdue.",
    },
    {
      key: "studyNudgeEnabled",
      label: "Study inactivity",
      detail: "Students are reminded to use Refresh after a quiet period.",
    },
    {
      key: "streakNudgeEnabled",
      label: "Streak warning",
      detail: "Students are reminded before a study streak is at risk.",
    },
    {
      key: "highDecayNudgeEnabled",
      label: "High decay warning",
      detail: "Students are nudged toward Refresh when mastery has decayed.",
    },
  ];
  const rewardToggles = [
    {
      key: "assignmentRewardEnabled",
      label: "Assignment success",
      detail: "Reward students who finish assignments to the target standard.",
    },
    {
      key: "streakRewardEnabled",
      label: "Streak rewards",
      detail: "Reward students who maintain consistent study streaks.",
    },
    {
      key: "improvementRewardEnabled",
      label: "Better than usual",
      detail: "Reward students when recent progress is stronger than normal.",
    },
  ];
  const nudgeNumbers = [
    {
      key: "assignmentIdleDays",
      controlKey: "assignmentNudgeEnabled",
      label: "Assignment reminders: not started after",
      suffix: "days",
      min: 1,
      max: 14,
    },
    {
      key: "studyIdleDays",
      controlKey: "studyNudgeEnabled",
      label: "Study inactivity: remind after",
      suffix: "days",
      min: 1,
      max: 14,
    },
    {
      key: "streakWarningHours",
      controlKey: "streakNudgeEnabled",
      label: "Streak warning: when under",
      suffix: "hours left",
      min: 1,
      max: 48,
    },
    {
      key: "highDecayMastery",
      controlKey: "highDecayNudgeEnabled",
      label: "High decay warning: mastery below",
      suffix: "%",
      min: 1,
      max: 100,
    },
  ];
  const rewardNumbers = [
    {
      key: "assignmentMasteryThreshold",
      controlKey: "assignmentRewardEnabled",
      label: "Assignment success: reward at",
      suffix: "% mastery",
      min: 1,
      max: 100,
    },
    {
      key: "streakRewardDays",
      controlKey: "streakRewardEnabled",
      label: "Streak rewards: after",
      suffix: "days",
      min: 1,
      max: 30,
    },
    {
      key: "improvementXpThreshold",
      controlKey: "improvementRewardEnabled",
      label: "Better than usual: reward after",
      suffix: "XP gained",
      min: 1,
      max: 500,
    },
  ];

  return (
    <div className="support-policy-box">
      <div className="support-policy-heading">
        <div>
          <span className="label">{title}</span>
          <h3>Nudges and rewards</h3>
        </div>
        <button className="logout-btn mini-action-btn" type="button" onClick={onSave}>
          Save rules
        </button>
      </div>

      <div className="support-explainer-grid">
        <div>
          <b>What is a nudge?</b>
          <p>
            A nudge is a short supportive reminder shown to students in this class.
            It affects students only; it does not change scores, mastery, or the
            leaderboard.
          </p>
        </div>
        <div>
          <b>What is a reward?</b>
          <p>
            A reward is positive teacher feedback for good progress, strong streaks,
            or completing assignments well. It is encouragement, not a hidden mark.
          </p>
        </div>
      </div>

      <div className="support-policy-columns">
        <section>
          <div className="support-section-title">
            <b>Nudge system</b>
            <button
              className={`support-toggle-button ${nudgePolicy.enabled ? "is-on" : "is-off"}`}
              type="button"
              onClick={() => onNudgeChange("enabled", !nudgePolicy.enabled)}
            >
              {nudgePolicy.enabled ? "Enabled" : "Disabled"}
            </button>
          </div>
          <div className="support-toggle-grid">
            {nudgeToggles.map((item) => (
              <button
                key={item.key}
                className={`support-toggle-button ${nudgePolicy[item.key] ? "is-on" : "is-off"}`}
                type="button"
                onClick={() => onNudgeChange(item.key, !nudgePolicy[item.key])}
                disabled={!nudgePolicy.enabled}
              >
                <b>{item.label}</b>
                <span>{item.detail}</span>
              </button>
            ))}
          </div>
          <div className="nudge-policy-grid">
            {nudgeNumbers.map((field) => {
              const disabled = !nudgePolicy.enabled || !nudgePolicy[field.controlKey];
              return (
              <label
                key={field.key}
                className={`support-number-setting ${disabled ? "is-disabled" : ""}`}
              >
                <span className="label">{field.label}</span>
                <div className={`inline-number-control ${disabled ? "is-disabled" : ""}`}>
                  <input
                    className="input-field"
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={nudgePolicy[field.key]}
                    onChange={(event) => onNudgeChange(field.key, event.target.value)}
                    disabled={disabled}
                    style={{ marginBottom: 0 }}
                  />
                  <span>{field.suffix}</span>
                </div>
              </label>
            );
            })}
          </div>
        </section>

        <section>
          <div className="support-section-title">
            <b>Reward system</b>
            <button
              className={`support-toggle-button ${rewardPolicy.enabled ? "is-on" : "is-off"}`}
              type="button"
              onClick={() => onRewardChange("enabled", !rewardPolicy.enabled)}
            >
              {rewardPolicy.enabled ? "Enabled" : "Disabled"}
            </button>
          </div>
          <div className="support-toggle-grid">
            {rewardToggles.map((item) => (
              <button
                key={item.key}
                className={`support-toggle-button ${rewardPolicy[item.key] ? "is-on" : "is-off"}`}
                type="button"
                onClick={() => onRewardChange(item.key, !rewardPolicy[item.key])}
                disabled={!rewardPolicy.enabled}
              >
                <b>{item.label}</b>
                <span>{item.detail}</span>
              </button>
            ))}
          </div>
          <div className="nudge-policy-grid reward-policy-grid">
            {rewardNumbers.map((field) => {
              const disabled = !rewardPolicy.enabled || !rewardPolicy[field.controlKey];
              return (
              <label
                key={field.key}
                className={`support-number-setting ${disabled ? "is-disabled" : ""}`}
              >
                <span className="label">{field.label}</span>
                <div className={`inline-number-control ${disabled ? "is-disabled" : ""}`}>
                  <input
                    className="input-field"
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={rewardPolicy[field.key]}
                    onChange={(event) => onRewardChange(field.key, event.target.value)}
                    disabled={disabled}
                    style={{ marginBottom: 0 }}
                  />
                  <span>{field.suffix}</span>
                </div>
              </label>
            );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function ProgressReviewPanel({ review, title = "PR Review" }) {
  if (!review) return null;

  const toneColor =
    review.trackTone === "gold"
      ? "#fbbf24"
      : review.trackTone === "green"
        ? "var(--green)"
        : review.trackTone === "orange"
          ? "#f59e0b"
          : "var(--red)";

  return (
    <div className={`progress-review-panel track-${review.trackTone}`}>
      <div className="progress-review-header">
        <div>
          <span className="label">{title}</span>
          <h3>{review.statusLabel}</h3>
          <p>
            Solid line is the student's XP. Dotted line is the steady pace
            needed for {A_LEVEL_TARGET_MASTERY}% exam readiness by{" "}
            {review.window.targetLabel}.
          </p>
        </div>
        <span className={`status-pill track-${review.trackTone}`}>
          {review.paceLabel}
        </span>
      </div>

      <div className="progress-review-stats">
        <span>
          <b>{review.streakDays}</b>
          <small>day streak</small>
        </span>
        <span>
          <b>{review.onTimeAssignments}</b>
          <small>on time</small>
        </span>
        <span>
          <b>{review.lateAssignments}</b>
          <small>late</small>
        </span>
        <span>
          <b>{review.missedAssignments}</b>
          <small>not completed</small>
        </span>
      </div>

      <div className="progress-chart-wrap">
        <svg className="progress-review-chart" viewBox="0 0 360 190" role="img">
          <title>{review.statusLabel}</title>
          <line x1="42" y1="150" x2="332" y2="150" className="chart-axis" />
          <line x1="42" y1="150" x2="42" y2="24" className="chart-axis" />
          <line
            x1={review.chart.start.x}
            y1={review.chart.start.y}
            x2={review.chart.target.x}
            y2={review.chart.target.y}
            className="chart-expected-line"
          />
          <line
            x1={review.chart.current.x}
            y1="150"
            x2={review.chart.current.x}
            y2="24"
            className="chart-today-line"
          />
          <polyline
            points={review.chart.actualPoints}
            fill="none"
            stroke={toneColor}
            strokeWidth="3.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {(review.chart.actualMarkers || []).map((point, index) => (
            <circle
              key={`${Math.round(point.x)}-${Math.round(point.y)}-${index}`}
              cx={point.x}
              cy={point.y}
              r="3"
              fill={toneColor}
              className="chart-actual-dot"
            />
          ))}
          <circle
            cx={review.chart.current.x}
            cy={review.chart.actual.y}
            r="5"
            fill={toneColor}
          />
          <circle
            cx={review.chart.current.x}
            cy={review.chart.expected.y}
            r="4"
            className="chart-expected-dot"
          />
          <text x="42" y="174" className="chart-label">
            Sep start
          </text>
          <text x="332" y="174" textAnchor="end" className="chart-label">
            Exam target
          </text>
          <text x={review.chart.current.x} y="18" textAnchor="middle" className="chart-label">
            {review.currentLabel || "Today"}
          </text>
        </svg>
      </div>

      <div className="progress-review-caption">
        <b>{review.studentXp.toLocaleString()} XP</b>
        <span>
          {review.window.elapsedLabel}/{review.window.totalLabel} elapsed · expected by now:{" "}
          {review.expectedXp.toLocaleString()} XP · target:{" "}
          {review.targetXp.toLocaleString()} XP ·{" "}
          {review.chart.sourceCount > 0
            ? `${review.chart.sourceCount} ${
                review.chart.sourceCount === 1 ? "point" : "points"
              } from ${review.chart.sourceLabel}`
            : review.chart.sourceLabel}
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const storedUser = localStorage.getItem("current_user") || null;
      if (storedUser === ROOT_ADMIN_ID) {
        localStorage.removeItem("current_user");
        return null;
      }
      return storedUser;
    } catch (e) {
      return null;
    }
  });
  const [isSuperAdminSession, setIsSuperAdminSession] = useState(false);

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("theme") || "dark";
    } catch (e) {
      return "dark";
    }
  });

  const [view, setView] = useState("login");
  const [loginInput, setLoginInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [isSignUp, setIsSignUp] = useState(false);
  const [roleInput, setRoleInput] = useState("student");
  const [nameInput, setNameInput] = useState("");
  const [classCodeInput, setClassCodeInput] = useState("");
  const [licenseInput, setLicenseInput] = useState("");

  const [userName, setUserName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userClassCode, setUserClassCode] = useState("");
  const [userClasses, setUserClasses] = useState([]);
  const [userClassIds, setUserClassIds] = useState([]);
  const [userLicenseId, setUserLicenseId] = useState("");
  const [activeLicense, setActiveLicense] = useState(null);
  const [curriculums, setCurriculums] = useState([DEFAULT_CURRICULUM]);
  const [activeSubjectId, setActiveSubjectId] = useState(DEFAULT_SUBJECT_ID);
  const [flaggedContent, setFlaggedContent] = useState([]);
  const [hasAdminPrivileges, setHasAdminPrivileges] = useState(false);
  const [adminProfile, setAdminProfile] = useState(null);
  const [adminSimulationActive, setAdminSimulationActive] = useState(false);
  const [adminPreviewActive, setAdminPreviewActive] = useState(false);
  const [activeClassId, setActiveClassId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [progress, setProgress] = useState({});
  const [writtenProgress, setWrittenProgress] = useState({});
  const [streak, setStreak] = useState(DEFAULT_STREAK);
  const [xpTotal, setXpTotal] = useState(0);
  const [engagementCount, setEngagementCount] = useState(0);
  const [quizQueue, setQuizQueue] = useState([]);
  const [quizType, setQuizType] = useState("topic");
  const [allUsersData, setAllUsersData] = useState([]);
  const [studentProgressById, setStudentProgressById] = useState({});
  const [assignments, setAssignments] = useState([]);
  const [assignmentCompletionMaps, setAssignmentCompletionMaps] = useState({});
  const [nudges, setNudges] = useState([]);
  const [teacherInvites, setTeacherInvites] = useState([]);
  const [sentTeacherInvites, setSentTeacherInvites] = useState([]);
  const [classJoinCodes, setClassJoinCodes] = useState([]);
  const [generatingJoinCodeId, setGeneratingJoinCodeId] = useState("");
  const [activeAssignmentId, setActiveAssignmentId] = useState("");
  const [assignmentTargetType, setAssignmentTargetType] = useState("chapter");
  const [assignmentTargetId, setAssignmentTargetId] = useState(
    legacyFlashcardData[0]?.id || ""
  );
  const [assignmentDeadline, setAssignmentDeadline] = useState(
    formatDateTimeLocal(Date.now() + DAY_MS)
  );
  const [assignmentTargetMastery, setAssignmentTargetMastery] = useState(80);
  const [assignmentDeadlineDrafts, setAssignmentDeadlineDrafts] = useState({});
  const [confirmCancelAssignmentId, setConfirmCancelAssignmentId] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [classNameDrafts, setClassNameDrafts] = useState({});
  const [classInviteDrafts, setClassInviteDrafts] = useState({});
  const [confirmRemoveStudentId, setConfirmRemoveStudentId] = useState("");
  const [removingStudentId, setRemovingStudentId] = useState("");
  const [classNudgeDrafts, setClassNudgeDrafts] = useState({});
  const [classRewardDrafts, setClassRewardDrafts] = useState({});
  const [supportSettingsAdvanced, setSupportSettingsAdvanced] = useState(false);
  const [activeSubsection, setActiveSubsection] = useState(null);
  const [expandedChapters, setExpandedChapters] = useState([]);
  const [isHydrated, setIsHydrated] = useState(() => !currentUser);
  const [simulationDay, setSimulationDay] = useState(0);
  const [simulationHour, setSimulationHour] = useState(0);
  const [simulationStartedAt, setSimulationStartedAt] = useState(Date.now());
  const [simulationDurationDays, setSimulationDurationDays] = useState(7);
  const [simulationSpeed, setSimulationSpeed] = useState(86400);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationLog, setSimulationLog] = useState([]);
  const [simulationClassFilter, setSimulationClassFilter] = useState("all");
  const [simulatedUserId, setSimulatedUserId] = useState("");
  const [simulatedTeacherMode, setSimulatedTeacherMode] = useState("account-manager");
  const [simulationTeacherToolsVisible, setSimulationTeacherToolsVisible] =
    useState(true);
  const [tablePanelsOpen, setTablePanelsOpen] = useState({
    simulationTelemetry: true,
    simulationLog: false,
    simulationData: false,
    classRoster: true,
    classSettings: false,
    assignmentBuilder: false,
    leaderboard: true,
  });

  const [blitzFilters, setBlitzFilters] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [blitzScore, setBlitzScore] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const timerRef = useRef(null);
  const licenseStatusInfo = useMemo(
    () => getLicenseStatusInfo(activeLicense, nowMs),
    [activeLicense, nowMs]
  );

  const [matchCards, setMatchCards] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchedIds, setMatchedIds] = useState([]);
  const [mismatchedPair, setMismatchedPair] = useState([]);
  const simulationTimerRef = useRef(null);
  const assignmentLinkHandledRef = useRef("");
  const isRootAdminIdentity = currentUser === ROOT_ADMIN_ID;
  const isRootAdmin = isRootAdminIdentity && isSuperAdminSession;
  const activeCurriculum = useMemo(
    () =>
      curriculums.find((curriculum) => curriculum.id === activeSubjectId) ||
      curriculums[0] ||
      DEFAULT_CURRICULUM,
    [activeSubjectId, curriculums]
  );
  const curriculumFlashcardData = activeCurriculum?.chapters || [];
  const curriculumWrittenData = activeCurriculum?.writtenQuestions || [];
  const curriculumSubjects = useMemo(
    () =>
      curriculums.map((curriculum) => ({
        id: curriculum.id,
        name: curriculum.subjectName || curriculum.title || curriculum.id.toUpperCase(),
      })),
    [curriculums]
  );

  const allCards = useMemo(
    () =>
      curriculumFlashcardData.flatMap((chapter) =>
        (chapter.subsections || []).flatMap((subsection) => subsection.cards || [])
      ),
    [curriculumFlashcardData]
  );

  const teacherClasses = useMemo(
    () =>
      normalizeClasses({
        id: currentUser,
        role: userRole,
        classCode: userClassCode,
        classes: userClasses,
      }),
    [currentUser, userClassCode, userClasses, userRole]
  );

  const studentClassIds = useMemo(
    () => getStudentClassIds({ classCode: userClassCode, classIds: userClassIds }),
    [userClassCode, userClassIds]
  );

  const activeClass =
    teacherClasses.find((classItem) => classItem.id === activeClassId) || teacherClasses[0];

  useEffect(() => {
    setConfirmRemoveStudentId("");
  }, [activeClassId, selectedStudentId]);

  const licenseSubjectIds = Array.isArray(activeLicense?.unlocked_subjects)
    ? activeLicense.unlocked_subjects
    : [DEFAULT_SUBJECT_ID];
  const canManageActiveLicense =
    isRootAdmin ||
    ((adminSimulationActive || adminPreviewActive) &&
      simulatedTeacherMode === "account-manager") ||
    Boolean(
      !adminSimulationActive &&
        !adminPreviewActive &&
      activeLicense &&
        (activeLicense.ownerId === currentUser ||
          (activeLicense.adminIds || []).includes(currentUser))
    );
  const activeClassSubjectIds = getClassSubjectIds(activeClass || {}, licenseSubjectIds);
  const activeClassSubjectKey = activeClassSubjectIds.join("|");
  const getSubjectLabel = (subjectId) =>
    curriculumSubjects.find((subject) => subject.id === subjectId)?.name ||
    String(subjectId || "").toUpperCase();
  const getAssignmentCompletionMap = (assignment) => ({
    ...(assignment?.completedBy || {}),
    ...(assignmentCompletionMaps[assignment?.id] || {}),
  });
  const isAssignmentCompletedBy = (assignment, studentId) =>
    Boolean(studentId && getAssignmentCompletionMap(assignment)[studentId]);
  const toggleTablePanel = (panelId) =>
    setTablePanelsOpen((prev) => ({
      ...prev,
      [panelId]: !prev[panelId],
    }));

  const classroomStudents = useMemo(
    () =>
      allUsersData.filter(
        (user) =>
          user.role === "student" &&
          activeClass?.id &&
          getStudentClassIds(user).includes(activeClass.id)
      ),
    [activeClass?.id, allUsersData]
  );

  const effectiveStudentId =
    (adminSimulationActive || adminPreviewActive) && simulatedUserId
      ? simulatedUserId
      : currentUser;

  const studentAssignments = useMemo(
    () =>
      assignments.filter(
        (assignment) =>
          assignment.status === "active" &&
          studentClassIds.includes(assignment.classId) &&
          !isAssignmentCompletedBy(assignment, effectiveStudentId)
      ),
    [assignmentCompletionMaps, assignments, effectiveStudentId, studentClassIds]
  );

  const studentRankInfo = useMemo(() => {
    if (!effectiveStudentId) return null;
    const peers = allUsersData
      .filter((user) => {
        if (user.role === "teacher") return false;
        const ids = getStudentClassIds(user);
        if (studentClassIds.length > 0) {
          return ids.some((id) => studentClassIds.includes(id));
        }
        return ids.length === 0;
      })
      .sort(
        (a, b) =>
          (b.xpTotal || 0) - (a.xpTotal || 0) ||
          (b.streak?.current || 0) - (a.streak?.current || 0)
      );
    const rankIndex = peers.findIndex((user) => user.id === effectiveStudentId);
    if (rankIndex < 0) return null;
    return {
      rank: rankIndex + 1,
      total: peers.length,
      tier: getRankTier(rankIndex + 1),
    };
  }, [allUsersData, effectiveStudentId, studentClassIds]);

  const activeAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === activeAssignmentId),
    [activeAssignmentId, assignments]
  );

  const classroomStudentIds = useMemo(
    () => classroomStudents.map((student) => student.id).sort().join("|"),
    [classroomStudents]
  );

  useEffect(() => {
    if (document.body.className !== theme) {
      document.body.className = theme;
      try {
        localStorage.setItem("theme", theme);
      } catch (e) {}
    }
  }, [theme]);

  useEffect(() => {
    if (!currentUser) {
      setIsSuperAdminSession(false);
      setView("login");
      return;
    }

    if (isRootAdminIdentity && !isSuperAdminSession) {
      try {
        localStorage.removeItem("current_user");
      } catch (e) {}
      setCurrentUser(null);
      setIsHydrated(true);
      setView("login");
      return;
    }

    if (!isHydrated) return;
    if (isRootAdmin) {
      if (view === "login") setView("admin-control");
      return;
    }
    if (hasAdminPrivileges && !adminSimulationActive && !adminPreviewActive) {
      if (!["admin-curriculum", "admin-simulation"].includes(view)) {
        setView("admin-curriculum");
      }
      return;
    }
    if (view === "login") {
      setView(userRole === "teacher" ? "teacher-dashboard" : "menu");
    }
  }, [
    adminPreviewActive,
    adminSimulationActive,
    currentUser,
    hasAdminPrivileges,
    isHydrated,
    isRootAdmin,
    isRootAdminIdentity,
    isSuperAdminSession,
    userRole,
    view,
  ]);

  useEffect(() => {
    if (!currentUser || isRootAdminIdentity || !db) {
      setIsHydrated(true);
      return undefined;
    }

    setIsHydrated(false);

    const unsubUser = onSnapshot(
      doc(db, "users", currentUser),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const nextWrittenProgress = data.writtenProgress || {};
          const nextStreak = data.streak || DEFAULT_STREAK;
          const nextClasses = normalizeClasses({ ...data, id: currentUser });
          const nextClassIds =
            data.role === "teacher"
              ? nextClasses.map((classItem) => classItem.id)
              : getStudentClassIds(data);
          const isAdminAccount = data.role === "admin";

          setHasAdminPrivileges(isAdminAccount);
          if (isAdminAccount) {
            setAdminProfile({
              name: data.name || "Admin",
              role: "admin",
              classCode: data.classCode || "",
              classes: nextClasses,
              classIds: nextClassIds,
              licenseId: data.licenseId || "",
            });
          }
          setUserName(data.name || "");
          setUserRole(data.role || "student");
          setUserClassCode(data.classCode || "");
          setUserLicenseId(data.licenseId || "");
          setUserClasses((prev) => (areEqual(prev, nextClasses) ? prev : nextClasses));
          setUserClassIds((prev) => (areEqual(prev, nextClassIds) ? prev : nextClassIds));
          setXpTotal(Math.round(data.xpTotal || 0));
          setEngagementCount(data.activeEngagements || 0);
          setWrittenProgress((prev) =>
            areEqual(prev, nextWrittenProgress) ? prev : nextWrittenProgress
          );
          setStreak((prev) => (areEqual(prev, nextStreak) ? prev : nextStreak));
          if (data.role === "teacher" && nextClasses.length > 0) {
            setActiveClassId((prev) => prev || nextClasses[0].id);
            const existingClassIds = getStudentClassIds(data);
            const shouldWriteClassMigration =
              !Array.isArray(data.classes) ||
              data.classes.length === 0 ||
              !areEqual(existingClassIds.sort(), nextClassIds.slice().sort());

            if (shouldWriteClassMigration) {
              setDoc(
                doc(db, "users", currentUser),
                {
                  classes: nextClasses,
                  classIds: nextClasses.map((classItem) => classItem.id),
                  lastUpdated: Date.now(),
                },
                { merge: true }
              ).catch((error) => console.error("Class migration write failed:", error));
            }
          }

          if (data.progress && Object.keys(data.progress).length > 0) {
            setProgress((prev) => (areEqual(prev, data.progress) ? prev : data.progress));
          }
        }
        setIsHydrated(true);
      },
      (error) => {
        console.error("Firestore profile sync error:", error);
        setIsHydrated(true);
      }
    );

    const unsubProgress = onSnapshot(
      collection(db, "users", currentUser, "progress"),
      (snap) => {
        const nextProgress = {};
        snap.forEach((progressDoc) => {
          nextProgress[progressDoc.id] = progressDoc.data();
        });

        setProgress((prev) => {
          if (snap.empty && Object.keys(prev).length > 0) return prev;
          return areEqual(prev, nextProgress) ? prev : nextProgress;
        });
      },
      (error) => console.error("Firestore progress sync error:", error)
    );

    return () => {
      unsubUser();
      unsubProgress();
    };
  }, [currentUser, isRootAdminIdentity]);

  useEffect(() => {
    if (
      !db ||
      !currentUser ||
      currentUser === ROOT_ADMIN_ID ||
      isRootAdminIdentity ||
      adminSimulationActive ||
      adminPreviewActive ||
      !isHydrated ||
      !userRole
    ) {
      return undefined;
    }

    const payload = getPublicProfilePayload({
      name: userName,
      role: userRole,
      classCode: userClassCode,
      classIds: userRole === "teacher" ? teacherClasses.map((classItem) => classItem.id) : userClassIds,
      xpTotal,
      streak,
    });

    setDoc(doc(db, "public_profiles", currentUser), payload, { merge: true }).catch(
      (error) => console.error("Public profile sync failed:", error)
    );

    return undefined;
  }, [
    adminPreviewActive,
    adminSimulationActive,
    currentUser,
    isHydrated,
    isRootAdminIdentity,
    streak,
    teacherClasses,
    userClassCode,
    userClassIds,
    userName,
    userRole,
    xpTotal,
  ]);

  useEffect(() => {
    if (!db || !currentUser || isRootAdminIdentity) {
      setCurriculums((prev) => (prev.length > 0 ? prev : [DEFAULT_CURRICULUM]));
      return undefined;
    }

    const unsub = onSnapshot(
      collection(db, "curriculums"),
      (snap) => {
        const nextCurriculums = snap.docs.map((curriculumDoc) =>
          normalizeCurriculum({ id: curriculumDoc.id, ...curriculumDoc.data() })
        );
        const safeCurriculums =
          nextCurriculums.length > 0 ? nextCurriculums : [DEFAULT_CURRICULUM];

        setCurriculums((prev) =>
          areEqual(prev, safeCurriculums) ? prev : safeCurriculums
        );
        setActiveSubjectId((prev) =>
          safeCurriculums.some((curriculum) => curriculum.id === prev)
            ? prev
            : safeCurriculums[0].id
        );
      },
      (error) => {
        console.error("Firestore curriculum sync error:", error);
        setCurriculums((prev) => (prev.length > 0 ? prev : [DEFAULT_CURRICULUM]));
      }
    );

    return () => unsub();
  }, [currentUser, isRootAdminIdentity]);

  useEffect(() => {
    if (!db || !currentUser || isRootAdminIdentity || !userLicenseId) {
      if (!isRootAdminIdentity) setActiveLicense(null);
      return undefined;
    }

    const unsub = onSnapshot(
      doc(db, "licenses", userLicenseId),
      (licenseSnap) => {
        setActiveLicense(
          licenseSnap.exists()
            ? { id: licenseSnap.id, ...licenseSnap.data() }
            : null
        );
      },
      (error) => console.error("Firestore license sync error:", error)
    );

    return () => unsub();
  }, [currentUser, isRootAdminIdentity, userLicenseId]);

  useEffect(() => {
    if (adminSimulationActive) return undefined;
    if (adminPreviewActive) return undefined;
    if (isRootAdminIdentity) return undefined;
    if (!db || !currentUser || !["admin", "teacher"].includes(userRole)) {
      setFlaggedContent([]);
      return undefined;
    }

    let flaggedQuery = collection(db, "flagged_content");
    if (userRole === "teacher") {
      const teacherClassIds = teacherClasses.map((classItem) => classItem.id).filter(Boolean);
      if (teacherClassIds.length === 0) {
        setFlaggedContent([]);
        return undefined;
      }
      flaggedQuery = query(
        collection(db, "flagged_content"),
        where("classIds", "array-contains-any", teacherClassIds.slice(0, 10))
      );
    }

    const unsub = onSnapshot(
      flaggedQuery,
      (snap) => {
        const nextFlags = snap.docs
          .map((flagDoc) => ({ id: flagDoc.id, ...flagDoc.data() }))
          .filter((flag) => flag.status !== "resolved")
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setFlaggedContent((prev) => (areEqual(prev, nextFlags) ? prev : nextFlags));
      },
      (error) => console.error("Firestore flagged content sync error:", error)
    );

    return () => unsub();
  }, [
    adminPreviewActive,
    adminSimulationActive,
    currentUser,
    isRootAdminIdentity,
    teacherClasses,
    userRole,
  ]);

  useEffect(() => {
    if (
      !db ||
      (isRootAdminIdentity && !adminPreviewActive) ||
      adminPreviewActive ||
      adminSimulationActive ||
      ![
        "menu",
        "leaderboard",
        "teacher-dashboard",
        "class-view",
        "admin-dashboard",
        "admin-curriculum",
      ].includes(view)
    ) {
      return undefined;
    }

    if (hasAdminPrivileges) {
      const unsub = onSnapshot(
        collection(db, "users"),
        (snap) => {
          const users = snap.docs.map((userDoc) => ({
            id: userDoc.id,
            ...userDoc.data(),
          }));
          setAllUsersData((prev) => (areEqual(prev, users) ? prev : users));
        },
        (error) => console.error("Firestore users sync error:", error)
      );

      return () => unsub();
    }

    const scopedClassIds =
      userRole === "teacher"
        ? teacherClasses.map((classItem) => classItem.id)
        : studentClassIds;
    const uniqueClassIds = Array.from(new Set(scopedClassIds.filter(Boolean))).slice(0, 30);
    const profileCollectionName = userRole === "teacher" ? "users" : "public_profiles";

    if (uniqueClassIds.length === 0) {
      const unsub = onSnapshot(
        doc(db, profileCollectionName, currentUser),
        (userSnap) => {
          const users = userSnap.exists()
            ? [{ id: userSnap.id, ...userSnap.data() }]
            : [];
          setAllUsersData((prev) => (areEqual(prev, users) ? prev : users));
        },
        (error) => console.error("Firestore user sync error:", error)
      );

      return () => unsub();
    }

    const queryResults = {};
    const publishUsers = () => {
      const merged = Object.values(queryResults)
        .flat()
        .reduce((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {});
      const users = Object.values(merged).sort((a, b) =>
        String(a.name || a.id).localeCompare(String(b.name || b.id))
      );
      setAllUsersData((prev) => (areEqual(prev, users) ? prev : users));
    };

    const unsubs = chunkArray(uniqueClassIds, 10).flatMap((classIdChunk, chunkIndex) => {
      const classIdsQuery = query(
        collection(db, profileCollectionName),
        where("classIds", "array-contains-any", classIdChunk)
      );
      const legacyClassIdQuery = query(
        collection(db, profileCollectionName),
        where("classId", "in", classIdChunk)
      );

      return [
        onSnapshot(
          classIdsQuery,
          (snap) => {
            queryResults[`classIds-${chunkIndex}`] = snap.docs.map((userDoc) => ({
              id: userDoc.id,
              ...userDoc.data(),
            }));
            publishUsers();
          },
          (error) => console.error("Firestore class user sync error:", error)
        ),
        onSnapshot(
          legacyClassIdQuery,
          (snap) => {
            queryResults[`classId-${chunkIndex}`] = snap.docs.map((userDoc) => ({
              id: userDoc.id,
              ...userDoc.data(),
            }));
            publishUsers();
          },
          (error) => console.error("Firestore legacy class user sync error:", error)
        ),
      ];
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, [
    adminPreviewActive,
    adminSimulationActive,
    currentUser,
    hasAdminPrivileges,
    isRootAdminIdentity,
    studentClassIds,
    teacherClasses,
    userRole,
    view,
  ]);

  useEffect(() => {
    if (adminSimulationActive) return undefined;
    if (adminPreviewActive) return undefined;
    if (isRootAdminIdentity) return undefined;
    if (!db || !currentUser || currentUser === ROOT_ADMIN_ID) {
      setAssignments([]);
      setAssignmentCompletionMaps({});
      return undefined;
    }

    let assignmentsQuery;
    if (hasAdminPrivileges) {
      assignmentsQuery = collection(db, "assignments");
    } else if (userRole === "teacher") {
      assignmentsQuery = query(
        collection(db, "assignments"),
        where("teacherId", "==", currentUser)
      );
    } else {
      const scopedClassIds = studentClassIds.slice(0, 10);
      if (scopedClassIds.length === 0) {
        setAssignments([]);
        setAssignmentCompletionMaps({});
        return undefined;
      }
      assignmentsQuery = query(
        collection(db, "assignments"),
        where("classId", "in", scopedClassIds)
      );
    }

    const unsub = onSnapshot(
      assignmentsQuery,
      (snap) => {
        const nextAssignments = snap.docs.map((assignmentDoc) => ({
          id: assignmentDoc.id,
          ...assignmentDoc.data(),
        }));
        setAssignments((prev) =>
          areEqual(prev, nextAssignments) ? prev : nextAssignments
        );
      },
      (error) => console.error("Firestore assignments sync error:", error)
    );

    return () => unsub();
  }, [
    adminPreviewActive,
    adminSimulationActive,
    currentUser,
    hasAdminPrivileges,
    isRootAdminIdentity,
    studentClassIds,
    userRole,
  ]);

  const assignmentIdsKey = useMemo(
    () => assignments.map((assignment) => assignment.id).sort().join("|"),
    [assignments]
  );

  useEffect(() => {
    if (
      adminSimulationActive ||
      adminPreviewActive ||
      !db ||
      !currentUser ||
      currentUser === ROOT_ADMIN_ID ||
      !assignmentIdsKey
    ) {
      setAssignmentCompletionMaps({});
      return undefined;
    }

    const assignmentIds = assignmentIdsKey.split("|").filter(Boolean);
    const unsubs = assignmentIds.map((assignmentId) => {
      if (userRole === "student") {
        const completionUserId = effectiveStudentId;
        if (!completionUserId) return () => {};
        return onSnapshot(
          doc(db, "assignments", assignmentId, "completions", completionUserId),
          (completionSnap) => {
            setAssignmentCompletionMaps((prev) => {
              const currentAssignmentMap = prev[assignmentId] || {};
              const nextAssignmentMap = { ...currentAssignmentMap };
              if (completionSnap.exists()) {
                nextAssignmentMap[completionUserId] = completionSnap.data();
              } else {
                delete nextAssignmentMap[completionUserId];
              }
              const next = { ...prev, [assignmentId]: nextAssignmentMap };
              if (Object.keys(nextAssignmentMap).length === 0) delete next[assignmentId];
              return areEqual(prev, next) ? prev : next;
            });
          },
          (error) =>
            console.error(
              `Firestore assignment completion sync error (${assignmentId}):`,
              error
            )
        );
      }

      return onSnapshot(
        collection(db, "assignments", assignmentId, "completions"),
        (snap) => {
          const completionMap = {};
          snap.forEach((completionDoc) => {
            completionMap[completionDoc.id] = completionDoc.data();
          });
          setAssignmentCompletionMaps((prev) => {
            const next = { ...prev };
            if (Object.keys(completionMap).length === 0) {
              delete next[assignmentId];
            } else {
              next[assignmentId] = completionMap;
            }
            return areEqual(prev, next) ? prev : next;
          });
        },
        (error) =>
          console.error(
            `Firestore assignment completions sync error (${assignmentId}):`,
            error
          )
      );
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, [
    adminPreviewActive,
    adminSimulationActive,
    assignmentIdsKey,
    currentUser,
    effectiveStudentId,
    userRole,
  ]);

  useEffect(() => {
    if (
      adminSimulationActive ||
      adminPreviewActive ||
      !db ||
      !currentUser ||
      currentUser === ROOT_ADMIN_ID ||
      userRole !== "teacher"
    ) {
      setTeacherInvites([]);
      setSentTeacherInvites([]);
      return undefined;
    }

    const invitesQuery = query(
      collection(db, "class_invites"),
      where("targetTeacherEmail", "==", currentUser)
    );
    const sentInvitesQuery = query(
      collection(db, "class_invites"),
      where("invitedBy", "==", currentUser)
    );
    const unsubReceived = onSnapshot(
      invitesQuery,
      (snap) => {
        const invites = snap.docs
          .map((inviteDoc) => ({ id: inviteDoc.id, ...inviteDoc.data() }))
          .filter((invite) => invite.status === "pending")
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setTeacherInvites((prev) => (areEqual(prev, invites) ? prev : invites));
      },
      (error) => console.error("Firestore teacher invite sync error:", error)
    );
    const unsubSent = onSnapshot(
      sentInvitesQuery,
      (snap) => {
        const invites = snap.docs
          .map((inviteDoc) => ({ id: inviteDoc.id, ...inviteDoc.data() }))
          .filter((invite) => invite.status === "pending")
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setSentTeacherInvites((prev) => (areEqual(prev, invites) ? prev : invites));
      },
      (error) => console.error("Firestore sent teacher invite sync error:", error)
    );

    return () => {
      unsubReceived();
      unsubSent();
    };
  }, [
    adminPreviewActive,
    adminSimulationActive,
    currentUser,
    userRole,
  ]);

  useEffect(() => {
    if (
      adminSimulationActive ||
      adminPreviewActive ||
      !db ||
      !currentUser ||
      currentUser === ROOT_ADMIN_ID ||
      userRole !== "teacher"
    ) {
      setClassJoinCodes([]);
      return undefined;
    }

    const joinCodesQuery = query(
      collection(db, "class_join_codes"),
      where("createdBy", "==", currentUser)
    );
    const unsub = onSnapshot(
      joinCodesQuery,
      (snap) => {
        const codes = snap.docs
          .map((codeDoc) => ({ id: codeDoc.id, ...codeDoc.data() }))
          .sort((a, b) => timestampToMillis(b.expiresAt) - timestampToMillis(a.expiresAt));
        setClassJoinCodes((prev) => (areEqual(prev, codes) ? prev : codes));
      },
      (error) => console.error("Firestore student join code sync error:", error)
    );

    return () => unsub();
  }, [
    adminPreviewActive,
    adminSimulationActive,
    currentUser,
    userRole,
  ]);

  useEffect(() => {
    if (
      adminSimulationActive ||
      adminPreviewActive ||
      !db ||
      !currentUser ||
      userRole !== "student" ||
      !effectiveStudentId ||
      effectiveStudentId === ROOT_ADMIN_ID
    ) {
      setNudges([]);
      return undefined;
    }

    const nudgesQuery = query(
      collection(db, "nudges"),
      where("targetUserId", "==", effectiveStudentId)
    );
    const unsub = onSnapshot(
      nudgesQuery,
      (snap) => {
        const nextNudges = snap.docs
          .map((nudgeDoc) => ({ id: nudgeDoc.id, ...nudgeDoc.data() }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setNudges((prev) => (areEqual(prev, nextNudges) ? prev : nextNudges));
      },
      (error) => console.error("Firestore nudges sync error:", error)
    );

    return () => unsub();
  }, [
    adminPreviewActive,
    adminSimulationActive,
    currentUser,
    effectiveStudentId,
    userRole,
  ]);

  useEffect(() => {
    if (adminSimulationActive) return undefined;
    if (adminPreviewActive) return undefined;
    if (
      isRootAdminIdentity ||
      !db ||
      !["teacher-dashboard", "class-view"].includes(view) ||
      !classroomStudentIds
    ) {
      setStudentProgressById({});
      return undefined;
    }

    const studentIds = classroomStudentIds.split("|");
    setStudentProgressById((prev) => {
      const next = {};
      studentIds.forEach((studentId) => {
        if (prev[studentId]) next[studentId] = prev[studentId];
      });
      return areEqual(prev, next) ? prev : next;
    });

    const unsubs = studentIds.map((studentId) =>
      onSnapshot(
        collection(db, "users", studentId, "progress"),
        (snap) => {
          const nextProgress = {};
          snap.forEach((progressDoc) => {
            nextProgress[progressDoc.id] = progressDoc.data();
          });
          setStudentProgressById((prev) =>
            areEqual(prev[studentId], nextProgress)
              ? prev
              : { ...prev, [studentId]: nextProgress }
          );
        },
        (error) =>
          console.error(`Firestore student progress sync error (${studentId}):`, error)
      )
    );

    return () => unsubs.forEach((unsub) => unsub());
  }, [adminPreviewActive, adminSimulationActive, classroomStudentIds, isRootAdminIdentity, view]);

  useEffect(() => {
    if (view !== "speed-blitz" && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [view]);

  useEffect(() => {
    const clock = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    if (
      userRole === "teacher" &&
      activeClassSubjectIds.length > 0 &&
      !activeClassSubjectIds.includes(activeSubjectId)
    ) {
      setActiveSubjectId(activeClassSubjectIds[0]);
    }
  }, [activeClassSubjectKey, activeSubjectId, userRole]);

  useEffect(() => {
    if (assignmentTargetType === "essay") {
      if (!curriculumWrittenData.some((question) => question.id === assignmentTargetId)) {
        setAssignmentTargetId(curriculumWrittenData[0]?.id || "");
      }
      return;
    }

    if (assignmentTargetType === "subsection") {
      const subsections = curriculumFlashcardData.flatMap(
        (chapter) => chapter.subsections || []
      );
      if (!subsections.some((subsection) => subsection.id === assignmentTargetId)) {
        setAssignmentTargetId(subsections[0]?.id || "");
      }
      return;
    }

    if (!curriculumFlashcardData.some((chapter) => chapter.id === assignmentTargetId)) {
      setAssignmentTargetId(curriculumFlashcardData[0]?.id || "");
    }
  }, [
    activeSubjectId,
    assignmentTargetId,
    assignmentTargetType,
    curriculumFlashcardData,
    curriculumWrittenData,
  ]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const saveWrittenToCloud = async (newProgress) => {
    if (
      !currentUser ||
      currentUser === ROOT_ADMIN_ID ||
      adminSimulationActive ||
      !db ||
      !isHydrated
    ) return;

    try {
      await setDoc(
        doc(db, "users", currentUser),
        { writtenProgress: newProgress, lastUpdated: Date.now() },
        { merge: true }
      );
    } catch (e) {
      console.error("Cloud write failure:", e);
    }
  };

  const calculateMastery = (cardId, currentProgress = progress) => {
    const itemProgress = currentProgress[cardId];
    if (!itemProgress) return 0;

    const startingMastery =
      itemProgress.baseMastery !== undefined
        ? itemProgress.baseMastery
        : itemProgress.status === "correct"
          ? 100
          : 0;
    const consecutive = itemProgress.consecutiveCorrect || 0;
    const safeLastSeen = itemProgress.lastSeen || Date.now();
    const daysPassed = Math.max(0, (Date.now() - safeLastSeen) / DAY_MS);

    let decayRate;
    if (consecutive === 0) decayRate = 12;
    else if (consecutive === 1) decayRate = 3;
    else if (consecutive === 2) decayRate = 0.8;
    else decayRate = 0.15;

    return Math.max(
      0,
      Math.min(100, Math.round(startingMastery - daysPassed * decayRate) || 0)
    );
  };

  const getCardsForChapter = (chapter) =>
    (chapter?.subsections || []).flatMap((subsection) => subsection.cards || []);

  const getSectionMastery = (cards, currentProgress = progress) => {
    if (!cards || cards.length === 0) return 0;
    const total = cards.reduce(
      (acc, card) => acc + calculateMastery(card.id, currentProgress),
      0
    );
    return Math.round(total / cards.length) || 0;
  };

  const getDecayedCardsCount = () =>
    allCards.filter(
      (card) => progress[card.id] !== undefined && calculateMastery(card.id) < 80
    ).length;

  const getRingColor = (score) => {
    if (score >= 80) return "var(--green)";
    if (score >= 50) return "#f59e0b";
    return "var(--red)";
  };

  const getChapterQuestions = (chapterId) => {
    const chapterNumber = getChapterNumber(chapterId);
    return curriculumWrittenData.filter(
      (question) => getChapterNumber(question.topic) === chapterNumber
    );
  };

  const getAssignmentCards = (assignment) => {
    if (!assignment || assignment.targetType === "essay") return [];
    const assignmentCurriculum =
      curriculums.find(
        (curriculum) => curriculum.id === (assignment.subjectId || activeSubjectId)
      ) || activeCurriculum;
    if (assignment.targetType === "subsection") {
      const subsection = (assignmentCurriculum.chapters || [])
        .flatMap((chapter) => chapter.subsections || [])
        .find((item) => item.id === assignment.targetId);
      return subsection?.cards || [];
    }
    const chapter = (assignmentCurriculum.chapters || []).find(
      (item) => item.id === assignment.targetId
    );
    return getCardsForChapter(chapter);
  };

  const getAssignmentLabel = (type, id, subjectId = activeSubjectId) => {
    const labelCurriculum =
      curriculums.find((curriculum) => curriculum.id === subjectId) || activeCurriculum;
    if (type === "essay") {
      const question = (labelCurriculum.writtenQuestions || []).find((item) => item.id === id);
      return question
        ? `Long answer: ${question.question}`
        : "Long answer question";
    }
    if (type === "subsection") {
      const subsection = (labelCurriculum.chapters || [])
        .flatMap((chapter) => chapter.subsections || [])
        .find((item) => item.id === id);
      return subsection?.title || id;
    }

    const chapter = (labelCurriculum.chapters || []).find((item) => item.id === id);
    return chapter?.title || id;
  };

  const getAssignmentShortLabel = (type, id, subjectId = activeSubjectId) => {
    const labelCurriculum =
      curriculums.find((curriculum) => curriculum.id === subjectId) || activeCurriculum;
    if (type === "essay") {
      const question = (labelCurriculum.writtenQuestions || []).find((item) => item.id === id);
      return `Long answer ${getTopicCode(question?.topic || question?.id, id)}`;
    }
    if (type === "subsection") {
      const subsection = (labelCurriculum.chapters || [])
        .flatMap((chapter) => chapter.subsections || [])
        .find((item) => item.id === id);
      return `Chapter ${getTopicCode(subsection?.title || subsection?.id, id)}`;
    }

    const chapter = (labelCurriculum.chapters || []).find((item) => item.id === id);
    return `Chapter ${getTopicCode(chapter?.title || chapter?.id, id)}`;
  };

  const getAssignmentMastery = (
    assignment,
    currentProgress = progress,
    currentWrittenProgress = writtenProgress
  ) => {
    if (!assignment) return 0;
    if (assignment.targetType === "essay") {
      return Math.round(currentWrittenProgress[assignment.targetId]?.last_score || 0);
    }

    return getSectionMastery(getAssignmentCards(assignment), currentProgress);
  };

  const hasStartedAssignment = (
    assignment,
    currentProgress = progress,
    currentWrittenProgress = writtenProgress
  ) => {
    if (!assignment) return false;
    if (assignment.targetType === "essay") {
      return Boolean(currentWrittenProgress[assignment.targetId]?.attempts);
    }
    return getAssignmentCards(assignment).some((card) => currentProgress[card.id]);
  };

  const getAssignmentStudentStatus = (
    assignment,
    student,
    currentProgress = progress,
    currentWrittenProgress = writtenProgress
  ) => {
    const studentId = student?.id || effectiveStudentId;
    const completion = getAssignmentCompletionMap(assignment)[studentId];
    const mastery =
      completion?.mastery ??
      getAssignmentMastery(assignment, currentProgress, currentWrittenProgress);
    const target = assignment?.targetMastery || 80;
    const complete = Boolean(completion) || mastery >= target;
    const started =
      complete || hasStartedAssignment(assignment, currentProgress, currentWrittenProgress);
    const overdue = !complete && assignment?.deadline && assignment.deadline < nowMs;
    const tone = complete ? "complete" : overdue ? "support" : started ? "working" : "watch";
    const label = complete
      ? "Complete"
      : overdue
        ? started
          ? "Overdue, started"
          : "Overdue, not started"
        : started
          ? "Started"
          : "Not started";

    return {
      complete,
      label,
      mastery: Math.round(mastery || 0),
      overdue,
      started,
      target,
      tone,
    };
  };

  const getStudentProgressRecordSafe = (student) =>
    Object.keys(studentProgressById[student?.id] || {}).length > 0
      ? studentProgressById[student.id]
      : student?.progress || {};

  const getStudentAssignmentOverview = (student, scopedAssignments = []) => {
    const studentProgress = getStudentProgressRecordSafe(student);
    const statuses = scopedAssignments.map((assignment) =>
      getAssignmentStudentStatus(
        assignment,
        student,
        studentProgress,
        student?.writtenProgress || {}
      )
    );
    if (statuses.length === 0) {
      return { label: "No assignments", tone: "neutral", detail: "", statuses };
    }
    const completeCount = statuses.filter((item) => item.complete).length;
    const overdueCount = statuses.filter((item) => item.overdue).length;
    const startedCount = statuses.filter((item) => item.started && !item.complete).length;
    const averageMastery = Math.round(
      statuses.reduce((sum, item) => sum + item.mastery, 0) / statuses.length
    );

    if (completeCount === statuses.length) {
      return {
        label: `${completeCount}/${statuses.length} complete`,
        tone: "complete",
        detail: `${averageMastery}% average`,
        statuses,
      };
    }
    if (overdueCount > 0) {
      return {
        label: `${overdueCount} overdue`,
        tone: "support",
        detail: `${completeCount}/${statuses.length} complete`,
        statuses,
      };
    }
    if (startedCount > 0) {
      return {
        label: `${startedCount} started`,
        tone: "working",
        detail: `${completeCount}/${statuses.length} complete`,
        statuses,
      };
    }
    return {
      label: "Not started",
      tone: "watch",
      detail: `${statuses.length} assignment${statuses.length === 1 ? "" : "s"} active`,
      statuses,
    };
  };

  const getReadinessXpTarget = (subjectId = activeSubjectId) => {
    const targetCurriculum =
      curriculums.find((curriculum) => curriculum.id === subjectId) ||
      activeCurriculum ||
      DEFAULT_CURRICULUM;
    const targetCards = (targetCurriculum.chapters || []).flatMap((chapter) =>
      getCardsForChapter(chapter)
    );
    const targetEssays = targetCurriculum.writtenQuestions || [];
    const spacedPracticeTarget =
      targetCards.length * BASE_XP.flashcard * 3 +
      targetEssays.length * BASE_XP.essay * 3 +
      targetCards.length * BASE_XP.blitz * 2;

    return Math.max(MIN_TWO_YEAR_TARGET_XP, Math.round(spacedPracticeTarget));
  };

  const compactXpTimeline = (points, window, studentXp, reviewNowMs) => {
    const safeStudentXp = Math.max(0, Math.round(Number(studentXp) || 0));
    const sorted = points
      .map((point) => ({
        at: timestampToMillis(point.at),
        source: point.source || "activity",
        xp: Math.max(0, Math.round(Number(point.xp) || 0)),
      }))
      .filter((point) => point.at >= window.start && point.at <= reviewNowMs)
      .sort((a, b) => a.at - b.at);
    const bounded = [
      { at: window.start, xp: 0, source: "course-start" },
      ...sorted,
      { at: reviewNowMs, xp: safeStudentXp, source: "current" },
    ];
    const compacted = [];
    let highestXp = 0;

    bounded.forEach((point) => {
      const nextPoint = {
        ...point,
        xp: Math.min(safeStudentXp, Math.max(highestXp, point.xp)),
      };
      highestXp = nextPoint.xp;
      const previous = compacted[compacted.length - 1];

      if (previous && Math.abs(previous.at - nextPoint.at) < HOUR_MS) {
        previous.xp = Math.max(previous.xp, nextPoint.xp);
        previous.source = nextPoint.source;
        return;
      }

      if (previous && previous.at === nextPoint.at && previous.xp === nextPoint.xp) {
        return;
      }

      compacted.push(nextPoint);
    });

    return compacted;
  };

  const groupXpTimelineForChart = (points, window, reviewNowMs) => {
    const sorted = (Array.isArray(points) ? points : [])
      .map((point) => ({
        at: timestampToMillis(point.at),
        source: point.source || "activity",
        xp: Math.max(0, Math.round(Number(point.xp) || 0)),
      }))
      .filter((point) => point.at >= window.start && point.at <= reviewNowMs)
      .sort((a, b) => a.at - b.at);

    if (sorted.length <= 8) return sorted;

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const elapsedSpan = Math.max(DAY_MS, reviewNowMs - window.start);
    const bucketMs = Math.max(DAY_MS, Math.ceil(elapsedSpan / 6));
    const buckets = new Map();

    sorted.slice(1, -1).forEach((point) => {
      const bucketKey = Math.floor((point.at - window.start) / bucketMs);
      const existing = buckets.get(bucketKey);
      if (!existing || point.at >= existing.at || point.xp > existing.xp) {
        buckets.set(bucketKey, point);
      }
    });

    const grouped = [
      first,
      ...Array.from(buckets.values()).sort((a, b) => a.at - b.at),
      last,
    ];

    return grouped.filter((point, index, items) => {
      const previous = items[index - 1];
      return !previous || point.at !== previous.at || point.xp !== previous.xp;
    });
  };

  const buildStudentXpTimeline = (
    student,
    currentProgress,
    currentWrittenProgress,
    scopedAssignments,
    studentXp,
    window,
    reviewNowMs,
    studentId
  ) => {
    const explicitSamples = Array.isArray(student?.xpHistory)
      ? student.xpHistory
          .map((item) => ({
            at: item.at || item.date || item.timestamp,
            xp: item.xpTotal ?? item.xp ?? item.total,
            source: item.source || "saved XP",
          }))
          .filter((item) => timestampToMillis(item.at) > 0)
      : [];

    if (explicitSamples.length >= 2) {
      return {
        points: compactXpTimeline(explicitSamples, window, studentXp, reviewNowMs),
        sourceCount: explicitSamples.length,
        sourceLabel: "saved XP samples",
      };
    }

    const weightedEvents = [];
    const addEvent = (at, weight, source) => {
      const timestamp = timestampToMillis(at);
      const safeWeight = Number(weight) || 0;
      if (timestamp < window.start || timestamp > reviewNowMs || safeWeight <= 0) return;
      weightedEvents.push({ at: timestamp, weight: safeWeight, source });
    };

    Object.values(currentProgress || {}).forEach((record) => {
      const masteryWeight = Math.max(0.2, Math.min(1.3, (record?.baseMastery || 35) / 100));
      const repeatWeight = 1 + Math.min(4, record?.consecutiveCorrect || 0) * 0.22;
      addEvent(
        record?.lastSeen,
        BASE_XP.flashcard * masteryWeight * repeatWeight,
        "question practice"
      );
    });

    Object.values(currentWrittenProgress || {}).forEach((record) => {
      const scoreWeight = Math.max(0.2, Math.min(1.25, (record?.last_score || 45) / 100));
      addEvent(record?.timestamp || record?.lastSeen, BASE_XP.essay * scoreWeight, "written answer");
    });

    (scopedAssignments || []).forEach((assignment) => {
      const completion = getAssignmentCompletionMap(assignment)[studentId];
      if (!completion) return;
      const masteryWeight = Math.max(
        0.55,
        Math.min(1.35, (completion.mastery || assignment.targetMastery || 80) / 100)
      );
      addEvent(
        completion.completedAt || completion.updatedAt,
        BASE_XP.assignment * masteryWeight,
        "assignment complete"
      );
    });

    if (student?.lastXP) {
      addEvent(student.lastXP.at, student.lastXP.earned || BASE_XP.flashcard, "recent XP");
    }

    const safeStudentXp = Math.max(0, Math.round(Number(studentXp) || 0));
    if (weightedEvents.length === 0) {
      if (safeStudentXp <= 0) {
        return {
          points: compactXpTimeline([], window, safeStudentXp, reviewNowMs),
          sourceCount: 0,
          sourceLabel: "no activity yet",
        };
      }

      const fallbackCount = Math.min(
        5,
        Math.max(2, Math.ceil((student?.activeEngagements || 1) / 8))
      );
      const span = Math.max(DAY_MS, reviewNowMs - window.start);
      const estimatedPoints = Array.from({ length: fallbackCount }, (_, index) => {
        const ratio = (index + 1) / fallbackCount;
        return {
          at: window.start + span * ratio,
          xp: Math.round(safeStudentXp * Math.pow(ratio, 1.18)),
          source: "estimated XP",
        };
      });

      return {
        points: compactXpTimeline(estimatedPoints, window, safeStudentXp, reviewNowMs),
        sourceCount: 0,
        sourceLabel: "estimated from current XP",
      };
    }

    weightedEvents.sort((a, b) => a.at - b.at);
    const totalWeight = weightedEvents.reduce((sum, event) => sum + event.weight, 0) || 1;
    let runningWeight = 0;
    const timelinePoints = weightedEvents.map((event) => {
      runningWeight += event.weight;
      return {
        at: event.at,
        xp: Math.round((runningWeight / totalWeight) * safeStudentXp),
        source: event.source,
      };
    });

    return {
      points: compactXpTimeline(timelinePoints, window, safeStudentXp, reviewNowMs),
      sourceCount: weightedEvents.length,
      sourceLabel: "activity records",
    };
  };

  const buildProgressReviewChart = (
    timeline,
    window,
    targetXp,
    expectedXp,
    studentXp,
    reviewNowMs
  ) => {
    const chartLeft = 42;
    const chartRight = 332;
    const chartTop = 24;
    const chartBottom = 150;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;
    const safeRatio = (value) => Math.max(0, Math.min(1, Number(value) || 0));
    const yMax = Math.max(targetXp * 1.15, expectedXp * 1.2, 1);
    const mapX = (ratio) => chartLeft + chartWidth * safeRatio(ratio);
    const mapY = (xp) => chartBottom - chartHeight * safeRatio((Number(xp) || 0) / yMax);
    const currentX = mapX(window.elapsedRatio);
    const displayTimeline = groupXpTimelineForChart(
      timeline?.points || [],
      window,
      reviewNowMs
    );
    const chartPoints = displayTimeline
      .map((item) => ({
        x: mapX((item.at - window.start) / Math.max(1, window.target - window.start)),
        y: mapY(item.xp),
        source: item.source,
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    const actualPoints =
      chartPoints.length > 0
        ? chartPoints
        : [
            { x: chartLeft, y: chartBottom },
            { x: currentX, y: mapY(studentXp) },
          ];
    const actualMarkers = actualPoints
      .slice(1, -1)
      .filter((_, index, items) => items.length <= 4 || index % Math.ceil(items.length / 4) === 0);
    const sourceCount = timeline?.sourceCount || 0;
    const sourceLabel =
      sourceCount > displayTimeline.length
        ? `${timeline?.sourceLabel || "activity records"} grouped into ${displayTimeline.length} trend points`
        : timeline?.sourceLabel || "activity records";

    return {
      actual: { x: currentX, y: mapY(studentXp) },
      actualMarkers,
      actualPoints: actualPoints.map((point) => `${point.x},${point.y}`).join(" "),
      current: { x: currentX },
      expected: { x: currentX, y: mapY(expectedXp) },
      sourceCount,
      sourceLabel,
      start: { x: chartLeft, y: chartBottom },
      target: { x: chartRight, y: mapY(targetXp) },
    };
  };

  const getStudentProgressReview = (student, options = {}) => {
    const reviewNowMs =
      options.nowOverride ??
      (adminSimulationActive
        ? (simulationStartedAt || nowMs) + simulationHour * HOUR_MS
        : nowMs);
    const studentId = student?.id || options.studentId || effectiveStudentId;
    const studentClassList =
      options.classIds || getStudentClassIds(student || { classIds: studentClassIds });
    const studentProgress =
      options.progressOverride || getStudentProgressRecordSafe(student || {});
    const studentWrittenProgress =
      options.writtenProgressOverride || student?.writtenProgress || {};
    const mastery =
      options.masteryOverride ?? getSectionMastery(allCards, studentProgress);
    const studentXp = Math.round(
      options.xpOverride ?? student?.xpTotal ?? xpTotal ?? 0
    );
    const reviewAssignments = (options.assignmentsScope || assignments).filter(
      (assignment) =>
        assignment?.status !== "cancelled" &&
        studentClassList.includes(assignment.classId)
    );
    const closedAssignments = reviewAssignments.filter((assignment) => {
      const deadline = timestampToMillis(assignment.deadline);
      return deadline > 0 && deadline < reviewNowMs;
    });
    const assignmentOutcomes = closedAssignments.reduce(
      (acc, assignment) => {
        const completion = getAssignmentCompletionMap(assignment)[studentId];
        if (!completion) {
          acc.missed += 1;
          return acc;
        }
        const deadline = timestampToMillis(assignment.deadline);
        const completedAt =
          timestampToMillis(completion.completedAt) ||
          timestampToMillis(completion.updatedAt);
        if (completedAt && deadline && completedAt > deadline) {
          acc.late += 1;
        } else {
          acc.onTime += 1;
        }
        return acc;
      },
      { onTime: 0, late: 0, missed: 0 }
    );
    const window = getAcademicProgressWindow(reviewNowMs, nowMs);
    const targetXp = getReadinessXpTarget(options.subjectId || activeSubjectId);
    const expectedXp = Math.round(targetXp * window.elapsedRatio);
    const xpTimeline = buildStudentXpTimeline(
      student,
      studentProgress,
      studentWrittenProgress,
      reviewAssignments,
      studentXp,
      window,
      reviewNowMs,
      studentId
    );
    const paceRatio =
      expectedXp > 0 ? studentXp / expectedXp : studentXp > 0 ? 1.2 : 0;
    const trackTone =
      paceRatio >= 1.15
        ? "gold"
        : paceRatio >= 0.95
          ? "green"
          : paceRatio >= 0.75
            ? "orange"
            : "red";
    const paceLabel =
      trackTone === "gold"
        ? "Well ahead"
        : trackTone === "green"
          ? "On track"
          : trackTone === "orange"
            ? "Slightly behind"
            : "Needs support";
    const studentName =
      student?.name ||
      (studentId?.includes("@") ? studentId.split("@")[0] : studentId || "Student");
    const statusLabel =
      trackTone === "gold"
        ? `${studentName} is well ahead`
        : trackTone === "green"
          ? `${studentName} is on track`
          : trackTone === "orange"
            ? `${studentName} is slightly behind`
            : `${studentName} needs support`;

    return {
      chart: buildProgressReviewChart(
        xpTimeline,
        window,
        targetXp,
        expectedXp,
        studentXp,
        reviewNowMs
      ),
      currentLabel: adminSimulationActive ? "Sim date" : "Today",
      expectedXp,
      lateAssignments: assignmentOutcomes.late,
      mastery,
      missedAssignments: assignmentOutcomes.missed,
      onTimeAssignments: assignmentOutcomes.onTime,
      paceLabel,
      paceRatio,
      statusLabel,
      streakDays: options.streakOverride ?? student?.streak?.current ?? streak.current ?? 0,
      studentXp,
      targetXp,
      trackTone,
      window,
    };
  };

  const getAssignmentClassSummary = (assignment, students = classroomStudents) => {
    const statuses = students.map((student) =>
      getAssignmentStudentStatus(
        assignment,
        student,
        getStudentProgressRecordSafe(student),
        student?.writtenProgress || {}
      )
    );
    return {
      complete: statuses.filter((item) => item.complete).length,
      overdue: statuses.filter((item) => item.overdue).length,
      started: statuses.filter((item) => item.started && !item.complete).length,
      notStarted: statuses.filter((item) => !item.started).length,
      total: statuses.length,
    };
  };

  const simulationTotalHours = Math.max(24, simulationDurationDays * 24);
  const simulationRealDayLabel = formatSimulationDuration(
    DAY_MS / Math.max(1, simulationSpeed || 1)
  );
  const simulationRealHourLabel = formatSimulationDuration(
    HOUR_MS / Math.max(1, simulationSpeed || 1)
  );
  const isSimulationClassId = (classId) =>
    String(classId || "").toUpperCase().startsWith(SIM_ID_PREFIX);

  const simulationClasses = useMemo(
    () => teacherClasses.filter((classItem) => isSimulationClassId(classItem.id)),
    [teacherClasses]
  );

  const simulationStudents = useMemo(
    () =>
      allUsersData.filter(
        (user) =>
          user.role === "student" &&
          getStudentClassIds(user).some((classId) => isSimulationClassId(classId))
      ),
    [allUsersData]
  );

  const simulationAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.simulation),
    [assignments]
  );

  const simulationAssignment = useMemo(
    () =>
      simulationAssignments.find((assignment) => assignment.classId === activeClassId) ||
      simulationAssignments[0],
    [activeClassId, simulationAssignments]
  );

  const simulationRows = useMemo(
    () =>
      simulationStudents.map((student) => {
        const studentClassId =
          getStudentClassIds(student).find((classId) => isSimulationClassId(classId)) ||
          SIM_CLASS_ID;
        const classRecord =
          simulationClasses.find((classItem) => classItem.id === studentClassId) || {};
        const assignment =
          simulationAssignments.find(
            (item) => item.classId === studentClassId && item.status === "active"
          ) ||
          simulationAssignments.find((item) => item.classId === studentClassId) ||
          simulationAssignment;
        const currentProgress =
          studentProgressById[student.id] || student.progress || {};
        const mastery = assignment
          ? getAssignmentMastery(
              assignment,
              currentProgress,
              student.writtenProgress || {}
            )
          : 0;
        const completion = getAssignmentCompletionMap(assignment)[student.id];
        const activity = student.simulation?.currentActivity || "Waiting for next study window";
        const currentQuestion =
          student.simulation?.currentQuestion ||
          student.simulation?.currentCardId ||
          "No card active";
        const simLastActivityDay = Number.isFinite(student.simulation?.lastActivityDay)
          ? student.simulation.lastActivityDay
          : null;
        const inactiveDays =
          simLastActivityDay === null
            ? null
            : Math.max(0, simulationDay - simLastActivityDay);
        const lastActiveInfo = formatLastActiveFromDays(inactiveDays);
        const isWorking = Boolean(student.simulation?.isWorking);
        const isSlacking = Boolean(student.simulation?.slacking);
        const status = completion
          ? "Complete"
          : isWorking
            ? "Working"
            : isSlacking
              ? "Slacking"
              : "Idle";

        return {
          id: student.id,
          name: student.name || student.id,
          classId: studentClassId,
          className: classRecord.name || student.simulation?.className || studentClassId,
          teacherName: student.simulation?.teacherName || "Simulation Teacher",
          teacherId: student.simulation?.teacherId || "",
          profile: student.simulation?.profile || "Mixed",
          completed: Boolean(completion),
          completedDay: completion?.simDay || "",
          completedHour: completion?.simHour || "",
          mastery,
          xp: Math.round(student.xpTotal || 0),
          engagement: student.activeEngagements || 0,
          consistency: student.simulation?.consistency || 0,
          accuracy: student.simulation?.accuracy || 0,
          status,
          currentActivity: activity,
          currentQuestion,
          inactiveDays,
          lastActiveLabel: lastActiveInfo.label,
          lastActiveTone: lastActiveInfo.tone,
          isWorking,
          isSlacking,
          nudgeCount: student.simulation?.nudgeCount || 0,
          rewardCount: student.simulation?.rewardCount || 0,
          streak: student.streak?.current || 0,
          message: student.simulation?.lastMessage || "",
        };
      }),
    [
      simulationAssignment,
      simulationAssignments,
      simulationClasses,
      simulationStudents,
      studentProgressById,
    ]
  );

  const visibleSimulationRows = useMemo(
    () =>
      simulationClassFilter === "all"
        ? simulationRows
        : simulationRows.filter((row) => row.classId === simulationClassFilter),
    [simulationClassFilter, simulationRows]
  );

  const simulationSummary = useMemo(() => {
    const total = simulationRows.length;
    const completed = simulationRows.filter((row) => row.completed).length;
    const averageMastery =
      total > 0
        ? Math.round(
            simulationRows.reduce((sum, row) => sum + row.mastery, 0) / total
          )
        : 0;
    const atRisk = simulationRows.filter((row) => !row.completed && row.mastery < 70).length;
    const activeNow = simulationRows.filter((row) => row.isWorking).length;
    const classCount = new Set(simulationRows.map((row) => row.classId)).size;
    const teacherCount = new Set(
      simulationRows.map((row) => row.teacherId || row.teacherName)
    ).size;

    return { total, completed, averageMastery, atRisk, activeNow, classCount, teacherCount };
  }, [simulationRows]);

  const simulationCsv = useMemo(() => {
    const header = [
      "student_id",
      "name",
      "class_id",
      "class_name",
      "teacher",
      "profile",
      "status",
      "current_activity",
      "current_question",
      "completed",
      "completed_day",
      "completed_hour",
      "mastery",
      "xp",
      "active_engagements",
      "consistency",
      "accuracy",
      "streak",
      "nudges",
      "rewards",
    ];
    const rows = simulationRows.map((row) =>
      [
        row.id,
        row.name,
        row.classId,
        row.className,
        row.teacherName,
        row.profile,
        row.status,
        row.currentActivity,
        row.currentQuestion,
        row.completed ? "yes" : "no",
        row.completedDay,
        row.completedHour,
        row.mastery,
        row.xp,
        row.engagement,
        row.consistency,
        row.accuracy,
        row.streak,
        row.nudgeCount,
        row.rewardCount,
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(",")
    );

    return [header.join(","), ...rows].join("\n");
  }, [simulationRows]);

  const persistCurriculum = async (nextCurriculum) => {
    const normalized = normalizeCurriculum(nextCurriculum);
    setCurriculums((prev) => {
      const exists = prev.some((curriculum) => curriculum.id === normalized.id);
      const next = exists
        ? prev.map((curriculum) =>
            curriculum.id === normalized.id ? normalized : curriculum
          )
        : [...prev, normalized];
      return areEqual(prev, next) ? prev : next;
    });
    setActiveSubjectId(normalized.id);

    if (isRootAdmin || !db || !currentUser || userRole !== "admin") return;

    try {
      await setDoc(
        doc(db, "curriculums", normalized.id),
        {
          subject: normalized.subject,
          subjectName: normalized.subjectName,
          title: normalized.title,
          examBoard: normalized.examBoard || "",
          specification: normalized.specification || "",
          version: normalized.version || "",
          importFormat: normalized.importFormat || "",
          chapters: normalized.chapters,
          writtenQuestions: normalized.writtenQuestions,
          updatedAt: Date.now(),
          updatedBy: currentUser,
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Curriculum write failed:", error);
    }
  };

  const seedDefaultCurriculum = () =>
    persistCurriculum({ ...DEFAULT_CURRICULUM, updatedAt: Date.now() });

  const saveFlashcardQuestion = (subjectId, cardId, updates) => {
    const curriculum =
      curriculums.find((item) => item.id === subjectId) || DEFAULT_CURRICULUM;
    const nextCurriculum = {
      ...curriculum,
      chapters: (curriculum.chapters || []).map((chapter) => ({
        ...chapter,
        subsections: (chapter.subsections || []).map((subsection) => ({
          ...subsection,
          cards: (subsection.cards || []).map((card) =>
            card.id === cardId
              ? {
                  ...card,
                  front: updates.front,
                  back: updates.back,
                  imageUrl: updates.imageUrl || "",
                }
              : card
          ),
        })),
      })),
      updatedAt: Date.now(),
    };

    persistCurriculum(nextCurriculum);
  };

  const saveWrittenQuestion = (subjectId, questionId, updates) => {
    const curriculum =
      curriculums.find((item) => item.id === subjectId) || DEFAULT_CURRICULUM;
    const nextCurriculum = {
      ...curriculum,
      writtenQuestions: (curriculum.writtenQuestions || []).map((question) =>
        question.id === questionId
          ? {
              ...question,
              topic: updates.topic,
              question: updates.question,
              marks: updates.marks,
              points: updates.points,
              imageUrl: updates.imageUrl || "",
              imageRequired: updates.imageRequired || "",
            }
          : question
      ),
      updatedAt: Date.now(),
    };

    persistCurriculum(nextCurriculum);
  };

  const flagContentError = async (contentId, comment, contentType) => {
    const trimmedComment = String(comment || "").trim();
    if (!contentId || !trimmedComment) return;

    const payload = {
      anonymous: true,
      contentId,
      contentType,
      subjectId: activeSubjectId,
      classIds: studentClassIds,
      classLabels: studentClassIds,
      licenseId: userLicenseId || activeLicense?.id || "",
      schoolName: activeLicense?.school_name || "",
      reporterRole: userRole || "student",
      comment: trimmedComment,
      status: "open",
      createdAt: Date.now(),
    };

    if (
      isRootAdmin ||
      adminSimulationActive ||
      !db ||
      !currentUser ||
      currentUser === ROOT_ADMIN_ID
    ) {
      setFlaggedContent((prev) => [
        { id: `local-flag-${Date.now().toString(36)}`, ...payload },
        ...prev,
      ]);
      return;
    }

    try {
      await setDoc(doc(collection(db, "flagged_content")), payload);
      alert("Thanks, this has been sent for review.");
    } catch (error) {
      console.error("Content flag write failed:", error);
      alert("That flag could not be sent. Please try again.");
    }
  };

  const getClassAssignments = (classId) =>
    assignments.filter(
      (assignment) => assignment.classId === classId && assignment.status === "active"
    );

  const getIncompleteAssignmentsForStudent = (student, scopedAssignments = assignments) => {
    const ids = getStudentClassIds(student);
    return scopedAssignments.filter(
      (assignment) =>
        assignment.status === "active" &&
        ids.includes(assignment.classId) &&
        !isAssignmentCompletedBy(assignment, student.id)
    );
  };

  const getClassStats = (classId) => {
    const students = allUsersData.filter(
      (user) => user.role === "student" && getStudentClassIds(user).includes(classId)
    );
    const activeAssignments = getClassAssignments(classId);
    const possibleCompletions = students.length * activeAssignments.length;
    const completedCount = activeAssignments.reduce(
      (total, assignment) =>
        total +
        students.filter((student) => isAssignmentCompletedBy(assignment, student.id)).length,
      0
    );

    return {
      students,
      activeAssignments,
      completedCount,
      possibleCompletions,
    };
  };

  const teacherDashboardAssignments = teacherClasses.flatMap((classItem) => {
    const stats = getClassStats(classItem.id);
    return stats.activeAssignments.map((assignment) => ({
      assignment,
      classItem,
      students: stats.students,
      completedCount: stats.students.filter(
        (student) => isAssignmentCompletedBy(assignment, student.id)
      ).length,
    }));
  });

  const getClassSeatCount = (classId) =>
    allUsersData.filter(
      (user) => user.role === "student" && getStudentClassIds(user).includes(classId)
    ).length;

  const getTeacherShareUsage = (classId) => {
    const teachers = new Set();
    if (currentUser && teacherClasses.some((classItem) => classItem.id === classId)) {
      teachers.add(currentUser);
    }
    allUsersData.forEach((user) => {
      if (user.role === "teacher" && getStudentClassIds(user).includes(classId)) {
        teachers.add(user.id);
      }
    });
    sentTeacherInvites
      .filter((invite) => invite.classId === classId && invite.status === "pending")
      .forEach((invite) => teachers.add(invite.targetTeacherEmail));
    return teachers.size;
  };

  const getLicenseClassRecord = (classItem) =>
    (activeLicense?.classes || []).find((item) => item.id === classItem.id) || classItem;

  const sendTeacherInvite = async (classItem) => {
    if (activeLicense && !canManageActiveLicense) {
      alert("The Account Manager controls teacher invitations for this pilot.");
      return;
    }
    const targetTeacherEmail = String(classInviteDrafts[classItem.id] || "")
      .trim()
      .toLowerCase();
    if (!isValidEmail(targetTeacherEmail)) {
      alert("Enter the teacher's email address.");
      return;
    }
    if (targetTeacherEmail === currentUser) {
      alert("You already have access to this class.");
      return;
    }
    const teacherShareUsage = getTeacherShareUsage(classItem.id);
    if (teacherShareUsage >= MAX_TEACHERS_PER_CLASS) {
      alert(
        `This class already has ${MAX_TEACHERS_PER_CLASS} teacher access spaces used. Remove or wait for an invitation before adding another teacher.`
      );
      return;
    }

    const licenseClass = getLicenseClassRecord(classItem);
    const classRecord = {
      id: classItem.id,
      name: classItem.name,
      subjects: getClassSubjectIds(licenseClass, licenseSubjectIds),
    };
    const invitePayload = {
      targetTeacherEmail,
      invitedBy: currentUser,
      inviterName: userName || "Teacher",
      licenseId: activeLicense?.id || userLicenseId || "",
      schoolName: activeLicense?.school_name || "",
      classId: classItem.id,
      className: classItem.name,
      classRecord,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setClassInviteDrafts((prev) => ({ ...prev, [classItem.id]: "" }));

    if (isRootAdmin || adminSimulationActive || adminPreviewActive || !db) {
      alert(`Invite prepared for ${targetTeacherEmail}.`);
      return;
    }

    try {
      await setDoc(doc(collection(db, "class_invites")), invitePayload);
      alert(`Invite sent to ${targetTeacherEmail}.`);
    } catch (error) {
      console.error("Teacher invite failed:", error);
      alert("That invite could not be sent. Try again.");
    }
  };

  const getActiveClassJoinCode = (classId) =>
    classJoinCodes
      .filter(
        (code) =>
          code.classId === classId &&
          code.status === "active" &&
          timestampToMillis(code.expiresAt) > nowMs
      )
      .sort((a, b) => timestampToMillis(b.expiresAt) - timestampToMillis(a.expiresAt))[0] ||
    null;

  const generateClassJoinCode = async (classItem) => {
    if (!classItem?.id || !currentUser) return;
    if (licenseStatusInfo.blocksNewWork) {
      alert("This trial has ended. New student join codes are paused until the license is extended.");
      return;
    }

    const code = generateClassJoinCodeValue();
    const now = Date.now();
    const payload = {
      code,
      classId: classItem.id,
      className: classItem.name || classItem.id,
      licenseId: activeLicense?.id || userLicenseId || "",
      schoolName: activeLicense?.school_name || "",
      createdBy: currentUser,
      createdByName: userName || "Teacher",
      status: "active",
      expiresAt: new Date(now + DAY_MS),
      createdAt: now,
      updatedAt: now,
    };

    setClassJoinCodes((prev) => [{ id: code, ...payload }, ...prev]);

    if (isRootAdmin || adminSimulationActive || adminPreviewActive || !db) {
      copyTextToClipboard(code, "Student join code copied.");
      return;
    }

    setGeneratingJoinCodeId(classItem.id);
    try {
      await setDoc(doc(db, "class_join_codes", code), payload);
      copyTextToClipboard(code, "Student join code copied.");
    } catch (error) {
      console.error("Student join code create failed:", error);
      setClassJoinCodes((prev) => prev.filter((item) => item.id !== code));
      alert("That student join code could not be created. Try again.");
    } finally {
      setGeneratingJoinCodeId("");
    }
  };

  const copyClassJoinCode = (code) => {
    if (!code?.code) return;
    copyTextToClipboard(code.code, "Student join code copied.");
  };

  const revokeClassJoinCode = async (code) => {
    if (!code?.id) return;
    const now = Date.now();
    setClassJoinCodes((prev) =>
      prev.map((item) =>
        item.id === code.id ? { ...item, status: "revoked", updatedAt: now } : item
      )
    );

    if (isRootAdmin || adminSimulationActive || adminPreviewActive || !db) return;

    try {
      await setDoc(
        doc(db, "class_join_codes", code.id),
        { status: "revoked", updatedAt: now },
        { merge: true }
      );
    } catch (error) {
      console.error("Student join code revoke failed:", error);
      alert("That join code could not be closed. Try again.");
    }
  };

  const acceptTeacherInvite = async (invite) => {
    if (!invite || !currentUser) return;
    if (invite.status && invite.status !== "pending") {
      alert("This class invitation is no longer pending.");
      return;
    }
    const targetTeacherEmail = String(invite.targetTeacherEmail || "").trim().toLowerCase();
    if (targetTeacherEmail && targetTeacherEmail !== currentUser) {
      alert("This invitation is for a different teacher email address.");
      return;
    }
    if (invite.licenseId && userLicenseId && invite.licenseId !== userLicenseId) {
      alert("This invitation belongs to a different school license.");
      return;
    }
    const classRecord = {
      id: String(invite.classRecord?.id || invite.classId || "").trim().toUpperCase(),
      name: invite.classRecord?.name || invite.className || invite.classId,
      subjects: getClassSubjectIds(invite.classRecord || {}),
    };
    if (!classRecord.id) return;

    const nextClasses = teacherClasses.some((classItem) => classItem.id === classRecord.id)
      ? teacherClasses.map((classItem) =>
          classItem.id === classRecord.id ? { ...classItem, ...classRecord } : classItem
        )
      : [...teacherClasses, classRecord];
    const nextClassIds = Array.from(
      new Set([...userClassIds, ...nextClasses.map((classItem) => classItem.id)])
    );
    const nextLicenseId = invite.licenseId || userLicenseId || "";
    const now = Date.now();

    const applyAcceptedInvite = () => {
      setUserClasses(nextClasses);
      setUserClassIds(nextClassIds);
      setUserClassCode((prev) => prev || classRecord.id);
      if (nextLicenseId) setUserLicenseId(nextLicenseId);
      setActiveClassId(classRecord.id);
      setTeacherInvites((prev) => prev.filter((item) => item.id !== invite.id));
    };

    if (isRootAdmin || adminSimulationActive || adminPreviewActive || !db) {
      applyAcceptedInvite();
      return;
    }

    try {
      const acceptBatch = writeBatch(db);
      acceptBatch.set(
        doc(db, "users", currentUser),
        {
          classes: nextClasses,
          classIds: nextClassIds,
          classCode: nextClassIds[0] || classRecord.id,
          licenseId: nextLicenseId,
          lastAcceptedInviteId: invite.id,
          lastUpdated: now,
        },
        { merge: true }
      );
      acceptBatch.set(
        doc(db, "public_profiles", currentUser),
        getPublicProfilePayload({
          name: userName,
          role: userRole,
          classIds: nextClassIds,
          classCode: nextClassIds[0] || classRecord.id,
          xpTotal,
          streak,
        }),
        { merge: true }
      );
      acceptBatch.set(
        doc(db, "class_invites", invite.id),
        {
          status: "accepted",
          acceptedAt: now,
          acceptedBy: currentUser,
          updatedAt: now,
        },
        { merge: true }
      );
      await acceptBatch.commit();
      applyAcceptedInvite();
    } catch (error) {
      console.error("Teacher invite accept failed:", error);
      alert("That invite could not be accepted. Try again.");
    }
  };

  const saveClassDisplayName = async (classId) => {
    const draft = (classNameDrafts[classId] || "").trim();
    if (!classId || !draft) return;
    if (licenseStatusInfo.blocksNewWork) {
      alert("This trial has ended. Class changes are paused until the license is extended.");
      return;
    }
    if (activeLicense && !canManageActiveLicense) {
      alert("The Account Manager controls class names and subject access.");
      return;
    }

    const nextUserClasses = teacherClasses.map((classItem) =>
      classItem.id === classId ? { ...classItem, name: draft } : classItem
    );
    const nextClassIds = nextUserClasses.map((classItem) => classItem.id);
    const nextLicenseClasses = nextUserClasses.map((classItem) => ({
      ...classItem,
      seatCount: getClassSeatCount(classItem.id),
    }));

    setUserClasses(nextUserClasses);
    setActiveLicense((prev) =>
      prev ? { ...prev, classes: nextLicenseClasses, updatedAt: Date.now() } : prev
    );
    setClassNameDrafts((prev) => {
      const next = { ...prev };
      delete next[classId];
      return next;
    });

    if (isRootAdmin || adminSimulationActive || adminPreviewActive || !db || !currentUser) return;

    try {
      const writes = [
        setDoc(
          doc(db, "users", currentUser),
          { classes: nextUserClasses, classIds: nextClassIds, lastUpdated: Date.now() },
          { merge: true }
        ),
      ];
      if (activeLicense?.id) {
        writes.push(
          setDoc(
            doc(db, "licenses", activeLicense.id),
            { classes: nextLicenseClasses, updatedAt: Date.now() },
            { merge: true }
          )
        );
      }
      await Promise.all(writes);
    } catch (error) {
      console.error("Class display name update failed:", error);
      alert("That class name could not be saved. Try again.");
    }
  };

  const toggleClassSubject = async (classId, subjectId) => {
    if (!classId || !subjectId || !activeLicense) return;
    if (licenseStatusInfo.blocksNewWork) {
      alert("This trial has ended. Subject access changes are paused until the license is extended.");
      return;
    }
    if (activeLicense && !canManageActiveLicense) {
      alert("The Account Manager controls class names and subject access.");
      return;
    }
    const allowedSubjects = activeLicense.unlocked_subjects || [DEFAULT_SUBJECT_ID];
    if (!allowedSubjects.includes(subjectId)) return;

    const nextUserClasses = teacherClasses.map((classItem) => {
      if (classItem.id !== classId) return classItem;
      const currentSubjectIds = getClassSubjectIds(
        getLicenseClassRecord(classItem),
        allowedSubjects
      );
      const nextSubjectIds = currentSubjectIds.includes(subjectId)
        ? currentSubjectIds.filter((item) => item !== subjectId)
        : [...currentSubjectIds, subjectId];
      return { ...classItem, subjects: nextSubjectIds };
    });
    const nextClassIds = nextUserClasses.map((classItem) => classItem.id);

    const nextLicenseClasses = nextUserClasses.map((classItem) => ({
      ...classItem,
      seatCount: getClassSeatCount(classItem.id),
    }));

    setUserClasses(nextUserClasses);
    setActiveLicense((prev) =>
      prev ? { ...prev, classes: nextLicenseClasses, updatedAt: Date.now() } : prev
    );

    if (isRootAdmin || adminSimulationActive || adminPreviewActive || !db || !currentUser || !activeLicense.id) return;

    try {
      await Promise.all([
        setDoc(
          doc(db, "users", currentUser),
          { classes: nextUserClasses, classIds: nextClassIds, lastUpdated: Date.now() },
          { merge: true }
        ),
        setDoc(
          doc(db, "licenses", activeLicense.id),
          { classes: nextLicenseClasses, updatedAt: Date.now() },
          { merge: true }
        ),
      ]);
    } catch (error) {
      console.error("Class subject access update failed:", error);
    }
  };

  const getDraftNudgePolicy = (classItem, draftKey = classItem?.id) =>
    normalizeNudgePolicy({
      ...(getLicenseClassRecord(classItem || {})?.nudgePolicy || classItem?.nudgePolicy),
      ...(classNudgeDrafts[draftKey] || {}),
    });

  const getDraftRewardPolicy = (classItem, draftKey = classItem?.id) =>
    normalizeRewardPolicy({
      ...(getLicenseClassRecord(classItem || {})?.rewardPolicy || classItem?.rewardPolicy),
      ...(classRewardDrafts[draftKey] || {}),
    });

  const saveClassSupportPolicy = async (classId = "all") => {
    if (!classId) return;
    if (licenseStatusInfo.blocksNewWork) {
      alert("This trial has ended. Support settings are paused until the license is extended.");
      return;
    }

    const applyToAll = classId === "all";
    const sourceClass = teacherClasses[0] || createDefaultClass(currentUser || "preview");
    const sourceKey = applyToAll ? "all" : classId;
    const currentClass = applyToAll
      ? sourceClass
      : teacherClasses.find((classItem) => classItem.id === classId);
    const nextNudgePolicy = getDraftNudgePolicy(currentClass, sourceKey);
    const nextRewardPolicy = getDraftRewardPolicy(currentClass, sourceKey);
    const nextUserClasses = teacherClasses.map((classItem) =>
      applyToAll || classItem.id === classId
        ? {
            ...classItem,
            nudgePolicy: nextNudgePolicy,
            rewardPolicy: nextRewardPolicy,
          }
        : classItem
    );
    const nextClassIds = nextUserClasses.map((classItem) => classItem.id);
    const nextLicenseClasses = nextUserClasses.map((classItem) => ({
      ...classItem,
      seatCount: getClassSeatCount(classItem.id),
    }));

    setUserClasses(nextUserClasses);
    setActiveLicense((prev) =>
      prev ? { ...prev, classes: nextLicenseClasses, updatedAt: Date.now() } : prev
    );
    setClassNudgeDrafts((prev) => {
      const next = { ...prev };
      delete next[sourceKey];
      if (applyToAll) delete next.all;
      return next;
    });
    setClassRewardDrafts((prev) => {
      const next = { ...prev };
      delete next[sourceKey];
      if (applyToAll) delete next.all;
      return next;
    });

    if (isRootAdmin || adminSimulationActive || adminPreviewActive || !db || !currentUser) return;

    try {
      const writes = [
        setDoc(
          doc(db, "users", currentUser),
          { classes: nextUserClasses, classIds: nextClassIds, lastUpdated: Date.now() },
          { merge: true }
        ),
      ];
      if (activeLicense?.id) {
        writes.push(
          setDoc(
            doc(db, "licenses", activeLicense.id),
            { classes: nextLicenseClasses, updatedAt: Date.now() },
            { merge: true }
          )
        );
      }
      await Promise.all(writes);
    } catch (error) {
      console.error("Class support policy update failed:", error);
      alert("Those support settings could not be saved. Try again.");
    }
  };

  const removeStudentFromActiveClass = async (student) => {
    if (!student?.id || !activeClass?.id || !currentUser) return;
    const classId = activeClass.id;
    const previousClassIds = getStudentClassIds(student);
    if (!previousClassIds.includes(classId)) {
      alert("This student is not currently in this class.");
      return;
    }

    const now = Date.now();
    const nextClassIds = previousClassIds.filter((item) => item !== classId);
    const nextClassCode = nextClassIds[0] || "";
    const nextStudent = {
      ...student,
      classCode: nextClassCode,
      classId: nextClassCode,
      classIds: nextClassIds,
      removedFromClassId: classId,
      removedAt: now,
      removedBy: currentUser,
      lastUpdated: now,
    };

    setRemovingStudentId(student.id);
    setConfirmRemoveStudentId("");
    setAllUsersData((prev) =>
      prev.map((item) => (item.id === student.id ? nextStudent : item))
    );
    setSelectedStudentId("");

    if (isRootAdmin || adminSimulationActive || adminPreviewActive || !db) {
      setRemovingStudentId("");
      return;
    }

    try {
      const removalBatch = writeBatch(db);
      removalBatch.set(
        doc(db, "users", student.id),
        {
          classCode: nextClassCode,
          classId: nextClassCode,
          classIds: nextClassIds,
          removedFromClassId: classId,
          removedAt: now,
          removedBy: currentUser,
          lastUpdated: now,
        },
        { merge: true }
      );
      removalBatch.set(
        doc(db, "public_profiles", student.id),
        getPublicProfilePayload(nextStudent),
        { merge: true }
      );
      await removalBatch.commit();
    } catch (error) {
      console.error("Student class removal failed:", error);
      setAllUsersData((prev) =>
        prev.map((item) => (item.id === student.id ? student : item))
      );
      alert("That student could not be removed from the class. Try again.");
    } finally {
      setRemovingStudentId("");
    }
  };

  const getTopicBreakdown = (studentProgress) =>
    curriculumFlashcardData.map((chapter) => {
      const score = getSectionMastery(getCardsForChapter(chapter), studentProgress);
      return {
        id: chapter.id,
        title: chapter.title,
        score,
        status: getMasteryStatus(score),
      };
    });

  const seedMockEnvironment = () => {
    const mockClasses = [
      { id: "11Y-TEST", name: "11Y DT", subjects: [DEFAULT_SUBJECT_ID] },
      { id: "12Z-TEST", name: "12Z DT", subjects: [DEFAULT_SUBJECT_ID] },
      { id: "13A-TEST", name: "13A Product Design", subjects: [DEFAULT_SUBJECT_ID] },
    ];

    const mockStudents = [
      {
        id: "maya.11y.test@dthub.local",
        name: "Maya Patel",
        classIds: ["11Y-TEST"],
        streak: { current: 12, longest: 18, lastDate: getUTCMidnight() },
        xpTotal: 1840,
      },
      {
        id: "leo.11y.test@dthub.local",
        name: "Leo Grant",
        classIds: ["11Y-TEST"],
        streak: { current: 4, longest: 9, lastDate: getUTCMidnight() },
        xpTotal: 980,
      },
      {
        id: "nina.12z.test@dthub.local",
        name: "Nina Brooks",
        classIds: ["12Z-TEST"],
        streak: { current: 8, longest: 11, lastDate: getUTCMidnight() },
        xpTotal: 1430,
      },
      {
        id: "sam.12z.test@dthub.local",
        name: "Sam Okafor",
        classIds: ["12Z-TEST"],
        streak: { current: 1, longest: 6, lastDate: getUTCMidnight() - DAY_MS },
        xpTotal: 610,
      },
      {
        id: "ava.13a.test@dthub.local",
        name: "Ava Chen",
        classIds: ["13A-TEST"],
        streak: { current: 16, longest: 21, lastDate: getUTCMidnight() },
        xpTotal: 2210,
      },
    ].map((student, index) => ({
      ...student,
      role: "student",
      classCode: student.classIds[0],
      classId: student.classIds[0],
      activeEngagements: 40 - index * 5,
      progress: buildMockProgress(allCards, index),
      writtenProgress: {
        [curriculumWrittenData[index % curriculumWrittenData.length]?.id || "mock-written"]: {
          attempts: index + 1,
          last_score: Math.max(42, 92 - index * 9),
          timestamp: Date.now() - index * DAY_MS,
        },
      },
    }));

    const mockProgressById = mockStudents.reduce((acc, student) => {
      acc[student.id] = student.progress;
      return acc;
    }, {});

    const mockAssignments = [
      {
        id: "mock-a1",
        teacherId: ROOT_ADMIN_ID,
        classId: "11Y-TEST",
        className: "11Y DT",
        licenseId: "license-dthub-test",
        subjectId: DEFAULT_SUBJECT_ID,
        targetType: "chapter",
        targetId: curriculumFlashcardData[0]?.id || "ch1",
        targetLabel: getAssignmentLabel(
          "chapter",
          curriculumFlashcardData[0]?.id || "ch1",
          DEFAULT_SUBJECT_ID
        ),
        deadline: Date.now() + 2 * DAY_MS,
        targetMastery: 80,
        status: "active",
        completedBy: {
          "maya.11y.test@dthub.local": { completedAt: Date.now() - 3600000, mastery: 86 },
        },
        createdAt: Date.now() - DAY_MS,
        updatedAt: Date.now() - 3600000,
      },
      {
        id: "mock-a2",
        teacherId: ROOT_ADMIN_ID,
        classId: "12Z-TEST",
        className: "12Z DT",
        licenseId: "license-dthub-test",
        subjectId: DEFAULT_SUBJECT_ID,
        targetType: "essay",
        targetId: curriculumWrittenData[0]?.id || "wq_1",
        targetLabel: getAssignmentLabel(
          "essay",
          curriculumWrittenData[0]?.id || "wq_1",
          DEFAULT_SUBJECT_ID
        ),
        deadline: Date.now() + DAY_MS,
        targetMastery: 75,
        status: "active",
        completedBy: {},
        createdAt: Date.now() - 2 * DAY_MS,
        updatedAt: Date.now() - 2 * DAY_MS,
      },
    ];

    const mockLicense = {
      id: "license-dthub-test",
      school_name: "D&T Hub Test School",
      unlocked_subjects: [DEFAULT_SUBJECT_ID],
      max_classes: 5,
      max_seats_per_class: 35,
      ownerId: ROOT_ADMIN_ID,
      adminIds: [ROOT_ADMIN_ID],
      teacherIds: [],
      status: "trial",
      trialStartsAt: Date.now() - DAY_MS,
      trialEndsAt: Date.now() + 14 * DAY_MS,
      classes: mockClasses.map((classItem) => ({
        ...classItem,
        seatCount: mockStudents.filter((student) =>
          student.classIds.includes(classItem.id)
        ).length,
      })),
      updatedAt: Date.now(),
    };

    setUserName("Super Admin");
    setUserRole("admin");
    setUserClassCode("11Y-TEST");
    setUserClassIds(["11Y-TEST"]);
    setUserLicenseId(mockLicense.id);
    setActiveLicense(mockLicense);
    setUserClasses(mockClasses);
    setActiveClassId("11Y-TEST");
    setAllUsersData(mockStudents);
    setStudentProgressById(mockProgressById);
    setAssignments(mockAssignments);
    setProgress(mockStudents[0].progress);
    setWrittenProgress(mockStudents[0].writtenProgress);
    setStreak(mockStudents[0].streak);
    setXpTotal(mockStudents[0].xpTotal);
    setEngagementCount(mockStudents[0].activeEngagements);

    return { mockClasses, mockStudents, mockProgressById, mockAssignments };
  };

  const getSimulationCardLabel = (card) =>
    card?.question || card?.front || card?.term || card?.prompt || card?.id || "Revision card";

  const createSimulationCohort = () => {
    const runId = Date.now().toString(36);
    const subjectId = activeSubjectId || DEFAULT_SUBJECT_ID;
    const teacherCount = randomInt(1, 3);
    const classCount = randomInt(Math.max(2, teacherCount), Math.min(6, teacherCount * 2 + 1));
    const teacherNames = shuffleItems(SIM_TEACHER_NAMES).slice(0, teacherCount);
    const teachers = teacherNames.map((name, index) => ({
      id: `sim.teacher.${index + 1}.${runId}@dthub.local`,
      name,
      role: "teacher",
      classes: [],
      simulation: true,
    }));
    const chapterPool = curriculumFlashcardData.filter(
      (chapter) => getCardsForChapter(chapter).length > 0
    );
    const availableChapters = chapterPool.length > 0 ? chapterPool : curriculumFlashcardData;
    const classLabels = shuffleItems(SIM_CLASS_LABELS).slice(0, classCount);
    const usedNames = new Set();
    const mockClasses = [];
    const students = [];
    const progressById = {};
    const mockAssignments = [];
    const now = Date.now();
    let globalStudentIndex = 0;

    setSimulationStartedAt(now);

    const makeStudentName = () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const name = `${pickRandom(SIM_FIRST_NAMES)} ${pickRandom(SIM_LAST_NAMES)}`;
        if (!usedNames.has(name)) {
          usedNames.add(name);
          return name;
        }
      }
      const fallback = `${pickRandom(SIM_FIRST_NAMES)} ${pickRandom(SIM_LAST_NAMES)} ${usedNames.size + 1}`;
      usedNames.add(fallback);
      return fallback;
    };

    classLabels.forEach((label, classIndex) => {
      const teacher = teachers[classIndex % teachers.length];
      const classCode = label.replace(/[^A-Z0-9]+/gi, "-").replace(/^-|-$/g, "");
      const classId = `${SIM_ID_PREFIX}${classCode}-${runId.slice(-4)}${classIndex}`.toUpperCase();
      const classItem = {
        id: classId,
        name: `Simulation ${label}`,
        subjects: [subjectId],
      };
      const targetChapter =
        availableChapters[classIndex % Math.max(1, availableChapters.length)] ||
        legacyFlashcardData[0];
      const targetId = targetChapter?.id || legacyFlashcardData[0]?.id || "ch1";
      const targetLabel = getAssignmentLabel("chapter", targetId, subjectId);
      const targetCards = getCardsForChapter(targetChapter).slice(0, randomInt(12, 24));
      const classSize = randomInt(10, 30);

      teacher.classes.push(classItem);
      mockClasses.push(classItem);

      const assignment = {
        id:
          classIndex === 0
            ? SIM_ASSIGNMENT_ID
            : `sim-prep-${classId.toLowerCase()}-${runId}`,
        teacherId: teacher.id,
        classId,
        className: classItem.name,
        licenseId: "simulation-license",
        subjectId,
        targetType: "chapter",
        targetId,
        targetLabel,
        deadline: now + simulationDurationDays * DAY_MS,
        targetMastery: Math.max(70, Number(assignmentTargetMastery) || 80),
        status: "active",
        completedBy: {},
        createdAt: now,
        updatedAt: now,
        simulation: true,
      };
      mockAssignments.push(assignment);

      Array.from({ length: classSize }).forEach(() => {
        const name = makeStudentName();
        const profile =
          Math.random() < 0.16
            ? SIM_ARCHETYPES[4]
            : SIM_ARCHETYPES[randomInt(0, SIM_ARCHETYPES.length - 2)];
        const willComplete = Math.random() > profile.nonCompletionRisk;
        const plannedCompletionHour = willComplete
          ? clampValue(
              Math.round(
                simulationTotalHours *
                  (0.18 + Math.random() * 0.7) *
                  (1.12 - profile.consistency / 180)
              ),
              4,
              simulationTotalHours
            )
          : null;
        const completionResistance = willComplete
          ? profile.nonCompletionRisk
          : clampValue(profile.nonCompletionRisk + 0.24 + Math.random() * 0.14, 0.1, 0.95);
        const nudgeResponse = clampValue(
          (profile.nudgeResponse || 0.5) + (Math.random() - 0.5) * 0.22,
          0.05,
          0.95
        );
        const baseProgress = buildMockProgress(allCards, globalStudentIndex + 2);

        targetCards.forEach((card, cardIndex) => {
          const starterMastery = clampValue(
            18 + Math.round(profile.accuracy * 20) - ((globalStudentIndex + cardIndex) % 5) * 6,
            5,
            58
          );
          baseProgress[card.id] = {
            baseMastery: starterMastery,
            consecutiveCorrect: starterMastery > 45 ? 1 : 0,
            lastSeen: now - randomInt(3, 8) * DAY_MS,
            status: starterMastery > 50 ? "correct" : "incorrect",
          };
        });

        const id = `${slugifyClassName(name)}.${globalStudentIndex + 1}.${classId.toLowerCase()}@sim.dthub.local`;
        const initialXp = randomInt(60, 420);
        const earlyXp = Math.round(initialXp * (0.18 + Math.random() * 0.16));
        const middleXp = Math.max(earlyXp, Math.round(initialXp * (0.46 + Math.random() * 0.22)));
        const xpHistory = [
          {
            at: now - randomInt(32, 52) * DAY_MS,
            xpTotal: earlyXp,
            source: "simulation baseline",
          },
          {
            at: now - randomInt(11, 24) * DAY_MS,
            xpTotal: middleXp,
            source: "simulation practice",
          },
          {
            at: now,
            xpTotal: initialXp,
            source: "simulation start",
          },
        ];
        const student = {
          id,
          name,
          role: "student",
          classCode: classId,
          classId,
          classIds: [classId],
          activeEngagements: randomInt(1, 14),
          xpHistory,
          xpTotal: initialXp,
          streak: {
            current: profile.streak + randomInt(0, 2),
            longest: profile.streak + randomInt(3, 8),
            lastDate: getUTCMidnight() - (Math.random() < 0.35 ? DAY_MS : 0),
          },
          progress: baseProgress,
          writtenProgress: {},
          simulation: {
            profile: profile.label,
            plannedCompletionHour,
            accuracy: profile.accuracy,
            consistency: profile.consistency,
            motivation: profile.motivation + randomInt(-8, 8),
            pace: profile.pace,
            slackProbability: profile.slackProbability,
            nudgeResponse,
            completionResistance,
            nonCompletionRisk: profile.nonCompletionRisk,
            missedNudges: 0,
            recoveredNudges: 0,
            classId,
            className: classItem.name,
            teacherId: teacher.id,
            teacherName: teacher.name,
            targetCardIds: targetCards.map((card) => card.id),
            activityCursor: randomInt(0, Math.max(0, targetCards.length - 1)),
            activityDays: [],
            currentActivity: "Waiting for the first study window",
            currentQuestion: "No card active",
            currentCardId: "",
            isWorking: false,
            slacking: false,
            nudgeCount: 0,
            rewardCount: 0,
            lastMessage: "",
          },
        };

        students.push(student);
        progressById[id] = baseProgress;
        globalStudentIndex += 1;
      });
    });

    setAdminSimulationActive(true);
    setAdminPreviewActive(false);
    setSimulationRunning(false);
    setSimulationDay(0);
    setSimulationHour(0);
    setSimulationStartedAt(now);
    setSimulationClassFilter("all");
    setSimulatedUserId("");
    setSimulatedTeacherMode("account-manager");
    setSimulationLog([]);
    setUserClasses(mockClasses);
    setUserClassCode(mockClasses[0]?.id || SIM_CLASS_ID);
    setUserClassIds(mockClasses.map((classItem) => classItem.id));
    setActiveClassId(mockClasses[0]?.id || SIM_CLASS_ID);
    setAllUsersData([...teachers, ...students]);
    setStudentProgressById(progressById);
    setAssignments(mockAssignments);
    setActiveLicense({
      id: "simulation-license",
      school_name: "Simulation Academy Trust",
      unlocked_subjects: [subjectId],
      max_classes: Math.max(8, mockClasses.length),
      max_seats_per_class: 35,
      ownerId: ROOT_ADMIN_ID,
      adminIds: [ROOT_ADMIN_ID],
      teacherIds: teachers.map((teacher) => teacher.id),
      status: "trial",
      trialStartsAt: Date.now() - DAY_MS,
      trialEndsAt: Date.now() + 30 * DAY_MS,
      classes: mockClasses.map((classItem) => ({
        ...classItem,
        seatCount: students.filter((student) => getStudentClassIds(student).includes(classItem.id)).length,
      })),
      simulation: true,
    });
    setProgress(students[0]?.progress || {});
    setWrittenProgress({});
    setStreak(students[0]?.streak || DEFAULT_STREAK);
    setXpTotal(Math.round(students[0]?.xpTotal || 0));
    setEngagementCount(students[0]?.activeEngagements || 0);

    return { students, teachers, assignments: mockAssignments, classes: mockClasses };
  };

  const applySimulationHour = (hourValue) => {
    if (simulationStudents.length === 0) return;

    const safeHour = Math.round(clampValue(hourValue, 0, simulationTotalHours));
    const safeDay = Math.min(simulationDurationDays, Math.floor(safeHour / 24));
    const hourOfDay = safeHour % 24;
    const simulationAnchorMs = simulationStartedAt || nowMs;
    const simulatedTimestamp = simulationAnchorMs + safeHour * HOUR_MS;
    const nextProgressById = { ...studentProgressById };
    const nextAssignments = assignments.map((assignment) =>
      assignment.simulation
        ? { ...assignment, completedBy: { ...(assignment.completedBy || {}) } }
        : assignment
    );
    const getSimulationAssignmentForClass = (classId) =>
      nextAssignments
        .filter(
          (assignment) =>
            assignment.simulation &&
            assignment.classId === classId &&
            assignment.status === "active"
        )
        .sort((a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0))[0];
    const schoolHours = hourOfDay >= 8 && hourOfDay <= 16;
    const homeworkHours = hourOfDay >= 17 && hourOfDay <= 21;
    const studyWindow = schoolHours || homeworkHours;
    let activeNow = 0;

    const nextStudents = simulationStudents.map((student) => {
      const classId =
        getStudentClassIds(student).find((id) => isSimulationClassId(id)) || SIM_CLASS_ID;
      const assignment = getSimulationAssignmentForClass(classId);
      const targetCards = assignment ? getAssignmentCards(assignment) : allCards.slice(0, 24);
      const previousProgress = studentProgressById[student.id] || student.progress || {};
      const nextProgress = { ...previousProgress };
      const sim = student.simulation || {};
      const alreadyComplete = Boolean(assignment?.completedBy?.[student.id]);
      const activePrepExists = Boolean(assignment && !alreadyComplete);
      const targetMastery = assignment?.targetMastery || 80;
      const activityDays = Array.isArray(sim.activityDays) ? [...sim.activityDays] : [];
      const lastActivityDay =
        Number.isFinite(sim.lastActivityDay)
          ? sim.lastActivityDay
          : activityDays.length > 0
            ? Math.max(...activityDays)
            : -1;
      const idleDays = lastActivityDay >= 0 ? Math.max(0, safeDay - lastActivityDay) : safeDay;
      const shouldAutoNudgePrep =
        activePrepExists &&
        hourOfDay === 9 &&
        idleDays >= 2 &&
        sim.lastAutoNudgeDay !== safeDay;
      const shouldAutoNudgeRefresh =
        !activePrepExists &&
        hourOfDay === 9 &&
        idleDays >= 4 &&
        sim.lastAutoNudgeDay !== safeDay;
      const autoNudgeActive = shouldAutoNudgePrep || shouldAutoNudgeRefresh;
      const nudgeResponse = clampValue(sim.nudgeResponse ?? 0.5, 0.05, 0.95);
      const respondsToNudge = autoNudgeActive && Math.random() < nudgeResponse;
      const pressure = simulationTotalHours > 0 ? safeHour / simulationTotalHours : 0;
      const previousSupportLift = Math.min(0.12, (sim.recoveredNudges || 0) * 0.018);
      const nudgeBoost =
        previousSupportLift +
        (respondsToNudge
          ? 0.22 + nudgeResponse * 0.08
          : autoNudgeActive
            ? nudgeResponse * 0.035
            : 0);
      const rewardBoost = (sim.rewardCount || 0) * 0.025;
      const motivation = clampValue(
        (sim.motivation || 50) + (respondsToNudge ? 18 : autoNudgeActive ? 4 : 0),
        5,
        100
      );
      const consistency = clampValue(sim.consistency || 50, 5, 100);
      const slackProbability = clampValue(
        (sim.slackProbability || 0.2) -
          (respondsToNudge ? 0.15 : autoNudgeActive ? 0.02 : 0) +
          ((sim.missedNudges || 0) >= 3 ? 0.015 : 0),
        0,
        0.9
      );
      const baseWorkChance =
        consistency / 260 +
        motivation / 330 +
        pressure * 0.24 +
        nudgeBoost +
        rewardBoost +
        (schoolHours ? 0.09 : 0) +
        (homeworkHours ? 0.05 : 0) -
        slackProbability * 0.26;
      const plannedPush =
        sim.plannedCompletionHour &&
        safeHour >= sim.plannedCompletionHour &&
        Math.random() < 0.34;
      const nudgeRecoveryPush =
        respondsToNudge &&
        studyWindow &&
        Math.random() < clampValue(0.55 + nudgeResponse * 0.35, 0.2, 0.95);
      const isWorking =
        !alreadyComplete &&
        studyWindow &&
        (Math.random() < clampValue(baseWorkChance, 0.04, 0.93) ||
          plannedPush ||
          nudgeRecoveryPush);
      const isReviewing =
        alreadyComplete && studyWindow && Math.random() < 0.08 + rewardBoost;
      const slacking =
        !alreadyComplete && studyWindow && !isWorking && Math.random() < slackProbability;
      let currentActivity = alreadyComplete
        ? pickRandom(SIM_REVIEW_LABELS)
        : studyWindow
          ? "Dashboard open, deciding what to do"
          : "Offline between study windows";
      let currentQuestion = alreadyComplete ? "Assignment already complete" : "No card active";
      let currentCardId = "";
      let touchedCount = 0;
      let correctCount = 0;
      let nextCursor = sim.activityCursor || 0;
      let nextNudgeCount = (sim.nudgeCount || 0) + (autoNudgeActive ? 1 : 0);
      let nextRewardCount = sim.rewardCount || 0;
      let nextMissedNudges =
        (sim.missedNudges || 0) + (autoNudgeActive && !respondsToNudge ? 1 : 0);
      let nextRecoveredNudges =
        (sim.recoveredNudges || 0) + (respondsToNudge ? 1 : 0);
      let nextMotivation = motivation;
      let nextSlackProbability = slackProbability;
      let lastMessage = sim.lastMessage || "";
      let lastAutoNudgeDay = sim.lastAutoNudgeDay;
      let lastAutoRewardStreak = sim.lastAutoRewardStreak;

      if (shouldAutoNudgePrep) {
        lastAutoNudgeDay = safeDay;
        lastMessage = respondsToNudge
          ? `Auto nudge helped: started after ${idleDays} idle days`
          : `Auto nudge sent: ${idleDays} idle days with an assignment due`;
      } else if (shouldAutoNudgeRefresh) {
        lastAutoNudgeDay = safeDay;
        lastMessage = respondsToNudge
          ? `Auto nudge helped: returned to refresh after ${idleDays} idle days`
          : `Auto nudge sent: ${idleDays} idle days, refresh suggested`;
      }

      if ((isWorking || isReviewing) && targetCards.length > 0) {
        const cardTouches = randomInt(1, Math.max(1, Math.round(3 * (sim.pace || 1))));
        activeNow += 1;
        currentActivity = nudgeRecoveryPush
          ? "Responding to automatic reminder"
          : isReviewing
            ? pickRandom(SIM_REVIEW_LABELS)
            : pickRandom(SIM_ACTIVITY_LABELS);

        Array.from({ length: cardTouches }).forEach(() => {
          const card = targetCards[nextCursor % targetCards.length];
          if (!card) return;
          const previous = nextProgress[card.id] || {
            baseMastery: randomInt(12, 42),
            consecutiveCorrect: 0,
            lastSeen: simulatedTimestamp - randomInt(2, 8) * DAY_MS,
            status: "incorrect",
          };
          const wasCorrect =
            Math.random() <
            clampValue((sim.accuracy || 0.7) + nudgeBoost / 2 + rewardBoost, 0.12, 0.98);
          const masteryDelta = wasCorrect ? randomInt(8, 16) : randomInt(1, 5);
          const mastery = clampValue(
            (previous.baseMastery || 0) + masteryDelta - (wasCorrect ? 0 : randomInt(0, 3)),
            5,
            100
          );

          nextProgress[card.id] = {
            baseMastery: mastery,
            consecutiveCorrect: wasCorrect
              ? (previous.consecutiveCorrect || 0) + 1
              : Math.max(0, (previous.consecutiveCorrect || 0) - 1),
            lastSeen: simulatedTimestamp,
            status: wasCorrect ? "correct" : "incorrect",
          };

          currentQuestion = getSimulationCardLabel(card);
          currentCardId = card.id;
          touchedCount += 1;
          if (wasCorrect) correctCount += 1;
          nextCursor += 1;
        });
      } else if (slacking) {
        currentActivity =
          autoNudgeActive && !respondsToNudge
            ? "Reminder seen, still not started"
            : Math.random() < 0.5
              ? "Opened the app but did not answer"
              : "Ignoring active assignment";
      }

      const mastery = assignment
        ? getAssignmentMastery(assignment, nextProgress, student.writtenProgress || {})
        : 0;
      if (
        assignment &&
        !alreadyComplete &&
        mastery >= targetMastery &&
        safeHour > 0 &&
        Math.random() > (sim.completionResistance ?? sim.nonCompletionRisk ?? 0)
      ) {
        assignment.completedBy[student.id] = {
          completedAt: simulatedTimestamp,
          mastery,
          simDay: Math.max(1, Math.ceil(safeHour / 24)),
          simHour: safeHour,
        };
        currentActivity = "Reached target mastery";
        currentQuestion = `${assignment.targetLabel} target met`;
      }

      if ((isWorking || isReviewing) && !activityDays.includes(safeDay)) {
        activityDays.push(safeDay);
      }
      let consecutiveDays = 0;
      for (let day = safeDay; activityDays.includes(day); day -= 1) {
        consecutiveDays += 1;
      }
      const previousStreak = student.streak || DEFAULT_STREAK;
      const nextStreak =
        touchedCount > 0 || isReviewing
          ? {
              current: Math.max(previousStreak.current || 0, consecutiveDays),
              longest: Math.max(previousStreak.longest || 0, consecutiveDays),
              lastDate: simulatedTimestamp,
            }
          : previousStreak;
      const shouldAutoReward =
        nextStreak.current >= 5 &&
        nextStreak.current !== lastAutoRewardStreak &&
        (touchedCount > 0 || isReviewing);
      if (shouldAutoReward) {
        nextRewardCount += 1;
        nextMotivation = clampValue(nextMotivation + 6, 1, 100);
        lastAutoRewardStreak = nextStreak.current;
        lastMessage = `Rewarded: well done on ${nextStreak.current} days, keep it up`;
      }
      const accuracyMultiplier =
        touchedCount > 0 ? Math.max(0.4, correctCount / touchedCount) : 0;
      const xpEarned =
        touchedCount > 0
          ? Math.round(
              (BASE_XP.flashcard * touchedCount * accuracyMultiplier) *
                (1 + 0.05 * (previousStreak.current || 0))
            )
          : 0;
      const rewardXp = shouldAutoReward ? 25 + nextStreak.current * 5 : 0;
      const xpDelta = xpEarned + rewardXp;
      const nextXpTotal = Math.round((student.xpTotal || 0) + xpDelta);
      const previousXpHistory = Array.isArray(student.xpHistory) ? student.xpHistory : [];
      const shouldSampleXp =
        (xpDelta > 0 && safeHour % 6 === 0) ||
        safeHour % 24 === 0 ||
        safeHour >= simulationTotalHours;
      const nextXpHistory = shouldSampleXp
        ? [
            ...previousXpHistory,
            {
              at: simulatedTimestamp,
              earned: xpDelta,
              source: xpDelta > 0 ? "simulation activity" : "daily checkpoint",
              xpTotal: nextXpTotal,
            },
          ].slice(-180)
        : previousXpHistory;

      nextProgressById[student.id] = nextProgress;
      return {
        ...student,
        activeEngagements: (student.activeEngagements || 0) + touchedCount,
        xpHistory: nextXpHistory,
        xpTotal: nextXpTotal,
        streak: nextStreak,
        progress: nextProgress,
        simulation: {
          ...sim,
          activityCursor: nextCursor,
          activityDays,
          lastActivityDay:
            touchedCount > 0 || isReviewing ? safeDay : lastActivityDay,
          currentActivity,
          currentQuestion,
          currentCardId,
          isWorking: isWorking || isReviewing,
          slacking,
          motivation: nextMotivation,
          slackProbability: nextSlackProbability,
          nudgeResponse,
          missedNudges: nextMissedNudges,
          recoveredNudges: nextRecoveredNudges,
          completionResistance: sim.completionResistance ?? sim.nonCompletionRisk ?? 0,
          nudgeCount: nextNudgeCount,
          rewardCount: nextRewardCount,
          lastAutoNudgeDay,
          lastAutoRewardStreak,
          lastMessage,
          lastHour: safeHour,
        },
      };
    });

    const nextStudentMap = nextStudents.reduce((acc, student) => {
      acc[student.id] = student;
      return acc;
    }, {});
    const completed = nextAssignments.reduce(
      (count, assignment) =>
        assignment.simulation
          ? count + Object.keys(assignment.completedBy || {}).length
          : count,
      0
    );
    const averageMastery =
      nextStudents.length > 0
        ? Math.round(
            nextStudents.reduce((sum, student) => {
              const classId =
                getStudentClassIds(student).find((id) => isSimulationClassId(id)) ||
                SIM_CLASS_ID;
              const assignment = getSimulationAssignmentForClass(classId);
              return (
                sum +
                (assignment
                  ? getAssignmentMastery(
                      assignment,
                      nextProgressById[student.id],
                      student.writtenProgress || {}
                    )
                  : 0)
              );
            }, 0) / nextStudents.length
          )
        : 0;
    const atRisk = nextStudents.filter((student) => {
      const classId =
        getStudentClassIds(student).find((id) => isSimulationClassId(id)) || SIM_CLASS_ID;
      const assignment = getSimulationAssignmentForClass(classId);
      return (
        assignment &&
        !isAssignmentCompletedBy(assignment, student.id) &&
        getAssignmentMastery(assignment, nextProgressById[student.id], {}) < 70
      );
    }).length;

    setSimulationHour(safeHour);
    setSimulationDay(safeDay);
    setAllUsersData((prev) =>
      prev.map((user) => (nextStudentMap[user.id] ? nextStudentMap[user.id] : user))
    );
    setStudentProgressById(nextProgressById);
    setAssignments(nextAssignments);
    setProgress(nextStudents[0]?.progress || {});
    setXpTotal(Math.round(nextStudents[0]?.xpTotal || 0));
    setEngagementCount(nextStudents[0]?.activeEngagements || 0);
    setSimulationLog((prev) =>
      [
        ...prev.filter((entry) => entry.hour !== safeHour),
        {
          hour: safeHour,
          hourOfDay,
          day: safeDay,
          completed,
          total: nextStudents.length,
          averageMastery,
          activeNow,
          atRisk,
        },
      ].sort((a, b) => a.hour - b.hour)
    );
  };

  const stepSimulationHour = () => {
    if (simulationStudents.length === 0) {
      createSimulationCohort();
      return;
    }
    const nextHour = Math.min(simulationTotalHours, simulationHour + 1);
    applySimulationHour(nextHour);
    if (nextHour >= simulationTotalHours) setSimulationRunning(false);
  };

  const toggleSimulationRun = () => {
    if (
      simulationStudents.length === 0 ||
      simulationHour >= simulationTotalHours
    ) {
      createSimulationCohort();
    }
    setSimulationRunning((prev) => !prev);
  };

  const resetSimulation = () => {
    if (simulationTimerRef.current) {
      clearTimeout(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    createSimulationCohort();
    setSimulationRunning(false);
  };

  const nudgeSimulationStudent = (studentId) => {
    setAllUsersData((prev) =>
      prev.map((student) => {
        if (student.id !== studentId || student.role !== "student") return student;
        const sim = student.simulation || {};
        return {
          ...student,
          simulation: {
            ...sim,
            motivation: clampValue((sim.motivation || 50) + 12, 1, 100),
            slackProbability: clampValue((sim.slackProbability || 0.2) - 0.06, 0.02, 0.9),
            nudgeCount: (sim.nudgeCount || 0) + 1,
            lastMessage: "Nudged: reminder sent to restart active assignment",
          },
        };
      })
    );
  };

  const rewardSimulationStudent = (studentId) => {
    setAllUsersData((prev) =>
      prev.map((student) => {
        if (student.id !== studentId || student.role !== "student") return student;
        const sim = student.simulation || {};
        const currentStreak = student.streak?.current || 0;
        return {
          ...student,
          xpTotal: Math.round((student.xpTotal || 0) + 45 + currentStreak * 5),
          simulation: {
            ...sim,
            motivation: clampValue((sim.motivation || 50) + 7, 1, 100),
            rewardCount: (sim.rewardCount || 0) + 1,
            lastMessage:
              currentStreak >= 5
                ? `Rewarded: well done on ${currentStreak} days, keep it up`
                : "Rewarded: positive feedback sent",
          },
        };
      })
    );
  };

  const sendStudentNudge = async (student, reason = "manual", options = {}) => {
    if (!student?.id) return false;
    const incompleteAssignments = getIncompleteAssignmentsForStudent(student);
    const hasIncompletePrep = incompleteAssignments.length > 0;
    const assignmentCountText = `${incompleteAssignments.length} assignment${
      incompleteAssignments.length === 1 ? "" : "s"
    }`;
    const message =
      reason === "inactive-study"
        ? "You have not studied for a little while. Try Refresh to reduce memory decay and keep your streak moving."
        : reason === "streak-risk"
          ? "Your streak is close to resetting. Open the app and complete a quick study task to keep it alive."
          : reason === "incomplete-assignment" && hasIncompletePrep
            ? `Reminder: you have ${assignmentCountText} active. Open Active Assignments and finish ${incompleteAssignments.length === 1 ? "it" : "them"}.`
            : reason === "assignment-overdue" && hasIncompletePrep
              ? `You have ${assignmentCountText} overdue. Open Active Assignments and complete ${incompleteAssignments.length === 1 ? "it" : "them"} as soon as you can.`
              : null;
    const fallbackMessage =
      reason === "low-mastery" && hasIncompletePrep
        ? `Your assignment is incomplete and your mastery needs a refresh. Please open Active Assignments and work through ${incompleteAssignments.length === 1 ? "it" : "your tasks"}.`
        : reason === "low-mastery"
          ? "Your mastery has dipped. Please do a short refresh packet to rebuild it."
          : hasIncompletePrep
            ? `Reminder: your assignment is incomplete. Please open Active Assignments and finish ${incompleteAssignments.length === 1 ? "it" : "your tasks"}.`
            : "Quick reminder: do a short refresh packet to keep your memory strong.";
    const nudgeMessage = message || fallbackMessage;

    if (adminSimulationActive) {
      nudgeSimulationStudent(student.id);
      return true;
    }

    const nudgePayload = {
      targetUserId: student.id,
      targetName: student.name || student.id,
      classId: activeClass?.id || getStudentClassIds(student)[0] || "",
      className: activeClass?.name || "",
      teacherId: currentUser || ROOT_ADMIN_ID,
      teacherName: userName || "Teacher",
      message: nudgeMessage,
      reason: hasIncompletePrep ? "incomplete-prep" : reason,
      assignmentIds: incompleteAssignments.map((assignment) => assignment.id),
      status: "unread",
      createdAt: Date.now(),
    };

    setAllUsersData((prev) =>
      prev.map((user) =>
        user.id === student.id
          ? { ...user, lastNudge: nudgePayload }
          : user
      )
    );

    if (adminPreviewActive || isRootAdmin || !db || !currentUser) {
      if (!options.silent) alert(`Nudge prepared for ${student.name || student.id}.`);
      return true;
    }

    try {
      await setDoc(doc(collection(db, "nudges")), nudgePayload);
      if (!options.silent) alert(`Nudge sent to ${student.name || student.id}.`);
      return true;
    } catch (error) {
      console.error("Teacher nudge failed:", error);
      if (!options.silent) alert("That nudge could not be sent. Try again.");
      return false;
    }
  };

  const sendStudentReward = async (student, message = "", options = {}) => {
    if (!student?.id) return false;

    if (adminSimulationActive) {
      rewardSimulationStudent(student.id);
      return true;
    }

    const currentStreak = student.streak?.current || 0;
    const rewardPayload = {
      targetUserId: student.id,
      targetName: student.name || student.id,
      classId: activeClass?.id || getStudentClassIds(student)[0] || "",
      className: activeClass?.name || "",
      teacherId: currentUser || ROOT_ADMIN_ID,
      teacherName: userName || "Teacher",
      message:
        message ||
        (currentStreak >= 5
          ? `Well done on your ${currentStreak} day streak. Keep it up.`
          : "Great work. Your recent progress is stronger than usual, keep going."),
      reason: "positive-reward",
      assignmentIds: [],
      status: "unread",
      createdAt: Date.now(),
    };

    setAllUsersData((prev) =>
      prev.map((user) =>
        user.id === student.id
          ? { ...user, lastNudge: rewardPayload }
          : user
      )
    );

    if (adminPreviewActive || isRootAdmin || !db || !currentUser) {
      if (!options.silent) alert(`Reward prepared for ${student.name || student.id}.`);
      return true;
    }

    try {
      await setDoc(doc(collection(db, "nudges")), rewardPayload);
      if (!options.silent) alert(`Reward sent to ${student.name || student.id}.`);
      return true;
    } catch (error) {
      console.error("Teacher reward failed:", error);
      if (!options.silent) alert("That reward could not be sent. Try again.");
      return false;
    }
  };

  const markNudgeRead = async (nudge) => {
    if (!nudge?.id) return;
    setNudges((prev) =>
      prev.map((item) =>
        item.id === nudge.id ? { ...item, status: "read", readAt: Date.now() } : item
      )
    );

    if (adminPreviewActive || adminSimulationActive || !db || !currentUser) return;

    try {
      await setDoc(
        doc(db, "nudges", nudge.id),
        { status: "read", readAt: Date.now() },
        { merge: true }
      );
    } catch (error) {
      console.error("Nudge read update failed:", error);
    }
  };

  const copySimulationData = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(simulationCsv).then(
        () => alert("Simulation data copied."),
        () => alert("Could not copy automatically. Select the table text instead.")
      );
      return;
    }
    alert("Select the table text and copy it manually.");
  };

  const copyTextToClipboard = (text, successMessage) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => alert(successMessage),
        () => alert("Could not copy automatically. Select and copy the text manually.")
      );
      return;
    }
    alert("Clipboard access is not available in this browser.");
  };

  const getAssignmentLink = (assignment) => {
    if (!assignment?.id || typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("assignment", assignment.id);
    return url.toString();
  };

  const copyAssignmentLink = (assignment) => {
    const link = getAssignmentLink(assignment);
    if (!link) {
      alert("Could not create a link for this assignment.");
      return;
    }
    copyTextToClipboard(link, "Assignment link copied.");
  };

  const buildParentsEveningReportText = (
    student,
    review,
    supportState,
    topicBreakdown = []
  ) => {
    if (!student || !review) return "";
    const topicLines = topicBreakdown
      .map((topic) => `- ${topic.title}: ${topic.status} (${topic.score}%)`)
      .join("\n");

    return [
      `D&T Hub Parents' Evening Snapshot`,
      `Student: ${student.name || student.id}`,
      `Status: ${review.statusLabel}`,
      `XP: ${review.studentXp.toLocaleString()} / ${review.targetXp.toLocaleString()} target`,
      `Pace: ${review.paceLabel}`,
      `Current streak: ${review.streakDays} days`,
      `Assignments completed on time: ${review.onTimeAssignments}`,
      `Assignments completed late: ${review.lateAssignments}`,
      `Assignments not completed: ${review.missedAssignments}`,
      supportState
        ? `Automated support: ${supportState.statusLabel} (${supportState.assignmentOverview.label}${
            supportState.assignmentOverview.detail
              ? `, ${supportState.assignmentOverview.detail}`
              : ""
          })`
        : "",
      topicLines ? `\nTopic Breakdown:\n${topicLines}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const copyParentsEveningReport = (student, review, supportState, topicBreakdown) => {
    const report = buildParentsEveningReportText(
      student,
      review,
      supportState,
      topicBreakdown
    );
    if (!report) {
      alert("No report is available for this student yet.");
      return;
    }
    copyTextToClipboard(report, "Parents' evening report copied.");
  };

  useEffect(() => {
    if (!simulationRunning) return undefined;
    if (simulationHour >= simulationTotalHours) {
      setSimulationRunning(false);
      return undefined;
    }

    const delay = Math.max(1, Math.round(HOUR_MS / Math.max(1, simulationSpeed || 1)));
    simulationTimerRef.current = setTimeout(() => {
      stepSimulationHour();
    }, delay);

    return () => {
      if (simulationTimerRef.current) {
        clearTimeout(simulationTimerRef.current);
        simulationTimerRef.current = null;
      }
    };
  }, [
    simulationAssignments.length,
    simulationHour,
    simulationRunning,
    simulationSpeed,
    simulationStudents.length,
    simulationTotalHours,
  ]);

  useEffect(() => {
    if (!adminSimulationActive || userRole !== "student" || !simulatedUserId) return;
    const student = allUsersData.find((user) => user.id === simulatedUserId);
    if (!student) return;

    setUserName(`${student.name || "Student"} (Simulated)`);
    setUserClassCode(getStudentClassIds(student)[0] || "11Y-TEST");
    setUserClassIds(getStudentClassIds(student));
    setProgress(studentProgressById[student.id] || student.progress || {});
    setWrittenProgress(student.writtenProgress || {});
    setStreak(student.streak || DEFAULT_STREAK);
    setXpTotal(Math.round(student.xpTotal || 0));
    setEngagementCount(student.activeEngagements || 0);
  }, [
    adminSimulationActive,
    allUsersData,
    simulatedUserId,
    studentProgressById,
    userRole,
  ]);

  const simulateStudentDashboard = () => {
    const seeded = simulationStudents.length === 0 ? createSimulationCohort() : null;
    setAdminSimulationActive(true);
    setAdminPreviewActive(false);
    const sourceUsers =
      seeded?.students ||
      (simulationStudents.length > 0
        ? simulationStudents
        : allUsersData.filter((user) =>
            getStudentClassIds(user).some((classId) => isSimulationClassId(classId))
          ));
    const mockStudent =
      sourceUsers.find(
        (user) =>
          user.role === "student" &&
          (simulationClassFilter === "all" ||
            getStudentClassIds(user).includes(simulationClassFilter))
      ) ||
      sourceUsers.find((user) => user.role === "student");

    if (mockStudent) {
      setSimulatedUserId(mockStudent.id);
      setUserName(`${mockStudent.name} (Simulated)`);
      setUserRole("student");
      setUserClassCode(getStudentClassIds(mockStudent)[0] || "11Y-TEST");
      setUserClassIds(getStudentClassIds(mockStudent));
      setProgress(mockStudent.progress || {});
      setWrittenProgress(mockStudent.writtenProgress || {});
      setStreak(mockStudent.streak || DEFAULT_STREAK);
      setXpTotal(Math.round(mockStudent.xpTotal || 0));
      setEngagementCount(mockStudent.activeEngagements || 0);
    }

    setView("menu");
  };

  const simulateTeacherDashboard = () => {
    const seeded = simulationStudents.length === 0 ? createSimulationCohort() : null;
    setAdminSimulationActive(true);
    setAdminPreviewActive(false);
    setSimulatedTeacherMode("teacher");
    setUserName(`${adminProfile?.name || "Admin"} (Shared Teacher Simulator)`);
    setUserRole("teacher");
    setSimulatedUserId("");
    setActiveClassId(
      simulationClassFilter !== "all"
        ? simulationClassFilter
        : seeded?.classes?.[0]?.id || simulationClasses[0]?.id || SIM_CLASS_ID
    );
    setView("teacher-dashboard");
  };

  const simulateAccountManagerDashboard = () => {
    const seeded = simulationStudents.length === 0 ? createSimulationCohort() : null;
    setAdminSimulationActive(true);
    setAdminPreviewActive(false);
    setSimulatedTeacherMode("account-manager");
    setUserName(`${adminProfile?.name || "Admin"} (Account Manager Simulator)`);
    setUserRole("teacher");
    setSimulatedUserId("");
    setActiveClassId(
      simulationClassFilter !== "all"
        ? simulationClassFilter
        : seeded?.classes?.[0]?.id || simulationClasses[0]?.id || SIM_CLASS_ID
    );
    setView("teacher-dashboard");
  };

  const previewTeacherDashboard = () => {
    const seeded = allUsersData.length === 0 || teacherClasses.length === 0
      ? seedMockEnvironment()
      : null;
    const classes = seeded?.mockClasses || teacherClasses;
    setAdminSimulationActive(false);
    setAdminPreviewActive(true);
    setSimulationRunning(false);
    setSimulationTeacherToolsVisible(false);
    setSimulatedTeacherMode("teacher");
    setUserName(`${adminProfile?.name || "Admin"} (Shared Teacher Preview)`);
    setUserRole("teacher");
    setSimulatedUserId("");
    setActiveClassId(classes[0]?.id || "11Y-TEST");
    setView("teacher-dashboard");
  };

  const previewAccountManagerDashboard = () => {
    const seeded = allUsersData.length === 0 || teacherClasses.length === 0
      ? seedMockEnvironment()
      : null;
    const classes = seeded?.mockClasses || teacherClasses;
    setAdminSimulationActive(false);
    setAdminPreviewActive(true);
    setSimulationRunning(false);
    setSimulationTeacherToolsVisible(false);
    setSimulatedTeacherMode("account-manager");
    setUserName(`${adminProfile?.name || "Admin"} (Account Manager Preview)`);
    setUserRole("teacher");
    setSimulatedUserId("");
    setActiveClassId(classes[0]?.id || "11Y-TEST");
    setView("teacher-dashboard");
  };

  const previewStudentDashboard = () => {
    const seeded = allUsersData.length === 0 ? seedMockEnvironment() : null;
    const students =
      seeded?.mockStudents || allUsersData.filter((user) => user.role === "student");
    const student = students[0];
    setAdminSimulationActive(false);
    setAdminPreviewActive(true);
    setSimulationRunning(false);
    setSimulationTeacherToolsVisible(false);

    if (student) {
      setSimulatedUserId(student.id);
      setUserName(`${student.name || "Student"} (Preview)`);
      setUserRole("student");
      setUserClassCode(getStudentClassIds(student)[0] || "11Y-TEST");
      setUserClassIds(getStudentClassIds(student));
      setProgress(student.progress || {});
      setWrittenProgress(student.writtenProgress || {});
      setStreak(student.streak || DEFAULT_STREAK);
      setXpTotal(Math.round(student.xpTotal || 0));
      setEngagementCount(student.activeEngagements || 0);
    }

    setView("menu");
  };

  const returnToAdminControl = () => {
    setUserName(adminProfile?.name || (isRootAdmin ? "Super Admin" : "Admin"));
    setUserRole("admin");
    setActiveAssignmentId("");
    setSelectedStudentId("");
    setSimulatedUserId("");
    setSimulatedTeacherMode("account-manager");
    if (adminSimulationActive) {
      setView("admin-simulation");
      return;
    }
    setAdminSimulationActive(false);
    setAdminPreviewActive(false);
    setView(isRootAdmin ? "admin-control" : "admin-simulation");
  };

  const recordEngagement = async (type, metadata = {}) => {
    setEngagementCount((prev) => prev + 1);
    if (
      !currentUser ||
      currentUser === ROOT_ADMIN_ID ||
      adminSimulationActive ||
      !db ||
      !isHydrated
    ) return;

    try {
      await setDoc(
        doc(db, "users", currentUser),
        {
          activeEngagements: increment(1),
          lastEngagementAt: Date.now(),
          lastEngagementType: type,
          lastEngagementMeta: metadata,
          lastUpdated: Date.now(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Engagement write failed:", error);
    }
  };

  const awardXP = async (baseValue, accuracyMultiplier = 1, source = "task") => {
    const safeAccuracy = Math.max(0, Math.min(1.5, accuracyMultiplier || 0));
    const activeStreak = streak.current || 0;
    const earned = Math.round(baseValue * safeAccuracy * (1 + 0.05 * activeStreak));

    if (earned <= 0) return 0;
    setXpTotal((prev) => prev + earned);

    if (
      !currentUser ||
      currentUser === ROOT_ADMIN_ID ||
      adminSimulationActive ||
      !db ||
      !isHydrated
    ) return earned;

    try {
      await Promise.all([
        setDoc(
          doc(db, "users", currentUser),
          {
            xpTotal: increment(earned),
            lastXP: { earned, source, at: Date.now() },
            lastUpdated: Date.now(),
          },
          { merge: true }
        ),
        setDoc(
          doc(db, "public_profiles", currentUser),
          {
            name: userName || currentUser,
            role: userRole || "student",
            classId: studentClassIds[0] || userClassCode || "",
            classIds: studentClassIds,
            xpTotal: increment(earned),
            streak: {
              current: Math.max(0, Math.round(streak.current || 0)),
              longest: Math.max(0, Math.round(streak.longest || 0)),
            },
            updatedAt: Date.now(),
          },
          { merge: true }
        ),
      ]);
    } catch (error) {
      console.error("XP write failed:", error);
    }

    return earned;
  };

  const markAssignmentComplete = async (assignment, mastery) => {
    const completionUserId =
      adminSimulationActive && simulatedUserId ? simulatedUserId : currentUser;
    if (!assignment || !completionUserId || isAssignmentCompletedBy(assignment, completionUserId)) return;

    const nextCompletedBy = {
      ...getAssignmentCompletionMap(assignment),
      [completionUserId]: {
        completedAt: Date.now(),
        mastery: Math.round(mastery),
        userId: completionUserId,
      },
    };

    if (isRootAdmin || adminSimulationActive) {
      setAssignments((prev) =>
        prev.map((item) =>
          item.id === assignment.id
            ? { ...item, completedBy: nextCompletedBy, updatedAt: Date.now() }
            : item
        )
      );
      if (adminSimulationActive && simulatedUserId) {
        setAllUsersData((prev) =>
          prev.map((user) =>
            user.id === simulatedUserId
              ? {
                  ...user,
                  xpTotal: Math.round(
                    (user.xpTotal || 0) +
                      BASE_XP.assignment * Math.max(1, mastery / 100)
                  ),
                }
              : user
          )
        );
      }
      await awardXP(BASE_XP.assignment, Math.max(1, mastery / 100), "assignment");
      setActiveAssignmentId("");
      return;
    }

    if (db && currentUser !== ROOT_ADMIN_ID && !adminSimulationActive) {
      const completionPayload = {
        userId: completionUserId,
        userName: userName || completionUserId,
        classId: assignment.classId,
        className: assignment.className || "",
        mastery: Math.round(mastery),
        targetMastery: assignment.targetMastery || 80,
        completedAt: Date.now(),
        status: "complete",
      };
      setAssignmentCompletionMaps((prev) => ({
        ...prev,
        [assignment.id]: {
          ...(prev[assignment.id] || {}),
          [completionUserId]: completionPayload,
        },
      }));
      try {
        await setDoc(
          doc(db, "assignments", assignment.id, "completions", completionUserId),
          completionPayload,
          { merge: true }
        );
      } catch (error) {
        console.error("Assignment completion write failed:", error);
      }
    }

    await awardXP(BASE_XP.assignment, Math.max(1, mastery / 100), "assignment");
    setActiveAssignmentId("");
  };

  const loadAssignment = (assignment) => {
    if (!assignment) return;
    setActiveAssignmentId(assignment.id);
    if (assignment.subjectId) setActiveSubjectId(assignment.subjectId);
    setQuizType("assignment");

    if (assignment.targetType === "essay") {
      setQuizQueue([assignment.targetId]);
      setView("written-session");
      return;
    }

    const dueCards = getAssignmentCards(assignment).filter(
      (card) => calculateMastery(card.id) < (assignment.targetMastery || 80)
    );
    const cards = dueCards.length > 0 ? dueCards : getAssignmentCards(assignment);
    setQuizQueue(cards.map((card) => card.id));
    setView("quiz-session");
  };

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !isHydrated ||
      userRole === "teacher" ||
      assignments.length === 0 ||
      studentClassIds.length === 0
    ) {
      return undefined;
    }

    const params = new URLSearchParams(window.location.search);
    const assignmentId = params.get("assignment");
    if (!assignmentId || assignmentLinkHandledRef.current === assignmentId) {
      return undefined;
    }

    const linkedAssignment = assignments.find(
      (assignment) =>
        assignment.id === assignmentId &&
        assignment.status === "active" &&
        studentClassIds.includes(assignment.classId)
    );
    if (!linkedAssignment) return undefined;

    assignmentLinkHandledRef.current = assignmentId;
    loadAssignment(linkedAssignment);
    window.history.replaceState({}, "", window.location.pathname);
    return undefined;
  }, [assignments, isHydrated, studentClassIds, userRole]);

  const createClass = async () => {
    const name = newClassName.trim();
    if (!name || !currentUser) return;
    if (userRole === "teacher" && !activeLicense && !isRootAdmin && !adminSimulationActive) {
      alert("Sign up with a one-time pilot invite code before adding classes.");
      return;
    }
    if (licenseStatusInfo.blocksNewWork) {
      alert("This trial has ended. New classes are paused until the license is extended.");
      return;
    }
    if (activeLicense && !canManageActiveLicense) {
      alert("The Account Manager controls creating new classes.");
      return;
    }

    if (
      activeLicense?.max_classes &&
      teacherClasses.length >= activeLicense.max_classes
    ) {
      alert(`This license allows ${activeLicense.max_classes} classes.`);
      return;
    }

    const id = `${slugifyClassName(name)}-${Date.now().toString(36).slice(-5)}`.toUpperCase();
    const defaultSubjects = licenseSubjectIds.includes(activeSubjectId)
      ? [activeSubjectId]
      : licenseSubjectIds;
    const defaultSupportClass = teacherClasses[0] || {};
    const nextClass = {
      id,
      name,
      subjects: defaultSubjects,
      nudgePolicy: normalizeNudgePolicy(defaultSupportClass.nudgePolicy),
      rewardPolicy: normalizeRewardPolicy(defaultSupportClass.rewardPolicy),
    };
    const nextClasses = [...teacherClasses, nextClass];
    const nextClassIds = nextClasses.map((classItem) => classItem.id);
    const nextLicenseClasses = nextClasses.map((classItem) => ({
      ...classItem,
      seatCount: getClassSeatCount(classItem.id),
    }));

    setUserClasses(nextClasses);
    setActiveLicense((prev) =>
      prev ? { ...prev, classes: nextLicenseClasses, updatedAt: Date.now() } : prev
    );
    setActiveClassId(id);
    setNewClassName("");

    if (isRootAdmin || adminSimulationActive) return;
    if (!db) return;

    try {
      const writes = [
        setDoc(
          doc(db, "users", currentUser),
          { classes: nextClasses, classIds: nextClassIds, lastUpdated: Date.now() },
          { merge: true }
        ),
      ];
      if (activeLicense?.id) {
        writes.push(
          setDoc(
            doc(db, "licenses", activeLicense.id),
            { classes: nextLicenseClasses, updatedAt: Date.now() },
            { merge: true }
          )
        );
      }
      await Promise.all(writes);
    } catch (error) {
      console.error("Class create failed:", error);
    }
  };

  const selectAssignmentTarget = (targetType, targetId) => {
    setAssignmentTargetType(targetType);
    setAssignmentTargetId(targetId);
  };

  const createAssignment = async () => {
    if (!currentUser || !activeClass?.id || !assignmentTargetId) return;
    if (licenseStatusInfo.blocksNewWork) {
      alert("This trial has ended. New assignments are paused until the license is extended.");
      return;
    }
    const deadline = new Date(assignmentDeadline).getTime();
    if (!Number.isFinite(deadline)) {
      alert("Choose a valid deadline.");
      return;
    }

    const targetMastery = Math.max(1, Math.min(100, Number(assignmentTargetMastery) || 80));
    const payload = {
      teacherId: currentUser,
      classId: activeClass.id,
      className: activeClass.name,
      licenseId: userLicenseId || activeLicense?.id || "",
      subjectId: activeSubjectId,
      targetType: assignmentTargetType,
      targetId: assignmentTargetId,
      targetLabel: getAssignmentLabel(
        assignmentTargetType,
        assignmentTargetId,
        activeSubjectId
      ),
      deadline,
      targetMastery,
      status: "active",
      completedBy: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (isRootAdmin || adminSimulationActive) {
      const localAssignment = {
        id: `mock-${Date.now().toString(36)}`,
        ...payload,
        simulation: adminSimulationActive,
      };
      setAssignments((prev) => [...prev, localAssignment]);
      setAssignmentDeadline(formatDateTimeLocal(Date.now() + DAY_MS));
      setAssignmentTargetMastery(80);
      setTablePanelsOpen((prev) => ({ ...prev, assignmentBuilder: false }));
      return;
    }

    if (!db) return;
    const assignmentRef = doc(collection(db, "assignments"));

    try {
      await setDoc(assignmentRef, payload);
      setAssignmentDeadline(formatDateTimeLocal(Date.now() + DAY_MS));
      setAssignmentTargetMastery(80);
      setTablePanelsOpen((prev) => ({ ...prev, assignmentBuilder: false }));
    } catch (error) {
      console.error("Assignment create failed:", error);
    }
  };

  const saveAssignmentDeadline = async (assignment) => {
    if (!assignment) return;
    if (licenseStatusInfo.blocksNewWork) {
      alert("This trial has ended. Deadline changes are paused until the license is extended.");
      return;
    }
    const draft = assignmentDeadlineDrafts[assignment.id];
    const nextDeadline = new Date(draft || formatDateTimeLocal(assignment.deadline)).getTime();
    if (!Number.isFinite(nextDeadline)) return;

    if (isRootAdmin || adminSimulationActive) {
      setAssignments((prev) =>
        prev.map((item) =>
          item.id === assignment.id
            ? { ...item, deadline: nextDeadline, updatedAt: Date.now() }
            : item
        )
      );
      return;
    }

    if (!db) return;

    try {
      await setDoc(
        doc(db, "assignments", assignment.id),
        { deadline: nextDeadline, updatedAt: Date.now() },
        { merge: true }
      );
    } catch (error) {
      console.error("Assignment deadline update failed:", error);
    }
  };

  const cancelAssignment = async (assignment) => {
    if (!assignment) return;

    if (isRootAdmin || adminSimulationActive) {
      setAssignments((prev) =>
        prev.map((item) =>
          item.id === assignment.id
            ? { ...item, status: "cancelled", updatedAt: Date.now() }
            : item
        )
      );
      setConfirmCancelAssignmentId("");
      return;
    }

    if (!db) return;

    try {
      await setDoc(
        doc(db, "assignments", assignment.id),
        { status: "cancelled", updatedAt: Date.now() },
        { merge: true }
      );
      setConfirmCancelAssignmentId("");
    } catch (error) {
      console.error("Assignment cancel failed:", error);
    }
  };

  const startTopicQuiz = (chapterId) => {
    const chapter = curriculumFlashcardData.find((item) => item.id === chapterId);
    const cards = getCardsForChapter(chapter);
    if (cards.length === 0) {
      alert("No flashcards found for this chapter yet.");
      return;
    }

    setQuizType("topic");
    setActiveAssignmentId("");
    setQuizQueue(cards.map((card) => card.id));
    setView("quiz-session");
  };

  const startSubsectionQuiz = (subsection) => {
    const cards = subsection?.cards || [];
    if (cards.length === 0) {
      alert("No flashcards found for this subsection yet.");
      return;
    }

    setQuizType("topic");
    setActiveAssignmentId("");
    setQuizQueue(cards.map((card) => card.id));
    setView("quiz-session");
  };

  const startRefreshPacket = () => {
    const weakCards = allCards
      .filter(
        (card) => progress[card.id] !== undefined && calculateMastery(card.id) < 80
      )
      .sort((a, b) => calculateMastery(a.id) - calculateMastery(b.id));

    if (weakCards.length > 0) {
      setQuizType("refresh");
      setActiveAssignmentId("");
      setQuizQueue(weakCards.slice(0, 6).map((card) => card.id));
      setView("quiz-session");
    } else {
      alert("All your active studied topics are currently green. Great job.");
    }
  };

  const getUTCMidnight = () => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  };

  const buildCardProgress = (cardId, isCorrect, currentProgress = progress) => {
    const itemProgress = currentProgress[cardId] || {};
    const isCramming = Date.now() - (itemProgress.lastSeen || 0) < 43200000;
    const nextConsecutive = isCorrect
      ? isCramming
        ? itemProgress.consecutiveCorrect || 0
        : (itemProgress.consecutiveCorrect || 0) + 1
      : 0;

    const cardData = {
      baseMastery: isCorrect ? 100 : 0,
      consecutiveCorrect: nextConsecutive,
      lastSeen: Date.now(),
      status: isCorrect ? "correct" : "incorrect",
    };
    return cardData;
  };

  const processAnswer = async (cardId, isCorrect) => {
    if (!cardId) return null;

    const cardData = buildCardProgress(cardId, isCorrect);

    setProgress((prev) => ({ ...prev, [cardId]: cardData }));
    recordEngagement("flashcard-answer", { cardId, isCorrect });

    if (
      !currentUser ||
      currentUser === ROOT_ADMIN_ID ||
      adminSimulationActive ||
      !db ||
      !isHydrated
    ) return cardData;

    try {
      const batch = writeBatch(db);
      const userRef = doc(db, "users", currentUser);
      const cardRef = doc(db, "users", currentUser, "progress", cardId);
      const publicProfileRef = doc(db, "public_profiles", currentUser);

      batch.set(cardRef, cardData, { merge: true });

      const todayUTC = getUTCMidnight();
      const yesterdayUTC = todayUTC - DAY_MS;
      const streakUpdate = { lastUpdated: Date.now() };

      if (streak.lastDate !== todayUTC) {
        if (streak.lastDate === yesterdayUTC) {
          streakUpdate["streak.current"] = increment(1);
          streakUpdate["streak.lastDate"] = todayUTC;
          if ((streak.current || 0) + 1 > (streak.longest || 0)) {
            streakUpdate["streak.longest"] = (streak.current || 0) + 1;
          }
        } else {
          streakUpdate["streak.current"] = 1;
          streakUpdate["streak.lastDate"] = todayUTC;
          if ((streak.longest || 0) < 1) streakUpdate["streak.longest"] = 1;
        }
      }

      batch.set(userRef, streakUpdate, { merge: true });
      batch.set(
        publicProfileRef,
        {
          name: userName || currentUser,
          role: userRole || "student",
          classId: studentClassIds[0] || userClassCode || "",
          classIds: studentClassIds,
          streak: {
            current:
              streakUpdate["streak.current"] !== undefined
                ? streakUpdate["streak.current"]
                : streak.current || 0,
            longest:
              streakUpdate["streak.longest"] !== undefined
                ? streakUpdate["streak.longest"]
                : streak.longest || 0,
          },
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      await batch.commit();
    } catch (e) {
      console.error("Cloud batch failure:", e);
    }

    return cardData;
  };

  const handleFlashcardAnswer = useCallback(
    (isCorrect, mode) => {
      const currentId = quizQueue[0];
      const cardData = buildCardProgress(currentId, isCorrect);
      const projectedProgress = { ...progress, [currentId]: cardData };
      processAnswer(currentId, isCorrect);
      awardXP(
        mode === "blitz" ? BASE_XP.blitz : BASE_XP.flashcard,
        isCorrect ? 1 : 0.2,
        mode === "blitz" ? "blitz" : "flashcard"
      );

      if (mode === "blitz" && isCorrect) {
        setBlitzScore((prev) => prev + 1);
      }

      const nextQueue = quizQueue.slice(1);
      if (!isCorrect && mode !== "blitz") {
        nextQueue.splice(Math.min(2, nextQueue.length), 0, currentId);
      }

      if (nextQueue.length === 0 && activeAssignment && mode !== "blitz") {
        const mastery = getAssignmentMastery(activeAssignment, projectedProgress);
        const target = activeAssignment.targetMastery || 80;
        if (mastery >= target) {
          markAssignmentComplete(activeAssignment, mastery);
          setView("quiz-done");
          return;
        }

        const weakCards = getAssignmentCards(activeAssignment).filter(
          (card) => calculateMastery(card.id, projectedProgress) < target
        );
        setQuizQueue(
          (weakCards.length > 0 ? weakCards : getAssignmentCards(activeAssignment)).map(
            (card) => card.id
          )
        );
        alert(`Mastery is ${mastery}%. Keep going until you reach ${target}%.`);
        return;
      }

      if (nextQueue.length === 0 || (mode === "blitz" && timeLeft <= 0)) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setView(mode === "blitz" ? "blitz-done" : "quiz-done");
      } else {
        setQuizQueue(nextQueue);
      }
    },
    [activeAssignment, progress, quizQueue, timeLeft]
  );

  const startMatchGameCanvas = () => {
    let rawRefreshPool = allCards.filter(
      (card) => progress[card.id] !== undefined && calculateMastery(card.id) < 80
    );

    if (rawRefreshPool.length < 4) {
      const attemptedPool = allCards.filter((card) => progress[card.id] !== undefined);
      while (rawRefreshPool.length < 4 && rawRefreshPool.length < attemptedPool.length) {
        const randCard = attemptedPool[Math.floor(Math.random() * attemptedPool.length)];
        if (!rawRefreshPool.find((card) => card.id === randCard.id)) {
          rawRefreshPool.push(randCard);
        }
      }
    }

    if (rawRefreshPool.length < 4) {
      while (rawRefreshPool.length < 4 && rawRefreshPool.length < allCards.length) {
        const randCard = allCards[Math.floor(Math.random() * allCards.length)];
        if (!rawRefreshPool.find((card) => card.id === randCard.id)) {
          rawRefreshPool.push(randCard);
        }
      }
    }

    const operationalSet = rawRefreshPool.sort(() => 0.5 - Math.random()).slice(0, 4);
    const fronts = operationalSet.map((card) => ({
      id: card.id,
      text: card.front,
      type: "front",
    }));
    const backs = operationalSet.map((card) => ({
      id: card.id,
      text: card.back,
      type: "back",
    }));

    setMatchCards([...fronts, ...backs].sort(() => 0.5 - Math.random()));
    setMatchedIds([]);
    setSelectedMatch(null);
    setMismatchedPair([]);
    setActiveAssignmentId("");
    setView("match-game");
  };

  const handleMatchSelection = (clickedItem) => {
    if (matchedIds.includes(clickedItem.id) || mismatchedPair.length > 0) return;

    if (
      selectedMatch &&
      selectedMatch.id === clickedItem.id &&
      selectedMatch.type === clickedItem.type
    ) {
      setSelectedMatch(null);
      return;
    }

    if (!selectedMatch || selectedMatch.type === clickedItem.type) {
      setSelectedMatch(clickedItem);
      return;
    }

    if (selectedMatch.id === clickedItem.id) {
      const nextMatches = [...matchedIds, clickedItem.id];
      setMatchedIds(nextMatches);
      setSelectedMatch(null);
      processAnswer(clickedItem.id, true);
      awardXP(BASE_XP.flashcard, 1, "match");

      if (nextMatches.length === 4) {
        setTimeout(() => setView("match-done"), 600);
      }
      return;
    }

    setMismatchedPair([selectedMatch, clickedItem]);
    setSelectedMatch(null);
    setTimeout(() => setMismatchedPair([]), 1000);
  };

  const handleWrittenAnswer = useCallback(
    (score, maxMarks) => {
      const currentId = quizQueue[0];
      if (!currentId) return;
      const percentScore = (score / maxMarks) * 100;
      recordEngagement("essay-submit", { questionId: currentId, score, maxMarks });
      awardXP(BASE_XP.essay, percentScore / 100, "essay");

      setWrittenProgress((prev) => {
        const currentData = prev[currentId] || { attempts: 0 };
        const nextWrittenProgress = {
          ...prev,
          [currentId]: {
            attempts: currentData.attempts + 1,
            last_score: percentScore,
            timestamp: Date.now(),
          },
        };
        saveWrittenToCloud(nextWrittenProgress);
        if (activeAssignment?.targetType === "essay") {
          const target = activeAssignment.targetMastery || 80;
          if (percentScore >= target) {
            markAssignmentComplete(activeAssignment, percentScore);
          }
        }
        return nextWrittenProgress;
      });

      if (activeAssignment?.targetType === "essay" && percentScore < (activeAssignment.targetMastery || 80)) {
        alert(
          `Score is ${Math.round(percentScore)}%. Try again until you reach ${
            activeAssignment.targetMastery || 80
          }%.`
        );
        setQuizQueue([currentId]);
        return;
      }

      const nextQueue = quizQueue.slice(1);
      if (nextQueue.length === 0) setView("written-done");
      else setQuizQueue(nextQueue);
    },
    [activeAssignment, quizQueue]
  );

  const startTopicWrittenQuiz = (chapterId) => {
    const chapterQuestions = getChapterQuestions(chapterId);
    if (chapterQuestions.length === 0) {
      alert("No long answer questions found for this chapter yet.");
      return;
    }

    const sortedIds = [...chapterQuestions]
      .sort((a, b) => {
        const progA = writtenProgress[a.id] || {
          attempts: 0,
          last_score: 0,
          timestamp: 0,
        };
        const progB = writtenProgress[b.id] || {
          attempts: 0,
          last_score: 0,
          timestamp: 0,
        };

        if (progA.attempts === 0 && progB.attempts > 0) return -1;
        if (progB.attempts === 0 && progA.attempts > 0) return 1;
        if (progA.last_score !== progB.last_score) {
          return progA.last_score - progB.last_score;
        }
        return progA.timestamp - progB.timestamp;
      })
      .map((question) => question.id);

    setQuizQueue(sortedIds);
    setActiveAssignmentId("");
    setView("written-session");
  };

  const startSingleWrittenQuestion = (questionId) => {
    if (!questionId) return;
    setQuizQueue([questionId]);
    setActiveAssignmentId("");
    setView("written-session");
  };

  const startBlitz = () => {
    if (blitzFilters.length === 0) {
      alert("Select at least one topic.");
      return;
    }

    const filteredCards = curriculumFlashcardData
      .filter((chapter) => blitzFilters.includes(chapter.id))
      .flatMap((chapter) => getCardsForChapter(chapter));

    if (filteredCards.length === 0) {
      alert("No cards found for the selected topics.");
      return;
    }

    if (timerRef.current) clearInterval(timerRef.current);

    setActiveAssignmentId("");
    setQuizQueue([...filteredCards].sort(() => 0.5 - Math.random()).map((card) => card.id));
    setBlitzScore(0);
    setTimeLeft(60);
    setView("speed-blitz");

    timerRef.current = setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setView("blitz-done");
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
  };

  const toggleBlitzFilter = (id) =>
    setBlitzFilters((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );

  const toggleTheme = () =>
    setTheme((prev) => (prev === "light" ? "dark" : "light"));

  const getScopedChapterKey = (scope, id) => `${scope}:${id}`;
  const isScopedChapterExpanded = (scope, id) =>
    expandedChapters.includes(getScopedChapterKey(scope, id));
  const toggleScopedChapter = (scope, id) => {
    const key = getScopedChapterKey(scope, id);
    setExpandedChapters((prev) =>
      prev.includes(key) ? prev.filter((chapterId) => chapterId !== key) : [...prev, key]
    );
  };

  const toggleChapter = (id) =>
    toggleScopedChapter("learn", id);

  const renderActivePrepMini = (context = "session") => {
    if (studentAssignments.length === 0) return null;
    const assignment = studentAssignments[0];
    const mastery = getAssignmentMastery(assignment);
    const extraCount = Math.max(0, studentAssignments.length - 1);

    return (
      <div className="active-prep-mini glass-panel">
        <div>
          <span className="label">Active Assignments</span>
          <b>
            {getAssignmentShortLabel(
              assignment.targetType,
              assignment.targetId,
              assignment.subjectId
            )}
          </b>
          <span>
            {formatTimeRemaining(assignment.deadline, nowMs)} · Target{" "}
            {assignment.targetMastery}% · Current {mastery}%
            {extraCount > 0 ? ` · ${extraCount} more` : ""}
          </span>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => loadAssignment(assignment)}
        >
          {context === "assignment" ? "Resume" : "Open Assignment"}
        </button>
      </div>
    );
  };

  const handleGlobalLogout = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (simulationTimerRef.current) {
      clearTimeout(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }

    setCurrentUser(null);
    setIsSuperAdminSession(false);
    setUserName("");
    setUserRole("");
    setUserClassCode("");
    setUserClasses([]);
    setUserClassIds([]);
    setUserLicenseId("");
    setActiveLicense(null);
    setPilotSchoolName("");
    setActiveSubjectId(DEFAULT_SUBJECT_ID);
    setFlaggedContent([]);
    setHasAdminPrivileges(false);
    setAdminProfile(null);
    setAdminSimulationActive(false);
    setAdminPreviewActive(false);
    setActiveClassId("");
    setSelectedStudentId("");
    setProgress({});
    setWrittenProgress({});
    setStreak(DEFAULT_STREAK);
    setXpTotal(0);
    setEngagementCount(0);
    setAllUsersData([]);
    setStudentProgressById({});
    setAssignments([]);
    setAssignmentCompletionMaps({});
    setNudges([]);
    setTeacherInvites([]);
    setSentTeacherInvites([]);
    setClassJoinCodes([]);
    setGeneratingJoinCodeId("");
    setActiveAssignmentId("");
    setAssignmentDeadlineDrafts({});
    setConfirmCancelAssignmentId("");
    setClassNameDrafts({});
    setClassInviteDrafts({});
    setConfirmRemoveStudentId("");
    setRemovingStudentId("");
    setClassNudgeDrafts({});
    setClassRewardDrafts({});
    setSupportSettingsAdvanced(false);
    setSimulationDay(0);
    setSimulationHour(0);
    setSimulationStartedAt(Date.now());
    setSimulationRunning(false);
    setSimulationLog([]);
    setSimulatedUserId("");
    setSimulatedTeacherMode("account-manager");
    setSimulationTeacherToolsVisible(true);
    setTablePanelsOpen({
      simulationTelemetry: true,
      simulationLog: false,
      simulationData: false,
      classRoster: true,
      classSettings: false,
      assignmentBuilder: false,
      leaderboard: true,
    });
    setQuizQueue([]);
    setActiveSubsection(null);
    setIsHydrated(true);
    setView("login");

    try {
      localStorage.removeItem("current_user");
    } catch (e) {}
  };

  const renderLoginView = () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "70dvh",
        padding: "0 20px",
        boxSizing: "border-box",
      }}
    >
      <div
        className="login-box glass-panel"
        style={{ width: "100%", maxWidth: "400px", padding: "40px 30px" }}
      >
        <h1 style={{ fontSize: "2.5rem", marginBottom: "30px", textAlign: "center" }}>
          D&T Hub
        </h1>
        {loginError && (
          <p
            style={{
              color: "var(--red)",
              fontWeight: "bold",
              textAlign: "center",
              marginBottom: "15px",
            }}
          >
            {loginError}
          </p>
        )}
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setLoginError("");

            const input = loginInput.trim().toLowerCase();
            const normalizedName = nameInput.trim().replace(/\s+/g, " ");
            const normalizedClassCode = normalizeTeacherAccessCode(classCodeInput);

            if (!isSignUp && input === ROOT_ADMIN_ID) {
              if (!isValidSuperAdminKey(passwordInput)) {
                setLoginError("Super admin access is not configured or the key is invalid.");
                return;
              }

              try {
                localStorage.removeItem("current_user");
              } catch (err) {}
              setIsSuperAdminSession(true);
              setCurrentUser(ROOT_ADMIN_ID);
              setUserName("Super Admin");
              setUserRole("admin");
              setHasAdminPrivileges(true);
              setAdminProfile({ name: "Super Admin", role: "admin" });
              setIsHydrated(true);
              setView("admin-control");
              return;
            }

            if (!isValidEmail(input)) {
              setLoginError("Please enter a valid email address.");
              return;
            }

            if (!isSignUp) {
              try {
                const credential = await signInWithEmailAndPassword(
                  auth,
                  input,
                  passwordInput
                );
                const emailAsId = credential.user.email.toLowerCase();
                try {
                  localStorage.setItem("current_user", emailAsId);
                } catch (err) {}
                setIsSuperAdminSession(false);
                setCurrentUser(emailAsId);
              } catch (error) {
                setLoginError(getSafeAuthError(error, "login"));
              }
              return;
            }

            if (passwordInput.length < 6) {
              setLoginError("Password must be at least 6 characters.");
              return;
            }
            if (!normalizedName) {
              setLoginError("Please provide your first and last name.");
              return;
            }
            if (roleInput === "student" && !normalizedClassCode) {
              setLoginError("Class join code required for school registration.");
              return;
            }
            const teacherAccessCodeId = normalizeTeacherAccessCode(licenseInput);
            if (
              roleInput === "teacher" &&
              licenseInput.trim() &&
              teacherAccessCodeId.length < TEACHER_ACCESS_CODE_MIN_LENGTH
            ) {
              setLoginError(
                "That invite code looks too short. Shared teachers can leave this field blank if they have been invited by email."
              );
              return;
            }

            try {
              const credential = await createUserWithEmailAndPassword(
                auth,
                input,
                passwordInput
              );
              const emailAsId = credential.user.email.toLowerCase();
              const newUserData = {
                name: normalizedName,
                role: roleInput,
                writtenProgress: {},
                streak: DEFAULT_STREAK,
                xpTotal: 0,
                activeEngagements: 0,
                createdAt: Date.now(),
                lastUpdated: Date.now(),
              };

              if (roleInput === "student") {
                let joinCodeSnap;
                try {
                  joinCodeSnap = await getDoc(doc(db, "class_join_codes", normalizedClassCode));
                } catch (joinCodeError) {
                  try {
                    await deleteUser(credential.user);
                  } catch (deleteError) {
                    console.error("Could not remove student auth user after join-code failure:", deleteError);
                  }
                  setLoginError(
                    "That class join code could not be checked. Ask your teacher for a fresh code."
                  );
                  return;
                }

                const joinCodeData = joinCodeSnap.exists() ? joinCodeSnap.data() : null;
                const joinedClassId = String(joinCodeData?.classId || "").trim().toUpperCase();
                const joinCodeExpiresAt = timestampToMillis(joinCodeData?.expiresAt);
                if (
                  !joinCodeData ||
                  joinCodeData.status !== "active" ||
                  !joinedClassId ||
                  !joinCodeExpiresAt ||
                  joinCodeExpiresAt <= Date.now()
                ) {
                  try {
                    await deleteUser(credential.user);
                  } catch (deleteError) {
                    console.error("Could not remove student auth user after invalid join code:", deleteError);
                  }
                  setLoginError(
                    "That class join code is invalid or expired. Ask your teacher to create a new one."
                  );
                  return;
                }

                newUserData.classCode = joinedClassId;
                newUserData.classId = joinedClassId;
                newUserData.classIds = [joinedClassId];
                newUserData.joinCodeId = normalizedClassCode;
                newUserData.licenseId = String(joinCodeData.licenseId || "");
                newUserData.schoolName = String(joinCodeData.schoolName || "");
              }
              if (roleInput === "teacher") {
                if (teacherAccessCodeId) {
                  const codeRef = doc(db, "teacher_access_codes", teacherAccessCodeId);
                  let codeSnap;
                  try {
                    codeSnap = await getDoc(codeRef);
                  } catch (accessError) {
                    try {
                      await deleteUser(credential.user);
                    } catch (deleteError) {
                      console.error("Could not remove unlicensed teacher auth user:", deleteError);
                    }
                    setLoginError(
                      "That pilot invite code could not be used. Check the code and email address."
                    );
                    return;
                  }
                  const codeData = codeSnap.exists() ? codeSnap.data() : null;
                  const accessError = getTeacherAccessCodeError(codeData, emailAsId);

                  if (accessError) {
                    try {
                      await deleteUser(credential.user);
                    } catch (deleteError) {
                      console.error("Could not remove unlicensed teacher auth user:", deleteError);
                    }
                    setLoginError(accessError);
                    return;
                  }

                  const now = Date.now();
                  const subjectIds = Array.isArray(codeData.subjectIds)
                    ? codeData.subjectIds
                    : Array.isArray(codeData.unlocked_subjects)
                      ? codeData.unlocked_subjects
                      : [DEFAULT_SUBJECT_ID];
                  const maxClasses = clampPilotNumber(codeData.maxClasses, 3, 1, 10);
                  const maxSeatsPerClass = clampPilotNumber(codeData.maxSeatsPerClass, 35, 1, 60);
                  const trialDays = clampPilotNumber(codeData.trialDays, 21, 1, 120);
                  const schoolName =
                    String(codeData.schoolName || codeData.school_name || "").trim() ||
                    `${normalizedName} Pilot School`;
                  const defaultClass = createDefaultClass(emailAsId);
                  const licenseId =
                    String(codeData.licenseId || "").trim() ||
                    `pilot-${teacherAccessCodeId.toLowerCase()}`;
                  const licenseClasses = [
                    {
                      ...defaultClass,
                      seatCount: 0,
                    },
                  ];

                  newUserData.classCode = defaultClass.id;
                  newUserData.classes = [defaultClass];
                  newUserData.classIds = [defaultClass.id];
                  newUserData.licenseId = licenseId;
                  newUserData.accessCodeId = teacherAccessCodeId;
                  newUserData.accountManager = true;
                  newUserData.schoolName = schoolName;

                  const licensePayload = {
                    school_name: schoolName,
                    unlocked_subjects: subjectIds,
                    max_classes: maxClasses,
                    max_seats_per_class: maxSeatsPerClass,
                    ownerId: emailAsId,
                    teacherIds: [emailAsId],
                    adminIds: [],
                    classes: licenseClasses,
                    status: "trial",
                    trialStartsAt: new Date(now),
                    trialEndsAt: new Date(now + trialDays * DAY_MS),
                    createdFromAccessCodeId: teacherAccessCodeId,
                    createdAt: now,
                    updatedAt: now,
                  };

                  const setupBatch = writeBatch(db);
                  setupBatch.set(doc(db, "users", emailAsId), newUserData);
                  setupBatch.set(
                    doc(db, "public_profiles", emailAsId),
                    getPublicProfilePayload(newUserData),
                    { merge: true }
                  );
                  setupBatch.set(doc(db, "licenses", licenseId), licensePayload);
                  setupBatch.set(
                    codeRef,
                    {
                      status: "redeemed",
                      redeemedAt: new Date(now),
                      redeemedBy: emailAsId,
                      licenseId,
                      updatedAt: now,
                    },
                    { merge: true }
                  );
                  await setupBatch.commit();
                } else {
                  let pendingInvite = null;
                  try {
                    const inviteSnap = await getDocs(
                      query(
                        collection(db, "class_invites"),
                        where("targetTeacherEmail", "==", emailAsId)
                      )
                    );
                    pendingInvite =
                      inviteSnap.docs
                        .map((inviteDoc) => ({ id: inviteDoc.id, ...inviteDoc.data() }))
                        .filter((invite) => invite.status === "pending")
                        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] ||
                      null;
                  } catch (inviteError) {
                    console.error("Could not check teacher class invitations:", inviteError);
                  }

                  if (!pendingInvite) {
                    try {
                      await deleteUser(credential.user);
                    } catch (deleteError) {
                      console.error("Could not remove unlicensed teacher auth user:", deleteError);
                    }
                    setLoginError(
                      "Teacher accounts need either a Super Admin pilot code or a pending class invitation for this email."
                    );
                    return;
                  }

                  newUserData.classCode = "";
                  newUserData.classes = [];
                  newUserData.classIds = [];
                  newUserData.licenseId = pendingInvite.licenseId || "";
                  newUserData.signupInviteId = pendingInvite.id;
                  newUserData.accountManager = false;
                  newUserData.schoolName = pendingInvite.schoolName || "";

                  await setDoc(doc(db, "users", emailAsId), newUserData);
                  await setDoc(
                    doc(db, "public_profiles", emailAsId),
                    getPublicProfilePayload(newUserData),
                    { merge: true }
                  );
                }
              } else {
                await setDoc(doc(db, "users", emailAsId), newUserData);
                await setDoc(
                  doc(db, "public_profiles", emailAsId),
                  getPublicProfilePayload(newUserData),
                  { merge: true }
                );
              }
              try {
                localStorage.setItem("current_user", emailAsId);
              } catch (err) {}
              setIsSuperAdminSession(false);
              setCurrentUser(emailAsId);
            } catch (error) {
              setLoginError(getSafeAuthError(error, "signup"));
            }
          }}
        >
          {isSignUp && (
            <input
              className="input-field"
              placeholder="First and Last Name"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              required
              style={{ marginBottom: "15px" }}
            />
          )}

          <input
            className="input-field"
            placeholder="Email Address"
            value={loginInput}
            onChange={(event) => setLoginInput(event.target.value)}
            required
            style={{ marginBottom: "15px" }}
          />

          {isSignUp && (
            <select
              className="input-field"
              value={roleInput}
              onChange={(event) => setRoleInput(event.target.value)}
              style={{ marginBottom: "15px", appearance: "none" }}
            >
              <option value="student">I am a School Student</option>
              <option value="solo">I am studying alone</option>
              <option value="teacher">I am a School Teacher</option>
            </select>
          )}

          {isSignUp && roleInput === "student" && (
            <input
              className="input-field"
              placeholder="Enter Class Join Code"
              value={classCodeInput}
              onChange={(event) => setClassCodeInput(event.target.value)}
              required
              style={{ marginBottom: "15px", border: "1px solid var(--primary)" }}
            />
          )}

          {isSignUp && roleInput === "teacher" && (
            <>
              <input
                className="input-field"
                placeholder="Lead teacher code (co-teachers leave blank)"
                value={licenseInput}
                onChange={(event) => setLicenseInput(event.target.value)}
                style={{ marginBottom: "8px", border: "1px solid var(--orange)" }}
              />
              <p className="helper-text" style={{ marginTop: 0, marginBottom: "15px" }}>
                Lead teacher: enter the one-time Super Admin code. Invited co-teacher:
                leave this blank and sign up with the exact email address the Account
                Manager invited.
              </p>
            </>
          )}

          <div className="password-wrapper" style={{ marginBottom: "30px" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              required
            />
            <button
              type="button"
              className="toggle-password-btn"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <button className="btn-primary" type="submit">
            {isSignUp ? "Create Account" : "Log In"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "20px" }}>
          <button
            type="button"
            onClick={() => {
              setIsSignUp((prev) => !prev);
              setLoginError("");
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--primary)",
              cursor: "pointer",
              fontSize: "0.9rem",
              textDecoration: "underline",
            }}
          >
            {isSignUp ? "Already have an account? Log In" : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );

  const renderView = () => {
    const trueDecayedTotal = getDecayedCardsCount();

    switch (view) {
      case "login":
        return renderLoginView();

      case "admin-control":
        return (
          <AdminControlPanel
            assignments={assignments}
            classes={teacherClasses}
            isConfigured={/^[A-Za-z0-9]{24,}$/.test(SUPER_ADMIN_KEY)}
            onAccountManagerView={simulateAccountManagerDashboard}
            onCurriculumEditor={() => setView("admin-curriculum")}
            onLogout={handleGlobalLogout}
            onPreviewAccountManagerView={previewAccountManagerDashboard}
            onPreviewStudentView={previewStudentDashboard}
            onPreviewTeacherView={previewTeacherDashboard}
            onSeedMockEnvironment={seedMockEnvironment}
            onSimulationLab={() => setView("admin-simulation")}
            onStudentView={simulateStudentDashboard}
            onTeacherView={simulateTeacherDashboard}
            students={allUsersData.filter((user) => user.role === "student")}
          />
        );

      case "admin-curriculum":
        return (
          <>
            <div
              className="user-bar glass-panel"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <span style={{ fontSize: "1.2rem" }}>
                  <b>Curriculum Architect</b>
                </span>
                <div style={{ fontSize: "0.85rem", color: "var(--orange)", marginTop: "4px" }}>
                  Directives 23-25 · Firestore curriculum and feedback pipeline
                </div>
              </div>
              <div className="btn-group" style={{ marginTop: 0 }}>
                {isRootAdmin && (
                  <button className="logout-btn" onClick={() => setView("admin-control")}>
                    Admin Control
                  </button>
                )}
                <button className="logout-btn" onClick={() => setView("admin-simulation")}>
                  Simulation Lab
                </button>
                <button className="logout-btn" onClick={handleGlobalLogout}>
                  Logout
                </button>
              </div>
            </div>
            <AdminCurriculumEditor
              curriculums={curriculums}
              flaggedContent={flaggedContent}
              onImportCurriculum={persistCurriculum}
              onSaveFlashcard={saveFlashcardQuestion}
              onSaveWrittenQuestion={saveWrittenQuestion}
              onSeedDefaultCurriculum={seedDefaultCurriculum}
              onSelectSubject={setActiveSubjectId}
              selectedSubjectId={activeSubjectId}
            />
          </>
        );

      case "admin-simulation":
        return (
          <AdminSimulationLab
            onAccountManagerView={simulateAccountManagerDashboard}
            onCopySimulationData={copySimulationData}
            onCurriculum={() => {
              setAdminSimulationActive(false);
              setUserName(adminProfile?.name || "Admin");
              setUserRole("admin");
              setView("admin-curriculum");
            }}
            onGenerate={createSimulationCohort}
            onLogout={handleGlobalLogout}
            onReset={resetSimulation}
            onRunToggle={toggleSimulationRun}
            onStepHour={stepSimulationHour}
            onStudentView={simulateStudentDashboard}
            onTeacherView={simulateTeacherDashboard}
            realDayDurationLabel={simulationRealDayLabel}
            realHourDurationLabel={simulationRealHourLabel}
            setSimulationClassFilter={setSimulationClassFilter}
            simulationCsv={simulationCsv}
            simulationClassFilter={simulationClassFilter}
            simulationClasses={simulationClasses}
            simulationDay={simulationDay}
            simulationDurationDays={simulationDurationDays}
            simulationHour={simulationHour}
            simulationLog={simulationLog}
            simulationRows={visibleSimulationRows}
            simulationRunning={simulationRunning}
            simulationSpeed={simulationSpeed}
            simulationSummary={simulationSummary}
            simulationTotalHours={simulationTotalHours}
            telemetryTableOpen={tablePanelsOpen.simulationTelemetry}
            onToggleTelemetryTable={() => toggleTablePanel("simulationTelemetry")}
            simulationLogOpen={tablePanelsOpen.simulationLog}
            onToggleSimulationLog={() => toggleTablePanel("simulationLog")}
            analysisTableOpen={tablePanelsOpen.simulationData}
            onToggleAnalysisTable={() => toggleTablePanel("simulationData")}
            setSimulationDurationDays={setSimulationDurationDays}
            setSimulationSpeed={setSimulationSpeed}
          />
        );

      case "teacher-dashboard": {
        const defaultSupportClass =
          teacherClasses[0] || createDefaultClass(currentUser || "preview");
        const defaultNudgePolicy = getDraftNudgePolicy(defaultSupportClass, "all");
        const defaultRewardPolicy = getDraftRewardPolicy(defaultSupportClass, "all");
        const updateNudgeDraft = (draftKey, key, value) =>
          setClassNudgeDrafts((prev) => ({
            ...prev,
            [draftKey]: {
              ...(prev[draftKey] || {}),
              [key]: value,
            },
          }));
        const updateRewardDraft = (draftKey, key, value) =>
          setClassRewardDrafts((prev) => ({
            ...prev,
            [draftKey]: {
              ...(prev[draftKey] || {}),
              [key]: value,
            },
          }));
        const teacherAccessLabel = canManageActiveLicense
          ? "Account Manager controls"
          : "Shared teacher view";

        return (
          <>
            <div
              className="user-bar glass-panel"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <span style={{ fontSize: "1.2rem" }}>
                  Welcome, <b style={{ textTransform: "capitalize" }}>{userName || "Teacher"}</b>
                </span>
                <div style={{ fontSize: "0.85rem", color: "var(--orange)", marginTop: "4px" }}>
                  {teacherClasses.length} class{teacherClasses.length === 1 ? "" : "es"} connected ·{" "}
                  {teacherAccessLabel}
                </div>
              </div>
              <div className="btn-group" style={{ marginTop: 0 }}>
                {adminSimulationActive && (
                  <button
                    className="btn-primary"
                    onClick={() =>
                      setSimulationTeacherToolsVisible((prev) => !prev)
                    }
                  >
                    {simulationTeacherToolsVisible
                      ? "Clean Teacher View"
                      : "Show Sim Tools"}
                  </button>
                )}
                <button className="logout-btn" onClick={handleGlobalLogout}>
                  Logout
                </button>
              </div>
            </div>

            <h1 style={{ marginBottom: "10px" }}>Educator Command Center</h1>
            <p style={{ color: "var(--text-muted)", marginBottom: "25px" }}>
              Choose a class to inspect student progress, assignment completion, and active assignments.
            </p>

            {!activeLicense && userRole === "teacher" && (
              <div className="glass-panel create-class-panel" style={{ marginBottom: "20px" }}>
                <div>
                  <h2>Pilot Access Needed</h2>
                  <p className="muted-copy">
                    Lead teachers need a one-time Super Admin code. Shared teachers
                    need an invitation from the Account Manager for this school email.
                  </p>
                </div>
              </div>
            )}

            {activeLicense && (
              <div
                className={`license-status-banner ${licenseStatusInfo.tone}`}
                style={{ marginBottom: "20px" }}
              >
                <div>
                  <b>{licenseStatusInfo.label}</b>
                  <span>{licenseStatusInfo.detail}</span>
                </div>
                <span>
                  {activeLicense.school_name || "School license"}
                </span>
              </div>
            )}

            {teacherInvites.length > 0 && (
              <div className="glass-panel assignment-dashboard-panel" style={{ marginBottom: "20px" }}>
                <div className="section-title-row">
                  <div>
                    <h2 style={{ marginBottom: 0 }}>Shared Class Invitations</h2>
                    <span className="table-panel-count">
                      Only accept invitations sent to your signed-in teacher email.
                    </span>
                  </div>
                </div>
                <div className="assignment-dashboard-list">
                  {teacherInvites.map((invite) => (
                    <div key={invite.id} className="assignment-dashboard-row">
                      <div>
                        <b>{invite.className || invite.classId}</b>
                        <span>
                          Invited by {invite.inviterName || invite.invitedBy || "another teacher"}
                          {invite.schoolName ? ` · ${invite.schoolName}` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-primary mini-action-btn"
                        onClick={() => acceptTeacherInvite(invite)}
                      >
                        Accept
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="section-title-row">
              <div>
                <h2 style={{ marginBottom: 0 }}>Your Classes</h2>
                <span className="table-panel-count">
                  Open a class to set assignments, view progress, and message students.
                </span>
              </div>
            </div>
            <div className="menu-grid">
              {teacherClasses.length === 0 ? (
                <div className="glass-panel empty-state-panel">
                  <h2>No classes yet</h2>
                  <p>Create your first class below. Students will join using a one-day join code.</p>
                </div>
              ) : (
                teacherClasses.map((classItem) => {
                  const stats = getClassStats(classItem.id);
                  const activeJoinCode = getActiveClassJoinCode(classItem.id);
                  const prepText =
                    stats.possibleCompletions > 0
                      ? `${stats.completedCount}/${stats.possibleCompletions} assignments completed`
                      : "No active assignments";

                  return (
                    <div
                      key={classItem.id}
                      className="menu-card class-card class-management-card"
                    >
                      <button
                        type="button"
                        className="class-card-open"
                        onClick={() => {
                          setActiveClassId(classItem.id);
                          setView("class-view");
                        }}
                      >
                        <h2>{classItem.name}</h2>
                        <p>{prepText}</p>
                        <p>
                          {pluralize(stats.students.length, "student")}
                          {activeLicense?.max_seats_per_class
                            ? `/${activeLicense.max_seats_per_class} seats`
                            : ""}{" "}
                          · {pluralize(stats.activeAssignments.length, "active assignment")}
                        </p>
                        <p>
                          Subjects:{" "}
                          {getClassSubjectIds(
                            getLicenseClassRecord(classItem),
                            licenseSubjectIds
                          )
                            .map(getSubjectLabel)
                            .join(", ")}
                        </p>
                        <p style={{ fontSize: "0.75rem" }}>Class ID: {classItem.id}</p>
                      </button>
                      <div className="student-join-code-card">
                        <div>
                          <span className="label">Student join code</span>
                          {activeJoinCode ? (
                            <>
                              <b>{activeJoinCode.code}</b>
                              <span>
                                Expires {formatTimeRemaining(
                                  timestampToMillis(activeJoinCode.expiresAt),
                                  nowMs
                                )}
                              </span>
                            </>
                          ) : (
                            <span>Generate a 24-hour code when students need to join.</span>
                          )}
                        </div>
                        <div className="join-code-actions">
                          {activeJoinCode ? (
                            <>
                              <button
                                type="button"
                                className="btn-primary mini-action-btn"
                                onClick={() => copyClassJoinCode(activeJoinCode)}
                              >
                                Copy
                              </button>
                              <button
                                type="button"
                                className="logout-btn mini-action-btn"
                                onClick={() => revokeClassJoinCode(activeJoinCode)}
                              >
                                Close
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn-primary small-action-btn"
                              onClick={() => generateClassJoinCode(classItem)}
                              disabled={generatingJoinCodeId === classItem.id}
                            >
                              {generatingJoinCodeId === classItem.id ? "Creating..." : "Create Code"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {teacherDashboardAssignments.length > 0 && (
              <div className="glass-panel assignment-dashboard-panel" style={{ marginBottom: "20px" }}>
                <div className="section-title-row">
                  <div>
                    <h2 style={{ marginBottom: 0 }}>Active Assignments</h2>
                    <span className="table-panel-count">
                      Current work set across your classes.
                    </span>
                  </div>
                </div>
                <div className="assignment-dashboard-list">
                  {teacherDashboardAssignments.map(({ assignment, classItem, students, completedCount }) => {
                    const overdue = assignment.deadline < nowMs;
                    return (
                      <div key={assignment.id} className="assignment-dashboard-row">
                        <div>
                          <b>{getAssignmentShortLabel(assignment.targetType, assignment.targetId, assignment.subjectId)}</b>
                          <span>
                            {classItem.name} · {completedCount}/{students.length} complete ·{" "}
                            {formatTimeRemaining(assignment.deadline, nowMs)}
                          </span>
                        </div>
                        <span className={`status-pill ${overdue ? "support" : "working"}`}>
                          {overdue ? "Overdue" : "Active"}
                        </span>
                        <button
                          type="button"
                          className="logout-btn mini-action-btn"
                          onClick={() => copyAssignmentLink(assignment)}
                        >
                          Copy Link
                        </button>
                        <button
                          type="button"
                          className="logout-btn mini-action-btn"
                          onClick={() => {
                            setActiveClassId(classItem.id);
                            setTablePanelsOpen((prev) => ({
                              ...prev,
                              assignmentBuilder: false,
                              classRoster: true,
                            }));
                            setView("class-view");
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeLicense && canManageActiveLicense && (!activeLicense?.max_classes || teacherClasses.length < activeLicense.max_classes) ? (
              <div className="glass-panel create-class-panel" style={{ marginBottom: "20px" }}>
                <div>
                  <h2>Create Class</h2>
                  <p className="muted-copy">
                    Add a teaching group such as 11Y DT. You can rename it later.
                  </p>
                </div>
                {activeLicense?.max_classes && (
                  <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
                    {teacherClasses.length}/{activeLicense.max_classes} class slots used.
                  </p>
                )}
                <div className="compact-form-row">
                  <input
                    className="input-field"
                    placeholder="Class name, e.g. 11Y DT"
                    value={newClassName}
                    onChange={(event) => setNewClassName(event.target.value)}
                    style={{ marginBottom: 0 }}
                  />
                  <button className="btn-primary small-action-btn" onClick={createClass}>
                    {licenseStatusInfo.blocksNewWork ? "Trial Ended" : "Add Class"}
                  </button>
                </div>
              </div>
            ) : activeLicense && canManageActiveLicense ? (
              <div className="glass-panel" style={{ marginBottom: "20px" }}>
                <h2>Class Limit Reached</h2>
                <p className="muted-copy" style={{ marginBottom: 0 }}>
                  This license currently allows {activeLicense.max_classes} classes.
                </p>
              </div>
            ) : null}

            {activeLicense && teacherClasses.length > 0 && (
              <div className="glass-panel table-panel" style={{ marginBottom: "20px" }}>
                <div className="section-title-row table-panel-header">
                  <div>
                    <h2 style={{ marginBottom: 0 }}>Class Settings</h2>
                    <span className="table-panel-count">
                      Rename classes and choose which subjects students can see.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="logout-btn"
                    onClick={() => toggleTablePanel("classSettings")}
                  >
                    {tablePanelsOpen.classSettings ? "Hide Settings" : "Manage Settings"}
                  </button>
                </div>
                {tablePanelsOpen.classSettings ? (
                  <div className="table-panel-body compact-panel-body">
                    <p style={{ color: "var(--text-muted)" }}>
                      {activeLicense.school_name} license · {teacherClasses.length}/
                      {activeLicense.max_classes || "unlimited"} classes · up to{" "}
                      {activeLicense.max_seats_per_class || "unlimited"} seats per class.
                    </p>
                    <p className="muted-copy">
                      Subject access controls what students in each class can see in their app.
                      If a subject is hidden, it will not appear for that class.
                    </p>
                    {canManageActiveLicense && (
                      <div className="default-support-panel">
                        <SupportAutomationEditor
                          title="Default rules for all classes"
                          nudgePolicy={defaultNudgePolicy}
                          rewardPolicy={defaultRewardPolicy}
                          onNudgeChange={(key, value) => updateNudgeDraft("all", key, value)}
                          onRewardChange={(key, value) => updateRewardDraft("all", key, value)}
                          onSave={() => saveClassSupportPolicy("all")}
                        />
                        <button
                          type="button"
                          className="logout-btn small-action-btn advanced-settings-btn"
                          onClick={() => setSupportSettingsAdvanced((prev) => !prev)}
                        >
                          {supportSettingsAdvanced
                            ? "Hide individual class overrides"
                            : "Advanced: edit individual classes"}
                        </button>
                        <p className="table-panel-count">
                          By default, these support rules apply to every class in this
                          subject. Use advanced overrides only when one class needs
                          different reminders or rewards.
                        </p>
                      </div>
                    )}
                    <div className="filter-list" style={{ marginBottom: 0, marginTop: "16px" }}>
                      {teacherClasses.map((classItem) => {
                        const licenseClass = getLicenseClassRecord(classItem);
                        const subjectIds = getClassSubjectIds(licenseClass, licenseSubjectIds);
                        const seatCount = getClassSeatCount(classItem.id);

                        return (
                          <div key={classItem.id} className="class-settings-card">
                            <div className="class-settings-header">
                              <div>
                                <b>{classItem.name}</b>
                                <span className="table-subtext">Class ID: {classItem.id}</span>
                              </div>
                              <span className="seat-pill">
                                {seatCount}/{activeLicense.max_seats_per_class || "∞"} seats
                              </span>
                            </div>

                            {canManageActiveLicense ? (
                              <>
                                <div className="class-name-edit-row">
                                  <input
                                    className="input-field"
                                    value={classNameDrafts[classItem.id] ?? classItem.name}
                                    onChange={(event) =>
                                      setClassNameDrafts((prev) => ({
                                        ...prev,
                                        [classItem.id]: event.target.value,
                                      }))
                                    }
                                    style={{ marginBottom: 0 }}
                                    placeholder="Class display name"
                                  />
                                  <button
                                    className="btn-primary small-action-btn"
                                    type="button"
                                    onClick={() => saveClassDisplayName(classItem.id)}
                                  >
                                    Save
                                  </button>
                                </div>

                                <div>
                                  <span className="label">Subjects students can see</span>
                                  <div className="subject-access-list">
                                    {licenseSubjectIds.map((subjectId) => {
                                      const enabled = subjectIds.includes(subjectId);
                                      return (
                                        <button
                                          key={subjectId}
                                          className={`subject-access-button ${
                                            enabled ? "is-on" : "is-off"
                                          }`}
                                          type="button"
                                          onClick={() => toggleClassSubject(classItem.id, subjectId)}
                                        >
                                          <b>{getSubjectLabel(subjectId)}</b>
                                          <span>
                                            {enabled ? "Visible to students" : "Hidden from students"}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {supportSettingsAdvanced && (
                                  <SupportAutomationEditor
                                    title={`Individual rules for ${classItem.name}`}
                                    nudgePolicy={getDraftNudgePolicy(classItem, classItem.id)}
                                    rewardPolicy={getDraftRewardPolicy(classItem, classItem.id)}
                                    onNudgeChange={(key, value) =>
                                      updateNudgeDraft(classItem.id, key, value)
                                    }
                                    onRewardChange={(key, value) =>
                                      updateRewardDraft(classItem.id, key, value)
                                    }
                                    onSave={() => saveClassSupportPolicy(classItem.id)}
                                  />
                                )}
                              </>
                            ) : (
                              <p className="muted-copy" style={{ marginTop: "12px" }}>
                                You have shared teaching access. The Account Manager controls
                                class names, subject access, nudge rules, and reward rules.
                              </p>
                            )}

                            <div className="teacher-invite-box">
                              <span className="label">Share this class with another teacher</span>
                              <p className="muted-copy">
                                {canManageActiveLicense
                                  ? `Invite a co-teacher by email. Once they accept, they can view students and set assignments for this class. Up to ${MAX_TEACHERS_PER_CLASS} teachers can share a class during the pilot.`
                                  : "Only the Account Manager can invite additional teachers during the pilot."}
                              </p>
                              <span className="table-panel-count">
                                {getTeacherShareUsage(classItem.id)}/{MAX_TEACHERS_PER_CLASS} teacher access spaces used,
                                including pending invites.
                              </span>
                              {canManageActiveLicense && (
                                <div className="compact-form-row">
                                  <input
                                    className="input-field"
                                    placeholder="teacher@email.com"
                                    value={classInviteDrafts[classItem.id] || ""}
                                    onChange={(event) =>
                                      setClassInviteDrafts((prev) => ({
                                        ...prev,
                                        [classItem.id]: event.target.value,
                                      }))
                                    }
                                    style={{ marginBottom: 0 }}
                                  />
                                  <button
                                    type="button"
                                    className="logout-btn small-action-btn"
                                    onClick={() => sendTeacherInvite(classItem)}
                                  >
                                    Invite
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="table-panel-note">
                    Settings are tucked away. Open them when you need to rename a class or adjust subject access.
                  </p>
                )}
              </div>
            )}
          </>
        );
      }

      case "class-view": {
        const classAssignments = getClassAssignments(activeClass?.id);
        const selectedPrepLabel = getAssignmentLabel(
          assignmentTargetType,
          assignmentTargetId
        );
        const selectedPrepShortLabel = getAssignmentShortLabel(
          assignmentTargetType,
          assignmentTargetId
        );
        const selectedPrepKind =
          assignmentTargetType === "essay"
            ? "Long answer"
            : assignmentTargetType === "subsection"
              ? "Subsection flashcards"
              : "Chapter flashcards";
        const rankedClassroomStudents = [...classroomStudents].sort((a, b) => {
          const nameA = String(a.name || a.id || "");
          const nameB = String(b.name || b.id || "");
          return (
            (b.xpTotal || 0) - (a.xpTotal || 0) ||
            (b.streak?.current || 0) - (a.streak?.current || 0) ||
            nameA.localeCompare(nameB)
          );
        });
        const classroomRankMap = new Map(
          rankedClassroomStudents.map((student, index) => [student.id, index + 1])
        );
        const selectedStudent = classroomStudents.find(
          (student) => student.id === selectedStudentId
        );
        const selectedProgress =
          selectedStudent &&
          (Object.keys(studentProgressById[selectedStudent.id] || {}).length > 0
            ? studentProgressById[selectedStudent.id]
            : selectedStudent.progress || {});
        const selectedBreakdown = selectedProgress
          ? getTopicBreakdown(selectedProgress)
          : [];
        const getStudentProgressRecord = (student) =>
          Object.keys(studentProgressById[student.id] || {}).length > 0
            ? studentProgressById[student.id]
            : student.progress || {};
        const getStudentLastActiveInfo = (student, simRow) =>
          simRow
            ? {
                label: simRow.lastActiveLabel,
                days: simRow.inactiveDays,
                tone: simRow.lastActiveTone,
              }
            : formatLastActive(student.lastEngagementAt || student.lastUpdated, nowMs);
        const getStudentSupportState = (student, studentMastery, simRow) => {
          const studentProgress = getStudentProgressRecord(student);
          const nudgePolicy = normalizeNudgePolicy(activeClass?.nudgePolicy);
          const rewardPolicy = normalizeRewardPolicy(activeClass?.rewardPolicy);
          const incompleteAssignments = getIncompleteAssignmentsForStudent(
            student,
            classAssignments
          );
          const assignmentOverview = getStudentAssignmentOverview(student, classAssignments);
          const lastActive = getStudentLastActiveInfo(student, simRow);
          const lowestAssignmentGap = incompleteAssignments.reduce((largestGap, assignment) => {
            const assignmentMastery = getAssignmentMastery(
              assignment,
              studentProgress,
              student.writtenProgress || {}
            );
            return Math.max(largestGap, (assignment.targetMastery || 80) - assignmentMastery);
          }, 0);
          const lowMastery =
            nudgePolicy.enabled &&
            nudgePolicy.highDecayNudgeEnabled &&
            (studentMastery < nudgePolicy.highDecayMastery || lowestAssignmentGap >= 15);
          const assignmentIdle =
            nudgePolicy.enabled &&
            nudgePolicy.assignmentNudgeEnabled &&
            incompleteAssignments.length > 0 &&
            (lastActive.days === null || lastActive.days >= nudgePolicy.assignmentIdleDays);
          const assignmentOverdue = incompleteAssignments.some(
            (assignment) =>
              nudgePolicy.enabled &&
              nudgePolicy.assignmentNudgeEnabled &&
              assignment.deadline &&
              assignment.deadline < nowMs
          );
          const studyIdle =
            nudgePolicy.enabled &&
            nudgePolicy.studyNudgeEnabled &&
            incompleteAssignments.length === 0 &&
            lastActive.days !== null &&
            lastActive.days >= nudgePolicy.studyIdleDays;
          const streakLastDate = student.streak?.lastDate || 0;
          const streakHoursRemaining = streakLastDate
            ? (streakLastDate + 2 * DAY_MS - nowMs) / HOUR_MS
            : null;
          const streakAtRisk =
            nudgePolicy.enabled &&
            nudgePolicy.streakNudgeEnabled &&
            (student.streak?.current || 0) > 0 &&
            streakHoursRemaining !== null &&
            streakHoursRemaining > 0 &&
            streakHoursRemaining <= nudgePolicy.streakWarningHours;
          const slacking = Boolean(simRow?.isSlacking) || assignmentIdle || studyIdle;
          const needsNudge =
            lowMastery || assignmentIdle || assignmentOverdue || studyIdle || streakAtRisk;
          const activeAssignmentsComplete =
            classAssignments.length > 0 && incompleteAssignments.length === 0;
          const highStreak = (student.streak?.current || 0) >= 5;
          const strongRecentXP =
            (student.lastXP?.earned || 0) >= rewardPolicy.improvementXpThreshold &&
            nowMs - (student.lastXP?.at || 0) <= 7 * DAY_MS;
          const rewardByStreak =
            rewardPolicy.enabled &&
            rewardPolicy.streakRewardEnabled &&
            (student.streak?.current || 0) >= rewardPolicy.streakRewardDays;
          const rewardByAssignment =
            rewardPolicy.enabled &&
            rewardPolicy.assignmentRewardEnabled &&
            activeAssignmentsComplete &&
            studentMastery >= rewardPolicy.assignmentMasteryThreshold;
          const rewardByImprovement =
            rewardPolicy.enabled && rewardPolicy.improvementRewardEnabled && strongRecentXP;
          const betterThanUsual = simRow
            ? rewardPolicy.enabled &&
              !needsNudge &&
              (simRow.accuracy >= Math.max(72, (simRow.consistency || 0) + 12) ||
                rewardByAssignment ||
                rewardByStreak)
            : !needsNudge && (rewardByImprovement || rewardByAssignment || rewardByStreak);
          const statusLabel = needsNudge
            ? assignmentOverdue
              ? "Assignment overdue"
              : streakAtRisk
                ? "Streak at risk"
              : lowMastery && slacking
              ? "Needs support"
              : lowMastery
                ? "Low mastery"
                : "Falling behind"
            : betterThanUsual
              ? "Reward queued"
              : activeAssignmentsComplete
                ? "On track"
                : "Watching";

          return {
            assignmentOverview,
            canReward: betterThanUsual,
            incompleteAssignments,
            lastActive,
            lowMastery,
            needsNudge,
            nudgeReason: assignmentOverdue
              ? "assignment-overdue"
              : assignmentIdle
                ? "incomplete-assignment"
                : streakAtRisk
                  ? "streak-risk"
                : studyIdle
                  ? "inactive-study"
                  : "low-mastery",
            nudgePolicy,
            rewardPolicy,
            rewardMessage: highStreak
              ? `Well done on your ${student.streak?.current || 0} day streak. Keep it up.`
              : "Great work. Your recent progress is stronger than usual, keep going.",
            slacking,
            statusLabel,
            statusTone: needsNudge
              ? "support"
              : betterThanUsual
                ? "reward"
                : activeAssignmentsComplete
                  ? "complete"
                  : "working",
          };
        };
        const selectedSimRow =
          selectedStudent && simulationRows.find((row) => row.id === selectedStudent.id);
        const selectedMastery = selectedStudent
          ? getSectionMastery(allCards, getStudentProgressRecord(selectedStudent))
          : 0;
        const selectedSupportState = selectedStudent
          ? getStudentSupportState(selectedStudent, selectedMastery, selectedSimRow)
          : null;
        const selectedProgressReview = selectedStudent
          ? getStudentProgressReview(selectedStudent, {
              assignmentsScope: assignments.filter((assignment) =>
                getStudentClassIds(selectedStudent).includes(assignment.classId)
              ),
              masteryOverride: selectedMastery,
              progressOverride: selectedProgress,
            })
          : null;

        return (
          <>
            <div className="class-view-actions">
              <button className="back-link" onClick={() => setView("teacher-dashboard")}>
                Back to Classes
              </button>
              {adminSimulationActive && (
                <button
                  className="logout-btn"
                  onClick={() => setSimulationTeacherToolsVisible((prev) => !prev)}
                >
                  {simulationTeacherToolsVisible
                    ? "Clean Teacher View"
                    : "Show Sim Tools"}
                </button>
              )}
            </div>
            <h1 style={{ marginBottom: "10px" }}>{activeClass?.name || "Class"}</h1>
            <p style={{ color: "var(--text-muted)", marginBottom: "25px" }}>
              Class ID: <b>{activeClass?.id}</b>
            </p>

            <div className="glass-panel" style={{ marginBottom: "20px" }}>
              <label>
                <span className="label">Subject for This Class</span>
                <select
                  className="input-field"
                  value={activeSubjectId}
                  onChange={(event) => setActiveSubjectId(event.target.value)}
                  style={{ marginBottom: 0 }}
                >
                  {curriculumSubjects
                    .filter((subject) => activeClassSubjectIds.includes(subject.id))
                    .map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <div className="glass-panel table-panel" style={{ marginBottom: "20px" }}>
              <div className="section-title-row table-panel-header">
                <div>
                  <h2 style={{ marginBottom: 0 }}>Create Assignment</h2>
                  <span className="table-panel-count">
                    Choose the work, set a deadline, then publish it to this class.
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-primary small-action-btn"
                  onClick={() => toggleTablePanel("assignmentBuilder")}
                >
                  {tablePanelsOpen.assignmentBuilder ? "Close" : "New Assignment"}
                </button>
              </div>

              {tablePanelsOpen.assignmentBuilder ? (
                <div className="table-panel-body assignment-builder-body">
                  <p className="muted-copy">
                    Step 1: open a chapter. Step 2: select a whole chapter,
                    subsection, or long-answer question. Step 3: set the target and submit.
                  </p>
                  <div className="selected-content-card">
                    <span className="label">Selected Assignment</span>
                    <b>{selectedPrepShortLabel}</b>
                    <span>{selectedPrepKind} · {selectedPrepLabel}</span>
                  </div>

                  <div className="curriculum-picker">
                    {curriculumFlashcardData.map((chapter) => {
                      const expanded = isScopedChapterExpanded("prep", chapter.id);
                      const chapterQuestions = getChapterQuestions(chapter.id);
                      const chapterSelected =
                        assignmentTargetType === "chapter" && assignmentTargetId === chapter.id;

                      return (
                        <section key={chapter.id} className="curriculum-section">
                          <button
                            type="button"
                            className="chapter-toggle"
                            onClick={() => toggleScopedChapter("prep", chapter.id)}
                          >
                            <span>
                              <b>{chapter.title}</b>
                              <span>
                                {getCardsForChapter(chapter).length} flashcards ·{" "}
                                {chapterQuestions.length} long answer
                              </span>
                            </span>
                            <span aria-hidden="true">{expanded ? "Hide" : "Open"}</span>
                          </button>

                          {expanded && (
                            <div className="chapter-details">
                              <button
                                type="button"
                                className={`question-picker ${
                                  chapterSelected ? "is-selected" : ""
                                }`}
                                onClick={() => selectAssignmentTarget("chapter", chapter.id)}
                              >
                                <b>Assign whole chapter</b>
                                <span>{chapter.title}</span>
                              </button>

                              {(chapter.subsections || []).map((subsection) => {
                                const selected =
                                  assignmentTargetType === "subsection" &&
                                  assignmentTargetId === subsection.id;
                                return (
                                  <button
                                    key={subsection.id}
                                    type="button"
                                    className={`question-picker ${
                                      selected ? "is-selected" : ""
                                    }`}
                                    onClick={() =>
                                      selectAssignmentTarget("subsection", subsection.id)
                                    }
                                  >
                                    <b>Assign subsection: {subsection.title}</b>
                                    <span>{(subsection.cards || []).length} flashcards</span>
                                  </button>
                                );
                              })}

                              <div className="subsection-block long-answer-block">
                                <div className="subsection-heading">
                                  <b>Long Answer Questions</b>
                                  <span>{chapterQuestions.length} questions</span>
                                </div>
                                {chapterQuestions.length === 0 ? (
                                  <p className="muted-copy">
                                    No long answer questions for this chapter yet.
                                  </p>
                                ) : (
                                  <div className="question-list">
                                    {chapterQuestions.map((question) => {
                                      const selected =
                                        assignmentTargetType === "essay" &&
                                        assignmentTargetId === question.id;
                                      return (
                                        <button
                                          key={question.id}
                                          type="button"
                                          className={`question-picker ${
                                            selected ? "is-selected" : ""
                                          }`}
                                          onClick={() =>
                                            selectAssignmentTarget("essay", question.id)
                                          }
                                        >
                                          <b>{question.id}</b>
                                          <span>{question.question}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>

                  <div className="assignment-submit-row">
                    <label>
                      <span className="label">Due date and time</span>
                      <input
                        className="input-field"
                        type="datetime-local"
                        value={assignmentDeadline}
                        onChange={(event) => setAssignmentDeadline(event.target.value)}
                      />
                    </label>

                    <label>
                      <span className="label">Completion target %</span>
                      <input
                        className="input-field"
                        type="number"
                        min="1"
                        max="100"
                        value={assignmentTargetMastery}
                        onChange={(event) => setAssignmentTargetMastery(event.target.value)}
                      />
                    </label>

                    <button className="btn-primary submit-assignment-btn" onClick={createAssignment}>
                      {licenseStatusInfo.blocksNewWork ? "Trial Ended" : "Submit Assignment"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="table-panel-note">
                  Assignment builder closed. Open it when you are ready to set work for this class.
                </p>
              )}
            </div>

            <div className="section-title-row">
              <h2 style={{ marginBottom: 0 }}>Active Assignments</h2>
            </div>
            {classAssignments.length === 0 ? (
              <div className="glass-panel" style={{ marginBottom: "20px" }}>
                <p style={{ color: "var(--text-muted)", margin: 0 }}>
                  No active assignments for this class.
                </p>
              </div>
            ) : (
              classAssignments.map((assignment) => {
                const assignmentSummary = getAssignmentClassSummary(assignment);
                const assignmentOverdue = assignment.deadline < nowMs;
                return (
                <div key={assignment.id} className="glass-panel assignment-edit-card">
                  <div className="assignment-edit-summary">
                    <div>
                      <b>
                        {getAssignmentShortLabel(
                          assignment.targetType,
                          assignment.targetId,
                          assignment.subjectId
                        )}
                      </b>
                      <span className="table-subtext">{assignment.targetLabel}</span>
                    </div>
                    <div className="assignment-summary-stack">
                      <span
                        className={`assignment-meta-pill ${
                          assignmentOverdue ? "is-overdue" : ""
                        }`}
                      >
                        Target {assignment.targetMastery}% ·{" "}
                        {formatTimeRemaining(assignment.deadline, nowMs)}
                      </span>
                      <span className="assignment-completion-line">
                        {assignmentSummary.complete}/{assignmentSummary.total} complete
                        {assignmentSummary.started > 0 ? ` · ${assignmentSummary.started} started` : ""}
                        {assignmentSummary.notStarted > 0
                          ? ` · ${assignmentSummary.notStarted} not started`
                          : ""}
                        {assignmentSummary.overdue > 0 ? ` · ${assignmentSummary.overdue} overdue` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="assignment-edit-controls">
                    <label>
                      <span className="label">Deadline</span>
                      <input
                        className="input-field"
                        type="datetime-local"
                        value={
                          assignmentDeadlineDrafts[assignment.id] ??
                          formatDateTimeLocal(assignment.deadline)
                        }
                        onChange={(event) =>
                          setAssignmentDeadlineDrafts((prev) => ({
                            ...prev,
                            [assignment.id]: event.target.value,
                          }))
                        }
                        style={{ marginBottom: 0 }}
                      />
                    </label>
                    <button
                      className="btn-primary mini-action-btn"
                      onClick={() => saveAssignmentDeadline(assignment)}
                    >
                      Save
                    </button>
                    <button
                      className="logout-btn mini-action-btn"
                      type="button"
                      onClick={() => copyAssignmentLink(assignment)}
                    >
                      Copy Link
                    </button>
                    <button
                      className={
                        confirmCancelAssignmentId === assignment.id
                          ? "btn-red mini-action-btn"
                          : "logout-btn mini-action-btn"
                      }
                      onClick={() =>
                        confirmCancelAssignmentId === assignment.id
                          ? cancelAssignment(assignment)
                          : setConfirmCancelAssignmentId(assignment.id)
                      }
                    >
                      {confirmCancelAssignmentId === assignment.id
                        ? "Confirm stop"
                        : "Stop assignment"}
                    </button>
                    {confirmCancelAssignmentId === assignment.id && (
                      <button
                        className="logout-btn mini-action-btn"
                        onClick={() => setConfirmCancelAssignmentId("")}
                      >
                        Keep
                      </button>
                    )}
                  </div>
                </div>
              );
              })
            )}

            <div className="glass-panel table-panel" style={{ marginBottom: "20px" }}>
              <div className="section-title-row table-panel-header">
                <div>
                  <h2 style={{ marginBottom: 0 }}>Student Progress Overview</h2>
                  <span className="table-panel-count">
                    {classroomStudents.length} student
                    {classroomStudents.length === 1 ? "" : "s"}
                  </span>
                </div>
                <button
                  type="button"
                  className="logout-btn"
                  onClick={() => toggleTablePanel("classRoster")}
                >
                  {tablePanelsOpen.classRoster ? "Hide Table" : "Open Table"}
                </button>
              </div>
              {tablePanelsOpen.classRoster ? (
                <div className="responsive-table table-panel-body">
                  <table className="roster-table">
                    <thead>
	                      <tr>
	                        <th>Rank</th>
	                        <th>Student</th>
	                        <th className="numeric-cell">XP</th>
	                        <th className="numeric-cell">Mastery Track</th>
	                        <th>Assignments</th>
	                        <th>Last Active</th>
	                        <th>Automated Support</th>
	                        <th>PR</th>
	                      </tr>
                    </thead>
                    <tbody>
                      {classroomStudents.length === 0 ? (
                        <tr>
                          <td
	                            colSpan="8"
                            className="table-empty-cell"
                          >
                            No students have joined this class ID yet.
                          </td>
                        </tr>
                      ) : (
	                        rankedClassroomStudents.map((student) => {
	                          const studentProgress = getStudentProgressRecord(student);
	                          const studentMastery = getSectionMastery(allCards, studentProgress);
	                          const simRow = simulationRows.find((row) => row.id === student.id);
	                          const supportState = getStudentSupportState(
	                            student,
	                            studentMastery,
	                            simRow
	                          );
	                          const assignmentOverview = supportState.assignmentOverview;
	                          const rank = classroomRankMap.get(student.id);
	                          const rankTier = getRankTier(rank);
	                          const progressReview = getStudentProgressReview(student, {
	                            assignmentsScope: assignments.filter((assignment) =>
	                              getStudentClassIds(student).includes(assignment.classId)
	                            ),
	                            masteryOverride: studentMastery,
	                            progressOverride: studentProgress,
	                          });

	                          return (
	                            <tr key={student.id}>
	                              <td>
	                                <span className={rankTier.className}>{rankTier.label}</span>
	                              </td>
	                              <td className="student-cell">
	                                <button
                                  type="button"
                                  onClick={() => setSelectedStudentId(student.id)}
                                  className="table-link-button"
                                >
                                  {student.name || "Student"}
                                </button>
                              </td>
                              <td className="numeric-cell xp-cell">
                                {Math.round(student.xpTotal || 0)}
                              </td>
	                              <td className="numeric-cell">
	                                <span className={`track-text ${progressReview.trackTone}`}>
	                                  {studentMastery}%
	                                </span>
	                                <span className="table-subtext">
	                                  {progressReview.paceLabel}
	                                </span>
	                              </td>
                              <td className="assignment-status-cell">
                                <span className={`status-pill ${assignmentOverview.tone}`}>
                                  {assignmentOverview.label}
                                </span>
                                {assignmentOverview.detail && (
                                  <span className="table-subtext">
                                    {assignmentOverview.detail}
                                  </span>
                                )}
                              </td>
                              <td>
                                <span className={`last-active-pill ${supportState.lastActive.tone}`}>
                                  {supportState.lastActive.label}
                                </span>
                              </td>
	                              <td>
	                                <span className={`status-pill ${supportState.statusTone}`}>
	                                  {supportState.statusLabel}
	                                </span>
	                                {(supportState.needsNudge || supportState.canReward) && (
	                                  <span className="table-subtext">
	                                    {supportState.needsNudge
	                                      ? "Automatic reminder rules apply"
	                                      : "Automatic reward rules apply"}
	                                  </span>
	                                )}
	                              </td>
	                              <td>
	                                <button
	                                  type="button"
	                                  className="logout-btn mini-action-btn"
	                                  onClick={() => setSelectedStudentId(student.id)}
	                                >
	                                  PR Review
	                                </button>
	                              </td>
	                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="table-panel-note">
                  Student overview hidden. Open it when you need the full student list and controls.
                </p>
              )}
            </div>

            {selectedStudent && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(15, 23, 42, 0.72)",
                  zIndex: 50,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "20px",
                }}
              >
	                <div
	                  className="glass-panel"
	                  style={{ maxWidth: "760px", width: "min(760px, 100%)", maxHeight: "84dvh", overflowY: "auto" }}
	                >
	                  <div className="student-detail-header">
	                    <div>
	                      <h2>{selectedStudent.name || selectedStudent.id}</h2>
	                      <p style={{ color: "var(--text-muted)" }}>
	                        Rank {getOrdinalRank(classroomRankMap.get(selectedStudent.id))} ·{" "}
	                        {selectedStudent.streak?.current || 0} day streak ·{" "}
	                        {Math.round(selectedStudent.xpTotal || 0)} XP
	                      </p>
	                      <p style={{ color: "var(--text-muted)", marginTop: "6px" }}>
	                        Email: <b>{selectedStudent.id}</b>
                      </p>
                      {selectedSupportState && (
                        <div className="student-modal-status">
                          <span className={`last-active-pill ${selectedSupportState.lastActive.tone}`}>
                            Last active: {selectedSupportState.lastActive.label}
                          </span>
                          <span className={`status-pill ${selectedSupportState.statusTone}`}>
                            {selectedSupportState.statusLabel}
                          </span>
                        </div>
                      )}
                      {(adminSimulationActive || selectedStudent.lastNudge) && (
	                        <p style={{ color: "var(--text-muted)", marginTop: "6px" }}>
	                          {adminSimulationActive
	                            ? selectedStudent.simulation?.lastMessage || "No automated support message yet"
	                            : selectedStudent.lastNudge?.message || "No automated support message yet"}
		                        </p>
	                      )}
	                    </div>
	                    <div className="btn-group modal-action-group">
	                      <button
	                        className="logout-btn mini-action-btn"
	                        type="button"
	                        onClick={() =>
	                          copyParentsEveningReport(
	                            selectedStudent,
	                            selectedProgressReview,
	                            selectedSupportState,
	                            selectedBreakdown
	                          )
	                        }
	                      >
	                        Copy Report
	                      </button>
	                      <button
	                        className="logout-btn mini-action-btn"
	                        type="button"
	                        onClick={() => window.print()}
	                      >
	                        Print
	                      </button>
                      {activeClass?.id && userRole === "teacher" && (
                        <button
                          className="logout-btn mini-action-btn danger-action-btn"
                          type="button"
                          onClick={() => {
                            if (confirmRemoveStudentId === selectedStudent.id) {
                              removeStudentFromActiveClass(selectedStudent);
                              return;
                            }
                            setConfirmRemoveStudentId(selectedStudent.id);
                          }}
                          disabled={removingStudentId === selectedStudent.id}
                        >
                          {removingStudentId === selectedStudent.id
                            ? "Removing..."
                            : confirmRemoveStudentId === selectedStudent.id
                              ? "Confirm Remove"
                              : "Remove from Class"}
                        </button>
                      )}
	                      <button className="logout-btn mini-action-btn" onClick={() => setSelectedStudentId("")}>
	                        Close
	                      </button>
	                    </div>
	                  </div>

	                  <ProgressReviewPanel review={selectedProgressReview} title="Parents' Evening Review" />

	                  {selectedSupportState && (
	                    <div className="parent-snapshot">
	                      <span className="label">Automated Support</span>
	                      <b>{selectedSupportState.statusLabel}</b>
	                      <span>
	                        {selectedSupportState.needsNudge
	                          ? "The automated reminder rules are active for this student."
	                          : selectedSupportState.canReward
	                            ? "The automated reward rules are active for this student."
	                            : "No automated support message is currently waiting."}
	                      </span>
	                      <span>
	                        Topic mastery: {selectedMastery}% · Assignments:{" "}
	                        {selectedSupportState.assignmentOverview.label}
	                        {selectedSupportState.assignmentOverview.detail
	                          ? ` (${selectedSupportState.assignmentOverview.detail})`
	                          : ""}
	                      </span>
	                    </div>
	                  )}

	                  <div className="filter-list" style={{ marginTop: "20px", marginBottom: 0 }}>
                    {selectedBreakdown.map((topic) => (
                      <div
                        key={topic.id}
                        className="filter-item glass-panel"
                        style={{ justifyContent: "space-between" }}
                      >
                        <span>{topic.title}</span>
                        <span style={{ color: getRingColor(topic.score), fontWeight: "bold" }}>
                          {topic.status} · {topic.score}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      }

      case "menu": {
        const unreadNudges = nudges.filter((nudge) => nudge.status !== "read").slice(0, 3);
        const studentAssignmentRows = assignments
          .filter(
            (assignment) =>
              assignment.status === "active" &&
              studentClassIds.includes(assignment.classId)
          )
          .map((assignment) => ({
            assignment,
            status: getAssignmentStudentStatus(
              assignment,
              { id: effectiveStudentId },
              progress,
              writtenProgress
            ),
          }));
        const overdueAssignmentRows = studentAssignmentRows.filter(
          (row) => !row.status.complete && row.status.overdue
        );
        const activeAssignmentRows = studentAssignmentRows.filter(
          (row) => !row.status.complete && !row.status.overdue
        );
        const completedAssignmentRows = studentAssignmentRows
          .filter((row) => row.status.complete)
          .slice(0, 5);
        const renderStudentAssignmentRow = ({ assignment, status }) => (
          <button
            key={assignment.id}
            className="filter-item glass-panel assignment-student-row"
            onClick={() => loadAssignment(assignment)}
          >
            <span>
              <b>{assignment.targetLabel}</b>
              <span className="table-subtext">
                {formatTimeRemaining(assignment.deadline, nowMs)} · Target{" "}
                {assignment.targetMastery}%
              </span>
            </span>
            <span className={`status-pill ${status.tone}`}>
              {status.label} · {status.mastery}%
            </span>
          </button>
        );
        return (
          <>
            <div
              className="user-bar glass-panel"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <span style={{ display: "block", fontSize: "1.2rem" }}>
                  <b style={{ textTransform: "capitalize" }}>
                    {userName ||
                      (currentUser && currentUser.includes("@")
                        ? currentUser.split("@")[0]
                        : currentUser)}
                  </b>
                  {studentRankInfo && (
                    <span className={studentRankInfo.tier.className}>
                      {studentRankInfo.tier.label} / {studentRankInfo.total}
                    </span>
                  )}
                </span>
                <span className={`streak-flame ${streak.current > 0 ? "active" : ""}`}>
                  {streak.current} Day Streak
                </span>
                <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  {xpTotal} XP · {engagementCount} active engagements
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
                <button className="theme-toggle-btn" onClick={toggleTheme}>
                  {theme === "light" ? "Dark" : "Light"}
                </button>
                <button className="logout-btn" onClick={handleGlobalLogout}>
                  Logout
                </button>
              </div>
            </div>

            {curriculumSubjects.length > 1 && (
              <div className="glass-panel" style={{ marginBottom: "25px" }}>
                <label>
                  <span className="label">Active Subject</span>
                  <select
                    className="input-field"
                    value={activeSubjectId}
                    onChange={(event) => setActiveSubjectId(event.target.value)}
                    style={{ marginBottom: 0 }}
                  >
                    {curriculumSubjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {unreadNudges.length > 0 && (
              <div className="glass-panel" style={{ marginBottom: "25px" }}>
                <h2>Teacher Messages</h2>
                <div className="filter-list" style={{ marginBottom: 0 }}>
                  {unreadNudges.map((nudge) => (
                    <div
                      key={nudge.id}
                      className="filter-item glass-panel"
                      style={{ alignItems: "flex-start" }}
                    >
                      <div style={{ width: "100%" }}>
                        <b>{nudge.teacherName || "Teacher"}</b>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "4px" }}>
                          {nudge.className || nudge.classId || "Class reminder"}
                        </div>
                        <div style={{ marginTop: "8px" }}>{nudge.message}</div>
                        <button
                          className="logout-btn"
                          style={{ marginTop: "12px", width: "auto" }}
                          onClick={() => markNudgeRead(nudge)}
                        >
                          Mark Read
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {studentAssignmentRows.length > 0 && (
              <div className="glass-panel" style={{ marginBottom: "25px" }}>
                <div className="section-title-row">
                  <div>
                    <h2 style={{ marginBottom: 0 }}>Assignments</h2>
                    <span className="table-panel-count">
                      {activeAssignmentRows.length} active · {overdueAssignmentRows.length} overdue ·{" "}
                      {completedAssignmentRows.length} recently completed
                    </span>
                  </div>
                </div>
                <div className="assignment-group-list">
                  {overdueAssignmentRows.length > 0 && (
                    <section>
                      <span className="label">Overdue</span>
                      <div className="filter-list">
                        {overdueAssignmentRows.map(renderStudentAssignmentRow)}
                      </div>
                    </section>
                  )}
                  {activeAssignmentRows.length > 0 && (
                    <section>
                      <span className="label">Active</span>
                      <div className="filter-list">
                        {activeAssignmentRows.map(renderStudentAssignmentRow)}
                      </div>
                    </section>
                  )}
                  {completedAssignmentRows.length > 0 && (
                    <section>
                      <span className="label">Completed</span>
                      <div className="filter-list" style={{ marginBottom: 0 }}>
                        {completedAssignmentRows.map(renderStudentAssignmentRow)}
                      </div>
                    </section>
                  )}
                </div>
              </div>
            )}

            <h1 style={{ marginBottom: "25px" }}>Main Menu</h1>
            <div className="menu-grid">
              <button className="menu-card" aria-label="Learn" onClick={() => setView("learn-dashboard")}>
                <h2>Learn</h2>
                <p>Review Content</p>
              </button>
              <button className="menu-card" aria-label="Quiz" onClick={() => setView("quiz-dashboard")}>
                <h2>Quiz</h2>
                <p>Practice Topics</p>
              </button>
              <button className="menu-card" aria-label="Refresh Memory" onClick={startRefreshPacket}>
                <h2>
                  Refresh{" "}
                  {trueDecayedTotal > 0 && (
                    <span
                      style={{
                        fontSize: "1.1rem",
                        background: "var(--red)",
                        padding: "3px 10px",
                        borderRadius: "12px",
                        marginLeft: "5px",
                        color: "#fff",
                      }}
                    >
                      {trueDecayedTotal}
                    </span>
                  )}
                </h2>
                <p>Fix Decayed Memory</p>
              </button>
              <button className="menu-card" aria-label="Match Game" onClick={startMatchGameCanvas}>
                <h2>Match</h2>
                <p>Definition Game</p>
              </button>
              <button className="menu-card" aria-label="Info" onClick={() => setView("insights-dashboard")}>
                <h2>Info</h2>
                <p>Your Progress</p>
              </button>
              <button
                className="menu-card"
                aria-label="Blitz Challenge"
                onClick={() => {
                  setBlitzFilters(curriculumFlashcardData.map((chapter) => chapter.id));
                  setView("blitz-setup");
                }}
              >
                <h2>Blitz</h2>
                <p>Timed Challenge</p>
              </button>
              <button className="menu-card" aria-label="Leaderboard" onClick={() => setView("leaderboard")}>
                <h2>Ranks</h2>
                <p>Class Board</p>
              </button>
            </div>
          </>
        );
      }

      case "learn-dashboard":
        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              Back to Menu
            </button>
            <h1 style={{ marginBottom: "25px" }}>Learn</h1>
            {curriculumFlashcardData.map((chapter) => {
              const chapterCards = getCardsForChapter(chapter);
              const expanded = isScopedChapterExpanded("learn", chapter.id);
              const mastery = getSectionMastery(chapterCards);

              return (
                <section key={chapter.id} className="glass-panel" style={{ marginBottom: "15px" }}>
                  <button
                    type="button"
                    className="chapter-toggle"
                    onClick={() => toggleChapter(chapter.id)}
                  >
                    <span>
                      <b>{chapter.title}</b>
                      <span>
                        {chapterCards.length} cards
                      </span>
                    </span>
                    <MasteryRing score={mastery} color={getRingColor(mastery)} />
                  </button>

                  {expanded && (
                    <div className="chapter-details">
                      {(chapter.subsections || []).map((subsection) => (
                        <button
                          key={subsection.id}
                          className="question-picker"
                          onClick={() => {
                            setActiveSubsection(subsection);
                            setView("learn-page");
                          }}
                        >
                          <b>{subsection.title}</b>
                          <span>
                            {(subsection.cards || []).length} cards
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        );

      case "learn-page":
        return (
          <>
            <button className="back-link" onClick={() => setView("learn-dashboard")}>
              Back to Topics
            </button>
            <h1 style={{ marginBottom: "25px" }}>
              {activeSubsection?.title || "Topic"}
            </h1>
            {(activeSubsection?.cards || []).map((card) => (
              <div
                key={card.id}
                className="glass-panel"
                style={{ padding: "20px", marginBottom: "15px" }}
              >
                {card.imageUrl && (
                  <img
                    src={card.imageUrl}
                    alt={card.front}
                    style={{ width: "100%", borderRadius: "10px", marginBottom: "15px" }}
                  />
                )}
                <b style={{ fontSize: "1.1rem", color: "var(--primary)" }}>{card.front}</b>
                <div
                  className="pre-line"
                  style={{ color: "var(--text)", fontSize: "1rem", marginTop: "10px" }}
                >
                  {card.back}
                </div>
              </div>
            ))}
          </>
        );

      case "quiz-dashboard":
        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              Back to Menu
            </button>
            <h1 style={{ marginBottom: "25px" }}>Quiz</h1>
            {curriculumFlashcardData.map((chapter) => {
              const cardCount = getCardsForChapter(chapter).length;
              const chapterQuestions = getChapterQuestions(chapter.id);
              const expanded = isScopedChapterExpanded("quiz", chapter.id);

              return (
                <section key={chapter.id} className="glass-panel" style={{ marginBottom: "15px" }}>
                  <button
                    type="button"
                    className="chapter-toggle"
                    onClick={() => toggleScopedChapter("quiz", chapter.id)}
                  >
                    <span>
                      <b>{chapter.title}</b>
                      <span>
                        {cardCount} flashcards · {chapterQuestions.length} long answer
                      </span>
                    </span>
                    <span aria-hidden="true">{expanded ? "Hide" : "Open"}</span>
                  </button>

                  {expanded && (
                    <div className="chapter-details">
                      <button
                        type="button"
                        className="question-picker"
                        onClick={() => startTopicQuiz(chapter.id)}
                      >
                        <b>Whole chapter flashcards</b>
                        <span>{cardCount} cards mixed from every subsection</span>
                      </button>

                      {(chapter.subsections || []).map((subsection) => (
                        <button
                          key={subsection.id}
                          type="button"
                          className="question-picker"
                          onClick={() => startSubsectionQuiz(subsection)}
                        >
                          <b>{subsection.title}</b>
                          <span>{(subsection.cards || []).length} flashcards</span>
                        </button>
                      ))}

                      <div className="subsection-block long-answer-block">
                        <div className="subsection-heading">
                          <b>Long Answer Questions</b>
                          <span>{chapterQuestions.length} questions</span>
                        </div>
                        {chapterQuestions.length === 0 ? (
                          <p className="muted-copy">
                            No long answer questions for this chapter yet.
                          </p>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="question-picker"
                              onClick={() => startTopicWrittenQuiz(chapter.id)}
                            >
                              <b>Practice all long answer</b>
                              <span>{chapterQuestions.length} written questions</span>
                            </button>
                            <div className="question-list">
                              {chapterQuestions.map((question) => (
                                <button
                                  key={question.id}
                                  type="button"
                                  className="question-picker"
                                  onClick={() => startSingleWrittenQuestion(question.id)}
                                >
                                  <b>{question.id}</b>
                                  <span>{question.question}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </>
        );

      case "quiz-session": {
        const activeCard = allCards.find((card) => card.id === quizQueue[0]);
        return (
          <>
            <button className="back-link" onClick={() => { setActiveAssignmentId(""); setView("menu"); }}>
              Quit Session
            </button>
            {renderActivePrepMini(activeAssignment ? "assignment" : "session")}
            <QuizCard
              card={activeCard}
              onAnswer={(correct) => handleFlashcardAnswer(correct, "standard")}
              onFlag={flagContentError}
              onReveal={(cardId) => recordEngagement("show-answer", { cardId })}
              count={quizQueue.length}
            />
          </>
        );
      }

      case "quiz-done":
        return (
          <div className="flashcard glass-panel" style={{ textAlign: "center", padding: "50px 20px" }}>
            <h2 style={{ color: "var(--primary)", fontSize: "2rem" }}>Great Job</h2>
            <p style={{ marginBottom: "40px", fontSize: "1.1rem", color: "var(--text-muted)" }}>
              {quizType === "refresh"
                ? "You successfully reviewed this packet."
                : "Topic learned. Review it tomorrow to protect it."}
            </p>
            {quizType === "refresh" && (
              <button className="btn-primary" style={{ marginBottom: "15px" }} onClick={startRefreshPacket}>
                Do Another Packet
              </button>
            )}
            <button className="btn-primary" style={{ background: "var(--text-muted)" }} onClick={() => setView("menu")}>
              Back to Menu
            </button>
          </div>
        );

      case "written-session": {
        const activeQuestion = curriculumWrittenData.find((question) => question.id === quizQueue[0]);
        return (
          <>
            <button className="back-link" onClick={() => { setActiveAssignmentId(""); setView("menu"); }}>
              Quit Session
            </button>
            {renderActivePrepMini(activeAssignment ? "assignment" : "session")}
            <WrittenQuizCard
              question={activeQuestion}
              onFlag={flagContentError}
              onSubmit={handleWrittenAnswer}
              onReveal={(questionId) => recordEngagement("show-mark-scheme", { questionId })}
              count={quizQueue.length}
            />
          </>
        );
      }

      case "written-done":
        return (
          <div className="flashcard glass-panel" style={{ textAlign: "center", padding: "50px 20px" }}>
            <h2 style={{ color: "var(--green)", fontSize: "2rem" }}>Great Job</h2>
            <p style={{ marginBottom: "40px", fontSize: "1.1rem", color: "var(--text-muted)" }}>
              You finished this chapter's written questions.
            </p>
            <button className="btn-primary" style={{ background: "var(--text-muted)" }} onClick={() => setView("menu")}>
              Back to Menu
            </button>
          </div>
        );

      case "match-game":
        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              Quit Match
            </button>
            <h1 style={{ marginBottom: "10px" }}>Match</h1>
            <p style={{ color: "var(--text-muted)", marginBottom: "25px" }}>
              Match each term with its answer.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {matchCards.map((item, index) => {
                const matched = matchedIds.includes(item.id);
                const selected =
                  selectedMatch?.id === item.id && selectedMatch?.type === item.type;
                const mismatched = mismatchedPair.some(
                  (pairItem) => pairItem.id === item.id && pairItem.type === item.type
                );

                return (
                  <button
                    key={`${item.id}-${item.type}-${index}`}
                    className="glass-panel"
                    disabled={matched}
                    onClick={() => handleMatchSelection(item)}
                    style={{
                      minHeight: "120px",
                      color: "var(--text)",
                      textAlign: "left",
                      opacity: matched ? 0.35 : 1,
                      borderColor: selected
                        ? "var(--primary)"
                        : mismatched
                          ? "var(--red)"
                          : "var(--glass-border)",
                    }}
                  >
                    <span className="label">{item.type === "front" ? "TERM" : "ANSWER"}</span>
                    <span className="pre-line">{item.text}</span>
                  </button>
                );
              })}
            </div>
          </>
        );

      case "match-done":
        return (
          <div className="flashcard glass-panel" style={{ textAlign: "center", padding: "50px 20px" }}>
            <h2 style={{ color: "var(--green)", fontSize: "2rem" }}>Matched</h2>
            <p style={{ marginBottom: "40px", color: "var(--text-muted)" }}>
              Nice work. Those cards have been refreshed.
            </p>
            <button className="btn-primary" onClick={startMatchGameCanvas}>
              Play Again
            </button>
            <button
              className="btn-primary"
              style={{ background: "var(--text-muted)", marginTop: "15px" }}
              onClick={() => setView("menu")}
            >
              Back to Menu
            </button>
          </div>
        );

      case "blitz-setup":
        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              Back to Menu
            </button>
            <h1 style={{ marginBottom: "10px" }}>Blitz Setup</h1>
            <p style={{ color: "var(--text-muted)", marginBottom: "25px" }}>
              Pick topics for a 60 second recall challenge.
            </p>
            <div className="filter-list">
              {curriculumFlashcardData.map((chapter) => (
                <label key={chapter.id} className="filter-item glass-panel">
                  <input
                    type="checkbox"
                    checked={blitzFilters.includes(chapter.id)}
                    onChange={() => toggleBlitzFilter(chapter.id)}
                  />
                  <span>{chapter.title}</span>
                </label>
              ))}
            </div>
            <button className="btn-primary" onClick={startBlitz}>
              Start Blitz
            </button>
          </>
        );

      case "speed-blitz": {
        const activeCard = allCards.find((card) => card.id === quizQueue[0]);
        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              Quit Blitz
            </button>
            {renderActivePrepMini("blitz")}
            <div
              className="glass-panel"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <strong className={`timer ${timeLeft <= 10 ? "panic" : ""}`}>
                {timeLeft}s
              </strong>
              <strong>Score: {blitzScore}</strong>
            </div>
            <QuizCard
              card={activeCard}
              onAnswer={(correct) => handleFlashcardAnswer(correct, "blitz")}
              onFlag={flagContentError}
              onReveal={(cardId) => recordEngagement("show-answer", { cardId, mode: "blitz" })}
              count={quizQueue.length}
            />
          </>
        );
      }

      case "blitz-done":
        return (
          <div className="flashcard glass-panel" style={{ textAlign: "center", padding: "50px 20px" }}>
            <h2 style={{ color: "var(--primary)", fontSize: "2rem" }}>Blitz Complete</h2>
            <p style={{ marginBottom: "40px", color: "var(--text-muted)" }}>
              Final score: <b>{blitzScore}</b>
            </p>
            <button className="btn-primary" onClick={() => setView("blitz-setup")}>
              Try Again
            </button>
            <button
              className="btn-primary"
              style={{ background: "var(--text-muted)", marginTop: "15px" }}
              onClick={() => setView("menu")}
            >
              Back to Menu
            </button>
          </div>
        );

      case "insights-dashboard": {
        const totalMastery = getSectionMastery(allCards);
        const selfProgressReview = getStudentProgressReview(
          {
            id: effectiveStudentId,
            name: userName,
            classIds: studentClassIds,
            progress,
            writtenProgress,
            xpTotal,
            streak,
          },
          {
            classIds: studentClassIds,
            masteryOverride: totalMastery,
            progressOverride: progress,
            streakOverride: streak.current,
            writtenProgressOverride: writtenProgress,
            xpOverride: xpTotal,
          }
        );
        const attemptedWrittenIds = Object.keys(writtenProgress);
        const avgWrittenScore =
          attemptedWrittenIds.length > 0
            ? Math.round(
                attemptedWrittenIds.reduce(
                  (acc, id) => acc + (writtenProgress[id].last_score || 0),
                  0
                ) / attemptedWrittenIds.length
              )
            : 0;
        const attemptedCardsCount = allCards.filter(
          (card) => progress[card.id] !== undefined
        ).length;
        const structuralDecayPercent =
          attemptedCardsCount > 0
            ? Math.round((trueDecayedTotal / attemptedCardsCount) * 100)
            : 0;

        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              Back to Menu
            </button>
            <h1 style={{ marginBottom: "20px" }}>Your Info</h1>
            <ProgressReviewPanel review={selfProgressReview} title="Your Progress Review" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "20px" }}>
              <div className="glass-panel" style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "var(--primary)" }}>
                  {totalMastery}%
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  Overall Mastery
                </div>
              </div>
              <div className="glass-panel" style={{ padding: "20px", textAlign: "center" }}>
                <div
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: "bold",
                    color: trueDecayedTotal > 0 ? "var(--red)" : "var(--green)",
                    marginBottom: "8px",
                  }}
                >
                  {structuralDecayPercent}% Active Decay
                </div>
                <div style={{ width: "100%", height: "8px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${structuralDecayPercent}%`,
                      height: "100%",
                      background: "var(--red)",
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "5px" }}>
                  {trueDecayedTotal} learned cards need review
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "25px" }}>
              <div className="glass-panel" style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{streak.longest} days</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Best Streak</div>
              </div>
              <div className="glass-panel" style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{avgWrittenScore}%</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Essay Average</div>
              </div>
            </div>

            <h2 style={{ marginBottom: "15px" }}>Topic Breakdown</h2>
            {curriculumFlashcardData.map((chapter) => {
              const chapterCards = getCardsForChapter(chapter);
              const chapterMastery = getSectionMastery(chapterCards);
              const chapterEssayIds = getChapterQuestions(chapter.id).map(
                (question) => question.id
              );
              const attemptedChapterEssays = chapterEssayIds.filter(
                (id) => writtenProgress[id]
              );
              const chapterEssayScore =
                attemptedChapterEssays.length > 0
                  ? Math.round(
                      attemptedChapterEssays.reduce(
                        (acc, id) => acc + (writtenProgress[id].last_score || 0),
                        0
                      ) / attemptedChapterEssays.length
                    )
                  : 0;

              return (
                <div
                  key={chapter.id}
                  className="glass-panel"
                  style={{
                    padding: "20px",
                    marginBottom: "15px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ maxWidth: "60%" }}>
                    <b style={{ fontSize: "1.1rem" }}>{chapter.title}</b>
                    {attemptedChapterEssays.length > 0 && (
                      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "5px" }}>
                        Essay Avg: {chapterEssayScore}%
                      </div>
                    )}
                  </div>
                  <MasteryRing score={chapterMastery} color={getRingColor(chapterMastery)} />
                </div>
              );
            })}
          </>
        );
      }

      case "leaderboard": {
        const rankedUsers = [...allUsersData]
          .filter((user) => {
            if (user.role === "teacher") return false;
            const ids = getStudentClassIds(user);
            if (studentClassIds.length > 0) {
              return ids.some((id) => studentClassIds.includes(id));
            }
            return ids.length === 0;
          })
          .sort(
            (a, b) =>
              (b.xpTotal || 0) - (a.xpTotal || 0) ||
              (b.streak?.current || 0) - (a.streak?.current || 0)
          );

        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              Back to Menu
            </button>
            <h1 style={{ marginBottom: "10px" }}>
              {studentClassIds.length > 0
                ? `Class Leaderboard (${studentClassIds.join(", ")})`
                : "Global Solo Board"}
            </h1>
            <p style={{ color: "var(--text-muted)", marginBottom: "25px" }}>
              Ranks use XP from completed tasks, accuracy, and streak multipliers.
            </p>
            <div className="glass-panel table-panel">
              <div className="section-title-row table-panel-header">
                <div>
                  <h2 style={{ marginBottom: 0 }}>Rankings</h2>
                  <span className="table-panel-count">
                    {rankedUsers.length} student{rankedUsers.length === 1 ? "" : "s"}
                  </span>
                </div>
                <button
                  type="button"
                  className="logout-btn"
                  onClick={() => toggleTablePanel("leaderboard")}
                >
                  {tablePanelsOpen.leaderboard ? "Hide Table" : "Open Table"}
                </button>
              </div>
              {tablePanelsOpen.leaderboard ? (
                <div className="responsive-table table-panel-body">
                  <table className="leaderboard-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Student</th>
                        <th className="numeric-cell">XP</th>
                        <th className="numeric-cell">Streak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedUsers.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="table-empty-cell">
                            Waiting for class data to synchronize.
                          </td>
                        </tr>
                      ) : (
                        rankedUsers.map((user, index) => {
                          const rank = index + 1;
                          const tier = getRankTier(rank);
                          const isCurrentUser = user.id === effectiveStudentId;
                          const displayString =
                            user.name ||
                            (user.id?.includes("@") ? user.id.split("@")[0] : user.id);

                          return (
                            <tr
                              key={user.id}
                              className={isCurrentUser ? "is-current-user" : ""}
                            >
                              <td>
                                <span className={tier.className}>{tier.label}</span>
                              </td>
                              <td style={{ textTransform: "capitalize" }}>
                                {displayString}{" "}
                                {rank <= 3 && (
                                  <span className={tier.className}>{tier.label}</span>
                                )}
                                {isCurrentUser && (
                                  <span style={{ fontSize: "0.8rem", color: "var(--primary)" }}>
                                    (You)
                                  </span>
                                )}
                              </td>
                              <td className="numeric-cell xp-cell">
                                {Math.round(user.xpTotal || 0)}
                              </td>
                              <td className="numeric-cell" style={{ color: "var(--text-muted)" }}>
                                {user.streak?.current || 0} days
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="table-panel-note">
                  Rankings hidden. Open the table when you want to compare the full class.
                </p>
              )}
            </div>
          </>
        );
      }

      default:
        return (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <h2>Unexpected Application State</h2>
            <p style={{ color: "var(--text-muted)" }}>
              Resetting application routing environment.
            </p>
            <button className="btn-primary" onClick={handleGlobalLogout}>
              Return to Safety
            </button>
          </div>
        );
    }
  };

  return (
    <div
      className={`app-main-wrapper ${
        adminSimulationActive && simulationTeacherToolsVisible
          ? "has-simulation-dock"
          : ""
      }`}
    >
      {adminSimulationActive && simulationTeacherToolsVisible && (
        <SimulationControlDock
          onHideTools={() => setSimulationTeacherToolsVisible(false)}
          onOpenLab={returnToAdminControl}
          onRunToggle={toggleSimulationRun}
          realDayDurationLabel={simulationRealDayLabel}
          realHourDurationLabel={simulationRealHourLabel}
          setSimulationSpeed={setSimulationSpeed}
          simulationDay={simulationDay}
          simulationDurationDays={simulationDurationDays}
          simulationHour={simulationHour}
          simulationRunning={simulationRunning}
          simulationSpeed={simulationSpeed}
          simulationTotalHours={simulationTotalHours}
        />
      )}
      {adminSimulationActive && !simulationTeacherToolsVisible && (
        <button
          className="simulation-restore-tab"
          onClick={() => setSimulationTeacherToolsVisible(true)}
        >
          Show Sim Tools
        </button>
      )}
      {isRootAdmin && !adminSimulationActive && view !== "admin-control" && (
        <button
          className="admin-return-badge"
          onClick={returnToAdminControl}
          style={{
            position: "fixed",
            right: "18px",
            bottom: "18px",
            zIndex: 80,
            width: "auto",
            padding: "10px 14px",
            borderRadius: "999px",
            border: "1px solid var(--glass-border)",
            background: "var(--glass-bg)",
            color: "var(--text)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "var(--glass-shadow)",
            fontWeight: 700,
          }}
        >
          Return to Admin Control
        </button>
      )}
      <div className="texture-grain"></div>
      <div className="mesh-background"></div>
      <div className="geo-shape shape-1 cube-pro-blue"></div>
      <div className="geo-shape shape-2 orb-pro-purple"></div>
      <div className="app-container">
        {!isHydrated && currentUser && currentUser !== ROOT_ADMIN_ID ? (
          <Skeleton lines={5} height="60px" />
        ) : (
          renderView()
        )}
      </div>
    </div>
  );
}
