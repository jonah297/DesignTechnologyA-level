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

  // Theme State
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
  const [quizQueue, setQuizQueue] = useState([]);
  const [allUsersData, setAllUsersData] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeSubsection, setActiveSubsection] = useState(null);

  const [blitzFilters, setBlitzFilters] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [blitzScore, setBlitzScore] = useState(0);
  const timerRef = useRef(null);

  // Apply Theme to Body and handle background texture
  useEffect(() => {
    document.body.className = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch (e) {}
  }, [theme]);

  // Cloud Sync
  useEffect(() => {
    if (currentUser && currentUser !== "admin" && db) {
      const unsub = onSnapshot(doc(db, "users", currentUser), (docSnap) => {
        if (docSnap.exists()) {
          setProgress(docSnap.data().progress || {});
          setWrittenProgress(docSnap.data().writtenProgress || {});
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

  const saveToCloud = async (newProgress, type = "flashcards") => {
    if (!currentUser || currentUser === "admin") return;
    try {
      if (type === "flashcards") {
        await setDoc(
          doc(db, "users", currentUser),
          { progress: newProgress, lastUpdated: Date.now() },
          { merge: true }
        );
      } else if (type === "written") {
        await setDoc(
          doc(db, "users", currentUser),
          { writtenProgress: newProgress, lastUpdated: Date.now() },
          { merge: true }
        );
      }
    } catch (e) {
      console.error("Cloud Save Error:", e);
    }
  };

  const handleFlashcardAnswer = (isCorrect, mode) => {
    const currentId = quizQueue[0];
    const cardData = progress[currentId] || {
      interval: 0,
      lastSeen: Date.now(),
    };

    let newInterval = isCorrect
      ? cardData.interval === 0
        ? 1
        : cardData.interval * 2
      : 0;
    const newProgress = {
      ...progress,
      [currentId]: {
        interval: newInterval,
        lastSeen: Date.now(),
        status: isCorrect ? "correct" : "incorrect",
      },
    };

    if (mode === "blitz" && isCorrect) setBlitzScore((s) => s + 1);
    setProgress(newProgress);
    saveToCloud(newProgress, "flashcards");

    let nQ = [...quizQueue];
    nQ.shift();
    if (!isCorrect && mode !== "blitz")
      nQ.splice(Math.min(2, nQ.length), 0, currentId);

    if (nQ.length === 0 || (mode === "blitz" && timeLeft === 0)) {
      clearInterval(timerRef.current);
      setView(view === "quiz-session" ? "quiz-dashboard" : "menu");
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

  const getProgressPercentage = (prog, cards) => {
    if (!cards || cards.length === 0) return 0;
    const correctCount = cards.filter(
      (c) => prog[c.id] && prog[c.id].status === "correct"
    ).length;
    return Math.round((correctCount / cards.length) * 100);
  };

  const toggleTheme = () =>
    setTheme((prev) => (prev === "light" ? "dark" : "light"));

  // Define Views to make code cleaner
  const renderView = () => {
    switch (view) {
      case "login":
        return (
          <div className="login-box glass-panel">
            <h1 style={{ fontSize: "2.5rem", marginBottom: "20px" }}>
              D&T Hub
            </h1>
            {loginError && (
              <p style={{ color: "var(--red)", fontWeight: "bold" }}>
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
              />
              <div className="password-wrapper">
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
              <button className="btn-primary" type="submit">
                Log In
              </button>
            </form>
          </div>
        );
      case "menu":
        return (
          <>
            <div className="user-bar glass-panel">
              <span>
                User:{" "}
                <b style={{ textTransform: "capitalize" }}>{currentUser}</b>
              </span>
              <div>
                <button className="theme-toggle-btn" onClick={toggleTheme}>
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
                onClick={() => {
                  const now = Date.now();
                  const due = flashcardData
                    .flatMap((ch) => ch.subsections.flatMap((s) => s.cards))
                    .filter((c) => {
                      const p = progress[c.id];
                      if (!p) return false;
                      return (
                        p.status === "incorrect" ||
                        (now - p.lastSeen) / 86400000 >= p.interval
                      );
                    });
                  if (due.length > 0) {
                    setQuizQueue(due.map((c) => c.id));
                    setView("quiz-session");
                  } else alert("All caught up!");
                }}
              >
                <h2>🔄 Refresh</h2>
                <p>Daily Review</p>
              </div>
              <div
                className="menu-card glass-panel"
                onClick={() => {
                  const w = flashcardData
                    .flatMap((ch) => ch.subsections.flatMap((s) => s.cards))
                    .filter((c) => progress[c.id]?.status === "incorrect");
                  if (w.length > 0) {
                    setQuizQueue(w.map((c) => c.id));
                    setView("quiz-session");
                  } else alert("No mistakes found!");
                }}
              >
                <h2>🎯 Focus</h2>
                <p>Weak Spots</p>
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
            ) : (
              <div
                className="flashcard glass-panel"
                style={{ textAlign: "center" }}
              >
                <h2>Time's Up!</h2>
                <div style={{ fontSize: "4rem", margin: "20px 0" }}>
                  🔥 {blitzScore}
                </div>
                <button className="btn-primary" onClick={() => setView("menu")}>
                  Back to Menu
                </button>
              </div>
            )}
          </>
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
                {allUsersData.map((u) => (
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
                      <b>{u.id}</b>
                    </span>
                    <span
                      style={{ color: "var(--primary)", fontWeight: "bold" }}
                    >
                      {getProgressPercentage(
                        u.progress || {},
                        flashcardData.flatMap((ch) =>
                          ch.subsections.flatMap((s) => s.cards)
                        )
                      )}
                      % →
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <div className="glass-panel" style={{ padding: "30px" }}>
                <h2
                  style={{ textTransform: "capitalize", marginBottom: "25px" }}
                >
                  {selectedStudent.id}'s Progress
                </h2>
                {flashcardData.map((ch) => {
                  const pct = getProgressPercentage(
                    selectedStudent.progress || {},
                    ch.subsections.flatMap((s) => s.cards)
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
                        <span style={{ color: "var(--primary)" }}>{pct}%</span>
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
                            background: "var(--green)",
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
                  getProgressPercentage(
                    b.progress || {},
                    flashcardData.flatMap((ch) =>
                      ch.subsections.flatMap((s) => s.cards)
                    )
                  ) -
                  getProgressPercentage(
                    a.progress || {},
                    flashcardData.flatMap((ch) =>
                      ch.subsections.flatMap((s) => s.cards)
                    )
                  )
              )
              .map((u, i) => (
                <div key={u.id} className="student-row glass-panel">
                  <span style={{ fontSize: "1.1rem" }}>
                    {i + 1}.{" "}
                    <b
                      style={{ textTransform: "capitalize", marginLeft: "5px" }}
                    >
                      {u.id}
                    </b>
                  </span>
                  <span
                    style={{
                      fontWeight: "bold",
                      color: "var(--green)",
                      fontSize: "1.1rem",
                    }}
                  >
                    {getProgressPercentage(
                      u.progress || {},
                      flashcardData.flatMap((ch) =>
                        ch.subsections.flatMap((s) => s.cards)
                      )
                    )}
                    %
                  </span>
                </div>
              ))}
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
            style={{ textAlign: "center", padding: "50px 20px" }}
          >
            <div style={{ fontSize: "5rem", marginBottom: "15px" }}>🎉🎊</div>
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
              You crushed a packet of 6 questions.
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
            {flashcardData.map((ch) => (
              <div key={ch.id} style={{ marginBottom: "25px" }}>
                <h3
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  {ch.title}
                </h3>
                {ch.subsections.map((sub) => (
                  <div
                    key={sub.id}
                    className="student-row glass-panel"
                    onClick={() => {
                      setActiveSubsection(sub);
                      if (view === "quiz-dashboard") {
                        setQuizQueue(sub.cards.map((c) => c.id));
                        setView("quiz-session");
                      } else setView("learn-page");
                    }}
                  >
                    <b style={{ fontSize: "1.05rem" }}>{sub.title}</b>
                    {view === "quiz-dashboard" && (
                      <span
                        style={{ color: "var(--green)", fontWeight: "bold" }}
                      >
                        {getProgressPercentage(progress, sub.cards)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
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

      {/* Detail C: Geometric Shapes. Corrected IDs and variety */}
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
