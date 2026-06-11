const NAME_KEY = 'feedingSessionName';
const PASS_KEY = 'feedingSessionPassword';

function getSessionName() { return localStorage.getItem(NAME_KEY); }
function getSessionPassword() { return localStorage.getItem(PASS_KEY); }

if (!getSessionName()) window.location.href = '/';

document.getElementById('session-name-display').textContent = getSessionName();

function logout() {
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(PASS_KEY);
  window.location.href = '/';
}

function sessionHeaders() {
  return { 'x-session-id': getSessionName(), 'x-session-password': getSessionPassword() };
}

// ── Data ──────────────────────────────────────────────────────────────────────

Chart.register(ChartDataLabels);

let allFeedings = [];
let allMarkers = [];
let allTeaspoonSettings = [];
let chart = null;

async function fetchFeedings() {
  const res = await fetch('/api/feedings', { headers: sessionHeaders() });
  if (res.status === 401) { logout(); return []; }
  return await res.json();
}

async function fetchMarkers() {
  const res = await fetch('/api/markers', { headers: sessionHeaders() });
  if (res.status === 401) { logout(); return []; }
  return await res.json();
}

async function fetchTeaspoonSettings() {
  const res = await fetch('/api/teaspoon-settings', { headers: sessionHeaders() });
  if (res.status === 401) { logout(); return []; }
  return await res.json();
}

function getFiltered() {
  const from = document.getElementById('stats-from').value;
  const to   = document.getElementById('stats-to').value;
  const fDT  = f => (f.date + 'T' + f.time).substring(0, 16);
  return allFeedings
    .filter(f => (!from || fDT(f) >= from) && (!to || fDT(f) <= to))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function getFilteredWithMarkers() {
  let data = getFiltered();
  const fromId = document.getElementById('filter-from-marker').value;
  const toId   = document.getElementById('filter-to-marker').value;
  if (fromId) {
    const m = allMarkers.find(m => String(m.id) === fromId);
    if (m) data = data.filter(f => (f.date + f.time) >= (m.date + m.time));
  }
  if (toId) {
    const m = allMarkers.find(m => String(m.id) === toId);
    if (m) data = data.filter(f => (f.date + f.time) <= (m.date + m.time));
  }
  return data;
}

function setAllTime() {
  document.getElementById('stats-from').value = '';
  document.getElementById('stats-to').value = '';
  document.getElementById('filter-from-marker').value = '';
  document.getElementById('filter-to-marker').value = '';
  updateChart();
}

// ── Teaspoon settings UI ─────────────────────────────────────────────────────

async function addTeaspoonSetting() {
  const date     = document.getElementById('teaspoon-date').value;
  const time     = document.getElementById('teaspoon-time').value;
  const teaspoons = document.getElementById('teaspoon-count').value;
  if (!date || !time || teaspoons === '') return;
  const res = await fetch('/api/teaspoon-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify({ date, time, teaspoons: Number(teaspoons) }),
  });
  if (res.status === 401) { logout(); return; }
  document.getElementById('teaspoon-date').value  = '';
  document.getElementById('teaspoon-time').value  = '';
  document.getElementById('teaspoon-count').value = '';
  allTeaspoonSettings = await fetchTeaspoonSettings();
  renderTeaspoonSettingsList();
  updateChart();
}

async function deleteTeaspoonSetting(id) {
  const res = await fetch(`/api/teaspoon-settings/${id}`, { method: 'DELETE', headers: sessionHeaders() });
  if (res.status === 401) { logout(); return; }
  allTeaspoonSettings = await fetchTeaspoonSettings();
  renderTeaspoonSettingsList();
  updateChart();
}

function renderTeaspoonSettingsList() {
  const container = document.getElementById('teaspoon-settings-list');
  if (allTeaspoonSettings.length === 0) {
    container.innerHTML = '<p class="markers-empty">אין הגדרות עדיין.</p>';
    return;
  }
  container.innerHTML = allTeaspoonSettings.map(s => `
    <div class="marker-item">
      <span>${s.date} ${s.time} — ${s.teaspoons} כפיות</span>
      <div style="display:flex;gap:4px">
        <button class="edit-btn" onclick="openEditTeaspoonModal(${s.id})">✎</button>
        <button class="delete-btn" onclick="deleteTeaspoonSetting(${s.id})">✕</button>
      </div>
    </div>
  `).join('');
}

