/**
 * Sincronizează câmpurile snapshot pe listings din promoțiile active (listing_promotions + promotion_packages).
 */
function syncListingPromotionSnapshot(db, listingId) {
  const lid = Number(listingId);
  const rows = db
    .prepare(
      `SELECT lp.*, pp.promotion_type
       FROM listing_promotions lp
       LEFT JOIN promotion_packages pp ON pp.id = lp.promotion_package_id
       WHERE lp.listing_id = ? AND lp.status = 'active' AND lp.ends_at > datetime('now')`
    )
    .all(lid);

  let isFeatured = 0;
  let featuredUntil = null;
  let isHighlighted = 0;
  let priorityRank = 0;

  for (const r of rows) {
    const t = r.promotion_type || 'priority';
    if (t === 'featured') {
      isFeatured = 1;
      if (!featuredUntil || r.ends_at > featuredUntil) featuredUntil = r.ends_at;
    }
    if (t === 'highlight') isHighlighted = 1;
    if (t === 'priority') {
      const pr = Math.min(100, priorityRank + 10);
      priorityRank = pr;
    }
  }

  if (rows.length === 0) {
    db.prepare(
      `UPDATE listings SET is_featured = 0, featured_until = NULL, is_highlighted = 0, priority_rank = 0, updated_at = datetime('now') WHERE id = ?`
    ).run(lid);
    return;
  }

  db.prepare(
    `UPDATE listings SET is_featured = ?, featured_until = ?, is_highlighted = ?, priority_rank = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(isFeatured, featuredUntil, isHighlighted, priorityRank, lid);
}

module.exports = { syncListingPromotionSnapshot };
