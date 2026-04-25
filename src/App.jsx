import { useState, useEffect, useRef } from 'react';
import { fetchChallenge, fetchResearch, verifyAnswer, fetchGhostChallenge } from './services/nvidiaService';
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
  const [currentNoteTab, setCurrentNoteTab] = useState('dsa');
  const [currentPage, setCurrentPage] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [error, setError] = useState(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [logs, setLogs] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isGhostRound, setIsGhostRound] = useState(false);

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
      }
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      dbService.syncProgress(currentUser, score, notebook, blackBook);
    }
  }, [score, notebook, blackBook, currentUser]);

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      if (authMode === 'login') {
        const user = await dbService.loginUser(authForm.user, authForm.pass);
        setCurrentUser(user.username);
        setScore(user.xp);
        setNotebook(user.notebook || []);
        setBlackBook(user.black_book || []);
        localStorage.setItem('beserk_active_user', user.username);
      } else {
        const user = await dbService.registerUser(authForm.user, authForm.pass);
        setCurrentUser(user.username);
        localStorage.setItem('beserk_active_user', user.username);
      }
    } catch (err) { alert(err.message); }
  };

  const nextInfiltrationStep = async (index) => {
    const isGhostTime = (index + 1) % 5 === 0 && blackBook.length > 0;
    const trackId = sessionConfig.tracks[index % sessionConfig.tracks.length];
    const trackObj = TRACKS.find(t => t.id === trackId);
    
    setCurrentTrack(trackObj);
    setIsGhostRound(isGhostTime);
    setView('fetch-zone');
    setLoading(true);
    setChallenge(null);
    setResult(null);
    setError(null);
    setSourceLabel('');
    setUserInput('');
    
    const fetchPromise = isGhostTime ? getGhostPayload() : getNextChallenge(trackId);
    const minWait = new Promise(res => setTimeout(res, 2500));
    try {
      await Promise.all([fetchPromise, minWait]);
      setView('arena');
    } catch (e) { setError("AI NODES BUSY."); } 
    finally { setLoading(false); }
  };

  const getGhostPayload = async () => {
    const randomFailure = blackBook[Math.floor(Math.random() * blackBook.length)];
    try {
      const { challenge, source } = await fetchGhostChallenge(randomFailure);
      setChallenge(challenge);
      setSourceLabel(`GHOST_RECALL (${source})`);
      startTimer();
    } catch (err) { await getNextChallenge(sessionConfig.tracks[0]); }
  };

  const getNextChallenge = async (trackId) => {
    if (!trackId) return;
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const { challenge, source } = await fetchChallenge(trackId, score); 
      setChallenge(challenge);
      setSourceLabel(source);
      startTimer();
    } catch (err) {
      const localPool = fallbackChallenges[trackId] || fallbackChallenges['dsa'];
      const randomChallenge = localPool[Math.floor(Math.random() * localPool.length)];
      setChallenge({ ...randomChallenge, mode: 'choice' });
      setSourceLabel('LOCAL_PAYLOAD (Offline)');
      startTimer();
    }
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

  const handleAnswer = async (answer, isTimeout = false) => {
    if (isVerifying) return;
    clearInterval(timerRef.current);
    let isCorrect = false;
    let aiFeedback = '';
    if (!isTimeout) {
      if (challenge.mode === 'input') {
        setIsVerifying(true);
        try {
          const validation = await verifyAnswer(challenge.question, challenge.correct_answer, answer);
          isCorrect = validation.is_correct;
          aiFeedback = validation.feedback;
        } catch (e) { isCorrect = answer.toString().toLowerCase().trim() === challenge.correct_answer.toString().toLowerCase().trim(); } 
        finally { setIsVerifying(false); }
      } else { isCorrect = answer === challenge.correct_answer; }
    }
    const bonus = isCorrect ? Math.floor(timer / 6) : 0;
    const earned = isCorrect ? 15 + bonus : 0;
    if (isCorrect) { setScore(prev => prev + earned); setSessionXP(prev => prev + earned); } 
    else {
      const entry = { ...challenge, user_answer: isTimeout ? 'TIMEOUT' : answer, date: new Date().toISOString(), track: currentTrack?.name, trackId: currentTrack?.id };
      setBlackBook(prev => [entry, ...prev].slice(0, 50));
    }
    const resultObj = { challenge, correct: isCorrect, earned, correct_answer: challenge.correct_answer, explanation: challenge.explanation, feedback: aiFeedback, trackName: currentTrack?.name };
    setSessionResults(prev => [...prev, resultObj]);
    setResult(resultObj);
  };

  const proceedToNext = () => {
    if (currentIndex + 1 < sessionConfig.count) {
      setCurrentIndex(prev => prev + 1);
      nextInfiltrationStep(currentIndex + 1);
    } else { setView('mission-summary'); }
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

  const flipPage = (direction) => {
    if (isFlipping) return;
    setIsFlipping(true);
    setTimeout(() => {
      const filtered = notebook.filter(n => n.trackId === currentNoteTab);
      setCurrentPage(prev => direction === 'next' ? Math.min(prev + 1, filtered.length - 1) : Math.max(prev - 1, 0));
      setIsFlipping(false);
    }, 600);
  };

  useEffect(() => {
    if (loading) {
      const msgs = isGhostRound 
        ? ["Spectral leak detected...", "Recycling old memory frames...", "Re-animating failed payload...", "Ghost Protocol Engage..."]
        : ["Syncing Protocols...", "Allocating Shared Payloads...", "Calculating Synergy...", "Bypassing Firewalls..."];
      setLogs([msgs[0]]);
      let i = 1;
      const itv = setInterval(() => { if (i < msgs.length) { setLogs(prev => [...prev, msgs[i]]); i++; } }, 500);
      return () => clearInterval(itv);
    }
  }, [loading, isGhostRound]);

  if (!currentUser) {
    return (
      <div className="login-shell">
        <div className="login-box mobile-box">
          <div className="login-header">INTERVIEW_SIEGE v3.5</div>
          <div className="auth-tabs">
            <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>LOGIN</button>
            <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>REGISTER</button>
          </div>
          <form onSubmit={handleAuth}>
            <input type="text" placeholder="USERNAME" value={authForm.user} onChange={(e) => setAuthForm({...authForm, user: e.target.value})} required />
            <input type="password" placeholder="ENCRYPTION_KEY" value={authForm.pass} onChange={(e) => setAuthForm({...authForm, pass: e.target.value})} required />
            <button type="submit" className="breach-btn">{authMode === 'login' ? 'START BREACH' : 'CREATE PROTOCOL'}</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'home') {
    return (
      <div className="app-shell">
        <header className="terminal-header mobile-header">
          <div className="status-bar">
            <span className="user-label">USER: {currentUser}</span>
            <span className="xp-label">{score} XP</span>
            <button className="logout-btn" onClick={() => { localStorage.removeItem('beserk_active_user'); setCurrentUser(null); }}>OFFLINE</button>
          </div>
        </header>
        <main className="container mobile-container">
          <section className="hero-section compact"><h1>SIEGE <span>NODE</span></h1></section>
          <button className="duo-start-btn" onClick={() => setView('duo-setup')}>⚔️ INITIATE DUO INFILTRATION</button>
          <div className="track-grid mobile-grid">
            {TRACKS.map(track => (
              <div key={track.id} className="track-card mobile-card" onClick={() => { setSessionConfig({ tracks: [track.id], count: 1 }); setCurrentIndex(0); nextInfiltrationStep(0); }}>
                <div className="track-icon">{track.icon}</div><h3>{track.name}</h3><div className="scan-line"></div>
              </div>
            ))}
          </div>
          <div className="mobile-home-actions">
            <button className="mobile-action-btn" onClick={() => setView('black-book')}>📓 BLACK BOOK</button>
            <button className="mobile-action-btn highlighted" onClick={() => { setCurrentPage(0); setView('notebook'); }}>📝 NOTES</button>
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
          <h2>DUO MISSION SETUP</h2>
          <div className="setup-section"><label>SELECT TARGET TRACKS:</label>
            <div className="setup-track-grid">{TRACKS.map(t => (<button key={t.id} className={`setup-track-btn ${sessionConfig.tracks.includes(t.id) ? 'active' : ''}`} onClick={() => toggleTrackSelection(t.id)}>{t.icon} {t.name}</button>))}</div>
          </div>
          <div className="setup-section"><label>PAYLOAD COUNT: {sessionConfig.count}</label>
            <input type="range" min="3" max="20" value={sessionConfig.count} onChange={(e) => setSessionConfig({...sessionConfig, count: parseInt(e.target.value)})} />
          </div>
          <button className="breach-btn large" onClick={() => initiateDuoMission()}>⚡ START MISSION</button>
        </main>
      </div>
    );
  }

  if (view === 'mission-summary') {
    const totalCorrect = sessionResults.filter(r => r.correct).length;
    const synergy = Math.floor((sessionXP / (sessionConfig.count * 25)) * 100);
    return (
      <div className="app-shell arena">
        <main className="container summary-container">
          <h1 className="summary-title">MISSION_DEBRIEF</h1>
          <div className="summary-stats">
            <div className="stat-box"><span className="stat-label">BREACHES</span><span className="stat-val">{totalCorrect}/{sessionConfig.count}</span></div>
            <div className="stat-box"><span className="stat-label">SYNERGY</span><span className="stat-val">{synergy}%</span></div>
            <div className="stat-box"><span className="stat-label">XP_EARNED</span><span className="stat-val">+{sessionXP}</span></div>
          </div>
          <div className="summary-review"><h3>FAILURE_LOGS</h3>
            {sessionResults.filter(r => !r.correct).map((r, i) => (
              <div key={i} className="review-entry">
                <div className="review-header"><span>{r.trackName}</span> <button className="research-btn mini" onClick={() => handleResearch(r.challenge)}>📚 RESEARCH</button></div>
                <p className="review-q">{r.challenge.question}</p><div className="review-explanation"><strong>LOG:</strong> {r.explanation}</div>
              </div>
            ))}
          </div>
          <button className="breach-btn large" onClick={() => setView('home')}>RETURN_TO_NODE</button>
        </main>
      </div>
    );
  }

  if (view === 'fetch-zone') {
    return (
      <div className="app-shell arena">
        <main className="container fetch-container mobile-fetch">
          <div className={`hacking-console ${isGhostRound ? 'ghost-console' : ''}`}>
            <div className="hacking-target">{isGhostRound ? '[GHOST_PROTOCOL_RE-ENTRY]' : `INFILTRATING: ${currentTrack?.name}`}</div>
            {logs.map((log, i) => (<div key={i} className="log-line"><span>&gt;</span> {log}</div>))}
          </div>
        </main>
      </div>
    );
  }

  if (view === 'notebook') {
    const filtered = notebook.filter(n => n.trackId === currentNoteTab);
    const current = filtered[currentPage];
    return (
      <div className="app-shell notebook-view mobile-notebook">
        <header className="terminal-header"><button className="back-link" onClick={() => setView('home')}>&lt; EXIT</button><div className="title">LECTURES</div></header>
        <div className="notebook-tab-bar mobile-tabs">{TRACKS.map(t => (<button key={t.id} className={`nb-tab ${currentNoteTab === t.id ? 'active' : ''}`} onClick={() => { setCurrentNoteTab(t.id); setCurrentPage(0); }}>{t.icon}</button>))}</div>
        <main className="notebook-container">
          <div className={`notebook-page book-animation ${isFlipping ? 'flipping-bottom' : ''} mobile-page`}>
            <div className="margin-line"></div>
            {current ? (
              <div className="notebook-content">
                <div className="note-meta"><span>PAGE: {currentPage + 1}/{filtered.length}</span></div>
                <h1 className="nb-h1 mobile-h1">{current.title}</h1><div className="note-body-md mobile-body">{renderMD(current.content)}</div>
              </div>
            ) : <div className="empty-note">No data in {currentNoteTab.toUpperCase()}.</div>}
          </div>
          {filtered.length > 1 && <div className="notebook-controls mobile-controls"><button className="page-btn" onClick={() => flipPage('prev')} disabled={currentPage === 0}>PREV</button><button className="page-btn" onClick={() => flipPage('next')} disabled={currentPage === filtered.length - 1}>NEXT</button></div>}
        </main>
      </div>
    );
  }

  if (view === 'black-book') {
    return (
      <div className="app-shell dark">
        <header className="terminal-header"><button className="back-link" onClick={() => setView('home')}>&lt; EXIT</button><div className="title">BLACK_BOOK</div></header>
        <main className="container book-container mobile-book">
          {blackBook.length === 0 ? <p className="empty-msg">No failed breaches.</p> :
            blackBook.map((e, i) => (
              <div key={i} className="book-entry elite mobile-entry">
                <div className="entry-header"><span>[{e.track}]</span><button className="research-btn mini" onClick={() => handleResearch(e)}>📚 RESEARCH</button></div>
                <h4 className="full-question mobile-question">{e.question}</h4>
                {e.code_snippet !== 'N/A' && <pre className="mini-code"><code>{e.code_snippet}</code></pre>}
                <div className="explanation-text expanded"><strong>LOG:</strong> {e.explanation}</div>
              </div>
            ))
          }
        </main>
      </div>
    );
  }

  return (
    <div className={`app-shell arena ${isGhostRound ? 'ghost-arena' : ''} ${timer < 10 ? 'glitch-alert' : ''}`}>
      <header className="arena-header mobile-header">
        <div className="timer-ring"><svg viewBox="0 0 36 36" className="circular-chart"><path className={`circle ${timer < 10 ? 'danger' : ''}`} strokeDasharray={`${(timer / 60) * 100}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/><text x="18" y="20.35" className="percentage">{timer}s</text></svg></div>
        <div className="arena-info"><h2>{isGhostRound ? '[GHOST_CHALLENGE]' : currentTrack?.name}</h2><div className="source-display">{currentIndex+1}/{sessionConfig.count}</div></div>
        <div className="arena-actions"><button className="refetch-btn" onClick={() => nextInfiltrationStep(currentIndex)}>🔄</button><button className="abort-btn" onClick={() => setView('home')}>X</button></div>
      </header>
      <main className="container mobile-arena-content">
        {challenge && (
          <section className="challenge-area animate-fade-in">
            <div className="scenario-box">{challenge.scenario}</div>
            {challenge.code_snippet !== 'N/A' && <div className="code-editor mobile-editor"><pre><code>{challenge.code_snippet}</code></pre></div>}
            <h3 className="question-text">{challenge.question}</h3>
            {challenge.mode === 'choice' ? (
              <div className={currentTrack?.id === 'system_design' ? 'arch-grid' : 'options-grid'}>
                {challenge.options.map((o, i) => (<button key={i} className={`option-btn ${currentTrack?.id === 'system_design' ? 'arch-block' : ''} ${result ? (o === challenge.correct_answer ? 'correct' : 'incorrect') : ''}`} onClick={() => handleAnswer(o)} disabled={!!result}><span>{o}</span></button>))}
              </div>
            ) : (
              <div className="input-zone"><input type="text" className="manual-input" placeholder="Payload..." value={userInput} onChange={(e) => setUserInput(e.target.value)} disabled={!!result || isVerifying}/>{!result && <button className="submit-payload-btn" onClick={() => handleAnswer(userInput)}>EXECUTE</button>}</div>
            )}
            {result && (
              <div className={`postmortem ${result.correct ? 'success' : 'fail'}`}>
                <div className="postmortem-header"><h3>{result.correct ? 'SUCCESS' : 'FAILED'}</h3><button className="research-btn" onClick={() => handleResearch()}>📚 Research</button></div>
                {result.feedback && <p className="ai-feedback-msg">AI: {result.feedback}</p>}
                <p className="correct-ans-reveal">Correct: {result.correct_answer}</p>
                <div className="explanation"><strong>LOG:</strong> {result.explanation}</div>
                <button className="next-btn mobile-next" onClick={proceedToNext}>{currentIndex + 1 >= sessionConfig.count ? 'VIEW DEBRIEF' : 'NEXT TARGET >'}</button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
