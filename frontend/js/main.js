// ── js/main.js ────────────────────────────────────────────────────────────────
// Application entry point.
// Imports all modules, wires dependency injections, and boots on DOMContentLoaded.
// ─────────────────────────────────────────────────────────────────────────────

import { state, $ }          from './state.js';

// UI utilities
import { applyTheme, fetchWeather, initSearch, injectInlineStyles } from './modules/ui/utils.js';
import { initNavigation, registerLazyInits }                         from './modules/ui/navigation.js';
import { initSettings }                                               from './modules/ui/settings.js';
import { initCharts }                                                 from './modules/ui/charts.js';
import { initHistoryMap, populateHistoryDropdown }                    from './modules/ui/history.js';

// Core modules
import { initMaps, initMeasureTool, syncDevices, setConnectionStatus } from './modules/map.js';
import { initSocket, injectMapDeps }                                   from './modules/socket.js';

// Role modules
import { initLogin }         from './modules/auth.js';
import { initDriver }        from './modules/driver.js';

// Admin modules
import { initStopsManager }  from './modules/admin/stops.js';
import { fetchUsers, initCreateUserForm } from './modules/admin/users.js';

// ── Wire up dependency injection (break circular imports) ─────────────────────
injectMapDeps({ syncDevices, setConnectionStatus });

// ── Register lazy view initialisers with the navigation module ────────────────
registerLazyInits({ initHistoryMap, populateHistoryDropdown, initCharts, fetchUsers });

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  injectInlineStyles();
  applyTheme(state.theme);

  initMaps();
  initSocket();
  initNavigation();
  initMeasureTool();
  initSettings();
  initSearch();
  initLogin();
  initDriver();
  initStopsManager();
  initCreateUserForm();
  fetchWeather();
});
