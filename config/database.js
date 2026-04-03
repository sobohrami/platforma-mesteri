const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const config = require('./index');

/**
 * Wraps node:sqlite DatabaseSync with better-sqlite3–compatible helpers:
 * pragma(), transaction(), prepare(), exec(), close()
 */
function wrapDatabase(native) {
  function pragma(pragmaSql) {
    native.exec(`PRAGMA ${pragmaSql}`);
  }

  function transaction(fn) {
    return function transactionWrapped(...args) {
      native.exec('BEGIN IMMEDIATE');
      try {
        const result = fn.apply(null, args);
        native.exec('COMMIT');
        return result;
      } catch (e) {
        try {
          native.exec('ROLLBACK');
        } catch (_) {
          /* ignore */
        }
        throw e;
      }
    };
  }

  return {
    prepare: (sql) => native.prepare(sql),
    exec: (sql) => native.exec(sql),
    pragma,
    transaction,
    close: () => native.close(),
  };
}

function openDatabase(dbPathRel) {
  const dbPath = path.resolve(process.cwd(), dbPathRel);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const native = new DatabaseSync(dbPath, { enableForeignKeys: true });
  const db = wrapDatabase(native);
  db.pragma('journal_mode = WAL');
  return db;
}

let _db;
function getDb() {
  if (!_db) {
    _db = openDatabase(config.databasePath);
  }
  return _db;
}

module.exports = { getDb, openDatabase, wrapDatabase };
