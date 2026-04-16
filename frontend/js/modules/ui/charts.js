// ── js/modules/ui/charts.js ───────────────────────────────────────────────────
// Analytics charts – lazily initialised once when the Analytics view is opened.
// ─────────────────────────────────────────────────────────────────────────────
import { state, $, API } from '../../state.js';
import { showToast } from './utils.js';

let chartsInited = false;

export async function initCharts() {
  if (chartsInited) return;
  chartsInited = true;

  let data;
  try {
    const sess = JSON.parse(sessionStorage.getItem('campus_session') || '{}');
    const res  = await fetch(`${API}/api/analytics`, {
      headers: { 'Authorization': `Bearer ${sess.token}` }
    });
    if (!res.ok) throw new Error('Analytics unavailable');
    data = await res.json();
  } catch {
    showToast('Could not load analytics data', 'error');
    return;
  }

  const chartDefaults = {
    responsive: true,
    plugins: {
      legend: {
        labels: { color: getComputedStyle(document.body).getPropertyValue('--text') || '#0f172a' }
      }
    }
  };

  // Distance line chart
  state.charts.distance = new Chart($('distanceChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Distance (km)',
        data: data.distanceByDay,
        borderColor: '#6366f1',
        backgroundColor: '#6366f130',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#6366f1'
      }]
    },
    options: { ...chartDefaults }
  });

  // Active hours bar chart
  state.charts.hours = new Chart($('hoursChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Active Hours',
        data: data.activeHours,
        backgroundColor: '#818cf8',
        borderRadius: 8
      }]
    },
    options: { ...chartDefaults }
  });

  // Region doughnut
  state.charts.region = new Chart($('regionChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: data.regionDistribution.map(r => r.region),
      datasets: [{
        data: data.regionDistribution.map(r => r.count),
        backgroundColor: ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'],
        borderWidth: 2
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'right' } } }
  });
}
