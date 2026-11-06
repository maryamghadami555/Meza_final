-- DEVELOPMENT SAMPLE DATA ONLY. Do not run on production: replace with real products via the admin panel (phase 2).
INSERT INTO categories (slug, name, sort) VALUES ('necklace','گردنبند',1),('bracelet','دستبند',2),('earring','گوشواره',3),('ring','انگشتر',4);
INSERT INTO products (name, description, price, discount_percent, category_id, stock, featured, bestseller, images, created_at) VALUES
 ('گردنبند پروانه‌ای','گردنبند با نگین درخشان و زنجیر ظریف.',2990000,0,1,12,1,1,'[]',strftime('%s','now')*1000),
 ('دستبند زنجیری','دستبند ظریف با آبکاری نقره‌ای.',1450000,10,2,8,1,0,'[]',strftime('%s','now')*1000),
 ('گوشواره پاپیونی','گوشواره پاپیونی با نگین‌های ریز.',1250000,0,3,20,1,1,'[]',strftime('%s','now')*1000),
 ('انگشتر سولیتر','انگشتر سولیتر با نگین مرکزی.',2190000,15,4,5,0,1,'[]',strftime('%s','now')*1000),
 ('گردنبند قطره‌ای','گردنبند قطره‌ای با زنجیر بلند.',1890000,0,1,0,0,0,'[]',strftime('%s','now')*1000),
 ('دستبند نگین‌دار','دستبند نگین‌دار با قفل مطمئن.',1650000,0,2,15,0,0,'[]',strftime('%s','now')*1000);
INSERT INTO coupons (code, percent, active, max_uses) VALUES ('FIRST', 10, 1, 0);
INSERT OR REPLACE INTO settings (key, value) VALUES ('store_phone','۰۲۱-۱۲۳۴۵۶۷۸'),('store_email','info@meza.ir'),('store_address','تهران، خیابان آزادی');
