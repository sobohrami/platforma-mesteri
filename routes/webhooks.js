const config = require('../config');
const { syncListingPromotionSnapshot } = require('../services/promotions');

function logWebhookError(err, event, context = {}) {
  console.error(
    JSON.stringify({
      scope: 'stripe_webhook_processing',
      level: 'error',
      message: err.message,
      eventId: event?.id || null,
      eventType: event?.type || null,
      context,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    })
  );
}

function applyCheckoutCompletedBusinessEffects(db, event) {
  const session = event.data.object;
  const uid = Number(session.client_reference_id || session.metadata?.user_id);
  if (!uid || session.payment_status !== 'paid') {
    return;
  }

  db.prepare(
    `UPDATE payments SET status = 'succeeded', stripe_payment_intent_id = ?, updated_at = datetime('now')
      WHERE stripe_session_id = ?`
  ).run(session.payment_intent || null, session.id);

  const meta = session.metadata || {};
  const paymentType = meta.payment_type;
  if (session.mode === 'subscription' && (meta.plan_code === 'vip' || paymentType === 'subscription')) {
    const plan = db.prepare(`SELECT id FROM plans WHERE code = 'vip'`).get();
    if (!plan) {
      throw new Error('Invariant încălcat: planul vip nu există pentru checkout.session.completed');
    }

    db.prepare(`UPDATE user_subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active'`).run(uid);
    const ends = new Date();
    ends.setMonth(ends.getMonth() + 1);
    db.prepare(
      `INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, ends_at, stripe_customer_id, stripe_subscription_id)
       VALUES (?, ?, 'active', datetime('now'), ?, ?, ?)`
    ).run(uid, plan.id, ends.toISOString(), session.customer || null, session.subscription || null);

    const activeSubscription = db
      .prepare(
        `SELECT id FROM user_subscriptions
         WHERE user_id = ? AND status = 'active' AND stripe_subscription_id = ?
         ORDER BY id DESC LIMIT 1`
      )
      .get(uid, session.subscription || null);
    if (!activeSubscription) {
      throw new Error('Invariant încălcat: event procesat fără abonament activ aplicat');
    }
    return;
  }

  if (paymentType === 'verification') {
    const vrId = Number(meta.verification_request_id);
    const pay = db.prepare('SELECT id, reference_type, reference_id, status FROM payments WHERE stripe_session_id = ?').get(session.id);
    if (!vrId || !pay) {
      throw new Error('Invariant încălcat: lipsește plata sau verification_request_id pentru plată de verificare');
    }

    db.prepare(`UPDATE verification_requests SET status = 'pending_review', payment_id = ? WHERE id = ? AND user_id = ?`).run(
      pay.id,
      vrId,
      uid
    );
    db.prepare(`UPDATE payments SET reference_type = 'verification_request', reference_id = ? WHERE id = ?`).run(vrId, pay.id);

    const invariantOk = db
      .prepare(
        `SELECT 1
         FROM verification_requests vr
         JOIN payments p ON p.id = vr.payment_id
         WHERE vr.id = ? AND vr.user_id = ? AND vr.status = 'pending_review'
           AND p.id = ? AND p.reference_type = 'verification_request' AND p.reference_id = vr.id
         LIMIT 1`
      )
      .get(vrId, uid, pay.id);
    if (!invariantOk) {
      throw new Error('Invariant încălcat: event procesat fără efectele de verificare aplicate');
    }
    return;
  }

  if (paymentType === 'promotion') {
    const listingId = Number(meta.listing_id);
    const pkgId = Number(meta.promotion_package_id);
    const pkg = db.prepare('SELECT * FROM promotion_packages WHERE id = ?').get(pkgId);
    if (!pkg || !listingId) {
      throw new Error('Invariant încălcat: date promoție invalide în metadata');
    }

    const own = db.prepare('SELECT id FROM listings WHERE id = ? AND user_id = ?').get(listingId, uid);
    if (!own) {
      throw new Error('Invariant încălcat: utilizatorul nu deține listing-ul promovat');
    }

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
    if (!pay) {
      throw new Error('Invariant încălcat: lipsește payment pentru promoție');
    }

    db.prepare(`UPDATE payments SET reference_type = 'listing_promotion', reference_id = ? WHERE id = ?`).run(lpId, pay.id);
    syncListingPromotionSnapshot(db, listingId);

    const invariantOk = db
      .prepare(
        `SELECT 1
         FROM payments p
         JOIN listing_promotions lp ON lp.id = p.reference_id
         WHERE p.id = ?
           AND p.reference_type = 'listing_promotion'
           AND lp.id = ? AND lp.listing_id = ? AND lp.user_id = ?
         LIMIT 1`
      )
      .get(pay.id, lpId, listingId, uid);
    if (!invariantOk) {
      throw new Error('Invariant încălcat: event procesat fără efectele de promovare aplicate');
    }
  }
}

module.exports = function stripeWebhookHandler(db) {
  const processEventTx = db.transaction((event) => {
    const existingEvent = db
      .prepare('SELECT id, processed_at FROM stripe_webhook_events WHERE stripe_event_id = ?')
      .get(event.id);
    if (existingEvent?.processed_at) {
      return { duplicate: true };
    }
    if (existingEvent && !existingEvent.processed_at) {
      throw new Error('Event existent în stripe_webhook_events fără processed_at; efectele business nu sunt confirmate.');
    }

    db.prepare(
      `INSERT INTO stripe_webhook_events (stripe_event_id, event_type, processed_at, payload_json)
       VALUES (?, ?, NULL, ?)`
    ).run(event.id, event.type, JSON.stringify(event.data));

    if (event.type === 'checkout.session.completed') {
      applyCheckoutCompletedBusinessEffects(db, event);
    }

    db.prepare(`UPDATE stripe_webhook_events SET processed_at = datetime('now') WHERE stripe_event_id = ?`).run(event.id);
  });

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
      logWebhookError(err, null, { stage: 'signature_validation' });
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      const result = processEventTx(event);
      if (result?.duplicate) {
        return res.json({ received: true, duplicate: true });
      }
      return res.json({ received: true });
    } catch (err) {
      logWebhookError(err, event, { stage: 'database_transaction' });
      return res.status(500).send('Webhook processing failed');
    }
  };
};
