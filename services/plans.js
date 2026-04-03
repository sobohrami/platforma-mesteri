/**
 * Limite plan + categorie pentru anunțuri active (approved).
 */
function getActiveSubscription(db, userId) {
  const now = new Date().toISOString();
  return db
    .prepare(
      `SELECT us.*, p.code, p.max_active_listings, p.included_promotions, p.has_priority_boost, p.can_request_verification
       FROM user_subscriptions us
       JOIN plans p ON p.id = us.plan_id
       WHERE us.user_id = ? AND us.status = 'active'
         AND (us.ends_at IS NULL OR us.ends_at > ?)
       ORDER BY us.id DESC LIMIT 1`
    )
    .get(userId, now);
}

function countApprovedListingsForUser(db, userId) {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS c FROM listings WHERE user_id = ? AND status = 'approved'`
    )
    .get(userId);
  return r.c;
}

function countApprovedListingsInCategory(db, userId, categoryId) {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS c FROM listings WHERE user_id = ? AND category_id = ? AND status = 'approved'`
    )
    .get(userId, categoryId);
  return r.c;
}

function canCreateListing(db, userId, categoryId) {
  const sub = getActiveSubscription(db, userId);
  if (!sub) {
    return { ok: false, reason: 'Nu există abonament activ.' };
  }
  const planMax = sub.max_active_listings;
  const total = countApprovedListingsForUser(db, userId);
  if (total >= planMax) {
    return { ok: false, reason: `Limită anunțuri atinsă (${planMax}) pentru planul curent.` };
  }
  const lim = db
    .prepare('SELECT max_listings_per_user FROM category_listing_limits WHERE category_id = ?')
    .get(categoryId);
  if (lim) {
    const inCat = countApprovedListingsInCategory(db, userId, categoryId);
    if (inCat >= lim.max_listings_per_user) {
      return {
        ok: false,
        reason: `Limită pentru această categorie: ${lim.max_listings_per_user} anunțuri.`,
      };
    }
  }
  return { ok: true, subscription: sub };
}

function countUsedIncludedPromotions(db, userId, subscriptionId) {
  const r = db
    .prepare(
      `SELECT COUNT(*) AS c FROM listing_promotions
       WHERE user_id = ? AND source_type = 'subscription_included' AND status = 'active'`
    )
    .get(userId);
  return r.c;
}

module.exports = {
  getActiveSubscription,
  canCreateListing,
  countApprovedListingsForUser,
  countUsedIncludedPromotions,
};