function openEditTeaspoonModal(id) {
  const s = allTeaspoonSettings.find(s => s.id === id);
  if (!s) return;
  document.getElementById('edit-teaspoon-id').value    = s.id;
  document.getElementById('edit-teaspoon-date').value  = s.date;
  document.getElementById('edit-teaspoon-time').value  = s.time;
  document.getElementById('edit-teaspoon-count').value = s.teaspoons;
  document.getElementById('edit-teaspoon-modal').style.display = 'flex';
}

function closeEditTeaspoonModal() {
  document.getElementById('edit-teaspoon-modal').style.display = 'none';
}

async function saveTeaspoonEdit() {
  const id = Number(document.getElementById('edit-teaspoon-id').value);
  const body = {
    date:      document.getElementById('edit-teaspoon-date').value,
    time:      document.getElementById('edit-teaspoon-time').value,
    teaspoons: Number(document.getElementById('edit-teaspoon-count').value),
  };
  if (!body.date || !body.time || isNaN(body.teaspoons)) return;
  const res = await fetch(`/api/teaspoon-settings/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) { logout(); return; }
  closeEditTeaspoonModal();
  allTeaspoonSettings = await fetchTeaspoonSettings();
  renderTeaspoonSettingsList();
  updateChart();
}

document.getElementById('edit-teaspoon-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-teaspoon-modal')) closeEditTeaspoonModal();
});

// ── Markers UI ────────────────────────────────────────────────────────────────

async function addMarker() {
  const date  = document.getElementById('marker-date').value;
  const time  = document.getElementById('marker-time').value;
  const label = document.getElementById('marker-label').value.trim();
  if (!date || !time || !label) return;
  const res = await fetch('/api/markers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify({ date, time, label }),
  });
  if (res.status === 401) { logout(); return; }
  document.getElementById('marker-date').value = '';
  document.getElementById('marker-time').value = '';
  document.getElementById('marker-label').value = '';
  allMarkers = await fetchMarkers();
  renderMarkersList();
  updateMarkerSelects();
  updateChart();
}

async function deleteMarker(id) {
  const res = await fetch(`/api/markers/${id}`, { method: 'DELETE', headers: sessionHeaders() });
  if (res.status === 401) { logout(); return; }
  allMarkers = await fetchMarkers();
  renderMarkersList();
  updateMarkerSelects();
  updateChart();
}

function renderMarkersList() {
  const container = document.getElementById('markers-list');
  if (allMarkers.length === 0) {
    container.innerHTML = '<p class="markers-empty">אין נקודות עניין עדיין.</p>';
    return;
  }
  container.innerHTML = allMarkers.map(m => `
    <div class="marker-item">
      <span>${m.date} ${m.time} — ${m.label}</span>
      <div style="display:flex;gap:4px">
        <button class="edit-btn" onclick="openEditMarkerModal(${m.id})">✎</button>
        <button class="delete-btn" onclick="deleteMarker(${m.id})">✕</button>
      </div>
    </div>
  `).join('');
}

function openEditMarkerModal(id) {
  const m = allMarkers.find(m => m.id === id);
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
  const res = await fetch(`/api/markers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) { logout(); return; }
  closeEditMarkerModal();
  allMarkers = await fetchMarkers();
  renderMarkersList();
  updateMarkerSelects();
  updateChart();
}

document.getElementById('edit-marker-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-marker-modal')) closeEditMarkerModal();
});

function updateMarkerSelects() {
  const fromSel = document.getElementById('filter-from-marker');
  const toSel   = document.getElementById('filter-to-marker');
  const fromVal = fromSel.value;
  const toVal   = toSel.value;
  const opts = '<option value="">ללא</option>' +
    allMarkers.map(m => `<option value="${m.id}">${m.date} ${m.time} — ${m.label}</option>`).join('');
  fromSel.innerHTML = opts;
  toSel.innerHTML   = opts;
  if (allMarkers.some(m => String(m.id) === fromVal)) fromSel.value = fromVal;
  if (allMarkers.some(m => String(m.id) === toVal))   toSel.value   = toVal;
}

// ── Charts ────────────────────────────────────────────────────────────────────

const BLUE   = { bg: 'rgba(91,141,238,0.75)',  border: '#5b8dee' };
const GREEN  = { bg: 'rgba(67,201,138,0.75)',  border: '#43c98a' };
const PURPLE = { bg: 'rgba(140,109,234,0.75)', border: '#8c6dea' };

