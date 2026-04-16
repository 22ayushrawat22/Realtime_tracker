// ── js/state.js ───────────────────────────────────────────────────────────────
// Single source of truth for all runtime state.
// Import this in every module that needs to read or write shared state.
// ─────────────────────────────────────────────────────────────────────────────

export const state = {
  theme:   localStorage.getItem('theme') || 'light',
  map:     null,
  miniMap: null,
  markers:       new Map(),   // deviceId → L.Marker (main map)
  markerCluster: null,
  measuring:     false,
  measurePoints: [],
  measureLine:   null,
  measureMarkers:[],
  devices:       new Map(),   // deviceId → device object
  charts:        {},
  tileLayers:    {},
  activeStyle:   'voyager',
  historyMap:       null,
  historyPolyline:  null,
  historyMarker:    null,
  historyData:      [],
  historyAnimInterval: null,
  role:     null,
  username: null,
  driverTracking: false,
  driverWatch:    null,
  etas:           new Map(),
  geofencedEvents:new Map(),
  GEOFENCES: [
    { id: 'campus', name: 'SDIET Campus', lat: 28.4237, lng: 77.4052, radius: 500, color: '#10b981' }
  ]
};

/** Shorthand DOM accessor: $('someId') */
export const $ = id => document.getElementById(id);

/** Backend base URL – change once here if you move to production */
export const API = 'http://localhost:3000';
