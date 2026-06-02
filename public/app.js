// ── Session ───────────────────────────────────────────────────────────────────

const NAME_KEY = 'feedingSessionName';
const PASS_KEY = 'feedingSessionPassword';

function getSessionName() { return localStorage.getItem(NAME_KEY); }
function getSessionPassword() { return localStorage.getItem(PASS_KEY); }

function sessionHeaders() {
  return {
    'x-session-id': getSessionName(),
    'x-session-password': getSessionPassword(),
  };
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    logout();
    return null;
  }
  return res;
}

async function startSession() {
  const name = document.getElementById('session-name').value.trim();
  const password = document.getElementById('session-password').value;
  const errorEl = document.getElementById('session-error');

  errorEl.textContent = '';

  if (!name || !password) {
    errorEl.textContent = 'נא להזין שם וסיסמא.';
    return;
  }

  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  const data = await res.json();

  if (!res.ok) {
    errorEl.textContent = data.error || 'משהו השתבש.';
    return;
  }

  localStorage.setItem(NAME_KEY, name);
  localStorage.setItem(PASS_KEY, password);
  applySession(name);
}

function applySession(name) {
  document.getElementById('session-name-display').textContent = name;
  document.getElementById('session-modal').style.display = 'none';
  document.getElementById('session-bar').style.display = 'flex';
  document.getElementById('date').valueAsDate = new Date();
  loadFeedings();
  loadMarkers();
}

function logout() {
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(PASS_KEY);
  document.getElementById('session-modal').style.display = 'flex';
  document.getElementById('session-bar').style.display = 'none';
  document.querySelector('#feedings-table tbody').innerHTML = '';
  document.querySelector('#markers-table tbody').innerHTML = '';
  document.getElementById('session-name').value = '';
  document.getElementById('session-password').value = '';
  document.getElementById('session-error').textContent = '';
}

function shareLink() {
  navigator.clipboard.writeText(location.origin).then(() => {
    const btn = document.getElementById('share-btn');
    btn.textContent = 'הועתק!';
    setTimeout(() => btn.textContent = 'שתף', 2000);
  });
}

document.getElementById('session-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('session-password').focus(); });
document.getElementById('session-password').addEventListener('keydown', e => { if (e.key === 'Enter') startSession(); });

// ── Markers ───────────────────────────────────────────────────────────────────

let markersData = [];

async function loadMarkers() {
  const res = await apiFetch('/api/markers', { headers: sessionHeaders() });
  if (!res) return;
  markersData = await res.json();
  renderMarkersLog();
}

function renderMarkersLog() {
  const tbody = document.querySelector('#markers-table tbody');
  if (markersData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">אין נקודות עניין עדיין.</td></tr>';
    return;
  }
  tbody.innerHTML = markersData.map(m => `
    <tr>
      <td>${m.date}</td>
      <td>${m.time}</td>
      <td>${m.label}</td>
      <td><button class="edit-btn" onclick="openEditMarkerModal(${m.id})">✎</button></td>
      <td><button class="delete-btn" onclick="deleteMarkerFromLog(${m.id})">✕</button></td>
    </tr>
  `).join('');
}

function openEditMarkerModal(id) {
  const m = markersData.find(m => m.id === id);
  if (!m) return;
  document.getElementById('edit-marker-id').value = m.id;
  document.getElementById('edit-marker-date').value = m.date;
  document.getElementById('edit-marker-time').value = m.time;
  document.getElementById('edit-marker-label').value = m.label;
  document.getElementById('edit-marker-modal').style.display = 'flex';
}

function closeEditMarkerModal() {
  document.getElementById('edit-marker-modal').style.display = 'none';
}

async function saveMarkerEdit() {
  const id = Number(document.getElementById('edit-marker-id').value);
  const body = {
    date:  document.getElementById('edit-marker-date').value,
    time:  document.getElementById('edit-marker-time').value,
    label: document.getElementById('edit-marker-label').value.trim(),
  };
  if (!body.date || !body.time || !body.label) return;
  const res = await apiFetch(`/api/markers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify(body),
  });
  if (!res) return;
  closeEditMarkerModal();
  loadMarkers();
}

async function deleteMarkerFromLog(id) {
  const res = await apiFetch(`/api/markers/${id}`, { method: 'DELETE', headers: sessionHeaders() });
  if (!res) return;
  loadMarkers();
}

document.getElementById('edit-marker-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-marker-modal')) closeEditMarkerModal();
});

// ── Feedings ──────────────────────────────────────────────────────────────────

let feedingsData = [];
let currentPage = 1;
const PAGE_SIZE = 5;

async function loadFeedings() {
  const res = await apiFetch('/api/feedings', { headers: sessionHeaders() });
  if (!res) return;
  feedingsData = await res.json();
  currentPage = 1;
  renderTable();
}

function renderTable() {
  const tbody = document.querySelector('#feedings-table tbody');
  const totalPages = Math.max(1, Math.ceil(feedingsData.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);

  if (feedingsData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">אין רשומות עדיין. הוסף את ההאכלה הראשונה למעלה.</td></tr>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageData = feedingsData.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = pageData.map(f => `
    <tr>
      <td>${f.date}</td>
      <td>${f.time}</td>
      <td><span class="badge badge-ate">${f.amount_eaten} ml</span></td>
      <td><span class="badge badge-added">${f.amount_added} ml</span></td>
      <td class="notes-cell">${f.notes || ''}</td>
      <td><button class="edit-btn" data-id="${f.id}">✎</button></td>
      <td><button class="delete-btn" data-id="${f.id}">✕</button></td>
    </tr>
  `).join('');

  document.getElementById('pagination').innerHTML = totalPages <= 1 ? '' : `
    <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">הקודם</button>
    <span class="page-info">עמוד ${currentPage} מתוך ${totalPages}</span>
    <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">הבא</button>
  `;
}

function goToPage(page) {
  currentPage = page;
  renderTable();
}

function openEditModal(id) {
  const f = feedingsData.find(f => String(f.id) === String(id));
  if (!f) return;
  document.getElementById('edit-id').value = f.id;
  document.getElementById('edit-date').value = f.date;
  document.getElementById('edit-time').value = f.time;
  document.getElementById('edit-amount-eaten').value = f.amount_eaten;
  document.getElementById('edit-amount-added').value = f.amount_added;
  document.getElementById('edit-notes').value = f.notes || '';
  document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
}

async function saveEdit() {
  const id = document.getElementById('edit-id').value;
  const body = {
    date: document.getElementById('edit-date').value,
    time: document.getElementById('edit-time').value,
    amount_eaten: Number(document.getElementById('edit-amount-eaten').value),
    amount_added: Number(document.getElementById('edit-amount-added').value),
    notes: document.getElementById('edit-notes').value.trim() || null,
  };
  const res = await apiFetch(`/api/feedings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify(body),
  });
  if (!res) return;
  closeEditModal();
  loadFeedings();
}

