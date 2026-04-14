// ── js/modules/map.js ─────────────────────────────────────────────────────────
// Leaflet map initialisation, tile layers, geofencing, device markers,
// measure tool, fleet list, mini-map, and ETA calculations.
// ─────────────────────────────────────────────────────────────────────────────
import { state, $, API } from '../state.js';
import { showToast } from './ui/utils.js';
import { switchView } from './ui/navigation.js';

// ── Tile layer factory ────────────────────────────────────────────────────────
export function makeTiles(style) {
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

// ── Map initialisation ────────────────────────────────────────────────────────
export function initMaps() {
  // Main map
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

  state.markerCluster = L.markerClusterGroup({
    spiderfyOnMaxZoom:  true,
    showCoverageOnHover:false,
    maxClusterRadius:   40
  });
  state.map.addLayer(state.markerCluster);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(state.map);

  renderGeofences();

  // Mini map (dashboard widget)
  state.miniMap = L.map('miniMap', {
    center: [22.5, 78.5],
    zoom: 4,
    zoomControl:        false,
    attributionControl: false,
    dragging:           false,
    scrollWheelZoom:    false,
    doubleClickZoom:    false,
    touchZoom:          false
  });
  makeTiles('voyager').addTo(state.miniMap);
}

// ── Geofence rendering ────────────────────────────────────────────────────────
export function renderGeofences() {
  if (!state.map) return;
  // Remove only our geofence layers (tagged with _geofenceLayer)
  state.map.eachLayer(l => { if (l._geofenceLayer) state.map.removeLayer(l); });

  state.GEOFENCES.forEach(zone => {
    const circle = L.circle([zone.lat, zone.lng], {
      radius: zone.radius, color: zone.color, fillOpacity: 0.15, weight: 2
    }).addTo(state.map);
    circle._geofenceLayer = true;

    const isCampus = zone.id === 'campus';
    const svgBody  = isCampus
      ? `<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>`
      : `<circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M8 8h8"/><path d="M8 12h8"/>`;

    const marker = L.marker([zone.lat, zone.lng], {
      icon: L.divIcon({
        className: `custom-marker ${isCampus ? 'campus-marker' : 'zone-marker'}`,
        html: `<div class="marker-pin" style="background:${zone.color};"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">${svgBody}</svg></div>`,
        iconSize:   [32, 32],
        iconAnchor: [16, 32]
      })
    }).bindTooltip(zone.name, { permanent: isCampus, direction: 'top', offset: [0, -34] }).addTo(state.map);
    marker._geofenceLayer = true;
  });
}

// ── Truck icon ────────────────────────────────────────────────────────────────
export function truckIcon() {
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
    iconSize:   [32, 32],
    iconAnchor: [16, 32]
  });
}

// ── ETA calculation (throttled at 15 s per device) ────────────────────────────
export async function updateEta(id, lat, lng) {
  const now    = Date.now();
  const cached = state.etas.get(id);
  if (cached && (now - cached.lastChecked < 15000)) return;

  state.etas.set(id, { ...cached, lastChecked: now, text: cached?.text || 'calculating...' });

  try {
    const dest = state.GEOFENCES[0]; // Campus
    const res  = await fetch(`https://router.project-osrm.org/route/v1/driving/${lng},${lat};${dest.lng},${dest.lat}?overview=false`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      const r    = data.routes[0];
      const mins = Math.round(r.duration / 60);
      const kms  = (r.distance / 1000).toFixed(1);
      state.etas.set(id, { text: `${mins} min`, distance: `${kms} km`, lastChecked: now });

      const m = state.markers.get(id);
      if (m && m.isPopupOpen()) {
        m.setPopupContent(`<b>${state.devices.get(id)?.name}</b><br>Speed: ${(state.devices.get(id)?.speed||0).toFixed(1)} km/h<br>ETA: ${mins} min (${kms} km)`);
      }
      updateFleetList();
    }
  } catch { /* silent – ETA is best-effort */ }
}

