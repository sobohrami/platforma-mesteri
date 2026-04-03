const express = require('express');

module.exports = function chatRoutes(db) {
  const router = express.Router();

  router.get('/mesaje', (req, res) => {
    if (!req.user) {
      req.session.flash = { error: 'Autentificare necesară.' };
      return res.redirect('/autentificare');
    }
    const rows = db
      .prepare(
        `SELECT c.id, c.updated_at,
          (SELECT message_body FROM messages WHERE conversation_id = c.id AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1) AS last_body,
          (SELECT COUNT(*) FROM messages ms WHERE ms.conversation_id = c.id AND ms.sender_user_id != ? AND ms.created_at > COALESCE(cp.last_read_at, '1970-01-01')) AS unread
         FROM conversations c
         JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
         ORDER BY c.updated_at DESC`
      )
      .all(req.user.id, req.user.id);
    res.render('chat-list', {
      layout: 'layouts/main',
      title: 'Mesaje',
      path: '/mesaje',
      conversations: rows,
    });
  });

  router.get('/mesaje/:id', (req, res) => {
    if (!req.user) return res.redirect('/autentificare');
    const cid = Number(req.params.id);
    const part = db
      .prepare(
        `SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`
      )
      .get(cid, req.user.id);
    if (!part) return res.status(404).render('404', { layout: 'layouts/main', title: 'Negăsit' });
    const messages = db
      .prepare(
        `SELECT m.*, up.display_name AS sender_name
         FROM messages m
         JOIN users u ON u.id = m.sender_user_id
         JOIN user_profiles up ON up.user_id = u.id
         WHERE m.conversation_id = ? AND m.is_deleted = 0
         ORDER BY m.created_at ASC`
      )
      .all(cid);
    db.prepare(
      `UPDATE conversation_participants SET last_read_at = datetime('now') WHERE conversation_id = ? AND user_id = ?`
    ).run(cid, req.user.id);
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(cid);
    res.render('chat-detail', {
      layout: 'layouts/main',
      title: 'Conversație',
      path: `/mesaje/${cid}`,
      conversation: conv,
      messages,
      convId: cid,
    });
  });

  router.post('/mesaje/:id', (req, res) => {
    if (!req.user) return res.redirect('/autentificare');
    const cid = Number(req.params.id);
    const part = db
      .prepare(
        `SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`
      )
      .get(cid, req.user.id);
    if (!part) return res.status(404).send('Negăsit');
    const body = (req.body.message_body || '').trim();
    if (!body) return res.redirect(`/mesaje/${cid}`);
    db.prepare(
      `INSERT INTO messages (conversation_id, sender_user_id, message_body) VALUES (?, ?, ?)`
    ).run(cid, req.user.id, body);
    db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`).run(cid);
    const others = db
      .prepare(
        `SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id != ?`
      )
      .all(cid, req.user.id);
    const insN = db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, link_url) VALUES (?, 'new_message', ?, ?, ?)`
    );
    for (const o of others) {
      insN.run(o.user_id, 'Mesaj nou', 'Aveți un mesaj nou.', `/mesaje/${cid}`);
    }
    res.redirect(`/mesaje/${cid}`);
  });

  router.get('/api/mesaje/:id/nou', (req, res) => {
    if (!req.user) return res.status(401).json({ ok: false });
    const cid = Number(req.params.id);
    const part = db
      .prepare(
        `SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`
      )
      .get(cid, req.user.id);
    if (!part) return res.status(404).json({ ok: false });
    const last = db
      .prepare(`SELECT id FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1`)
      .get(cid);
    res.json({ ok: true, lastId: last ? last.id : 0 });
  });

  router.post('/anunt/:listingId/mesaj', (req, res) => {
    if (!req.user) return res.redirect('/autentificare');
    const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(Number(req.params.listingId));
    if (!listing) return res.redirect('/mesteri');
    if (listing.user_id === req.user.id) return res.redirect(`/anunt/${listing.slug}`);
    let conv = db
      .prepare(
        `SELECT c.id FROM conversations c
         WHERE c.listing_id = ? AND EXISTS (SELECT 1 FROM conversation_participants cp WHERE cp.conversation_id = c.id AND cp.user_id = ?)
           AND EXISTS (SELECT 1 FROM conversation_participants cp2 WHERE cp2.conversation_id = c.id AND cp2.user_id = ?)`
      )
      .get(listing.id, req.user.id, listing.user_id);
    if (!conv) {
      const tx = db.transaction(() => {
        const r = db
          .prepare(`INSERT INTO conversations (listing_id, created_by_user_id) VALUES (?, ?)`)
          .run(listing.id, req.user.id);
        const cid = r.lastInsertRowid;
        db.prepare(`INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)`).run(
          cid,
          req.user.id
        );
        db.prepare(`INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)`).run(
          cid,
          listing.user_id
        );
      });
      tx();
      conv = db
        .prepare(`SELECT id FROM conversations WHERE listing_id = ? ORDER BY id DESC LIMIT 1`)
        .get(listing.id);
    }
    res.redirect(`/mesaje/${conv.id}`);
  });

  return router;
};
