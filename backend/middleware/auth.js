// ── middleware/auth.js ────────────────────────────────────────────────────────
// JWT authentication middleware used by all protected routes.
// ─────────────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_dev_key_only';

/**
 * Express middleware – verifies Bearer JWT token.
 * Sets req.user = { id, username, role } on success.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
}

module.exports = { authenticateToken, JWT_SECRET };
