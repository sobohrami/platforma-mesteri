'use strict';
/**
 * Vercel serverless entry point.
 * Env paths are set BEFORE any module that reads config is required,
 * so env vars propagate correctly through the require() cache.
 */
const path = require('path');
const fs   = require('fs');

// On Vercel the only writable directory is /tmp.
if (!process.env.DATABASE_PATH) process.env.DATABASE_PATH = '/tmp/app.db';
if (!process.env.SESSION_PATH)  process.env.SESSION_PATH  = '/tmp/sessions';
if (!process.env.UPLOADS_PATH)  process.env.UPLOADS_PATH  = '/tmp/uploads';

// Ensure writable directories exist before any module tries to use them.
for (const dir of ['/tmp/sessions', '/tmp/uploads', '/tmp/uploads/listings']) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const rawDb = process.env.DATABASE_PATH;
const absDb = rawDb.startsWith('/') ? rawDb : path.resolve(process.cwd(), rawDb);
const isEmpty = !fs.existsSync(absDb) || fs.statSync(absDb).size === 0;

if (isEmpty) {
  console.log('[vercel] Cold start — Node', process.version, '— initialising DB at', absDb);
  try {
    const { openDatabase } = require('../config/database');
    const schemaSQL = fs.readFileSync(
      path.join(__dirname, '..', 'db', 'schema.sql'),
      'utf8'
    );
    const initDb = openDatabase(rawDb);
    initDb.exec(schemaSQL);
    initDb.close();
    console.log('[vercel] Schema applied.');
    require('../db/seed');
    console.log('[vercel] Seed complete.');
  } catch (err) {
    console.error('[vercel] DB init error:', err.stack || err);
  }
}

// Load the Express app. Wrap in try/catch so any startup crash is visible.
let app;
try {
  app = require('../app');
} catch (err) {
  console.error('[vercel] App load error:', err.stack || err);
  // Return the real error as a 500 so it appears in the browser / logs.
  app = (req, res) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('App failed to load:\n\n' + (err.stack || err.message));
  };
}

module.exports = app;
