// Escapes text before it's interpolated into an innerHTML template — a
// linked account's name/avatar (student <-> parent) is untrusted, since it
// was user-supplied at registration/profile-edit time on a different account.
// Duplicated from shared/escapeHtml.js (kept inline, not loaded via <script
// src>) because Capacitor's webDir:"www" only packages mobile-app/www/ into
// the native Android build - a reference outside this folder would 404
// there. Keep this in sync with shared/escapeHtml.js if either changes.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// === API CLIENT ===
// Which host to hit is per-deployment config (window.BEE_BOX_API_HOSTS,
// config.js, loaded before this script); which branch to pick is a runtime
// platform check that stays here. Review.md P2 item 10.
const API_BASE = (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
  ? window.BEE_BOX_API_HOSTS.native
  : window.BEE_BOX_API_HOSTS.web;
const TOKEN_KEY = 'mq_access_token';
const REFRESH_KEY = 'mq_refresh_token';

function getAccessToken() { return localStorage.getItem(TOKEN_KEY); }
function setTokens(access, refresh) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}
function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

const Api = {
  async request(method, path, body, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAccessToken();
    if(token && !opts.noAuth) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method, headers, body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if(res.status === 401 && !opts.noAuth && !opts._retried) {
      const refreshed = await this.tryRefresh();
      if(refreshed) return this.request(method, path, body, { ...opts, _retried: true });
    }

    const data = await res.json().catch(() => ({}));
    if(!res.ok) {
      const err = new Error(data.error || `Request gagal (${res.status})`);
      if(data.expired) err.expired = true;
      throw err;
    }
    return data;
  },
  get(path, opts) { return this.request('GET', path, undefined, opts); },
  post(path, body, opts) { return this.request('POST', path, body, opts); },
  patch(path, body, opts) { return this.request('PATCH', path, body, opts); },
  delete(path, opts) { return this.request('DELETE', path, undefined, opts); },

  async tryRefresh() {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if(!refreshToken) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken })
      });
      if(!res.ok) return false;
      const data = await res.json();
      setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch(e) { return false; }
  }
};

// === STATE (in-memory cache of the server-side profile) ===
const defaults = () => ({
  name: 'Petualang',
  avatar: '🧒',
  birthdate: '',
  userGrade: 1,
  xp: 0,
  level: 1,
  streak: 0,
  maxStreak: 0,
  totalGames: 0,
  correctAnswers: 0,
  totalQuestions: 0,
  unlocked: [1],
  fastestTime: 999,
  lastPlayedDate: null,
  playedToday: false,
  history: [],
  gp: {},
  achievements: {},
  sound: true,
  vibrate: true,
  exams: []
});

let S = defaults();

// Which mode the logged-in account is in, and (for PARENT) which linked
// children it can see. Kept separate from the STUDENT-shaped `S` above.
let CURRENT_ROLE = null;
let CURRENT_USER = null;
let PARENT = { children: [], activeStudentId: null, activeDetail: null };

// Pulls the latest profile from the server and replaces S wholesale - the
// server is the single source of truth now, S is just a render-friendly cache.
async function syncProfile() {
  const data = await Api.get('/profile/me');
  S = { ...defaults(), ...data };
}

async function syncExams() {
  const data = await Api.get('/profile/exams');
  S.exams = data.exams;
}

const $ = id => document.getElementById(id);

// === AUDIO FX (Web Audio API) ===
const AudioFX = {
  ctx: null,
  init() {
    if(this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { console.warn(e); }
  },
  play(freq, type, dur, vol) {
    if(!S.sound) return;
    this.init();
    if(!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + dur);
    } catch(e) { console.warn(e); }
  },
  click() { this.play(600, 'sine', 0.08, 0.1); },
  correct() {
    this.play(523.25, 'sine', 0.1, 0.15); // C5
    setTimeout(() => this.play(659.25, 'sine', 0.15, 0.15), 80); // E5
  },
  wrong() {
    this.play(220, 'triangle', 0.15, 0.2); // A3
    setTimeout(() => this.play(196, 'triangle', 0.2, 0.2), 100); // G3
  },
  levelUp() {
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((n, i) => {
      setTimeout(() => this.play(n, 'sine', 0.2, 0.15), i * 120);
    });
  }
};

function vibrate(ms) {
  if(S.vibrate && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch(e) {}
  }
}

// === NAVIGATION ===
let currentActiveScreen = 'homeScreen';
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = $(id);
  if(target) {
    target.classList.add('active');
    currentActiveScreen = id;
  }

  // Highlight navigation items
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-screen="${id}"]`)?.classList.add('active');

  // Bottom nav visibility control
  const nav = $('bottomNav');
  if(nav) {
    const showNav = ['homeScreen', 'analyticsScreen', 'examScreen', 'profileScreen', 'parentHomeScreen', 'parentProfileScreen'].includes(id);
    nav.style.display = showNav ? 'flex' : 'none';
  }
}

// Swaps #bottomNav's buttons between the student set (Home/Analytics/Play/Ujian/Profil)
// and a 2-item parent set (no Attendance/Calendar/Inbox - no data backs them yet).
// Nav clicks are handled via delegation on #bottomNav itself (see DOMContentLoaded),
// so replacing its innerHTML here never leaves stale/unwired buttons behind.
function setNavForRole(role) {
  const nav = $('bottomNav');
  if(!nav) return;
  nav.innerHTML = role === 'PARENT' ? `
    <button class="nav-item" data-screen="parentHomeScreen">
      <i class="fas fa-child"></i><span>Anak Saya</span>
    </button>
    <button class="nav-item" data-screen="parentProfileScreen">
      <i class="fas fa-user-circle"></i><span>Profil</span>
    </button>
  ` : `
    <button class="nav-item" data-screen="homeScreen">
      <i class="fas fa-home"></i><span>Home</span>
    </button>
    <button class="nav-item" data-screen="analyticsScreen">
      <i class="fas fa-chart-line"></i><span>Analytics</span>
    </button>
    <button class="nav-item play-btn" id="navPlayBtn">
      <div class="play-btn-inner"><i class="fas fa-play"></i></div>
    </button>
    <button class="nav-item" data-screen="examScreen">
      <i class="fas fa-clipboard-list"></i><span>Ujian</span>
    </button>
    <button class="nav-item" data-screen="profileScreen">
      <i class="fas fa-user-circle"></i><span>Profil</span>
    </button>
  `;
}

// === PARTICLES EFFECT ===
let canvas, ctx, particles = [];
function initParticles() {
  canvas = $('particleCanvas');
  if(!canvas) return;
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  particles = Array.from({ length: 25 }, () => createParticle());
  drawParticles();
}
function resizeCanvas() {
  if(canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
}
function createParticle() {
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    r: Math.random() * 2 + 1,
    alpha: Math.random() * 0.4 + 0.1
  };
}
function drawParticles() {
  if(!ctx || !canvas || currentActiveScreen === 'gameScreen') {
    requestAnimationFrame(drawParticles);
    return;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    if(p.x < 0 || p.x > canvas.width) p.vx *= -1;
    if(p.y < 0 || p.y > canvas.height) p.vy *= -1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(140, 109, 31, ${p.alpha * 0.6})`;
    ctx.fill();
  });
  requestAnimationFrame(drawParticles);
}

// === GRADE HELPERS ===
function getGradeLabel(grade) {
  const cfg = GRADE_CONFIG[grade];
  return cfg ? cfg.name : `Kelas ${grade}`;
}

