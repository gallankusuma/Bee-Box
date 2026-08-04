// escapeHtml() now lives in shared/escapeHtml.js (loaded before this script)
// so it's covered by backend/tests/unit/escapeHtml.test.js.

// === API CLIENT ===
// window.BEE_BOX_API_BASE comes from config.js, loaded before this script -
// swap that file per deployment target instead of editing this one. Review.md P2 item 10.
const API_BASE = window.BEE_BOX_API_BASE;
const TOKEN_KEY = 'mqt_access_token';

// The refresh token itself is never stored here anymore - it lives only in
// the httpOnly cookie the server sets (see backend/src/utils/refreshCookie.js),
// unreadable to any JS (ours or an XSS payload's). Review.md P2 item 12.
function getAccessToken() { return localStorage.getItem(TOKEN_KEY); }
function setAccessToken(access) { localStorage.setItem(TOKEN_KEY, access); }
function clearAccessToken() { localStorage.removeItem(TOKEN_KEY); }

const Api = {
  async request(method, path, body, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAccessToken();
    if(token && !opts.noAuth) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method, headers, credentials: 'include', body: body !== undefined ? JSON.stringify(body) : undefined
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
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}'
      });
      if(!res.ok) return false;
      const data = await res.json();
      setAccessToken(data.accessToken);
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
      <h4>${escapeHtml(c.name)}</h4>
      <span class="class-grade-tag">${GRADE_LABELS[c.grade] || 'Kelas ' + c.grade}</span>
      <div class="class-meta">
        <span><i class="fas fa-user-graduate"></i> ${c.studentCount} siswa</span>
        <span class="code">${escapeHtml(c.joinCode)}</span>
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
      <td><div class="roster-name-cell"><span>${escapeHtml(s.avatar)}</span> ${escapeHtml(s.name)} ${attention ? '⚠️' : ''}</div></td>
      <td>${GRADE_LABELS[s.grade] || s.grade}</td>
      <td>${s.level}</td>
      <td>${s.xp}</td>
      <td>${s.accuracy}%</td>
      <td>${s.totalGames}</td>
      <td>${s.maxStreak}</td>
      <td>${s.lastPlayedDate || '-'}</td>
      <td><button class="roster-remove-btn" title="Keluarkan dari kelas" data-student-id="${escapeHtml(s.studentId)}"><i class="fas fa-user-minus"></i></button></td>
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
let CURRENT_ROLE = null;

// Routes a logged-in session to the right view for its role - ADMIN only
// ever sees the invite screen, TEACHER only ever sees the class dashboard.
async function routeAfterAuth(role) {
  CURRENT_ROLE = role;
  $('authScreen').classList.remove('active');
  $('appShell').style.display = 'block';
  if(role === 'ADMIN') {
    showView('adminView');
  } else {
    await loadDashboard();
  }
}

async function tryRestoreSession() {
  if(!getAccessToken()) return false;
  try {
    const me = await Api.get('/auth/me');
    $('teacherName').textContent = me.user.name;
    return me.user.role;
  } catch(e) {
    clearAccessToken();
    return false;
  }
}

// Revokes the session server-side (not just forgetting the local access
// token) so the refresh cookie can't be used again after logout.
async function logout() {
  try { await Api.post('/auth/logout', {}, { noAuth: true }); } catch(e) { /* best-effort */ }
  clearAccessToken();
  CURRENT_ROLE = null;
  $('appShell').style.display = 'none';
  showView('dashboardView'); // reset for next login
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('authScreen').classList.add('active');
  $('authLoginPanel').classList.add('active');
  $('authRegisterPanel').classList.remove('active');
}

// Registration is invite-only (see routes/invites.js) - the accept-invite
// panel only ever activates when the page is opened with ?invite=<token>,
// there's no manual "go to register" path from the login screen.
async function initInvitePanel() {
  const token = new URLSearchParams(window.location.search).get('invite');
  if(!token) return;

  $('authLoginPanel').classList.remove('active');
  $('authRegisterPanel').classList.add('active');

  try {
    const invite = await Api.get(`/invites/teacher/${encodeURIComponent(token)}`, { noAuth: true });
    $('inviteDesc').textContent = `Kamu diundang sebagai "${invite.name}" untuk ${invite.schoolName}. Buat username dan password untuk mulai.`;
    $('inviteForm').style.display = 'block';
  } catch(e) {
    $('inviteError').textContent = 'Undangan tidak ditemukan atau sudah kedaluwarsa.';
    $('inviteError').style.display = 'block';
    $('inviteDesc').style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const role = await tryRestoreSession();
  if(role) {
    await routeAfterAuth(role);
  } else {
    await initInvitePanel();
  }

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
      if(data.user.role !== 'TEACHER' && data.user.role !== 'ADMIN') throw new Error('Akun ini bukan akun guru atau admin');
      setAccessToken(data.accessToken);
      $('teacherName').textContent = data.user.name;
      await routeAfterAuth(data.user.role);
    } catch(e) {
      errEl.textContent = e.message === 'Akun ini bukan akun guru atau admin' ? e.message : 'Username atau password salah';
      errEl.style.display = 'block';
    } finally {
      $('loginBtn').disabled = false;
    }
  });

  // --- Accept invite (teacher account creation) ---
  $('registerBtn').addEventListener('click', async () => {
    const token = new URLSearchParams(window.location.search).get('invite');
    const username = $('regUsername').value.trim();
    const password = $('regPassword').value;
    const errEl = $('registerError');
    errEl.style.display = 'none';

    if(!username || password.length < 6) {
      errEl.textContent = 'Isi username, dan password minimal 6 karakter';
      errEl.style.display = 'block';
      return;
    }

    $('registerBtn').disabled = true;
    try {
      const data = await Api.post(`/invites/teacher/${encodeURIComponent(token)}/accept`, { username, password }, { noAuth: true });
      setAccessToken(data.accessToken);
      $('teacherName').textContent = data.user.name;
      await routeAfterAuth(data.user.role);
    } catch(e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    } finally {
      $('registerBtn').disabled = false;
    }
  });

  // --- Logout ---
  $('logoutBtn').addEventListener('click', logout);

  // --- Admin: create teacher invite ---
  $('createInviteBtn').addEventListener('click', async () => {
    const name = $('inviteName').value.trim();
    const email = $('inviteEmail').value.trim();
    const errEl = $('inviteCreateError');
    errEl.style.display = 'none';
    if(!name) { errEl.textContent = 'Nama wajib diisi'; errEl.style.display = 'block'; return; }

    $('createInviteBtn').disabled = true;
    try {
      const data = await Api.post('/invites/teacher', { name, email: email || undefined });
      const link = `${window.location.origin}${window.location.pathname}?invite=${data.token}`;
      $('inviteResultLink').value = link;
      $('inviteResultBox').style.display = 'block';
      $('inviteName').value = '';
      $('inviteEmail').value = '';
    } catch(e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    } finally {
      $('createInviteBtn').disabled = false;
    }
  });
  $('copyInviteLinkBtn').addEventListener('click', async () => {
    $('inviteResultLink').select();
    await navigator.clipboard.writeText($('inviteResultLink').value);
    showToast('Link disalin!');
  });

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
