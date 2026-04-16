// ── js/modules/driver.js ──────────────────────────────────────────────────────
// Driver-specific logic: GPS tracking lifecycle, Start/Stop route button,
// and emitting position updates via Socket.IO.
// ─────────────────────────────────────────────────────────────────────────────
import { state, $ } from '../state.js';
import { showToast } from './ui/utils.js';
import { getSocket } from './socket.js';

/** Wire up the driver Start/Stop Route button. Call once on DOMContentLoaded. */
export function initDriver() {
  const driverBtn = $('toggleDriverTrackingBtn');
  if (!driverBtn) return;

  driverBtn.addEventListener('click', () => {
    if (state.driverTracking) {
      stopRoute(driverBtn);
    } else {
      startRoute(driverBtn);
    }
  });
}

function stopRoute(btn) {
  state.driverTracking = false;
  btn.style.background = 'var(--primary)';
  btn.textContent      = 'Start Route';
  $('driverStatusText').textContent = 'Status: Offline';

  if (state.driverWatch) {
    clearInterval(state.driverWatch);
    state.driverWatch = null;
  }
  const socket = getSocket();
  if (socket) socket.emit('stop-route', { id: 'bus_' + state.username.toLowerCase() });
}

function startRoute(btn) {
  if (!navigator.geolocation) return showToast('GPS not supported', 'error');

  state.driverTracking = true;
  btn.style.background = '#10b981';
  btn.textContent      = 'Stop Route';
  $('driverStatusText').textContent = 'Status: Transmitting Live GPS...';

  const UPDATE_DELAY_MS = 5000; // configurable: 5 s between pings

  const pingLocation = () => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const socket = getSocket();
        if (socket) {
          socket.emit('register-device', {
            id:        'bus_' + state.username.toLowerCase(),
            name:      'Bus ' + state.username.toUpperCase(),
            latitude:  pos.coords.latitude,
            longitude: pos.coords.longitude,
            speed:     (pos.coords.speed || 0) * 3.6
          });
        }
      },
      err => console.warn('Location ping issue:', err.message),
      { enableHighAccuracy: true }
    );
  };

  pingLocation();                                        // first ping immediately
  state.driverWatch = setInterval(pingLocation, UPDATE_DELAY_MS);
}
