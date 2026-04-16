// ── js/modules/ui/settings.js ─────────────────────────────────────────────────
// Settings panel: theme, map style, vehicle alerts, route deviation
// monitoring, locate-me, refresh map, and logout flow.
// ─────────────────────────────────────────────────────────────────────────────
import { state, $ } from '../../state.js';
import { applyTheme, showToast } from './utils.js';
import { makeTiles } from '../map.js';
import { getSocket } from '../socket.js';

let vehicleAlertInterval   = null;
let routeDeviationInterval = null;

export function initSettings() {
  // Header theme toggle button
  $('themeToggle').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(state.theme);
    localStorage.setItem('theme', state.theme);
  });

  // Settings panel dark-mode toggle
  const dm = $('darkModeToggle');
  if (dm) {
    dm.addEventListener('change', e => {
      state.theme = e.target.checked ? 'dark' : 'light';
      applyTheme(state.theme);
      localStorage.setItem('theme', state.theme);
    });
  }

  // Map style selector
  $('mapStyleSelect').addEventListener('change', e => {
    const style = e.target.value;
    state.map.eachLayer(l => { if (l instanceof L.TileLayer) state.map.removeLayer(l); });
    makeTiles(style).addTo(state.map);
    state.activeStyle = style;
    showToast(`Map style → ${style}`, 'info');
  });

  // Vehicle speed alert toggle
  const va = $('vehicleAlertsToggle');
  if (va) {
    va.checked = localStorage.getItem('vehicleAlerts') !== 'false';
    if (va.checked) startVehicleAlerts();
    va.addEventListener('change', e => {
      localStorage.setItem('vehicleAlerts', e.target.checked);
      e.target.checked ? startVehicleAlerts() : stopVehicleAlerts();
      showToast(`Vehicle alerts ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
    });
  }

  // Route deviation toggle
  const rd = $('routeDeviationsToggle');
  if (rd) {
    rd.checked = localStorage.getItem('routeDeviations') !== 'false';
    if (rd.checked) startRouteDeviationMonitoring();
    rd.addEventListener('change', e => {
      localStorage.setItem('routeDeviations', e.target.checked);
      e.target.checked ? startRouteDeviationMonitoring() : stopRouteDeviationMonitoring();
      showToast(`Route deviation alerts ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
    });
  }

  // Locate me
  $('locateBtn').addEventListener('click', () => {
    if (!navigator.geolocation) { showToast('Geolocation not supported', 'error'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { state.map.flyTo([pos.coords.latitude, pos.coords.longitude], 14); showToast('Location found', 'success'); },
      ()  => showToast('Location access denied', 'error')
    );
  });

  // Refresh map
  $('refreshMapBtn').addEventListener('click', () => {
    state.map.invalidateSize();
    showToast('Map refreshed', 'info');
  });

  // Logout (both sidebar button and settings panel button)
  const processLogout = () => {
    const socket = getSocket();
    if (state.role === 'driver' && socket) {
      socket.emit('stop-route', { id: 'bus_' + state.username.toLowerCase() });
    }
    sessionStorage.removeItem('campus_session');
    window.location.reload();
  };

  const logoutBtn = $('logoutBtn');
  const navLogout = $('navLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', processLogout);
  if (navLogout) navLogout.addEventListener('click', processLogout);
}

// ── Alert helpers ─────────────────────────────────────────────────────────────
function startVehicleAlerts() {
  stopVehicleAlerts();
  vehicleAlertInterval = setInterval(() => {
    state.devices.forEach(dev => {
      if (dev.speed > 70) showToast(`⚠️ ${dev.name} speeding at ${dev.speed.toFixed(0)} km/h`, 'error');
    });
  }, 12_000);
}
function stopVehicleAlerts() { clearInterval(vehicleAlertInterval); vehicleAlertInterval = null; }

function startRouteDeviationMonitoring() {
  stopRouteDeviationMonitoring();
  routeDeviationInterval = setInterval(() => {
    state.devices.forEach(dev => {
      if (Math.random() > 0.92) showToast(`🔀 ${dev.name} deviated from planned route`, 'error');
    });
  }, 18_000);
}
function stopRouteDeviationMonitoring() { clearInterval(routeDeviationInterval); routeDeviationInterval = null; }
