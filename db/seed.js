const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const config = require('../config');

const db = getDb();

function run() {
  const counties = [
    { name: 'București', slug: 'bucuresti', sort: 0 },
    { name: 'Cluj', slug: 'cluj', sort: 1 },
    { name: 'Iași', slug: 'iasi', sort: 2 },
    { name: 'Timiș', slug: 'timis', sort: 3 },
    { name: 'Constanța', slug: 'constanta', sort: 4 },
  ];

  const insCounty = db.prepare(
    'INSERT OR IGNORE INTO counties (name, slug, sort_order) VALUES (@name, @slug, @sort)'
  );
  for (const c of counties) {
    insCounty.run(c);
  }

  const buc = db.prepare('SELECT id FROM counties WHERE slug = ?').get('bucuresti');
  const cluj = db.prepare('SELECT id FROM counties WHERE slug = ?').get('cluj');

  const cities = [
    { county_id: buc.id, name: 'București', slug: 'bucuresti', sort: 0 },
    { county_id: cluj.id, name: 'Cluj-Napoca', slug: 'cluj-napoca', sort: 0 },
    { county_id: db.prepare('SELECT id FROM counties WHERE slug = ?').get('iasi').id, name: 'Iași', slug: 'iasi', sort: 0 },
    { county_id: db.prepare('SELECT id FROM counties WHERE slug = ?').get('timis').id, name: 'Timișoara', slug: 'timisoara', sort: 0 },
    { county_id: db.prepare('SELECT id FROM counties WHERE slug = ?').get('constanta').id, name: 'Constanța', slug: 'constanta', sort: 0 },
  ];

  const insCity = db.prepare(
    'INSERT OR IGNORE INTO cities (county_id, name, slug, sort_order) VALUES (@county_id, @name, @slug, @sort)'
  );
  for (const c of cities) {
    insCity.run(c);
  }

  const cats = [
    { name: 'Instalații', slug: 'instalatii', desc: 'Instalații sanitare, încălzire', sort: 0 },
    { name: 'Electricieni', slug: 'electricieni', desc: 'Lucrări electrice', sort: 1 },
    { name: 'Zugravi', slug: 'zugravi', desc: 'Vopsitorie, tencuieli', sort: 2 },
    { name: 'Renovări', slug: 'renovari', desc: 'Renovări generale', sort: 3 },
    { name: 'Tâmplărie', slug: 'tamplarie', desc: 'Tâmplărie PVC și lemn', sort: 4 },
    { name: 'Acoperișuri', slug: 'acoperisuri', desc: 'Acoperișuri și hidroizolații', sort: 5 },
    { name: 'Gresie și faianță', slug: 'gresie-faianta', desc: 'Placări', sort: 6 },
    { name: 'Curățenie', slug: 'curatenie', desc: 'Servicii curățenie', sort: 7 },
  ];

  const insCat = db.prepare(
    'INSERT OR IGNORE INTO categories (name, slug, description, sort_order) VALUES (@name, @slug, @desc, @sort)'
  );
  for (const c of cats) {
    insCat.run({ name: c.name, slug: c.slug, desc: c.desc, sort: c.sort });
  }

  const subMap = [
    ['instalatii', [
      ['Instalații sanitare', 'instalatii-sanitare'],
      ['Încălzire', 'incalzire'],
    ]],
    ['electricieni', [
      ['Instalații electrice', 'instalatii-electrice'],
      ['Tablou electric', 'tablou-electric'],
    ]],
    ['zugravi', [
      ['Vopsitorie interior', 'vopsitorie-interior'],
      ['Tencuieli', 'tencuieli'],
    ]],
    ['renovari', [
      ['Renovare apartament', 'renovare-apartament'],
      ['Renovare baie', 'renovare-baie'],
    ]],
    ['tamplarie', [
      ['Tâmplărie PVC', 'tamplarie-pvc'],
      ['Uși și ferestre', 'usi-ferestre'],
    ]],
    ['acoperisuri', [
      ['Șindrilă', 'sindrila'],
      ['Hidroizolații', 'hidroizolatii'],
    ]],
    ['gresie-faianta', [
      ['Placări baie', 'placari-baie'],
      ['Placări bucătărie', 'placari-bucatarie'],
    ]],
    ['curatenie', [
      ['Curățenie după șantier', 'curatenie-dupa-santier'],
      ['Curățenie generală', 'curatenie-generala'],
    ]],
  ];

  const insSub = db.prepare(
    'INSERT OR IGNORE INTO subcategories (category_id, name, slug, sort_order) VALUES (?, ?, ?, ?)'
  );
  let sort = 0;
  for (const [catSlug, subs] of subMap) {
    const cat = db.prepare('SELECT id FROM categories WHERE slug = ?').get(catSlug);
    if (!cat) continue;
    for (const [name, slug] of subs) {
      insSub.run(cat.id, name, slug, sort++);
    }
  }

  const insLimit = db.prepare(
    'INSERT OR IGNORE INTO category_listing_limits (category_id, max_listings_per_user) VALUES (?, ?)'
  );
  const allCats = db.prepare('SELECT id FROM categories').all();
  for (const row of allCats) {
    insLimit.run(row.id, 5);
  }

  db.prepare(
    `INSERT OR IGNORE INTO plans (code, name, max_active_listings, included_promotions, has_priority_boost, can_request_verification, price_amount, price_currency, billing_period, is_active)
     VALUES ('free', 'Gratuit', 3, 0, 0, 0, 0, 'RON', 'none', 1)`
  ).run();
  db.prepare(
    `INSERT OR IGNORE INTO plans (code, name, max_active_listings, included_promotions, has_priority_boost, can_request_verification, price_amount, price_currency, billing_period, is_active)
     VALUES ('vip', 'VIP', 10, 3, 1, 1, 9900, 'RON', 'monthly', 1)`
  ).run();

  db.prepare(
    `INSERT OR IGNORE INTO promotion_packages (code, name, promotion_type, duration_days, price_amount, price_currency, is_active)
     VALUES ('featured_7', 'Evidențiere 7 zile', 'featured', 7, 4900, 'RON', 1)`
  ).run();
  db.prepare(
    `INSERT OR IGNORE INTO promotion_packages (code, name, promotion_type, duration_days, price_amount, price_currency, is_active)
     VALUES ('highlight_7', 'Evidențiere vizuală 7 zile', 'highlight', 7, 2900, 'RON', 1)`
  ).run();

  const email = (config.adminEmail || '').trim().toLowerCase();
  let adminRow = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  let adminId;

  if (!adminRow) {
    const hash = bcrypt.hashSync(config.adminPassword, 12);
    const r = db
      .prepare(`INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, 'admin', 'active')`)
      .run(email, hash);
    adminId = r.lastInsertRowid;
    db.prepare(`INSERT INTO user_profiles (user_id, display_name) VALUES (?, 'Administrator')`).run(adminId);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, ends_at)
       SELECT ?, id, 'active', ?, NULL FROM plans WHERE code = 'free' LIMIT 1`
    ).run(adminId, now);
    db.prepare(`INSERT OR IGNORE INTO user_verifications (user_id, is_verified) VALUES (?, 0)`).run(adminId);
    console.log('Seed OK. Admin creat:', email);
  } else {
    adminId = adminRow.id;
    if (!db.prepare('SELECT 1 FROM user_profiles WHERE user_id = ?').get(adminId)) {
      db.prepare(`INSERT INTO user_profiles (user_id, display_name) VALUES (?, 'Administrator')`).run(adminId);
    }
    if (!db.prepare('SELECT 1 FROM user_subscriptions WHERE user_id = ?').get(adminId)) {
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, ends_at)
         SELECT ?, id, 'active', ?, NULL FROM plans WHERE code = 'free' LIMIT 1`
      ).run(adminId, now);
    }
    db.prepare(`INSERT OR IGNORE INTO user_verifications (user_id, is_verified) VALUES (?, 0)`).run(adminId);
    console.log('Seed OK. Admin există deja:', email);
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO blog_posts (slug, title, excerpt, body_html, is_published, published_at)
     VALUES ('bun-venit', 'Bun venit pe platformă', 'Prezentare scurtă.',
     '<p>Platforma conectează meșteri și clienți din România.</p>', 1, ?)`
  ).run(now);
}

run();