function formatDate(d) {
  const [y, m, day] = d.split('-');
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function hasTimeFilter() {
  const from = document.getElementById('stats-from').value;
  const to   = document.getElementById('stats-to').value;
  return (from && from.length > 10) || (to && to.length > 10);
}

function dailyLabel(day, feedings) {
  if (!hasTimeFilter()) return formatDate(day);
  const times = feedings.map(f => f.time.substring(0, 5)).sort();
  if (times.length === 0) return formatDate(day);
  const first = times[0], last = times[times.length - 1];
  return `${formatDate(day)} ${first === last ? first : first + '-' + last}`;
}

function getYMax(values, minVal = 180) {
  const dataMax = Math.max(...values, 0);
  return Math.ceil(Math.max(minVal, dataMax + 1) / 10) * 10;
}

function getYMaxCalories(values) {
  const dataMax = Math.max(...values, 0);
  return Math.ceil((dataMax + 1) / 50) * 50;
}

function getTeaspoons(feeding) {
  const fDT = feeding.date + feeding.time;
  const applicable = allTeaspoonSettings
    .filter(s => (s.date + s.time) <= fDT)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  return applicable.length > 0 ? Number(applicable[0].teaspoons) : 0;
}

function calcCalories(feeding) {
  const total = Number(feeding.amount_eaten) + Number(feeding.amount_added);
  const ratio = total > 0 ? Number(feeding.amount_eaten) / total : 0;
  return Number(feeding.amount_eaten) * 0.8 + getTeaspoons(feeding) * 3.8 * ratio;
}

function findNearestLabel(marker, feedingData) {
  if (feedingData.length === 0) return null;
  const mTS = new Date(`${marker.date}T${marker.time}`).getTime();
  let nearest = feedingData[0];
  let minDiff = Infinity;
  for (const f of feedingData) {
    const diff = Math.abs(new Date(`${f.date}T${f.time}`).getTime() - mTS);
    if (diff < minDiff) { minDiff = diff; nearest = f; }
  }
  return `${formatDate(nearest.date)} ${nearest.time}`;
}

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { right: 30, top: 20 } },
  plugins: { legend: { position: 'top' } },
  scales: {
    x: { ticks: { maxRotation: 45, minRotation: 30 } },
    y: {
      min: 0,
      ticks: { stepSize: 10 },
      title: { display: true, text: 'מ"ל' }
    }
  }
};

function buildAnnotations(data) {
  if (!data.length) return {};
  const firstDT = data[0].date + data[0].time;
  const lastDT  = data[data.length - 1].date + data[data.length - 1].time;
  const annotations = {};
  for (const m of allMarkers) {
    const mDT = m.date + m.time;
    if (mDT < firstDT || mDT > lastDT) continue;
    const nearestLabel = findNearestLabel(m, data);
    if (!nearestLabel) continue;
    annotations[`marker_${m.id}`] = {
      type: 'line',
      scaleID: 'x',
      value: nearestLabel,
      borderColor: '#f46a6a',
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        display: true,
        content: m.label,
        position: 'start',
        backgroundColor: 'rgba(244,106,106,0.85)',
        color: '#fff',
        font: { size: 10, weight: 'bold' },
        padding: { x: 6, y: 3 },
        borderRadius: 4,
      }
    };
  }
  return annotations;
}

