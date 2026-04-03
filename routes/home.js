const express = require('express');
const { buildListingWhere, listingOrderSql, listingJoinVip } = require('../services/search');

module.exports = function homeRoutes(db, config) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const banners = db
      .prepare(
        `SELECT * FROM banners WHERE is_active = 1 AND starts_at <= datetime('now') AND ends_at >= datetime('now')
         AND placement = 'home_top' ORDER BY sort_order LIMIT 3`
      )
      .all();
    res.render('home', {
      layout: 'layouts/main',
      title: 'Acasă',
      description: 'Găsește meșteri verificați sau publică proiecte în România.',
      path: '/',
      banners,
    });
  });

  router.get('/mesteri', (req, res) => {
    const { where, params } = buildListingWhere({
      categoryId: req.query.categorie ? Number(req.query.categorie) : null,
      subcategoryId: req.query.subcategorie ? Number(req.query.subcategorie) : null,
      cityId: req.query.oras ? Number(req.query.oras) : null,
      countyId: req.query.judet ? Number(req.query.judet) : null,
    });
    const sql = `
      SELECT l.*, c.name AS cat_name, c.slug AS cat_slug, s.name AS sub_name,
        ci.name AS city_name, co.name AS county_name, vip.code AS plan_code
      FROM listings l
      JOIN categories c ON c.id = l.category_id
      JOIN subcategories s ON s.id = l.subcategory_id
      JOIN cities ci ON ci.id = l.primary_city_id
      JOIN counties co ON co.id = l.primary_county_id
      ${listingJoinVip()}
      WHERE ${where}
      ${listingOrderSql()}
    `;
    const rows = db.prepare(sql).all(...params);
    const categories = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order').all();
    const counties = db.prepare('SELECT * FROM counties WHERE is_active = 1 ORDER BY sort_order').all();
    const cities = db.prepare('SELECT * FROM cities WHERE is_active = 1 ORDER BY sort_order LIMIT 500').all();
    res.render('browse-listings', {
      layout: 'layouts/main',
      title: 'Meșteri',
      description: 'Caută meșteri pe categorii și locație.',
      path: '/mesteri',
      listings: rows,
      categories,
      counties,
      cities,
      query: req.query,
    });
  });

  router.get('/mesteri/:catSlug', (req, res) => {
    const cat = db.prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.catSlug);
    if (!cat) return res.status(404).render('404', { layout: 'layouts/main', title: 'Negăsit' });
    const { where, params } = buildListingWhere({ categoryId: cat.id });
    const sql = `
      SELECT l.*, c.name AS cat_name, c.slug AS cat_slug, s.name AS sub_name,
        ci.name AS city_name, co.name AS county_name, vip.code AS plan_code
      FROM listings l
      JOIN categories c ON c.id = l.category_id
      JOIN subcategories s ON s.id = l.subcategory_id
      JOIN cities ci ON ci.id = l.primary_city_id
      JOIN counties co ON co.id = l.primary_county_id
      ${listingJoinVip()}
      WHERE ${where}
      ${listingOrderSql()}
    `;
    const rows = db.prepare(sql).all(...params);
    const thin = rows.length === 0;
    res.render('browse-listings', {
      layout: 'layouts/main',
      title: cat.name,
      description: cat.description || `Meșteri ${cat.name}.`,
      path: req.path,
      robots: thin ? 'noindex,follow' : undefined,
      listings: rows,
      category: cat,
      introHtml: cat.description ? `<p>${cat.description}</p>` : '',
    });
  });

  router.get('/mesteri/:catSlug/:citySlug', (req, res) => {
    const cat = db.prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.catSlug);
    const city = db.prepare('SELECT * FROM cities WHERE slug = ?').get(req.params.citySlug);
    if (!cat || !city) return res.status(404).render('404', { layout: 'layouts/main', title: 'Negăsit' });
    const { where, params } = buildListingWhere({ categoryId: cat.id, cityId: city.id });
    const sql = `
      SELECT l.*, c.name AS cat_name, c.slug AS cat_slug, s.name AS sub_name,
        ci.name AS city_name, co.name AS county_name, vip.code AS plan_code
      FROM listings l
      JOIN categories c ON c.id = l.category_id
      JOIN subcategories s ON s.id = l.subcategory_id
      JOIN cities ci ON ci.id = l.primary_city_id
      JOIN counties co ON co.id = l.primary_county_id
      ${listingJoinVip()}
      WHERE ${where}
      ${listingOrderSql()}
    `;
    const rows = db.prepare(sql).all(...params);
    const thin = rows.length === 0;
    res.render('browse-listings', {
      layout: 'layouts/main',
      title: `${cat.name} în ${city.name}`,
      description: `Meșteri ${cat.name} în ${city.name}.`,
      path: req.path,
      robots: thin ? 'noindex,follow' : undefined,
      listings: rows,
      category: cat,
      city,
      introHtml: `<p>Meșteri ${cat.name} în ${city.name}.</p>`,
    });
  });

  router.get('/despre', (req, res) => {
    res.render('static-despre', {
      layout: 'layouts/main',
      title: 'Despre noi',
      description: 'Despre platformă.',
      path: '/despre',
    });
  });

  router.get('/contact', (req, res) => {
    res.render('static-contact', {
      layout: 'layouts/main',
      title: 'Contact',
      description: 'Contact.',
      path: '/contact',
    });
  });

  return router;
};
