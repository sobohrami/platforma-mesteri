const express = require('express');
const { uniqueProjectSlug } = require('../services/slug');
const { moderateContent } = require('../services/moderation');
const { notifyProjectMatch } = require('../services/notifications');

module.exports = function projectRoutes(db) {
  const router = express.Router();

  function logMod(entityId, action, reason, details) {
    db.prepare(
      `INSERT INTO moderation_logs (entity_type, entity_id, action, reason_code, details)
       VALUES ('project', ?, ?, ?, ?)`
    ).run(entityId, action, reason || 'other', details || null);
  }

  router.get('/proiecte', (req, res) => {
    const rows = db
      .prepare(
        `SELECT p.*, c.name AS cat_name, ci.name AS city_name
         FROM projects p
         JOIN categories c ON c.id = p.category_id
         JOIN cities ci ON ci.id = p.city_id
         WHERE p.status = 'approved' AND p.is_active = 1
         ORDER BY p.created_at DESC LIMIT 100`
      )
      .all();
    res.render('projects-browse', {
      layout: 'layouts/main',
      title: 'Proiecte',
      description: 'Proiecte publicate de clienți.',
      path: '/proiecte',
      projects: rows,
    });
  });

  router.get('/proiect/:slug', (req, res) => {
    const row = db
      .prepare(
        `SELECT p.*, c.name AS cat_name, s.name AS sub_name, ci.name AS city_name,
          up.display_name AS client_name
         FROM projects p
         JOIN categories c ON c.id = p.category_id
         JOIN subcategories s ON s.id = p.subcategory_id
         JOIN cities ci ON ci.id = p.city_id
         JOIN user_profiles up ON up.user_id = p.user_id
         WHERE p.slug = ?`
      )
      .get(req.params.slug);
    if (!row) return res.status(404).render('404', { layout: 'layouts/main', title: 'Negăsit' });
    if (row.status !== 'approved' && (!req.user || req.user.id !== row.user_id) && req.user?.role !== 'admin') {
      return res.status(404).render('404', { layout: 'layouts/main', title: 'Negăsit' });
    }
    const canMsg =
      req.user &&
      req.user.role === 'craftsman' &&
      req.user.id !== row.user_id;
    res.render('project-detail', {
      layout: 'layouts/main',
      title: row.title,
      description: (row.description || '').slice(0, 160),
      path: `/proiect/${row.slug}`,
      canonical: `${res.locals.baseUrl}/proiect/${row.slug}`,
      project: row,
      canMsg,
    });
  });

  router.get('/adauga-proiect', (req, res) => {
    if (!req.user || req.user.role !== 'client') {
      req.session.flash = { error: 'Doar clienții pot publica proiecte.' };
      return res.redirect('/autentificare');
    }
    const categories = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order').all();
    const subcategories = db
      .prepare('SELECT * FROM subcategories WHERE is_active = 1 ORDER BY category_id, sort_order')
      .all();
    const counties = db.prepare('SELECT * FROM counties WHERE is_active = 1 ORDER BY sort_order').all();
    const cities = db.prepare('SELECT * FROM cities WHERE is_active = 1 ORDER BY sort_order LIMIT 500').all();
    res.render('project-form', {
      layout: 'layouts/main',
      title: 'Adaugă proiect',
      path: '/adauga-proiect',
      categories,
      subcategories,
      counties,
      cities,
    });
  });

  router.post('/adauga-proiect', (req, res) => {
    if (!req.user || req.user.role !== 'client') return res.redirect('/');
    const b = req.body;
    const mod = moderateContent({
      title: b.title,
      description: b.description,
      categoryId: Number(b.category_id),
      cityId: Number(b.city_id),
    });
    const countyId = Number(b.county_id);
    const cityId = Number(b.city_id);
    const city = db.prepare('SELECT county_id FROM cities WHERE id = ?').get(cityId);
    if (!city || city.county_id !== countyId) {
      req.session.flash = { error: 'Oraș și județ incorecte.' };
      return res.redirect('/adauga-proiect');
    }
    const status = mod.status === 'approved' ? 'approved' : mod.status === 'flagged' ? 'flagged' : 'rejected';
    const slug = uniqueProjectSlug(db, b.title);
    const r = db
      .prepare(
        `INSERT INTO projects (user_id, title, slug, description, category_id, subcategory_id,
          county_id, city_id, budget_min, budget_max, contact_name, contact_phone, contact_email,
          status, moderation_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user.id,
        b.title.trim(),
        slug,
        b.description.trim(),
        Number(b.category_id),
        Number(b.subcategory_id),
        countyId,
        cityId,
        b.budget_min ? Number(b.budget_min) : null,
        b.budget_max ? Number(b.budget_max) : null,
        b.contact_name,
        b.contact_phone || null,
        b.contact_email || null,
        status,
        mod.message || mod.codes.join(', ')
      );
    const pid = r.lastInsertRowid;
    logMod(pid, status === 'approved' ? 'approved' : status, mod.codes[0], mod.message);
    if (status === 'approved') {
      notifyProjectMatch(db, pid);
    }
    if (status === 'rejected') {
      req.session.flash = { error: mod.message };
    } else {
      req.session.flash = { success: 'Proiect înregistrat.' };
    }
    res.redirect('/cont/proiecte');
  });

  router.get('/cont/proiecte', (req, res) => {
    if (!req.user || req.user.role !== 'client') {
      req.session.flash = { error: 'Acces interzis.' };
      return res.redirect('/');
    }
    const rows = db.prepare(`SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC`).all(req.user.id);
    res.render('project-my', {
      layout: 'layouts/main',
      title: 'Proiectele mele',
      path: '/cont/proiecte',
      projects: rows,
    });
  });

  router.post('/proiect/:id/mesaj', (req, res) => {
    if (!req.user || req.user.role !== 'craftsman') {
      req.session.flash = { error: 'Doar meșterii pot iniția mesaj de pe proiect.' };
      return res.redirect('/autentificare');
    }
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(Number(req.params.id));
    if (!project || project.user_id === req.user.id) return res.redirect('/proiecte');
    let conv = db
      .prepare(
        `SELECT c.id FROM conversations c
         WHERE c.project_id = ? AND EXISTS (
           SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id AND cp.user_id = ?
         ) AND EXISTS (
           SELECT 1 FROM conversation_participants cp2 WHERE cp2.conversation_id = c.id AND cp2.user_id = ?
         )`
      )
      .get(project.id, req.user.id, project.user_id);
    if (!conv) {
      const tx = db.transaction(() => {
        const r = db
          .prepare(
            `INSERT INTO conversations (project_id, created_by_user_id) VALUES (?, ?)`
          )
          .run(project.id, req.user.id);
        const cid = r.lastInsertRowid;
        db.prepare(`INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)`).run(
          cid,
          req.user.id
        );
        db.prepare(`INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)`).run(
          cid,
          project.user_id
        );
      });
      tx();
      conv = db
        .prepare(`SELECT id FROM conversations WHERE project_id = ? ORDER BY id DESC LIMIT 1`)
        .get(project.id);
    }
    res.redirect(`/mesaje/${conv.id}`);
  });

  return router;
};
