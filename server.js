const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Storage ──────────────────────────────────────────────────────────────────

const DATA_FILE = path.join(__dirname, 'feedings.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const MARKERS_FILE = path.join(__dirname, 'markers.json');
const TEASPOONS_FILE = path.join(__dirname, 'teaspoons.json');
const CONCENTRATION_FILE = path.join(__dirname, 'concentration.json');
let pg = null;

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}

async function initStorage() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await pg.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        name TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL
      )
    `);
    await pg.query(`
      CREATE TABLE IF NOT EXISTS feedings (
        id BIGINT PRIMARY KEY,
        session_id TEXT NOT NULL DEFAULT 'default',
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        amount_eaten INTEGER NOT NULL,
        amount_added INTEGER NOT NULL,
        notes TEXT
      )
    `);
    await pg.query(`ALTER TABLE feedings ADD COLUMN IF NOT EXISTS session_id TEXT NOT NULL DEFAULT 'default'`);
    await pg.query(`ALTER TABLE feedings ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pg.query(`
      CREATE TABLE IF NOT EXISTS markers (
        id BIGINT PRIMARY KEY,
        session_id TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        label TEXT NOT NULL
      )
    `);
    await pg.query(`
      CREATE TABLE IF NOT EXISTS teaspoon_settings (
        id BIGINT PRIMARY KEY,
        session_id TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        teaspoons REAL NOT NULL
      )
    `);
    await pg.query(`
      CREATE TABLE IF NOT EXISTS concentration_settings (
        id BIGINT PRIMARY KEY,
        session_id TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        concentration REAL NOT NULL
      )
    `);
    console.log('Using PostgreSQL');
  } else {
    console.log('Using local JSON file');
  }
}

// Sessions
async function findSession(name) {
  if (pg) {
    const { rows } = await pg.query('SELECT * FROM sessions WHERE name = $1', [name]);
    return rows[0] || null;
  }
  const sessions = fs.existsSync(SESSIONS_FILE) ? JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')) : [];
  return sessions.find(s => s.name === name) || null;
}

