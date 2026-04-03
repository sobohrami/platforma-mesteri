require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-change-me',
  databasePath: process.env.DATABASE_PATH || './data/app.db',
  sessionPath: process.env.SESSION_PATH || './data/sessions',
  uploadsPath: process.env.UPLOADS_PATH || './uploads',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@localhost',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || 'noreply@localhost',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    priceVip: process.env.STRIPE_PRICE_VIP || '',
    priceVerification: process.env.STRIPE_PRICE_VERIFICATION || '',
  },
};
