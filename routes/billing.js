const express = require('express');
const { createCheckoutSession } = require('../services/stripe');
const config = require('../config');
const { requireAuth, requireRole } = require('../middleware/auth');

module.exports = function billingRoutes(db) {
  const router = express.Router();

  router.get('/abonament', (req, res) => {
    if (!req.user) return res.redirect('/autentificare');
    const plans = db.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY id').all();
    const sub = db
      .prepare(
        `SELECT us.*, p.code, p.name FROM user_subscriptions us
         JOIN plans p ON p.id = us.plan_id
         WHERE us.user_id = ? AND us.status = 'active' AND (us.ends_at IS NULL OR us.ends_at > datetime('now'))
         ORDER BY us.id DESC LIMIT 1`
      )
      .get(req.user.id);
    res.render('billing-plans', {
      layout: 'layouts/main',
      title: 'Abonament',
      path: '/abonament',
      plans,
      subscription: sub,
    });
  });

  router.post('/abonament/checkout', async (req, res) => {
    if (!req.user) return res.redirect('/autentificare');
    try {
      const session = await createCheckoutSession({
        userId: req.user.id,
        paymentType: 'subscription',
        successUrl: `${config.baseUrl}/abonament/succes?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${config.baseUrl}/abonament`,
        metadata: { plan_code: 'vip' },
      });
      db.prepare(
        `INSERT INTO payments (user_id, stripe_session_id, payment_type, amount_cents, currency, status)
         VALUES (?, ?, 'subscription', 0, 'RON', 'pending')`
      ).run(req.user.id, session.id);
      res.redirect(303, session.url);
    } catch (e) {
      console.error(e);
      req.session.flash = { error: 'Plata nu poate fi inițiată. Stripe neconfigurat?' };
      res.redirect('/abonament');
    }
  });

  router.get('/abonament/succes', (req, res) => {
    req.session.flash = {
      success: 'Plată în curs de confirmare. Actualizăm abonamentul după confirmarea Stripe.',
    };
    res.redirect('/abonament');
  });

  router.post('/abonament/promovare', requireAuth, requireRole('craftsman'), async (req, res) => {
    const listingId = Number(req.body.listing_id);
    const pkgId = Number(req.body.promotion_package_id);
    const pkg = db.prepare('SELECT * FROM promotion_packages WHERE id = ? AND is_active = 1').get(pkgId);
    const listing = db.prepare('SELECT * FROM listings WHERE id = ? AND user_id = ?').get(listingId, req.user.id);
    if (!pkg || !listing) {
      req.session.flash = { error: 'Date invalide pentru promovare.' };
      return res.redirect('/cont/anunturi');
    }
    try {
      const session = await createCheckoutSession({
        userId: req.user.id,
        paymentType: 'promotion',
        successUrl: `${config.baseUrl}/cont/anunturi?platit=1`,
        cancelUrl: `${config.baseUrl}/cont/anunturi`,
        metadata: { listing_id: String(listingId), promotion_package_id: String(pkgId) },
        lineItemPriceData: {
          currency: 'ron',
          unit_amount: pkg.price_amount,
          product_data: { name: pkg.name },
        },
      });
      db.prepare(
        `INSERT INTO payments (user_id, stripe_session_id, payment_type, amount_cents, currency, status)
         VALUES (?, ?, 'promotion', ?, 'RON', 'pending')`
      ).run(req.user.id, session.id, pkg.price_amount);
      res.redirect(303, session.url);
    } catch (e) {
      console.error(e);
      req.session.flash = { error: 'Nu s-a putut iniția plata.' };
      res.redirect('/cont/anunturi');
    }
  });

  return router;
};
