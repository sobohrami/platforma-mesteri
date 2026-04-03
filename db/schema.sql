-- PRAGMA foreign_keys = ON; -- setat în aplicație la conexiune

CREATE TABLE counties (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  county_id  INTEGER NOT NULL,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (county_id) REFERENCES counties(id) ON DELETE RESTRICT,
  UNIQUE (county_id, slug)
);
CREATE INDEX idx_cities_county ON cities(county_id);

CREATE TABLE categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE subcategories (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  INTEGER NOT NULL,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL,
  description  TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE (category_id, slug)
);
CREATE INDEX idx_subcategories_category ON subcategories(category_id);

CREATE TABLE category_listing_limits (
  category_id             INTEGER PRIMARY KEY,
  max_listings_per_user   INTEGER NOT NULL CHECK (max_listings_per_user > 0),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE users (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  email              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash      TEXT NOT NULL,
  role               TEXT NOT NULL CHECK (role IN ('craftsman', 'client', 'admin')),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  email_verified_at  TEXT,
  phone_verified_at  TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

CREATE TABLE user_profiles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  phone         TEXT,
  whatsapp      TEXT,
  bio           TEXT,
  avatar_path   TEXT,
  county_id     INTEGER,
  city_id       INTEGER,
  address_text  TEXT,
  website_url   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (county_id) REFERENCES counties(id) ON DELETE SET NULL,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL
);

CREATE TABLE plans (
  id                         INTEGER PRIMARY KEY AUTOINCREMENT,
  code                       TEXT NOT NULL UNIQUE,
  name                       TEXT NOT NULL,
  max_active_listings        INTEGER NOT NULL CHECK (max_active_listings >= 0),
  included_promotions        INTEGER NOT NULL DEFAULT 0 CHECK (included_promotions >= 0),
  has_priority_boost         INTEGER NOT NULL DEFAULT 0 CHECK (has_priority_boost IN (0, 1)),
  can_request_verification   INTEGER NOT NULL DEFAULT 0 CHECK (can_request_verification IN (0, 1)),
  price_amount               INTEGER,
  price_currency             TEXT NOT NULL DEFAULT 'RON',
  billing_period             TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly', 'one_time', 'none')),
  is_active                  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE user_subscriptions (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                  INTEGER NOT NULL,
  plan_id                  INTEGER NOT NULL,
  status                   TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
  starts_at                TEXT NOT NULL,
  ends_at                  TEXT,
  stripe_customer_id       TEXT,
  stripe_subscription_id   TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
);
CREATE INDEX idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_plan ON user_subscriptions(plan_id);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_user_status_ends ON user_subscriptions(user_id, status, ends_at);

CREATE TABLE promotion_packages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  promotion_type  TEXT NOT NULL CHECK (promotion_type IN ('featured', 'highlight', 'priority')),
  duration_days   INTEGER NOT NULL CHECK (duration_days > 0),
  price_amount    INTEGER NOT NULL,
  price_currency  TEXT NOT NULL DEFAULT 'RON',
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE payments (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                   INTEGER NOT NULL,
  stripe_session_id         TEXT UNIQUE,
  stripe_payment_intent_id  TEXT,
  payment_type              TEXT NOT NULL CHECK (payment_type IN ('subscription', 'promotion', 'verification')),
  reference_type            TEXT CHECK (reference_type IN ('user_subscription', 'listing_promotion', 'verification_request')),
  reference_id              INTEGER,
  amount_cents              INTEGER NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'RON',
  status                    TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  metadata_json             TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_payments_user_status ON payments(user_id, status);
CREATE INDEX idx_payments_type_status ON payments(payment_type, status);
CREATE INDEX idx_payments_reference ON payments(reference_type, reference_id);

CREATE TABLE stripe_webhook_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type      TEXT NOT NULL,
  processed_at    TEXT DEFAULT (datetime('now')),
  payload_json    TEXT
);

CREATE TABLE verification_requests (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                 INTEGER NOT NULL,
  status                  TEXT NOT NULL CHECK (status IN ('pending_payment', 'pending_review', 'approved', 'rejected')),
  payment_id              INTEGER,
  phone_check_passed      INTEGER NOT NULL DEFAULT 0 CHECK (phone_check_passed IN (0, 1)),
  activity_check_passed   INTEGER NOT NULL DEFAULT 0 CHECK (activity_check_passed IN (0, 1)),
  ai_check_result         TEXT,
  admin_notes             TEXT,
  requested_at            TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at             TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);
CREATE INDEX idx_verification_user ON verification_requests(user_id);
CREATE INDEX idx_verification_status ON verification_requests(status);

CREATE TABLE user_verifications (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                   INTEGER NOT NULL UNIQUE,
  is_verified               INTEGER NOT NULL DEFAULT 0 CHECK (is_verified IN (0, 1)),
  verified_at               TEXT,
  verification_request_id   INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (verification_request_id) REFERENCES verification_requests(id) ON DELETE SET NULL
);

CREATE TABLE listings (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL,
  title               TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  description         TEXT NOT NULL,
  category_id         INTEGER NOT NULL,
  subcategory_id      INTEGER NOT NULL,
  primary_county_id   INTEGER NOT NULL,
  primary_city_id     INTEGER NOT NULL,
  contact_phone       TEXT NOT NULL,
  contact_whatsapp    TEXT,
  status              TEXT NOT NULL CHECK (status IN ('approved', 'flagged', 'rejected', 'draft')),
  moderation_reason   TEXT,
  is_featured         INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  featured_until      TEXT,
  is_highlighted      INTEGER NOT NULL DEFAULT 0 CHECK (is_highlighted IN (0, 1)),
  priority_rank       INTEGER NOT NULL DEFAULT 0,
  views_count         INTEGER NOT NULL DEFAULT 0,
  is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE RESTRICT,
  FOREIGN KEY (primary_county_id) REFERENCES counties(id) ON DELETE RESTRICT,
  FOREIGN KEY (primary_city_id) REFERENCES cities(id) ON DELETE RESTRICT
);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_category ON listings(category_id);
CREATE INDEX idx_listings_subcategory ON listings(subcategory_id);
CREATE INDEX idx_listings_primary_city ON listings(primary_city_id);
CREATE INDEX idx_listings_primary_county ON listings(primary_county_id);
CREATE INDEX idx_listings_user ON listings(user_id);
CREATE INDEX idx_listings_status_cat_city ON listings(status, category_id, primary_city_id);
CREATE INDEX idx_listings_status_sub_city ON listings(status, subcategory_id, primary_city_id);

CREATE TABLE listing_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  INTEGER NOT NULL,
  file_path   TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
);
CREATE INDEX idx_listing_images_listing ON listing_images(listing_id);

CREATE TABLE listing_coverage_areas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id  INTEGER NOT NULL,
  county_id   INTEGER NOT NULL,
  city_id     INTEGER NOT NULL,
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  FOREIGN KEY (county_id) REFERENCES counties(id) ON DELETE CASCADE,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
  UNIQUE (listing_id, city_id)
);
CREATE INDEX idx_lca_listing ON listing_coverage_areas(listing_id);
CREATE INDEX idx_lca_city ON listing_coverage_areas(city_id);

