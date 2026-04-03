const fs = require('fs');
const path = require('path');
const config = require('../config');
const { openDatabase } = require('../config/database');

const dbPath = path.resolve(process.cwd(), config.databasePath);
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const schemaPath = path.join(__dirname, 'schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8');

if (fs.existsSync(dbPath)) {
  try {
    fs.unlinkSync(dbPath);
  } catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM') {
      console.error(
        '\nNu se poate șterge data/app.db: fișierul este blocat (Windows EBUSY).\n' +
          'Oprește serverul Node (Ctrl+C la npm start) sau procesul care folosește portul 3000:\n' +
          '  netstat -ano | findstr :3000\n' +
          '  taskkill /PID <pid> /F\n' +
          'Apoi rulează din nou: npm run db:migrate\n'
      );
      process.exit(1);
    }
    throw e;
  }
  for (const suf of ['-wal', '-shm']) {
    try {
      const f = dbPath + suf;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (_) {
      /* ignore */
    }
  }
}

const db = openDatabase(config.databasePath);
db.exec(sql);
db.close();
console.log('Baza recreată:', dbPath);
