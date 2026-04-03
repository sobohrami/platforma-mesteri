const express = require('express');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const rateLimit = require('express-rate-limit');

module.exports = function authRoutes(db) {
  const router = express.Router();
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

  router.get('/inregistrare', (req, res) => {
    res.render('auth-register', {
      layout: 'layouts/main',
      title: 'Înregistrare',
      description: 'Creează cont meșter sau client.',
      path: '/inregistrare',
    });
  });

  router.post('/inregistrare', (req, res) => {
    const { email, password, password2, role, display_name } = req.body;
    if (!email || !password || password !== password2) {
      req.session.flash = { error: 'Completați corect câmpurile.' };
      return res.redirect('/inregistrare');
    }
    if (!['craftsman', 'client'].includes(role)) {
      req.session.flash = { error: 'Rol invalid.' };
      return res.redirect('/inregistrare');
    }
    if (!validator.isEmail(email)) {
      req.session.flash = { error: 'Email invalid.' };
      return res.redirect('/inregistrare');
    }
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (exists) {
      req.session.flash = { error: 'Există deja un cont cu acest email.' };
      return res.redirect('/inregistrare');
    }
    const hash = bcrypt.hashSync(password, 12);
    const tx = db.transaction(() => {
      const r = db
        .prepare(
          `INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, ?, 'active')`
        )
        .run(email.trim().toLowerCase(), hash, role);
      const uid = r.lastInsertRowid;
      db.prepare(
        `INSERT INTO user_profiles (user_id, display_name) VALUES (?, ?)`
      ).run(uid, display_name || email.split('@')[0]);
      const free = db.prepare(`SELECT id FROM plans WHERE code = 'free'`).get();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, ends_at)
         VALUES (?, ?, 'active', ?, NULL)`
      ).run(uid, free.id, now);
      db.prepare(
        `INSERT INTO user_verifications (user_id, is_verified) VALUES (?, 0)`
      ).run(uid);
    });
    tx();
    req.session.flash = { success: 'Cont creat. Autentificați-vă.' };
    res.redirect('/autentificare');
  });

  router.get('/autentificare', (req, res) => {
    res.render('auth-login', {
      layout: 'layouts/main',
      title: 'Autentificare',
      description: 'Intră în cont.',
      path: '/autentificare',
      nextUrl: req.query.next || '/',
    });
  });

  router.post('/autentificare', loginLimiter, (req, res) => {
    const { email, password } = req.body;
    const nextUrl = req.body.next || '/';
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      req.session.flash = { error: 'Email sau parolă incorectă.' };
      return res.redirect('/autentificare');
    }
    if (user.status !== 'active') {
      req.session.flash = { error: 'Cont suspendat.' };
      return res.redirect('/autentificare');
    }
    req.session.userId = user.id;
    req.session.flash = { success: 'Bun venit!' };
    res.redirect(nextUrl.startsWith('/') ? nextUrl : '/');
  });

  router.post('/deconectare', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/');
    });
  });

  return router;
};
