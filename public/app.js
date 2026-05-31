async function loadFeedings() {
  const res = await fetch('/api/feedings');
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
  await fetch(`/api/feedings/${id}`, { method: 'DELETE' });
  loadFeedings();
}

function exportData() {
  const from = document.getElementById('export-from').value;
  const to = document.getElementById('export-to').value;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  window.location.href = `/api/export?${params}`;
}

function exportAll() {
  window.location.href = '/api/export';
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  e.target.reset();
  document.getElementById('date').valueAsDate = new Date();
  loadFeedings();
});

document.getElementById('date').valueAsDate = new Date();

loadFeedings();
