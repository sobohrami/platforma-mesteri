const config = require('../config');
const { syncListingPromotionSnapshot } = require('../services/promotions');

module.exports = function stripeWebhookHandler(db) {
  return (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!config.stripe.webhookSecret || !config.stripe.secretKey) {
      return res.status(400).send('Stripe neconfigurat');
    }
    let event;
    try {
      const Stripe = require('stripe');
      const stripe = new Stripe(config.stripe.secretKey);
      event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
    } catch (err) {
      console.error(err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const dup = db.prepare('SELECT id FROM stripe_webhook_events WHERE stripe_event_id = ?').get(event.id);
    if (dup) return res.json({ received: true });

    db.prepare(
      `INSERT INTO stripe_webhook_events (stripe_event_id, event_type, payload_json) VALUES (?, ?, ?)`
    ).run(event.id, event.type, JSON.stringify(event.data));

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const uid = Number(session.client_reference_id || session.metadata?.user_id);
      if (uid && session.payment_status === 'paid') {
        db.prepare(`UPDATE payments SET status = 'succeeded', stripe_payment_intent_id = ?, updated_at = datetime('now')
          WHERE stripe_session_id = ?`).run(session.payment_intent || null, session.id);
        const meta = session.metadata || {};
        const paymentType = meta.payment_type;
        if (session.mode === 'subscription' && (meta.plan_code === 'vip' || paymentType === 'subscription')) {
          const plan = db.prepare(`SELECT id FROM plans WHERE code = 'vip'`).get();
          if (plan) {
            db.prepare(`UPDATE user_subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active'`).run(
              uid
            );
            const ends = new Date();
            ends.setMonth(ends.getMonth() + 1);
            db.prepare(
              `INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, ends_at, stripe_customer_id, stripe_subscription_id)
               VALUES (?, ?, 'active', datetime('now'), ?, ?, ?)`
            ).run(
              uid,
              plan.id,
              ends.toISOString(),
              session.customer || null,
              session.subscription || null
            );
          }
        } else if (paymentType === 'verification') {
          const vrId = Number(meta.verification_request_id);
          const pay = db.prepare('SELECT id FROM payments WHERE stripe_session_id = ?').get(session.id);
          if (vrId && pay) {
            db.prepare(
              `UPDATE verification_requests SET status = 'pending_review', payment_id = ? WHERE id = ? AND user_id = ?`
            ).run(pay.id, vrId, uid);
            db.prepare(`UPDATE payments SET reference_type = 'verification_request', reference_id = ? WHERE id = ?`).run(
              vrId,
              pay.id
            );
          }
        } else if (paymentType === 'promotion') {
          const listingId = Number(meta.listing_id);
          const pkgId = Number(meta.promotion_package_id);
          const pkg = db.prepare('SELECT * FROM promotion_packages WHERE id = ?').get(pkgId);
          if (pkg && listingId) {
            const own = db.prepare('SELECT id FROM listings WHERE id = ? AND user_id = ?').get(listingId, uid);
            if (own) {
              const starts = new Date().toISOString();
              const ends = new Date(Date.now() + pkg.duration_days * 86400000).toISOString();
              const ins = db
                .prepare(
                  `INSERT INTO listing_promotions (listing_id, user_id, promotion_package_id, source_type, starts_at, ends_at, status)
                   VALUES (?, ?, ?, 'paid', ?, ?, 'active')`
                )
                .run(listingId, uid, pkgId, starts, ends);
              const lpId = ins.lastInsertRowid;
              const pay = db.prepare('SELECT id FROM payments WHERE stripe_session_id = ?').get(session.id);
              if (pay) {
                db.prepare(`UPDATE payments SET reference_type = 'listing_promotion', reference_id = ? WHERE id = ?`).run(
                  lpId,
                  pay.id
                );
              }
              syncListingPromotionSnapshot(db, listingId);
            }
          }
        }
      }
    }

    res.json({ received: true });
  };
};
