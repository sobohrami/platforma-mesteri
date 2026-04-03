const { getDb } = require('../config/database');

function notifyProjectMatch(db, projectId) {
  const project = db
    .prepare(
      `SELECT p.*, c.slug AS city_slug, co.slug AS county_slug
       FROM projects p
       JOIN cities c ON c.id = p.city_id
       JOIN counties co ON co.id = c.county_id
       WHERE p.id = ? AND p.status = 'approved'`
    )
    .get(projectId);
  if (!project) return 0;

  const listings = db
    .prepare(
      `SELECT DISTINCT l.user_id
       FROM listings l
       LEFT JOIN listing_coverage_areas lca ON lca.listing_id = l.id
       WHERE l.status = 'approved'
         AND l.category_id = ? AND l.subcategory_id = ?
         AND (l.primary_city_id = ? OR lca.city_id = ?)`
    )
    .all(project.category_id, project.subcategory_id, project.city_id, project.city_id);

  const ins = db.prepare(
    `INSERT INTO notifications (user_id, type, title, body, link_url)
     VALUES (?, 'project_match', ?, ?, ?)`
  );
  let n = 0;
  const link = `/proiect/${project.slug}`;
  const title = 'Proiect nou în zona ta';
  const body = project.title;
  for (const row of listings) {
    if (row.user_id === project.user_id) continue;
    ins.run(row.user_id, title, body, link);
    n += 1;
  }
  return n;
}

module.exports = { notifyProjectMatch };