// ── Device sync (called on every WebSocket update) ────────────────────────────
export function syncDevices(list) {
  state.devices.clear();
  state.markerCluster.clearLayers();
  state.markers.clear();

  list.forEach(dev => {
    if (dev.lat == null || dev.lng == null) return;
    state.devices.set(dev.id, dev);
    updateEta(dev.id, dev.lat, dev.lng);

    const etaData   = state.etas.get(dev.id);
    const etaString = etaData && etaData.text !== 'calculating...' ? `<br>ETA: ${etaData.text} (${etaData.distance})` : '';

    const marker = L.marker([dev.lat, dev.lng], { icon: truckIcon() })
      .bindPopup(`<b>${dev.name}</b><br>Speed: ${dev.speed?.toFixed(1) ?? 0} km/h${etaString}`);

    state.markerCluster.addLayer(marker);
    state.markers.set(dev.id, marker);

    // Geofence alert – driver-specific stop assignments
    state.GEOFENCES.forEach(zone => {
      const dist  = L.latLng([zone.lat, zone.lng]).distanceTo(L.latLng([dev.lat, dev.lng]));
      const evKey = `${dev.id}_${zone.id}`;
      if (dist <= zone.radius) {
        if (!state.geofencedEvents.has(evKey)) {
          const currentDriverId = dev.id.replace('bus_', '');
          if (!zone.driver_id || zone.driver_id === currentDriverId || zone.driver_id === 'all' || zone.id === 'campus') {
            state.geofencedEvents.set(evKey, true);
            showToast(`🚨 ${dev.name} is arriving at ${zone.name}!`, 'success');
          }
        }
      } else {
        state.geofencedEvents.delete(evKey);
      }
    });
  });

  updateMiniMap();
  updateStats();
  updateFleetList();

  const dc = $('deviceCount');
  if (dc) dc.textContent = state.devices.size;
}

// ── Mini-map dots ─────────────────────────────────────────────────────────────
function updateMiniMap() {
  state.miniMap.eachLayer(l => { if (l instanceof L.CircleMarker) state.miniMap.removeLayer(l); });
  state.devices.forEach(dev => {
    L.circleMarker([dev.lat, dev.lng], {
      radius: 5, color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.85, weight: 2
    }).bindTooltip(dev.name, { permanent: false }).addTo(state.miniMap);
  });
}

// ── Dashboard stats ───────────────────────────────────────────────────────────
function updateStats() {
  const count = state.devices.size;
  $('statActiveVehicles').textContent = count;

  let totalSpeed = 0;
  const regions  = new Set();
  state.devices.forEach(d => {
    totalSpeed += d.speed || 0;
    if      (d.lat > 18 && d.lat < 21 && d.lng > 72 && d.lng < 74) regions.add('Maharashtra');
    else if (d.lat > 27 && d.lat < 30 && d.lng > 76 && d.lng < 78) regions.add('Delhi');
    else if (d.lat > 12 && d.lat < 14 && d.lng > 77 && d.lng < 78) regions.add('Karnataka');
    else if (d.lat > 12 && d.lat < 14 && d.lng > 79 && d.lng < 81) regions.add('Tamil Nadu');
    else                                                              regions.add('Other');
  });

  const avg = count ? (totalSpeed / count).toFixed(1) : '0.0';
  $('statAvgSpeed').textContent    = `${avg} km/h`;
  $('statCoverage').textContent    = `${regions.size} region${regions.size !== 1 ? 's' : ''}`;
  $('statTotalDistance').textContent = `${(count * 127).toFixed(0)} km`;
}

// ── Fleet overlay list ────────────────────────────────────────────────────────
export function updateFleetList() {
  const fl = $('fleetList');
  if (!fl) return;
  if (state.devices.size === 0) {
    fl.innerHTML = '<p style="color:var(--text-muted);padding:8px 0">No active vehicles</p>';
    return;
  }
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
        <small style="color:var(--text-muted)">${(dev.speed || 0).toFixed(1)} km/h • ETA: ${state.etas.get(dev.id)?.text || 'calc...'}</small>
      </div>
      <span class="badge">Active</span>
    </div>`).join('');

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

// ── Measure tool ──────────────────────────────────────────────────────────────
export function initMeasureTool() {
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

// ── Connection status (called by socket.js via injected dep) ─────────────────
export function setConnectionStatus(online) {
  const badge = $('connectionBadge');
  const text  = $('connectionText');
  if (!badge || !text) return;
  const dot = badge.querySelector('.pulse-dot');
  if (dot) dot.style.background = online ? '' : '#ef4444';
  text.textContent = online ? 'Live' : 'Offline';
  const srv = $('serverStatus');
  if (srv) { srv.textContent = online ? 'Online' : 'Offline'; srv.style.color = online ? '#10b981' : '#ef4444'; }
}