function calcAge(birthdate) {
  if(!birthdate) return 0;
  const bd = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if(m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

function suggestGrade(age) {
  // Indonesian school system: age 6-7 = kelas 1, ... age 12 = kelas 6, age 13 = kelas 7, etc.
  return Math.min(9, Math.max(1, age - 6));
}

// === HOME RENDERING ===
async function renderHome() {
  await syncProfile();

  $('headerXP').textContent = S.xp;
  $('heroStreak').textContent = S.streak;
  $('menuAvatarEmoji').textContent = S.avatar;
  $('inviteLinkCode').textContent = S.linkCode || '-';

  // Greeting name
  $('heroName').textContent = S.name;
  const hours = new Date().getHours();
  let greet = 'Halo!';
  if(hours < 11) greet = 'Selamat Pagi! 🌅';
  else if(hours < 15) greet = 'Selamat Siang! ☀️';
  else if(hours < 19) greet = 'Selamat Sore! 🌆';
  else greet = 'Selamat Malam! 🌌';
  $('heroHello').textContent = greet;

  // Grade badge
  $('heroGradeBadge').textContent = getGradeLabel(S.userGrade);

  renderNotifications();
}

// "Pemberitahuan" - real, computed items only (never fabricated placeholders):
// an unfinished-level reminder, a daily-challenge reminder, and the most
// recently unlocked achievement.
function renderNotifications() {
  const list = $('notificationList');
  const dot = $('notifDot');
  if(!list) return;
  list.innerHTML = '';
  const items = [];

  const gp = S.gp[S.userGrade] || { done: 0 };
  const doneCount = gp.done || 0;
  if(doneCount < 5) {
    const cfg = GRADE_CONFIG[S.userGrade];
    const nextSub = Math.min(doneCount + 1, 5);
    items.push({
      type: 'continue', icon: cfg.icon,
      title: `Lanjutkan ${cfg.name}`,
      subtitle: `Sub-level ${nextSub} dari 5 • ${5 - doneCount} tersisa`,
      cta: 'Lanjut', action: () => { AudioFX.click(); quickPlay(); }
    });
  }

  if(!S.playedToday) {
    items.push({
      type: 'daily', icon: '🔥',
      title: 'Tantangan Harian',
      subtitle: 'Belum dikerjain hari ini!',
      cta: 'Mulai', action: () => { AudioFX.click(); dailyChallenge(); }
    });
  }

  const unlockedAch = ACHIEVEMENTS
    .filter(a => S.achievements[a.id])
    .map(a => ({ a, date: new Date(S.achievements[a.id]) }))
    .filter(x => !isNaN(x.date))
    .sort((x, y) => y.date - x.date)[0];
  if(unlockedAch) {
    items.push({
      type: 'achievement', icon: unlockedAch.a.i,
      title: `Prestasi: ${unlockedAch.a.n}`,
      subtitle: unlockedAch.a.d,
      cta: null
    });
  }

  if(dot) dot.style.display = items.some(i => i.type !== 'achievement') ? 'block' : 'none';

  if(items.length === 0) {
    list.innerHTML = '<div class="empty-msg"><i class="fas fa-check-circle"></i>Gak ada pemberitahuan baru 🎉</div>';
    return;
  }

  items.forEach(it => {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="ac-icon ${it.type}">${it.icon}</div>
      <div class="ac-info"><h4>${it.title}</h4><p>${it.subtitle}</p></div>
      ${it.cta ? `<button class="ac-btn">${it.cta}</button>` : ''}
    `;
    if(it.cta) card.querySelector('.ac-btn').addEventListener('click', it.action);
    list.appendChild(card);
  });
}

function renderLevelMap(filter) {
  const map = $('levelMap');
  if(!map) return;
  map.innerHTML = '';

  Object.keys(GRADE_CONFIG).forEach(gradeKey => {
    const grade = parseInt(gradeKey);
    const cfg = GRADE_CONFIG[grade];

    // Apply filters
    if(filter === 'sd' && cfg.school !== 'sd') return;
    if(filter === 'smp' && cfg.school !== 'smp') return;

    const gp = S.gp[grade] || { done: 0, subs: {} };
    const unlocked = S.unlocked.includes(grade);
    const completedCount = gp.done || 0;
    const progressPct = Math.round((completedCount / 5) * 100);

    // Mark user's current grade
    const isUserGrade = grade === S.userGrade;

    const card = document.createElement('div');
    card.className = `lm-card ${!unlocked ? 'locked' : ''} ${completedCount === 5 ? 'completed' : ''} ${isUserGrade ? 'user-grade' : ''}`;

    // Calculate stars
    let totalStars = 0;
    Object.values(gp.subs || {}).forEach(s => totalStars += (s.stars || 0));

    card.innerHTML = `
      <div class="lm-icon" style="background: ${cfg.color}">${cfg.icon}</div>
      <div class="lm-info">
        <h4>${cfg.name}${isUserGrade ? ' <span class="lm-you">👈 Kelas Kamu</span>' : ''}</h4>
        <p>${cfg.desc}</p>
        <div class="lm-bar"><div class="lm-bar-fill" style="width: ${progressPct}%"></div></div>
      </div>
      <div class="lm-right">
        <div class="lm-stars">${'★'.repeat(Math.round(totalStars/5))}${'☆'.repeat(3 - Math.round(totalStars/5))}</div>
        <div class="lm-status">${unlocked ? (completedCount === 5 ? '✅' : `${completedCount}/5`) : '🔒'}</div>
      </div>
    `;

    if(unlocked) {
      card.addEventListener('click', () => {
        AudioFX.click();
        openSubLevel(grade);
      });
    }
    map.appendChild(card);
  });
}

// === SUBLEVEL SCREEN ===
function openSubLevel(grade) {
  const cfg = GRADE_CONFIG[grade];
  if(!cfg) return;
  $('slTitle').textContent = cfg.name;
  $('slHeroIcon').textContent = cfg.icon;
  $('slHeroDesc').textContent = cfg.desc;

  const gp = S.gp[grade] || { done: 0, subs: {} };
  $('slBadge').textContent = `${gp.done || 0}/5`;

  const path = $('slPath');
  path.innerHTML = '';

  cfg.subs.forEach((sl, i) => {
    const slIndex = i + 1;
    // Render connector line
    if(i > 0) {
      const conn = document.createElement('div');
      conn.className = `sl-connector ${slIndex <= (gp.done + 1) ? 'done' : ''}`;
      path.appendChild(conn);
    }

    const subData = gp.subs[slIndex] || {};
    const done = !!subData.done;
    const cur = slIndex === (gp.done + 1);
    const locked = slIndex > (gp.done + 1);

    const node = document.createElement('div');
    node.className = `sl-node ${done ? 'completed' : ''} ${cur ? 'current' : ''} ${locked ? 'locked' : ''}`;
    node.innerHTML = `
      <div class="sl-node-icon">${done ? '✅' : sl.i}</div>
      <div class="sl-node-info">
        <h4>Sub-level ${slIndex}: ${sl.n}</h4>
        <p>${sl.d}</p>
      </div>
      <div class="sl-node-stars">${'★'.repeat(subData.stars || 0)}${'☆'.repeat(3 - (subData.stars || 0))}</div>
    `;

    if(!locked) {
      node.addEventListener('click', () => {
        AudioFX.click();
        startGame(grade, slIndex);
      });
    }
    path.appendChild(node);
  });

  showScreen('subLevelScreen');
}

// === GAME ENGINE ===
let G = null; // Current gameplay state
let examMode = false;
let currentExamObj = null;

function getTimeLimit(grade) {
  return grade <= 3 ? 30 : grade <= 6 ? 20 : 15;
}

// Question generation and answer-checking both happen server-side now - the
// client only ever sees question text/options/id, never the answer key.
async function startGame(grade, subLevel, isExam = false, examObj = null) {
  examMode = isExam;
  currentExamObj = examObj;

  let data;
  try {
    data = await Api.post('/game/start', {
      grade, subLevel, isExam,
      questionCount: isExam ? (examObj?.questions || 10) : 10
    });
  } catch(e) {
    alert('Gagal memulai permainan: ' + e.message);
    return;
  }

  G = {
    sessionId: data.sessionId,
    grade, subLevel,
    qs: data.questions,
    qi: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    maxStreak: 0,
    qStart: 0,
    answered: false,
    timer: null,
    timeLeft: data.timeLimit
  };

  if(G.qs.length === 0) {
    alert('Oops! Gagal membuat pertanyaan.');
    return;
  }

  showScreen('gameScreen');

  // Setup exam vs regular timer
  if(isExam) {
    $('gsTimerWrap').classList.remove('danger');
    $('qCategory').textContent = 'UJIAN LIVE';
  } else {
    $('qCategory').textContent = `Grade ${grade} - Sub ${subLevel}`;
  }

  showQ();
  startTimer();
}

function startTimer() {
  if(G.timer) clearInterval(G.timer);

  // If exam mode, timer counts down for the ENTIRE exam, otherwise per question
  if(examMode) {
    $('gTimer').textContent = formatDuration(G.timeLeft);
    G.timer = setInterval(() => {
      G.timeLeft--;
      $('gTimer').textContent = formatDuration(G.timeLeft);
      if(G.timeLeft <= 10) $('gsTimerWrap').classList.add('danger');
      if(G.timeLeft <= 0) {
        clearInterval(G.timer);
        endGame();
      }
    }, 1000);
  } else {
    G.timeLeft = getTimeLimit(G.grade);
    $('gTimer').textContent = G.timeLeft;
    $('gsTimerWrap').classList.remove('danger');

    G.timer = setInterval(() => {
      G.timeLeft--;
      $('gTimer').textContent = G.timeLeft;
      if(G.timeLeft <= 5) $('gsTimerWrap').classList.add('danger');
      if(G.timeLeft <= 0) {
        vibrate(100);
        AudioFX.wrong();
        nextQ(false); // timeout - question stays unanswered server-side, counts as wrong at finish
      }
    }, 1000);
  }
}

function showQ() {
  G.qStart = Date.now();
  G.answered = false;
  const q = G.qs[G.qi];

  // Progress bar
  $('gQ').textContent = `${G.qi + 1}/${G.qs.length}`;
  $('gProgressFill').style.width = `${((G.qi) / G.qs.length) * 100}%`;

  $('qText').textContent = q.question;
  $('qHint').textContent = q.hint || '';

  const grid = $('answersGrid');
  const inpWrap = $('answerInputWrap');
  const inp = $('answerInput');
  const submitBtn = $('answerSubmit');

  grid.innerHTML = '';
  inp.value = '';
  inp.disabled = false;
  submitBtn.disabled = false;

  if(q.useInput) {
    grid.style.display = 'none';
    inpWrap.style.display = 'flex';
    inp.focus();
  } else {
    grid.style.display = 'grid';
    inpWrap.style.display = 'none';

    q.options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'ans-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => submitAnswer(opt, btn));
      grid.appendChild(btn);
    });
  }
}

async function submitAnswer(ans, btnEl) {
  if(G.answered) return;
  if(!examMode && G.timeLeft <= 0) return;
  G.answered = true;
  // Only stop the per-question timer here; exam mode uses one master
  // countdown across all questions and must keep ticking between answers.
  if(!examMode && G.timer) clearInterval(G.timer);

  const q = G.qs[G.qi];

  // Disable clicks and input to prevent double-submission
  document.querySelectorAll('.ans-btn').forEach(b => b.classList.add('disabled'));
  $('answerInput').disabled = true;
  $('answerSubmit').disabled = true;

  let result;
  try {
    result = await Api.post(`/game/${G.sessionId}/answer`, { questionId: q.id, answer: ans });
  } catch(e) {
    console.error('Gagal mengirim jawaban:', e);
    // Server-side exam timeout beat the client's own timer (clock skew/lag) -
    // stop asking questions the server will just keep rejecting.
    if(e.expired) { endGame(); return; }
    result = { isCorrect: false, scoreEarned: 0, correctAnswer: '?' };
  }

  if(result.isCorrect) {
    G.correct++;
    G.streak++;
    G.maxStreak = Math.max(G.maxStreak, G.streak);
    AudioFX.correct();
    G.score += result.scoreEarned;

    if(btnEl) btnEl.classList.add('correct');

    // Combo badge animation
    if(G.streak >= 3) {
      $('streakNum').textContent = G.streak;
      $('streakBadge').classList.add('visible');
    }

    showFeedback(true, `+${result.scoreEarned} Poin!`);
  } else {
    G.wrong++;
    G.streak = 0;
    AudioFX.wrong();
    vibrate(200);

    if(btnEl) btnEl.classList.add('wrong');
    $('streakBadge').classList.remove('visible');

    showFeedback(false, `Jawaban: ${result.correctAnswer}`);
  }

  setTimeout(() => {
    hideFeedback();
    nextQ(result.isCorrect);
  }, 1200);
}

function showFeedback(correct, details) {
  const overlay = $('feedbackOverlay');
  $('fbEmoji').textContent = correct ? '🎉' : '❌';
  $('fbText').textContent = correct ? 'Benar!' : 'Salah!';
  $('fbDetail').textContent = details;
  overlay.classList.add('visible');
}

function hideFeedback() {
  $('feedbackOverlay').classList.remove('visible');
}

function nextQ(wasCorrect) {
  G.qi++;
  if(G.qi >= G.qs.length) {
    endGame();
  } else {
    showQ();
    if(!examMode) startTimer(); // Restart timer for next question in non-exam mode
  }
}

// Server tallies the whole session (score/accuracy/duration/XP/level/streak/
// achievements) - the client just displays whatever it returns.
async function endGame() {
  if(G.timer) clearInterval(G.timer);

  let result;
  try {
    result = await Api.post(`/game/${G.sessionId}/finish`);
  } catch(e) {
    alert('Gagal menyimpan hasil permainan: ' + e.message);
    showScreen('homeScreen');
    renderHome();
    return;
  }

  if(result.leveledUp) {
    AudioFX.levelUp();
    showToast('🌟', 'LEVEL UP!', `Kamu sekarang level ${result.level}!`);
  }

  const achievementToasts = (result.newAchievements || []).map(achId => ACHIEVEMENTS.find(a => a.id === achId)).filter(Boolean);
  let toastSlot = result.leveledUp ? 1 : 0;
  achievementToasts.forEach(ach => {
    setTimeout(() => showToast('🏆', 'PRESTASI BARU!', ach.n), toastSlot * 3800);
    toastSlot++;
  });
  if(result.gradeUnlocked) {
    setTimeout(() => showToast('🔓', 'KELAS BARU!', `Kamu berhasil membuka Kelas ${result.gradeUnlocked}!`), toastSlot * 3800);
  }

  // Display result screen
  $('rScore').textContent = result.score;
  $('rCorrect').textContent = `${result.correct}/${result.total}`;
  $('rTime').textContent = `${result.duration}s`;
  $('rStreak').textContent = result.maxStreak;
  $('rXP').textContent = result.xpEarned;

  // XP Fill bar
  const currentLvlXp = (result.level - 1) * 1000;
  const targetXp = result.level * 1000;
  const pct = Math.min(100, Math.round(((result.xp - currentLvlXp) / (targetXp - currentLvlXp)) * 100));
  $('rXPFill').style.width = `${pct}%`;
  $('rLevel').textContent = result.level;

  // Star elements on result
  const starsEl = $('resultStars').querySelectorAll('i');
  starsEl.forEach((star, idx) => {
    star.classList.remove('active');
    let starReq = idx === 0 ? 1 : idx === 1 ? 80 : 100;
    if(result.accuracy >= starReq) star.classList.add('active');
  });

  // Trophy and headers
  if(result.accuracy === 100) {
    $('resultTrophyIcon').textContent = '🏆';
    $('resultTitle').textContent = 'Luar Biasa!';
    $('resultSub').textContent = 'Sempurna! Kamu jenius matematika!';
    if(typeof confetti === 'function') {
      try { confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } }); } catch(e) { console.warn('Confetti failed:', e); }
    }
  } else if(result.accuracy >= 70) {
    $('resultTrophyIcon').textContent = '🥇';
    $('resultTitle').textContent = 'Keren Banget!';
    $('resultSub').textContent = 'Hebat! Teruskan belajarmu!';
  } else {
    $('resultTrophyIcon').textContent = '🥈';
    $('resultTitle').textContent = 'Coba Lagi!';
    $('resultSub').textContent = 'Jangan menyerah, kamu pasti bisa!';
  }

  showScreen('resultScreen');
}

function showToast(icon, title, msg) {
  const toast = $('toast');
  $('toastIcon').textContent = icon;
  $('toastTitle').textContent = title;
  $('toastMsg').textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3500);
}

// === QUICK PLAY ===
function quickPlay() {
  // Always play at user's registered grade
  const gp = S.gp[S.userGrade] || { done: 0 };
  const sub = Math.min((gp.done || 0) + 1, 5);
  startGame(S.userGrade, sub);
}

// === DAILY CHALLENGE ===
function dailyChallenge() {
  // Daily challenge at user's grade level
  startGame(S.userGrade, 1);
}

// === PROFILE AND AVATAR ===
function openProfile() {
  $('modalName').value = S.name;
  document.querySelectorAll('.avatar-opt').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.avatar === S.avatar);
  });
  $('profileModal').classList.add('visible');
}

// === ANALYTICS RENDERING (Stockbit style) ===
let mainChartObj = null;
let accuracyPieChartObj = null;

async function renderStats() {
  await syncProfile();
  renderMetricPills();
  renderBigChart('1w');
  renderOverviewSubtab();
}

function renderMetricPills() {
  const acc = S.totalQuestions > 0 ? Math.round((S.correctAnswers / S.totalQuestions) * 100) : 0;
  $('mpAccuracy').textContent = `${acc}%`;
  $('mpGames').textContent = S.totalGames;
  $('mpStreak').textContent = S.maxStreak;

  // Calculate average time
  const totalTime = S.history.reduce((sum, h) => sum + h.duration, 0);
  const avgTime = S.totalGames > 0 ? Math.round(totalTime / S.totalQuestions) : 0;
  $('mpSpeed').textContent = `${avgTime}s`;
}

function renderBigChart(timeframe) {
  const canvasEl = $('bigChart');
  if(!canvasEl) return;

  // Destroy previous chart
  if(mainChartObj) mainChartObj.destroy();

  // Filter history based on timeframe
  let limit = 7;
  if(timeframe === '1m') limit = 15;
  if(timeframe === '3m') limit = 30;
  if(timeframe === 'all') limit = 100;

  const historySlice = [...S.history].reverse().slice(-limit);
  const scores = historySlice.map(h => h.score);
  const labels = historySlice.map(h => h.date);

  // If no history, inject dummy initial data
  if(scores.length === 0) {
    scores.push(0, 10, 45, 95);
    labels.push('Mulai', 'H-3', 'H-2', 'Hari Ini');
  }

  const totalScore = scores.reduce((sum, s) => sum + s, 0);
  $('bigChartVal').textContent = totalScore;

  // Calculate percentage change (Stockbit chart style)
  if(scores.length >= 2) {
    const first = scores[0] || 1;
    const last = scores[scores.length - 1];
    const pct = Math.round(((last - first) / first) * 100);

    const changeWrap = $('bigChartChange');
    if(pct >= 0) {
      changeWrap.className = 'big-chart-change';
      changeWrap.innerHTML = `<i class="fas fa-arrow-up"></i> <span>${pct}%</span>`;
    } else {
      changeWrap.className = 'big-chart-change down';
      changeWrap.innerHTML = `<i class="fas fa-arrow-down"></i> <span>${Math.abs(pct)}%</span>`;
    }
  }

  if(typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded, skipping chart render');
    return;
  }

  const gradient = canvasEl.getContext('2d').createLinearGradient(0, 0, 0, 160);
  gradient.addColorStop(0, 'rgba(255, 179, 0, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 179, 0, 0)');

  mainChartObj = new Chart(canvasEl, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Skor',
        data: scores,
        borderColor: '#FFB300',
        borderWidth: 2,
        fill: true,
        backgroundColor: gradient,
        tension: 0.4,
        pointBackgroundColor: '#FFB300',
        pointRadius: scores.length > 20 ? 0 : 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#7A6F55', font: { size: 9 } } },
        y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#7A6F55', font: { size: 9 } } }
      }
    }
  });
}

function renderOverviewSubtab() {
  // Accuracy doughnut chart
  const canvasEl = $('chartAccuracy');
  if(!canvasEl) return;
  if(accuracyPieChartObj) accuracyPieChartObj.destroy();

  const correct = S.correctAnswers;
  const incorrect = S.totalQuestions - S.correctAnswers;

  if(typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded, skipping chart render');
  } else {
    accuracyPieChartObj = new Chart(canvasEl, {
      type: 'doughnut',
      data: {
        labels: ['Benar', 'Salah'],
        datasets: [{
          data: correct === 0 && incorrect === 0 ? [1, 0] : [correct, incorrect],
          backgroundColor: ['#FFB300', '#E0245E'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#2B2410', font: { size: 10 } } } },
        cutout: '70%'
      }
    });
  }

  // Mastery List (SD to SMP progress bars)
  const mastery = $('masteryList');
  if(mastery) {
    mastery.innerHTML = '';
    const categories = [
      { name: 'Penjumlahan & Pengurangan', key: 1 },
      { name: 'Perkalian & Pembagian', key: 2 },
      { name: 'FPB & Pecahan', key: 4 },
      { name: 'Desimal & Persen', key: 5 }
    ];

    categories.forEach(cat => {
      const gp = S.gp[cat.key] || { done: 0 };
      const pct = Math.round((gp.done / 5) * 100);

      const div = document.createElement('div');
      div.className = 'mastery-item';
      div.innerHTML = `
        <div class="m-icon">🎯</div>
        <div class="m-info">
          <div class="m-name">${cat.name}</div>
          <div class="m-bar"><div class="m-bar-fill" style="width: ${pct}%"></div></div>
        </div>
        <div class="m-val">${pct}%</div>
      `;
      mastery.appendChild(div);
    });
  }
}

function renderSubjectsSubtab() {
  const container = $('subjectBreakdown');
  if(!container) return;
  container.innerHTML = '';

  Object.keys(GRADE_CONFIG).forEach(gradeKey => {
    const grade = parseInt(gradeKey);
    const cfg = GRADE_CONFIG[grade];
    const gp = S.gp[grade] || { done: 0 };

    // Filter history records for this specific grade
    const gradeHist = S.history.filter(h => h.grade === grade);
    const avgAcc = gradeHist.length > 0 ? Math.round(gradeHist.reduce((s, h) => s + h.accuracy, 0) / gradeHist.length) : 0;

    const div = document.createElement('div');
    div.className = 'sb-item';
    div.innerHTML = `
      <div class="sb-name-wrap">
        <span class="sb-icon">${cfg.icon}</span>
        <span class="sb-name">${cfg.name}</span>
      </div>
      <div class="sb-stats">
        <div class="sb-stat acc"><span>Akurasi</span>${avgAcc}%</div>
        <div class="sb-stat games"><span>Sesi</span>${gradeHist.length}</div>
      </div>
    `;
    container.appendChild(div);
  });
}

function renderHistorySubtab() {
  const container = $('historyList');
  if(!container) return;
  container.innerHTML = '';

  if(S.history.length === 0) {
    container.innerHTML = '<div class="empty-msg"><i class="fas fa-history"></i>Belum ada riwayat petualangan</div>';
    return;
  }

  S.history.forEach(h => {
    const cfg = GRADE_CONFIG[h.grade] || { icon: '📝', name: 'Ujian' };
    const div = document.createElement('div');
    div.className = 'h-item';
    div.innerHTML = `
      <div class="h-badge" style="background: ${h.isExam ? 'var(--neonPk)' : 'var(--neonB)'}">${h.isExam ? '📝' : cfg.icon}</div>
      <div class="h-info">
        <h5>${h.isExam ? 'Ujian Matematika' : cfg.name}</h5>
        <p>${h.date} • ${h.correct} Benar • ${h.duration}s</p>
      </div>
      <div class="h-score">${h.score} PTS</div>
    `;
    container.appendChild(div);
  });
}

// === EXAM MODULE ===
async function renderExams() {
  await syncExams();

  const examList = $('examList');
  if(!examList) return;
  examList.innerHTML = '';

  S.exams.forEach(ex => {
    const card = document.createElement('div');
    card.className = `exam-card ${ex.completed ? 'completed-exam' : 'active-exam'}`;
    card.innerHTML = `
      <div class="ec-icon"><i class="fas ${ex.completed ? 'fa-check-circle' : 'fa-play-circle'}"></i></div>
      <div class="ec-info">
        <h4 class="ec-title">${ex.title}</h4>
        <p class="ec-meta">${ex.desc} • ${ex.questions} Soal • ${ex.duration}s</p>
      </div>
      <button class="ec-action">${ex.completed ? `Skor: ${ex.score}` : 'Mulai'}</button>
    `;

    if(!ex.completed) {
      card.querySelector('.ec-action').addEventListener('click', () => {
        AudioFX.click();
        startGame(ex.grade, 1, true, ex);
      });
    }
    examList.appendChild(card);
  });

  // Render exam stats
  const completedExams = S.exams.filter(e => e.completed);
  $('examTotal').textContent = completedExams.length;

  const avg = completedExams.length > 0 ? Math.round(completedExams.reduce((sum, e) => sum + e.score, 0) / completedExams.length) : 0;
  $('examAvg').textContent = `${avg}%`;

  const best = completedExams.length > 0 ? Math.max(...completedExams.map(e => e.score)) : 0;
  $('examBest').textContent = best;

  // Render exam history
  const examHistory = $('examHistory');
  if(examHistory) {
    examHistory.innerHTML = '';
    const examHistories = S.history.filter(h => h.isExam);
    if(examHistories.length === 0) {
      examHistory.innerHTML = '<div class="empty-msg"><i class="fas fa-clipboard"></i>Belum ada riwayat ujian</div>';
      return;
    }

    examHistories.forEach(eh => {
      const div = document.createElement('div');
      div.className = 'h-item';
      div.innerHTML = `
        <div class="h-badge" style="background: var(--neonPk)"><i class="fas fa-clipboard-list"></i></div>
        <div class="h-info">
          <h5>Ujian Matematika</h5>
          <p>${eh.date} • Akurasi ${eh.accuracy}% • ${eh.duration}s</p>
        </div>
        <div class="h-score">${eh.score} PTS</div>
      `;
      examHistory.appendChild(div);
    });
  }
}

// === PROFILE RENDERING ===
async function renderProfile() {
  await syncProfile();

  $('profileAvatar').textContent = S.avatar;
  $('profileName').textContent = S.name;
  $('profileLevel').textContent = S.level;
  $('profileGrade').textContent = getGradeLabel(S.userGrade);

  // XP Progress Fill
  const currentLvlXp = (S.level - 1) * 1000;
  const targetXp = S.level * 1000;
  const pct = Math.min(100, Math.round(((S.xp - currentLvlXp) / (targetXp - currentLvlXp)) * 100));
  $('profileXPFill').style.width = `${pct}%`;
  $('profileXP').textContent = S.xp;

  // Stat values
  $('psTotalGames').textContent = S.totalGames;
  const acc = S.totalQuestions > 0 ? Math.round((S.correctAnswers / S.totalQuestions) * 100) : 0;
  $('psAccuracy').textContent = `${acc}%`;
  $('psStreak').textContent = S.maxStreak;
  $('psFastest').textContent = S.fastestTime === 999 ? '-' : `${S.fastestTime}s`;

  // Sync settings inputs
  const sName = $('settingName');
  if(sName) sName.value = S.name;
  const sGrade = $('settingGrade');
  if(sGrade) sGrade.value = S.userGrade;
  const sBirth = $('settingBirthdate');
  if(sBirth) sBirth.value = S.birthdate;
  const sSound = $('settingSound');
  if(sSound) sSound.checked = S.sound;
  const sVib = $('settingVibrate');
  if(sVib) sVib.checked = S.vibrate;

  const linkCodeEl = $('studentLinkCode');
  if(linkCodeEl) linkCodeEl.textContent = S.linkCode || '-';
  const linkCodeExpiryEl = $('studentLinkCodeExpiry');
  if(linkCodeExpiryEl) linkCodeExpiryEl.textContent = S.linkCodeExpiresAt ? new Date(S.linkCodeExpiresAt).toLocaleDateString('id-ID') : '-';
  loadParentRequests();

  // Achievements grid
  const grid = $('achGrid');
  if(grid) {
    grid.innerHTML = '';
    ACHIEVEMENTS.forEach(ach => {
      const unlocked = !!S.achievements[ach.id];
      const item = document.createElement('div');
      item.className = `ach-item ${unlocked ? 'unlocked' : ''}`;
      item.innerHTML = `
        <div class="ach-icon">${unlocked ? ach.i : '🔒'}</div>
        <div class="ach-info">
          <h4>${ach.n}</h4>
          <p>${ach.d}</p>
        </div>
      `;
      grid.appendChild(item);
    });

    // Counters
    const unlockedCount = ACHIEVEMENTS.filter(a => S.achievements[a.id]).length;
    $('achUnlocked').textContent = unlockedCount;
    $('achTotal').textContent = ACHIEVEMENTS.length;
  }
}

// === STUDENT: incoming parent-link requests ===
// A parent claiming this student's code lands as PENDING - only the student
// can confirm "yes, that's really my parent" (Team_Review.md P0 item 3).
async function loadParentRequests() {
  const group = $('parentRequestsGroup');
  const list = $('parentRequestsList');
  if(!group || !list) return;
  try {
    const data = await Api.get('/parent-links/pending');
    renderParentRequests(data.pending);
  } catch(e) {
    group.style.display = 'none';
  }
}

function renderParentRequests(pending) {
  const group = $('parentRequestsGroup');
  const list = $('parentRequestsList');
  if(!group || !list) return;
  group.style.display = pending.length > 0 ? 'block' : 'none';
  list.innerHTML = '';
  pending.forEach(p => {
    const row = document.createElement('div');
    row.className = 'parent-request-item';
    row.innerHTML = `
      <span>${escapeHtml(p.parentAvatar)} ${escapeHtml(p.parentName)}</span>
      <div class="parent-request-actions">
        <button class="parent-request-approve">Setujui</button>
        <button class="parent-request-reject">Tolak</button>
      </div>
    `;
    row.querySelector('.parent-request-approve').addEventListener('click', async () => {
      try {
        await Api.post(`/parent-links/${p.id}/approve`, {});
        await loadParentRequests();
        showToast('✅', 'Disetujui', `${p.parentName} sekarang bisa memantau progres kamu`);
      } catch(err) { showToast('⚠️', 'Gagal', err.message); }
    });
    row.querySelector('.parent-request-reject').addEventListener('click', async () => {
      try {
        await Api.post(`/parent-links/${p.id}/reject`, {});
        await loadParentRequests();
      } catch(err) { showToast('⚠️', 'Gagal', err.message); }
    });
    list.appendChild(row);
  });
}

// === UTILS ===
function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// === PARENT MODE ===
async function syncParentChildren() {
  const data = await Api.get('/parent-links/children');
  PARENT.children = data.children;
}

async function syncParentChildDetail(studentId) {
  const data = await Api.get(`/parent-links/children/${studentId}`);
  PARENT.activeStudentId = studentId;
  PARENT.activeDetail = data;
}

function renderParentChildChips() {
  const container = $('parentChildChips');
  if(!container) return;
  container.innerHTML = '';
  if(PARENT.children.length <= 1) return; // no chip row needed for a single child

  PARENT.children.forEach(c => {
    const chip = document.createElement('div');
    chip.className = 'child-chip' + (c.studentId === PARENT.activeStudentId ? ' active' : '');
    chip.innerHTML = `<span class="chip-avatar">${escapeHtml(c.avatar)}</span><span>${escapeHtml(c.name)}</span>`;
    chip.addEventListener('click', async () => {
      if(c.studentId === PARENT.activeStudentId) return;
      await syncParentChildDetail(c.studentId);
      renderParentHome();
    });
    container.appendChild(chip);
  });
}

function renderParentHome() {
  const d = PARENT.activeDetail;
  if(!d) return;
  renderParentChildChips();

  $('parentHeroName').textContent = d.name;
  $('parentHeroLevel').textContent = d.level;
  $('parentHeroStreak').textContent = d.streak;
  $('parentHeroAccuracy').textContent = `${d.accuracy}%`;
  $('parentHeroGradeBadge').textContent = getGradeLabel(d.grade);
  $('parentPsGames').textContent = d.totalGames;
  $('parentPsAccuracy').textContent = `${d.accuracy}%`;
  $('parentPsStreak').textContent = d.maxStreak;

  const list = $('parentActivityList');
  list.innerHTML = '';
  if(!d.history || d.history.length === 0) {
    list.innerHTML = '<div class="empty-msg"><i class="fas fa-history"></i>Belum ada aktivitas</div>';
    return;
  }
  d.history.forEach(h => {
    const cfg = GRADE_CONFIG[h.grade] || { icon: '📝', name: 'Ujian' };
    const div = document.createElement('div');
    div.className = 'h-item';
    div.innerHTML = `
      <div class="h-badge" style="background: ${h.isExam ? 'var(--neonPk)' : 'var(--neonB)'}">${h.isExam ? '📝' : cfg.icon}</div>
      <div class="h-info">
        <h5>${h.isExam ? 'Ujian Matematika' : cfg.name}</h5>
        <p>${new Date(h.date).toLocaleDateString('id-ID')} • ${h.correct} Benar • ${h.duration}s</p>
      </div>
      <div class="h-score">${h.score} PTS</div>
    `;
    list.appendChild(div);
  });
}

function renderParentProfile() {
  $('parentProfileAvatar').textContent = CURRENT_USER?.avatar || '🧑';
  $('parentProfileName').textContent = CURRENT_USER?.name || 'Orang Tua';

  const list = $('parentChildrenList');
  list.innerHTML = '';
  if(PARENT.children.length === 0) {
    list.innerHTML = '<div class="empty-msg"><i class="fas fa-child"></i>Belum ada anak terhubung</div>';
    return;
  }
  PARENT.children.forEach(c => {
    const row = document.createElement('div');
    row.className = 'setting-item';
    row.innerHTML = `
      <div class="setting-info"><i class="fas fa-child"></i><span>${escapeHtml(c.avatar)} ${escapeHtml(c.name)}</span></div>
      <span class="link-code-pill">${getGradeLabel(c.grade)}</span>
      <button class="unlink-child-btn" title="Putuskan hubungan" data-relationship-id="${c.relationshipId}"><i class="fas fa-unlink"></i></button>
    `;
    row.querySelector('.unlink-child-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = confirm(`Putuskan hubungan dengan ${c.name}? Kamu tidak akan bisa melihat progresnya lagi.`);
      if(!ok) return;
      try {
        await Api.delete(`/parent-links/${c.relationshipId}`);
        await syncParentChildren();
        renderParentProfile();
        if(PARENT.children.length === 0) showScreen('parentClaimScreen');
      } catch(err) {
        showToast('⚠️', 'Gagal', err.message);
      }
    });
    list.appendChild(row);
  });
}

// Routes a PARENT session to the right screen: straight to the claim flow if
// they have no linked children yet, otherwise to the first child's home.
async function bootParentMode() {
  CURRENT_ROLE = 'PARENT';
  setNavForRole('PARENT');
  await syncParentChildren();
  if(PARENT.children.length === 0) {
    $('parentClaimGotoHome').style.display = 'none';
    showScreen('parentClaimScreen');
    return;
  }
  await syncParentChildDetail(PARENT.children[0].studentId);
  showScreen('parentHomeScreen');
  renderParentHome();
}

// === AUTH / SESSION BOOTSTRAP ===
async function tryRestoreSession() {
  if(!getAccessToken()) return false;
  try {
    const me = await Api.get('/auth/me');
    CURRENT_USER = me.user;
    CURRENT_ROLE = me.user.role;
    if(CURRENT_ROLE === 'PARENT') {
      await bootParentMode();
    } else {
      await syncProfile();
    }
    return true;
  } catch(e) {
    clearTokens();
    return false;
  }
}

function logout() {
  clearTokens();
  S = defaults();
  CURRENT_ROLE = null;
  CURRENT_USER = null;
  PARENT = { children: [], activeStudentId: null, activeDetail: null };
  setNavForRole('STUDENT');
  showScreen('loginScreen');
}

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded fired');

  // Custom element helper
  function safeEl(id) {
    const el = document.getElementById(id);
    if(!el) console.warn('Missing element:', id);
    return el;
  }

  try { initParticles(); } catch(e) { console.warn('Particles failed:', e); }

  // Splash Auto-Transition
  setTimeout(async () => {
    try {
      const restored = await tryRestoreSession();
      if(restored) {
        if(CURRENT_ROLE === 'PARENT') {
          // tryRestoreSession() already routed to the right parent screen via bootParentMode()
        } else {
          showScreen('homeScreen');
          await renderHome();
        }
      } else {
        showScreen('onboardingScreen');
      }
    } catch(e) {
      console.error('Init routing failed:', e);
      showScreen('onboardingScreen');
    }
  }, 2200);

  // Bottom nav clicks - delegated on the container (not the buttons) so
  // setNavForRole() can freely swap #bottomNav's innerHTML between the
  // student and parent button sets without leaving anything unwired.
  const bottomNavEl = safeEl('bottomNav');
  if(bottomNavEl) {
    bottomNavEl.addEventListener('click', async (e) => {
      if(e.target.closest('#navPlayBtn')) { AudioFX.click(); quickPlay(); return; }
      const n = e.target.closest('.nav-item[data-screen]');
      if(!n) return;
      AudioFX.click();
      const sc = n.dataset.screen;
      showScreen(sc);
      if(sc === 'homeScreen') await renderHome();
      if(sc === 'analyticsScreen') await renderStats();
      if(sc === 'examScreen') await renderExams();
      if(sc === 'profileScreen') await renderProfile();
      if(sc === 'parentHomeScreen') renderParentHome();
      if(sc === 'parentProfileScreen') renderParentProfile();
    });
  }

  // Timeframe selector clicks (Stockbit area chart timeframe switching)
  document.querySelectorAll('.tf-btn').forEach(b => {
    b.addEventListener('click', () => {
      AudioFX.click();
      document.querySelectorAll('.tf-btn').forEach(btn => btn.classList.remove('active'));
      b.classList.add('active');
      renderBigChart(b.dataset.tf);
    });
  });

  // Analytics subtabs click events
  document.querySelectorAll('.at-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      AudioFX.click();
      document.querySelectorAll('.at-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const panelId = btn.dataset.at;
      document.querySelectorAll('.at-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.panel === panelId);
      });

      if(panelId === 'overview') renderOverviewSubtab();
      if(panelId === 'subjects') renderSubjectsSubtab();
      if(panelId === 'history') renderHistorySubtab();
    });
  });

  // Back button routing
  document.querySelectorAll('[data-back]').forEach(b => {
    b.addEventListener('click', async () => {
      AudioFX.click();
      const sc = b.dataset.back;
      showScreen(sc);
      if(sc === 'homeScreen') await renderHome();
    });
  });

  // Level map filters SD / SMP
  document.querySelectorAll('.tab-btn').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      renderLevelMap(t.dataset.filter);
    });
  });

  // Back button from gameplay
  const gameBackBtn = safeEl('gameBackBtn');
  if(gameBackBtn) {
    gameBackBtn.addEventListener('click', () => {
      if(G.timer) clearInterval(G.timer);
      if(examMode) {
        showScreen('examScreen');
        renderExams();
      } else {
        openSubLevel(G.grade);
      }
    });
  }

  // Profile modal settings
  const editBtn = safeEl('editProfileBtn');
  if(editBtn) editBtn.addEventListener('click', openProfile);

  const cancelBtn = safeEl('modalCancel');
  if(cancelBtn) cancelBtn.addEventListener('click', () => safeEl('profileModal')?.classList.remove('visible'));

  const saveBtn = safeEl('modalSave');
  if(saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const name = (safeEl('modalName')?.value || '').trim();
      const sel = document.querySelector('.avatar-opt.selected');
      const avatar = sel ? sel.dataset.avatar : S.avatar;
      try {
        await Api.patch('/profile/me', { name, avatar });
        safeEl('profileModal')?.classList.remove('visible');
        await renderHome();
      } catch(e) {
        alert('Gagal menyimpan profil: ' + e.message);
      }
    });
  }

  document.querySelectorAll('.avatar-opt').forEach(a => {
    a.addEventListener('click', () => {
      document.querySelectorAll('.avatar-opt').forEach(x => x.classList.remove('selected'));
      a.classList.add('selected');
    });
  });

  // navPlayBtn is handled by the delegated #bottomNav listener above (it gets
  // recreated whenever setNavForRole() swaps the nav's innerHTML).

  // === HOME MENU GRID ===
  const tileBelajar = safeEl('tileBelajar');
  if(tileBelajar) {
    tileBelajar.addEventListener('click', () => {
      AudioFX.click();
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.toggle('active', t.dataset.filter === 'all'));
      renderLevelMap('all');
      showScreen('learnScreen');
    });
  }

  const tileUjian = safeEl('tileUjian');
  if(tileUjian) tileUjian.addEventListener('click', async () => { AudioFX.click(); showScreen('examScreen'); await renderExams(); });

  const tileProgress = safeEl('tileProgress');
  if(tileProgress) tileProgress.addEventListener('click', async () => { AudioFX.click(); showScreen('analyticsScreen'); await renderStats(); });

  const tileProfil = safeEl('tileProfil');
  if(tileProfil) tileProfil.addEventListener('click', async () => { AudioFX.click(); showScreen('profileScreen'); await renderProfile(); });

  const tileQuickPlay = safeEl('tileQuickPlay');
  if(tileQuickPlay) tileQuickPlay.addEventListener('click', () => { AudioFX.click(); quickPlay(); });

  const tileDaily = safeEl('tileDaily');
  if(tileDaily) tileDaily.addEventListener('click', () => { AudioFX.click(); dailyChallenge(); });

  const tileAch = safeEl('tileAch');
  if(tileAch) {
    tileAch.addEventListener('click', async () => {
      AudioFX.click();
      showScreen('profileScreen');
      await renderProfile();
      safeEl('achGrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const tileJoinClass = safeEl('tileJoinClass');
  if(tileJoinClass) {
    tileJoinClass.addEventListener('click', async () => {
      AudioFX.click();
      showScreen('profileScreen');
      await renderProfile();
      safeEl('joinClassCode')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  const notifBellBtn = safeEl('notifBellBtn');
  if(notifBellBtn) notifBellBtn.addEventListener('click', () => { AudioFX.click(); safeEl('notifSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  // Result screen navigation actions
  const retryBtn = safeEl('rRetry');
  if(retryBtn) retryBtn.addEventListener('click', () => startGame(G.grade, G.subLevel, examMode, currentExamObj));

  const nextBtn = safeEl('rNext');
  if(nextBtn) {
    nextBtn.addEventListener('click', () => {
      if(examMode) {
        showScreen('examScreen');
        renderExams();
      } else {
        const nextSubLevel = G.subLevel + 1;
        if(nextSubLevel <= 5) startGame(G.grade, nextSubLevel);
        else openSubLevel(G.grade);
      }
    });
  }

  const homeBtn = safeEl('rHome');
  if(homeBtn) homeBtn.addEventListener('click', async () => { showScreen('homeScreen'); await renderHome(); });

  // Settings tab form triggers
  const sName = safeEl('settingName');
  if(sName) {
    sName.addEventListener('change', async e => {
      try { await Api.patch('/profile/me', { name: e.target.value.trim() }); } catch(err) { alert(err.message); }
    });
  }

  const sSound = safeEl('settingSound');
  if(sSound) {
    sSound.addEventListener('change', async e => {
      S.sound = e.target.checked;
      try { await Api.patch('/profile/me', { sound: e.target.checked }); } catch(err) { alert(err.message); }
    });
  }

  const sVib = safeEl('settingVibrate');
  if(sVib) {
    sVib.addEventListener('change', async e => {
      S.vibrate = e.target.checked;
      try { await Api.patch('/profile/me', { vibrate: e.target.checked }); } catch(err) { alert(err.message); }
    });
  }

  // Logout (previously "reset data" - data now lives server-side, so this
  // just signs the device out instead of destroying anything)
  const resetBtn = safeEl('resetDataBtn');
  if(resetBtn) {
    resetBtn.addEventListener('click', () => {
      if(confirm('Keluar dari akun ini?')) {
        logout();
      }
    });
  }

  // Numerical keyboard inputs for input-based questions
  const ansSubmit = safeEl('answerSubmit');
  if(ansSubmit) {
    ansSubmit.addEventListener('click', () => {
      const val = safeEl('answerInput').value.trim();
      if(val !== '') submitAnswer(val);
    });
  }

  const ansInp = safeEl('answerInput');
  if(ansInp) {
    ansInp.addEventListener('keydown', e => {
      if(e.key === 'Enter') {
        const val = ansInp.value.trim();
        if(val !== '') submitAnswer(val);
      }
    });
  }

  // === ONBOARDING (registration) EVENT LISTENERS ===
  let obStep = 1;
  let obData = { name: '', username: '', password: '', avatar: '🧒', birthdate: '', grade: 0 };

  function setObStep(step) {
    obStep = step;
    document.querySelectorAll('.ob-step').forEach(s => s.classList.toggle('active', parseInt(s.dataset.step) === step));
    document.querySelectorAll('.ob-dot').forEach(d => d.classList.toggle('active', parseInt(d.dataset.dot) === step));
  }

  function showObError(msg) {
    const el = safeEl('obError1');
    if(!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  // Avatar selection in onboarding
  document.querySelectorAll('.ob-avatar').forEach(a => {
    a.addEventListener('click', () => {
      document.querySelectorAll('.ob-avatar').forEach(x => x.classList.remove('selected'));
      a.classList.add('selected');
      obData.avatar = a.dataset.avatar;
    });
  });

  // Step 1 -> Step 2 (also collects credentials)
  const obNext1 = safeEl('obNext1');
  if(obNext1) {
    obNext1.addEventListener('click', () => {
      const name = safeEl('obName')?.value.trim();
      const username = safeEl('obUsername')?.value.trim();
      const password = safeEl('obPassword')?.value || '';
      safeEl('obError1').style.display = 'none';

      if(!name) { safeEl('obName')?.focus(); return; }
      if(!username) { showObError('Username wajib diisi'); safeEl('obUsername')?.focus(); return; }
      if(password.length < 6) { showObError('Password minimal 6 karakter'); safeEl('obPassword')?.focus(); return; }

      obData.name = name;
      obData.username = username;
      obData.password = password;
      AudioFX.click();
      setObStep(2);
    });
  }

  // Birthdate change => auto-calculate age and suggest grade
  const obBirthdate = safeEl('obBirthdate');
  if(obBirthdate) {
    obBirthdate.addEventListener('change', e => {
      const bd = e.target.value;
      if(!bd) return;
      obData.birthdate = bd;
      const age = calcAge(bd);
      const suggested = suggestGrade(age);

      $('obAgeDisplay').style.display = 'flex';
      $('obAgeCircle').textContent = age;
      $('obAgeLabel').textContent = `Umur kamu ${age} tahun`;
      $('obAgeSuggest').textContent = `Rekomendasi: ${getGradeLabel(suggested)}`;

      // Store suggestion for step 3
      obData.suggestedGrade = suggested;
    });
  }

  // Step 2 -> Step 3
  const obNext2 = safeEl('obNext2');
  if(obNext2) {
    obNext2.addEventListener('click', () => {
      AudioFX.click();
      setObStep(3);

      // Mark suggested grade button
      document.querySelectorAll('.ob-grade-btn').forEach(b => b.classList.remove('suggested', 'selected'));
      if(obData.suggestedGrade) {
        const sugBtn = document.querySelector(`.ob-grade-btn[data-grade="${obData.suggestedGrade}"]`);
        if(sugBtn) sugBtn.classList.add('suggested');
        $('obGradeHint').textContent = `Berdasarkan umurmu, kami sarankan ${getGradeLabel(obData.suggestedGrade)}`;
      }
    });
  }

  // Back buttons
  const obBack2 = safeEl('obBack2');
  if(obBack2) obBack2.addEventListener('click', () => { AudioFX.click(); setObStep(1); });
  const obBack3 = safeEl('obBack3');
  if(obBack3) obBack3.addEventListener('click', () => { AudioFX.click(); setObStep(2); });

  // Grade selection
  document.querySelectorAll('.ob-grade-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      AudioFX.click();
      document.querySelectorAll('.ob-grade-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      obData.grade = parseInt(btn.dataset.grade);
      safeEl('obStart').disabled = false;
    });
  });

  // Final: Start button => register account via API and go to home
  const obStart = safeEl('obStart');
  if(obStart) {
    obStart.addEventListener('click', async () => {
      if(!obData.grade) return;
      AudioFX.click();
      obStart.disabled = true;
      try {
        const data = await Api.post('/auth/register', {
          username: obData.username,
          password: obData.password,
          role: 'STUDENT',
          name: obData.name,
          avatar: obData.avatar,
          birthdate: obData.birthdate,
          grade: obData.grade
        }, { noAuth: true });

        setTokens(data.accessToken, data.refreshToken);
        showScreen('homeScreen');
        await renderHome();
        showToast('🎉', 'SELAMAT DATANG!', `Halo ${S.name}! Ayo mulai petualangan matematika!`);
      } catch(e) {
        alert('Gagal mendaftar: ' + e.message);
        obStart.disabled = false;
      }
    });
  }

  // === LOGIN EVENT LISTENERS ===
  const loginSubmit = safeEl('loginSubmit');
  if(loginSubmit) {
    loginSubmit.addEventListener('click', async () => {
      const username = safeEl('loginUsername')?.value.trim();
      const password = safeEl('loginPassword')?.value || '';
      const errEl = safeEl('loginError');
      errEl.style.display = 'none';

      if(!username || !password) {
        errEl.textContent = 'Username dan password wajib diisi';
        errEl.style.display = 'block';
        return;
      }

      loginSubmit.disabled = true;
      try {
        const data = await Api.post('/auth/login', { username, password }, { noAuth: true });
        setTokens(data.accessToken, data.refreshToken);
        CURRENT_USER = data.user;
        CURRENT_ROLE = data.user.role;
        if(CURRENT_ROLE === 'PARENT') {
          await bootParentMode();
        } else {
          showScreen('homeScreen');
          await renderHome();
        }
      } catch(e) {
        errEl.textContent = 'Username atau password salah';
        errEl.style.display = 'block';
      } finally {
        loginSubmit.disabled = false;
      }
    });
  }

  const gotoLogin = safeEl('obGotoLogin');
  if(gotoLogin) gotoLogin.addEventListener('click', (e) => { e.preventDefault(); showScreen('loginScreen'); });

  const gotoRegister = safeEl('loginGotoRegister');
  if(gotoRegister) gotoRegister.addEventListener('click', (e) => { e.preventDefault(); showScreen('onboardingScreen'); });

  // === PARENT MODE EVENT LISTENERS ===
  const gotoParentRegister = safeEl('loginGotoParentRegister');
  if(gotoParentRegister) gotoParentRegister.addEventListener('click', (e) => { e.preventDefault(); showScreen('parentRegisterScreen'); });

  const parentRegGotoLogin = safeEl('parentRegGotoLogin');
  if(parentRegGotoLogin) parentRegGotoLogin.addEventListener('click', (e) => { e.preventDefault(); showScreen('loginScreen'); });

  const parentRegSubmit = safeEl('parentRegSubmit');
  if(parentRegSubmit) {
    parentRegSubmit.addEventListener('click', async () => {
      const name = safeEl('parentRegName')?.value.trim();
      const username = safeEl('parentRegUsername')?.value.trim();
      const password = safeEl('parentRegPassword')?.value || '';
      const errEl = safeEl('parentRegError');
      errEl.style.display = 'none';

      if(!name || !username || !password) {
        errEl.textContent = 'Semua kolom wajib diisi';
        errEl.style.display = 'block';
        return;
      }

      parentRegSubmit.disabled = true;
      try {
        const data = await Api.post('/auth/register', { username, password, role: 'PARENT', name }, { noAuth: true });
        setTokens(data.accessToken, data.refreshToken);
        CURRENT_USER = data.user;
        CURRENT_ROLE = 'PARENT';
        setNavForRole('PARENT');
        showScreen('parentClaimScreen');
      } catch(e) {
        errEl.textContent = e.message;
        errEl.style.display = 'block';
      } finally {
        parentRegSubmit.disabled = false;
      }
    });
  }

  const parentClaimBtn = safeEl('parentClaimBtn');
  if(parentClaimBtn) {
    parentClaimBtn.addEventListener('click', async () => {
      const code = safeEl('parentClaimCode')?.value.trim();
      const msgEl = safeEl('parentClaimMsg');
      msgEl.style.display = 'none';
      msgEl.classList.remove('error');
      if(!code) return;

      parentClaimBtn.disabled = true;
      try {
        // The relationship starts PENDING - the student has to approve it in
        // their own app before it shows up here, so stay on this screen and
        // explain that instead of navigating to a home that has nothing yet.
        const data = await Api.post('/parent-links/claim', { linkCode: code });
        safeEl('parentClaimCode').value = '';
        msgEl.textContent = `Menunggu persetujuan dari ${data.studentName}. Kamu bisa memantau progresnya setelah disetujui.`;
        msgEl.style.display = 'block';
        await syncParentChildren();
        safeEl('parentClaimGotoHome').style.display = PARENT.children.length > 0 ? 'block' : 'none';
      } catch(err) {
        msgEl.textContent = err.message;
        msgEl.classList.add('error');
        msgEl.style.display = 'block';
      } finally {
        parentClaimBtn.disabled = false;
      }
    });
  }

  const parentClaimGotoHome = safeEl('parentClaimGotoHome');
  if(parentClaimGotoHome) {
    parentClaimGotoHome.querySelector('a')?.addEventListener('click', (e) => {
      e.preventDefault();
      showScreen('parentHomeScreen');
      renderParentHome();
    });
  }

  function openAddChildFlow() {
    safeEl('parentClaimGotoHome').style.display = PARENT.children.length > 0 ? 'block' : 'none';
    showScreen('parentClaimScreen');
  }
  const parentAddChildBtn = safeEl('parentAddChildBtn');
  if(parentAddChildBtn) parentAddChildBtn.addEventListener('click', openAddChildFlow);
  const parentProfileAddChildBtn = safeEl('parentProfileAddChildBtn');
  if(parentProfileAddChildBtn) parentProfileAddChildBtn.addEventListener('click', openAddChildFlow);

  const parentLogoutBtn = safeEl('parentLogoutBtn');
  if(parentLogoutBtn) {
    parentLogoutBtn.addEventListener('click', () => {
      if(confirm('Keluar dari akun ini?')) logout();
    });
  }

  // Settings: Grade change
  const sGrade = safeEl('settingGrade');
  if(sGrade) {
    sGrade.addEventListener('change', async e => {
      const grade = parseInt(e.target.value);
      try {
        await Api.patch('/profile/me', { grade });
        await renderProfile();
        showToast('🎓', 'KELAS DIUBAH', `Kamu sekarang di ${getGradeLabel(grade)}`);
      } catch(err) {
        alert('Gagal mengubah kelas: ' + err.message);
      }
    });
  }

  // Settings: Birthdate change
  const sBirth = safeEl('settingBirthdate');
  if(sBirth) {
    sBirth.addEventListener('change', async e => {
      try { await Api.patch('/profile/me', { birthdate: e.target.value }); } catch(err) { alert(err.message); }
    });
  }

  // Join a teacher's class with a code
  const joinClassBtn = safeEl('joinClassBtn');
  if(joinClassBtn) {
    joinClassBtn.addEventListener('click', async () => {
      const code = safeEl('joinClassCode')?.value.trim();
      const msgEl = safeEl('joinClassMsg');
      msgEl.style.display = 'none';
      msgEl.classList.remove('error');
      if(!code) return;

      joinClassBtn.disabled = true;
      try {
        const res = await Api.post('/classes/join', { joinCode: code });
        msgEl.textContent = `Berhasil gabung ke ${res.className}!`;
        msgEl.style.display = 'block';
        safeEl('joinClassCode').value = '';
        showToast('🎉', 'GABUNG KELAS', `Kamu sekarang di ${res.className}`);
      } catch(err) {
        msgEl.textContent = err.message;
        msgEl.classList.add('error');
        msgEl.style.display = 'block';
      } finally {
        joinClassBtn.disabled = false;
      }
    });
  }

  // Regenerate the parent-link code (e.g. shared it by mistake, or it expired)
  const regenerateLinkCodeBtn = safeEl('regenerateLinkCodeBtn');
  if(regenerateLinkCodeBtn) {
    regenerateLinkCodeBtn.addEventListener('click', async () => {
      regenerateLinkCodeBtn.disabled = true;
      try {
        const data = await Api.post('/parent-links/regenerate-code', {});
        S.linkCode = data.linkCode;
        S.linkCodeExpiresAt = data.linkCodeExpiresAt;
        $('studentLinkCode').textContent = data.linkCode;
        $('studentLinkCodeExpiry').textContent = new Date(data.linkCodeExpiresAt).toLocaleDateString('id-ID');
        showToast('🔑', 'Kode Baru', 'Kode lama sudah tidak berlaku');
      } catch(err) {
        showToast('⚠️', 'Gagal', err.message);
      } finally {
        regenerateLinkCodeBtn.disabled = false;
      }
    });
  }

  console.log('All event listeners registered successfully!');
});
