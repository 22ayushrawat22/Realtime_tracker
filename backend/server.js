require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// ── Database Setup ────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL
      );
    `);

    // Seed default authentication users from .env
    const getCreds = (envKey, defaultStr, role) =>
      (process.env[envKey] || defaultStr).split(',')
        .map(s => ({ u: s.split(':')[0], p: s.split(':')[1], r: role }))
        .filter(x => x.u && x.p);

    const usersToSeed = [
      ...getCreds('ADMIN_CREDENTIALS', 'admin:admin', 'admin'),
      ...getCreds('DRIVER_CREDENTIALS', 'driver:driver', 'driver'),
      ...getCreds('STUDENT_CREDENTIALS', 'student:student', 'student')
    ];

    for (const usr of usersToSeed) {
      await pool.query(
        'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING',
        [usr.u, usr.p, usr.r]
      );
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        speed DOUBLE PRECISION,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS location_logs (
        id SERIAL PRIMARY KEY,
        device_id VARCHAR(255),
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        speed DOUBLE PRECISION,
        logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ NeonDB Connected & Schema Initialized (Users, Devices, Logs)");
  } catch (err) {
    console.error("❌ Database initialization error:", err);
  }
}
initDB();

// ── Stale device cleanup (every 60 s) ───────────────────────────────────────
setInterval(async () => {
  try {
    const res = await pool.query(`
      DELETE FROM devices WHERE updated_at < NOW() - INTERVAL '2 minutes' RETURNING id;
    `);
    if (res.rowCount > 0) {
      res.rows.forEach(r => io.emit('device-disconnected', r.id));
      const all = await devicesArray();
      io.emit('devices-update', all);
      console.log(`🗑️  Removed ${res.rowCount} stale devices`);
    }
  } catch (e) { }
}, 60_000);

// ── Helpers ──────────────────────────────────────────────────────────────────
async function devicesArray() {
  const res = await pool.query('SELECT * FROM devices');
  return res.rows;
}

async function broadcastDevices() {
  const all = await devicesArray();
  io.emit('devices-update', all);
}

// ── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', async (socket) => {
  console.log(`🟢 Connected: ${socket.id}`);

  socket.emit('devices-update', await devicesArray());

  socket.on('register-device', async (data) => {
    const { id, name, latitude, longitude, speed } = data || {};
    if (latitude == null || longitude == null) return;
    const deviceId = id || socket.id;

    try {
      await pool.query(`
        INSERT INTO devices (id, name, lat, lng, speed, updated_at) 
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng, 
          speed = EXCLUDED.speed, updated_at = EXCLUDED.updated_at
      `, [deviceId, name || `Device ${deviceId.slice(0, 4)}`, latitude, longitude, speed || 0]);

      await pool.query('INSERT INTO location_logs (device_id, lat, lng, speed) VALUES ($1, $2, $3, $4)', [deviceId, latitude, longitude, speed || 0]);
      broadcastDevices();
      console.log(`📍 Registered/Updated ID: ${deviceId}`);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('update-location', async (data) => {
    const { id, latitude, longitude, speed } = data || {};
    if (latitude == null || longitude == null) return;
    const deviceId = id || socket.id;

    try {
      await pool.query(`
        INSERT INTO devices (id, name, lat, lng, speed, updated_at) 
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (id) DO UPDATE SET 
          lat = EXCLUDED.lat, lng = EXCLUDED.lng, 
          speed = COALESCE(EXCLUDED.speed, devices.speed), 
          updated_at = EXCLUDED.updated_at
      `, [deviceId, `Device ${deviceId.slice(0, 4)}`, latitude, longitude, speed]);

      await pool.query('INSERT INTO location_logs (device_id, lat, lng, speed) VALUES ($1, $2, $3, $4)', [deviceId, latitude, longitude, speed || 0]);
      broadcastDevices();
    } catch (err) { }
  });

  socket.on('stop-route', async (data) => {
    const { id } = data || {};
    if (!id) return;
    try {
      await pool.query('DELETE FROM devices WHERE id = $1', [id]);
      broadcastDevices();
      console.log(`🛑 Stopped Route: ${id}`);
    } catch (err) { }
  });

  socket.on('disconnect', async () => {
    console.log(`🔴 Disconnected: ${socket.id}`);
    try {
      await pool.query('DELETE FROM devices WHERE id = $1', [socket.id]);
      broadcastDevices();
    } catch (err) { }
  });
});

// ── REST API ─────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { rows } = await pool.query('SELECT role FROM users WHERE username = $1 AND password = $2', [username, password]);
    if (rows.length > 0) {
      res.json({ success: true, role: rows[0].role });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/devices', async (_req, res) => {
  res.json(await devicesArray());
});

app.get('/api/analytics', (_req, res) => {
  res.json({
    distanceByDay: [120, 210, 180, 290, 340, 270, 190],
    activeHours: [2, 5, 8, 12, 10, 7, 4],
    regionDistribution: [
      { region: 'Bhupani', count: 24 },
      { region: 'Sector 29', count: 18 },
      { region: 'Badarpur Border', count: 15 },
      { region: 'Sector 15', count: 12 },
      { region: 'Sector 16', count: 9 }
    ]
  });
});

app.get('/api/history-devices', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT DISTINCT device_id as id FROM location_logs'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { rows } = await pool.query(
      'SELECT lat, lng, speed, logged_at FROM location_logs WHERE device_id = $1 ORDER BY logged_at ASC LIMIT 500',
      [deviceId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    const devices = await devicesArray();
    res.json({ status: 'ok', devices: devices.length, uptime: process.uptime() });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 RouteMaster API running → http://localhost:${PORT}`);
});
