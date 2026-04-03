const express = require('express');

module.exports = function contentRoutes(db) {
  const router = express.Router();

  router.get('/blog', (req, res) => {
    const posts = db
      .prepare(
        `SELECT slug, title, excerpt, published_at FROM blog_posts WHERE is_published = 1 ORDER BY published_at DESC`
      )
      .all();
    res.render('blog-index', {
      layout: 'layouts/main',
      title: 'Blog',
      description: 'Articole și noutăți.',
      path: '/blog',
      posts,
    });
  });

  router.get('/blog/:slug', (req, res) => {
    const post = db
      .prepare(`SELECT * FROM blog_posts WHERE slug = ? AND is_published = 1`)
      .get(req.params.slug);
    if (!post) return res.status(404).render('404', { layout: 'layouts/main', title: 'Negăsit' });
    res.render('blog-post', {
      layout: 'layouts/main',
      title: post.title,
      description: post.excerpt || '',
      path: `/blog/${post.slug}`,
      post,
      jsonLd: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        datePublished: post.published_at,
      }),
    });
  });

  router.get('/termeni-si-conditii', (req, res) => {
    res.render('legal-termeni', {
      layout: 'layouts/main',
      title: 'Termeni și condiții',
      description: 'Termeni și condiții de utilizare.',
      path: '/termeni-si-conditii',
      robots: 'noindex',
    });
  });

  router.get('/politica-de-confidentialitate', (req, res) => {
    res.render('legal-privacy', {
      layout: 'layouts/main',
      title: 'Politica de confidențialitate',
      description: 'GDPR și date personale.',
      path: '/politica-de-confidentialitate',
      robots: 'noindex',
    });
  });

  return router;
};
