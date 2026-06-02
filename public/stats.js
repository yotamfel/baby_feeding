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

// ── Data ──────────────────────────────────────────────────────────────────────

let allFeedings = [];
let chart = null;

async function fetchFeedings() {
  const res = await fetch('/api/feedings', {
    headers: {
      'x-session-id': getSessionName(),
      'x-session-password': getSessionPassword(),
    }
  });
  if (res.status === 401) { logout(); return []; }
  return await res.json();
}

function getFiltered() {
  const from = document.getElementById('stats-from').value;
  const to   = document.getElementById('stats-to').value;
  return allFeedings
    .filter(f => (!from || f.date >= from) && (!to || f.date <= to))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function setAllTime() {
  document.getElementById('stats-from').value = '';
  document.getElementById('stats-to').value = '';
  updateChart();
}

// ── Charts ────────────────────────────────────────────────────────────────────

const BLUE   = { bg: 'rgba(91,141,238,0.75)',  border: '#5b8dee' };
const GREEN  = { bg: 'rgba(67,201,138,0.75)',  border: '#43c98a' };
const PURPLE = { bg: 'rgba(140,109,234,0.75)', border: '#8c6dea' };

function formatDate(d) {
  const [y, m, day] = d.split('-');
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getYMax(values) {
  const dataMax = Math.max(...values, 0);
  return Math.ceil(Math.max(180, dataMax) / 10) * 10;
}

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
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

function updateChart() {
  const data = getFiltered();
  const noData = document.getElementById('no-data');
  const canvas = document.getElementById('feeding-chart');

  if (chart) { chart.destroy(); chart = null; }

  if (data.length === 0) {
    noData.style.display = 'block';
    canvas.style.display = 'none';
    return;
  }
  noData.style.display = 'none';
  canvas.style.display = 'block';

  const type = document.getElementById('graph-type').value;
  const ctx = canvas.getContext('2d');

  if (type === 'per-feeding') {
    const eatenValues = data.map(f => Number(f.amount_eaten));
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
        plugins: { ...chartDefaults.plugins, title: { display: true, text: 'כמות אכילה' } }
      }
    });

  } else if (type === 'daily-total') {
    const daily = {};
    for (const f of data) daily[f.date] = (daily[f.date] || 0) + Number(f.amount_eaten);
    const sortedDays = Object.keys(daily).sort();
    const labels = sortedDays.map(formatDate);
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
        plugins: { ...chartDefaults.plugins, title: { display: true, text: 'סה"כ יומי' } }
      }
    });

  } else if (type === 'ate-vs-added') {
    const daily = {};
    for (const f of data) {
      if (!daily[f.date]) daily[f.date] = { ate: 0, added: 0 };
      daily[f.date].ate   += Number(f.amount_eaten);
      daily[f.date].added += Number(f.amount_added);
    }
    const sortedDates = Object.keys(daily).sort();
    const labels = sortedDates.map(formatDate);
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
        plugins: { ...chartDefaults.plugins, title: { display: true, text: 'אכילה מול הוספה לפי יום' } }
      }
    });
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('graph-type').addEventListener('change', updateChart);
document.getElementById('stats-from').addEventListener('change', updateChart);
document.getElementById('stats-to').addEventListener('change', updateChart);

fetchFeedings().then(data => {
  allFeedings = data;
  updateChart();
});
