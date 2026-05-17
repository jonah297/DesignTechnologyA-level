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
  josh: "JoshPass546",
  ed: "EdPass6677",
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
  const [activeSubsection, setActiveSubsection] = useState(null);
  const [expandedChapters, setExpandedChapters] = useState([]);

  const [blitzFilters, setBlitzFilters] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const [blitzScore, setBlitzScore] = useState(0);
  const timerRef = useRef(null);

  const [matchCards, setMatchCards] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchedIds, setMatchedIds] = useState([]);
  const [mismatchedPair, setMismatchedPair] = useState([]);

  useEffect(() => {
    if (document.body.className !== theme) {
      document.body.className = theme;
      try {
        localStorage.setItem("theme", theme);
      } catch (e) {}
    }
  }, [theme]);

  useEffect(() => {
    if (!currentUser || currentUser === "admin" || !db) return;
    const unsub = onSnapshot(
      doc(db, "users", currentUser),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setProgress((prev) =>
            JSON.stringify(prev) === JSON.stringify(data.progress)
              ? prev
              : data.progress || {}
          );
          setWrittenProgress((prev) =>
            JSON.stringify(prev) === JSON.stringify(data.writtenProgress)
              ? prev
              : data.writtenProgress || {}
          );
          setStreak((prev) =>
            JSON.stringify(prev) === JSON.stringify(data.streak)
              ? prev
              : data.streak || { current: 0, longest: 0, lastDate: 0 }
          );
        }
      },
      (error) => {
        console.error("Firestore Core Sync Error:", error);
      }
    );
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    if ((view === "admin-dashboard" || view === "leaderboard") && db) {
      const unsub = onSnapshot(collection(db, "users"), (snap) => {
        const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAllUsersData((prev) =>
          JSON.stringify(prev) === JSON.stringify(users) ? prev : users
        );
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
      console.error("Cloud Write Execution Failure:", e);
    }
  };

  const calculateMastery = (cardId, currentProgress = progress) => {
    const p = currentProgress[cardId];
    if (!p) return 0;
    let startingMastery = p.baseMastery;
    if (startingMastery === undefined)
      startingMastery = p.status === "correct" ? 100 : 0;

    let consecutive = p.consecutiveCorrect || 0;
    const safeLastSeen = p.lastSeen || Date.now();
    const daysPassed = Math.max(
      0,
      (Date.now() - safeLastSeen) / (1000 * 60 * 60 * 24)
    );

    let decayRate;
    if (consecutive === 0) decayRate = 12;
    else if (consecutive === 1) decayRate = 3;
    else if (consecutive === 2) decayRate = 0.8;
    else decayRate = 0.15;

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

  const getDecayedCardsCount = () => {
    let count = 0;
    flashcardData.forEach((ch) => {
      ch.subsections.forEach((sub) => {
        sub.cards.forEach((c) => {
          const hasBeenAttempted = progress[c.id] !== undefined;
          if (hasBeenAttempted && calculateMastery(c.id) < 80) count++;
        });
      });
    });
    return count;
  };

  const getRingColor = (score) => {
    if (score >= 80) return "var(--green)";
    if (score >= 50) return "#f59e0b";
    return "var(--red)";
  };

  const startRefreshPacket = () => {
    let weakCards = [];
    flashcardData.forEach((ch) => {
      ch.subsections.forEach((sub) => {
        const subMastery = getSectionMastery(sub.cards);
        if (subMastery < 80) {
          const due = sub.cards.filter((c) => {
            const hasBeenAttempted = progress[c.id] !== undefined;
            return hasBeenAttempted && calculateMastery(c.id) < 80;
          });
          weakCards = [...weakCards, ...due];
        }
      });
    });
    weakCards.sort((a, b) => calculateMastery(a.id) - calculateMastery(b.id));

    if (weakCards.length > 0) {
      setQuizType("refresh");
      setQuizQueue(weakCards.slice(0, 6).map((c) => c.id));
      setView("quiz-session");
    } else {
      alert("All your active studied topics are currently green! Great job.");
    }
  };

  const processAnswerExecution = (cardId, isCorrect, currentProgressState) => {
    const p = currentProgressState[cardId] || {};
    const timeSinceLastSeen = Date.now() - (p.lastSeen || 0);
    const isCramming = timeSinceLastSeen < 1000 * 60 * 60 * 12;

    let newBaseMastery = isCorrect ? 100 : 0;
    let newConsecutive = p.consecutiveCorrect || 0;
    if (isCorrect && !isCramming) newConsecutive += 1;
    if (!isCorrect) newConsecutive = 0;

    const updatedProgress = {
      ...currentProgressState,
      [cardId]: {
        baseMastery: newBaseMastery,
        consecutiveCorrect: newConsecutive,
        lastSeen: Date.now(),
        status: isCorrect ? "correct" : "incorrect",
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
    return { updatedProgress, newStreak };
  };

  const handleFlashcardAnswer = (isCorrect, mode) => {
    const currentId = quizQueue[0];
    const { updatedProgress, newStreak } = processAnswerExecution(
      currentId,
      isCorrect,
      progress
    );

    let currentScore = blitzScore;
    if (mode === "blitz" && isCorrect) {
      currentScore += 1;
      setBlitzScore(currentScore);
    }

    setProgress(updatedProgress);
    saveToCloud(updatedProgress, "flashcards", newStreak);

    let nQ = [...quizQueue];
    nQ.shift();
    if (!isCorrect && mode !== "blitz")
      nQ.splice(Math.min(2, nQ.length), 0, currentId);

    if (nQ.length === 0 || (mode === "blitz" && timeLeft <= 0)) {
      if (timerRef.current) clearInterval(timerRef.current);
      setView(mode === "blitz" ? "blitz-done" : "quiz-done");
    } else {
      setQuizQueue(nQ);
    }
  };

  const startMatchGameCanvas = () => {
    let rawRefreshPool = [];
    flashcardData.forEach((ch) => {
      ch.subsections.forEach((sub) => {
        sub.cards.forEach((c) => {
          const hasBeenAttempted = progress[c.id] !== undefined;
          if (hasBeenAttempted && calculateMastery(c.id) < 80)
            rawRefreshPool.push(c);
        });
      });
    });

    if (rawRefreshPool.length < 4) {
      const attemptedPool = flashcardData
        .flatMap((ch) => ch.subsections.flatMap((s) => s.cards))
        .filter((c) => progress[c.id] !== undefined);
      while (
        rawRefreshPool.length < 4 &&
        rawRefreshPool.length < attemptedPool.length
      ) {
        const randCard =
          attemptedPool[Math.floor(Math.random() * attemptedPool.length)];
        if (!rawRefreshPool.find((c) => c.id === randCard.id))
          rawRefreshPool.push(randCard);
      }
    }

    if (rawRefreshPool.length < 4) {
      const masterPool = flashcardData.flatMap((ch) =>
        ch.subsections.flatMap((s) => s.cards)
      );
      while (
        rawRefreshPool.length < 4 &&
        rawRefreshPool.length < masterPool.length
      ) {
        const randCard =
          masterPool[Math.floor(Math.random() * masterPool.length)];
        if (!rawRefreshPool.find((c) => c.id === randCard.id))
          rawRefreshPool.push(randCard);
      }
    }

    const operationalSet = rawRefreshPool
      .sort(() => 0.5 - Math.random())
      .slice(0, 4);
    const fronts = operationalSet.map((c) => ({
      id: c.id,
      text: c.front,
      type: "front",
    }));
    const backs = operationalSet.map((c) => ({
      id: c.id,
      text: c.back,
      type: "back",
    }));

    setMatchCards([...fronts, ...backs].sort(() => 0.5 - Math.random()));
    setMatchedIds([]);
    setSelectedMatch(null);
    setMismatchedPair([]);
    setView("match-game");
  };

  const handleMatchSelection = (clickedItem) => {
    if (matchedIds.includes(clickedItem.id) || mismatchedPair.length > 0)
      return;
    if (
      selectedMatch &&
      selectedMatch.id === clickedItem.id &&
      selectedMatch.type === clickedItem.type
    ) {
      setSelectedMatch(null);
      return;
    }

    if (!selectedMatch) {
      setSelectedMatch(clickedItem);
    } else {
      if (
        selectedMatch.id === clickedItem.id &&
        selectedMatch.type !== clickedItem.type
      ) {
        const newMatches = [...matchedIds, clickedItem.id];
        setMatchedIds(newMatches);
        setSelectedMatch(null);

        const { updatedProgress, newStreak } = processAnswerExecution(
          clickedItem.id,
          true,
          progress
        );
        setProgress(updatedProgress);
        saveToCloud(updatedProgress, "flashcards", newStreak);

        if (newMatches.length === 4)
          setTimeout(() => {
            setView("match-done");
          }, 600);
      } else {
        setMismatchedPair([selectedMatch, clickedItem]);
        setSelectedMatch(null);
        setTimeout(() => {
          setMismatchedPair([]);
        }, 1000);
      }
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

  const startTopicWrittenQuiz = (chapterId) => {
    const chapterNum = chapterId.replace("ch", "");
    const chapterQuestions = writtenData.filter((q) =>
      q.topic.startsWith(`${chapterNum}.`)
    );
    if (chapterQuestions.length === 0) {
      alert("No long answer questions found for this chapter yet!");
      return;
    }

    const sortedIds = chapterQuestions
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
      alert("Select a topic!");
      return;
    }
    const filteredCards = flashcardData
      .filter((ch) => blitzFilters.includes(ch.id))
      .flatMap((ch) => ch.subsections.flatMap((s) => s.cards || []));
    if (filteredCards.length === 0) {
      alert("No cards found for selected options!");
      return;
    }

    setQuizQueue(
      [...filteredCards].sort(() => 0.5 - Math.random()).map((c) => c.id)
    );
    setBlitzScore(0);
    setTimeLeft(60);
    setView("speed-blitz");

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((p) => {
        if (p <= 1) {
          clearInterval(timerRef.current);
          setView("blitz-done");
          return 0;
        }
        return p - 1;
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
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );

  const renderView = () => {
    const trueDecayedTotal = getDecayedCardsCount();

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
              padding: "0 20px",
              boxSizing: "border-box",
            }}
          >
            <div
              className="login-box glass-panel"
              style={{
                width: "100%",
                maxWidth: "400px",
                padding: "40px 30px",
                boxSizing: "border-box",
              }}
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
                  } else setLoginError("Invalid Account Credentials.");
                }}
              >
                <input
                  className="input-field"
                  placeholder="Username"
                  onChange={(e) => setLoginInput(e.target.value)}
                  required
                  style={{
                    marginBottom: "20px",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
                <div
                  className="password-wrapper"
                  style={{
                    marginBottom: "30px",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                    style={{ width: "100%", boxSizing: "border-box" }}
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
                  style={{
                    padding: "15px",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  Log In
                </button>
              </form>
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
                <button className="theme-toggle-btn" onClick={toggleTheme}>
                  {theme === "light" ? "🌙 Dark" : "☀️ Light"}
                </button>
                <button
                  className="logout-btn"
                  onClick={() => {
                    setCurrentUser(null);
                    setProgress({});
                    setWrittenProgress({});
                    setStreak({ current: 0, longest: 0, lastDate: 0 });
                    setAllUsersData([]);
                    setQuizQueue([]);
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
            <h1 style={{ marginBottom: "25px" }}>Main Menu</h1>
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
                className="menu-card glass-panel"
                onClick={startRefreshPacket}
              >
                <h2>
                  🔄 Refresh{" "}
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
              </div>
              <div
                className="menu-card glass-panel"
                onClick={startMatchGameCanvas}
              >
                <h2>🧩 Match</h2>
                <p>Definition Speed Game</p>
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
            </div>
          </>
        );
      case "insights-dashboard":
        const allCards = flashcardData.flatMap((ch) =>
          ch.subsections.flatMap((s) => s.cards)
        );
        const totalMastery = getSectionMastery(allCards);
        const attemptedWrittenIds = Object.keys(writtenProgress);
        const avgWrittenScore =
          attemptedWrittenIds.length > 0
            ? Math.round(
                attemptedWrittenIds.reduce(
                  (acc, id) => acc + writtenProgress[id].last_score,
                  0
                ) / attemptedWrittenIds.length
              )
            : 0;
        const attemptedCardsCount = allCards.filter(
          (c) => progress[c.id] !== undefined
        ).length;
        const structuralDecayPercent =
          attemptedCardsCount > 0
            ? Math.round((trueDecayedTotal / attemptedCardsCount) * 100)
            : 0;

        return (
          <div className="app-container">
            <button className="back-link" onClick={() => setView("menu")}>
              ← Back to Menu
            </button>
            <h1 style={{ marginBottom: "20px" }}>📊 Your Insights</h1>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "15px",
                marginBottom: "20px",
              }}
            >
              <div
                className="glass-panel"
                style={{
                  padding: "20px",
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "2.5rem",
                    fontWeight: "bold",
                    color: "var(--primary)",
                  }}
                >
                  {totalMastery}%
                </div>
                <div
                  style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}
                >
                  Overall Syllabus Mastery
                </div>
              </div>
              <div
                className="glass-panel"
                style={{
                  padding: "20px",
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
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
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${structuralDecayPercent}%`,
                      height: "100%",
                      background: "var(--red)",
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginTop: "5px",
                  }}
                >
                  {trueDecayedTotal} learned cards require review
                </div>
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
                <div style={{ fontSize: "2rem", marginBottom: "5px" }}>⚡</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                  {streak.longest} days
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  All-Time Best Streak
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
                  Overall Essay Avg
                </div>
              </div>
            </div>
            <h2 style={{ marginBottom: "15px" }}>Topic Breakdown</h2>
            {flashcardData.map((ch) => {
              const chapMastery = getSectionMastery(
                ch.subsections.flatMap((s) => s.cards)
              );
              const chapterNum = ch.id.replace("ch", "");
              const chapEssayIds = writtenData
                .filter((q) => q.topic.startsWith(`${chapterNum}.`))
                .map((q) => q.id);
              const attemptedChapEssays = chapEssayIds.filter(
                (id) => writtenProgress[id]
              );
              const chapEssayScore =
                attemptedChapEssays.length > 0
                  ? Math.round(
                      attemptedChapEssays.reduce(
                        (acc, id) => acc + writtenProgress[id].last_score,
                        0
                      ) / attemptedChapEssays.length
                    )
                  : 0;
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
                  <div style={{ maxWidth: "60%" }}>
                    <b style={{ fontSize: "1.1rem" }}>{ch.title}</b>
                    {attemptedChapEssays.length > 0 && (
                      <div
                        style={{
                          fontSize: "0.85rem",
                          color: "var(--text-muted)",
                          marginTop: "5px",
                        }}
                      >
                        ✍️ Essay Avg: {chapEssayScore}%
                      </div>
                    )}
                  </div>
                  <MasteryRing
                    score={chapMastery}
                    color={getRingColor(chapMastery)}
                  />
                </div>
              );
            })}
          </div>
        );
      case "match-game":
        return (
          <div className="app-container">
            <button className="back-link" onClick={() => setView("menu")}>
              ← Exit Game
            </button>
            <h1 style={{ marginBottom: "5px" }}>🧩 Match Board</h1>
            <p style={{ color: "var(--text-muted)", marginBottom: "20px" }}>
              Click a term and pair it with its correct definition to clear it
              from your backlog.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginTop: "15px",
              }}
            >
              {matchCards.map((item, idx) => {
                const isMatched = matchedIds.includes(item.id);
                const isSelected =
                  selectedMatch &&
                  selectedMatch.id === item.id &&
                  selectedMatch.type === item.type;
                const isMismatched = mismatchedPair.find(
                  (p) => p.id === item.id && p.type === item.type
                );
                let borderStyle = "1px solid var(--glass-border)";
                let backgroundStyle = "rgba(255, 255, 255, 0.03)";
                let opacityStyle = 1;
                if (isSelected) {
                  borderStyle = "1px solid var(--primary)";
                  backgroundStyle = "rgba(59, 130, 246, 0.15)";
                }
                if (isMismatched) {
                  borderStyle = "1px solid var(--red)";
                  backgroundStyle = "rgba(239, 68, 68, 0.2)";
                }
                if (isMatched) {
                  borderStyle = "1px solid transparent";
                  backgroundStyle = "rgba(16, 185, 129, 0.1)";
                  opacityStyle = 0.2;
                }
                return (
                  <div
                    key={`${item.id}-${item.type}-${idx}`}
                    className="glass-panel"
                    onClick={() => handleMatchSelection(item)}
                    style={{
                      padding: "20px 15px",
                      minHeight: "100px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      cursor: isMatched ? "default" : "pointer",
                      border: borderStyle,
                      background: backgroundStyle,
                      opacity: opacityStyle,
                      fontSize: "0.95rem",
                      lineHeight: "1.4",
                      pointerEvents: isMatched ? "none" : "auto",
                      transition: "all 0.2s ease, opacity 0.4s ease",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.65rem",
                          color: "var(--text-muted)",
                          letterSpacing: "1px",
                          textTransform: "uppercase",
                          marginBottom: "5px",
                        }}
                      >
                        {item.type === "front" ? "📌 Term" : "📝 Definition"}
                      </div>
                      <b>{item.text}</b>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      case "match-done":
        return (
          <div
            className="flashcard glass-panel"
            style={{ textAlign: "center", padding: "50px 20px" }}
          >
            <div style={{ fontSize: "5rem", marginBottom: "15px" }}>🧩</div>
            <h2 style={{ color: "var(--green)", fontSize: "2rem" }}>
              Board Cleared!
            </h2>
            <p
              style={{
                marginBottom: "40px",
                fontSize: "1.1rem",
                color: "var(--text-muted)",
              }}
            >
              Those cards have been successfully advanced in your spacing
              schedule and cleared from your refresh list.
            </p>
            <button
              className="btn-primary"
              style={{ marginBottom: "15px" }}
              onClick={startMatchGameCanvas}
            >
              Play Next Board
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
      case "blitz-setup":
        return (
          <div className="app-container">
            <button className="back-link" onClick={() => setView("menu")}>
              ← Back to Menu
            </button>
            <h1 style={{ marginBottom: "5px" }}>⚡ Blitz Setup</h1>
            <p style={{ color: "var(--text-muted)", marginBottom: "25px" }}>
              Select the chapters to include in the speed fire-round. Answer as
              many as possible within 60 seconds.
            </p>
            <div className="filter-list" style={{ marginBottom: "30px" }}>
              {flashcardData.map((ch) => {
                const active = blitzFilters.includes(ch.id);
                return (
                  <label
                    key={ch.id}
                    className="filter-item glass-panel"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "15px 20px",
                      marginBottom: "10px",
                      cursor: "pointer",
                      border: active
                        ? "1px solid var(--primary)"
                        : "1px solid var(--glass-border)",
                      background: active
                        ? "rgba(59, 130, 246, 0.1)"
                        : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleBlitzFilter(ch.id)}
                      style={{ cursor: "pointer" }}
                    />
                    <b>{ch.title}</b>
                  </label>
                );
              })}
            </div>
            <button
              className="btn-primary"
              onClick={startBlitz}
              style={{ padding: "18px", fontSize: "1.1rem" }}
            >
              Start Timed Challenge ⏱️
            </button>
          </div>
        );
      case "speed-blitz":
        return (
          <div className="app-container">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <div
                className="glass-panel"
                style={{
                  padding: "10px 20px",
                  color: "var(--red)",
                  fontWeight: "bold",
                  fontSize: "1.2rem",
                }}
              >
                ⏱️ {timeLeft}s Left
              </div>
              <div
                className="glass-panel"
                style={{
                  padding: "10px 20px",
                  color: "var(--green)",
                  fontWeight: "bold",
                  fontSize: "1.2rem",
                }}
              >
                Score: {blitzScore}
              </div>
            </div>
            <QuizCard
              card={flashcardData
                .flatMap((ch) => ch.subsections.flatMap((s) => s.cards))
                .find((c) => c.id === quizQueue[0])}
              onAnswer={(c) => handleFlashcardAnswer(c, "blitz")}
              count={null}
            />
          </div>
        );
      case "blitz-done":
        return (
          <div
            className="flashcard glass-panel"
            style={{ textAlign: "center", padding: "50px 20px" }}
          >
            <div style={{ fontSize: "5rem", marginBottom: "15px" }}>⚡</div>
            <h2 style={{ color: "var(--primary)", fontSize: "2rem" }}>
              Time's Up!
            </h2>
            <p
              style={{
                fontSize: "1.2rem",
                margin: "20px 0",
                fontWeight: "bold",
              }}
            >
              You correctly cleared{" "}
              <span style={{ color: "var(--green)", fontSize: "1.5rem" }}>
                {blitzScore}
              </span>{" "}
              terms inside the boundary threshold!
            </p>
            <button
              className="btn-primary"
              style={{ marginBottom: "15px" }}
              onClick={() => setView("blitz-setup")}
            >
              Play Again
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
      case "quiz-dashboard":
      case "learn-dashboard":
        return (
          <>
            <button className="back-link" onClick={() => setView("menu")}>
              ← Back to Menu
            </button>
            <h1 style={{ marginBottom: "20px" }}>
              {view === "learn-dashboard" ? "Study Materials" : "Select Quiz"}
            </h1>
            {flashcardData.map((ch) => {
              const isExpanded = expandedChapters.includes(ch.id);
              const chapMastery = getSectionMastery(
                ch.subsections.flatMap((s) => s.cards)
              );
              const chapterNum = ch.id.replace("ch", "");
              const chapterEssays = writtenData.filter((q) =>
                q.topic.startsWith(`${chapterNum}.`)
              );
              return (
                <div key={ch.id} style={{ marginBottom: "10px" }}>
                  <div
                    className="glass-panel"
                    style={{
                      padding: "18px 20px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
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
                            <b style={{ fontSize: "1.05rem" }}>
                              📖 {sub.title}
                            </b>
                            {view === "quiz-dashboard" && (
                              <MasteryRing
                                score={subMastery}
                                color={getRingColor(subMastery)}
                              />
                            )}
                          </div>
                        );
                      })}
                      {chapterEssays.length > 0 &&
                        view === "quiz-dashboard" && (
                          <div
                            className="student-row glass-panel"
                            style={{
                              marginBottom: "10px",
                              background: "rgba(59, 130, 246, 0.1)",
                            }}
                            onClick={() => startTopicWrittenQuiz(ch.id)}
                          >
                            <b
                              style={{
                                fontSize: "1.05rem",
                                color: "var(--primary)",
                              }}
                            >
                              ✍️ Exam-Style Questions ({chapterEssays.length})
                            </b>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        );
      case "leaderboard":
        const rankedUsers = [...allUsersData].sort((a, b) => {
          const streakA = a.streak?.current || 0;
          const streakB = b.streak?.current || 0;
          return streakB - streakA;
        });
        return (
          <div className="app-container">
            <button className="back-link" onClick={() => setView("menu")}>
              ← Back to Menu
            </button>
            <h1 style={{ marginBottom: "10px" }}>🏆 Global Leaderboard</h1>
            <p style={{ color: "var(--text-muted)", marginBottom: "25px" }}>
              Ranks update in real-time based on active streaks.
            </p>
            <div
              className="glass-panel"
              style={{ padding: "0px", overflowX: "auto" }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "2px solid var(--glass-border)",
                      background: "rgba(255,255,255,0.05)",
                    }}
                  >
                    <th
                      style={{ padding: "15px 20px", color: "var(--primary)" }}
                    >
                      Rank
                    </th>
                    <th
                      style={{ padding: "15px 20px", color: "var(--primary)" }}
                    >
                      Student
                    </th>
                    <th
                      style={{
                        padding: "15px 20px",
                        color: "var(--primary)",
                        textAlign: "center",
                      }}
                    >
                      Current Streak
                    </th>
                    <th
                      style={{
                        padding: "15px 20px",
                        color: "var(--primary)",
                        textAlign: "center",
                      }}
                    >
                      Longest Streak
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rankedUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan="4"
                        style={{
                          padding: "30px",
                          textAlign: "center",
                          color: "var(--text-muted)",
                        }}
                      >
                        Waiting for global rank data to sync...
                      </td>
                    </tr>
                  ) : (
                    rankedUsers.map((user, index) => {
                      const isCurrentUser = user.id === currentUser;
                      let medal = "";
                      if (index === 0) medal = "🥇 ";
                      else if (index === 1) medal = "🥈 ";
                      else if (index === 2) medal = "🥉 ";
                      return (
                        <tr
                          key={user.id}
                          style={{
                            borderBottom: "1px solid var(--glass-border)",
                            background: isCurrentUser
                              ? "rgba(59, 130, 246, 0.1)"
                              : "transparent",
                            fontWeight: isCurrentUser ? "bold" : "normal",
                          }}
                        >
                          <td style={{ padding: "15px 20px" }}>
                            {medal || `${index + 1}`}
                          </td>
                          <td
                            style={{
                              padding: "15px 20px",
                              textTransform: "capitalize",
                            }}
                          >
                            {user.id}{" "}
                            {isCurrentUser && (
                              <span
                                style={{
                                  fontSize: "0.8rem",
                                  color: "var(--primary)",
                                }}
                              >
                                (You)
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: "15px 20px",
                              textAlign: "center",
                              color: "var(--orange)",
                            }}
                          >
                            🔥 {user.streak?.current || 0} days
                          </td>
                          <td
                            style={{
                              padding: "15px 20px",
                              textAlign: "center",
                              color: "var(--text-muted)",
                            }}
                          >
                            {user.streak?.longest || 0} days
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
                ? "You successfully reviewed this packet."
                : "Topic Learned! (Review it tomorrow to shield it)"}
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
              onClick={() => setView("menu")}
            >
              Back to Menu
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
              You crushed this chapter's exam questions.
            </p>
            <button
              className="btn-primary"
              style={{ background: "var(--text-muted)" }}
              onClick={() => setView("menu")}
            >
              Back to Menu
            </button>
          </div>
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
            <h1 style={{ marginBottom: "25px" }}>{activeSubsection.title}</h1>
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
                {c.imageUrl && (
                  <img
                    src={c.imageUrl}
                    alt={c.front}
                    style={{
                      width: "100%",
                      borderRadius: "10px",
                      marginBottom: "15px",
                    }}
                  />
                )}
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
        return (
          <div
            className="app-container"
            style={{ textAlign: "center", padding: "40px" }}
          >
            <h2>Unexpected Application State</h2>
            <p style={{ color: "var(--text-muted)" }}>
              Resetting application routing environment...
            </p>
            <button className="btn-primary" onClick={() => setView("menu")}>
              Return to Safety
            </button>
          </div>
        );
    }
  };

  return (
    <div className="app-main-wrapper">
      <div className="texture-grain"></div>
      <div className="mesh-background"></div>
      <div className="geo-shape shape-1 cube-pro-blue"></div>
      <div className="geo-shape shape-2 orb-pro-purple"></div>
      <div className="app-container">{renderView()}</div>
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
      {count && <div className="label">REMAINING: {count}</div>}
      {card.imageUrl && (
        <img
          src={card.imageUrl}
          alt={card.front}
          style={{ width: "100%", borderRadius: "10px", marginBottom: "15px" }}
        />
      )}
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
  useEffect(() => {
    setShowAnswer(false);
    setCheckedBoxes([]);
  }, [question?.id]);
  if (!question) return null;
  const maxMarksHit = checkedBoxes.length >= question.marks;
  return (
    <div className="flashcard glass-panel">
      <div className="label">REMAINING: {count}</div>
      <h2 style={{ color: "var(--primary)", marginBottom: "10px" }}>
        {question.marks} Marks
      </h2>
      {question.imageRequired && question.imageRequired !== "null" && (
        <div
          style={{
            marginBottom: "20px",
            padding: "10px",
            background: "rgba(0,0,0,0.3)",
            borderRadius: "10px",
          }}
        >
          <img
            src={`/images/${question.id}.png`}
            alt="Exam Reference Material"
            style={{ width: "100%", borderRadius: "5px" }}
            onError={(e) => {
              e.target.onerror = null;
              e.target.style.display = "none";
            }}
          />
          <div
            style={{
              fontSize: "0.8rem",
              color: "var(--text-muted)",
              textAlign: "center",
              marginTop: "5px",
            }}
          >
            Figure: Reference Material
          </div>
        </div>
      )}
      <div className="pre-line" style={{ marginBottom: "25px" }}>
        <b>{question.question}</b>
      </div>
      <textarea
        className="input-field glass-panel"
        rows="5"
        placeholder="Type your answer here..."
        readOnly={showAnswer}
      />
      {!showAnswer ? (
        <button className="btn-primary" onClick={() => setShowAnswer(true)}>
          Show Mark Scheme
        </button>
      ) : (
        <div style={{ marginTop: "25px" }}>
          <div className="filter-list">
            {question.points.map((point, index) => (
              <label key={index} className="filter-item glass-panel">
                <input
                  type="checkbox"
                  checked={checkedBoxes.includes(index)}
                  onChange={() => {
                    if (checkedBoxes.includes(index))
                      setCheckedBoxes(checkedBoxes.filter((i) => i !== index));
                    else if (!maxMarksHit)
                      setCheckedBoxes([...checkedBoxes, index]);
                  }}
                />
                <span>{point}</span>
              </label>
            ))}
          </div>
          <button
            className="btn-primary"
            style={{ background: "var(--green)" }}
            onClick={() => onSubmit(checkedBoxes.length, question.marks)}
          >
            Submit ({checkedBoxes.length}/{question.marks})
          </button>
        </div>
      )}
    </div>
  );
}
