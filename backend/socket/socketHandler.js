// ── socket/socketHandler.js ───────────────────────────────────────────────────
// All Socket.IO real-time logic:
//   - JWT handshake authentication
//   - register-device, update-location, stop-route, disconnect
//   - Stale device cleanup (every 60 s)
// ─────────────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const { pool, devicesArray } = require('../db/pool');
const { JWT_SECRET } = require('../middleware/auth');

/**
 * Broadcast latest device list to all connected clients.
 */
async function broadcastDevices(io) {
  const all = await devicesArray();
  io.emit('devices-update', all);
}

/**
 * Attaches all Socket.IO middleware and event handlers to the given `io` instance.
 * Call once from server.js after io is created.
 */
function initSocket(io) {
  // ── JWT authentication for every socket connection ──────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error: Token missing'));

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Authentication error: Invalid Token'));
      socket.user = decoded;
      next();
    });
  });

  // ── Connection handler ───────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    console.log(`🟢 Connected: ${socket.id}`);

    // Send current fleet state to the newly connected client
    socket.emit('devices-update', await devicesArray());

    // ── Driver: register or update position ─────────────────────────────────
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

        await pool.query(
          'INSERT INTO location_logs (device_id, lat, lng, speed) VALUES ($1, $2, $3, $4)',
          [deviceId, latitude, longitude, speed || 0]
        );

        broadcastDevices(io);
        console.log(`📍 Registered/Updated ID: ${deviceId}`);
      } catch (err) {
        console.error(err);
      }
    });

    // ── Driver: lightweight position update ──────────────────────────────────
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

        await pool.query(
          'INSERT INTO location_logs (device_id, lat, lng, speed) VALUES ($1, $2, $3, $4)',
          [deviceId, latitude, longitude, speed || 0]
        );

        broadcastDevices(io);
      } catch (err) { /* silent */ }
    });

    // ── Driver: explicitly stop their route ──────────────────────────────────
    socket.on('stop-route', async (data) => {
      const { id } = data || {};
      if (!id) return;
      try {
        await pool.query('DELETE FROM devices WHERE id = $1', [id]);
        broadcastDevices(io);
        console.log(`🛑 Stopped Route: ${id}`);
      } catch (err) { /* silent */ }
    });

    // ── Clean up on socket disconnect ─────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`🔴 Disconnected: ${socket.id}`);
      try {
        await pool.query('DELETE FROM devices WHERE id = $1', [socket.id]);
        broadcastDevices(io);
      } catch (err) { /* silent */ }
    });
  });

  // ── Stale device cleanup (runs every 60 s) ───────────────────────────────────
  setInterval(async () => {
    try {
      const res = await pool.query(`
        DELETE FROM devices WHERE updated_at < NOW() - INTERVAL '2 minutes' RETURNING id;
      `);
      if (res.rowCount > 0) {
        res.rows.forEach(r => io.emit('device-disconnected', r.id));
        broadcastDevices(io);
        console.log(`🗑️  Removed ${res.rowCount} stale devices`);
      }
    } catch (e) { /* silent */ }
  }, 60_000);
}

module.exports = { initSocket };
