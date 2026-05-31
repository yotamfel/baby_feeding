const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const DATA_FILE = path.join(__dirname, 'feedings.json');

function readData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/feedings', (req, res) => {
  const data = readData().sort((a, b) =>
    (b.date + b.time).localeCompare(a.date + a.time)
  );
  res.json(data);
});

app.post('/api/feedings', (req, res) => {
  const { date, time, amount_eaten, amount_added } = req.body;
  if (!date || !time || amount_eaten == null || amount_added == null) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const data = readData();
  const entry = { id: Date.now(), date, time, amount_eaten, amount_added };
  data.push(entry);
  writeData(data);
  res.json({ id: entry.id });
});

app.delete('/api/feedings/:id', (req, res) => {
  writeData(readData().filter(f => f.id !== Number(req.params.id)));
  res.json({ ok: true });
});

app.get('/report', (req, res) => {
  const { from, to } = req.query;
  let data = readData().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (from) data = data.filter(f => f.date >= from);
  if (to)   data = data.filter(f => f.date <= to);

  const grouped = {};
  for (const f of data) {
    if (!grouped[f.date]) grouped[f.date] = [];
    grouped[f.date].push(f);
  }

  const formatDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const rangeLabel = (from || to)
    ? `${from ? formatDate(from) : '...'} &rarr; ${to ? formatDate(to) : '...'}`
    : 'All Entries';

  const blocks = Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(date => `
    <div class="day-block">
      <h2><span class="date-icon">📅</span> ${formatDate(date)}</h2>
      <table>
        <thead><tr><th>Time</th><th>Ate from bottle</th><th>Added to feeding</th></tr></thead>
        <tbody>
          ${grouped[date].map(f => `
            <tr>
              <td>${f.time}</td>
              <td>${f.amount_eaten} ml</td>
              <td>${f.amount_added} ml</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Feeding Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f5f7fb; color: #2c3e6b; padding: 32px 24px; }
    .report { max-width: 700px; margin: 0 auto; }
    .report-header { text-align: center; margin-bottom: 36px; }
    .report-header h1 { font-size: 2rem; font-weight: 700; color: #2c3e6b; }
    .report-header p { margin-top: 6px; color: #8492a6; font-size: 0.95rem; }
    .day-block { background: #fff; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; box-shadow: 0 2px 10px rgba(44,62,107,0.08); border: 1px solid #e4e9f2; }
    .day-block h2 { font-size: 1.05rem; font-weight: 700; color: #5b8dee; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
    .date-icon { font-size: 1.1rem; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #f0f4ff; }
    th { padding: 10px 14px; text-align: left; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #8492a6; border-bottom: 2px solid #e4e9f2; }
    td { padding: 11px 14px; font-size: 0.92rem; border-bottom: 1px solid #f0f4ff; }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:nth-child(even) { background: #fafbff; }
    .empty { text-align: center; color: #8492a6; padding: 40px; background: #fff; border-radius: 12px; }
    .print-btn { display: block; margin: 8px auto 0; padding: 12px 32px; background: linear-gradient(135deg, #5b8dee, #8c6dea); color: #fff; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; }
    .print-btn:hover { opacity: 0.9; }
    @media print {
      body { background: #fff; padding: 0; }
      .print-btn { display: none; }
      .day-block { box-shadow: none; border: 1px solid #ccc; break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report">
    <div class="report-header">
      <h1>🍼 Baby Feeding Report</h1>
      <p>${rangeLabel}</p>
    </div>
    ${blocks || '<p class="empty">No entries found for this range.</p>'}
    <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
  </div>
</body>
</html>`;

  res.send(html);
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
