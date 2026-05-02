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

  // Blitz States
  const [blitzFilters, setBlitzFilters] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [blitzScore, setBlitzScore] = useState(0);
  const timerRef = useRef(null);

  // --- CLOUD SYNC ---
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
    if (nQ.length === 0) setView("menu");
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

    setQuizQueue(sortedIds);
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
            className="menu-card admin"
            style={{ background: "#4f46e5", color: "white" }}
            onClick={startWrittenQuiz}
          >
            <h2>✍️ Long Answer</h2>
            <p>Self-Marking</p>
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
                setView("quiz-session");
              } else alert("All caught up!");
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
                setView("quiz-session");
              } else alert("No mistakes found!");
            }}
          >
            <h2>🎯 Focus</h2>
            <p>Weak Spots</p>
          </div>
          <div
            className="menu-card blitz"
            onClick={() => {
              setBlitzFilters(flashcardData.map((ch) => ch.id));
              setView("blitz-setup");
            }}
          >
            <h2>⚡ Blitz</h2>
            <p>Timed Challenge</p>
          </div>
          <div
            className="menu-card hall"
            onClick={() => setView("leaderboard")}
          >
            <h2>🏆 Ranks</h2>
            <p>Global Board</p>
          </div>
          {currentUser === "admin" && (
            <div
              className="menu-card admin"
              onClick={() => setView("admin-dashboard")}
            >
              <h2>👑 Admin</h2>
            </div>
          )}
        </div>
      </div>
    );

  if (view === "blitz-setup")
    return (
      <div className="app-container">
        <button className="back-link" onClick={() => setView("menu")}>
          ← Back
        </button>
        <h1>⚡ Blitz Settings</h1>
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <button
            className="btn-small"
            onClick={() => setBlitzFilters(flashcardData.map((ch) => ch.id))}
          >
            Select All
          </button>
          <button
            className="btn-small"
            style={{ background: "#e2e8f0", color: "#475569" }}
            onClick={() => setBlitzFilters([])}
          >
            Clear All
          </button>
        </div>
        <div className="filter-list">
          {flashcardData.map((ch) => (
            <label key={ch.id} className="filter-item">
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
    );

  if (view === "speed-blitz")
    return (
      <div className="app-container">
        <div className="blitz-header">
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
          <div className="flashcard" style={{ textAlign: "center" }}>
            <h2>Time's Up!</h2>
            <div style={{ fontSize: "3rem", margin: "20px 0" }}>
              {blitzScore}
            </div>
            <button className="btn-primary" onClick={() => setView("menu")}>
              Back to Menu
            </button>
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
                <span style={{ textTransform: "capitalize" }}>
                  <b>{u.id}</b>
                </span>
                <span style={{ color: "var(--primary)" }}>
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
          <div className="report-card">
            <h2 style={{ textTransform: "capitalize" }}>
              {selectedStudent.id}'s Progress
            </h2>
            {flashcardData.map((ch) => {
              const pct = getProgressPercentage(
                selectedStudent.progress || {},
                ch.subsections.flatMap((s) => s.cards)
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
        <h1>🏆 Global Ranks</h1>
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

  if (view === "quiz-session")
    return (
      <div className="app-container">
        <button className="back-link" onClick={() => setView("menu")}>
          ← Quit
        </button>
        <QuizCard
          card={flashcardData
            .flatMap((ch) => ch.subsections.flatMap((s) => s.cards))
            .find((c) => c.id === quizQueue[0])}
          onAnswer={(c) => handleFlashcardAnswer(c, "standard")}
          count={quizQueue.length}
        />
      </div>
    );

  if (view === "written-session")
    return (
      <div className="app-container">
        <button className="back-link" onClick={() => setView("menu")}>
          ← Quit
        </button>
        <WrittenQuizCard
          question={writtenData.find((q) => q.id === quizQueue[0])}
          onSubmit={handleWrittenAnswer}
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
                    setQuizQueue(sub.cards.map((c) => c.id));
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

// --- COMPONENTS ---
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

function WrittenQuizCard({ question, onSubmit, count }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [checkedBoxes, setCheckedBoxes] = useState([]);

  useEffect(() => {
    setShowAnswer(false);
    setCheckedBoxes([]);
  }, [question?.id]);

  if (!question) return null;

  const maxMarksHit = checkedBoxes.length >= question.marks;

  return (
    <div className="flashcard">
      <div className="label">
        TOPIC: {question.topic} • REMAINING: {count}
      </div>
      <div className="card-face">
        <h2 style={{ color: "var(--primary)", marginBottom: "5px" }}>
          Total: {question.marks} Marks
        </h2>
        <div className="pre-line" style={{ marginBottom: "20px" }}>
          <b>{question.question}</b>
        </div>
      </div>

      {!showAnswer ? (
        <>
          <textarea
            className="input-field"
            rows="5"
            placeholder="Type your answer here..."
            style={{ resize: "vertical", width: "100%", marginBottom: "20px" }}
          />
          <button className="btn-primary" onClick={() => setShowAnswer(true)}>
            Reveal Mark Scheme
          </button>
        </>
      ) : (
        <div
          style={{
            marginTop: "20px",
            borderTop: "2px solid #eee",
            paddingTop: "20px",
          }}
        >
          <div
            className="label"
            style={{ color: maxMarksHit ? "var(--red)" : "var(--primary)" }}
          >
            MARKING POINTS (Select up to {question.marks})
          </div>
          <div className="filter-list" style={{ marginBottom: "20px" }}>
            {question.points.map((point, index) => {
              const isChecked = checkedBoxes.includes(index);
              const isDisabled = !isChecked && maxMarksHit;
              return (
                <label
                  key={index}
                  className="filter-item"
                  style={{ opacity: isDisabled ? 0.5 : 1 }}
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
