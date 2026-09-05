const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── PostgreSQL (Railway provee DATABASE_URL automáticamente) ─────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Inicializar tablas al arrancar
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mesas (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('DB inicializada');
}

// ── API: Mesas ─────────────────────────────────────────────────────────────

// GET todas las mesas
app.get('/api/mesas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, data, updated_at FROM mesas ORDER BY id ASC');
    const result = {};
    rows.forEach(r => { result[r.id] = { ...r.data, _updatedAt: r.updated_at }; });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// GET una mesa
app.get('/api/mesas/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM mesas WHERE id=$1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Mesa no encontrada' });
    res.json(rows[0].data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST guardar/actualizar mesa
app.post('/api/mesas/:id', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO mesas (id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=NOW()`,
      [req.params.id, req.body]
    );
    res.json({ ok: true, id: req.params.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE una mesa
app.delete('/api/mesas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM mesas WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE todas las mesas (admin)
app.delete('/api/mesas', async (req, res) => {
  const { secret } = req.query;
  if (secret !== (process.env.ADMIN_SECRET || 'peron2027')) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  try {
    await pool.query('DELETE FROM mesas');
    res.json({ ok: true, mensaje: 'Todos los datos borrados' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Configuración ─────────────────────────────────────────────────────

// GET config
app.get('/api/config', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM config');
    const result = {};
    rows.forEach(r => { result[r.key] = r.value; });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST guardar config
app.post('/api/config/:key', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO config (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
      [req.params.key, req.body]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Servir PWA para todas las rutas ───────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

initDB()
  .then(() => app.listen(PORT, () => console.log(`✓ Escrutinio corriendo en puerto ${PORT}`)))
  .catch(err => { console.error('Error iniciando DB:', err); process.exit(1); });
