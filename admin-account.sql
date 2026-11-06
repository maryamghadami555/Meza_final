-- حساب مدیر کل (نام کاربری: admin_meza). اجرای چندباره بی‌خطر است (INSERT OR IGNORE).
INSERT OR IGNORE INTO users (email, username, name, password_hash, role, status, created_at) VALUES ('admin_meza@meza.local', 'admin_meza', 'مدیر کل', 'pbkdf2$100000$IsaqZDlmgXRuSzfr8KVinQ==$EjtfcGQ2KBvxLxJet1KAgUJQMArBr1+CObQlRkI9fKc=', 'super_admin', 'active', 1793920861278);
