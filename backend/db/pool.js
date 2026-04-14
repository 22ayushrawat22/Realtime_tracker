// ── db/pool.js ────────────────────────────────────────────────────────────────
// Database connection, schema initialisation, and shared query helpers.
// Imported by routes and socketHandler – never import server.js here.
// ─────────────────────────────────────────────────────────────────────────────
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

let dbString = process.env.DATABASE_URL || '';
if (dbString.match(/sslmode=(require|prefer|verify-ca)/) && !dbString.includes('uselibpqcompat=')) {
  dbString += (dbString.includes('?') ? '&' : '?') + 'uselibpqcompat=true';
}

const pool = new Pool({
  connectionString: dbString,
  ssl: { rejectUnauthorized: false }
});

// ── Schema initialisation ─────────────────────────────────────────────────────
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

    // Seed default accounts from .env (only inserts, never overwrites)
    const getCreds = (envKey, defaultStr, role) =>
      (process.env[envKey] || defaultStr).split(',')
        .map(s => ({ u: s.split(':')[0], p: s.split(':')[1], r: role }))
        .filter(x => x.u && x.p);

    const usersToSeed = [
      ...getCreds('ADMIN_CREDENTIALS',   'admin:admin',     'admin'),
      ...getCreds('DRIVER_CREDENTIALS',  'driver:driver',   'driver'),
      ...getCreds('STUDENT_CREDENTIALS', 'student:student', 'student')
    ];

    for (const usr of usersToSeed) {
      const hashedPw = await bcrypt.hash(usr.p, 10);
      await pool.query(
        'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING',
        [usr.u, hashedPw, usr.r]
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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bus_stops (
        id SERIAL PRIMARY KEY,
        driver_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        radius INTEGER DEFAULT 300,
        color VARCHAR(50) DEFAULT '#3b82f6'
      );
    `);

    console.log('✅ NeonDB Connected & Schema Initialized (Users, Devices, Logs, Stops)');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
  }
}

// ── Query helpers ─────────────────────────────────────────────────────────────
async function devicesArray() {
  const res = await pool.query('SELECT * FROM devices');
  return res.rows;
}

module.exports = { pool, initDB, devicesArray };
