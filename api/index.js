'use strict';
/**
 * DIAGNOSTIC MODE — replace with real app once error is identified.
 */
const path = require('path');
const fs   = require('fs');

const lines = [];
const ok  = (msg) => lines.push('✓ ' + msg);
const err = (msg) => lines.push('✗ ' + msg);

lines.push('=== Vercel Diagnostic ===');
lines.push('Node: ' + process.version);
lines.push('Platform: ' + process.platform);
lines.push('CWD: ' + process.cwd());
lines.push('__dirname: ' + __dirname);
lines.push('');

// 1. /tmp writable?
try {
  fs.mkdirSync('/tmp/_diag', { recursive: true });
  fs.writeFileSync('/tmp/_diag/test.txt', 'ok');
  ok('/tmp writable');
} catch (e) {
  err('/tmp writable: ' + e.message);
}

// 2. node:sqlite?
try {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('/tmp/_diag_test.db');
  db.exec('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY)');
  db.close();
  ok('node:sqlite works');
} catch (e) {
  err('node:sqlite: ' + e.message);
}

// 3. session-file-store?
try {
  const session = require('express-session');
  const FileStore = require('session-file-store')(session);
  new FileStore({ path: '/tmp/sessions', logFn: () => {} });
  ok('session-file-store works');
} catch (e) {
  err('session-file-store: ' + e.message);
}

// 4. Schema file present?
try {
  const sqlPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  ok('schema.sql found (' + sql.length + ' bytes)');
} catch (e) {
  err('schema.sql: ' + e.message);
}

// 5. Set env vars then try loading the full app
lines.push('');
lines.push('--- Loading app ---');
try {
  if (!process.env.DATABASE_PATH) process.env.DATABASE_PATH = '/tmp/app.db';
  if (!process.env.SESSION_PATH)  process.env.SESSION_PATH  = '/tmp/sessions';
  if (!process.env.UPLOADS_PATH)  process.env.UPLOADS_PATH  = '/tmp/uploads';

  for (const d of ['/tmp/sessions', '/tmp/uploads', '/tmp/uploads/listings']) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  // Init DB schema
  const { openDatabase } = require('../config/database');
  const schemaSQL = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const rawDb = process.env.DATABASE_PATH;
  const absDb = rawDb.startsWith('/') ? rawDb : path.resolve(process.cwd(), rawDb);
  const isEmpty = !fs.existsSync(absDb) || fs.statSync(absDb).size === 0;
  if (isEmpty) {
    const initDb = openDatabase(rawDb);
    initDb.exec(schemaSQL);
    initDb.close();
    ok('DB schema applied');
    require('../db/seed');
    ok('DB seeded');
  } else {
    ok('DB already exists');
  }
} catch (e) {
  err('DB init: ' + e.message);
  lines.push(e.stack || '');
}

let realApp;
try {
  realApp = require('../app');
  ok('app.js loaded');
} catch (e) {
  err('app.js load: ' + e.message);
  lines.push(e.stack || '');
}

lines.push('');
lines.push('=== End Diagnostic ===');

const report = lines.join('\n');
console.log(report);

module.exports = realApp || ((req, res) => {
  res.statusCode = 500;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(report);
});
