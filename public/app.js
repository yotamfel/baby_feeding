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

async function startSession() {
  const name = document.getElementById('session-name').value.trim();
  const password = document.getElementById('session-password').value;
  const errorEl = document.getElementById('session-error');

  errorEl.textContent = '';

  if (!name || !password) {
    errorEl.textContent = 'Please enter both a name and a password.';
    return;
  }

  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  const data = await res.json();

  if (!res.ok) {
    errorEl.textContent = data.error || 'Something went wrong.';
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
}

function logout() {
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(PASS_KEY);
  document.getElementById('session-modal').style.display = 'flex';
  document.getElementById('session-bar').style.display = 'none';
  document.querySelector('#feedings-table tbody').innerHTML = '';
  document.getElementById('session-name').value = '';
  document.getElementById('session-password').value = '';
  document.getElementById('session-error').textContent = '';
}

function shareLink() {
  navigator.clipboard.writeText(location.origin).then(() => {
    const btn = document.getElementById('share-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Share App', 2000);
  });
}

document.getElementById('session-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('session-password').focus(); });
document.getElementById('session-password').addEventListener('keydown', e => { if (e.key === 'Enter') startSession(); });

// ── Feedings ──────────────────────────────────────────────────────────────────

async function loadFeedings() {
  const res = await fetch('/api/feedings', { headers: sessionHeaders() });
  const feedings = await res.json();
  const tbody = document.querySelector('#feedings-table tbody');
  if (feedings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No entries yet. Add the first feeding above.</td></tr>';
    return;
  }
  tbody.innerHTML = feedings.map(f => `
    <tr>
      <td>${f.date}</td>
      <td>${f.time}</td>
      <td><span class="badge badge-ate">${f.amount_eaten} ml</span></td>
      <td><span class="badge badge-added">${f.amount_added} ml</span></td>
      <td class="notes-cell">${f.notes || ''}</td>
      <td><button class="edit-btn" onclick="openEditModal(${f.id}, '${f.date}', '${f.time}', ${f.amount_eaten}, ${f.amount_added}, ${JSON.stringify(f.notes || '')})">✎</button></td>
      <td><button class="delete-btn" onclick="deleteFeeding(${f.id})">✕</button></td>
    </tr>
  `).join('');
}

function openEditModal(id, date, time, amount_eaten, amount_added, notes) {
  document.getElementById('edit-id').value = id;
  document.getElementById('edit-date').value = date;
  document.getElementById('edit-time').value = time;
  document.getElementById('edit-amount-eaten').value = amount_eaten;
  document.getElementById('edit-amount-added').value = amount_added;
  document.getElementById('edit-notes').value = notes || '';
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
  await fetch(`/api/feedings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify(body),
  });
  closeEditModal();
  loadFeedings();
}

document.getElementById('edit-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-modal')) closeEditModal();
});

async function deleteFeeding(id) {
  await fetch(`/api/feedings/${id}`, { method: 'DELETE', headers: sessionHeaders() });
  loadFeedings();
}

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
  await fetch('/api/feedings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify(body),
  });
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
