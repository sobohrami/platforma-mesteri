function loadUser(db) {
  return (req, res, next) => {
    req.user = null;
    const uid = req.session && req.session.userId;
    if (!uid) return next();
    const row = db
      .prepare(
        `SELECT u.id, u.email, u.role, u.status, p.display_name, p.phone
         FROM users u
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE u.id = ?`
      )
      .get(uid);
    if (row && row.status === 'active') {
      req.user = row;
    }
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) {
    req.session.flash = { error: 'Autentificare necesară.' };
    return res.redirect('/autentificare?next=' + encodeURIComponent(req.originalUrl));
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      req.session.flash = { error: 'Acces interzis.' };
      return res.redirect('/');
    }
    next();
  };
}

module.exports = { loadUser, requireAuth, requireRole };
