const express = require('express');

module.exports = function notificationRoutes(db) {
  const router = express.Router();

  router.get('/notificari', (req, res) => {
    if (!req.user) return res.redirect('/autentificare');
    const rows = db
      .prepare(
        `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`
      )
      .all(req.user.id);
    res.render('notifications', {
      layout: 'layouts/main',
      title: 'Notificări',
      path: '/notificari',
      notifications: rows,
    });
  });

  router.post('/notificari/citeste/:id', (req, res) => {
    if (!req.user) return res.redirect('/autentificare');
    db.prepare(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`
    ).run(Number(req.params.id), req.user.id);
    res.redirect('/notificari');
  });

  router.post('/notificari/citeste-toate', (req, res) => {
    if (!req.user) return res.redirect('/autentificare');
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.user.id);
    res.redirect('/notificari');
  });

  return router;
};
