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
  setDoc,
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
  const subject = String(curriculum.subject || curriculum.id || DEFAULT_SUBJECT_ID)
    .trim()
    .toLowerCase();

  return {
    id: subject,
    subject,
    subjectName:
      curriculum.subjectName ||
      curriculum.title ||
      (subject === DEFAULT_SUBJECT_ID ? "Design Technology" : subject.toUpperCase()),
    title:
      curriculum.title ||
      curriculum.subjectName ||
      (subject === DEFAULT_SUBJECT_ID ? "Design Technology" : subject.toUpperCase()),
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
  onSeedMockEnvironment,
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
  const [activeSubsection, setActiveSubsection] = useState(null);
  const [expandedChapters, setExpandedChapters] = useState([]);
  const [isHydrated, setIsHydrated] = useState(() => !currentUser);

  const [blitzFilters, setBlitzFilters] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [blitzScore, setBlitzScore] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const timerRef = useRef(null);

  const [matchCards, setMatchCards] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchedIds, setMatchedIds] = useState([]);
  const [mismatchedPair, setMismatchedPair] = useState([]);
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

  const studentAssignments = useMemo(
    () =>
      assignments.filter(
        (assignment) =>
          assignment.status === "active" &&
          studentClassIds.includes(assignment.classId) &&
          !assignment.completedBy?.[currentUser]
      ),
    [assignments, currentUser, studentClassIds]
  );

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
    if (view === "login") {
      if (userRole === "admin") setView("admin-curriculum");
      else setView(userRole === "teacher" ? "teacher-dashboard" : "menu");
    }
  }, [
    currentUser,
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
  }, [currentUser, isRootAdminIdentity, userRole]);

  useEffect(() => {
    if (
      !db ||
      isRootAdminIdentity ||
      !["leaderboard", "teacher-dashboard", "class-view", "admin-dashboard", "admin-curriculum"].includes(view)
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
  }, [isRootAdminIdentity, view]);

  useEffect(() => {
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
  }, [currentUser]);

  useEffect(() => {
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
  }, [classroomStudentIds, isRootAdminIdentity, view]);

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
    if (!currentUser || currentUser === ROOT_ADMIN_ID || !db || !isHydrated) return;

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

    const chapter = (labelCurriculum.chapters || []).find((item) => item.id === id);
    return chapter?.title || id;
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
          subject: normalized.id,
          subjectName: normalized.subjectName,
          title: normalized.title,
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

    if (isRootAdmin || !db || !currentUser || currentUser === ROOT_ADMIN_ID) {
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

    if (isRootAdmin || !db || !currentUser || !activeLicense.id) return;

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

  const simulateStudentDashboard = () => {
    const seeded = allUsersData.length === 0 ? seedMockEnvironment() : null;
    const sourceUsers = seeded?.mockStudents || allUsersData;
    const mockStudent =
      sourceUsers.find((user) => user.role === "student" && getStudentClassIds(user).includes("11Y-TEST")) ||
      sourceUsers.find((user) => user.role === "student");

    if (mockStudent) {
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
    if (teacherClasses.length === 0 || allUsersData.length === 0) seedMockEnvironment();
    setUserName("Super Admin (Teacher Simulator)");
    setUserRole("teacher");
    setActiveClassId(activeClassId || "11Y-TEST");
    setView("teacher-dashboard");
  };

  const returnToAdminControl = () => {
    setUserName("Super Admin");
    setUserRole("admin");
    setActiveAssignmentId("");
    setSelectedStudentId("");
    setView("admin-control");
  };

  const recordEngagement = async (type, metadata = {}) => {
    setEngagementCount((prev) => prev + 1);
    if (!currentUser || currentUser === ROOT_ADMIN_ID || !db || !isHydrated) return;

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

    if (!currentUser || currentUser === ROOT_ADMIN_ID || !db || !isHydrated) return earned;

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
    if (!assignment || !currentUser || assignment.completedBy?.[currentUser]) return;

    const nextCompletedBy = {
      ...(assignment.completedBy || {}),
      [currentUser]: {
        completedAt: Date.now(),
        mastery: Math.round(mastery),
      },
    };

    if (isRootAdmin) {
      setAssignments((prev) =>
        prev.map((item) =>
          item.id === assignment.id
            ? { ...item, completedBy: nextCompletedBy, updatedAt: Date.now() }
            : item
        )
      );
      await awardXP(BASE_XP.assignment, Math.max(1, mastery / 100), "assignment");
      setActiveAssignmentId("");
      return;
    }

    if (db && currentUser !== ROOT_ADMIN_ID) {
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

    if (isRootAdmin) return;
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

    if (isRootAdmin) {
      const localAssignment = {
        id: `mock-${Date.now().toString(36)}`,
        ...payload,
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

    if (isRootAdmin) {
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

    if (isRootAdmin) {
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
  };

  const processAnswer = async (cardId, isCorrect) => {
    if (!cardId) return null;

    const cardData = buildCardProgress(cardId, isCorrect);

    setProgress((prev) => ({ ...prev, [cardId]: cardData }));
    recordEngagement("flashcard-answer", { cardId, isCorrect });

    if (!currentUser || currentUser === ROOT_ADMIN_ID || !db || !isHydrated) return cardData;

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

  const toggleChapter = (id) =>
    setExpandedChapters((prev) =>
      prev.includes(id) ? prev.filter((chapterId) => chapterId !== id) : [...prev, id]
    );

  const handleGlobalLogout = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
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
    setActiveAssignmentId("");
    setAssignmentDeadlineDrafts({});
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
            onSeedMockEnvironment={seedMockEnvironment}
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
                <button className="logout-btn" onClick={handleGlobalLogout}>
                  Logout
                </button>
              </div>
            </div>
            <AdminCurriculumEditor
              curriculums={curriculums}
              flaggedContent={flaggedContent}
              onSaveFlashcard={saveFlashcardQuestion}
              onSaveWrittenQuestion={saveWrittenQuestion}
              onSeedDefaultCurriculum={seedDefaultCurriculum}
              onSelectSubject={setActiveSubjectId}
              selectedSubjectId={activeSubjectId}
            />
          </>
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
              <button className="logout-btn" onClick={handleGlobalLogout}>
                Logout
              </button>
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
            <button className="back-link" onClick={() => setView("teacher-dashboard")}>
              Back to Classes
            </button>
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
              <div className="filter-list" style={{ marginBottom: 0 }}>
                <label>
                  <span className="label">Assignment Type</span>
                  <select
                    className="input-field"
                    value={assignmentTargetType}
                    onChange={(event) => {
                      const nextType = event.target.value;
                      setAssignmentTargetType(nextType);
                      setAssignmentTargetId(
                        nextType === "essay" ? curriculumWrittenData[0]?.id || "" : curriculumFlashcardData[0]?.id || ""
                      );
                    }}
                  >
                    <option value="chapter">Flashcard Topic</option>
                    <option value="essay">Written Essay</option>
                  </select>
                </label>

                <label>
                  <span className="label">Target Content</span>
                  <select
                    className="input-field"
                    value={assignmentTargetId}
                    onChange={(event) => setAssignmentTargetId(event.target.value)}
                  >
                    {assignmentTargetType === "essay"
                      ? curriculumWrittenData.map((question) => (
                          <option key={question.id} value={question.id}>
                            {question.id} · {question.topic}
                          </option>
                        ))
                      : curriculumFlashcardData.map((chapter) => (
                          <option key={chapter.id} value={chapter.id}>
                            {chapter.title}
                          </option>
                        ))}
                  </select>
                </label>

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

            <h2 style={{ marginBottom: "15px" }}>Active Prep</h2>
            {classAssignments.length === 0 ? (
              <div className="glass-panel" style={{ marginBottom: "20px" }}>
                <p style={{ color: "var(--text-muted)", margin: 0 }}>
                  No active assignments for this class.
                </p>
              </div>
            ) : (
              classAssignments.map((assignment) => (
                <div key={assignment.id} className="glass-panel" style={{ marginBottom: "15px" }}>
                  <b>{assignment.targetLabel}</b>
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
                  </tr>
                </thead>
                <tbody>
                  {classroomStudents.length === 0 ? (
                    <tr>
                      <td
                        colSpan="4"
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
                    </div>
                    <button className="logout-btn" onClick={() => setSelectedStudentId("")}>
                      Close
                    </button>
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

      case "menu":
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

      case "learn-dashboard":
        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              Back to Menu
            </button>
            <h1 style={{ marginBottom: "25px" }}>Learn</h1>
            {curriculumFlashcardData.map((chapter) => {
              const chapterCards = getCardsForChapter(chapter);
              const expanded = expandedChapters.includes(chapter.id);
              const mastery = getSectionMastery(chapterCards);

              return (
                <section key={chapter.id} className="glass-panel" style={{ marginBottom: "15px" }}>
                  <button
                    type="button"
                    onClick={() => toggleChapter(chapter.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "none",
                      border: "none",
                      color: "var(--text)",
                      padding: 0,
                      textAlign: "left",
                    }}
                  >
                    <span>
                      <b>{chapter.title}</b>
                      <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        {chapterCards.length} cards
                      </span>
                    </span>
                    <MasteryRing score={mastery} color={getRingColor(mastery)} />
                  </button>

                  {expanded && (
                    <div className="filter-list" style={{ marginTop: "20px", marginBottom: 0 }}>
                      {(chapter.subsections || []).map((subsection) => (
                        <button
                          key={subsection.id}
                          className="filter-item glass-panel"
                          onClick={() => {
                            setActiveSubsection(subsection);
                            setView("learn-page");
                          }}
                          style={{
                            color: "var(--text)",
                            textAlign: "left",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>{subsection.title}</span>
                          <span style={{ color: "var(--text-muted)" }}>
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
              const questionCount = getChapterQuestions(chapter.id).length;

              return (
                <div key={chapter.id} className="glass-panel" style={{ marginBottom: "15px" }}>
                  <h2>{chapter.title}</h2>
                  <p style={{ color: "var(--text-muted)" }}>
                    {cardCount} flashcards · {questionCount} written questions
                  </p>
                  <div className="btn-group">
                    <button className="btn-primary" onClick={() => startTopicQuiz(chapter.id)}>
                      Flashcards
                    </button>
                    <button className="btn-primary" onClick={() => startTopicWrittenQuiz(chapter.id)}>
                      Written
                    </button>
                  </div>
                </div>
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
                      const isCurrentUser = user.id === currentUser;
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
                          <td style={{ padding: "15px 20px" }}>{index + 1}</td>
                          <td style={{ padding: "15px 20px", textTransform: "capitalize" }}>
                            {displayString}{" "}
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
    <div className="app-main-wrapper">
      {isRootAdmin && view !== "admin-control" && (
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
