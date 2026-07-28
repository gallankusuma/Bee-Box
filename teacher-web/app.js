// === API CLIENT ===
const API_BASE = 'http://localhost:4000/api';
const TOKEN_KEY = 'mqt_access_token';
const REFRESH_KEY = 'mqt_refresh_token';

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
    if(!res.ok) throw new Error(data.error || `Request gagal (${res.status})`);
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

const $ = id => document.getElementById(id);
const GRADE_LABELS = { 1: 'Kelas 1 SD', 2: 'Kelas 2 SD', 3: 'Kelas 3 SD', 4: 'Kelas 4 SD', 5: 'Kelas 5 SD', 6: 'Kelas 6 SD', 7: 'Kelas 7 SMP', 8: 'Kelas 8 SMP', 9: 'Kelas 9 SMP' };

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 3000);
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(id).classList.add('active');
}

// Generic yes/no confirmation, backed by #confirmModal. Resolves true/false.
function confirmAction(title, msg) {
  return new Promise(resolve => {
    $('confirmTitle').textContent = title;
    $('confirmMsg').textContent = msg;
    $('confirmModal').classList.add('visible');

    const cleanup = () => {
      $('confirmModal').classList.remove('visible');
      $('confirmOk').removeEventListener('click', onOk);
      $('confirmCancel').removeEventListener('click', onCancel);
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    $('confirmOk').addEventListener('click', onOk);
    $('confirmCancel').addEventListener('click', onCancel);
  });
}

let currentClass = null;
let currentRosterSort = 'name';

// === DASHBOARD ===
async function loadDashboard() {
  const data = await Api.get('/classes');

  const totalStudents = data.classes.reduce((sum, c) => sum + c.studentCount, 0);
  const statRow = $('dashboardStatRow');
  if(data.classes.length > 0) {
    statRow.style.display = 'grid';
    statRow.innerHTML = `
      <div class="stat-tile"><div class="val">${data.classes.length}</div><div class="lbl">Total Kelas</div></div>
      <div class="stat-tile"><div class="val">${totalStudents}</div><div class="lbl">Total Siswa</div></div>
    `;
  } else {
    statRow.style.display = 'none';
  }

  const grid = $('classGrid');
  grid.innerHTML = '';
  $('classEmpty').style.display = data.classes.length === 0 ? 'block' : 'none';

  data.classes.forEach(c => {
    const card = document.createElement('div');
    card.className = 'class-card';
    card.innerHTML = `
      <h4>${c.name}</h4>
      <span class="class-grade-tag">${GRADE_LABELS[c.grade] || 'Kelas ' + c.grade}</span>
      <div class="class-meta">
        <span><i class="fas fa-user-graduate"></i> ${c.studentCount} siswa</span>
        <span class="code">${c.joinCode}</span>
      </div>
    `;
    card.addEventListener('click', () => openClass(c.id));
    grid.appendChild(card);
  });

  showView('dashboardView');
}

// === CLASS DETAIL ===
const NEEDS_ATTENTION_THRESHOLD = 50; // accuracy % below this, after playing at least once

async function openClass(classId) {
  const data = await Api.get(`/classes/${classId}`);
  currentClass = data;

  $('classDetailName').textContent = data.name;
  $('classDetailCode').textContent = data.joinCode;

  renderClassStats(data.students);
  renderRoster(classId, data.students);

  showView('classDetailView');
}

function renderClassStats(students) {
  const played = students.filter(s => s.totalGames > 0);
  const avgAccuracy = played.length ? Math.round(played.reduce((sum, s) => sum + s.accuracy, 0) / played.length) : 0;
  const avgXp = students.length ? Math.round(students.reduce((sum, s) => sum + s.xp, 0) / students.length) : 0;
  const totalGames = students.reduce((sum, s) => sum + s.totalGames, 0);
  const needsAttention = played.filter(s => s.accuracy < NEEDS_ATTENTION_THRESHOLD).length;

  $('classStatRow').innerHTML = `
    <div class="stat-tile"><div class="val">${students.length}</div><div class="lbl">Siswa</div></div>
    <div class="stat-tile"><div class="val">${avgAccuracy}%</div><div class="lbl">Rata-rata Akurasi</div></div>
    <div class="stat-tile"><div class="val">${avgXp}</div><div class="lbl">Rata-rata XP</div></div>
    <div class="stat-tile"><div class="val">${totalGames}</div><div class="lbl">Total Games</div></div>
    <div class="stat-tile ${needsAttention > 0 ? 'warn' : ''}"><div class="val">${needsAttention}</div><div class="lbl">Butuh Perhatian</div></div>
  `;
}

function sortStudents(students, sortKey) {
  const sorted = [...students];
  if(sortKey === 'xp') sorted.sort((a, b) => b.xp - a.xp);
  else if(sortKey === 'accuracy') sorted.sort((a, b) => b.accuracy - a.accuracy);
  else if(sortKey === 'lastPlayed') sorted.sort((a, b) => (b.lastPlayedDate || '').localeCompare(a.lastPlayedDate || ''));
  else sorted.sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}

function renderRoster(classId, students) {
  const sorted = sortStudents(students, currentRosterSort);
  const body = $('rosterBody');
  body.innerHTML = '';
  $('rosterEmpty').style.display = students.length === 0 ? 'block' : 'none';

  sorted.forEach((s, i) => {
    const tr = document.createElement('tr');
    const attention = s.totalGames > 0 && s.accuracy < NEEDS_ATTENTION_THRESHOLD;
    tr.innerHTML = `
      <td class="roster-rank">${i + 1}</td>
      <td><div class="roster-name-cell"><span>${s.avatar}</span> ${s.name} ${attention ? '⚠️' : ''}</div></td>
      <td>${GRADE_LABELS[s.grade] || s.grade}</td>
      <td>${s.level}</td>
      <td>${s.xp}</td>
      <td>${s.accuracy}%</td>
      <td>${s.totalGames}</td>
      <td>${s.maxStreak}</td>
      <td>${s.lastPlayedDate || '-'}</td>
      <td><button class="roster-remove-btn" title="Keluarkan dari kelas" data-student-id="${s.studentId}"><i class="fas fa-user-minus"></i></button></td>
    `;
    tr.querySelector('.roster-name-cell').addEventListener('click', () => openStudent(classId, s.studentId));
    tr.querySelector('.roster-remove-btn').addEventListener('click', async e => {
      e.stopPropagation();
      const ok = await confirmAction('Keluarkan Siswa', `Keluarkan ${s.name} dari kelas ini? Data permainan siswa tidak akan terhapus.`);
      if(!ok) return;
      try {
        await Api.delete(`/classes/${classId}/students/${s.studentId}`);
        showToast(`${s.name} dikeluarkan dari kelas`);
        await openClass(classId);
      } catch(err) {
        showToast(err.message);
      }
    });
    body.appendChild(tr);
  });
}

// === STUDENT DETAIL ===
async function openStudent(classId, studentId) {
  const s = await Api.get(`/classes/${classId}/students/${studentId}`);

  $('studentDetailAvatar').textContent = s.avatar;
  $('studentDetailName').textContent = s.name;
  $('studentDetailMeta').textContent = `${GRADE_LABELS[s.grade] || s.grade} • Level ${s.level}`;

  $('studentStatRow').innerHTML = `
    <div class="stat-tile"><div class="val">${s.xp}</div><div class="lbl">XP</div></div>
    <div class="stat-tile"><div class="val">${s.accuracy}%</div><div class="lbl">Akurasi</div></div>
    <div class="stat-tile"><div class="val">${s.totalGames}</div><div class="lbl">Games</div></div>
    <div class="stat-tile"><div class="val">${s.maxStreak}</div><div class="lbl">Max Combo</div></div>
    <div class="stat-tile"><div class="val">${s.streak}</div><div class="lbl">Streak Harian</div></div>
    <div class="stat-tile"><div class="val">${s.achievementsUnlocked}</div><div class="lbl">Prestasi</div></div>
  `;

  const body = $('studentHistoryBody');
  body.innerHTML = '';
  $('studentHistoryEmpty').style.display = s.history.length === 0 ? 'block' : 'none';

  s.history.forEach(h => {
    const tr = document.createElement('tr');
    const date = h.date ? new Date(h.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '-';
    tr.innerHTML = `
      <td>${date}</td>
      <td>${GRADE_LABELS[h.grade] || h.grade}</td>
      <td>${h.score}</td>
      <td>${h.correct}</td>
      <td>${h.accuracy}%</td>
      <td>${h.duration}s</td>
      <td>${h.isExam ? 'Ujian' : 'Latihan'}</td>
    `;
    body.appendChild(tr);
  });

  showView('studentDetailView');
}

// === BOOTSTRAP ===
async function tryRestoreSession() {
  if(!getAccessToken()) return false;
  try {
    const me = await Api.get('/auth/me');
    $('teacherName').textContent = me.user.name;
    return true;
  } catch(e) {
    clearTokens();
    return false;
  }
}

function logout() {
  clearTokens();
  $('appShell').style.display = 'none';
  showView('dashboardView'); // reset for next login
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('authScreen').classList.add('active');
  $('authLoginPanel').classList.add('active');
  $('authRegisterPanel').classList.remove('active');
}

document.addEventListener('DOMContentLoaded', async () => {
  const restored = await tryRestoreSession();
  if(restored) {
    $('authScreen').classList.remove('active');
    $('appShell').style.display = 'block';
    await loadDashboard();
  }

  // --- Auth panel switching ---
  $('gotoRegister').addEventListener('click', e => {
    e.preventDefault();
    $('authLoginPanel').classList.remove('active');
    $('authRegisterPanel').classList.add('active');
  });
  $('gotoLogin').addEventListener('click', e => {
    e.preventDefault();
    $('authRegisterPanel').classList.remove('active');
    $('authLoginPanel').classList.add('active');
  });

  // --- Login ---
  $('loginBtn').addEventListener('click', async () => {
    const username = $('loginUsername').value.trim();
    const password = $('loginPassword').value;
    const errEl = $('loginError');
    errEl.style.display = 'none';
    if(!username || !password) { errEl.textContent = 'Username dan password wajib diisi'; errEl.style.display = 'block'; return; }

    $('loginBtn').disabled = true;
    try {
      const data = await Api.post('/auth/login', { username, password }, { noAuth: true });
      if(data.user.role !== 'TEACHER') throw new Error('Akun ini bukan akun guru');
      setTokens(data.accessToken, data.refreshToken);
      $('teacherName').textContent = data.user.name;
      $('authScreen').classList.remove('active');
      $('appShell').style.display = 'block';
      await loadDashboard();
    } catch(e) {
      errEl.textContent = e.message === 'Akun ini bukan akun guru' ? e.message : 'Username atau password salah';
      errEl.style.display = 'block';
    } finally {
      $('loginBtn').disabled = false;
    }
  });

  // --- Register ---
  $('registerBtn').addEventListener('click', async () => {
    const name = $('regName').value.trim();
    const username = $('regUsername').value.trim();
    const password = $('regPassword').value;
    const errEl = $('registerError');
    errEl.style.display = 'none';

    if(!name || !username || password.length < 6) {
      errEl.textContent = 'Isi nama, username, dan password minimal 6 karakter';
      errEl.style.display = 'block';
      return;
    }

    $('registerBtn').disabled = true;
    try {
      const data = await Api.post('/auth/register', { name, username, password, role: 'TEACHER' }, { noAuth: true });
      setTokens(data.accessToken, data.refreshToken);
      $('teacherName').textContent = data.user.name;
      $('authScreen').classList.remove('active');
      $('appShell').style.display = 'block';
      await loadDashboard();
    } catch(e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    } finally {
      $('registerBtn').disabled = false;
    }
  });

  // --- Logout ---
  $('logoutBtn').addEventListener('click', logout);

  // --- Navigation ---
  $('backToDashboard').addEventListener('click', loadDashboard);
  $('backToClass').addEventListener('click', () => currentClass && openClass(currentClass.id));

  // --- New class modal ---
  $('newClassBtn').addEventListener('click', () => {
    $('newClassName').value = '';
    $('newClassError').style.display = 'none';
    $('newClassModal').classList.add('visible');
  });
  $('newClassCancel').addEventListener('click', () => $('newClassModal').classList.remove('visible'));
  $('newClassSubmit').addEventListener('click', async () => {
    const name = $('newClassName').value.trim();
    const grade = parseInt($('newClassGrade').value, 10);
    const errEl = $('newClassError');
    errEl.style.display = 'none';
    if(!name) { errEl.textContent = 'Nama kelas wajib diisi'; errEl.style.display = 'block'; return; }

    $('newClassSubmit').disabled = true;
    try {
      await Api.post('/classes', { name, grade });
      $('newClassModal').classList.remove('visible');
      showToast('Kelas berhasil dibuat!');
      await loadDashboard();
    } catch(e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    } finally {
      $('newClassSubmit').disabled = false;
    }
  });

  // --- Roster sorting ---
  $('rosterSort').addEventListener('change', e => {
    currentRosterSort = e.target.value;
    if(currentClass) renderRoster(currentClass.id, currentClass.students);
  });

  // --- Edit class modal ---
  $('editClassBtn').addEventListener('click', () => {
    if(!currentClass) return;
    $('editClassName').value = currentClass.name;
    $('editClassGrade').value = currentClass.grade;
    $('editClassError').style.display = 'none';
    $('editClassModal').classList.add('visible');
  });
  $('editClassCancel').addEventListener('click', () => $('editClassModal').classList.remove('visible'));
  $('editClassSubmit').addEventListener('click', async () => {
    const name = $('editClassName').value.trim();
    const grade = parseInt($('editClassGrade').value, 10);
    const errEl = $('editClassError');
    errEl.style.display = 'none';
    if(!name) { errEl.textContent = 'Nama kelas wajib diisi'; errEl.style.display = 'block'; return; }

    $('editClassSubmit').disabled = true;
    try {
      await Api.patch(`/classes/${currentClass.id}`, { name, grade });
      $('editClassModal').classList.remove('visible');
      showToast('Kelas berhasil diperbarui!');
      await openClass(currentClass.id);
    } catch(e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    } finally {
      $('editClassSubmit').disabled = false;
    }
  });

  // --- Delete class ---
  $('deleteClassBtn').addEventListener('click', async () => {
    if(!currentClass) return;
    const ok = await confirmAction('Hapus Kelas', `Hapus kelas "${currentClass.name}"? Semua siswa akan keluar dari kelas ini, tapi data permainan mereka tetap aman.`);
    if(!ok) return;
    try {
      await Api.delete(`/classes/${currentClass.id}`);
      showToast('Kelas berhasil dihapus');
      await loadDashboard();
    } catch(e) {
      showToast(e.message);
    }
  });
});
