import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  flashcardData as legacyFlashcardData,
  writtenData as legacyWrittenData,
} from "./data";
import { db, auth } from "./firebase";
import {
  collection,
  doc,
  increment,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { MasteryRing } from "./components/MasteryRing";
import { QuizCard, WrittenQuizCard } from "./components/QuizCards";
import { Skeleton } from "./components/Skeleton";
import { AdminCurriculumEditor } from "./components/AdminCurriculumEditor";
import "./styles.css";

const DEFAULT_STREAK = { current: 0, longest: 0, lastDate: 0 };
const TEACHER_LICENSE = "DTHUB-PRO";
const ROOT_ADMIN_ID = "admin";
const SUPER_ADMIN_KEY = process.env.REACT_APP_SUPER_ADMIN_KEY || "";
const DEFAULT_SUBJECT_ID = "dt";
const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const BASE_XP = {
  flashcard: 10,
  essay: 30,
  assignment: 80,
  blitz: 5,
};
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

const slugifyClassName = (value) =>
  String(value || "class")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 18) || "class";

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
  const remaining = Math.max(0, (deadline || 0) - now);
  if (remaining <= 0) return "Due now";
  const days = Math.floor(remaining / DAY_MS);
  const hours = Math.floor((remaining % DAY_MS) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
};

