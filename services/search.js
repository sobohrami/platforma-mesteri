/**
 * Listări publice: sortare priority_rank DESC, featured, VIP boost, created_at
 */
function buildListingWhere(filters) {
  const clauses = [`l.status = 'approved'`, `l.is_active = 1`];
  const params = [];
  if (filters.categoryId) {
    clauses.push('l.category_id = ?');
    params.push(filters.categoryId);
  }
  if (filters.subcategoryId) {
    clauses.push('l.subcategory_id = ?');
    params.push(filters.subcategoryId);
  }
  if (filters.cityId) {
    clauses.push('(l.primary_city_id = ? OR EXISTS (SELECT 1 FROM listing_coverage_areas lca WHERE lca.listing_id = l.id AND lca.city_id = ?))');
    params.push(filters.cityId, filters.cityId);
  }
  if (filters.countyId) {
    clauses.push('l.primary_county_id = ?');
    params.push(filters.countyId);
  }
  return { where: clauses.join(' AND '), params };
}

function listingOrderSql() {
  return `
    ORDER BY
      l.priority_rank DESC,
      l.is_featured DESC,
      CASE WHEN l.featured_until IS NOT NULL AND l.featured_until > datetime('now') THEN 1 ELSE 0 END DESC,
      CASE WHEN vip.code = 'vip' THEN 1 ELSE 0 END DESC,
      l.created_at DESC
  `;
}

function listingJoinVip() {
  return `
    LEFT JOIN user_subscriptions us ON us.user_id = l.user_id AND us.status = 'active'
      AND (us.ends_at IS NULL OR us.ends_at > datetime('now'))
    LEFT JOIN plans vip ON vip.id = us.plan_id
  `;
}

module.exports = { buildListingWhere, listingOrderSql, listingJoinVip };