document.getElementById('edit-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-modal')) closeEditModal();
});

document.querySelector('#feedings-table tbody').addEventListener('click', async e => {
  const editBtn = e.target.closest('.edit-btn');
  const deleteBtn = e.target.closest('.delete-btn');

  if (editBtn) {
    openEditModal(editBtn.dataset.id);
  }

  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    const res = await apiFetch(`/api/feedings/${id}`, { method: 'DELETE', headers: sessionHeaders() });
    if (!res) return;
    loadFeedings();
  }
});

function exportData() {
  const from = document.getElementById('export-from').value;
  const to = document.getElementById('export-to').value;
  const params = new URLSearchParams({ session: getSessionName(), password: getSessionPassword() });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  window.open(`/report?${params}`, '_blank');
}

function exportAll() {
  const params = new URLSearchParams({ session: getSessionName(), password: getSessionPassword() });
  window.open(`/report?${params}`, '_blank');
}

document.getElementById('feeding-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    date: document.getElementById('date').value,
    time: document.getElementById('time').value,
    amount_eaten: Number(document.getElementById('amount_eaten').value),
    amount_added: Number(document.getElementById('amount_added').value),
    notes: document.getElementById('notes').value.trim() || null,
  };
  const res = await apiFetch('/api/feedings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify(body),
  });
  if (!res) return;
  e.target.reset();
  document.getElementById('date').valueAsDate = new Date();
  loadFeedings();
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const params = new URLSearchParams(location.search);
  const urlSession = params.get('session');
  const urlPassword = params.get('password');

  if (urlSession && urlPassword) {
    history.replaceState({}, '', '/');
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: urlSession, password: urlPassword }),
    });
    if (res.ok) {
      localStorage.setItem(NAME_KEY, urlSession);
      localStorage.setItem(PASS_KEY, urlPassword);
      applySession(urlSession);
      return;
    }
  }

  const savedName = getSessionName();
  if (savedName) {
    applySession(savedName);
  } else {
    document.getElementById('session-modal').style.display = 'flex';
    document.getElementById('session-bar').style.display = 'none';
  }
}

init();
