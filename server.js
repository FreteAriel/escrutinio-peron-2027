'use strict';
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Arrancar servidor PRIMERO (Railway health check) ─────────────────────────
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

// ─── DB Setup ────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS mesas (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL
      );
    `);
    console.log('DB inicializada OK');
  } finally {
    client.release();
  }
}

initDB().catch(err => console.error('DB Error:', err.message));

// ─── API: Mesas ───────────────────────────────────────────────────────────────
app.get('/api/mesas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, data FROM mesas ORDER BY id');
    const result = {};
    rows.forEach(r => { result[r.id] = r.data; });
    res.json(result);
  } catch (e) {
    console.error('GET /api/mesas:', e.message);
    res.json({});
  }
});

app.post('/api/mesas', async (req, res) => {
  const mesa = req.body;
  if (!mesa || !mesa.mesa) return res.status(400).json({ error: 'mesa requerida' });
  const id = String(mesa.mesa);
  try {
    await pool.query(
      `INSERT INTO mesas(id, data, updated_at) VALUES($1,$2,NOW())
       ON CONFLICT(id) DO UPDATE SET data=$2, updated_at=NOW()`,
      [id, mesa]
    );
    res.json({ ok: true, id });
  } catch (e) {
    console.error('POST /api/mesas:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/mesas', async (req, res) => {
  const secret = req.query.secret || '';
  const adminSecret = process.env.ADMIN_SECRET || 'peron2027';
  if (secret !== adminSecret) return res.status(403).json({ error: 'Forbidden' });
  try {
    await pool.query('DELETE FROM mesas');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Config ──────────────────────────────────────────────────────────────
app.get('/api/config/parties', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT value FROM config WHERE key='parties'");
    res.json(rows[0]?.value ?? []);
  } catch (e) { res.json([]); }
});

app.post('/api/config/parties', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO config(key,value) VALUES('parties',$1) ON CONFLICT(key) DO UPDATE SET value=$1`,
      [JSON.stringify(req.body)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/config/settings', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT value FROM config WHERE key='settings'");
    res.json(rows[0]?.value ?? {});
  } catch (e) { res.json({}); }
});

app.post('/api/config/settings', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO config(key,value) VALUES('settings',$1) ON CONFLICT(key) DO UPDATE SET value=$1`,
      [JSON.stringify(req.body)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }));

// ─── SPA fallback ────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
