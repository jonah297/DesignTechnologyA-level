import React, { useState, useEffect, useRef } from "react";
import { flashcardData } from "./data";
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
  // 1. MOBILE-SAFE LOCAL STORAGE CHECK
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return localStorage.getItem("current_user") || null;
    } catch (e) {
      console.warn("Storage blocked, session won't persist on refresh.");
      return null;
    }
  });

  const [view, setView] = useState(currentUser ? "menu" : "login");
  const [loginInput, setLoginInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [progress, setProgress] = useState({});
  const [quizQueue, setQuizQueue] = useState([]);
  const [allUsersData, setAllUsersData] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeSubsection, setActiveSubsection] = useState(null);

  const [showInstructions, setShowInstructions] = useState(false);
  const [instructionText, setInstructionText] = useState({
    title: "",
    body: "",
  });
  const [timeLeft, setTimeLeft] = useState(60);
  const [blitzScore, setBlitzScore] = useState(0);
  const timerRef = useRef(null);

  // --- CLOUD SYNC LOGIC ---
  useEffect(() => {
    if (currentUser && currentUser !== "admin" && db) {
      const unsub = onSnapshot(
        doc(db, "users", currentUser),
        (docSnap) => {
          if (docSnap.exists()) setProgress(docSnap.data().progress || {});
        },
        (error) => {
          console.error("Firebase sync error:", error);
        }
      );
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

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  const saveToCloud = async (newProgress) => {
    if (!currentUser || currentUser === "admin") return;
    try {
      await setDoc(
        doc(db, "users", currentUser),
        {
          progress: newProgress,
          lastUpdated: Date.now(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("Cloud Save Error:", e);
    }
  };

  const handleAnswer = (isCorrect, mode) => {
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
    saveToCloud(newProgress);

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

  const getProgressPercentage = (prog, cards) => {
    if (!cards || cards.length === 0) return 0;
    const correctCount = cards.filter(
      (c) => prog[c.id] && prog[c.id].status === "correct"
    ).length;
    return Math.round((correctCount / cards.length) * 100);
  };

  // --- VIEWS ---

  if (view === "login")
    return (
      <div className="app-container">
        <div className="login-box">
          <h1>D&T Hub</h1>
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
                // MOBILE-SAFE STORAGE SAVE
                try {
                  localStorage.setItem("current_user", n);
                } catch (err) {}
                setCurrentUser(n);
                setView("menu");
              } else setLoginError("Invalid username or password.");
            }}
          >
            <div className="password-wrapper" style={{ marginBottom: "10px" }}>
              <input
                style={{
                  padding: "12px",
                  border: "1px solid #ddd",
                  borderRadius: "10px",
                  width: "100%",
                  boxSizing: "border-box",
                }}
                placeholder="Username"
                onChange={(e) => setLoginInput(e.target.value)}
                required
              />
            </div>
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
      </div>
    );

  if (view === "menu")
    return (
      <div className="app-container">
        <div className="user-bar">
          <span>
            User: <b>{currentUser}</b>
          </span>
          <button
            className="logout-btn"
            onClick={() => {
              saveToCloud(progress);
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
        <h1>Main Menu</h1>
        <div className="menu-grid">
          <div
            className="menu-card learn"
            onClick={() => setView("learn-dashboard")}
          >
            <h2>📖 Learn</h2>
            <p>Review Content</p>
          </div>
          <div
            className="menu-card quiz"
            onClick={() => setView("quiz-dashboard")}
          >
            <h2>📝 Quiz</h2>
            <p>Practice Topics</p>
          </div>
          <div
            className="menu-card refresh"
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
                setInstructionText({
                  title: "Smart Refresh",
                  body: `You have ${due.length} cards due for review based on your forgetting curve.`,
                });
                setShowInstructions("focus-session");
              } else alert("All fresh! You are completely caught up.");
            }}
          >
            <h2>🔄 Refresh</h2>
            <p>Daily Review</p>
          </div>
          <div
            className="menu-card focus"
            onClick={() => {
              const w = flashcardData
                .flatMap((ch) => ch.subsections.flatMap((s) => s.cards))
                .filter((c) => progress[c.id]?.status === "incorrect");
              if (w.length > 0) {
                setQuizQueue(w.map((c) => c.id));
                setInstructionText({
                  title: "Focus Mode",
                  body: "Practice your mistakes.",
                });
                setShowInstructions("focus-session");
              } else alert("No mistakes! Try taking a Quiz first.");
            }}
          >
            <h2>🎯 Focus</h2>
            <p>Target Weak Spots</p>
          </div>
          <div
            className="menu-card blitz"
            onClick={() => {
              setInstructionText({
                title: "Speed Blitz",
                body: "60s challenge.",
              });
              setShowInstructions("blitz-start");
            }}
          >
            <h2>⚡ Blitz</h2>
            <p>Timed Challenge</p>
          </div>
          <div
            className="menu-card hall"
            onClick={() => setView("leaderboard")}
          >
            <h2>🏆 Hall of Fame</h2>
            <p>Global Ranks</p>
          </div>
          {currentUser === "admin" && (
            <div
              className="menu-card admin"
              onClick={() => setView("admin-dashboard")}
            >
              <h2>👑 Admin Dashboard</h2>
            </div>
          )}
        </div>
        {showInstructions && (
          <div className="modal-overlay">
            <div className="modal-content">
              <button
                className="modal-close"
                onClick={() => setShowInstructions(false)}
              >
                ×
              </button>
              <h2>{instructionText.title}</h2>
              <p>{instructionText.body}</p>
              <button
                className="btn-primary"
                onClick={() => {
                  if (showInstructions === "blitz-start") {
                    const all = flashcardData.flatMap((ch) =>
                      ch.subsections.flatMap((s) => s.cards || [])
                    );
                    setQuizQueue(
                      [...all].sort(() => 0.5 - Math.random()).map((c) => c.id)
                    );
                    setBlitzScore(0);
                    setTimeLeft(60);
                    setView("speed-blitz");
                    setShowInstructions(false);
                    timerRef.current = setInterval(
                      () =>
                        setTimeLeft((p) => {
                          if (p <= 1) {
                            clearInterval(timerRef.current);
                            return 0;
                          }
                          return p - 1;
                        }),
                      1000
                    );
                  } else {
                    setView(showInstructions);
                    setShowInstructions(false);
                  }
                }}
              >
                Start
              </button>
            </div>
          </div>
        )}
      </div>
    );

  if (view === "admin-dashboard")
    return (
      <div className="app-container">
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
            <h1>Admin Panel</h1>
            {allUsersData.map((u) => (
              <div
                key={u.id}
                className="student-row"
                onClick={() => setSelectedStudent(u)}
              >
                <span
                  style={{ textTransform: "capitalize", fontWeight: "bold" }}
                >
                  {u.id}
                </span>
                <span style={{ color: "var(--primary)" }}>
                  {getProgressPercentage(
                    u.progress || {},
                    flashcardData.flatMap((ch) =>
                      ch.subsections.flatMap((s) => s.cards)
                    )
                  )}
                  % Progress →
                </span>
              </div>
            ))}
          </>
        ) : (
          <div className="report-card">
            <h2 style={{ textTransform: "capitalize" }}>
              {selectedStudent.id}'s Progress
            </h2>
            <div
              style={{
                background: "#f8fafc",
                padding: "15px",
                borderRadius: "12px",
                marginBottom: "20px",
              }}
            >
              <div>
                <b>Last Active:</b>{" "}
                {selectedStudent.lastUpdated
                  ? new Date(selectedStudent.lastUpdated).toLocaleString()
                  : "No data"}
              </div>
            </div>
            {flashcardData.map((ch) => {
              const chCards = ch.subsections.flatMap((s) => s.cards);
              const pct = getProgressPercentage(
                selectedStudent.progress || {},
                chCards
              );
              return (
                <div key={ch.id} className="topic-progress-item">
                  <div className="topic-label">
                    <span>{ch.title}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="bar-bg">
                    <div
                      className="bar-fill"
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );

  if (view === "leaderboard")
    return (
      <div className="app-container">
        <button className="back-link" onClick={() => setView("menu")}>
          ← Back
        </button>
        <h1>🏆 Hall of Fame</h1>
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
            <div key={u.id} className="student-row">
              <span>
                {i + 1}. <b style={{ textTransform: "capitalize" }}>{u.id}</b>
              </span>
              <span style={{ fontWeight: "bold", color: "var(--green)" }}>
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
      </div>
    );

  if (view === "speed-blitz")
    return (
      <div className="app-container">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: "bold",
            fontSize: "1.2rem",
            alignItems: "center",
          }}
        >
          <button
            className="back-link"
            style={{ margin: 0 }}
            onClick={() => {
              saveToCloud(progress);
              clearInterval(timerRef.current);
              setView("menu");
            }}
          >
            ← Quit
          </button>
          <span className={timeLeft < 10 ? "timer panic" : ""}>
            ⏳ {timeLeft}s
          </span>
          <span>🔥 {blitzScore}</span>
        </div>
        {timeLeft > 0 ? (
          <QuizCard
            card={flashcardData
              .flatMap((ch) => ch.subsections.flatMap((s) => s.cards))
              .find((c) => c.id === quizQueue[0])}
            onAnswer={(c) => handleAnswer(c, "blitz")}
          />
        ) : (
          <div className="flashcard" style={{ textAlign: "center" }}>
            <h2>Time's Up!</h2>
            <p>
              Score: <b>{blitzScore}</b>
            </p>
            <button className="btn-primary" onClick={() => setView("menu")}>
              Back to Menu
            </button>
          </div>
        )}
      </div>
    );

  if (view === "focus-session" || view === "quiz-session")
    return (
      <div className="app-container">
        <button
          className="back-link"
          onClick={() => {
            saveToCloud(progress);
            setView(view === "quiz-session" ? "quiz-dashboard" : "menu");
          }}
        >
          ← Quit
        </button>
        <QuizCard
          card={flashcardData
            .flatMap((ch) => ch.subsections.flatMap((s) => s.cards))
            .find((c) => c.id === quizQueue[0])}
          onAnswer={(c) => handleAnswer(c, "standard")}
          count={quizQueue.length}
        />
      </div>
    );

  if (view === "learn-dashboard" || view === "quiz-dashboard")
    return (
      <div className="app-container">
        <button className="back-link" onClick={() => setView("menu")}>
          ← Back
        </button>
        {flashcardData.map((ch) => (
          <div key={ch.id} style={{ marginBottom: "20px" }}>
            <h3
              style={{
                fontSize: "0.8rem",
                color: "#64748b",
                textTransform: "uppercase",
              }}
            >
              {ch.title}
            </h3>
            {ch.subsections.map((sub) => (
              <div
                key={sub.id}
                className="student-row"
                onClick={() => {
                  setActiveSubsection(sub);
                  if (view === "quiz-dashboard") {
                    let q = sub.cards
                      .filter(
                        (c) =>
                          !progress[c.id] || progress[c.id].status !== "correct"
                      )
                      .map((c) => c.id);
                    if (q.length === 0) q = sub.cards.map((c) => c.id);
                    setQuizQueue(q);
                    setView("quiz-session");
                  } else setView("learn-page");
                }}
              >
                <b>{sub.title}</b>
                {view === "quiz-dashboard" && (
                  <span style={{ color: "var(--green)", fontSize: "0.9rem" }}>
                    {getProgressPercentage(progress, sub.cards)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    );

  if (view === "learn-page")
    return (
      <div className="app-container">
        <button
          className="back-link"
          onClick={() => setView("learn-dashboard")}
        >
          ← Back
        </button>
        <h1>{activeSubsection.title}</h1>
        {activeSubsection.cards.map((c) => (
          <div
            key={c.id}
            className="student-row"
            style={{ display: "block", cursor: "default" }}
          >
            <b>{c.front}</b>
            <div
              style={{ color: "#64748b", fontSize: "0.9rem", marginTop: "5px" }}
            >
              {c.back}
            </div>
          </div>
        ))}
      </div>
    );
}

function QuizCard({ card, onAnswer, count }) {
  const [rev, setRev] = useState(false);
  useEffect(() => setRev(false), [card?.id]);
  if (!card) return null;
  return (
    <div className="flashcard">
      {count && <div className="label">REMAINING: {count}</div>}
      <div className="card-face">
        <div className="label">QUESTION</div>
        <div className="pre-line">
          <b>{card.front}</b>
        </div>
      </div>
      {rev && (
        <div
          className="card-face"
          style={{
            marginTop: "20px",
            borderTop: "1px solid #eee",
            paddingTop: "20px",
          }}
        >
          <div className="label">ANSWER</div>
          <div className="pre-line">{card.back}</div>
        </div>
      )}
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
  );
}
