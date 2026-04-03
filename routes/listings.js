const express = require('express');
const path = require('path');
const { uniqueListingSlug } = require('../services/slug');
const { moderateContent } = require('../services/moderation');
const { canCreateListing } = require('../services/plans');

module.exports = function listingRoutes(db) {
  const router = express.Router();

  function logModeration(entityId, action, reason, details) {
    db.prepare(
      `INSERT INTO moderation_logs (entity_type, entity_id, action, reason_code, details)
       VALUES ('listing', ?, ?, ?, ?)`
    ).run(entityId, action, reason || 'other', details || null);
  }

  router.get('/anunt/:slug', (req, res) => {
    const row = db
      .prepare(
        `SELECT l.*, c.name AS cat_name, c.slug AS cat_slug, s.name AS sub_name,
          ci.name AS city_name, co.name AS county_name, u.email AS owner_email,
          p.display_name AS owner_name, uv.is_verified
         FROM listings l
         JOIN users u ON u.id = l.user_id
         JOIN user_profiles p ON p.user_id = l.user_id
         LEFT JOIN user_verifications uv ON uv.user_id = l.user_id
         JOIN categories c ON c.id = l.category_id
         JOIN subcategories s ON s.id = l.subcategory_id
         JOIN cities ci ON ci.id = l.primary_city_id
         JOIN counties co ON co.id = l.primary_county_id
         WHERE l.slug = ?`
      )
      .get(req.params.slug);
    if (!row) return res.status(404).render('404', { layout: 'layouts/main', title: 'Negăsit' });
    if (row.status !== 'approved' && (!req.user || req.user.id !== row.user_id) && req.user?.role !== 'admin') {
      return res.status(404).render('404', { layout: 'layouts/main', title: 'Negăsit' });
    }
    db.prepare('UPDATE listings SET views_count = views_count + 1 WHERE id = ?').run(row.id);
    const images = db
      .prepare('SELECT * FROM listing_images WHERE listing_id = ? ORDER BY sort_order')
      .all(row.id);
    const coverage = db
      .prepare(
        `SELECT lca.*, ci.name AS city_name FROM listing_coverage_areas lca
         JOIN cities ci ON ci.id = lca.city_id WHERE lca.listing_id = ?`
      )
      .all(row.id);
    const canonical = `${res.locals.baseUrl || ''}/anunt/${row.slug}`;
    res.render('listing-detail', {
      layout: 'layouts/main',
      title: row.title,
      description: (row.description || '').slice(0, 160),
      path: canonical,
      canonical,
      listing: row,
      images,
      coverage,
      jsonLd: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: row.title,
        description: row.description,
        areaServed: row.city_name,
      }),
    });
  });

  router.get('/adauga-anunt', (req, res, next) => {
    if (!req.user || req.user.role !== 'craftsman') {
      req.session.flash = { error: 'Doar meșterii pot publica anunțuri.' };
      return res.redirect('/autentificare');
    }
    const categories = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order').all();
    const subcategories = db
      .prepare('SELECT * FROM subcategories WHERE is_active = 1 ORDER BY category_id, sort_order')
      .all();
    const counties = db.prepare('SELECT * FROM counties WHERE is_active = 1 ORDER BY sort_order').all();
    const cities = db.prepare('SELECT * FROM cities WHERE is_active = 1 ORDER BY sort_order LIMIT 500').all();
    res.render('listing-form', {
      layout: 'layouts/main',
      title: 'Adaugă anunț',
      path: '/adauga-anunt',
      categories,
      subcategories,
      counties,
      cities,
      listing: null,
    });
  });

  router.post('/adauga-anunt', (req, res) => {
    if (!req.user || req.user.role !== 'craftsman') {
      return res.redirect('/');
    }
    const b = req.body;
    const categoryId = Number(b.category_id);
    const subId = Number(b.subcategory_id);
    const countyId = Number(b.primary_county_id);
    const cityId = Number(b.primary_city_id);
    const cap = canCreateListing(db, req.user.id, categoryId);
    if (!cap.ok) {
      req.session.flash = { error: cap.reason };
      return res.redirect('/adauga-anunt');
    }
    const mod = moderateContent({
      title: b.title,
      description: b.description,
      categoryId,
      cityId,
    });
    const slug = uniqueListingSlug(db, b.title);
    const city = db.prepare('SELECT county_id FROM cities WHERE id = ?').get(cityId);
    if (!city || city.county_id !== countyId) {
      req.session.flash = { error: 'Oraș și județ nu corespund.' };
      return res.redirect('/adauga-anunt');
    }
    const status = mod.status === 'approved' ? 'approved' : mod.status === 'flagged' ? 'flagged' : 'rejected';
    const tx = db.transaction(() => {
      const r = db
        .prepare(
          `INSERT INTO listings (user_id, title, slug, description, category_id, subcategory_id,
            primary_county_id, primary_city_id, contact_phone, contact_whatsapp, status, moderation_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          req.user.id,
          b.title.trim(),
          slug,
          b.description.trim(),
          categoryId,
          subId,
          countyId,
          cityId,
          b.contact_phone,
          b.contact_whatsapp || null,
          status,
          mod.message || mod.codes.join(', ')
        );
      const lid = r.lastInsertRowid;
      logModeration(lid, status === 'approved' ? 'approved' : status, mod.codes[0] || 'other', mod.message);
      const cov = Array.isArray(b.coverage_city_ids) ? b.coverage_city_ids : b.coverage_city_ids ? [b.coverage_city_ids] : [];
      const insCov = db.prepare(
        `INSERT INTO listing_coverage_areas (listing_id, county_id, city_id) VALUES (?, ?, ?)`
      );
      for (const cid of cov.map(Number).filter(Boolean)) {
        const ct = db.prepare('SELECT county_id FROM cities WHERE id = ?').get(cid);
        if (ct) insCov.run(lid, ct.county_id, cid);
      }
      if (req.files && req.files.length) {
        const insImg = db.prepare(
          `INSERT INTO listing_images (listing_id, file_path, sort_order) VALUES (?, ?, ?)`
        );
        req.files.forEach((f, i) => {
          insImg.run(lid, '/uploads/listings/' + f.filename, i);
        });
      }
    });
    try {
      tx();
    } catch (e) {
      console.error(e);
      req.session.flash = { error: 'Eroare la salvare.' };
      return res.redirect('/adauga-anunt');
    }
    if (status === 'rejected') {
      req.session.flash = { error: mod.message || 'Anunț respins de moderație.' };
    } else {
      req.session.flash = { success: status === 'approved' ? 'Anunț publicat.' : 'Anunț în verificare.' };
    }
    res.redirect('/cont/anunturi');
  });

  router.get('/cont/anunturi', (req, res, next) => {
    if (!req.user || req.user.role !== 'craftsman') {
      req.session.flash = { error: 'Acces interzis.' };
      return res.redirect('/');
    }
    const rows = db
      .prepare(`SELECT * FROM listings WHERE user_id = ? ORDER BY created_at DESC`)
      .all(req.user.id);
    const promotionPackages = db
      .prepare(`SELECT * FROM promotion_packages WHERE is_active = 1 ORDER BY id`)
      .all();
    res.render('listing-my', {
      layout: 'layouts/main',
      title: 'Anunțurile mele',
      path: '/cont/anunturi',
      listings: rows,
      promotionPackages,
    });
  });

  return router;
};