function updateChart() {
  const noData = document.getElementById('no-data');
  const canvas = document.getElementById('feeding-chart');
  if (chart) { chart.destroy(); chart = null; }

  const type = document.getElementById('graph-type').value;

  // per-feeding uses marker filter + annotations; others use base filter
  const data = type === 'per-feeding' ? getFilteredWithMarkers() : getFiltered();

  if (data.length === 0) {
    noData.style.display = 'block';
    canvas.style.display = 'none';
    return;
  }
  noData.style.display = 'none';
  canvas.style.display = 'block';

  const ctx = canvas.getContext('2d');

  if (type === 'per-feeding') {
    const eatenValues = data.map(f => Number(f.amount_eaten));
    const annotations = buildAnnotations(data);
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(f => `${formatDate(f.date)} ${f.time}`),
        datasets: [{
          label: 'אכל מהבקבוק (מ"ל)',
          data: eatenValues,
          backgroundColor: BLUE.bg,
          borderColor: BLUE.border,
          borderWidth: 2,
          tension: 0,
          pointRadius: 5,
          fill: false,
        }]
      },
      options: {
        ...chartDefaults,
        scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, max: getYMax(eatenValues) } },
        plugins: {
          ...chartDefaults.plugins,
          legend: { display: false },
          title: { display: true, text: 'כמות אכילה' },
          annotation: { annotations },
          datalabels: { display: false },
        }
      }
    });

  } else if (type === 'daily-total') {
    const daily = {};
    const fpd1 = {};
    for (const f of data) {
      daily[f.date] = (daily[f.date] || 0) + Number(f.amount_eaten);
      (fpd1[f.date] = fpd1[f.date] || []).push(f);
    }
    const sortedDays = Object.keys(daily).sort();
    const labels = sortedDays.map(d => dailyLabel(d, fpd1[d] || []));
    const dailyValues = sortedDays.map(d => daily[d]);
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'סה"כ אכל (מ"ל)',
          data: dailyValues,
          backgroundColor: GREEN.bg,
          borderColor: GREEN.border,
          borderWidth: 2,
          tension: 0,
          pointRadius: 5,
          fill: false,
        }]
      },
      options: {
        ...chartDefaults,
        scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, max: getYMax(dailyValues) } },
        plugins: { ...chartDefaults.plugins, legend: { display: false }, title: { display: true, text: 'סה"כ יומי' }, datalabels: { anchor: 'end', align: 'right', offset: 4, font: { size: 10 } } }
      }
    });

  } else if (type === 'daily-calories') {
    const daily = {};
    const fpd2 = {};
    for (const f of data) {
      daily[f.date] = (daily[f.date] || 0) + calcCalories(f);
      (fpd2[f.date] = fpd2[f.date] || []).push(f);
    }
    const sortedDays = Object.keys(daily).sort();
    const labels = sortedDays.map(d => dailyLabel(d, fpd2[d] || []));
    const calValues = sortedDays.map(d => Math.round(daily[d] * 10) / 10);
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'קלוריות',
          data: calValues,
          backgroundColor: PURPLE.bg,
          borderColor: PURPLE.border,
          borderWidth: 2,
          tension: 0,
          pointRadius: 5,
          fill: false,
        }]
      },
      options: {
        ...chartDefaults,
        scales: {
          ...chartDefaults.scales,
          y: {
            min: 0,
            max: getYMaxCalories(calValues),
            ticks: { stepSize: 10 },
            title: { display: true, text: 'קלוריות' }
          }
        },
        plugins: {
          ...chartDefaults.plugins,
          legend: { display: false },
          title: { display: true, text: 'מספר קלוריות יומי' },
          datalabels: { anchor: 'end', align: 'right', offset: 4, font: { size: 10 } },
        }
      }
    });

  } else if (type === 'ate-vs-added') {
    const daily = {};
    const fpd3 = {};
    for (const f of data) {
      if (!daily[f.date]) daily[f.date] = { ate: 0, added: 0 };
      daily[f.date].ate   += Number(f.amount_eaten);
      daily[f.date].added += Number(f.amount_added);
      (fpd3[f.date] = fpd3[f.date] || []).push(f);
    }
    const sortedDates = Object.keys(daily).sort();
    const labels = sortedDates.map(d => dailyLabel(d, fpd3[d] || []));
    const ateAddedValues = sortedDates.flatMap(d => [daily[d].ate, daily[d].added]);
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'אכל (מ"ל)',
            data: sortedDates.map(d => daily[d].ate),
            backgroundColor: BLUE.bg,
            borderColor: BLUE.border,
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'הוספה (מ"ל)',
            data: sortedDates.map(d => daily[d].added),
            backgroundColor: PURPLE.bg,
            borderColor: PURPLE.border,
            borderWidth: 1,
            borderRadius: 4,
          }
        ]
      },
      options: {
        ...chartDefaults,
        scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, max: getYMax(ateAddedValues) } },
        plugins: { ...chartDefaults.plugins, title: { display: true, text: 'אכילה מול הוספה לפי יום' }, datalabels: { anchor: 'end', align: 'right', offset: 4, font: { size: 10 } } }
      }
    });
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('graph-type').addEventListener('change', updateChart);
document.getElementById('stats-from').addEventListener('change', updateChart);
document.getElementById('stats-to').addEventListener('change', updateChart);
document.getElementById('filter-from-marker').addEventListener('change', updateChart);
document.getElementById('filter-to-marker').addEventListener('change', updateChart);

fetchFeedings().then(async data => {
  allFeedings = data;
  [allMarkers, allTeaspoonSettings] = await Promise.all([fetchMarkers(), fetchTeaspoonSettings()]);
  renderMarkersList();
  updateMarkerSelects();
  renderTeaspoonSettingsList();
  updateChart();
});
