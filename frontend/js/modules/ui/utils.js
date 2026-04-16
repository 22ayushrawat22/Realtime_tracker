// ── js/modules/ui/utils.js ────────────────────────────────────────────────────
// Utility functions: toast notifications, weather widget, search filter,
// inline styles, and theme management.
// ─────────────────────────────────────────────────────────────────────────────
import { state, $, API } from '../../state.js';

// ── Theme ─────────────────────────────────────────────────────────────────────
export function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  const dm   = $('darkModeToggle');
  if (dm) dm.checked = (theme === 'dark');

  const icon = $('themeIcon');
  if (!icon) return;
  if (theme === 'dark') {
    icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  } else {
    icon.innerHTML = `
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
  }
}

// ── Toast notifications ───────────────────────────────────────────────────────
export function showToast(message, type = 'info') {
  const container = $('toastContainer');
  const toast     = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon      = type === 'error' ? '✕' : type === 'success' ? '✓' : 'ℹ';
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateY(12px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Weather ───────────────────────────────────────────────────────────────────
export async function fetchWeather() {
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=28.61&longitude=77.21&current_weather=true');
    if (!res.ok) return;
    const j    = await res.json();
    const temp = j.current_weather?.temperature;
    const code = j.current_weather?.weathercode;
    const desc = weatherDesc(code);
    const tempEl = $('weatherTemp');
    const descEl = $('weatherDesc');
    if (tempEl && temp != null) tempEl.textContent = `${Math.round(temp)}°C`;
    if (descEl && desc)         descEl.textContent = desc;
  } catch { /* non-critical */ }
}

function weatherDesc(code) {
  if (code == null) return '';
  if (code === 0)  return 'Clear sky';
  if (code <= 3)   return 'Partly cloudy';
  if (code <= 67)  return 'Rain / drizzle';
  if (code <= 77)  return 'Snow';
  if (code <= 82)  return 'Showers';
  if (code <= 99)  return 'Thunderstorm';
  return 'Variable';
}

// ── Search / filter ───────────────────────────────────────────────────────────
export function initSearch() {
  const input = $('searchInput');
  if (!input) return;
  input.addEventListener('input', e => filterDevices(e.target.value.toLowerCase().trim()));
}

function filterDevices(query) {
  state.devices.forEach((dev, id) => {
    const marker  = state.markers.get(id);
    const visible = !query || dev.name.toLowerCase().includes(query);
    if (marker) marker.setOpacity(visible ? 1 : 0.2);
  });
  document.querySelectorAll('.fleet-item').forEach(el => {
    const match = !query || el.textContent.toLowerCase().includes(query);
    el.style.display = match ? 'flex' : 'none';
  });
}

// ── Inline CSS injected once ──────────────────────────────────────────────────
export function injectInlineStyles() {
  const s = document.createElement('style');
  s.textContent = `
    .custom-marker { display:flex; align-items:center; justify-content:center; }
    .marker-pin {
      background: #6366f1;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      width: 30px; height: 30px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 3px 10px rgba(99,102,241,.45);
      border: 2px solid white;
    }
    .marker-pin svg { transform: rotate(45deg); }
    .active-btn { background: #6366f1 !important; color: white !important; }
    .toast { transition: opacity .3s ease, transform .3s ease; }
    .toast-success .toast-icon { color: #10b981; }
    .toast-error   .toast-icon { color: #ef4444; }
    .toast-info    .toast-icon { color: #6366f1; }
    .toast-icon { font-weight: 700; font-size: 1.1rem; }
    .fleet-item { cursor: pointer; transition: background .2s; border-radius: 8px; padding: 8px 4px; }
    .fleet-item:hover { background: var(--border); }
  `;
  document.head.appendChild(s);
}