async function createSession(name, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const password_hash = hashPassword(password, salt);
  if (pg) {
    await pg.query('INSERT INTO sessions (name, password_hash, salt) VALUES ($1, $2, $3)', [name, password_hash, salt]);
    return;
  }
  const sessions = fs.existsSync(SESSIONS_FILE) ? JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')) : [];
  sessions.push({ name, password_hash, salt });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

async function checkPassword(name, password) {
  const session = await findSession(name);
  if (!session) return { ok: false, error: 'הסשן לא נמצא' };
  if (hashPassword(password, session.salt) !== session.password_hash) return { ok: false, error: 'סיסמא שגויה' };
  return { ok: true };
}

// Feedings
async function getAll(sessionName) {
  if (pg) {
    const { rows } = await pg.query(
      'SELECT * FROM feedings WHERE session_id = $1 ORDER BY date DESC, time DESC',
      [sessionName]
    );
    return rows;
  }
  const all = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : [];
  return all
    .filter(f => (f.session_id || 'default') === sessionName)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

async function insert(entry) {
  if (pg) {
    await pg.query(
      'INSERT INTO feedings (id, session_id, date, time, amount_eaten, amount_added, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [entry.id, entry.session_id, entry.date, entry.time, entry.amount_eaten, entry.amount_added, entry.notes || null]
    );
    return;
  }
  const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : [];
  data.push(entry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function update(id, sessionName, fields) {
  const { date, time, amount_eaten, amount_added, notes } = fields;
  if (pg) {
    await pg.query(
      'UPDATE feedings SET date=$1, time=$2, amount_eaten=$3, amount_added=$4, notes=$5 WHERE id=$6 AND session_id=$7',
      [date, time, amount_eaten, amount_added, notes || null, id, sessionName]
    );
    return;
  }
  const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : [];
  const idx = data.findIndex(f => f.id === id && (f.session_id || 'default') === sessionName);
  if (idx !== -1) data[idx] = { ...data[idx], date, time, amount_eaten, amount_added, notes: notes || null };
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function remove(id, sessionName) {
  if (pg) {
    await pg.query('DELETE FROM feedings WHERE id = $1 AND session_id = $2', [id, sessionName]);
    return;
  }
  const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : [];
  fs.writeFileSync(DATA_FILE, JSON.stringify(
    data.filter(f => !(f.id === id && (f.session_id || 'default') === sessionName)),
    null, 2
  ));
}

// Markers
async function getAllMarkers(sessionName) {
  if (pg) {
    const { rows } = await pg.query(
      'SELECT * FROM markers WHERE session_id = $1 ORDER BY date ASC, time ASC',
      [sessionName]
    );
    return rows;
  }
  const all = fs.existsSync(MARKERS_FILE) ? JSON.parse(fs.readFileSync(MARKERS_FILE, 'utf8')) : [];
  return all
    .filter(m => m.session_id === sessionName)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

async function insertMarker(marker) {
  if (pg) {
    await pg.query(
      'INSERT INTO markers (id, session_id, date, time, label) VALUES ($1, $2, $3, $4, $5)',
      [marker.id, marker.session_id, marker.date, marker.time, marker.label]
    );
    return;
  }
  const data = fs.existsSync(MARKERS_FILE) ? JSON.parse(fs.readFileSync(MARKERS_FILE, 'utf8')) : [];
  data.push(marker);
  fs.writeFileSync(MARKERS_FILE, JSON.stringify(data, null, 2));
}

async function removeMarker(id, sessionName) {
  if (pg) {
    await pg.query('DELETE FROM markers WHERE id = $1 AND session_id = $2', [id, sessionName]);
    return;
  }
  const data = fs.existsSync(MARKERS_FILE) ? JSON.parse(fs.readFileSync(MARKERS_FILE, 'utf8')) : [];
  fs.writeFileSync(MARKERS_FILE, JSON.stringify(
    data.filter(m => !(m.id === id && m.session_id === sessionName)),
    null, 2
  ));
}

// Teaspoon settings
async function getAllTeaspoonSettings(sessionName) {
  if (pg) {
    const { rows } = await pg.query(
      'SELECT * FROM teaspoon_settings WHERE session_id = $1 ORDER BY date ASC, time ASC',
      [sessionName]
    );
    return rows;
  }
  const all = fs.existsSync(TEASPOONS_FILE) ? JSON.parse(fs.readFileSync(TEASPOONS_FILE, 'utf8')) : [];
  return all
    .filter(s => s.session_id === sessionName)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

async function insertTeaspoonSetting(setting) {
  if (pg) {
    await pg.query(
      'INSERT INTO teaspoon_settings (id, session_id, date, time, teaspoons) VALUES ($1, $2, $3, $4, $5)',
      [setting.id, setting.session_id, setting.date, setting.time, setting.teaspoons]
    );
    return;
  }
  const data = fs.existsSync(TEASPOONS_FILE) ? JSON.parse(fs.readFileSync(TEASPOONS_FILE, 'utf8')) : [];
  data.push(setting);
  fs.writeFileSync(TEASPOONS_FILE, JSON.stringify(data, null, 2));
}

async function removeTeaspoonSetting(id, sessionName) {
  if (pg) {
    await pg.query('DELETE FROM teaspoon_settings WHERE id = $1 AND session_id = $2', [id, sessionName]);
    return;
  }
  const data = fs.existsSync(TEASPOONS_FILE) ? JSON.parse(fs.readFileSync(TEASPOONS_FILE, 'utf8')) : [];
  fs.writeFileSync(TEASPOONS_FILE, JSON.stringify(
    data.filter(s => !(s.id === id && s.session_id === sessionName)),
    null, 2
  ));
}

async function updateTeaspoonSetting(id, sessionName, fields) {
  const { date, time, teaspoons } = fields;
  if (pg) {
    await pg.query(
      'UPDATE teaspoon_settings SET date=$1, time=$2, teaspoons=$3 WHERE id=$4 AND session_id=$5',
      [date, time, teaspoons, id, sessionName]
    );
    return;
  }
  const data = fs.existsSync(TEASPOONS_FILE) ? JSON.parse(fs.readFileSync(TEASPOONS_FILE, 'utf8')) : [];
  const idx = data.findIndex(s => s.id === id && s.session_id === sessionName);
  if (idx !== -1) data[idx] = { ...data[idx], date, time, teaspoons };
  fs.writeFileSync(TEASPOONS_FILE, JSON.stringify(data, null, 2));
}

// Concentration settings
async function getAllConcentrationSettings(sessionName) {
  if (pg) {
    const { rows } = await pg.query(
      'SELECT * FROM concentration_settings WHERE session_id = $1 ORDER BY date ASC, time ASC',
      [sessionName]
    );
    return rows;
  }
  const all = fs.existsSync(CONCENTRATION_FILE) ? JSON.parse(fs.readFileSync(CONCENTRATION_FILE, 'utf8')) : [];
  return all
    .filter(s => s.session_id === sessionName)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

async function insertConcentrationSetting(setting) {
  if (pg) {
    await pg.query(
      'INSERT INTO concentration_settings (id, session_id, date, time, concentration) VALUES ($1, $2, $3, $4, $5)',
      [setting.id, setting.session_id, setting.date, setting.time, setting.concentration]
    );
    return;
  }
  const data = fs.existsSync(CONCENTRATION_FILE) ? JSON.parse(fs.readFileSync(CONCENTRATION_FILE, 'utf8')) : [];
  data.push(setting);
  fs.writeFileSync(CONCENTRATION_FILE, JSON.stringify(data, null, 2));
}

async function removeConcentrationSetting(id, sessionName) {
  if (pg) {
    await pg.query('DELETE FROM concentration_settings WHERE id = $1 AND session_id = $2', [id, sessionName]);
    return;
  }
  const data = fs.existsSync(CONCENTRATION_FILE) ? JSON.parse(fs.readFileSync(CONCENTRATION_FILE, 'utf8')) : [];
  fs.writeFileSync(CONCENTRATION_FILE, JSON.stringify(
    data.filter(s => !(s.id === id && s.session_id === sessionName)),
    null, 2
  ));
}

async function updateConcentrationSetting(id, sessionName, fields) {
  const { date, time, concentration } = fields;
  if (pg) {
    await pg.query(
      'UPDATE concentration_settings SET date=$1, time=$2, concentration=$3 WHERE id=$4 AND session_id=$5',
      [date, time, concentration, id, sessionName]
    );
    return;
  }
  const data = fs.existsSync(CONCENTRATION_FILE) ? JSON.parse(fs.readFileSync(CONCENTRATION_FILE, 'utf8')) : [];
  const idx = data.findIndex(s => s.id === id && s.session_id === sessionName);
  if (idx !== -1) data[idx] = { ...data[idx], date, time, concentration };
  fs.writeFileSync(CONCENTRATION_FILE, JSON.stringify(data, null, 2));
}

async function updateMarker(id, sessionName, fields) {
  const { date, time, label } = fields;
  if (pg) {
    await pg.query(
      'UPDATE markers SET date=$1, time=$2, label=$3 WHERE id=$4 AND session_id=$5',
      [date, time, label, id, sessionName]
    );
    return;
  }
  const data = fs.existsSync(MARKERS_FILE) ? JSON.parse(fs.readFileSync(MARKERS_FILE, 'utf8')) : [];
  const idx = data.findIndex(m => m.id === id && m.session_id === sessionName);
  if (idx !== -1) data[idx] = { ...data[idx], date, time, label };
  fs.writeFileSync(MARKERS_FILE, JSON.stringify(data, null, 2));
}

// ── Auth middleware ───────────────────────────────────────────────────────────

function getCredentials(req) {
  return {
    name: (req.headers['x-session-id'] || req.query.session || '').toString().trim(),
    password: (req.headers['x-session-password'] || req.query.password || '').toString(),
  };
}

async function requireSession(req, res, next) {
  const { name, password } = getCredentials(req);
  if (!name) return res.status(401).json({ error: 'No session' });
  const result = await checkPassword(name, password);
  if (!result.ok) return res.status(401).json({ error: result.error });
  req.sessionName = name;
  next();
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.post('/api/session', async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'שם וסיסמא הם שדות חובה' });
  const trimmedName = name.trim();
  const existing = await findSession(trimmedName);
  if (!existing) {
    await createSession(trimmedName, password);
    return res.json({ ok: true, created: true });
  }
  const result = await checkPassword(trimmedName, password);
  if (!result.ok) return res.status(401).json({ error: 'Wrong password' });
  res.json({ ok: true, created: false });
});

app.get('/api/feedings', requireSession, async (req, res) => {
  res.json(await getAll(req.sessionName));
});

app.post('/api/feedings', requireSession, async (req, res) => {
  const { date, time, amount_eaten, amount_added } = req.body;
  if (!date || !time || amount_eaten == null || amount_added == null) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const { notes } = req.body;
  const entry = { id: Date.now(), session_id: req.sessionName, date, time, amount_eaten, amount_added, notes: notes || null };
  await insert(entry);
  res.json({ id: entry.id });
});

app.delete('/api/feedings/:id', requireSession, async (req, res) => {
  await remove(Number(req.params.id), req.sessionName);
  res.json({ ok: true });
});

app.put('/api/feedings/:id', requireSession, async (req, res) => {
  const { date, time, amount_eaten, amount_added, notes } = req.body;
  if (!date || !time || amount_eaten == null || amount_added == null) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  await update(Number(req.params.id), req.sessionName, { date, time, amount_eaten, amount_added, notes });
  res.json({ ok: true });
});

app.get('/api/teaspoon-settings', requireSession, async (req, res) => {
  res.json(await getAllTeaspoonSettings(req.sessionName));
});

app.post('/api/teaspoon-settings', requireSession, async (req, res) => {
  const { date, time, teaspoons } = req.body;
  if (!date || !time || teaspoons == null) return res.status(400).json({ error: 'כל השדות הם חובה' });
  const setting = { id: Date.now(), session_id: req.sessionName, date, time, teaspoons: Number(teaspoons) };
  await insertTeaspoonSetting(setting);
  res.json({ id: setting.id });
});

app.delete('/api/teaspoon-settings/:id', requireSession, async (req, res) => {
  await removeTeaspoonSetting(Number(req.params.id), req.sessionName);
  res.json({ ok: true });
});

app.put('/api/teaspoon-settings/:id', requireSession, async (req, res) => {
  const { date, time, teaspoons } = req.body;
  if (!date || !time || teaspoons == null) return res.status(400).json({ error: 'כל השדות הם חובה' });
  await updateTeaspoonSetting(Number(req.params.id), req.sessionName, { date, time, teaspoons: Number(teaspoons) });
  res.json({ ok: true });
});

app.get('/api/concentration-settings', requireSession, async (req, res) => {
  res.json(await getAllConcentrationSettings(req.sessionName));
});

app.post('/api/concentration-settings', requireSession, async (req, res) => {
  const { date, time, concentration } = req.body;
  if (!date || !time || concentration == null) return res.status(400).json({ error: 'כל השדות הם חובה' });
  const setting = { id: Date.now(), session_id: req.sessionName, date, time, concentration: Number(concentration) };
  await insertConcentrationSetting(setting);
  res.json({ id: setting.id });
});

app.delete('/api/concentration-settings/:id', requireSession, async (req, res) => {
  await removeConcentrationSetting(Number(req.params.id), req.sessionName);
  res.json({ ok: true });
});

app.put('/api/concentration-settings/:id', requireSession, async (req, res) => {
  const { date, time, concentration } = req.body;
  if (!date || !time || concentration == null) return res.status(400).json({ error: 'כל השדות הם חובה' });
  await updateConcentrationSetting(Number(req.params.id), req.sessionName, { date, time, concentration: Number(concentration) });
  res.json({ ok: true });
});

app.get('/api/markers', requireSession, async (req, res) => {
  res.json(await getAllMarkers(req.sessionName));
});

app.post('/api/markers', requireSession, async (req, res) => {
  const { date, time, label } = req.body;
  if (!date || !time || !label) return res.status(400).json({ error: 'כל השדות הם חובה' });
  const marker = { id: Date.now(), session_id: req.sessionName, date, time, label: label.trim() };
  await insertMarker(marker);
  res.json({ id: marker.id });
});

app.delete('/api/markers/:id', requireSession, async (req, res) => {
  await removeMarker(Number(req.params.id), req.sessionName);
  res.json({ ok: true });
});

app.put('/api/markers/:id', requireSession, async (req, res) => {
  const { date, time, label } = req.body;
  if (!date || !time || !label) return res.status(400).json({ error: 'כל השדות הם חובה' });
  await updateMarker(Number(req.params.id), req.sessionName, { date, time, label: label.trim() });
  res.json({ ok: true });
});

app.get('/report', async (req, res) => {
  const { name, password } = getCredentials(req);
  if (!name) return res.status(401).send('Unauthorized');
  const result = await checkPassword(name, password);
  if (!result.ok) return res.status(401).send('Wrong password');

  const { from, to } = req.query;
  let data = await getAll(name);
  data = data.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (from) data = data.filter(f => f.date >= from);
  if (to)   data = data.filter(f => f.date <= to);

  const grouped = {};
  for (const f of data) {
    if (!grouped[f.date]) grouped[f.date] = [];
    grouped[f.date].push(f);
  }

  const formatDate = d => new Date(d + 'T00:00:00').toLocaleDateString('he-IL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const rangeLabel = (from || to)
    ? `${from ? formatDate(from) : '...'} &larr; ${to ? formatDate(to) : '...'}`
    : 'כל הרשומות';

  const blocks = Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(date => `
    <div class="day-block">
      <h2><span class="date-icon">📅</span> ${formatDate(date)}</h2>
      <table>
        <thead><tr><th>שעה</th><th>אכל מהבקבוק</th><th>הוספה</th></tr></thead>
        <tbody>
          ${grouped[date].sort((a, b) => b.time.localeCompare(a.time)).map(f => `
            <tr>
              <td>${f.time}</td>
              <td>${f.amount_eaten} ml</td>
              <td>${f.amount_added} ml</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>דו"ח האכלת תינוק</title>
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
    th { padding: 10px 14px; text-align: start; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #8492a6; border-bottom: 2px solid #e4e9f2; }
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
      <h1>🍼 דו"ח האכלת תינוק</h1>
      <p>${rangeLabel}</p>
    </div>
    ${blocks || '<p class="empty">לא נמצאו רשומות בטווח זה.</p>'}
    <button class="print-btn" onclick="window.print()">🖨 הדפסה / שמירה כ-PDF</button>
  </div>
</body>
</html>`;

  res.send(html);
});

// ── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

initStorage()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
