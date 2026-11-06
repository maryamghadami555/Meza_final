CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_tickets_user ON tickets(user_id, updated_at);
CREATE INDEX idx_tickets_status ON tickets(status, updated_at);
CREATE TABLE ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL,
  is_staff INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL DEFAULT '',
  image_key TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX idx_tmsg_ticket ON ticket_messages(ticket_id, id);
CREATE UNIQUE INDEX idx_reviews_unique ON reviews(product_id, user_id);
CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_variants_product ON product_variants(product_id);
ALTER TABLE order_items ADD COLUMN variant_id INTEGER;
ALTER TABLE orders ADD COLUMN gateway_authority TEXT;
ALTER TABLE orders ADD COLUMN gateway_ref TEXT;
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
INSERT INTO settings (key, value) VALUES ('online_merchant_enc',''),('online_sandbox','0') ON CONFLICT(key) DO NOTHING;
