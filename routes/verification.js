const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getActiveSubscription } = require('../services/plans');
const { createCheckoutSession } = require('../services/stripe');
const config = require('../config');

module.exports = function verificationRoutes(db) {
  const router = express.Router();

  router.get('/verificare', requireAuth, requireRole('craftsman'), (req, res) => {
    const uv = db.prepare('SELECT * FROM user_verifications WHERE user_id = ?').get(req.user.id);
    const last = db
      .prepare(
        `SELECT * FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(req.user.id);
    const sub = getActiveSubscription(db, req.user.id);
    const canPay = sub && sub.can_request_verification === 1;
    res.render('verification', {
      layout: 'layouts/main',
      title: 'Verificare meșter',
      path: '/verificare',
      verification: uv,
      lastRequest: last,
      canPay,
    });
  });

  router.post('/verificare/plata', requireAuth, requireRole('craftsman'), async (req, res) => {
    const sub = getActiveSubscription(db, req.user.id);
    if (!sub || sub.can_request_verification !== 1) {
      req.session.flash = { error: 'Planul curent nu permite cererea de verificare (VIP).' };
      return res.redirect('/verificare');
    }
    const pending = db
      .prepare(
        `SELECT id FROM verification_requests WHERE user_id = ? AND status IN ('pending_payment', 'pending_review')`
      )
      .get(req.user.id);
    if (pending) {
      req.session.flash = { error: 'Aveți deja o cerere în curs.' };
      return res.redirect('/verificare');
    }
    const ins = db
      .prepare(`INSERT INTO verification_requests (user_id, status) VALUES (?, 'pending_payment')`)
      .run(req.user.id);
    const vrId = ins.lastInsertRowid;
    try {
      const session = await createCheckoutSession({
        userId: req.user.id,
        paymentType: 'verification',
        successUrl: `${config.baseUrl}/verificare?platit=1`,
        cancelUrl: `${config.baseUrl}/verificare`,
        metadata: { verification_request_id: String(vrId) },
      });
      db.prepare(
        `INSERT INTO payments (user_id, stripe_session_id, payment_type, amount_cents, currency, status)
         VALUES (?, ?, 'verification', 0, 'RON', 'pending')`
      ).run(req.user.id, session.id);
      res.redirect(303, session.url);
    } catch (e) {
      console.error(e);
      db.prepare(`DELETE FROM verification_requests WHERE id = ?`).run(vrId);
      req.session.flash = { error: 'Plata nu a putut fi inițiată.' };
      res.redirect('/verificare');
    }
  });

  return router;
};
