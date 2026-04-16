// ── routes/driverRoutes.js ────────────────────────────────────────────────────
// History routes used by admin / history-playback feature.
//   GET /api/history-devices    – list all tracked device IDs
//   GET /api/history/:deviceId  – retrieve route log for a device
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');
const { pool } = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/history-devices
router.get('/history-devices', authenticateToken, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT DISTINCT device_id AS id FROM location_logs'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/history/:deviceId
router.get('/history/:deviceId', authenticateToken, async (req, res) => {
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

module.exports = router;
