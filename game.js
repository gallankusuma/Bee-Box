// === STATE MANAGEMENT ===
const SK = 'mq_v3';
const defaults = () => ({
  name: 'Petualang',
  avatar: '🧒',
  registered: false,
  birthdate: '',
  userGrade: 1,
  xp: 0,
  level: 1,
  streak: 0, // consecutive days played
  lastPlayedDate: '', // date key of the last day a game was completed
  maxStreak: 0, // best in-game combo ever
  totalGames: 0,
  correctAnswers: 0,
  totalQuestions: 0,
  unlocked: [1],
  fastestTime: 999,
  history: [], // { date, grade, subLevel, score, correct, wrong, maxStreak, duration }
  gp: {}, // grade progress mapping
  achievements: {}, // { [achievementId]: true }
  sound: true,
  vibrate: true,
  exams: []
});

let S = defaults();
function load() {
  try {
    const raw = localStorage.getItem(SK);
    if(raw) {
      const parsed = JSON.parse(raw);
      S = { ...defaults(), ...parsed };
    }
  } catch(e) {
    console.warn('Load failed, resetting defaults', e);
  }
  // Always regenerate exams based on current grade
  regenerateExams();
}
function save() {
  try { localStorage.setItem(SK, JSON.stringify(S)); } catch(e) { console.error('Save failed', e); }
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
    const showNav = ['homeScreen', 'analyticsScreen', 'examScreen', 'profileScreen'].includes(id);
    nav.style.display = showNav ? 'flex' : 'none';
  }
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
    ctx.fillStyle = `rgba(0, 204, 255, ${p.alpha})`;
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

// === DAILY STREAK ===
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function updateDailyStreak() {
  const now = new Date();
  const todayKey = dateKey(now);
  if(S.lastPlayedDate === todayKey) return; // already counted today

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  S.streak = (S.lastPlayedDate === dateKey(yesterday)) ? S.streak + 1 : 1;
  S.lastPlayedDate = todayKey;
}

function regenerateExams() {
  const g = S.userGrade;
  const cfg = GRADE_CONFIG[g];
  const schoolName = g <= 6 ? 'SD' : 'SMP';
  
  // Build exams for user's grade and one grade below/above
  const grades = [g];
  if(g > 1) grades.unshift(g - 1);
  if(g < 9) grades.push(g + 1);
  
  S.exams = grades.map(gr => {
    const c = GRADE_CONFIG[gr];
    const existing = (S.exams || []).find(e => e.grade === gr);
    return {
      id: `ex_${gr}`,
      title: `Ujian ${c.name}`,
      desc: c.desc,
      grade: gr,
      duration: gr <= 3 ? 60 : gr <= 6 ? 90 : 120,
      questions: 10,
      completed: existing ? existing.completed : false,
      score: existing ? existing.score : 0
    };
  });
}

function setupGradeUnlocks() {
  // Unlock the user's grade and all grades below it
  const newUnlocked = [];
  for(let i = 1; i <= S.userGrade; i++) {
    if(!newUnlocked.includes(i)) newUnlocked.push(i);
  }
  // Merge with any previously unlocked grades (in case they earned higher)
  S.unlocked.forEach(u => { if(!newUnlocked.includes(u)) newUnlocked.push(u); });
  S.unlocked = newUnlocked.sort((a, b) => a - b);
}

