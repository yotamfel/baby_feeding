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

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
