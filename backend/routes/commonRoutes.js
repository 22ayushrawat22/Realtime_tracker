// ── routes/commonRoutes.js ────────────────────────────────────────────────────
// Shared routes accessible by all authenticated users:
//   GET /api/devices   – current live devices
//   GET /api/health    – server health check (no auth)
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');
const { pool, devicesArray } = require('../db/pool');
const { authenticateToken }  = require('../middleware/auth');

const router = express.Router();

// GET /api/devices
router.get('/devices', authenticateToken, async (_req, res) => {
  res.json(await devicesArray());
});

// GET /api/health  (no auth – used by monitoring tools)
router.get('/health', async (_req, res) => {
  try {
    const devices = await devicesArray();
    res.json({ status: 'ok', devices: devices.length, uptime: process.uptime() });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.message });
  }
});

module.exports = router;
