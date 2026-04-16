// ── routes/authRoutes.js ──────────────────────────────────────────────────────
// POST /api/login  –  no token required
// ─────────────────────────────────────────────────────────────────────────────
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const { pool }   = require('../db/pool');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, message: 'Too many login attempts, please try again later.' }
});

// POST /api/login
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  try {
    const { rows } = await pool.query(
      'SELECT id, password, role FROM users WHERE username = $1',
      [username]
    );
    if (rows.length > 0) {
      const user = rows[0];
      const validPassword = await bcrypt.compare(password, user.password);
      if (validPassword) {
        const token = jwt.sign(
          { id: user.id, username, role: user.role },
          JWT_SECRET,
          { expiresIn: '12h' }
        );
        return res.json({ success: true, role: user.role, token });
      }
    }
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
