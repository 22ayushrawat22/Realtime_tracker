// ═══════════════════════════════════════════════════════════════════════════
//  RouteMaster – Frontend Script
// ═══════════════════════════════════════════════════════════════════════════

// ── Global State ─────────────────────────────────────────────────────────────
const state = {
  theme: localStorage.getItem('theme') || 'light',
  map: null,
  miniMap: null,
  markers: new Map(),       // id → L.Marker (main map)
  markerCluster: null,
  measuring: false,
  measurePoints: [],
  measureLine: null,
  measureMarkers: [],
  devices: new Map(),       // id → device object
  charts: {},
  tileLayers: {},
  activeStyle: 'voyager',
  historyMap: null,
  historyPolyline: null,
  historyMarker: null,
  historyData: [],
  historyAnimInterval: null,
  role: null,
  username: null,
  driverTracking: false,
  driverWatch: null
};

// ── DOM Refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  initLogin();
  initMaps();
  initSocket();
  initNavigation();
  initMeasureTool();
  initSettings();
  initSearch();
  fetchWeather();
});

// ═══════════════════════════════════════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════════════════════════════════════
function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  const dm = $('darkModeToggle');
  if (dm) dm.checked = (theme === 'dark');

  // Swap SVG sun/moon icon
  const icon = $('themeIcon');
  if (!icon) return;
  if (theme === 'dark') {
    icon.innerHTML = `
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
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

// ═══════════════════════════════════════════════════════════════════════════
//  MAPS
// ═══════════════════════════════════════════════════════════════════════════
function makeTiles(style) {
  const urls = {
    voyager:   'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    streets:   'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  };
  const attr = {
    voyager:   '© CartoDB',
    streets:   '© OpenStreetMap contributors',
    satellite: '© Esri'
  };
  return L.tileLayer(urls[style] || urls.voyager, { attribution: attr[style] });
}

function initMaps() {
  // ── Main map ──
  state.map = L.map('map', {
    center: [22.5, 78.5],
    zoom: 5,
    zoomControl: true,
    preferCanvas: true
  });

  state.tileLayers.voyager   = makeTiles('voyager');
  state.tileLayers.streets   = makeTiles('streets');
  state.tileLayers.satellite = makeTiles('satellite');
  state.tileLayers.voyager.addTo(state.map);

  // Marker cluster group
  state.markerCluster = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    maxClusterRadius: 40
  });
  state.map.addLayer(state.markerCluster);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(state.map);

  // ── Mini map ──
  state.miniMap = L.map('miniMap', {
    center: [22.5, 78.5],
    zoom: 4,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false
  });
  makeTiles('voyager').addTo(state.miniMap);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SOCKET.IO
// ═══════════════════════════════════════════════════════════════════════════
let socket;

function initSocket() {
  socket = io('http://localhost:3000', { reconnectionAttempts: 5 });

  socket.on('connect', () => {
    setConnectionStatus(true);
    showToast('Connected to server', 'success');
  });

  socket.on('disconnect', () => {
    setConnectionStatus(false);
    showToast('Disconnected from server', 'error');
  });

  socket.on('devices-update', devices => {
    if (!Array.isArray(devices)) return;
    syncDevices(devices);
  });
  // Demo mode removed
}

function setConnectionStatus(online) {
  const badge = $('connectionBadge');
  const text  = $('connectionText');
  if (!badge || !text) return;
  const dot = badge.querySelector('.pulse-dot');
  if (dot) dot.style.background = online ? '' : '#ef4444';
  text.textContent = online ? 'Live' : 'Offline';
  const srv = $('serverStatus');
  if (srv) { srv.textContent = online ? 'Online' : 'Offline'; srv.style.color = online ? '#10b981' : '#ef4444'; }
}

// ── Device rendering ──────────────────────────────────────────────────────────
function truckIcon() {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div class="marker-pin">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
           fill="none" stroke="white" stroke-width="2">
        <rect x="1" y="3" width="15" height="13"/>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });
}

function syncDevices(list) {
  state.devices.clear();
  state.markerCluster.clearLayers();
  state.markers.clear();

  list.forEach(dev => {
    if (dev.lat == null || dev.lng == null) return;
    state.devices.set(dev.id, dev);

    const marker = L.marker([dev.lat, dev.lng], { icon: truckIcon() })
      .bindPopup(`<b>${dev.name}</b><br>Speed: ${dev.speed?.toFixed(1) ?? 0} km/h`);

    state.markerCluster.addLayer(marker);
    state.markers.set(dev.id, marker);
  });

  updateMiniMap();
  updateStats();
  updateFleetList();

  const dc = $('deviceCount');
  if (dc) dc.textContent = state.devices.size;
}

function updateMiniMap() {
  state.miniMap.eachLayer(l => { if (l instanceof L.CircleMarker) state.miniMap.removeLayer(l); });
  state.devices.forEach(dev => {
    L.circleMarker([dev.lat, dev.lng], {
      radius: 5, color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.85, weight: 2
    }).bindTooltip(dev.name, { permanent: false }).addTo(state.miniMap);
  });
}

function updateStats() {
  const count = state.devices.size;
  $('statActiveVehicles').textContent = count;

  let totalSpeed = 0;
  const regions = new Set();
  state.devices.forEach(d => {
    totalSpeed += d.speed || 0;
    if (d.lat > 18 && d.lat < 21 && d.lng > 72 && d.lng < 74) regions.add('Maharashtra');
    else if (d.lat > 27 && d.lat < 30 && d.lng > 76 && d.lng < 78) regions.add('Delhi');
    else if (d.lat > 12 && d.lat < 14 && d.lng > 77 && d.lng < 78) regions.add('Karnataka');
    else if (d.lat > 12 && d.lat < 14 && d.lng > 79 && d.lng < 81) regions.add('Tamil Nadu');
    else regions.add('Other');
  });

  const avg = count ? (totalSpeed / count).toFixed(1) : '0.0';
  $('statAvgSpeed').textContent = `${avg} km/h`;
  $('statCoverage').textContent = `${regions.size} region${regions.size !== 1 ? 's' : ''}`;
  $('statTotalDistance').textContent = `${(count * 127).toFixed(0)} km`;
}

function updateFleetList() {
  const fl = $('fleetList');
  if (!fl) return;
  if (state.devices.size === 0) { fl.innerHTML = '<p style="color:var(--text-muted);padding:8px 0">No active vehicles</p>'; return; }

  fl.innerHTML = Array.from(state.devices.values()).map(dev => `
    <div class="fleet-item" data-id="${dev.id}">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
           fill="none" stroke="var(--primary)" stroke-width="2">
        <rect x="1" y="3" width="15" height="13"/>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
        <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>
      <div style="flex:1;min-width:0">
        <b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${dev.name}</b>
        <small style="color:var(--text-muted)">${(dev.speed || 0).toFixed(1)} km/h</small>
      </div>
      <span class="badge">Active</span>
    </div>`).join('');

  // Click to fly to vehicle
  fl.querySelectorAll('.fleet-item').forEach(el => {
    el.addEventListener('click', () => {
      const dev = state.devices.get(el.dataset.id);
      if (dev) {
        switchView('map');
        setTimeout(() => state.map.flyTo([dev.lat, dev.lng], 13, { animate: true, duration: 1 }), 150);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Demo simulator has been removed and replaced by DB seed data.

// ═══════════════════════════════════════════════════════════════════════════
//  MEASURE TOOL
// ═══════════════════════════════════════════════════════════════════════════
function initMeasureTool() {
  $('measureBtn').addEventListener('click', toggleMeasure);
  $('clearMeasureBtn').addEventListener('click', clearMeasurement);

  state.map.on('click', e => {
    if (!state.measuring) return;
    addMeasurePoint(e.latlng);
  });
}

function toggleMeasure() {
  state.measuring = !state.measuring;
  $('measureBtn').classList.toggle('active-btn', state.measuring);
  if (state.measuring) {
    showToast('Click on the map to add measure points', 'info');
  } else {
    clearMeasurement();
  }
}

function addMeasurePoint(latlng) {
  state.measurePoints.push(latlng);

  const m = L.circleMarker(latlng, {
    radius: 6, color: '#6366f1', fillColor: '#6366f1', fillOpacity: 1, weight: 2
  }).addTo(state.map);
  state.measureMarkers.push(m);

  if (state.measurePoints.length === 1) {
    state.measureLine = L.polyline([latlng], { color: '#6366f1', weight: 3, dashArray: '6,10' }).addTo(state.map);
  } else {
    state.measureLine.addLatLng(latlng);
    const dist = calcDistance(state.measurePoints);
    $('distanceValue').textContent = `${dist.toFixed(2)} km`;
    $('distancePanel').style.display = 'flex';
  }
}

function calcDistance(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += pts[i - 1].distanceTo(pts[i]);
  return total / 1000;
}

function clearMeasurement() {
  state.measuring = false;
  $('measureBtn').classList.remove('active-btn');
  state.measurePoints = [];
  state.measureMarkers.forEach(m => state.map.removeLayer(m));
  state.measureMarkers = [];
  if (state.measureLine) { state.map.removeLayer(state.measureLine); state.measureLine = null; }
  $('distancePanel').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      switchView(item.dataset.view);
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

function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(`${view}View`).classList.add('active');

  const titles = { dashboard: 'Dashboard', map: 'Live Map', analytics: 'Analytics', settings: 'Settings' };
  $('pageTitle').textContent = titles[view] || view;
  $('pageSubtitle').textContent = view === 'dashboard' ? 'Welcome back, Rajesh' : '';

  if (view === 'map')       setTimeout(() => state.map.invalidateSize(), 120);
  if (view === 'dashboard') setTimeout(() => state.miniMap.invalidateSize(), 120);
  if (view === 'history')   { 
    setTimeout(() => initHistoryMap(), 120);
    populateHistoryDropdown();
  }
  if (view === 'analytics') initCharts();
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOGIN & ROLES
// ═══════════════════════════════════════════════════════════════════════════
function initLogin() {
  const form = $('loginForm');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('loginSubmitBtn');
    btn.textContent = 'Authenticating...';
    
    const user = $('loginUser').value;
    const pass = $('loginPass').value;
    
    try {
      const res = await fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      
      if (data.success) {
        state.role = data.role;
        state.username = user;
        
        // Save session locally
        sessionStorage.setItem('campus_session', JSON.stringify({ role: data.role, username: user }));
        
        $('loginOverlay').style.display = 'none';
        $('appWrapper').style.display = ''; 
        
        applyRoleState();
        showToast('Login successful', 'success');
      } else {
        showToast(data.message, 'error');
        btn.textContent = 'Access Dashboard';
      }
    } catch(err) {
      showToast('Network error. Is backend running?', 'error');
      btn.textContent = 'Access Dashboard';
    }
  });

  // Check for existing session on page load
  const existingSession = sessionStorage.getItem('campus_session');
  if (existingSession) {
    try {
      const sess = JSON.parse(existingSession);
      state.role = sess.role;
      state.username = sess.username;
      
      $('loginOverlay').style.display = 'none';
      $('appWrapper').style.display = ''; 
      applyRoleState();
    } catch(e) {}
  }

  // Driver UI logic attached here for convenience
  const driverBtn = $('toggleDriverTrackingBtn');
  if (driverBtn) {
    driverBtn.addEventListener('click', () => {
      if (state.driverTracking) {
         state.driverTracking = false;
         driverBtn.style.background = 'var(--primary)';
         driverBtn.textContent = 'Start Route';
         $('driverStatusText').textContent = 'Status: Offline';
         if (state.driverWatch) {
            clearInterval(state.driverWatch);
            if (socket) socket.emit('stop-route', { id: 'bus_' + state.username.toLowerCase() });
         }
      } else {
         if (!navigator.geolocation) return showToast('GPS not supported', 'error');
         state.driverTracking = true;
         driverBtn.style.background = '#10b981';
         driverBtn.textContent = 'Stop Route';
         $('driverStatusText').textContent = 'Status: Transmitting Live GPS...';
         
         // Configurable update delay (e.g., 5000ms = 5 seconds)
         const UPDATE_DELAY_MS = 5000; 

         const pingLocation = () => {
           navigator.geolocation.getCurrentPosition(pos => {
             if (socket) {
               socket.emit('register-device', {
                  id: 'bus_' + state.username.toLowerCase(),
                  name: 'Bus ' + state.username.toUpperCase(),
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  speed: (pos.coords.speed || 0) * 3.6
               });
             }
           }, err => console.log('Location ping issue'), { enableHighAccuracy: true });
         };

         pingLocation(); // send first point immediately
         state.driverWatch = setInterval(pingLocation, UPDATE_DELAY_MS);
      }
    });
  }
}

function applyRoleState() {
  const lbl = $('sidebarRoleLabel');
  const bge = $('userRoleBadge');
  if (lbl) lbl.textContent = state.role.toUpperCase();
  if (bge) bge.textContent = state.role.toUpperCase();
  
  const navDash = document.querySelector('.nav-item[data-view="dashboard"]');
  const navMap = $('navMap');
  const navAnalytics = $('navAnalytics');
  const navHistory = $('navHistory');
  const navDriver = $('navDriver');
  
  if (state.role === 'student') {
    if (navDash) navDash.style.display = 'none';
    if (navAnalytics) navAnalytics.style.display = 'none';
    if (navHistory) navHistory.style.display = 'none';
    if (navDriver) navDriver.style.display = 'none';
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (navMap) navMap.classList.add('active');
    switchView('map');
  } 
  else if (state.role === 'driver') {
    if (navDash) navDash.style.display = 'none';
    if (navMap) navMap.style.display = 'none';
    if (navAnalytics) navAnalytics.style.display = 'none';
    if (navHistory) navHistory.style.display = 'none';
    if (navDriver) {
      navDriver.style.display = 'flex';
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      navDriver.classList.add('active');
    }
    
    switchView('driver');
  } 
  else if (state.role === 'admin') {
    if (navDriver) navDriver.style.display = 'none'; // Admin doesn't need to drive
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHARTS  (lazy – only init once)
// ═══════════════════════════════════════════════════════════════════════════
let chartsInited = false;

async function initCharts() {
  if (chartsInited) return;
  chartsInited = true;

  let data;
  try {
    const res = await fetch('http://localhost:3000/api/analytics');
    if (!res.ok) throw new Error('Analytics unavailable');
    data = await res.json();
  } catch {
    showToast('Could not load analytics data', 'error');
    return;
  }

  const chartDefaults = {
    responsive: true,
    plugins: { legend: { labels: { color: getComputedStyle(document.body).getPropertyValue('--text') || '#0f172a' } } },
    scales: {}
  };

  // Distance line chart
  state.charts.distance = new Chart($('distanceChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Distance (km)',
        data: data.distanceByDay,
        borderColor: '#6366f1',
        backgroundColor: '#6366f130',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#6366f1'
      }]
    },
    options: { ...chartDefaults }
  });

  // Hours bar chart
  state.charts.hours = new Chart($('hoursChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Active Hours',
        data: data.activeHours,
        backgroundColor: '#818cf8',
        borderRadius: 8
      }]
    },
    options: { ...chartDefaults }
  });

  // Region doughnut
  state.charts.region = new Chart($('regionChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: data.regionDistribution.map(r => r.region),
      datasets: [{
        data: data.regionDistribution.map(r => r.count),
        backgroundColor: ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'],
        borderWidth: 2
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'right' } } }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SEARCH
// ═══════════════════════════════════════════════════════════════════════════
function initSearch() {
  const input = $('searchInput');
  if (!input) return;
  input.addEventListener('input', e => filterDevices(e.target.value.toLowerCase().trim()));
}

function filterDevices(query) {
  state.devices.forEach((dev, id) => {
    const marker = state.markers.get(id);
    const visible = !query || dev.name.toLowerCase().includes(query);
    if (marker) marker.setOpacity(visible ? 1 : 0.2);
  });

  document.querySelectorAll('.fleet-item').forEach(el => {
    const match = !query || el.textContent.toLowerCase().includes(query);
    el.style.display = match ? 'flex' : 'none';
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
let vehicleAlertInterval   = null;
let routeDeviationInterval = null;

function initSettings() {
  // Theme toggle (header button)
  $('themeToggle').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(state.theme);
    localStorage.setItem('theme', state.theme);
  });

  // Dark mode toggle (settings panel)
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
    // Remove current tile layer
    state.map.eachLayer(l => { if (l instanceof L.TileLayer) state.map.removeLayer(l); });
    // Add new tile layer (create fresh to avoid caching issues)
    makeTiles(style).addTo(state.map);
    state.activeStyle = style;
    showToast(`Map style → ${style}`, 'info');
  });

  // Vehicle alerts
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

  // Route deviations
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
  $('refreshMapBtn').addEventListener('click', () => { state.map.invalidateSize(); showToast('Map refreshed', 'info'); });

  // Logout hooks
  const logoutBtn = $('logoutBtn');
  const navLogout = $('navLogout');

  const processLogout = () => {
    if (state.role === 'driver' && socket) {
       socket.emit('stop-route', { id: 'bus_' + state.username.toLowerCase() });
    }
    sessionStorage.removeItem('campus_session');
    window.location.reload();
  };

  if (logoutBtn) logoutBtn.addEventListener('click', processLogout);
  if (navLogout) navLogout.addEventListener('click', processLogout);
}

function startVehicleAlerts() {
  stopVehicleAlerts();
  vehicleAlertInterval = setInterval(() => {
    state.devices.forEach(dev => {
      if (dev.speed > 70) showToast(`⚠️ ${dev.name} speeding at ${dev.speed.toFixed(0)} km/h`, 'error');
    });
  }, 12_000);
}
function stopVehicleAlerts() {
  clearInterval(vehicleAlertInterval);
  vehicleAlertInterval = null;
}

function startRouteDeviationMonitoring() {
  stopRouteDeviationMonitoring();
  routeDeviationInterval = setInterval(() => {
    state.devices.forEach(dev => {
      if (Math.random() > 0.92) showToast(`🔀 ${dev.name} deviated from planned route`, 'error');
    });
  }, 18_000);
}
function stopRouteDeviationMonitoring() {
  clearInterval(routeDeviationInterval);
  routeDeviationInterval = null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  WEATHER  (Open-Meteo – no key needed)
// ═══════════════════════════════════════════════════════════════════════════
async function fetchWeather() {
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=28.61&longitude=77.21&current_weather=true');
    if (!res.ok) return;
    const j = await res.json();
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
  if (code === 0)               return 'Clear sky';
  if (code <= 3)                return 'Partly cloudy';
  if (code <= 67)               return 'Rain / drizzle';
  if (code <= 77)               return 'Snow';
  if (code <= 82)               return 'Showers';
  if (code <= 99)               return 'Thunderstorm';
  return 'Variable';
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════════════════════
function showToast(message, type = 'info') {
  const container = $('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'error' ? '✕' : type === 'success' ? '✓' : 'ℹ';
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  // Auto-remove after 4 s
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ═══════════════════════════════════════════════════════════════════════════
//  INLINE STYLES  (marker + button overrides)
// ═══════════════════════════════════════════════════════════════════════════
const inlineStyle = document.createElement('style');
inlineStyle.textContent = `
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
document.head.appendChild(inlineStyle);

// ═══════════════════════════════════════════════════════════════════════════
//  HISTORY PLAYBACK (Added Feature)
// ═══════════════════════════════════════════════════════════════════════════
function initHistoryMap() {
  if (state.historyMap) {
    state.historyMap.invalidateSize();
    return;
  }
  state.historyMap = L.map('historyMap', { center: [22.5, 78.5], zoom: 4 });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(state.historyMap);
  
  $('loadHistoryBtn').addEventListener('click', loadHistoryData);
  $('playRouteBtn').addEventListener('click', togglePlayback);
  $('routeSlider').addEventListener('input', e => renderFrame(parseInt(e.target.value)));
}

async function populateHistoryDropdown() {
  const sel = $('historyDeviceSelect');
  if (!sel) return;
  
  const current = sel.value;
  sel.innerHTML = '<option value="">Fetching vehicles from DB...</option>';
  
  try {
    const res = await fetch('http://localhost:3000/api/history-devices');
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
  } catch(e) {
    sel.innerHTML = '<option value="">Error fetching DB</option>';
  }
}

async function loadHistoryData() {
  const devId = $('historyDeviceSelect').value;
  if (!devId) return showToast('Please select a vehicle first', 'error');
  
  const btn = $('loadHistoryBtn');
  btn.textContent = 'Loading...';
  
  try {
    const res = await fetch(`http://localhost:3000/api/history/${devId}`);
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
  } catch(e) {
    showToast('Failed to load history data', 'error');
  }
  btn.textContent = 'Load History';
}

function setupPlaybackUI() {
  $('playbackControls').style.display = 'block';
  $('routeSlider').max = state.historyData.length - 1;
  $('routeSlider').value = 0;
  
  const start = new Date(state.historyData[0].logged_at).toLocaleTimeString();
  const end = new Date(state.historyData[state.historyData.length - 1].logged_at).toLocaleTimeString();
  
  $('routeStartLabel').textContent = start;
  $('routeEndLabel').textContent = end;
  
  if (state.historyPolyline) state.historyMap.removeLayer(state.historyPolyline);
  if (state.historyMarker) state.historyMap.removeLayer(state.historyMarker);
  
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
  
  // Custom styling for timeline popup
  state.historyMarker.bindPopup(`
    <b>Historical Snapshot</b><br>
    Speed: ${pt.speed.toFixed(1)} km/h<br>
    Time: ${new Date(pt.logged_at).toLocaleTimeString()}
  `).openPopup();
  
  $('routeSlider').value = index;
}

function togglePlayback() {
  const btn = $('playRouteBtn');
  if (state.historyAnimInterval) {
    clearInterval(state.historyAnimInterval);
    state.historyAnimInterval = null;
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  } else {
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    let i = parseInt($('routeSlider').value);
    if (i >= state.historyData.length - 1) i = 0;
    
    state.historyAnimInterval = setInterval(() => {
      if (i >= state.historyData.length) {
        clearInterval(state.historyAnimInterval);
        state.historyAnimInterval = null;
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        return;
      }
      renderFrame(i);
      i += 1;
    }, 150); // Playback speed: 150ms per frame
  }
}
