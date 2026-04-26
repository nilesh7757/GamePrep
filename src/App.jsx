import { useState, useEffect, useRef } from 'react';
import { fetchChallenge, fetchResearch, verifyAnswer, fetchGhostChallenge, fetchHint } from './services/nvidiaService';
import { dbService } from './services/dbService';
import { fallbackChallenges } from './data/interviewChallenges';
import './App.css';

const TRACKS = [
  { id: 'dsa', name: 'DSA & CP', icon: '🧠' },
  { id: 'ml', name: 'ML & DL', icon: '🤖' },
  { id: 'system_design', name: 'System Design', icon: '🏗️' },
  { id: 'oops_db', name: 'OOPS & DB', icon: '💾' }
];

const renderMD = (text) => {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    if (line.startsWith('###')) return <h3 key={i} className="nb-h3">{line.replace('###', '')}</h3>;
    if (line.startsWith('##')) return <h2 key={i} className="nb-h2">{line.replace('##', '')}</h2>;
    if (line.startsWith('#')) return <h1 key={i} className="nb-h1">{line.replace('#', '')}</h1>;
    let processed = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/`(.*?)`/g, '<code class="nb-inline-code">$1</code>');
    return <p key={i} dangerouslySetInnerHTML={{ __html: processed || '&nbsp;' }} />;
  });
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState('login'); 
  const [authForm, setAuthForm] = useState({ user: '', pass: '' });
  
  const [view, setView] = useState('home');
  const [sessionConfig, setSessionConfig] = useState({ tracks: [], count: 5 });
  const [sessionResults, setSessionResults] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const [currentTrack, setCurrentTrack] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState(0);
  const [sessionXP, setSessionXP] = useState(0);
  const [timer, setTimer] = useState(60);
  const [result, setResult] = useState(null);
  const [blackBook, setBlackBook] = useState([]);
  const [notebook, setNotebook] = useState([]);
  const [mastery, setMastery] = useState({}); // { dsa: { tried: 10, ok: 5 } }
  
  const [error, setError] = useState(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [logs, setLogs] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isGhostRound, setIsGhostRound] = useState(false);
  const [actualCorrectAnswer, setActualCorrectAnswer] = useState('');
  
  const [hint, setHint] = useState(null);
  const [isFetchingHint, setIsFetchingHint] = useState(false);
  const [ghostTime, setGhostTime] = useState(30); // Goal to beat

  const timerRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('beserk_active_user');
    if (token) {
      const user = JSON.parse(localStorage.getItem(`user_${token}`));
      if (user) {
        setCurrentUser(user.username);
        setScore(user.xp || 0);
        setNotebook(user.notebook || []);
        setBlackBook(user.black_book || []);
        setMastery(user.mastery || {});
      }
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      // Custom sync for structured data
      const data = { username: currentUser, xp: score, notebook, black_book: blackBook, mastery, last_sync: new Date().toISOString() };
      localStorage.setItem(`user_${currentUser}`, JSON.stringify(data));
    }
  }, [score, notebook, blackBook, mastery, currentUser]);

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      if (authMode === 'login') {
        const user = await dbService.loginUser(authForm.user, authForm.pass);
        setCurrentUser(user.username);
        setScore(user.xp);
        setNotebook(user.notebook || []);
        setBlackBook(user.black_book || []);
        setMastery(user.mastery || {});
        localStorage.setItem('beserk_active_user', user.username);
      } else {
        const user = await dbService.registerUser(authForm.user, authForm.pass);
        setCurrentUser(user.username);
        localStorage.setItem('beserk_active_user', user.username);
      }
    } catch (err) { alert(err.message); }
  };

  const getProviderTag = (source) => {
    if (source?.includes('Qwen')) return <span className="provider-tag hf">QWEN</span>;
    if (source?.includes('Minimax')) return <span className="provider-tag nv">MINIMAX</span>;
    if (source?.includes('Llama')) return <span className="provider-tag groq">LLAMA</span>;
    return <span className="provider-tag local">LOCAL</span>;
  };

  const nextInfiltrationStep = async (index, forceTrackId = null) => {
    const trackId = forceTrackId || sessionConfig.tracks[index % sessionConfig.tracks.length];
    if (!trackId) {
      console.error("NO_TRACK_ID_FOUND");
      setView('home');
      return;
    }

    const isGhostTime = (index + 1) % 4 === 0; // Frequent ghost rounds
    const trackObj = TRACKS.find(t => t.id === trackId);
    
    setCurrentTrack(trackObj);
    setIsGhostRound(isGhostTime);
    setView('fetch-zone');
    setLoading(true);
    setChallenge(null);
    setResult(null);
    setError(null);
    setHint(null);
    setSourceLabel('');
    setUserInput('');
    setGhostTime(isGhostTime ? 20 : 35); // Harder time for ghost
    
    const fetchPromise = isGhostRound && blackBook.length > 0 ? getGhostPayload() : getNextChallenge(trackId);
    const minWait = new Promise(res => setTimeout(res, 2000));
    try {
      await Promise.all([fetchPromise, minWait]);
      setView('arena');
    } catch (e) { 
      console.error("BREACH_FAILED:", e);
      setError("AI IS NOT WORKING. CONNECTION REFUSED."); 
      setView('fetch-zone'); 
    } 
    finally { setLoading(false); }
  };

  const refetchChallenge = async () => {
    if (loading) return;
    const trackId = currentTrack?.id || sessionConfig.tracks[currentIndex % sessionConfig.tracks.length];
    await nextInfiltrationStep(currentIndex, trackId);
  };

  const getNextChallenge = async (trackId) => {
    if (!trackId) return;
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const { challenge, source, originalAnswer } = await fetchChallenge(trackId, score); 
      if (!challenge) throw new Error("EMPTY_PAYLOAD");
      setChallenge(challenge);
      setActualCorrectAnswer(originalAnswer || challenge.correct_answer);
      setSourceLabel(source);
      startTimer();
      return { challenge, source };
    } catch (err) {
      throw err;
    }
  };

  const useLocalFallback = () => {
    const trackId = sessionConfig.tracks[currentIndex % sessionConfig.tracks.length];
    const localPool = fallbackChallenges[trackId] || fallbackChallenges['dsa'];
    const randomLocal = localPool[Math.floor(Math.random() * localPool.length)];
    
    const adaptedChallenge = {
      ...randomLocal,
      mode: randomLocal.mode || 'choice',
      options: randomLocal.options || [],
      correct_answer: randomLocal.options ? randomLocal.options[randomLocal.correct_index] : randomLocal.correct_answer
    };

    setChallenge(adaptedChallenge);
    setActualCorrectAnswer(adaptedChallenge.correct_answer);
    setSourceLabel("LOCAL_BACKUP");
    setError(null);
    setView('arena');
    startTimer();
  };

  const startTimer = () => {
    clearInterval(timerRef.current);
    setTimer(60);
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); handleAnswer(null, true); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const useHint = async () => {
    if (score < 10 || isFetchingHint || hint) return;
    setIsFetchingHint(true);
    setScore(prev => Math.max(0, prev - 10)); // Hint Penalty
    try {
      const h = await fetchHint(challenge.question, challenge.scenario);
      setHint(h);
    } catch (e) { setHint("Think about the core data structure."); }
    finally { setIsFetchingHint(false); }
  };

  const handleAnswer = async (answer, isTimeout = false) => {
    if (isVerifying) return;
    clearInterval(timerRef.current);
    let isCorrect = false;
    let aiFeedback = '';
    if (!isTimeout) {
      if (challenge.mode === 'input') {
        setIsVerifying(true);
        try {
          const validation = await verifyAnswer(challenge.question, actualCorrectAnswer, answer);
          isCorrect = validation.is_correct;
          aiFeedback = validation.feedback;
        } catch (e) { isCorrect = answer.toString().toLowerCase().trim() === actualCorrectAnswer.toString().toLowerCase().trim(); } 
        finally { setIsVerifying(false); }
      } else { 
        isCorrect = answer === actualCorrectAnswer; 
      }
    }

    // Mastery Tracking
    const tid = currentTrack?.id;
    setMastery(prev => {
      const m = prev[tid] || { tried: 0, ok: 0 };
      return { ...prev, [tid]: { tried: m.tried + 1, ok: isCorrect ? m.ok + 1 : m.ok } };
    });

    let earned = 0;
    if (isCorrect) {
      const bonus = Math.floor(timer / 5);
      const ghostBonus = (60 - timer) < ghostTime ? 20 : 0; // Beat the Ghost
      earned = 15 + bonus + ghostBonus;
      setScore(prev => prev + earned);
      setSessionXP(prev => prev + earned);
    } else {
      earned = -25; // WRONG ANSWER PENALTY
      setScore(prev => Math.max(0, prev + earned));
      const entry = { ...challenge, correct_answer: actualCorrectAnswer, user_answer: isTimeout ? 'TIMEOUT' : answer, date: new Date().toISOString(), track: currentTrack?.name, trackId: currentTrack?.id };
      setBlackBook(prev => [entry, ...prev].slice(0, 50));
    }

    const resultObj = { 
      challenge, 
      correct: isCorrect, 
      earned, 
      correct_answer: actualCorrectAnswer, 
      explanation: challenge.explanation, 
      feedback: aiFeedback, 
      trackName: currentTrack?.name,
      user_answer: isTimeout ? 'TIMEOUT' : answer,
      isTimeout,
      beatGhost: (60 - timer) < ghostTime
    };
    setSessionResults(prev => [...prev, resultObj]);
    setResult(resultObj);
  };

  const toggleTrackSelection = (trackId) => {
    setSessionConfig(prev => {
      const tracks = prev.tracks.includes(trackId) 
        ? prev.tracks.filter(id => id !== trackId)
        : [...prev.tracks, trackId];
      return { ...prev, tracks };
    });
  };

  const initiateDuoMission = () => {
    if (sessionConfig.tracks.length === 0) { alert("SELECT AT LEAST ONE NODE."); return; }
    setSessionXP(0);
    setSessionResults([]);
    setCurrentIndex(0);
    nextInfiltrationStep(0);
  };

  const handleResearch = async (targetChallenge = null) => {
    setIsResearching(true);
    const target = targetChallenge || challenge;
    try {
      const content = await fetchResearch(target.question, target.scenario);
      const newNote = { title: target.question, content, date: new Date().toISOString(), track: target.track || currentTrack?.name, trackId: target.trackId || currentTrack?.id };
      setNotebook(prev => [newNote, ...prev]);
      setCurrentNoteTab(newNote.trackId);
      setCurrentPage(0);
      setView('notebook');
    } catch (e) { alert("PROFESSOR_OFFLINE."); } 
    finally { setIsResearching(false); }
  };

  const clearData = async () => {
    if (window.confirm("ARE YOU SURE? THIS WIPES ALL XP, NOTES, AND STATS.")) {
      await dbService.resetUserProgress(currentUser);
      setScore(0);
      setNotebook([]);
      setBlackBook([]);
      setMastery({});
      setView('home');
    }
  };

  useEffect(() => {
    if (loading) {
      const msgs = isGhostRound 
        ? ["Spectral leak detected...", "Ghost Rival syncing solve time...", "Ghost: Beat " + ghostTime + "s...", "Ghost Protocol Engage..."]
        : ["Syncing Protocols...", "Checking Node Health...", "Preparing Breach...", "Bypassing Firewalls..."];
      setLogs([msgs[0]]);
      let i = 1;
      const itv = setInterval(() => { if (i < msgs.length) { setLogs(prev => [...prev, msgs[i]]); i++; } }, 500);
      return () => clearInterval(itv);
    }
  }, [loading, isGhostRound, ghostTime]);

  if (!currentUser) {
    return (
      <div className="login-shell">
        <div className="login-box mobile-box">
          <div className="login-header">Interview Siege</div>
          <div className="auth-tabs">
            <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>SIGN IN</button>
            <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>SIGN UP</button>
          </div>
          <form onSubmit={handleAuth}>
            <input type="text" placeholder="Username" value={authForm.user} onChange={(e) => setAuthForm({...authForm, user: e.target.value})} required />
            <input type="password" placeholder="Password" value={authForm.pass} onChange={(e) => setAuthForm({...authForm, pass: e.target.value})} required />
            <button type="submit" className="breach-btn">{authMode === 'login' ? 'BEGIN SESSION' : 'CREATE ACCOUNT'}</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'home') {
    return (
      <div className="app-shell home-bg">
        <header className="terminal-header mobile-header">
          <div className="status-bar">
            <span className="user-label">USER: {currentUser}</span>
            <div className="xp-container">
              <span className="xp-label">{score} XP</span>
              <div className="xp-rank">{score < 500 ? 'ASSOCIATE' : score < 1500 ? 'STAFF' : 'PRINCIPAL'}</div>
            </div>
            <button className="logout-btn" onClick={() => { localStorage.removeItem('beserk_active_user'); setCurrentUser(null); }}>GO OFFLINE</button>
          </div>
        </header>
        <main className="container mobile-container">
          <section className="hero-section compact">
            <h1 className="glitch-text" data-text="Interview Siege">Interview <span>Siege</span></h1>
            <p className="hero-sub">Master technical interviews with adaptive AI challenges.</p>
          </section>
          
          <div className="mission-hub">
            <button className="duo-start-btn" onClick={() => setView('duo-setup')}>
              <span className="btn-icon">⚡</span> 
              <span className="btn-text">START MIXED TOPIC CHALLENGE</span>
              <span className="btn-glow"></span>
            </button>
          </div>

          <div className="track-grid-header">SELECT PRACTICE TOPIC:</div>
          <div className="track-grid mobile-grid">
            {TRACKS.map(track => {
              const m = mastery[track.id] || { tried: 0, ok: 0 };
              const perc = m.tried > 0 ? Math.floor((m.ok / m.tried) * 100) : 0;
              return (
                <div key={track.id} className={`track-card mobile-card ${track.id}`} onClick={() => { 
                  setSessionConfig({ tracks: [track.id], count: 1 }); 
                  setCurrentIndex(0); 
                  nextInfiltrationStep(0, track.id); 
                }}>
                  <div className="track-icon">{track.icon}</div>
                  <div className="track-info">
                    <h3>{track.name}</h3>
                    <div className="mastery-indicator">
                      <div className="mastery-bar"><div className="mastery-fill" style={{ width: `${perc}%` }}></div></div>
                      <span className="mastery-text">{perc}% MASTERY ({m.ok}/{m.tried})</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="persistence-vault">
            <button className="vault-btn" onClick={() => setView('black-book')}>
              <span className="v-icon">📓</span>
              <div className="v-text">
                <span className="v-title">REVIEW CENTER</span>
                <span className="v-desc">{blackBook.length} MISTAKES LOGGED</span>
              </div>
            </button>
            <button className="vault-btn highlighted" onClick={() => { setCurrentPage(0); setView('notebook'); }}>
              <span className="v-icon">📝</span>
              <div className="v-text">
                <span className="v-title">STUDY GUIDES</span>
                <span className="v-desc">{notebook.length} GENERATED NOTES</span>
              </div>
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (view === 'duo-setup') {
    return (
      <div className="app-shell dark">
        <header className="terminal-header"><button className="back-link" onClick={() => setView('home')}>&lt; CANCEL</button></header>
        <main className="container setup-container">
          <h2>CUSTOM PRACTICE SESSION</h2>
          <div className="setup-section"><label>SELECT TARGET TOPICS:</label>
            <div className="setup-track-grid">{TRACKS.map(t => (<button key={t.id} className={`setup-track-btn ${sessionConfig.tracks.includes(t.id) ? 'active' : ''}`} onClick={() => toggleTrackSelection(t.id)}>{t.icon} {t.name}</button>))}</div>
          </div>
          <div className="setup-section"><label>NUMBER OF CHALLENGES: {sessionConfig.count}</label>
            <input type="range" min="3" max="20" value={sessionConfig.count} onChange={(e) => setSessionConfig({...sessionConfig, count: parseInt(e.target.value)})} />
          </div>
          <button className="breach-btn large" onClick={() => initiateDuoMission()}>⚡ START SESSION</button>
        </main>
      </div>
    );
  }

  if (view === 'fetch-zone') {
    return (
      <div className="app-shell arena">
        <main className="container fetch-container mobile-fetch">
          {error ? (
            <div className="error-terminal animate-fade-in">
              <div className="error-header">Connection Error</div>
              <div className="error-msg">{error}</div>
              <div className="error-actions">
                <button className="retry-btn" onClick={() => nextInfiltrationStep(currentIndex)}>
                  Retry Connection
                </button>
                <button className="fallback-btn" onClick={useLocalFallback}>
                  Use Offline Challenges
                </button>
                <button className="abort-btn large" onClick={() => setView('home')}>
                  Exit Session
                </button>
              </div>
            </div>
          ) : (
            <div className={`hacking-console ${isGhostRound ? 'ghost-console' : ''}`}>
              <div className="hacking-target">{isGhostRound ? '[SPEED_ROUND_ACTIVE]' : `Preparing: ${currentTrack?.name}`}</div>
              {logs.map((log, i) => (<div key={i} className="log-line"><span>&gt;</span> {log}</div>))}
            </div>
          )}
        </main>
      </div>
    );
  }

  if (view === 'notebook') {
    const filtered = notebook.filter(n => n.trackId === currentNoteTab);
    const current = filtered[currentPage];
    return (
      <div className="app-shell notebook-view mobile-notebook">
        <header className="terminal-header">
          <div className="status-bar">
            <button className="back-link" onClick={() => setView('home')}>&lt; BACK TO DASHBOARD</button>
            <div className="title" style={{fontWeight: 800, letterSpacing: '1px'}}>STUDY GUIDES</div>
            <div style={{width: '100px'}}></div>
          </div>
        </header>
        
        <div className="notebook-tab-bar mobile-tabs">
          {TRACKS.map(t => (
            <button 
              key={t.id} 
              className={`nb-tab ${currentNoteTab === t.id ? 'active' : ''}`} 
              onClick={() => { setCurrentNoteTab(t.id); setCurrentPage(0); }}
            >
              <span className="tab-icon">{t.icon}</span>
              <span className="tab-label">{t.name}</span>
            </button>
          ))}
        </div>

        <main className="container notebook-container">
          <div className="notebook-page animate-fade-in">
            {current ? (
              <div className="notebook-content">
                <div className="note-header">
                  <div className="note-badge">{currentTrack?.name || 'Technical Note'}</div>
                  <div className="note-meta">PAGE {currentPage + 1} OF {filtered.length}</div>
                </div>
                <h1 className="nb-h1">{current.title}</h1>
                <div className="note-body-md">{renderMD(current.content)}</div>
                
                {filtered.length > 1 && (
                  <div className="notebook-controls">
                    <button className="page-btn" onClick={() => flipPage('prev')} disabled={currentPage === 0}>
                      PREVIOUS PAGE
                    </button>
                    <button className="page-btn primary" onClick={() => flipPage('next')} disabled={currentPage === filtered.length - 1}>
                      NEXT PAGE
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-note">
                <div className="empty-icon">📝</div>
                <h3>No notes in {currentNoteTab.toUpperCase()}</h3>
                <p>Complete challenges and research topics to generate study guides.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (view === 'black-book') {
    return (
      <div className="app-shell dark">
        <header className="terminal-header">
          <div className="status-bar">
            <button className="back-link" onClick={() => setView('home')}>&lt; BACK TO DASHBOARD</button>
            <div className="title" style={{fontWeight: 800, letterSpacing: '1px'}}>REVIEW CENTER</div>
            <div style={{width: '100px'}}></div>
          </div>
        </header>
        <main className="container book-container mobile-book">
          <div className="view-header">
            <h2>Mistakes Log</h2>
            <p>Review your previous incorrect answers to strengthen your knowledge.</p>
          </div>
          
          {blackBook.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🏆</div>
              <h3>Clear Record!</h3>
              <p>You haven't made any mistakes yet. Keep up the perfect streak!</p>
            </div>
          ) : (
            <div className="book-grid">
              {blackBook.map((e, i) => (
                <div key={i} className="book-entry animate-fade-in">
                  <div className="entry-header">
                    <span className={`topic-badge ${e.trackId}`}>{e.track}</span>
                    <button className="study-btn" onClick={() => handleResearch(e)}>
                      RESEARCH TOPIC
                    </button>
                  </div>
                  <h4 className="entry-question">{e.question}</h4>
                  {e.code_snippet && e.code_snippet !== 'N/A' && (
                    <div className="mini-code-block">
                      <pre><code>{e.code_snippet}</code></pre>
                    </div>
                  )}
                  <div className="answer-comparison">
                    <div className="answer-row incorrect">
                      <span className="label">YOUR ANSWER:</span>
                      <span className="val">{e.user_answer}</span>
                    </div>
                    <div className="answer-row correct">
                      <span className="label">CORRECT ANSWER:</span>
                      <span className="val">{e.correct_answer}</span>
                    </div>
                  </div>
                  <div className="entry-explanation">
                    <strong>KEY LEARNING:</strong>
                    <p>{e.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className={`app-shell arena ${isGhostRound ? 'ghost-arena' : ''}`}>
      <header className="arena-header mobile-header">
        <div className="timer-ring">
          <svg viewBox="0 0 36 36" className="circular-chart">
            <path className={`circle ${timer < 10 ? 'danger' : ''}`} strokeDasharray={`${(timer / 60) * 100}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
            {isGhostRound && <path className="ghost-circle" strokeDasharray={`${((60 - ghostTime) / 60) * 100}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>}
            <text x="18" y="20.35" textAnchor="middle" className="percentage">{timer}s</text>
          </svg>
        </div>
        <div className="arena-info">
          <h2>{isGhostRound ? '[SPEED_ROUND_ACTIVE]' : currentTrack?.name || 'SESSION'}</h2>
          <div className="meta-row">
            <div className="source-display">{currentIndex+1}/{sessionConfig.count}</div>
            {getProviderTag(sourceLabel)}
            {isGhostRound && <span className="ghost-tag">TARGET: &lt;{ghostTime}s</span>}
          </div>
        </div>
        <div className="arena-actions">
           <button className="refetch-btn" onClick={refetchChallenge} disabled={!!result || loading}>🔄 REFETCH</button>
           <button className="hint-btn" onClick={useHint} disabled={!!result || score < 10 || !!hint}>{isFetchingHint ? '...' : '💡 HINT (-10XP)'}</button>
           <button className="abort-btn" onClick={() => setView('home')}>EXIT</button>
        </div>
      </header>
      <main className="container mobile-arena-content">
        {!challenge && !error && (
          <div className="loading-payload-box animate-pulse">
            <div className="loading-spinner"></div>
            <p>LOADING CHALLENGE...</p>
          </div>
        )}

        {challenge && (
          <section className="challenge-area animate-fade-in">
            <div className="scenario-box">{challenge.scenario}</div>
            {challenge.code_snippet && challenge.code_snippet !== 'N/A' && <div className="code-editor mobile-editor"><pre><code>{challenge.code_snippet}</code></pre></div>}
            <h3 className="question-text">{challenge.question}</h3>
            
            {hint && <div className="hint-box animate-fade-in"><span>&gt; HINT:</span> {hint}</div>}

            {challenge.mode === 'choice' ? (
              <div className={currentTrack?.id === 'system_design' ? 'arch-grid' : 'options-grid'}>
                {(challenge.options || []).map((o, i) => (
                  <button 
                    key={i} 
                    className={`option-btn ${currentTrack?.id === 'system_design' ? 'arch-block' : ''} ${
                      result 
                        ? (o === actualCorrectAnswer ? 'correct' : (o === result.user_answer ? 'incorrect' : '')) 
                        : ''
                    }`} 
                    onClick={() => handleAnswer(o)} 
                    disabled={!!result}
                  >
                    <span>{o}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="input-zone"><input type="text" className="manual-input" placeholder="Enter answer..." value={userInput} onChange={(e) => setUserInput(e.target.value)} disabled={!!result || isVerifying}/>{!result && <button className="submit-payload-btn" onClick={() => handleAnswer(userInput)}>SUBMIT ANSWER</button>}</div>
            )}
            {result && (
              <div className={`xp-gain-card animate-fade-in ${result.correct ? 'success' : 'fail'}`}>
                <div className="xp-gain-header">
                  <span className="xp-plus">{result.earned > 0 ? `+${result.earned}` : result.earned} XP</span>
                  <div className="result-label">
                    {result.correct ? (result.beatGhost && isGhostRound ? 'SPEED BONUS EARNED! (+20)' : 'CHALLENGE COMPLETED') : (result.isTimeout ? 'SESSION TIMEOUT' : 'INCORRECT ANSWER (-25XP)')}
                  </div>
                </div>
                
                <div className="breach-intel">
                  <div className="intel-row">
                    <span className="intel-label">CORRECT ANSWER:</span>
                    <span className="intel-val">{result.correct_answer}</span>
                  </div>
                  <div className="intel-explanation">
                    <p>{result.explanation}</p>
                  </div>
                  <button className="research-btn surge-research" onClick={() => handleResearch()}>📚 GENERATE DEEP DIVE</button>
                </div>

                <div className="progression-actions">
                  <button className="next-btn surge-btn" onClick={() => {
                    const nextIdx = currentIndex + 1;
                    setCurrentIndex(nextIdx);
                    nextInfiltrationStep(nextIdx);
                  }}>
                    <span className="btn-label">NEXT CHALLENGE</span>
                    <span className="difficulty-tag">ADAPTING DIFFICULTY...</span>
                  </button>
                  <button className="abort-session-btn" onClick={() => setView('home')}>END SESSION</button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
