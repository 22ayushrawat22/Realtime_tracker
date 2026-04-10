const express = require('express');
const app = express();
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

// ── View engine & static files ──────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── In-memory device store ───────────────────────────────────────────────────
// id → { id, name, lat, lng, speed, updatedAt }
const devices = new Map();

// ── Stale device cleanup (every 60 s) ───────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [id, data] of devices.entries()) {
    if (now - data.updatedAt > 120_000) {
      devices.delete(id);
      io.emit('device-disconnected', id);
      changed = true;
      console.log(`🗑️  Removed stale device: ${id}`);
    }
  }
  if (changed) broadcastDevices();
}, 60_000);

// ── Helpers ──────────────────────────────────────────────────────────────────
function devicesArray() {
  return Array.from(devices.values());
}

function broadcastDevices() {
  io.emit('devices-update', devicesArray());
}

// ── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🟢 Connected: ${socket.id}`);

  // Send current snapshot immediately to the new client
  socket.emit('devices-update', devicesArray());

  // Register a new device (first location ping)
  socket.on('register-device', (data) => {
    const { name, latitude, longitude, speed } = data || {};

    if (latitude == null || longitude == null) {
      console.warn(`⚠️  register-device missing coords from ${socket.id}`);
      return;
    }

    const device = {
      id: socket.id,
      name: name || `Device ${socket.id.slice(0, 4)}`,
      lat: latitude,
      lng: longitude,
      speed: speed || 0,
      updatedAt: Date.now()
    };

    devices.set(socket.id, device);
    console.log(`📍 Registered: ${device.name} @ ${latitude},${longitude}`);
    broadcastDevices();
  });

  // Subsequent location updates from a known device
  socket.on('update-location', (data) => {
    const { latitude, longitude, speed } = data || {};

    if (!devices.has(socket.id)) {
      console.warn(`⚠️  update-location from unknown device ${socket.id}`);
      return;
    }
    if (latitude == null || longitude == null) return;

    const dev = devices.get(socket.id);
    dev.lat = latitude;
    dev.lng = longitude;
    dev.speed = speed ?? dev.speed;
    dev.updatedAt = Date.now();
    broadcastDevices();
  });

  socket.on('disconnect', () => {
    console.log(`🔴 Disconnected: ${socket.id}`);
    if (devices.has(socket.id)) {
      devices.delete(socket.id);
      broadcastDevices();
    }
  });
});

// ── REST API ─────────────────────────────────────────────────────────────────

// Live device list
app.get('/api/devices', (_req, res) => {
  res.json(devicesArray());
});

// Simulated analytics data
app.get('/api/analytics', (_req, res) => {
  res.json({
    distanceByDay: [120, 210, 180, 290, 340, 270, 190],
    activeHours:   [2,   5,   8,   12,  10,  7,   4],
    regionDistribution: [
      { region: 'Bhupani', count: 24 },
      { region: 'Sector 29',       count: 18 },
      { region: 'Badarpur Border',   count: 15 },
      { region: 'Sector 15',  count: 12 },
      { region: 'Sector 16',     count:  9 }
    ]
  });
});

// Health-check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', devices: devices.size, uptime: process.uptime() });
});

// Main page
app.get('/', (_req, res) => {
  res.render('index');
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 RouteMaster running → http://localhost:${PORT}`);
});
