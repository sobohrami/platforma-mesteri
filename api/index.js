'use strict';
/**
 * Vercel serverless entry point.
 * All environment paths are set here BEFORE any module that reads config
 * is imported, so env vars propagate correctly through require() caching.
 */
const path = require('path');
const fs   = require('fs');

// On Vercel the only writable directory is /tmp.
// Set these before loading config/database so the singletons pick them up.
if (!process.env.DATABASE_PATH) process.env.DATABASE_PATH = '/tmp/app.db';
if (!process.env.SESSION_PATH)  process.env.SESSION_PATH  = '/tmp/sessions';
if (!process.env.UPLOADS_PATH)  process.env.UPLOADS_PATH  = '/tmp/uploads';

// Resolve the absolute DB path (handles both /tmp/... and relative paths)
const rawDb   = process.env.DATABASE_PATH;
const absDb   = rawDb.startsWith('/') ? rawDb : path.resolve(process.cwd(), rawDb);
const isEmpty = !fs.existsSync(absDb) || fs.statSync(absDb).size === 0;

if (isEmpty) {
  console.log('[vercel] Cold start — initialising DB at', absDb);
  try {
    const { openDatabase } = require('../config/database');
    const schemaSQL = fs.readFileSync(
      path.join(__dirname, '..', 'db', 'schema.sql'),
      'utf8'
    );
    // Use a one-off connection to apply the schema, then close it.
    // This does NOT create the getDb() singleton, so seed + app can
    // create their own shared singleton via getDb() afterwards.
    const initDb = openDatabase(rawDb);
    initDb.exec(schemaSQL);
    initDb.close();
    console.log('[vercel] Schema applied.');

    // Seed — runs immediately on require(); uses getDb() singleton.
    require('../db/seed');
    console.log('[vercel] Seed complete.');
  } catch (err) {
    console.error('[vercel] DB init error:', err);
  }
}

// Export the Express app — Vercel calls it as a request handler.
// app.js must NOT call app.listen() when imported (it checks require.main).
module.exports = require('../app');
