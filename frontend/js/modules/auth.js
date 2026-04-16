// ── js/modules/auth.js ────────────────────────────────────────────────────────
// Login form submission, session restoration, and role-based UI state.
// ─────────────────────────────────────────────────────────────────────────────
import { state, $, API } from '../state.js';
import { showToast } from './ui/utils.js';
import { switchView } from './ui/navigation.js';
import { fetchStops } from './admin/stops.js';
import { getSocket } from './socket.js';

export function initLogin() {
  const form = $('loginForm');
  if (!form) return;

  // ── Submit ──────────────────────────────────────────────────────────────────
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn  = $('loginSubmitBtn');
    btn.textContent = 'Authenticating...';

    const username = $('loginUser').value;
    const password = $('loginPass').value;

    try {
      const res  = await fetch(`${API}/api/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success) {
        state.role     = data.role;
        state.username = username;

        sessionStorage.setItem('campus_session', JSON.stringify({
          role: data.role, username, token: data.token
        }));

        $('loginOverlay').style.display = 'none';
        $('appWrapper').style.display   = '';

        // Re-authenticate WebSocket with the new token
        const socket = getSocket();
        if (socket) { socket.auth = { token: data.token }; socket.disconnect().connect(); }

        applyRoleState();
        showToast('Login successful', 'success');
      } else {
        showToast(data.message, 'error');
        btn.textContent = 'Access Dashboard';
      }
    } catch {
      showToast('Network error. Is backend running?', 'error');
      btn.textContent = 'Access Dashboard';
    }
  });

  // ── Restore existing session ────────────────────────────────────────────────
  const existing = sessionStorage.getItem('campus_session');
  if (existing) {
    try {
      const sess     = JSON.parse(existing);
      state.role     = sess.role;
      state.username = sess.username;

      $('loginOverlay').style.display = 'none';
      $('appWrapper').style.display   = '';
      applyRoleState();
    } catch { /* corrupt session – ignore */ }
  }
}

// ── Role-based UI ─────────────────────────────────────────────────────────────
export function applyRoleState() {
  const lbl = $('sidebarRoleLabel');
  const bge = $('userRoleBadge');
  if (lbl) lbl.textContent = state.role.toUpperCase();
  if (bge) bge.textContent = state.role.toUpperCase();

  const navDash      = document.querySelector('.nav-item[data-view="dashboard"]');
  const navMap       = $('navMap');
  const navAnalytics = $('navAnalytics');
  const navHistory   = $('navHistory');
  const navDriver    = $('navDriver');
  const navStops     = $('navStops');
  const navUsers     = $('navUsers');

  if (state.role === 'student') {
    // Students: live map only
    [navDash, navAnalytics, navHistory, navDriver].forEach(n => n && (n.style.display = 'none'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (navMap) navMap.classList.add('active');
    switchView('map');

  } else if (state.role === 'driver') {
    // Drivers: only their own route view
    [navDash, navMap, navAnalytics, navHistory].forEach(n => n && (n.style.display = 'none'));
    if (navDriver) {
      navDriver.style.display = 'flex';
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      navDriver.classList.add('active');
    }
    switchView('driver');

  } else if (state.role === 'admin') {
    // Admins: full access including stops + users
    if (navDriver) navDriver.style.display = 'none';
    if (navStops)  navStops.style.display  = 'flex';
    if (navUsers)  navUsers.style.display  = 'flex';
  }

  // Load stops for geofencing (all roles that are authenticated)
  if (state.role) fetchStops();
}
