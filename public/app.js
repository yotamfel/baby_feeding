async function loadFeedings() {
  const res = await fetch('/api/feedings');
  const feedings = await res.json();
  const tbody = document.querySelector('#feedings-table tbody');
  tbody.innerHTML = feedings.map(f => `
    <tr>
      <td>${f.date}</td>
      <td>${f.time}</td>
      <td>${f.amount_eaten}</td>
      <td>${f.amount_added}</td>
      <td><button class="delete-btn" onclick="deleteFeeding(${f.id})">✕</button></td>
    </tr>
  `).join('');
}

async function deleteFeeding(id) {
  await fetch(`/api/feedings/${id}`, { method: 'DELETE' });
  loadFeedings();
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
  loadFeedings();
});

loadFeedings();
