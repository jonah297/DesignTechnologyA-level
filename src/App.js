import React, { useState, useEffect, useRef } from "react";
import { flashcardData, writtenData } from "./data";
import { db } from "./firebase";
import { doc, setDoc, collection, onSnapshot } from "firebase/firestore";
import "./styles.css";

const AUTHORIZED_USERS = {
  jonah: "JonahPass123",
  oli: "OliPass456",
  leo: "LeoPass789",
  theo: "TheoPass321",
  admin: "admin",
  test: "6767",
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return localStorage.getItem("current_user") || null;
    } catch (e) {
      return null;
    }
  });

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("theme") || "dark";
    } catch (e) {
      return "dark";
    }
  });

  const [view, setView] = useState(currentUser ? "menu" : "login");
  const [loginInput, setLoginInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [progress, setProgress] = useState({});
  const [writtenProgress, setWrittenProgress] = useState({});
  const [streak, setStreak] = useState({ current: 0, longest: 0, lastDate: 0 });
  const [quizQueue, setQuizQueue] = useState([]);
  const [quizType, setQuizType] = useState("topic");
  const [allUsersData, setAllUsersData] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeSubsection, setActiveSubsection] = useState(null);

  // UX UI Dropdown State
  const [expandedChapters, setExpandedChapters] = useState([]);

  const [blitzFilters, setBlitzFilters] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [blitzScore, setBlitzScore] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    document.body.className = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch (e) {}
  }, [theme]);

  useEffect(() => {
    if (currentUser && currentUser !== "admin" && db) {
      const unsub = onSnapshot(doc(db, "users", currentUser), (docSnap) => {
        if (docSnap.exists()) {
          setProgress(docSnap.data().progress || {});
          setWrittenProgress(docSnap.data().writtenProgress || {});
          setStreak(
            docSnap.data().streak || { current: 0, longest: 0, lastDate: 0 }
          );
        }
      });
      return () => unsub();
    }
  }, [currentUser]);

  useEffect(() => {
    if ((view === "admin-dashboard" || view === "leaderboard") && db) {
      const unsub = onSnapshot(collection(db, "users"), (snap) => {
        setAllUsersData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
      return () => unsub();
    }
  }, [view]);

  const saveToCloud = async (
    newProgress,
    type = "flashcards",
    newStreak = streak
  ) => {
    if (!currentUser || currentUser === "admin") return;
    try {
      const payload = { lastUpdated: Date.now(), streak: newStreak };
      if (type === "flashcards") payload.progress = newProgress;
      if (type === "written") payload.writtenProgress = newProgress;
      await setDoc(doc(db, "users", currentUser), payload, { merge: true });
    } catch (e) {
      console.error("Cloud Save Error:", e);
    }
  };

  const calculateMastery = (cardId, currentProgress = progress) => {
    const p = currentProgress[cardId];
    if (!p) return 0;

    let startingMastery = p.baseMastery;
    let consecutive = p.consecutiveCorrect || 0;
    let currentInterval = p.interval || 1;

    if (startingMastery === undefined) {
      if (p.status === "correct") {
        startingMastery = 100;
        consecutive = currentInterval > 1 ? 3 : 2;
      } else {
        startingMastery = 0;
      }
    }

    const safeLastSeen = p.lastSeen || Date.now();
    const daysPassed = Math.max(
      0,
      (Date.now() - safeLastSeen) / (1000 * 60 * 60 * 24)
    );

    const isShielded = consecutive >= 3;
    const decayRate = isShielded ? 0.1 : 1.5 / Math.max(1, currentInterval);

    let currentMastery = startingMastery - daysPassed * decayRate;
    return Math.max(0, Math.min(100, Math.round(currentMastery) || 0));
  };

  const getSectionMastery = (cards, prog = progress) => {
    if (!cards || cards.length === 0) return 0;
    const total = cards.reduce(
      (acc, card) => acc + calculateMastery(card.id, prog),
      0
    );
    return Math.round(total / cards.length) || 0;
  };

  const getRingColor = (score) => {
    if (score >= 80) return "var(--green)";
    if (score >= 50) return "#f59e0b"; // Orange
    return "var(--red)"; // Red
  };

  const startRefreshPacket = () => {
    const dueCards = flashcardData
      .flatMap((ch) => ch.subsections.flatMap((s) => s.cards))
      .filter((c) => calculateMastery(c.id) < 80)
      .sort((a, b) => calculateMastery(a.id) - calculateMastery(b.id));

    if (dueCards.length > 0) {
      setQuizType("refresh");
      setQuizQueue(dueCards.slice(0, 6).map((c) => c.id));
      setView("quiz-session");
    } else {
      alert(
        "Mastery is high! You have no decayed topics to refresh right now. Great job!"
      );
    }
  };

  const handleFlashcardAnswer = (isCorrect, mode) => {
    const currentId = quizQueue[0];
    const p = progress[currentId] || {};

    let startingMastery =
      p.baseMastery !== undefined
        ? p.baseMastery
        : p.status === "correct"
        ? 100
        : 0;
    let consecutive =
      p.consecutiveCorrect !== undefined
        ? p.consecutiveCorrect
        : p.interval > 0
        ? 1
        : 0;
    let currentInterval = p.interval || 1;

    const timeSinceLastSeen = Date.now() - (p.lastSeen || 0);
    const isCramming = timeSinceLastSeen < 1000 * 60 * 60 * 12;

    let newBaseMastery;
    let newConsecutive = consecutive;
    let newInterval = currentInterval;

    if (isCorrect) {
      newBaseMastery = Math.min(100, startingMastery + (isCramming ? 5 : 25));
      if (!isCramming) {
        newConsecutive += 1;
        newInterval *= 2;
      }
    } else {
      newBaseMastery = Math.max(0, startingMastery - 30);
      newConsecutive = 0;
      newInterval = 1;
    }

    const newProgress = {
      ...progress,
      [currentId]: {
        baseMastery: newBaseMastery,
        consecutiveCorrect: newConsecutive,
        lastSeen: Date.now(),
        status: isCorrect ? "correct" : "incorrect",
        interval: newInterval,
      },
    };

    let newStreak = { ...streak };
    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    if (newStreak.lastDate !== today) {
      const yesterday = today - 86400000;
      if (newStreak.lastDate === yesterday) newStreak.current += 1;
      else newStreak.current = 1;
      if (newStreak.current > newStreak.longest)
        newStreak.longest = newStreak.current;
      newStreak.lastDate = today;
      setStreak(newStreak);
    }

    if (mode === "blitz" && isCorrect) setBlitzScore((s) => s + 1);
    setProgress(newProgress);
    saveToCloud(newProgress, "flashcards", newStreak);

    let nQ = [...quizQueue];
    nQ.shift();
    if (!isCorrect && mode !== "blitz")
      nQ.splice(Math.min(2, nQ.length), 0, currentId);

    if (nQ.length === 0 || (mode === "blitz" && timeLeft === 0)) {
      clearInterval(timerRef.current);
      setView(mode === "blitz" ? "blitz-done" : "quiz-done");
    } else {
      setQuizQueue(nQ);
    }
  };

  const handleWrittenAnswer = (score, maxMarks) => {
    const currentId = quizQueue[0];
    const currentData = writtenProgress[currentId] || { attempts: 0 };
    const newWrittenProgress = {
      ...writtenProgress,
      [currentId]: {
        attempts: currentData.attempts + 1,
        last_score: (score / maxMarks) * 100,
        timestamp: Date.now(),
      },
    };
    setWrittenProgress(newWrittenProgress);
    saveToCloud(newWrittenProgress, "written");
    let nQ = [...quizQueue];
    nQ.shift();
    if (nQ.length === 0) setView("written-done");
    else setQuizQueue(nQ);
  };

  const startWrittenQuiz = () => {
    const sortedIds = [...writtenData]
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
        if (progA.last_score !== progB.last_score)
          return progA.last_score - progB.last_score;
        return progA.timestamp - progB.timestamp;
      })
      .map((q) => q.id);
    setQuizQueue(sortedIds.slice(0, 6));
    setView("written-session");
  };

  const startBlitz = () => {
    if (blitzFilters.length === 0) {
      alert("Please select at least one topic!");
      return;
    }
    const filteredCards = flashcardData
      .filter((ch) => blitzFilters.includes(ch.id))
      .flatMap((ch) => ch.subsections.flatMap((s) => s.cards || []));
    setQuizQueue(
      [...filteredCards].sort(() => 0.5 - Math.random()).map((c) => c.id)
    );
    setBlitzScore(0);
    setTimeLeft(60);
    setView("speed-blitz");
    timerRef.current = setInterval(() => {
      setTimeLeft((p) => {
        if (p <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return p - 1;
      });
    }, 1000);
  };

  const toggleTheme = () =>
    setTheme((prev) => (prev === "light" ? "dark" : "light"));

  // UX Fix: The Toggle function for the Accordion UI
  const toggleChapter = (id) => {
    setExpandedChapters((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const renderView = () => {
    switch (view) {
      case "login":
        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "70vh",
            }}
          >
            <div
              className="login-box glass-panel"
              style={{ width: "100%", padding: "40px 30px" }}
            >
              <h1
                style={{
                  fontSize: "2.5rem",
                  marginBottom: "30px",
                  textAlign: "center",
                }}
              >
                D&T Hub
              </h1>
              {loginError && (
                <p
                  style={{
                    color: "var(--red)",
                    fontWeight: "bold",
                    textAlign: "center",
                  }}
                >
                  {loginError}
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = loginInput.trim().toLowerCase();
                  if (AUTHORIZED_USERS[n] === passwordInput) {
                    try {
                      localStorage.setItem("current_user", n);
                    } catch (err) {}
                    setCurrentUser(n);
                    setView("menu");
                  } else setLoginError("Invalid Login.");
                }}
              >
                <input
                  className="input-field"
                  placeholder="Username"
                  onChange={(e) => setLoginInput(e.target.value)}
                  required
                  style={{ marginBottom: "20px" }}
                />
                <div
                  className="password-wrapper"
                  style={{ marginBottom: "30px" }}
                >
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "👁️" : "🙈"}
                  </button>
                </div>
                <button
                  className="btn-primary"
                  type="submit"
                  style={{ padding: "15px" }}
                >
                  Log In
                </button>
              </form>
            </div>

            <div
              style={{
                marginTop: "50px",
                animation: "floatShapes 12s infinite ease-in-out",
                zIndex: 5,
              }}
            >
              <svg
                width="110"
                height="110"
                viewBox="0 0 100 100"
                style={{ filter: "drop-shadow(0 15px 25px rgba(0,0,0,0.3))" }}
              >
                <defs>
                  <linearGradient
                    id="cogGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop
                      offset="0%"
                      stopColor={theme === "dark" ? "#818cf8" : "#bfdbfe"}
                    />
                    <stop
                      offset="100%"
                      stopColor={theme === "dark" ? "#312e81" : "#4f46e5"}
                    />
                  </linearGradient>
                </defs>
                <path
                  d="M43 5 L57 5 L59 15 A35 35 0 0 1 68 20 L77 13 L87 23 L80 32 A35 35 0 0 1 85 41 L95 43 L95 57 L85 59 A35 35 0 0 1 80 68 L87 77 L77 87 L68 80 A35 35 0 0 1 59 85 L57 95 L43 95 L41 85 A35 35 0 0 1 32 80 L23 87 L13 77 L20 68 A35 35 0 0 1 15 59 L5 57 L5 43 L15 41 A35 35 0 0 1 20 32 L13 23 L23 13 L32 20 A35 35 0 0 1 41 15 Z"
                  fill="url(#cogGrad)"
                  opacity="0.9"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="24"
                  fill="rgba(255,255,255,0.15)"
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth="3"
                />
                <text
                  x="50"
                  y="59"
                  fontSize="26"
                  fontWeight="900"
                  fill="#ffffff"
                  textAnchor="middle"
                  style={{ textShadow: "0 2px 5px rgba(0,0,0,0.3)" }}
                >
                  DT
                </text>
              </svg>
            </div>
          </div>
        );
      case "menu":
        return (
          <>
            <div
              className="user-bar glass-panel"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <span style={{ display: "block", fontSize: "1.2rem" }}>
                  <b style={{ textTransform: "capitalize" }}>{currentUser}</b>
                </span>
                <span
                  className={`streak-flame ${
                    streak.current > 0 ? "active" : ""
                  }`}
                >
                  🔥 {streak.current} Day Streak
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  alignItems: "flex-end",
                }}
              >
                <button
                  className="theme-toggle-btn"
                  style={{ marginRight: 0 }}
                  onClick={toggleTheme}
                >
                  {theme === "light" ? "🌙 Dark" : "☀️ Light"}
                </button>
                <button
                  className="logout-btn"
                  onClick={() => {
                    setCurrentUser(null);
                    setView("login");
                    try {
                      localStorage.removeItem("current_user");
                    } catch (e) {}
                  }}
                >
                  Logout
                </button>
              </div>
            </div>
            <h1
              style={{
                marginBottom: "25px",
                textShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              Main Menu
            </h1>
            <div className="menu-grid">
              <div
                className="menu-card glass-panel"
                onClick={() => setView("learn-dashboard")}
              >
                <h2>📖 Learn</h2>
                <p>Review Content</p>
              </div>
              <div
                className="menu-card glass-panel"
                onClick={() => setView("quiz-dashboard")}
              >
                <h2>📝 Quiz</h2>
                <p>Practice Topics</p>
              </div>
              <div
                className="menu-card glass-panel admin-feature"
                onClick={startWrittenQuiz}
              >
                <h2>✍️ Long Answer</h2>
                <p>Self-Marking Module</p>
              </div>
              <div
                className="menu-card glass-panel"
                onClick={startRefreshPacket}
              >
                <h2>🔄 Refresh</h2>
                <p>Fix Decayed Memory</p>
              </div>
              <div
                className="menu-card glass-panel"
                onClick={() => setView("insights-dashboard")}
              >
                <h2>📊 Insights</h2>
                <p>Your Mastery</p>
              </div>
              <div
                className="menu-card glass-panel"
                onClick={() => {
                  setBlitzFilters(flashcardData.map((ch) => ch.id));
                  setView("blitz-setup");
                }}
              >
                <h2>⚡ Blitz</h2>
                <p>Timed Challenge</p>
              </div>
              <div
                className="menu-card glass-panel"
                onClick={() => setView("leaderboard")}
              >
                <h2>🏆 Ranks</h2>
                <p>Global Board</p>
              </div>
              {currentUser === "admin" && (
                <div
                  className="menu-card glass-panel"
                  style={{
                    background: "var(--text)",
                    color: "var(--bg-color)",
                  }}
                  onClick={() => setView("admin-dashboard")}
                >
                  <h2>👑 Admin</h2>
                </div>
              )}
            </div>
          </>
        );
      case "insights-dashboard":
        const allCards = flashcardData.flatMap((ch) =>
          ch.subsections.flatMap((s) => s.cards)
        );
        const totalMastery = getSectionMastery(allCards);
        const shieldedCount = allCards.filter(
          (c) =>
            progress[c.id]?.consecutiveCorrect >= 3 ||
            progress[c.id]?.interval > 1
        ).length;

        const attemptedWrittenIds = Object.keys(writtenProgress);
        const totalWrittenAttempted = attemptedWrittenIds.length;
        const avgWrittenScore =
          totalWrittenAttempted > 0
            ? Math.round(
                attemptedWrittenIds.reduce(
                  (acc, id) => acc + writtenProgress[id].last_score,
                  0
                ) / totalWrittenAttempted
              )
            : 0;

        return (
          <div className="app-container">
            <button className="back-link" onClick={() => setView("menu")}>
              ← Back to Menu
            </button>
            <h1 style={{ marginBottom: "20px" }}>📊 Your Insights</h1>

            <div
              className="glass-panel"
              style={{
                padding: "30px",
                marginBottom: "20px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "3rem",
                  fontWeight: "bold",
                  color: "var(--primary)",
                }}
              >
                {totalMastery}%
              </div>
              <div style={{ color: "var(--text-muted)" }}>
                Overall D&T Mastery
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "15px",
                marginBottom: "25px",
              }}
            >
              <div
                className="glass-panel"
                style={{ padding: "20px", textAlign: "center" }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "5px" }}>🛡️</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                  {shieldedCount}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Shielded Cards
                  <br />
                  (Got right 3x in a row)
                </div>
              </div>
              <div
                className="glass-panel"
                style={{ padding: "20px", textAlign: "center" }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "5px" }}>🔥</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                  {streak.longest}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Longest Streak
                  <br />
                  (Days)
                </div>
              </div>
              <div
                className="glass-panel"
                style={{ padding: "20px", textAlign: "center" }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "5px" }}>✍️</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                  {avgWrittenScore}%
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Avg. Essay Score
                  <br />
                  (Mark Scheme)
                </div>
              </div>
              <div
                className="glass-panel"
                style={{ padding: "20px", textAlign: "center" }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "5px" }}>📝</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                  {totalWrittenAttempted}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Essays Finished
                  <br />
                  (Out of {writtenData.length})
                </div>
              </div>
            </div>

            <h2 style={{ marginBottom: "15px" }}>Topic Breakdown</h2>
            {flashcardData.map((ch) => {
              const chapMastery = getSectionMastery(
                ch.subsections.flatMap((s) => s.cards)
              );
              return (
                <div
                  key={ch.id}
                  className="glass-panel"
                  style={{
                    padding: "20px",
                    marginBottom: "15px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <b style={{ fontSize: "1.1rem" }}>{ch.title}</b>
                  <MasteryRing
                    score={chapMastery}
                    color={getRingColor(chapMastery)}
                  />
                </div>
              );
            })}
          </div>
        );
      case "blitz-setup":
        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              ← Back to Menu
            </button>
            <div className="glass-panel" style={{ padding: "30px" }}>
              <h1 style={{ marginBottom: "20px" }}>⚡ Blitz Settings</h1>
              <div
                style={{ display: "flex", gap: "10px", marginBottom: "25px" }}
              >
                <button
                  className="btn-small"
                  onClick={() =>
                    setBlitzFilters(flashcardData.map((ch) => ch.id))
                  }
                >
                  Select All
                </button>
                <button
                  className="btn-small"
                  style={{ background: "var(--text-muted)" }}
                  onClick={() => setBlitzFilters([])}
                >
                  Clear All
                </button>
              </div>
              <div className="filter-list">
                {flashcardData.map((ch) => (
                  <label
                    key={ch.id}
                    className="filter-item glass-panel"
                    style={{ padding: "10px 15px", marginBottom: "8px" }}
                  >
                    <input
                      type="checkbox"
                      checked={blitzFilters.includes(ch.id)}
                      onChange={() => {
                        setBlitzFilters((prev) =>
                          prev.includes(ch.id)
                            ? prev.filter((id) => id !== ch.id)
                            : [...prev, ch.id]
                        );
                      }}
                    />
                    <span>{ch.title}</span>
                  </label>
                ))}
              </div>
              <button
                className="btn-primary"
                style={{ marginTop: "30px" }}
                onClick={startBlitz}
              >
                Start Blitz!
              </button>
            </div>
          </>
        );
      case "speed-blitz":
        return (
          <>
            <div className="blitz-header glass-panel">
              <button
                className="back-link"
                style={{ margin: 0 }}
                onClick={() => {
                  clearInterval(timerRef.current);
                  setView("menu");
                }}
              >
                ← Quit
              </button>
              <span className={timeLeft < 10 ? "timer panic" : "timer"}>
                ⏳ {timeLeft}s
              </span>
              <span className="score">🔥 {blitzScore}</span>
            </div>
            {timeLeft > 0 ? (
              <QuizCard
                card={flashcardData
                  .flatMap((ch) => ch.subsections.flatMap((s) => s.cards))
                  .find((c) => c.id === quizQueue[0])}
                onAnswer={(c) => handleFlashcardAnswer(c, "blitz")}
              />
            ) : null}
          </>
        );
      case "blitz-done":
        return (
          <div
            className="flashcard glass-panel"
            style={{ textAlign: "center", position: "relative" }}
          >
            <h2>Time's Up!</h2>
            <div style={{ fontSize: "4rem", margin: "20px 0" }}>
              🔥 {blitzScore}
            </div>
            <button className="btn-primary" onClick={() => setView("menu")}>
              Back to Menu
            </button>
          </div>
        );
      case "admin-dashboard":
        return (
          <>
            <button
              className="back-link"
              onClick={() => {
                if (selectedStudent) setSelectedStudent(null);
                else setView("menu");
              }}
            >
              ← Back
            </button>
            {!selectedStudent ? (
              <>
                <h1 style={{ textShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  Admin Panel
                </h1>
                {allUsersData.map((u) => {
                  const uMastery = getSectionMastery(
                    flashcardData.flatMap((ch) =>
                      ch.subsections.flatMap((s) => s.cards)
                    ),
                    u.progress || {}
                  );
                  return (
                    <div
                      key={u.id}
                      className="student-row glass-panel"
                      onClick={() => setSelectedStudent(u)}
                    >
                      <span
                        style={{
                          textTransform: "capitalize",
                          fontSize: "1.1rem",
                        }}
                      >
                        <b>{u.id}</b>{" "}
                        <span
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          🔥 {u.streak?.current || 0}
                        </span>
                      </span>
                      <span
                        style={{
                          color: getRingColor(uMastery),
                          fontWeight: "bold",
                        }}
                      >
                        {uMastery}% →
                      </span>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="glass-panel" style={{ padding: "30px" }}>
                <h2
                  style={{ textTransform: "capitalize", marginBottom: "25px" }}
                >
                  {selectedStudent.id}'s Mastery
                </h2>
                {flashcardData.map((ch) => {
                  const pct = getSectionMastery(
                    ch.subsections.flatMap((s) => s.cards),
                    selectedStudent.progress || {}
                  );
                  return (
                    <div key={ch.id} style={{ marginBottom: "20px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "8px",
                          fontWeight: "bold",
                        }}
                      >
                        <span style={{ color: "var(--text-muted)" }}>
                          {ch.title}
                        </span>
                        <span style={{ color: getRingColor(pct) }}>{pct}%</span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          background: "var(--glass-border)",
                          height: "12px",
                          borderRadius: "6px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            background: getRingColor(pct),
                            height: "100%",
                            width: `${pct}%`,
                            transition: "width 0.3s",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        );
      case "leaderboard":
        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              ← Back to Menu
            </button>
            <h1 style={{ textShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
              🏆 Global Ranks
            </h1>
            {allUsersData
              .sort(
                (a, b) =>
                  getSectionMastery(
                    flashcardData.flatMap((ch) =>
                      ch.subsections.flatMap((s) => s.cards)
                    ),
                    b.progress || {}
                  ) -
                  getSectionMastery(
                    flashcardData.flatMap((ch) =>
                      ch.subsections.flatMap((s) => s.cards)
                    ),
                    a.progress || {}
                  )
              )
              .map((u, i) => {
                const uScore = getSectionMastery(
                  flashcardData.flatMap((ch) =>
                    ch.subsections.flatMap((s) => s.cards)
                  ),
                  u.progress || {}
                );
                return (
                  <div key={u.id} className="student-row glass-panel">
                    <span style={{ fontSize: "1.1rem" }}>
                      {i + 1}.{" "}
                      <b
                        style={{
                          textTransform: "capitalize",
                          marginLeft: "5px",
                        }}
                      >
                        {u.id}
                      </b>
                    </span>
                    <span
                      style={{
                        fontWeight: "bold",
                        color: "var(--text)",
                        fontSize: "1.1rem",
                      }}
                    >
                      {uScore}%
                    </span>
                  </div>
                );
              })}
          </>
        );
      case "quiz-session":
        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              ← Quit Session
            </button>
            <QuizCard
              card={flashcardData
                .flatMap((ch) => ch.subsections.flatMap((s) => s.cards))
                .find((c) => c.id === quizQueue[0])}
              onAnswer={(c) => handleFlashcardAnswer(c, "standard")}
              count={quizQueue.length}
            />
          </>
        );
      case "quiz-done":
        return (
          <div
            className="flashcard glass-panel"
            style={{
              textAlign: "center",
              padding: "50px 20px",
              position: "relative",
            }}
          >
            <Confetti />
            <div style={{ fontSize: "5rem", marginBottom: "15px" }}>🚀</div>
            <h2 style={{ color: "var(--primary)", fontSize: "2rem" }}>
              Great Job!
            </h2>
            <p
              style={{
                marginBottom: "40px",
                fontSize: "1.1rem",
                color: "var(--text-muted)",
              }}
            >
              {quizType === "refresh"
                ? "You completed a refresh packet of 6 cards."
                : "You finished reviewing this topic."}
            </p>
            {quizType === "refresh" && (
              <button
                className="btn-primary"
                style={{ marginBottom: "15px" }}
                onClick={startRefreshPacket}
              >
                Do Another Packet
              </button>
            )}
            <button
              className="btn-primary"
              style={{ background: "var(--text-muted)" }}
              onClick={() =>
                setView(quizType === "refresh" ? "menu" : "quiz-dashboard")
              }
            >
              {quizType === "refresh" ? "Back to Menu" : "Back to Topics"}
            </button>
          </div>
        );
      case "written-session":
        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              ← Quit Session
            </button>
            <WrittenQuizCard
              question={writtenData.find((q) => q.id === quizQueue[0])}
              onSubmit={handleWrittenAnswer}
              count={quizQueue.length}
            />
          </>
        );
      case "written-done":
        return (
          <div
            className="flashcard glass-panel"
            style={{
              textAlign: "center",
              padding: "50px 20px",
              position: "relative",
            }}
          >
            <Confetti />
            <div style={{ fontSize: "5rem", marginBottom: "15px" }}>🎉</div>
            <h2 style={{ color: "var(--green)", fontSize: "2rem" }}>
              Great Job!
            </h2>
            <p
              style={{
                marginBottom: "40px",
                fontSize: "1.1rem",
                color: "var(--text-muted)",
              }}
            >
              You crushed a packet of 6 long answer questions.
            </p>
            <button
              className="btn-primary"
              style={{ marginBottom: "15px" }}
              onClick={startWrittenQuiz}
            >
              Do Another Packet
            </button>
            <button
              className="btn-primary"
              style={{ background: "var(--text-muted)" }}
              onClick={() => setView("menu")}
            >
              Back to Menu
            </button>
          </div>
        );
      case "learn-dashboard":
      case "quiz-dashboard":
        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              ← Back to Menu
            </button>
            <h1
              style={{
                marginBottom: "20px",
                textShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              {view === "learn-dashboard" ? "Study Materials" : "Select Quiz"}
            </h1>

            {/* UX UI Fix: The Beautiful Dropdown Accordion Structure! */}
            {flashcardData.map((ch) => {
              const isExpanded = expandedChapters.includes(ch.id);
              const chapMastery = getSectionMastery(
                ch.subsections.flatMap((s) => s.cards)
              );

              return (
                <div key={ch.id} style={{ marginBottom: "10px" }}>
                  {/* The Clickable Chapter Header */}
                  <div
                    className="glass-panel"
                    style={{
                      padding: "18px 20px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      backgroundColor: isExpanded
                        ? "var(--glass-bg)"
                        : "rgba(0,0,0,0.2)",
                    }}
                    onClick={() => toggleChapter(ch.id)}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.05rem",
                        color: isExpanded
                          ? "var(--primary)"
                          : "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <span style={{ fontSize: "0.8rem" }}>
                        {isExpanded ? "▼" : "▶"}
                      </span>{" "}
                      {ch.title}
                    </h3>
                    {view === "quiz-dashboard" && (
                      <div
                        style={{
                          fontSize: "1.1rem",
                          fontWeight: "bold",
                          color: getRingColor(chapMastery),
                        }}
                      >
                        {chapMastery}%
                      </div>
                    )}
                  </div>

                  {/* The Dropdown Subsections */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: "15px 0 15px 15px",
                        borderLeft: "2px solid var(--glass-border)",
                        marginLeft: "10px",
                      }}
                    >
                      {ch.subsections.map((sub) => {
                        const subMastery = getSectionMastery(sub.cards);
                        return (
                          <div
                            key={sub.id}
                            className="student-row glass-panel"
                            style={{ marginBottom: "10px" }}
                            onClick={() => {
                              setActiveSubsection(sub);
                              if (view === "quiz-dashboard") {
                                setQuizType("topic");
                                setQuizQueue(sub.cards.map((c) => c.id));
                                setView("quiz-session");
                              } else {
                                setView("learn-page");
                              }
                            }}
                          >
                            <b style={{ fontSize: "1.05rem" }}>{sub.title}</b>
                            {view === "quiz-dashboard" && (
                              <MasteryRing
                                score={subMastery}
                                color={getRingColor(subMastery)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        );
      case "learn-page":
        return (
          <>
            <button
              className="back-link"
              onClick={() => setView("learn-dashboard")}
            >
              ← Back to Topics
            </button>
            <h1
              style={{
                marginBottom: "25px",
                textShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              {activeSubsection.title}
            </h1>
            {activeSubsection.cards.map((c) => (
              <div
                key={c.id}
                className="glass-panel"
                style={{
                  padding: "20px",
                  marginBottom: "15px",
                  cursor: "default",
                }}
              >
                <b style={{ fontSize: "1.1rem", color: "var(--primary)" }}>
                  {c.front}
                </b>
                <div
                  style={{
                    color: "var(--text)",
                    fontSize: "1rem",
                    marginTop: "10px",
                    lineHeight: "1.5",
                  }}
                >
                  {c.back}
                </div>
              </div>
            ))}
          </>
        );
      default:
        return <div>Error loading view.</div>;
    }
  };

  return (
    <div className="app-main-wrapper">
      <div className="texture-grain"></div>
      <div className="mesh-background"></div>

      <div className="geo-shape shape-1 cube-pro-blue"></div>
      <div className="geo-shape shape-2 orb-pro-purple"></div>
      <div className="geo-shape shape-3 orb-pro-blurred-blue"></div>
      <div className="geo-shape shape-4 orb-pro-violet"></div>
      <div className="geo-shape shape-5 cube-pro-violet"></div>
      <div className="geo-shape shape-6 orb-pro-neon-blue"></div>
      <div className="geo-shape shape-7 cube-pro-teal"></div>
      <div className="geo-shape shape-8 orb-pro-blurred-purple"></div>

      <div className="app-container">{renderView()}</div>
    </div>
  );
}

// --- COMPONENTS ---

function Confetti() {
  const colors = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444"];
  return (
    <div className="confetti-container">
      {[...Array(40)].map((_, i) => (
        <div
          key={i}
          className="confetti-piece"
          style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 2}s`,
            animationDuration: `${Math.random() * 2 + 2}s`,
            backgroundColor: colors[Math.floor(Math.random() * colors.length)],
          }}
        ></div>
      ))}
    </div>
  );
}

function MasteryRing({ score, color }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div
      style={{
        position: "relative",
        width: "45px",
        height: "45px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width="45"
        height="45"
        style={{ position: "absolute", transform: "rotate(-90deg)" }}
      >
        <circle
          cx="22.5"
          cy="22.5"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="4"
        />
        <circle
          cx="22.5"
          cy="22.5"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease-in-out" }}
        />
      </svg>
      <span
        style={{
          fontSize: "0.75rem",
          fontWeight: "bold",
          color: "var(--text)",
          zIndex: 1,
          opacity: 0.7,
        }}
      >
        {score}%
      </span>
    </div>
  );
}

function QuizCard({ card, onAnswer, count }) {
  const [rev, setRev] = useState(false);
  useEffect(() => setRev(false), [card?.id]);
  if (!card) return null;
  return (
    <div className="flashcard glass-panel">
      {count && <div className="label">REMAINING IN DECK: {count}</div>}
      <div>
        <div className="label">QUESTION</div>
        <div className="pre-line" style={{ fontSize: "1.25rem" }}>
          <b>{card.front}</b>
        </div>
      </div>
      {rev && (
        <div
          style={{
            marginTop: "25px",
            borderTop: "1px solid var(--glass-border)",
            paddingTop: "25px",
          }}
        >
          <div className="label">ANSWER</div>
          <div
            className="pre-line"
            style={{ color: "var(--primary)", fontWeight: "500" }}
          >
            {card.back}
          </div>
        </div>
      )}
      <div style={{ marginTop: "30px" }}>
        {!rev ? (
          <button className="btn-primary" onClick={() => setRev(true)}>
            Show Answer
          </button>
        ) : (
          <div className="btn-group">
            <button className="btn-red" onClick={() => onAnswer(false)}>
              Wrong
            </button>
            <button className="btn-green" onClick={() => onAnswer(true)}>
              Right
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function WrittenQuizCard({ question, onSubmit, count }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [checkedBoxes, setCheckedBoxes] = useState([]);
  const [hintUsed, setHintUsed] = useState(false);

  useEffect(() => {
    setShowAnswer(false);
    setCheckedBoxes([]);
    setHintUsed(false);
  }, [question?.id]);

  if (!question) return null;

  const maxMarksHit = checkedBoxes.length >= question.marks;
  const hintWords = question.points[0]
    ? question.points[0].split(" ").slice(0, 4).join(" ") + "..."
    : "Think about the materials...";

  return (
    <div className="flashcard glass-panel">
      <div className="label">
        TOPIC: {question.topic} • REMAINING IN PACKET: {count}
      </div>
      <div>
        <h2 style={{ color: "var(--primary)", marginBottom: "10px" }}>
          Total: {question.marks} Marks
        </h2>
        <div
          className="pre-line"
          style={{ marginBottom: "25px", fontSize: "1.15rem" }}
        >
          <b>{question.question}</b>
        </div>
      </div>

      <textarea
        className="input-field glass-panel"
        rows="5"
        placeholder={
          showAnswer
            ? "Your answer is locked for marking..."
            : "Type your answer here..."
        }
        style={{
          resize: "vertical",
          width: "100%",
          marginBottom: "20px",
          backgroundColor: showAnswer ? "var(--glass-bg)" : "var(--input-bg)",
          color: showAnswer ? "var(--text-muted)" : "var(--text)",
          border: showAnswer
            ? "2px dashed var(--glass-border)"
            : "1px solid var(--glass-border)",
          boxShadow: "none",
        }}
        readOnly={showAnswer}
      />

      {!showAnswer ? (
        <>
          {hintUsed ? (
            <div
              className="glass-panel"
              style={{
                padding: "12px 15px",
                marginBottom: "20px",
                color: "#d97706",
                fontWeight: "bold",
                background: "rgba(253, 230, 138, 0.2)",
                border: "1px solid rgba(253, 230, 138, 0.4)",
              }}
            >
              💡 Hint: {hintWords}
            </div>
          ) : (
            <button
              className="btn-small"
              style={{
                background: "#f59e0b",
                width: "100%",
                padding: "12px",
                marginBottom: "20px",
              }}
              onClick={() => setHintUsed(true)}
            >
              Need a hint?
            </button>
          )}
          <button className="btn-primary" onClick={() => setShowAnswer(true)}>
            Reveal Mark Scheme
          </button>
        </>
      ) : (
        <div
          style={{
            marginTop: "25px",
            borderTop: "1px solid var(--glass-border)",
            paddingTop: "25px",
          }}
        >
          <div
            className="label"
            style={{ color: maxMarksHit ? "var(--red)" : "var(--primary)" }}
          >
            MARKING POINTS (Select up to {question.marks})
          </div>
          <div className="filter-list" style={{ marginBottom: "25px" }}>
            {question.points.map((point, index) => {
              const isChecked = checkedBoxes.includes(index);
              const isDisabled = !isChecked && maxMarksHit;
              return (
                <label
                  key={index}
                  className="filter-item glass-panel"
                  style={{
                    opacity: isDisabled ? 0.4 : 1,
                    padding: "12px 15px",
                    marginBottom: "8px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => {
                      if (isChecked) {
                        setCheckedBoxes(
                          checkedBoxes.filter((i) => i !== index)
                        );
                      } else if (!maxMarksHit) {
                        setCheckedBoxes([...checkedBoxes, index]);
                      }
                    }}
                  />
                  <span>{point}</span>
                </label>
              );
            })}
          </div>
          <button
            className="btn-primary"
            style={{ background: "var(--green)" }}
            onClick={() => onSubmit(checkedBoxes.length, question.marks)}
          >
            Submit Score ({checkedBoxes.length}/{question.marks})
          </button>
        </div>
      )}
    </div>
  );
}
