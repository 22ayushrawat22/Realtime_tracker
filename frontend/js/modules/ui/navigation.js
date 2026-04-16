// ── js/modules/ui/navigation.js ───────────────────────────────────────────────
// Sidebar navigation, view switching, and responsive collapse logic.
// ─────────────────────────────────────────────────────────────────────────────
import { state, $ } from '../../state.js';

// Lazily-imported initialisers called when a view is first activated
let _initHistoryMap, _populateHistoryDropdown, _initCharts, _fetchUsers;

export function registerLazyInits({ initHistoryMap, populateHistoryDropdown, initCharts, fetchUsers }) {
  _initHistoryMap           = initHistoryMap;
  _populateHistoryDropdown  = populateHistoryDropdown;
  _initCharts               = initCharts;
  _fetchUsers               = fetchUsers;
}

export function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      if (item.dataset.view) switchView(item.dataset.view);
    });
  });

  const sidebar = $('sidebar');
  $('sidebarToggle').addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('mobile-open');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  document.addEventListener('click', e => {
    if (window.innerWidth <= 768 &&
        sidebar.classList.contains('mobile-open') &&
        !sidebar.contains(e.target)) {
      sidebar.classList.remove('mobile-open');
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) sidebar.classList.remove('mobile-open');
  });
}

export function switchView(view) {
  if (!view) return;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = $(`${view}View`);
  if (!target) return;
  target.classList.add('active');

  const titles = {
    dashboard: 'Dashboard',
    map:       'Live Map',
    analytics: 'Analytics',
    settings:  'Settings',
    stops:     'Manage Stops',
    users:     'User Management',
    history:   'History Playback',
    driver:    'Driver Route'
  };
  $('pageTitle').textContent    = titles[view] || view;
  $('pageSubtitle').textContent = view === 'dashboard' ? `Welcome back, ${state.username || 'Admin'}` : '';

  if (view === 'map')       setTimeout(() => state.map.invalidateSize(), 120);
  if (view === 'dashboard') setTimeout(() => state.miniMap.invalidateSize(), 120);
  if (view === 'history')   {
    setTimeout(() => _initHistoryMap && _initHistoryMap(), 120);
    _populateHistoryDropdown && _populateHistoryDropdown();
  }
  if (view === 'analytics') _initCharts && _initCharts();
  if (view === 'users')     _fetchUsers && _fetchUsers();
}
