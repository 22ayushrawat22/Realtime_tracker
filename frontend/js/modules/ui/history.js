// ── js/modules/ui/history.js ──────────────────────────────────────────────────
// Route history playback: map init, device dropdown, data loading,
// frame-by-frame playback with slider and play/pause button.
// ─────────────────────────────────────────────────────────────────────────────
import { state, $, API } from '../../state.js';
import { showToast } from './utils.js';
import { truckIcon } from '../map.js';

export function initHistoryMap() {
  if (state.historyMap) { state.historyMap.invalidateSize(); return; }

  state.historyMap = L.map('historyMap', { center: [22.5, 78.5], zoom: 4 });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(state.historyMap);

  $('loadHistoryBtn').addEventListener('click', loadHistoryData);
  $('playRouteBtn').addEventListener('click', togglePlayback);

  $('routeSlider').addEventListener('input', e => {
    renderFrame(parseInt(e.target.value));
  });
}

export async function populateHistoryDropdown() {
  const sel = $('historyDeviceSelect');
  if (!sel) return;

  const current = sel.value;
  sel.innerHTML = '<option value="">Fetching vehicles from DB...</option>';

  try {
    const sess = JSON.parse(sessionStorage.getItem('campus_session') || '{}');
    const res  = await fetch(`${API}/api/history-devices`, {
      headers: { 'Authorization': `Bearer ${sess.token}` }
    });
    if (!res.ok) throw new Error();
    const data = await res.json();

    sel.innerHTML = '<option value="">Select a vehicle...</option>';
    if (!data.length) {
      sel.innerHTML = '<option value="">No history tracked yet</option>';
      return;
    }
    data.forEach(dev => {
      const opt = document.createElement('option');
      opt.value = dev.id;
      opt.textContent = dev.id;
      sel.appendChild(opt);
    });
    if (current && data.find(d => d.id === current)) sel.value = current;
  } catch {
    sel.innerHTML = '<option value="">Error fetching DB</option>';
  }
}

async function loadHistoryData() {
  const devId = $('historyDeviceSelect').value;
  if (!devId) return showToast('Please select a vehicle first', 'error');

  const btn = $('loadHistoryBtn');
  btn.textContent = 'Loading...';

  try {
    const sess = JSON.parse(sessionStorage.getItem('campus_session') || '{}');
    const res  = await fetch(`${API}/api/history/${devId}`, {
      headers: { 'Authorization': `Bearer ${sess.token}` }
    });
    if (!res.ok) throw new Error('API Error');
    const rows = await res.json();

    if (!rows.length) {
      showToast('No logged history found for this vehicle', 'info');
      $('playbackControls').style.display = 'none';
      btn.textContent = 'Load History';
      return;
    }

    state.historyData = rows;
    setupPlaybackUI();
  } catch {
    showToast('Failed to load history data', 'error');
  }
  btn.textContent = 'Load History';
}

function setupPlaybackUI() {
  $('playbackControls').style.display = 'block';
  $('routeSlider').max   = state.historyData.length - 1;
  $('routeSlider').value = 0;

  const start = new Date(state.historyData[0].logged_at).toLocaleTimeString();
  const end   = new Date(state.historyData[state.historyData.length - 1].logged_at).toLocaleTimeString();
  $('routeStartLabel').textContent = start;
  $('routeEndLabel').textContent   = end;

  if (state.historyPolyline) state.historyMap.removeLayer(state.historyPolyline);
  if (state.historyMarker)   state.historyMap.removeLayer(state.historyMarker);

  const coords = state.historyData.map(r => [r.lat, r.lng]);
  state.historyPolyline = L.polyline(coords, { color: '#ef4444', weight: 4 }).addTo(state.historyMap);
  state.historyMap.fitBounds(state.historyPolyline.getBounds(), { padding: [30, 30] });

  renderFrame(0);
}

function renderFrame(index) {
  if (!state.historyData.length || index >= state.historyData.length) return;
  const pt = state.historyData[index];

  if (!state.historyMarker) {
    state.historyMarker = L.marker([pt.lat, pt.lng], { icon: truckIcon() }).addTo(state.historyMap);
  } else {
    state.historyMarker.setLatLng([pt.lat, pt.lng]);
  }

  state.historyMarker.bindPopup(`
    <b>Historical Snapshot</b><br>
    Speed: ${pt.speed.toFixed(1)} km/h<br>
    Time: ${new Date(pt.logged_at).toLocaleTimeString()}
  `).openPopup();

  $('routeSlider').value = index;
}

function togglePlayback() {
  const btn = $('playRouteBtn');
  const PLAY_SVG  = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  const PAUSE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

  if (state.historyAnimInterval) {
    clearInterval(state.historyAnimInterval);
    state.historyAnimInterval = null;
    btn.innerHTML = PLAY_SVG;
  } else {
    btn.innerHTML = PAUSE_SVG;
    let i = parseInt($('routeSlider').value);
    if (i >= state.historyData.length - 1) i = 0;

    state.historyAnimInterval = setInterval(() => {
      if (i >= state.historyData.length) {
        clearInterval(state.historyAnimInterval);
        state.historyAnimInterval = null;
        btn.innerHTML = PLAY_SVG;
        return;
      }
      renderFrame(i);
      i += 1;
    }, 150);
  }
}