CREATE TABLE listing_promotions (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id             INTEGER NOT NULL,
  user_id                INTEGER NOT NULL,
  promotion_package_id   INTEGER,
  source_type            TEXT NOT NULL CHECK (source_type IN ('subscription_included', 'paid', 'manual')),
  starts_at              TEXT NOT NULL,
  ends_at                TEXT NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (promotion_package_id) REFERENCES promotion_packages(id) ON DELETE SET NULL,
  CHECK (ends_at >= starts_at)
);
CREATE INDEX idx_lp_listing ON listing_promotions(listing_id);
CREATE INDEX idx_lp_user ON listing_promotions(user_id);
CREATE INDEX idx_lp_listing_ends ON listing_promotions(listing_id, ends_at);

CREATE TABLE projects (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL,
  title              TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  description        TEXT NOT NULL,
  category_id        INTEGER NOT NULL,
  subcategory_id     INTEGER NOT NULL,
  county_id          INTEGER NOT NULL,
  city_id            INTEGER NOT NULL,
  budget_min         INTEGER,
  budget_max         INTEGER,
  contact_name       TEXT NOT NULL,
  contact_phone      TEXT,
  contact_email      TEXT,
  status             TEXT NOT NULL CHECK (status IN ('approved', 'flagged', 'rejected', 'draft')),
  moderation_reason  TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE RESTRICT,
  FOREIGN KEY (county_id) REFERENCES counties(id) ON DELETE RESTRICT,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE RESTRICT
);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_category ON projects(category_id);
CREATE INDEX idx_projects_subcategory ON projects(subcategory_id);
CREATE INDEX idx_projects_city ON projects(city_id);
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_projects_status_cat_city ON projects(status, category_id, city_id);

CREATE TABLE project_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL,
  file_path   TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX idx_project_images_project ON project_images(project_id);

CREATE TABLE conversations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id          INTEGER,
  project_id          INTEGER,
  created_by_user_id  INTEGER NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (NOT (listing_id IS NOT NULL AND project_id IS NOT NULL))
);

CREATE TABLE conversation_participants (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id   INTEGER NOT NULL,
  user_id           INTEGER NOT NULL,
  last_read_at      TEXT,
  joined_at         TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (conversation_id, user_id)
);
CREATE INDEX idx_cp_conversation ON conversation_participants(conversation_id);
CREATE INDEX idx_cp_user ON conversation_participants(user_id);

CREATE TABLE messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  INTEGER NOT NULL,
  sender_user_id   INTEGER NOT NULL,
  message_body     TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted       INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_sender ON messages(sender_user_id);

CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('project_match', 'new_message', 'system', 'payment', 'verification')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  link_url   TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_notifications_user_read_created ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE banners (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  image_path   TEXT NOT NULL,
  target_url   TEXT NOT NULL,
  placement    TEXT NOT NULL CHECK (placement IN (
                 'home_top', 'home_middle', 'category_sidebar', 'project_sidebar'
               )),
  category_id  INTEGER,
  starts_at    TEXT NOT NULL,
  ends_at      TEXT NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CHECK (ends_at >= starts_at)
);
CREATE INDEX idx_banners_placement ON banners(placement, is_active, starts_at, ends_at);
CREATE INDEX idx_banners_category ON banners(category_id);

CREATE TABLE moderation_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('listing', 'project')),
  entity_id    INTEGER NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('approved', 'flagged', 'rejected')),
  reason_code  TEXT NOT NULL CHECK (reason_code IN ('profanity', 'external_link', 'spam', 'manual_review', 'other')),
  details      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_moderation_entity ON moderation_logs(entity_type, entity_id);
CREATE INDEX idx_moderation_created ON moderation_logs(created_at DESC);

-- Blog (conținut SEO)
CREATE TABLE blog_posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  excerpt       TEXT,
  body_html     TEXT NOT NULL,
  is_published  INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  published_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_blog_published ON blog_posts(is_published, published_at DESC);
