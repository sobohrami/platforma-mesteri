const slugify = require('slugify');

function slug(text, options = {}) {
  return slugify(String(text || ''), {
    lower: true,
    strict: true,
    locale: 'ro',
    ...options,
  });
}

function uniqueListingSlug(db, base, excludeId = null) {
  let s = slug(base) || 'anunt';
  let n = 0;
  while (true) {
    const candidate = n ? `${s}-${n}` : s;
    const row = db.prepare('SELECT id FROM listings WHERE slug = ?').get(candidate);
    if (!row || (excludeId && row.id === excludeId)) return candidate;
    n += 1;
  }
}

function uniqueProjectSlug(db, base, excludeId = null) {
  let s = slug(base) || 'proiect';
  let n = 0;
  while (true) {
    const candidate = n ? `${s}-${n}` : s;
    const row = db.prepare('SELECT id FROM projects WHERE slug = ?').get(candidate);
    if (!row || (excludeId && row.id === excludeId)) return candidate;
    n += 1;
  }
}

module.exports = { slug, uniqueListingSlug, uniqueProjectSlug };