const formatSimulationDuration = (durationMs) => {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
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
  onCurriculumEditor,
  onLogout,
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
        <h2>Mock Data Generator Factory</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Generate three test classes and five students with balanced streaks,
          XP totals, assignments, and green/amber/red mastery data.
        </p>
        <button className="btn-primary" onClick={onSeedMockEnvironment}>
          Generate Isolated Mock Environment
        </button>
      </div>

      <div className="glass-panel" style={{ marginBottom: "20px" }}>
        <h2>Interface Simulator</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Masquerade locally as a student or teacher while retaining the floating
          admin return control.
        </p>
        <div className="btn-group">
          <button className="btn-primary" onClick={onStudentView}>
            Open Student Dashboard
          </button>
          <button className="btn-primary" onClick={onTeacherView}>
            Open Teacher Dashboard
          </button>
          <button className="btn-primary" onClick={onCurriculumEditor}>
            Open Curriculum Architect
          </button>
          <button className="btn-primary" onClick={onSimulationLab}>
            Open Simulation Lab
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ marginBottom: "20px" }}>
        <h2>Layout Preview</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Open clean student or teacher layouts with static mock data and no simulation
          overlay.
        </p>
        <div className="btn-group">
          <button className="btn-primary" onClick={onPreviewTeacherView}>
            Preview Teacher Layout
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
          <div style={{ color: "var(--text-muted)" }}>Active Prep Tasks</div>
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
  onCopySimulationData,
  onCurriculum,
  onGenerate,
  onLogout,
  onNudgeStudent,
  onRewardStudent,
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
          <span>Completed prep</span>
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
              max="50"
              value={simulationDurationDays}
              onChange={(event) =>
                setSimulationDurationDays(
                  Math.max(1, Math.min(50, Number(event.target.value) || 7))
                )
              }
            />
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
          Open the teacher dashboard to click classes and students, set prep, and
          watch the same sandbox learners from the role-specific views.
        </p>
        <div className="btn-group">
          <button className="btn-primary" onClick={onTeacherView}>
            Open Simulated Teacher View
          </button>
          <button className="btn-primary" onClick={onStudentView}>
            Open Simulated Student View
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ marginBottom: "20px" }}>
        <h2>Live Student Telemetry</h2>
        <div className="responsive-table">
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
                <th>Prep</th>
                <th>Mastery</th>
                <th>Streak</th>
                <th>XP</th>
                <th>Actions</th>
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
                    <td>
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
                    <td>{row.currentActivity}</td>
                    <td className="question-cell">{row.currentQuestion}</td>
                    <td>
                      {row.completed
                        ? `Day ${row.completedDay}, hour ${row.completedHour}`
                        : "In progress"}
                    </td>
                    <td>{row.mastery}%</td>
                    <td>{row.streak}d</td>
                    <td>{row.xp}</td>
                    <td>
                      <div className="table-actions">
                        <button type="button" className="btn-primary" onClick={() => onNudgeStudent(row.id)}>
                          Nudge
                        </button>
                        <button type="button" className="logout-btn" onClick={() => onRewardStudent(row.id)}>
                          Reward
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-panel" style={{ marginBottom: "20px" }}>
        <h2>Simulation Log</h2>
        {simulationLog.length === 0 ? (
          <p className="muted-copy">Run or step the simulation to create log entries.</p>
        ) : (
          <div className="question-list">
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

      <div className="glass-panel">
        <h2>Analysis Data Table</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Copy this table into chat when you want me to analyse completion patterns,
          mastery movement, or whether the algorithm is rewarding the right behavior.
        </p>
        <textarea className="input-field data-table-output" readOnly value={simulationCsv} />
        <button className="btn-primary" onClick={onCopySimulationData}>
          Copy Data Table
        </button>
      </div>
    </>
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
  const [nudges, setNudges] = useState([]);
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
  const [newClassName, setNewClassName] = useState("");
  const [classNameDrafts, setClassNameDrafts] = useState({});
  const [activeSubsection, setActiveSubsection] = useState(null);
  const [expandedChapters, setExpandedChapters] = useState([]);
  const [isHydrated, setIsHydrated] = useState(() => !currentUser);
  const [simulationDay, setSimulationDay] = useState(0);
  const [simulationHour, setSimulationHour] = useState(0);
  const [simulationDurationDays, setSimulationDurationDays] = useState(7);
  const [simulationSpeed, setSimulationSpeed] = useState(86400);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationLog, setSimulationLog] = useState([]);
  const [simulationClassFilter, setSimulationClassFilter] = useState("all");
  const [simulatedUserId, setSimulatedUserId] = useState("");
  const [simulationTeacherToolsVisible, setSimulationTeacherToolsVisible] =
    useState(true);

  const [blitzFilters, setBlitzFilters] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [blitzScore, setBlitzScore] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const timerRef = useRef(null);

  const [matchCards, setMatchCards] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchedIds, setMatchedIds] = useState([]);
  const [mismatchedPair, setMismatchedPair] = useState([]);
  const simulationTimerRef = useRef(null);
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
  const licenseSubjectIds = Array.isArray(activeLicense?.unlocked_subjects)
    ? activeLicense.unlocked_subjects
    : [DEFAULT_SUBJECT_ID];
  const activeClassSubjectIds = getClassSubjectIds(activeClass || {}, licenseSubjectIds);
  const activeClassSubjectKey = activeClassSubjectIds.join("|");
  const getSubjectLabel = (subjectId) =>
    curriculumSubjects.find((subject) => subject.id === subjectId)?.name ||
    String(subjectId || "").toUpperCase();

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
          !assignment.completedBy?.[effectiveStudentId]
      ),
    [assignments, effectiveStudentId, studentClassIds]
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
          const nextClassIds = getStudentClassIds(data);
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
            if (!Array.isArray(data.classes) || data.classes.length === 0) {
              setDoc(
                doc(db, "users", currentUser),
                { classes: nextClasses, lastUpdated: Date.now() },
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

    const unsub = onSnapshot(
      collection(db, "flagged_content"),
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
  }, [adminPreviewActive, adminSimulationActive, currentUser, isRootAdminIdentity, userRole]);

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
  }, [adminPreviewActive, adminSimulationActive, isRootAdminIdentity, view]);

  useEffect(() => {
    if (adminSimulationActive) return undefined;
    if (adminPreviewActive) return undefined;
    if (!db || !currentUser || currentUser === ROOT_ADMIN_ID) {
      setAssignments([]);
      return undefined;
    }

    const unsub = onSnapshot(
      collection(db, "assignments"),
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
  }, [adminPreviewActive, adminSimulationActive, currentUser]);

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
      return question ? `${question.id}: ${question.question.slice(0, 54)}...` : id;
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
      return question?.id || String(id || "Long answer");
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
        const completion = assignment?.completedBy?.[student.id];
        const activity = student.simulation?.currentActivity || "Waiting for next study window";
        const currentQuestion =
          student.simulation?.currentQuestion ||
          student.simulation?.currentCardId ||
          "No card active";
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
      contentId,
      contentType,
      subjectId: activeSubjectId,
      userId: currentUser || "anonymous",
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
        !assignment.completedBy?.[student.id]
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
        students.filter((student) => assignment.completedBy?.[student.id]).length,
      0
    );

    return {
      students,
      activeAssignments,
      completedCount,
      possibleCompletions,
    };
  };

  const getClassSeatCount = (classId) =>
    allUsersData.filter(
      (user) => user.role === "student" && getStudentClassIds(user).includes(classId)
    ).length;

  const getLicenseClassRecord = (classItem) =>
    (activeLicense?.classes || []).find((item) => item.id === classItem.id) || classItem;

  const saveClassDisplayName = async (classId) => {
    const draft = (classNameDrafts[classId] || "").trim();
    if (!classId || !draft) return;

    const nextUserClasses = teacherClasses.map((classItem) =>
      classItem.id === classId ? { ...classItem, name: draft } : classItem
    );
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
          { classes: nextUserClasses, lastUpdated: Date.now() },
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
          { classes: nextUserClasses, lastUpdated: Date.now() },
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
        const student = {
          id,
          name,
          role: "student",
          classCode: classId,
          classId,
          classIds: [classId],
          activeEngagements: randomInt(1, 14),
          xpTotal: randomInt(60, 420),
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
            nonCompletionRisk: profile.nonCompletionRisk,
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
    setSimulationClassFilter("all");
    setSimulatedUserId("");
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
    const simulatedTimestamp = Date.now() - Math.max(0, simulationTotalHours - safeHour) * HOUR_MS;
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
      const pressure = simulationTotalHours > 0 ? safeHour / simulationTotalHours : 0;
      const nudgeBoost = ((sim.nudgeCount || 0) + (autoNudgeActive ? 1 : 0)) * 0.055;
      const rewardBoost = (sim.rewardCount || 0) * 0.025;
      const motivation = clampValue((sim.motivation || 50) + (autoNudgeActive ? 10 : 0), 5, 100);
      const consistency = clampValue(sim.consistency || 50, 5, 100);
      const slackProbability = clampValue(
        (sim.slackProbability || 0.2) - (autoNudgeActive ? 0.05 : 0),
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
      const isWorking =
        !alreadyComplete &&
        studyWindow &&
        (Math.random() < clampValue(baseWorkChance, 0.04, 0.93) || plannedPush);
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
      let nextMotivation = motivation;
      let nextSlackProbability = slackProbability;
      let lastMessage = sim.lastMessage || "";
      let lastAutoNudgeDay = sim.lastAutoNudgeDay;
      let lastAutoRewardStreak = sim.lastAutoRewardStreak;

      if (shouldAutoNudgePrep) {
        lastAutoNudgeDay = safeDay;
        lastMessage = `Auto nudge: ${idleDays} idle days with prep due`;
      } else if (shouldAutoNudgeRefresh) {
        lastAutoNudgeDay = safeDay;
        lastMessage = `Auto nudge: ${idleDays} idle days, refresh suggested`;
      }

      if ((isWorking || isReviewing) && targetCards.length > 0) {
        const cardTouches = randomInt(1, Math.max(1, Math.round(3 * (sim.pace || 1))));
        activeNow += 1;
        currentActivity = isReviewing ? pickRandom(SIM_REVIEW_LABELS) : pickRandom(SIM_ACTIVITY_LABELS);

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
        currentActivity = Math.random() < 0.5 ? "Opened the app but did not answer" : "Ignoring active prep";
      }

      const mastery = assignment
        ? getAssignmentMastery(assignment, nextProgress, student.writtenProgress || {})
        : 0;
      if (
        assignment &&
        !alreadyComplete &&
        mastery >= targetMastery &&
        safeHour > 0 &&
        Math.random() > (sim.nonCompletionRisk || 0)
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

      nextProgressById[student.id] = nextProgress;
      return {
        ...student,
        activeEngagements: (student.activeEngagements || 0) + touchedCount,
        xpTotal: Math.round((student.xpTotal || 0) + xpEarned + rewardXp),
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
        !assignment.completedBy?.[student.id] &&
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
            lastMessage: "Nudged: reminder sent to restart active prep",
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
    const message = hasIncompletePrep
      ? `Reminder: your prep/homework is incomplete. Please open Active Prep and finish ${incompleteAssignments.length === 1 ? "it" : "your tasks"}.`
      : "Quick reminder: do a short refresh packet to keep your memory strong.";

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
      message,
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

  const nudgeIncompletePrepForClass = async () => {
    const targets = classroomStudents.filter(
      (student) => getIncompleteAssignmentsForStudent(student, getClassAssignments(activeClass?.id)).length > 0
    );

    if (targets.length === 0) {
      alert("Everyone in this class has completed the active prep.");
      return;
    }

    const results = await Promise.all(
      targets.map((student) => sendStudentNudge(student, "incomplete-prep", { silent: true }))
    );
    const sentCount = results.filter(Boolean).length;
    alert(`Nudged ${sentCount}/${targets.length} students with incomplete prep.`);
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
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(simulationCsv).then(
        () => alert("Simulation data copied."),
        () => alert("Could not copy automatically. Select the table text instead.")
      );
      return;
    }
    alert("Select the table text and copy it manually.");
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
    setUserName(`${adminProfile?.name || "Admin"} (Teacher Simulator)`);
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
    setUserName(`${adminProfile?.name || "Admin"} (Teacher Preview)`);
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
      await setDoc(
        doc(db, "users", currentUser),
        {
          xpTotal: increment(earned),
          lastXP: { earned, source, at: Date.now() },
          lastUpdated: Date.now(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error("XP write failed:", error);
    }

    return earned;
  };

  const markAssignmentComplete = async (assignment, mastery) => {
    const completionUserId =
      adminSimulationActive && simulatedUserId ? simulatedUserId : currentUser;
    if (!assignment || !completionUserId || assignment.completedBy?.[completionUserId]) return;

    const nextCompletedBy = {
      ...(assignment.completedBy || {}),
      [completionUserId]: {
        completedAt: Date.now(),
        mastery: Math.round(mastery),
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
      try {
        await setDoc(
          doc(db, "assignments", assignment.id),
          {
            completedBy: nextCompletedBy,
            updatedAt: Date.now(),
          },
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

  const createClass = async () => {
    const name = newClassName.trim();
    if (!name || !currentUser) return;

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
    const nextClass = { id, name, subjects: defaultSubjects };
    const nextClasses = [...teacherClasses, nextClass];
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
          { classes: nextClasses, lastUpdated: Date.now() },
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
      return;
    }

    if (!db) return;
    const assignmentRef = doc(collection(db, "assignments"));

    try {
      await setDoc(assignmentRef, payload);
      setAssignmentDeadline(formatDateTimeLocal(Date.now() + DAY_MS));
      setAssignmentTargetMastery(80);
    } catch (error) {
      console.error("Assignment create failed:", error);
    }
  };

  const saveAssignmentDeadline = async (assignment) => {
    if (!assignment) return;
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
      return;
    }

    if (!db) return;

    try {
      await setDoc(
        doc(db, "assignments", assignment.id),
        { status: "cancelled", updatedAt: Date.now() },
        { merge: true }
      );
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
          <span className="label">Active Prep</span>
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
          {context === "assignment" ? "Resume" : "Open Prep"}
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
    setNudges([]);
    setActiveAssignmentId("");
    setAssignmentDeadlineDrafts({});
    setClassNameDrafts({});
    setSimulationDay(0);
    setSimulationRunning(false);
    setSimulationLog([]);
    setSimulatedUserId("");
    setSimulationTeacherToolsVisible(true);
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
            const normalizedClassCode = classCodeInput.trim().toUpperCase();

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
              setLoginError("Class ID required for school registration.");
              return;
            }
            if (roleInput === "teacher" && licenseInput.trim() !== TEACHER_LICENSE) {
              setLoginError("Invalid teacher license key.");
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
                newUserData.classCode = normalizedClassCode;
                newUserData.classId = normalizedClassCode;
                newUserData.classIds = [normalizedClassCode];
              }
              if (roleInput === "teacher") {
                const defaultClass = createDefaultClass(emailAsId);
                newUserData.classCode = defaultClass.id;
                newUserData.classes = [defaultClass];
              }

              await setDoc(doc(db, "users", emailAsId), newUserData);
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
              placeholder="Enter Class ID"
              value={classCodeInput}
              onChange={(event) => setClassCodeInput(event.target.value)}
              required
              style={{ marginBottom: "15px", border: "1px solid var(--primary)" }}
            />
          )}

          {isSignUp && roleInput === "teacher" && (
            <input
              className="input-field"
              placeholder="Admin License Key"
              value={licenseInput}
              onChange={(event) => setLicenseInput(event.target.value)}
              required
              style={{ marginBottom: "15px", border: "1px solid var(--orange)" }}
            />
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
            onCurriculumEditor={() => setView("admin-curriculum")}
            onLogout={handleGlobalLogout}
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
            onCopySimulationData={copySimulationData}
            onCurriculum={() => {
              setAdminSimulationActive(false);
              setUserName(adminProfile?.name || "Admin");
              setUserRole("admin");
              setView("admin-curriculum");
            }}
            onGenerate={createSimulationCohort}
            onLogout={handleGlobalLogout}
            onNudgeStudent={nudgeSimulationStudent}
            onRewardStudent={rewardSimulationStudent}
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
            setSimulationDurationDays={setSimulationDurationDays}
            setSimulationSpeed={setSimulationSpeed}
          />
        );

      case "teacher-dashboard":
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
                  {teacherClasses.length} class{teacherClasses.length === 1 ? "" : "es"} connected
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
              Choose a class to inspect roster progress, prep completion, and active assignments.
            </p>

            {activeLicense && (
              <div className="glass-panel" style={{ marginBottom: "20px" }}>
                <h2>License & Seat Management</h2>
                <p style={{ color: "var(--text-muted)" }}>
                  {activeLicense.school_name} · {teacherClasses.length}/
                  {activeLicense.max_classes || "unlimited"} classes · up to{" "}
                  {activeLicense.max_seats_per_class || "unlimited"} seats per class
                </p>
                <div className="filter-list" style={{ marginBottom: 0 }}>
                  {teacherClasses.map((classItem) => {
                    const licenseClass = getLicenseClassRecord(classItem);
                    const subjectIds = getClassSubjectIds(licenseClass, licenseSubjectIds);
                    const seatCount = getClassSeatCount(classItem.id);

                    return (
                      <div
                        key={classItem.id}
                        className="filter-item glass-panel"
                        style={{ alignItems: "flex-start" }}
                      >
                        <div style={{ width: "100%" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                            <b>{classItem.name}</b>
                            <span style={{ color: "var(--orange)", fontWeight: "bold" }}>
                              {seatCount}/{activeLicense.max_seats_per_class || "∞"} seats
                            </span>
                          </div>
                          <div className="btn-group" style={{ marginTop: "12px" }}>
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
                              className="btn-primary"
                              type="button"
                              onClick={() => saveClassDisplayName(classItem.id)}
                            >
                              Save Name
                            </button>
                          </div>
                          <div className="btn-group" style={{ marginTop: "12px" }}>
                            {licenseSubjectIds.map((subjectId) => {
                              const enabled = subjectIds.includes(subjectId);
                              return (
                                <button
                                  key={subjectId}
                                  className={enabled ? "btn-primary" : "logout-btn"}
                                  type="button"
                                  onClick={() => toggleClassSubject(classItem.id, subjectId)}
                                  style={{
                                    opacity: enabled ? 1 : 0.72,
                                    width: "auto",
                                  }}
                                >
                                  {enabled ? "Unlocked" : "Locked"} · {getSubjectLabel(subjectId)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="glass-panel" style={{ marginBottom: "20px" }}>
              <h2>Create Class</h2>
              {activeLicense?.max_classes && (
                <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
                  {teacherClasses.length}/{activeLicense.max_classes} class slots used.
                </p>
              )}
              <div className="btn-group">
                <input
                  className="input-field"
                  placeholder="Class name, e.g. 11Y DT"
                  value={newClassName}
                  onChange={(event) => setNewClassName(event.target.value)}
                  style={{ marginBottom: 0 }}
                />
                <button className="btn-primary" onClick={createClass}>
                  Add
                </button>
              </div>
            </div>

            <div className="menu-grid">
              {teacherClasses.map((classItem) => {
                const stats = getClassStats(classItem.id);
                const prepText =
                  stats.possibleCompletions > 0
                    ? `${stats.completedCount}/${stats.possibleCompletions} Prep Completed`
                    : "No active prep";

                return (
                  <button
                    key={classItem.id}
                    className="menu-card"
                    onClick={() => {
                      setActiveClassId(classItem.id);
                      setView("class-view");
                    }}
                  >
                    <h2>{classItem.name}</h2>
                    <p>{prepText}</p>
                    <p>
                      {stats.students.length} students
                      {activeLicense?.max_seats_per_class
                        ? `/${activeLicense.max_seats_per_class} seats`
                        : ""}{" "}
                      · {stats.activeAssignments.length} active tasks
                    </p>
                    <p>
                      {getClassSubjectIds(
                        getLicenseClassRecord(classItem),
                        licenseSubjectIds
                      )
                        .map(getSubjectLabel)
                        .join(", ")}
                    </p>
                    <p style={{ fontSize: "0.75rem" }}>ID: {classItem.id}</p>
                  </button>
                );
              })}
            </div>
          </>
        );

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
        const showSimulationTeacherTools =
          adminSimulationActive && simulationTeacherToolsVisible;
        const showTeacherNudgeActions =
          userRole === "teacher" || adminSimulationActive || adminPreviewActive;
        const incompletePrepStudents = classroomStudents.filter(
          (student) => getIncompleteAssignmentsForStudent(student, classAssignments).length > 0
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
                <span className="label">Active Curriculum</span>
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

            <div className="glass-panel" style={{ marginBottom: "20px" }}>
              <h2>Assignment Engine</h2>
              <p style={{ color: "var(--text-muted)" }}>
                Open a chapter, then choose a whole topic, a subsection, or a long answer question.
              </p>
              <div className="selected-content-card">
                <span className="label">Selected Prep</span>
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
                            className={`question-picker ${chapterSelected ? "is-selected" : ""}`}
                            onClick={() => selectAssignmentTarget("chapter", chapter.id)}
                          >
                            <b>Set whole chapter prep</b>
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
                                className={`question-picker ${selected ? "is-selected" : ""}`}
                                onClick={() =>
                                  selectAssignmentTarget("subsection", subsection.id)
                                }
                              >
                                <b>Set subsection prep: {subsection.title}</b>
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

              <div className="filter-list" style={{ marginBottom: 0 }}>
                <label>
                  <span className="label">Deadline</span>
                  <input
                    className="input-field"
                    type="datetime-local"
                    value={assignmentDeadline}
                    onChange={(event) => setAssignmentDeadline(event.target.value)}
                  />
                </label>

                <label>
                  <span className="label">Target Mastery %</span>
                  <input
                    className="input-field"
                    type="number"
                    min="1"
                    max="100"
                    value={assignmentTargetMastery}
                    onChange={(event) => setAssignmentTargetMastery(event.target.value)}
                  />
                </label>

                <button className="btn-primary" onClick={createAssignment}>
                  Create Assignment
                </button>
              </div>
            </div>

            <div className="section-title-row">
              <h2 style={{ marginBottom: 0 }}>Active Prep</h2>
              {classAssignments.length > 0 && showTeacherNudgeActions && (
                <button className="btn-primary" onClick={nudgeIncompletePrepForClass}>
                  Nudge Incomplete Prep ({incompletePrepStudents.length})
                </button>
              )}
            </div>
            {classAssignments.length === 0 ? (
              <div className="glass-panel" style={{ marginBottom: "20px" }}>
                <p style={{ color: "var(--text-muted)", margin: 0 }}>
                  No active assignments for this class.
                </p>
              </div>
            ) : (
              classAssignments.map((assignment) => (
                <div key={assignment.id} className="glass-panel" style={{ marginBottom: "15px" }}>
                  <b>
                    {getAssignmentShortLabel(
                      assignment.targetType,
                      assignment.targetId,
                      assignment.subjectId
                    )}
                  </b>
                  <span className="table-subtext">{assignment.targetLabel}</span>
                  <p style={{ color: "var(--text-muted)" }}>
                    Target {assignment.targetMastery}% · {formatTimeRemaining(assignment.deadline, nowMs)}
                  </p>
                  <div className="btn-group">
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
                    <button className="btn-primary" onClick={() => saveAssignmentDeadline(assignment)}>
                      Save
                    </button>
                    <button
                      className="btn-red"
                      onClick={() => cancelAssignment(assignment)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ))
            )}

            <h2 style={{ marginBottom: "15px" }}>Roster</h2>
            <div className="glass-panel" style={{ padding: "0px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: "2px solid var(--glass-border)",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <th style={{ padding: "15px 20px", color: "var(--primary)" }}>
                      Student
                    </th>
                    <th style={{ padding: "15px 20px", color: "var(--primary)" }}>
                      Email
                    </th>
                    <th style={{ padding: "15px 20px", color: "var(--primary)", textAlign: "center" }}>
                      XP
                    </th>
                    <th style={{ padding: "15px 20px", color: "var(--primary)", textAlign: "center" }}>
                      Mastery
                    </th>
                    {showSimulationTeacherTools && (
                      <>
                        <th style={{ padding: "15px 20px", color: "var(--primary)" }}>
                          Status
                        </th>
                        <th style={{ padding: "15px 20px", color: "var(--primary)" }}>
                          Current Activity
                        </th>
                        <th style={{ padding: "15px 20px", color: "var(--primary)" }}>
                          Last Message
                        </th>
                      </>
                    )}
                    {showTeacherNudgeActions && (
                      <th style={{ padding: "15px 20px", color: "var(--primary)" }}>
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {classroomStudents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={
                          4 +
                          (showSimulationTeacherTools ? 3 : 0) +
                          (showTeacherNudgeActions ? 1 : 0)
                        }
                        style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}
                      >
                        No students have joined this class ID yet.
                      </td>
                    </tr>
                  ) : (
                    classroomStudents.map((student) => {
                      const studentProgress =
                        Object.keys(studentProgressById[student.id] || {}).length > 0
                          ? studentProgressById[student.id]
                          : student.progress || {};
                      const studentMastery = getSectionMastery(allCards, studentProgress);
                      const simRow = simulationRows.find((row) => row.id === student.id);

                      return (
                        <tr key={student.id} style={{ borderBottom: "1px solid var(--glass-border)" }}>
                          <td style={{ padding: "15px 20px", fontWeight: "bold" }}>
                            <button
                              type="button"
                              onClick={() => setSelectedStudentId(student.id)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--primary)",
                                fontWeight: "bold",
                                padding: 0,
                                textAlign: "left",
                              }}
                            >
                              {student.name || "Student"}
                            </button>
                          </td>
                          <td style={{ padding: "15px 20px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                            {student.id}
                          </td>
                          <td style={{ padding: "15px 20px", textAlign: "center", color: "var(--orange)" }}>
                            {Math.round(student.xpTotal || 0)}
                          </td>
                          <td style={{ padding: "15px 20px", textAlign: "center" }}>
                            <span style={{ color: getRingColor(studentMastery), fontWeight: "bold" }}>
                              {studentMastery}%
                            </span>
                          </td>
                          {showSimulationTeacherTools && (
                            <>
                              <td style={{ padding: "15px 20px" }}>
                                <span className={`status-pill ${(simRow?.status || "idle").toLowerCase()}`}>
                                  {simRow?.status || "Idle"}
                                </span>
                              </td>
                              <td style={{ padding: "15px 20px", color: "var(--text-muted)" }}>
                                {simRow?.currentActivity || "No activity yet"}
                              </td>
                              <td style={{ padding: "15px 20px", color: "var(--text-muted)" }}>
                                {simRow?.message || "No nudge or reward yet"}
                              </td>
                            </>
                          )}
                          {showTeacherNudgeActions && (
                            <td style={{ padding: "15px 20px" }}>
                              <div className="table-actions">
                                <button
                                  type="button"
                                  className="btn-primary"
                                  onClick={() => sendStudentNudge(student)}
                                >
                                  Nudge
                                </button>
                                {adminSimulationActive && (
                                  <button
                                    type="button"
                                    className="logout-btn"
                                    onClick={() => rewardSimulationStudent(student.id)}
                                  >
                                    Reward
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
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
                  style={{ maxWidth: "520px", maxHeight: "80dvh", overflowY: "auto" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "15px" }}>
                    <div>
                      <h2>{selectedStudent.name || selectedStudent.id}</h2>
                      <p style={{ color: "var(--text-muted)" }}>
                        {selectedStudent.streak?.current || 0} day streak · {Math.round(selectedStudent.xpTotal || 0)} XP
                      </p>
                      {(adminSimulationActive || selectedStudent.lastNudge) && (
                        <p style={{ color: "var(--text-muted)", marginTop: "6px" }}>
                          {adminSimulationActive
                            ? selectedStudent.simulation?.lastMessage || "No nudge or reward yet"
                            : selectedStudent.lastNudge?.message || "No nudge sent yet"}
                        </p>
                      )}
                    </div>
                    <div className="btn-group" style={{ marginTop: 0 }}>
                      {showTeacherNudgeActions && (
                        <>
                          <button
                            className="btn-primary"
                            onClick={() => sendStudentNudge(selectedStudent)}
                          >
                            Nudge Prep
                          </button>
                          {adminSimulationActive && (
                            <button
                              className="logout-btn"
                              onClick={() => rewardSimulationStudent(selectedStudent.id)}
                            >
                              Reward
                            </button>
                          )}
                        </>
                      )}
                      <button className="logout-btn" onClick={() => setSelectedStudentId("")}>
                        Close
                      </button>
                    </div>
                  </div>

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
                <h2>Teacher Nudges</h2>
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

            {studentAssignments.length > 0 && (
              <div className="glass-panel" style={{ marginBottom: "25px" }}>
                <h2>Active Prep</h2>
                <div className="filter-list" style={{ marginBottom: 0 }}>
                  {studentAssignments.map((assignment) => {
                    const mastery = getAssignmentMastery(assignment);
                    return (
                      <button
                        key={assignment.id}
                        className="filter-item glass-panel"
                        onClick={() => loadAssignment(assignment)}
                        style={{
                          color: "var(--text)",
                          textAlign: "left",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>
                          <b>{assignment.targetLabel}</b>
                          <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                            {formatTimeRemaining(assignment.deadline, nowMs)} · Target {assignment.targetMastery}%
                          </span>
                        </span>
                        <span style={{ color: getRingColor(mastery), fontWeight: "bold" }}>
                          {mastery}%
                        </span>
                      </button>
                    );
                  })}
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
              <button className="menu-card" aria-label="Insights" onClick={() => setView("insights-dashboard")}>
                <h2>Insights</h2>
                <p>Your Mastery</p>
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
            <h1 style={{ marginBottom: "20px" }}>Your Insights</h1>
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
            <div className="glass-panel" style={{ padding: "0px", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--glass-border)", background: "rgba(255,255,255,0.05)" }}>
                    <th style={{ padding: "15px 20px", color: "var(--primary)" }}>Rank</th>
                    <th style={{ padding: "15px 20px", color: "var(--primary)" }}>Student</th>
                    <th style={{ padding: "15px 20px", color: "var(--primary)", textAlign: "center" }}>XP</th>
                    <th style={{ padding: "15px 20px", color: "var(--primary)", textAlign: "center" }}>Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedUsers.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)" }}>
                        Waiting for class data to synchronize.
                      </td>
                    </tr>
                  ) : (
                    rankedUsers.map((user, index) => {
                      const rank = index + 1;
                      const tier = getRankTier(rank);
                      const isCurrentUser = user.id === effectiveStudentId;
                      const displayString =
                        user.name || (user.id?.includes("@") ? user.id.split("@")[0] : user.id);

                      return (
                        <tr
                          key={user.id}
                          style={{
                            borderBottom: "1px solid var(--glass-border)",
                            background: isCurrentUser ? "rgba(59, 130, 246, 0.1)" : "transparent",
                            fontWeight: isCurrentUser ? "bold" : "normal",
                          }}
                        >
                          <td style={{ padding: "15px 20px" }}>
                            <span className={tier.className}>{tier.label}</span>
                          </td>
                          <td style={{ padding: "15px 20px", textTransform: "capitalize" }}>
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
                          <td style={{ padding: "15px 20px", textAlign: "center", color: "var(--orange)" }}>
                            {Math.round(user.xpTotal || 0)}
                          </td>
                          <td style={{ padding: "15px 20px", textAlign: "center", color: "var(--text-muted)" }}>
                            {user.streak?.current || 0} days
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
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
