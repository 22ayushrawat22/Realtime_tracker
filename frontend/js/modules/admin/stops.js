// ── js/modules/admin/stops.js ─────────────────────────────────────────────────
// Admin: Bus stop management – fetch, render geofences, stop picker map,
// create stop form, delete stops, render stops list.
// ─────────────────────────────────────────────────────────────────────────────
import { state, $, API } from '../../state.js';
import { showToast } from '../ui/utils.js';
import { renderGeofences } from '../map.js';

// ── Shared token helper ───────────────────────────────────────────────────────
function getToken() {
  return JSON.parse(sessionStorage.getItem('campus_session') || '{}').token;
}

// ── Fetch and apply stops from API ────────────────────────────────────────────
export async function fetchStops() {
  try {
    if (!getToken()) return;
    const res   = await fetch(`${API}/api/stops`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return;
    const stops = await res.json();

    // Reset to base geofence (campus) then push DB stops
    state.GEOFENCES = [
      { id: 'campus', name: 'SDIET Campus', lat: 28.4237, lng: 77.4052, radius: 500, color: '#10b981' }
    ];
    stops.forEach(s => {
      state.GEOFENCES.push({
        id:        s.id.toString(),
        driver_id: s.driver_id,
        name:      s.name,
        lat:       s.lat,
        lng:       s.lng,
        radius:    s.radius  || 300,
        color:     s.color   || '#3b82f6'
      });
    });

    renderGeofences();
    if (state.role === 'admin') renderStopsList(stops);
  } catch { /* silent */ }
}

// ── Renders the stops table inside the Manage Stops view ─────────────────────
export function renderStopsList(stops) {
  const list = $('stopsList');
  if (!list) return;

  if (!stops.length) {
    list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">No stops defined yet</p>';
    return;
  }

  list.innerHTML = stops.map(s => `
    <div class="stop-item glass" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;margin-bottom:8px;">
      <div style="width:12px;height:12px;border-radius:50%;background:${s.color||'#3b82f6'};flex-shrink:0;"></div>
      <div style="flex:1;">
        <b style="display:block">${s.name}</b>
        <small style="color:var(--text-muted)">Driver: ${s.driver_id} · ${s.lat.toFixed(4)}, ${s.lng.toFixed(4)} · r=${s.radius||300}m</small>
      </div>
      <button onclick="window._deleteStop(${s.id})"
        style="background:rgba(239,68,68,.1);border:none;color:#ef4444;padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:500;font-size:0.85rem;">
        Delete
      </button>
    </div>`).join('');
}

// ── Stop picker map + create form ─────────────────────────────────────────────
let stopPickerMap = null;
let pickedLatLng  = null;

export function initStopsManager() {
  const container = $('stopPickerMap');
  if (!container) return;

  // Lazily init the stop-picker mini map
  if (!stopPickerMap) {
    stopPickerMap = L.map('stopPickerMap', { center: [28.4237, 77.4052], zoom: 12 });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(stopPickerMap);

    let pickerMarker = null;
    stopPickerMap.on('click', e => {
      pickedLatLng = e.latlng;
      const latInput = $('stopLat');
      const lngInput = $('stopLng');
      if (latInput) latInput.value = pickedLatLng.lat.toFixed(6);
      if (lngInput) lngInput.value = pickedLatLng.lng.toFixed(6);
      if (pickerMarker) stopPickerMap.removeLayer(pickerMarker);
      pickerMarker = L.marker(pickedLatLng).addTo(stopPickerMap);
    });
  } else {
    stopPickerMap.invalidateSize();
  }

  // Bind create-stop form
  const form = $('createStopForm');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!pickedLatLng) return showToast('Please click the map to pick a location', 'error');

      const body = {
        driver_id: $('stopDriverId').value.trim(),
        name:      $('stopName').value.trim(),
        lat:       pickedLatLng.lat,
        lng:       pickedLatLng.lng
      };
      if (!body.driver_id || !body.name) return showToast('Fill in all fields', 'error');

      try {
        const res  = await fetch(`${API}/api/stops`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
          body:    JSON.stringify(body)
        });
        const data = await res.json();
        if (res.ok) {
          showToast(`Stop "${body.name}" added!`, 'success');
          form.reset();
          pickedLatLng = null;
          fetchStops();
        } else {
          showToast(data.error || 'Failed to add stop', 'error');
        }
      } catch { showToast('Network error', 'error'); }
    });
  }
}

// ── Delete stop ───────────────────────────────────────────────────────────────
window._deleteStop = async function(id) {
  if (!confirm('Delete this stop?')) return;
  try {
    const res = await fetch(`${API}/api/stops/${id}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.ok) { showToast('Stop deleted', 'success'); fetchStops(); }
    else        showToast('Failed to delete stop', 'error');
  } catch { showToast('Network error', 'error'); }
};
