import React, { useState, useEffect, useRef, useCallback } from "react";
import { flashcardData, writtenData } from "./data";
import { db, auth } from "./firebase"; 
import { doc, setDoc, collection, onSnapshot, writeBatch, increment } from "firebase/firestore";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { MasteryRing } from "./components/MasteryRing";
import { QuizCard, WrittenQuizCard } from "./components/QuizCards";
import { Skeleton } from "./components/Skeleton"; // Step 3 Addition
import "./styles.css";

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return localStorage.getItem("current_user") || null; } catch (e) { return null; }
  });
  
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("theme") || "dark"; } catch (e) { return "dark"; }
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
  const [progress, setProgress] = useState({});
  const [writtenProgress, setWrittenProgress] = useState({});
  const [streak, setStreak] = useState({ current: 0, longest: 0, lastDate: 0 });
  const [quizQueue, setQuizQueue] = useState([]);
  const [quizType, setQuizType] = useState("topic"); 
  const [allUsersData, setAllUsersData] = useState([]);
  const [activeSubsection, setActiveSubsection] = useState(null);
  const [expandedChapters, setExpandedChapters] = useState([]);
  const [isHydrated, setIsHydrated] = useState(false); // Step 3 Addition
  
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
      try { localStorage.setItem("theme", theme); } catch(e) {}
    }
  }, [theme]);

  useEffect(() => {
    if (currentUser) {
      if (userRole === "teacher") setView("teacher-dashboard");
      else setView("menu");
    } else {
      setView("login");
    }
  }, [currentUser, userRole]);

  useEffect(() => {
    if (!currentUser || currentUser === "admin" || !db) {
        setIsHydrated(true); 
        return;
    }
    
    const unsubUser = onSnapshot(doc(db, "users", currentUser), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserName(data.name || "");
        setUserRole(data.role || "student");
        setUserClassCode(data.classCode || "");
        setWrittenProgress(prev => JSON.stringify(prev) === JSON.stringify(data.writtenProgress) ? prev : (data.writtenProgress || {}));
        setStreak(prev => JSON.stringify(prev) === JSON.stringify(data.streak) ? prev : (data.streak || { current: 0, longest: 0, lastDate: 0 }));
      }
      setIsHydrated(true); // Step 3 Addition: Signal load complete
    }, (error) => { console.error("Firestore Profile Sync Error:", error); setIsHydrated(true); });

    const unsubProgress = onSnapshot(collection(db, "users", currentUser, "progress"), (snap) => {
      const newProgress = {};
      snap.forEach(d => { newProgress[d.id] = d.data(); });
      setProgress(prev => JSON.stringify(prev) === JSON.stringify(newProgress) ? prev : newProgress);
    }, (error) => console.error("Firestore Progress Subcollection Sync Error:", error));

    return () => { unsubUser(); unsubProgress(); }; 
  }, [currentUser]);

  useEffect(() => {
    if ((view === "admin-dashboard" || view === "leaderboard" || view === "teacher-dashboard") && db) {
      const unsub = onSnapshot(collection(db, "users"), (snap) => {
        const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllUsersData(prev => JSON.stringify(prev) === JSON.stringify(users) ? prev : users);
      });
      return () => unsub();
    }
  }, [view]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const saveWrittenToCloud = async (newProgress) => {
    if (!currentUser || currentUser === "admin") return;
    try {
      await setDoc(doc(db, "users", currentUser), { writtenProgress: newProgress, lastUpdated: Date.now() }, { merge: true });
    } catch (e) { console.error("Cloud Write Execution Failure:", e); }
  };

  const calculateMastery = (cardId, currentProgress = progress) => {
    const p = currentProgress[cardId];
    if (!p) return 0;
    let startingMastery = p.baseMastery;
    if (startingMastery === undefined) startingMastery = p.status === "correct" ? 100 : 0;
    
    let consecutive = p.consecutiveCorrect || 0;
    const safeLastSeen = p.lastSeen || Date.now();
    const daysPassed = Math.max(0, (Date.now() - safeLastSeen) / (1000 * 60 * 60 * 24));
    
    let decayRate;
    if (consecutive === 0) decayRate = 12;        
    else if (consecutive === 1) decayRate = 3;     
    else if (consecutive === 2) decayRate = 0.8;   
    else decayRate = 0.15;                         
    
    let currentMastery = startingMastery - (daysPassed * decayRate);
    return Math.max(0, Math.min(100, Math.round(currentMastery) || 0));
  };

  const getSectionMastery = (cards, prog = progress) => {
    if (!cards || cards.length === 0) return 0;
    const total = cards.reduce((acc, card) => acc + calculateMastery(card.id, prog), 0);
    return Math.round(total / cards.length) || 0; 
  };

  const getDecayedCardsCount = () => {
    let count = 0;
    flashcardData.forEach(ch => {
      ch.subsections.forEach(sub => {
        sub.cards.forEach(c => {
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
    flashcardData.forEach(ch => {
      ch.subsections.forEach(sub => {
        const subMastery = getSectionMastery(sub.cards);
        if (subMastery < 80) {
          const due = sub.cards.filter(c => {
            const hasBeenAttempted = progress[c.id] !== undefined;
            return hasBeenAttempted && calculateMastery(c.id) < 80;
          });
          weakCards = [...weakCards, ...due];
        }
      });
    });
    weakCards.sort((a,b) => calculateMastery(a.id) - calculateMastery(b.id));

    if (weakCards.length > 0) {
      setQuizType("refresh");
      setQuizQueue(weakCards.slice(0, 6).map(c => c.id));
      setView("quiz-session");
    } else {
      alert("All your active studied topics are currently green! Great job.");
    }
  };

  const getUTCMidnight = () => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  };

  const processAnswer = async (cardId, isCorrect) => {
    const p = progress[cardId] || {};
    const isCramming = (Date.now() - (p.lastSeen || 0)) < 43200000; 

    let newBaseMastery = isCorrect ? 100 : 0;
    let newConsecutive = p.consecutiveCorrect || 0;
    if (isCorrect && !isCramming) newConsecutive += 1;
    if (!isCorrect) newConsecutive = 0;

    const cardData = {
      baseMastery: newBaseMastery,
      consecutiveCorrect: newConsecutive,
      lastSeen: Date.now(),
      status: isCorrect ? "correct" : "incorrect"
    };

    setProgress(prev => ({ ...prev, [cardId]: cardData }));

    if (!currentUser || currentUser === "admin") return;

    try {
      const batch = writeBatch(db);
      const userRef = doc(db, "users", currentUser);
      const cardRef = doc(db, "users", currentUser, "progress", cardId);

      batch.set(cardRef, cardData, { merge: true });

      const todayUTC = getUTCMidnight();
      const yesterdayUTC = todayUTC - 86400000;

      let streakUpdate = { lastUpdated: Date.now() };
      if (streak.lastDate !== todayUTC) {
        if (streak.lastDate === yesterdayUTC) {
          streakUpdate["streak.current"] = increment(1);
          streakUpdate["streak.lastDate"] = todayUTC;
          if (streak.current + 1 > streak.longest) streakUpdate["streak.longest"] = streak.current + 1;
        } else {
          streakUpdate["streak.current"] = 1;
          streakUpdate["streak.lastDate"] = todayUTC;
        }
      }
      
      batch.set(userRef, streakUpdate, { merge: true });
      await batch.commit();
    } catch (e) { 
      console.error("Cloud Batch Execution Failure:", e); 
    }
  };

  const handleFlashcardAnswer = useCallback((isCorrect, mode) => {
    const currentId = quizQueue[0];
    processAnswer(currentId, isCorrect);
    
    if (mode === "blitz" && isCorrect) {
      setBlitzScore(prev => prev + 1);
    }
    
    let nQ = [...quizQueue]; 
    nQ.shift();
    if (!isCorrect && mode !== "blitz") nQ.splice(Math.min(2, nQ.length), 0, currentId);
    
    if (nQ.length === 0 || (mode === "blitz" && timeLeft <= 0)) {
      if (timerRef.current) clearInterval(timerRef.current);
      setView(mode === "blitz" ? "blitz-done" : "quiz-done"); 
    } else { 
      setQuizQueue(nQ); 
    }
  }, [quizQueue, streak, timeLeft, currentUser]);

  const handleWrittenAnswer = useCallback((score, maxMarks) => {
    const currentId = quizQueue[0];
    const currentData = writtenProgress[currentId] || { attempts: 0 };
    const newWrittenProgress = { ...writtenProgress, [currentId]: { attempts: currentData.attempts + 1, last_score: (score / maxMarks) * 100, timestamp: Date.now() } };
    
    setWrittenProgress(newWrittenProgress); 
    saveWrittenToCloud(newWrittenProgress);
    
    let nQ = [...quizQueue]; 
    nQ.shift();
    if (nQ.length === 0) setView("written-done"); 
    else setQuizQueue(nQ);
  }, [quizQueue, writtenProgress]);

  const startMatchGameCanvas = () => {
    let rawRefreshPool = [];
    flashcardData.forEach(ch => {
      ch.subsections.forEach(sub => {
        sub.cards.forEach(c => {
          const hasBeenAttempted = progress[c.id] !== undefined;
          if (hasBeenAttempted && calculateMastery(c.id) < 80) rawRefreshPool.push(c);
        });
      });
    });

    if (rawRefreshPool.length < 4) {
      const attemptedPool = flashcardData
        .flatMap(ch => ch.subsections.flatMap(s => s.cards))
        .filter(c => progress[c.id] !== undefined);
      while (rawRefreshPool.length < 4 && rawRefreshPool.length < attemptedPool.length) {
        const randCard = attemptedPool[Math.floor(Math.random() * attemptedPool.length)];
        if (!rawRefreshPool.find(c => c.id === randCard.id)) rawRefreshPool.push(randCard);
      }
    }

    if (rawRefreshPool.length < 4) {
      const masterPool = flashcardData.flatMap(ch => ch.subsections.flatMap(s => s.cards));
      while (rawRefreshPool.length < 4 && rawRefreshPool.length < masterPool.length) {
        const randCard = masterPool[Math.floor(Math.random() * masterPool.length)];
        if (!rawRefreshPool.find(c => c.id === randCard.id)) rawRefreshPool.push(randCard);
      }
    }

    const operationalSet = rawRefreshPool.sort(() => 0.5 - Math.random()).slice(0, 4);
    const fronts = operationalSet.map(c => ({ id: c.id, text: c.front, type: "front" }));
    const backs = operationalSet.map(c => ({ id: c.id, text: c.back, type: "back" }));
    
    setMatchCards([...fronts, ...backs].sort(() => 0.5 - Math.random()));
    setMatchedIds([]);
    setSelectedMatch(null);
    setMismatchedPair([]);
    setView("match-game");
  };

  const handleMatchSelection = (clickedItem) => {
    if (matchedIds.includes(clickedItem.id) || mismatchedPair.length > 0) return;
    if (selectedMatch && selectedMatch.id === clickedItem.id && selectedMatch.type === clickedItem.type) {
      setSelectedMatch(null); return; 
    }

    if (!selectedMatch) {
      setSelectedMatch(clickedItem);
    } else {
      if (selectedMatch.id === clickedItem.id && selectedMatch.type !== clickedItem.type) {
        const newMatches = [...matchedIds, clickedItem.id];
        setMatchedIds(newMatches);
        setSelectedMatch(null);

        processAnswer(clickedItem.id, true);

        if (newMatches.length === 4) setTimeout(() => { setView("match-done"); }, 600);
      } else {
        setMismatchedPair([selectedMatch, clickedItem]);
        setSelectedMatch(null);
        setTimeout(() => { setMismatchedPair([]); }, 1000);
      }
    }
  };

  const handleGlobalLogout = () => {
    setCurrentUser(null); 
    setUserName("");
    setUserRole("");
    setUserClassCode("");
    setProgress({});
    setWrittenProgress({});
    setStreak({ current: 0, longest: 0, lastDate: 0 });
    setAllUsersData([]);
    setQuizQueue([]);
    setView("login"); 
    try { localStorage.removeItem("current_user"); } catch(e) {}
  };

  const renderView = () => {
    const trueDecayedTotal = getDecayedCardsCount();

    switch (view) {
      case "login":
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '0 20px', boxSizing: 'border-box' }}>
            <div className="login-box glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '40px 30px', boxSizing: 'border-box' }}>
              <h1 style={{fontSize: '2.5rem', marginBottom: '30px', textAlign: 'center'}}>D&T Hub</h1>
              {loginError && <p style={{color:'var(--red)', fontWeight:'bold', textAlign: 'center', marginBottom:'15px'}}>{loginError}</p>}
              <form onSubmit={async (e) => {
                e.preventDefault(); 
                setLoginError("");
                const input = loginInput.trim().toLowerCase();
                
                if (!isSignUp) {
                  if (!input.includes("@")) { 
                    setLoginError("Please enter a valid email address."); 
                    return; 
                  }
                  try {
                    const cred = await signInWithEmailAndPassword(auth, input, passwordInput);
                    const emailAsId = cred.user.email.toLowerCase();
                    try { localStorage.setItem("current_user", emailAsId); } catch(err) {}
                    setCurrentUser(emailAsId);
                  } catch (err) {
                    setLoginError("Invalid Account Credentials.");
                  }
                } else {
                  if (!input.includes("@")) { setLoginError("Please enter a valid email address."); return; }
                  if (passwordInput.length < 6) { setLoginError("Password must be at least 6 characters."); return; }
                  if (nameInput.trim() === "") { setLoginError("Please provide your First and Last Name."); return; }
                  
                  if (roleInput === "teacher" && licenseInput !== "DTHUB-PRO") {
                    setLoginError("Invalid Teacher License Key."); 
                    return;
                  }

                  try {
                    const cred = await createUserWithEmailAndPassword(auth, input, passwordInput);
                    const emailAsId = cred.user.email.toLowerCase();
                    
                    const newUserData = {
                      name: nameInput.trim(),
                      role: roleInput,
                      writtenProgress: {},
                      streak: { current: 0, longest: 0, lastDate: 0 },
                      createdAt: Date.now()
                    };

                    if (roleInput === "student") {
                      if (classCodeInput.trim() === "") {
                        setLoginError("Class Code required for school registration.");
                        return;
                      }
                      newUserData.classCode = classCodeInput.trim().toUpperCase();
                    }

                    if (roleInput === "teacher") {
                      const uniqueSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
                      newUserData.classCode = `TEACH-${uniqueSuffix}`; 
                    }

                    await setDoc(doc(db, "users", emailAsId), newUserData);
                    try { localStorage.setItem("current_user", emailAsId); } catch(err) {}
                    setCurrentUser(emailAsId);
                  } catch (err) {
                    setLoginError(err.message.replace("Firebase: ", ""));
                  }
                }
              }}>
                {isSignUp && (
                  <input className="input-field" placeholder="First and Last Name" value={nameInput} onChange={e => setNameInput(e.target.value)} required style={{marginBottom: '15px', width:'100%', boxSizing:'border-box'}}/>
                )}
                <input className="input-field" placeholder={isSignUp ? "Email Address" : "Email or Username"} onChange={e => setLoginInput(e.target.value)} required style={{marginBottom: '15px', width:'100%', boxSizing:'border-box'}}/>
                {isSignUp && (
                  <select className="input-field" value={roleInput} onChange={e => setRoleInput(e.target.value)} style={{marginBottom: '15px', width:'100%', boxSizing:'border-box', appearance:'none'}}>
                    <option value="student">I am a School Student</option>
                    <option value="solo">I am studying alone (B2C)</option>
                    <option value="teacher">I am a School Teacher</option>
                  </select>
                )}
                {isSignUp && roleInput === "student" && (
                  <input className="input-field" placeholder="Enter Class Code" value={classCodeInput} onChange={e => setClassCodeInput(e.target.value)} required style={{marginBottom: '15px', width:'100%', boxSizing:'border-box', border:'1px solid var(--primary)'}}/>
                )}
                {isSignUp && roleInput === "teacher" && (
                  <input className="input-field" placeholder="Admin License Key" value={licenseInput} onChange={e => setLicenseInput(e.target.value)} required style={{marginBottom: '15px', width:'100%', boxSizing:'border-box', border:'1px solid var(--orange)'}}/>
                )}
                <div className="password-wrapper" style={{marginBottom: '30px', width:'100%', boxSizing:'border-box', position: 'relative'}}>
                  <input type={showPassword ? "text" : "password"} placeholder="Password" onChange={e => setPasswordInput(e.target.value)} required style={{width:'100%', boxSizing:'border-box'}} />
                  <button type="button" className="toggle-password-btn" onClick={() => setShowPassword(!showPassword)} style={{position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer'}}>{showPassword ? "👁️" : "🙈"}</button>
                </div>
                <button className="btn-primary" type="submit" style={{padding: '15px', width:'100%', boxSizing: 'border-box'}}>{isSignUp ? "Create Account" : "Log In"}</button>
              </form>
              <div style={{textAlign: 'center', marginTop: '20px'}}>
                <button type="button" onClick={() => {setIsSignUp(!isSignUp); setLoginError("");}} style={{background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline'}}>
                  {isSignUp ? "Already have an account? Log In" : "Don't have an account? Sign Up"}
                </button>
              </div>
            </div>
          </div>
        );
      case "teacher-dashboard":
        const classroomCode = userClassCode || "LOADING...";
        const institutionalClassmates = allUsersData.filter(u => u.classCode === classroomCode && u.role === "student");
        return (
          <div className="app-container">
            <div className="user-bar glass-panel" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom:'30px'}}>
              <div>
                <span style={{fontSize: '1.2rem'}}>Welcome, <b style={{textTransform:'capitalize'}}>{userName || "Teacher"}</b></span>
                <div style={{fontSize:'0.85rem', color:'var(--orange)', marginTop:'4px'}}>🏫 Command Center Code: <b>{classroomCode}</b></div>
              </div>
              <button className="logout-btn" onClick={handleGlobalLogout}>Logout</button>
            </div>
            <h1 style={{marginBottom:'10px'}}>📈 Student Analytics</h1>
            <div className="glass-panel" style={{padding:'0px', overflowX:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse', textAlign:'left'}}>
                <thead>
                  <tr style={{borderBottom:'2px solid var(--glass-border)', background:'rgba(255,255,255,0.03)'}}>
                    <th style={{padding:'15px 20px', color:'var(--primary)'}}>Student Name</th>
                    <th style={{padding:'15px 20px', color: 'var(--primary)'}}>Email Connection</th>
                    <th style={{padding:'15px 20px', color:'var(--primary)', textAlign:'center'}}>Current Streak</th>
                    <th style={{padding:'15px 20px', color:'var(--primary)', textAlign:'center'}}>Overall Mastery</th>
                  </tr>
                </thead>
                <tbody>
                  {institutionalClassmates.map(st => {
                      const stCards = flashcardData.flatMap(ch => ch.subsections.flatMap(s => s.cards));
                      const progressObject = st.progress || {};
                      const stMastery = stCards.length > 0 ? Math.round(stCards.reduce((acc, card) => {
                        const p = progressObject[card.id] || {};
                        let startingMastery = p.baseMastery !== undefined ? p.baseMastery : (p.status === "correct" ? 100 : 0);
                        const daysPassed = Math.max(0, (Date.now() - (p.lastSeen || Date.now())) / (1000 * 60 * 60 * 24));
                        let decay = p.consecutiveCorrect === 0 ? 12 : (p.consecutiveCorrect === 1 ? 3 : (p.consecutiveCorrect === 2 ? 0.8 : 0.15));
                        return acc + Math.max(0, Math.min(100, Math.round(startingMastery - (daysPassed * decay))));
                      }, 0) / stCards.length) : 0;
                      return (
                        <tr key={st.id} style={{borderBottom:'1px solid var(--glass-border)'}}>
                          <td style={{padding:'15px 20px', fontWeight:'bold'}}>{st.name || "Legacy Student"}</td>
                          <td style={{padding:'15px 20px', color:'var(--text-muted)', fontSize:'0.9rem'}}>{st.id}</td>
                          <td style={{padding:'15px 20px', textAlign:'center', color: 'var(--orange)'}}>🔥 {st.streak?.current || 0} days</td>
                          <td style={{padding:'15px 20px', textAlign:'center'}}><span style={{color: getRingColor(stMastery), fontWeight:'bold'}}>{stMastery}%</span></td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        );
      case "menu":
        return (
          <>
            <div className="user-bar glass-panel" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div>
                <span style={{display: 'block', fontSize: '1.2rem'}}><b>{userName || currentUser}</b></span>
                <span className={`streak-flame ${streak.current > 0 ? 'active' : ''}`}>🔥 {streak.current} Day Streak</span>
              </div>
              <button className="logout-btn" onClick={handleGlobalLogout}>Logout</button>
            </div>
            <h1 style={{marginBottom: '25px'}}>Main Menu</h1>
            <div className="menu-grid">
              <button className="menu-card" aria-label="Learn" onClick={() => setView("learn-dashboard")}><h2>📖 Learn</h2><p>Review Content</p></button>
              <button className="menu-card" aria-label="Quiz" onClick={() => setView("quiz-dashboard")}><h2>📝 Quiz</h2><p>Practice Topics</p></button>
              <button className="menu-card" aria-label="Refresh Memory" onClick={startRefreshPacket}>
                <h2>🔄 Refresh {trueDecayedTotal > 0 && <span style={{fontSize: '1.1rem', background:'var(--red)', padding:'3px 10px', borderRadius:'12px', marginLeft:'5px', color:'#fff'}}>{trueDecayedTotal}</span>}</h2>
                <p>Fix Decayed Memory</p>
              </button>
              <button className="menu-card" aria-label="Match Game" onClick={startMatchGameCanvas}><h2>🧩 Match</h2><p>Definition Speed Game</p></button>
              <button className="menu-card" aria-label="Insights" onClick={() => setView("insights-dashboard")}><h2>📊 Insights</h2><p>Your Mastery</p></button>
              <button className="menu-card" aria-label="Blitz Challenge" onClick={() => { setBlitzFilters(flashcardData.map(ch => ch.id)); setView("blitz-setup"); }}><h2>⚡ Blitz</h2><p>Timed Challenge</p></button>
              <button className="menu-card" aria-label="Leaderboard" onClick={() => setView("leaderboard")}><h2>🏆 Ranks</h2><p>Global Board</p></button>
            </div>
          </>
        );
      default:
        return <div className="app-container" style={{padding:'40px'}}><h2>Loading...</h2></div>;
    }
  };

  return (
    <div className="app-main-wrapper">
      <div className="texture-grain"></div>
      <div className="mesh-background"></div>
      <div className="app-container">
        {!isHydrated ? <Skeleton lines={5} height="60px" /> : renderView()}
      </div>
    </div>
  );
}