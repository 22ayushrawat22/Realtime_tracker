// ── routes/adminRoutes.js ─────────────────────────────────────────────────────
// All routes that require the "admin" role:
//   /api/users   (CRUD)
//   /api/stops   (CRUD)
//   /api/analytics
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');
const bcrypt   = require('bcryptjs');
const { pool } = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Shorthand guard – admin only
const adminOnly = (req, res) => res.status(403).json({ error: 'Admin only' });

// ── Analytics ────────────────────────────────────────────────────────────────
// GET /api/analytics
router.get('/analytics', authenticateToken, (_req, res) => {
  res.json({
    distanceByDay: [120, 210, 180, 290, 340, 270, 190],
    activeHours:   [2, 5, 8, 12, 10, 7, 4],
    regionDistribution: [
      { region: 'Bhupani',        count: 24 },
      { region: 'Sector 29',      count: 18 },
      { region: 'Badarpur Border',count: 15 },
      { region: 'Sector 15',      count: 12 },
      { region: 'Sector 16',      count:  9 }
    ]
  });
});

// ── User Management ───────────────────────────────────────────────────────────
// GET /api/users
router.get('/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return adminOnly(req, res);
  try {
    const { rows } = await pool.query(
      'SELECT id, username, role FROM users ORDER BY role, username'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/users
router.post('/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return adminOnly(req, res);
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !['admin', 'driver', 'student'].includes(role))
      return res.status(400).json({ error: 'username, password, and valid role are required' });
    const hashedPw = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
      [username, hashedPw, role]
    );
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id
router.patch('/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return adminOnly(req, res);
  try {
    const { id } = req.params;
    const { role, password } = req.body;
    if (role) {
      if (!['admin', 'driver', 'student'].includes(role))
        return res.status(400).json({ error: 'Invalid role' });
      await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    }
    if (password) {
      const hashedPw = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPw, id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/users/:id
router.delete('/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return adminOnly(req, res);
  try {
    const { id } = req.params;
    if (String(req.user.id) === String(id))
      return res.status(400).json({ error: "You can't delete your own account" });
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bus Stops ────────────────────────────────────────────────────────────────
// GET /api/stops  (all authenticated users can read stops for geofencing)
router.get('/stops', authenticateToken, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM bus_stops');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/stops
router.post('/stops', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return adminOnly(req, res);
  try {
    const { driver_id, name, lat, lng } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO bus_stops (driver_id, name, lat, lng) VALUES ($1, $2, $3, $4) RETURNING *',
      [driver_id, name, lat, lng]
    );
    res.json({ success: true, stop: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/stops/:id
router.delete('/stops/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return adminOnly(req, res);
  try {
    await pool.query('DELETE FROM bus_stops WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
