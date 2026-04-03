const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const expressLayouts = require('express-ejs-layouts');
const csrf = require('csurf');

const config = require('./config');
const { getDb } = require('./config/database');
const { loadUser } = require('./middleware/auth');
const { listingUpload } = require('./middleware/upload');

const db = getDb();

const app = express();
app.set('trust proxy', 1);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layouts/main');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cookieParser());
app.use(
  session({
    store: new FileStore({ path: config.sessionPath, fileExtension: '.json' }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: config.nodeEnv === 'production', httpOnly: true, maxAge: 7 * 24 * 3600000 },
  })
);

// Stripe webhook must see raw body; register before urlencoded/json so signature verification works.
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), require('./routes/webhooks')(db));

// Body parsers must run BEFORE csurf so POST forms (e.g. login) expose req.body._csrf.
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Multipart listing form: parse before csurf so _csrf is available (same pattern as login).
const uploadsDir = config.uploadsPath.startsWith('/')
  ? config.uploadsPath
  : path.join(__dirname, config.uploadsPath);
const upload = listingUpload(path.join(uploadsDir, 'listings'));
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/adauga-anunt') {
    return upload.array('images', 5)(req, res, next);
  }
  next();
});

app.use(loadUser(db));
app.use((req, res, next) => {
  res.locals.baseUrl = config.baseUrl;
  res.locals.user = req.user || null;
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

const csrfProtection = csrf({ cookie: false });
app.use((req, res, next) => {
  if (req.path === '/webhooks/stripe') return next();
  csrfProtection(req, res, next);
});
app.use((req, res, next) => {
  if (req.path === '/webhooks/stripe') return next();
  res.locals.csrfToken = req.csrfToken();
  next();
});

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

app.use(require('./routes/home')(db, config));
app.use(require('./routes/seo')(db, config));
app.use(require('./routes/auth')(db));
app.use(require('./routes/listings')(db));
app.use(require('./routes/projects')(db));
app.use(require('./routes/chat')(db));
app.use(require('./routes/notifications')(db));
app.use(require('./routes/billing')(db));
app.use(require('./routes/verification')(db));
app.use(require('./routes/content')(db));
app.use(require('./routes/admin')(db));

app.use((req, res) => {
  res.status(404).render('404', { layout: 'layouts/main', title: 'Pagină negăsită' });
});

app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    req.session.flash = { error: 'Sesiune expirată. Reîncercați.' };
    return res.redirect(req.originalUrl || '/');
  }
  console.error(err);
  res.status(500).send('Eroare server');
});

// Export the app for Vercel (api/index.js) and for testing.
// Only bind to a port when run directly (npm start / npm run dev).
module.exports = app;

if (require.main === module) {
  const server = app.listen(config.port, () => {
    console.log(`Server http://localhost:${config.port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\nPortul ${config.port} este deja folosit (alt npm start / proces Node).\n` +
          `Găsește PID: netstat -ano | findstr :${config.port}\n` +
          `Oprește: taskkill /PID <pid> /F\n` +
          `Sau folosește alt port în .env: PORT=3001\n`
      );
      process.exit(1);
    }
    throw err;
  });
}
