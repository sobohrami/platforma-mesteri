const express = require('express');
const { sendMail } = require('../services/email');

module.exports = function adminRoutes(db) {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
      req.session.flash = { error: 'Acces admin.' };
      return res.redirect('/');
    }
    next();
  });

  router.get('/admin', (req, res) => {
    const pendingListings = db
      .prepare(`SELECT * FROM listings WHERE status = 'flagged' ORDER BY created_at DESC LIMIT 50`)
      .all();
    const pendingProjects = db
      .prepare(`SELECT * FROM projects WHERE status = 'flagged' ORDER BY created_at DESC LIMIT 50`)
      .all();
    const verif = db
      .prepare(
        `SELECT vr.*, u.email FROM verification_requests vr JOIN users u ON u.id = vr.user_id WHERE vr.status = 'pending_review'`
      )
      .all();
    res.render('admin-dashboard', {
      layout: 'layouts/main',
      title: 'Admin',
      path: '/admin',
      pendingListings,
      pendingProjects,
      verifications: verif,
    });
  });

  router.post('/admin/listings/:id/approve', (req, res) => {
    db.prepare(`UPDATE listings SET status = 'approved', moderation_reason = NULL WHERE id = ?`).run(
      Number(req.params.id)
    );
    res.redirect('/admin');
  });

  router.post('/admin/listings/:id/reject', (req, res) => {
    db.prepare(`UPDATE listings SET status = 'rejected' WHERE id = ?`).run(Number(req.params.id));
    res.redirect('/admin');
  });

  router.post('/admin/projects/:id/approve', (req, res) => {
    const id = Number(req.params.id);
    db.prepare(`UPDATE projects SET status = 'approved', moderation_reason = NULL WHERE id = ?`).run(id);
    const { notifyProjectMatch } = require('../services/notifications');
    notifyProjectMatch(db, id);
    res.redirect('/admin');
  });

  router.post('/admin/projects/:id/reject', (req, res) => {
    db.prepare(`UPDATE projects SET status = 'rejected' WHERE id = ?`).run(Number(req.params.id));
    res.redirect('/admin');
  });

  router.post('/admin/verification/:id/approve', (req, res) => {
    const id = Number(req.params.id);
    const vr = db.prepare('SELECT user_id FROM verification_requests WHERE id = ?').get(id);
    if (vr) {
      db.prepare(`UPDATE verification_requests SET status = 'approved', reviewed_at = datetime('now') WHERE id = ?`).run(
        id
      );
      const ex = db.prepare('SELECT id FROM user_verifications WHERE user_id = ?').get(vr.user_id);
      if (ex) {
        db.prepare(
          `UPDATE user_verifications SET is_verified = 1, verified_at = datetime('now'), verification_request_id = ? WHERE user_id = ?`
        ).run(id, vr.user_id);
      } else {
        db.prepare(
          `INSERT INTO user_verifications (user_id, is_verified, verified_at, verification_request_id) VALUES (?, 1, datetime('now'), ?)`
        ).run(vr.user_id, id);
      }
    }
    res.redirect('/admin');
  });

  router.get('/admin/bannere', (req, res) => {
    const rows = db.prepare('SELECT * FROM banners ORDER BY id DESC').all();
    const cats = db.prepare('SELECT id, name FROM categories').all();
    res.render('admin-banners', {
      layout: 'layouts/main',
      title: 'Bannere',
      path: '/admin/bannere',
      banners: rows,
      categories: cats,
    });
  });

  router.post('/admin/bannere', (req, res) => {
    const b = req.body;
    db.prepare(
      `INSERT INTO banners (title, image_path, target_url, placement, category_id, starts_at, ends_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(
      b.title,
      b.image_path,
      b.target_url,
      b.placement,
      b.category_id ? Number(b.category_id) : null,
      b.starts_at,
      b.ends_at
    );
    res.redirect('/admin/bannere');
  });

  router.get('/admin/plati', (req, res) => {
    const rows = db.prepare('SELECT * FROM payments ORDER BY created_at DESC LIMIT 100').all();
    res.render('admin-payments', {
      layout: 'layouts/main',
      title: 'Plăți',
      path: '/admin/plati',
      payments: rows,
    });
  });

  router.get('/admin/email', (req, res) => {
    res.render('admin-email', {
      layout: 'layouts/main',
      title: 'Trimite email',
      path: '/admin/email',
      to: req.query.to || '',
    });
  });

  router.post('/admin/email', async (req, res) => {
    const { to, subject, body } = req.body;
    try {
      await sendMail(to, subject, body);
      req.session.flash = { success: 'Email trimis (sau SMTP dezactivat în log).' };
    } catch (e) {
      req.session.flash = { error: String(e.message) };
    }
    res.redirect('/admin/email');
  });

  router.get('/admin/categorii', (req, res) => {
    const rows = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
    res.render('admin-categories', {
      layout: 'layouts/main',
      title: 'Categorii',
      path: '/admin/categorii',
      categories: rows,
    });
  });

  return router;
};
