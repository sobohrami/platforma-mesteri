const express = require('express');

module.exports = function seoRoutes(db, config) {
  const router = express.Router();

  router.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /cont
Disallow: /mesaje
Disallow: /notificari
Sitemap: ${config.baseUrl}/sitemap.xml
`);
  });

  router.get('/sitemap.xml', (req, res) => {
    const listings = db.prepare(`SELECT slug, updated_at FROM listings WHERE status = 'approved'`).all();
    const projects = db.prepare(`SELECT slug, updated_at FROM projects WHERE status = 'approved'`).all();
    const posts = db.prepare(`SELECT slug, updated_at FROM blog_posts WHERE is_published = 1`).all();
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    const u = (loc, lastmod) => {
      xml += `<url><loc>${loc}</loc><lastmod>${(lastmod || new Date().toISOString()).slice(0, 10)}</lastmod></url>`;
    };
    u(`${config.baseUrl}/`);
    u(`${config.baseUrl}/mesteri`);
    u(`${config.baseUrl}/proiecte`);
    u(`${config.baseUrl}/blog`);
    for (const l of listings) u(`${config.baseUrl}/anunt/${l.slug}`, l.updated_at);
    for (const p of projects) u(`${config.baseUrl}/proiect/${p.slug}`, p.updated_at);
    for (const p of posts) u(`${config.baseUrl}/blog/${p.slug}`, p.updated_at);
    xml += '</urlset>';
    res.type('application/xml');
    res.send(xml);
  });

  return router;
};
