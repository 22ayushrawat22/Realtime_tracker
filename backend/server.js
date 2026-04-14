// ── server.js ─────────────────────────────────────────────────────────────────
// Entry point – wires together Express, Socket.IO, and all modules.
// Keep this file thin: configuration + startup only.
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const http      = require('http');
const socketIo  = require('socket.io');
const helmet    = require('helmet');

// ── Internal modules ──────────────────────────────────────────────────────────
const { initDB }           = require('./db/pool');
const { initSocket }       = require('./socket/socketHandler');
const authRoutes           = require('./routes/authRoutes');
const adminRoutes          = require('./routes/adminRoutes');
const driverRoutes         = require('./routes/driverRoutes');
const commonRoutes         = require('./routes/commonRoutes');

// ── App setup ─────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, { cors: { origin: '*' } });

app.use(helmet());
app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', authRoutes);     // POST   /api/login
app.use('/api', adminRoutes);    // /api/users, /api/stops, /api/analytics
app.use('/api', driverRoutes);   // /api/history-devices, /api/history/:id
app.use('/api', commonRoutes);   // /api/devices, /api/health

// ── Socket.IO ────────────────────────────────────────────────────────────────
initSocket(io);

// ── Database ─────────────────────────────────────────────────────────────────
initDB();

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 RouteMaster API running → http://localhost:${PORT}`);
});
