// ── Session ───────────────────────────────────────────────────────────────────

const SESSION_KEY = 'feedingSessionId';

function getSessionId() {
  return localStorage.getItem(SESSION_KEY);
}

function sessionHeaders() {
  return { 'x-session-id': getSessionId() };
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function applySession(id) {
  localStorage.setItem(SESSION_KEY, id);
  document.getElementById('session-code-display').textContent = id;
  document.getElementById('session-modal').style.display = 'none';
  document.getElementById('session-bar').style.display = 'flex';
  document.getElementById('date').valueAsDate = new Date();
  loadFeedings();
}

function createSession() {
  applySession(generateCode());
}

function joinSession() {
  const code = document.getElementById('session-input').value.trim().toUpperCase();
  if (code.length < 4) {
    document.getElementById('session-input').focus();
    return;
  }
  applySession(code);
}

function copyCode() {
  navigator.clipboard.writeText(getSessionId()).then(() => {
    const btn = document.getElementById('copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy Code', 2000);
  });
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  document.getElementById('session-modal').style.display = 'flex';
  document.getElementById('session-bar').style.display = 'none';
  document.querySelector('#feedings-table tbody').innerHTML = '';
  document.getElementById('session-input').value = '';
}

// Allow pressing Enter in the session input
document.getElementById('session-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') joinSession();
});

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
      <td><button class="delete-btn" onclick="deleteFeeding(${f.id})">✕</button></td>
    </tr>
  `).join('');
}

async function deleteFeeding(id) {
  await fetch(`/api/feedings/${id}`, { method: 'DELETE', headers: sessionHeaders() });
  loadFeedings();
}

function exportData() {
  const from = document.getElementById('export-from').value;
  const to = document.getElementById('export-to').value;
  const params = new URLSearchParams({ session: getSessionId() });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  window.open(`/report?${params}`, '_blank');
}

function exportAll() {
  window.open(`/report?session=${getSessionId()}`, '_blank');
}

document.getElementById('feeding-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    date: document.getElementById('date').value,
    time: document.getElementById('time').value,
    amount_eaten: Number(document.getElementById('amount_eaten').value),
    amount_added: Number(document.getElementById('amount_added').value),
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

const saved = getSessionId();
if (saved) {
  applySession(saved);
} else {
  document.getElementById('session-modal').style.display = 'flex';
  document.getElementById('session-bar').style.display = 'none';
}