// === HOME RENDERING ===
function renderHome() {
  $('headerXP').textContent = S.xp;
  $('heroLevel').textContent = S.level;
  $('heroStreak').textContent = S.streak;
  
  // Calculate general accuracy
  const acc = S.totalQuestions > 0 ? Math.round((S.correctAnswers / S.totalQuestions) * 100) : 0;
  $('heroAccuracy').textContent = `${acc}%`;
  
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

  renderLevelMap('all');
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

function startGame(grade, subLevel, isExam = false, examObj = null) {
  examMode = isExam;
  currentExamObj = examObj;
  
  G = {
    grade,
    subLevel,
    qs: [],
    qi: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    maxStreak: 0,
    start: Date.now(),
    qStart: 0,
    times: [],
    timer: null,
    timeLeft: isExam ? (examObj.duration || 60) : getTimeLimit(grade)
  };
  
  // Generate 10 questions
  const totalQ = isExam ? (examObj.questions || 10) : 10;
  for(let i = 0; i < totalQ; i++) {
    const q = QuestionEngine.generate(grade, subLevel);
    if(q) G.qs.push(q);
  }
  
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
        nextQ(false, 0); // timeout
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

function submitAnswer(ans, btnEl) {
  if(G.answered) return;
  if(!examMode && G.timeLeft <= 0) return;
  G.answered = true;
  // Only stop the per-question timer here; exam mode uses one master
  // countdown across all questions and must keep ticking between answers.
  if(!examMode && G.timer) clearInterval(G.timer);

  const q = G.qs[G.qi];
  const isCorrect = String(ans).trim() === String(q.answer).trim();
  const dur = (Date.now() - G.qStart) / 1000;
  G.times.push(dur);

  // Disable clicks and input to prevent double-submission
  document.querySelectorAll('.ans-btn').forEach(b => b.classList.add('disabled'));
  $('answerInput').disabled = true;
  $('answerSubmit').disabled = true;

  if(isCorrect) {
    G.correct++;
    G.streak++;
    G.maxStreak = Math.max(G.maxStreak, G.streak);
    AudioFX.correct();
    
    // Add score multiplier based on speed
    const baseP = 15;
    const speedBonus = examMode ? 0 : Math.max(0, Math.round((getTimeLimit(G.grade) - dur) * 1.5));
    const scoreEarned = baseP + speedBonus;
    G.score += scoreEarned;
    
    if(btnEl) btnEl.classList.add('correct');
    
    // Combo badge animation
    if(G.streak >= 3) {
      $('streakNum').textContent = G.streak;
      $('streakBadge').classList.add('visible');
    }
    
    showFeedback(true, `+${scoreEarned} Poin!`);
  } else {
    G.wrong++;
    G.streak = 0;
    AudioFX.wrong();
    vibrate(200);
    
    if(btnEl) btnEl.classList.add('wrong');
    $('streakBadge').classList.remove('visible');
    
    showFeedback(false, `Jawaban: ${q.answer}`);
  }
  
  setTimeout(() => {
    hideFeedback();
    nextQ(isCorrect);
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

function endGame() {
  if(G.timer) clearInterval(G.timer);
  
  const duration = Math.round((Date.now() - G.start) / 1000);
  const accuracy = G.qs.length > 0 ? Math.round((G.correct / G.qs.length) * 100) : 0;
  
  // Calculate XP earned
  let xpEarned = G.score + (G.correct * 5);
  if(accuracy === 100) xpEarned += 50; // Bonus perfect
  
  // Update state
  S.xp += xpEarned;
  S.totalGames++;
  S.correctAnswers += G.correct;
  S.totalQuestions += G.qs.length;
  S.maxStreak = Math.max(S.maxStreak, G.maxStreak);
  updateDailyStreak();

  // Check Level Up
  const nextLvlXp = S.level * 1000;
  let levelUp = false;
  if(S.xp >= nextLvlXp) {
    S.level++;
    levelUp = true;
    AudioFX.levelUp();
    showToast('🌟', 'LEVEL UP!', `Kamu sekarang level ${S.level}!`);
  }
  
  // Save game record in history
  const record = {
    date: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
    grade: G.grade,
    subLevel: G.subLevel,
    score: G.score,
    correct: G.correct,
    wrong: G.wrong,
    maxStreak: G.maxStreak,
    duration,
    accuracy,
    isExam: examMode
  };
  S.history.unshift(record);
  
  // Update sublevel stars if not exam
  if(!examMode) {
    if(!S.gp[G.grade]) S.gp[G.grade] = { done: 0, subs: {} };
    const gp = S.gp[G.grade];
    
    // Star evaluation
    let stars = 1;
    if(accuracy === 100) stars = 3;
    else if(accuracy >= 80) stars = 2;
    
    const prevSub = gp.subs[G.subLevel] || {};
    const bestStars = Math.max(prevSub.stars || 0, stars);
    
    gp.subs[G.subLevel] = { done: true, stars: bestStars };
    
    // Evaluate if subLevel completed for first time
    const completedCount = Object.values(gp.subs).filter(s => s.done).length;
    gp.done = completedCount;
    
    // Unlock next grade
    if(completedCount === 5 && G.grade < 9 && !S.unlocked.includes(G.grade + 1)) {
      S.unlocked.push(G.grade + 1);
      showToast('🔓', 'KELAS BARU!', `Kamu berhasil membuka Kelas ${G.grade + 1}!`);
    }
  } else if(currentExamObj) {
    // Exam mode outcome
    const ex = S.exams.find(e => e.id === currentExamObj.id);
    if(ex) {
      ex.completed = true;
      ex.score = Math.max(ex.score, G.score);
    }
  }
  
  checkAchievements();
  save();
  
  // Display result screen
  $('rScore').textContent = G.score;
  $('rCorrect').textContent = `${G.correct}/${G.qs.length}`;
  $('rTime').textContent = `${duration}s`;
  $('rStreak').textContent = G.maxStreak;
  $('rXP').textContent = xpEarned;
  
  // XP Fill bar
  const currentLvlXp = (S.level - 1) * 1000;
  const targetXp = S.level * 1000;
  const pct = Math.min(100, Math.round(((S.xp - currentLvlXp) / (targetXp - currentLvlXp)) * 100));
  $('rXPFill').style.width = `${pct}%`;
  $('rLevel').textContent = S.level;
  
  // Star elements on result
  const starsEl = $('resultStars').querySelectorAll('i');
  starsEl.forEach((star, idx) => {
    star.classList.remove('active');
    let starReq = idx === 0 ? 1 : idx === 1 ? 80 : 100;
    if(accuracy >= starReq) star.classList.add('active');
  });
  
  // Trophy and headers
  if(accuracy === 100) {
    $('resultTrophyIcon').textContent = '🏆';
    $('resultTitle').textContent = 'Luar Biasa!';
    $('resultSub').textContent = 'Sempurna! Kamu jenius matematika!';
    if(typeof confetti === 'function') {
      try { confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } }); } catch(e) { console.warn('Confetti failed:', e); }
    }
  } else if(accuracy >= 70) {
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

// === ACHIEVEMENTS ===
function checkAchievements() {
  ACHIEVEMENTS.forEach(ach => {
    if(!S.achievements[ach.id] && S.history.some(h => ach.cond(S, h))) {
      S.achievements[ach.id] = true;
      showToast('🏆', 'PRESTASI BARU!', ach.n);
    }
  });
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

function renderStats() {
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
  // In real client, we filter by date. Here we simulate records count.
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
  gradient.addColorStop(0, 'rgba(0, 255, 136, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 255, 136, 0)');

  mainChartObj = new Chart(canvasEl, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Skor',
        data: scores,
        borderColor: '#00ff88',
        borderWidth: 2,
        fill: true,
        backgroundColor: gradient,
        tension: 0.4,
        pointBackgroundColor: '#00ff88',
        pointRadius: scores.length > 20 ? 0 : 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#6b6590', font: { size: 9 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b6590', font: { size: 9 } } }
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
          backgroundColor: ['#00ff88', '#ff2d78'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#fff', font: { size: 10 } } } },
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
function renderExams() {
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
function renderProfile() {
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

// === UTILS ===
function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded fired');
  load();
  
  // Custom element helper
  function safeEl(id) {
    const el = document.getElementById(id);
    if(!el) console.warn('Missing element:', id);
    return el;
  }
  
  try { initParticles(); } catch(e) { console.warn('Particles failed:', e); }
  
  // Splash Auto-Transition
  setTimeout(() => {
    try {
      if(S.registered) {
        setupGradeUnlocks();
        showScreen('homeScreen');
        renderHome();
      } else {
        showScreen('onboardingScreen');
      }
    } catch(e) {
      console.error('Init routing failed:', e);
    }
  }, 2200);
  
  // 5-Tab Navigation click events
  document.querySelectorAll('.nav-item[data-screen]').forEach(n => {
    n.addEventListener('click', () => {
      AudioFX.click();
      const sc = n.dataset.screen;
      showScreen(sc);
      if(sc === 'homeScreen') renderHome();
      if(sc === 'analyticsScreen') renderStats();
      if(sc === 'examScreen') renderExams();
      if(sc === 'profileScreen') renderProfile();
    });
  });
  
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
    b.addEventListener('click', () => {
      AudioFX.click();
      const sc = b.dataset.back;
      showScreen(sc);
      if(sc === 'homeScreen') renderHome();
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
    saveBtn.addEventListener('click', () => {
      S.name = (safeEl('modalName')?.value || '').trim();
      const sel = document.querySelector('.avatar-opt.selected');
      if(sel) S.avatar = sel.dataset.avatar;
      save();
      safeEl('profileModal')?.classList.remove('visible');
      renderHome();
    });
  }
  
  document.querySelectorAll('.avatar-opt').forEach(a => {
    a.addEventListener('click', () => {
      document.querySelectorAll('.avatar-opt').forEach(x => x.classList.remove('selected'));
      a.classList.add('selected');
    });
  });
  
  // Quick play & daily challenge triggers
  const qpBtn = safeEl('quickPlayBtn');
  if(qpBtn) qpBtn.addEventListener('click', () => { AudioFX.click(); quickPlay(); });
  
  const dcBtn = safeEl('dailyChallengeBtn');
  if(dcBtn) dcBtn.addEventListener('click', () => { AudioFX.click(); dailyChallenge(); });
  
  const npBtn = safeEl('navPlayBtn');
  if(npBtn) npBtn.addEventListener('click', () => { AudioFX.click(); quickPlay(); });
  
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
  if(homeBtn) homeBtn.addEventListener('click', () => { showScreen('homeScreen'); renderHome(); });
  
  // Settings tab form triggers
  const sName = safeEl('settingName');
  if(sName) {
    sName.addEventListener('change', e => {
      S.name = e.target.value.trim();
      save();
    });
  }
  
  const sSound = safeEl('settingSound');
  if(sSound) {
    sSound.addEventListener('change', e => {
      S.sound = e.target.checked;
      save();
    });
  }
  
  const sVib = safeEl('settingVibrate');
  if(sVib) {
    sVib.addEventListener('change', e => {
      S.vibrate = e.target.checked;
      save();
    });
  }
  
  // Reset localStorage action
  const resetBtn = safeEl('resetDataBtn');
  if(resetBtn) {
    resetBtn.addEventListener('click', () => {
      if(confirm('Yakin ingin mereset semua progress kamu?')) {
        localStorage.removeItem(SK);
        S = defaults();
        save();

        // S.registered is now false, so send the user back through onboarding
        obStep = 1;
        obData = { name: '', avatar: '🧒', birthdate: '', grade: 0 };
        safeEl('obName').value = '';
        safeEl('obBirthdate').value = '';
        safeEl('obAgeDisplay').style.display = 'none';
        document.querySelectorAll('.ob-avatar').forEach(a => a.classList.toggle('selected', a.dataset.avatar === '🧒'));
        document.querySelectorAll('.ob-grade-btn').forEach(b => b.classList.remove('selected', 'suggested'));
        safeEl('obStart').disabled = true;
        setObStep(1);
        showScreen('onboardingScreen');
        showToast('🗑️', 'Data Dihapus', 'Semua progres kamu telah direset.');
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
  
  // === ONBOARDING EVENT LISTENERS ===
  let obStep = 1;
  let obData = { name: '', avatar: '🧒', birthdate: '', grade: 0 };
  
  function setObStep(step) {
    obStep = step;
    document.querySelectorAll('.ob-step').forEach(s => s.classList.toggle('active', parseInt(s.dataset.step) === step));
    document.querySelectorAll('.ob-dot').forEach(d => d.classList.toggle('active', parseInt(d.dataset.dot) === step));
  }
  
  // Avatar selection in onboarding
  document.querySelectorAll('.ob-avatar').forEach(a => {
    a.addEventListener('click', () => {
      document.querySelectorAll('.ob-avatar').forEach(x => x.classList.remove('selected'));
      a.classList.add('selected');
      obData.avatar = a.dataset.avatar;
    });
  });
  
  // Step 1 -> Step 2
  const obNext1 = safeEl('obNext1');
  if(obNext1) {
    obNext1.addEventListener('click', () => {
      const name = safeEl('obName')?.value.trim();
      if(!name) {
        safeEl('obName')?.focus();
        return;
      }
      obData.name = name;
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
  
  // Final: Start button => save registration and go to home
  const obStart = safeEl('obStart');
  if(obStart) {
    obStart.addEventListener('click', () => {
      if(!obData.grade) return;
      AudioFX.click();
      
      // Apply registration data to state
      S.name = obData.name;
      S.avatar = obData.avatar;
      S.birthdate = obData.birthdate;
      S.userGrade = obData.grade;
      S.registered = true;
      
      // Setup grade-based unlocks
      setupGradeUnlocks();
      regenerateExams();
      save();
      
      showScreen('homeScreen');
      renderHome();
      showToast('🎉', 'SELAMAT DATANG!', `Halo ${S.name}! Ayo mulai petualangan matematika!`);
    });
  }
  
  // Settings: Grade change
  const sGrade = safeEl('settingGrade');
  if(sGrade) {
    sGrade.addEventListener('change', e => {
      S.userGrade = parseInt(e.target.value);
      setupGradeUnlocks();
      regenerateExams();
      save();
      renderProfile();
      showToast('🎓', 'KELAS DIUBAH', `Kamu sekarang di ${getGradeLabel(S.userGrade)}`);
    });
  }
  
  // Settings: Birthdate change
  const sBirth = safeEl('settingBirthdate');
  if(sBirth) {
    sBirth.addEventListener('change', e => {
      S.birthdate = e.target.value;
      save();
    });
  }
  
  console.log('All event listeners registered successfully!');
});
