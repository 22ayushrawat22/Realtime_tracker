// ── js/modules/socket.js ──────────────────────────────────────────────────────
// Socket.IO client – connection, reconnection, and device-update events.
// NOTE: syncDevices is injected via setSyncDevices() to avoid circular imports.
// ─────────────────────────────────────────────────────────────────────────────
import { API } from '../state.js';
import { showToast } from './ui/utils.js';

let socket = null;
let _syncDevices = null;
let _setConnectionStatus = null;

/** Inject dependencies from map.js to break the circular reference */
export function injectMapDeps({ syncDevices, setConnectionStatus }) {
  _syncDevices         = syncDevices;
  _setConnectionStatus = setConnectionStatus;
}

export function getSocket() { return socket; }

export function initSocket() {
  const sess  = sessionStorage.getItem('campus_session');
  const token = sess ? JSON.parse(sess).token : null;

  socket = io(API, { reconnectionAttempts: 5, auth: { token } });

  socket.on('connect', () => {
    _setConnectionStatus && _setConnectionStatus(true);
    showToast('Connected to server', 'success');
  });

  socket.on('disconnect', () => {
    _setConnectionStatus && _setConnectionStatus(false);
    showToast('Disconnected from server', 'error');
  });

  socket.on('devices-update', devices => {
    if (!Array.isArray(devices)) return;
    _syncDevices && _syncDevices(devices);
  });
}
