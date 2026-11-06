import { Hono } from 'hono'
import { z } from 'zod'
import {
  Env, Vars, PERMISSIONS, ROLE_LABELS, ROLE_PRESETS, parse, bad, hashPassword, verifyPassword, startSession, storeImage,
  throttleKey, loginBlocked, loginFail, loginClear, STOCK_EXPR,
} from './lib'

export const admin = new Hono<{ Bindings: Env; Variables: Vars }>()
type C = any

export const need = (perm: string) => async (c: C, next: () => Promise<void>) => {
  if (!c.get('user')) return c.json({ error: 'ابتدا وارد شوید' }, 401)
  if (!c.get('perms').has(perm)) return c.json({ error: 'دسترسی کافی ندارید' }, 403)
  await next()
}
export const staff = async (c: C, next: () => Promise<void>) => {
  const u = c.get('user')
  if (!u || u.role === 'customer') return c.json({ error: 'ابتدا وارد شوید' }, 401)
  await next()
}
export const can = (c: C, p: string) => c.get('perms').has(p) as boolean
export const log = (c: C, action: string, detail = '') =>
  c.env.DB.prepare('INSERT INTO activity_logs (user_id, action, detail, created_at) VALUES (?,?,?,?)').bind(c.get('user').id, action, detail, Date.now()).run()
export const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
export const page = (c: C, per = 20) => ({ per, page: Math.max(Number(c.req.query('page')) || 1, 1) })
export const like = (s: string) => `%${s.slice(0, 40)}%`

/* ---------- login / session ---------- */
admin.post('/login', async (c) => {
  const d = await parse(c, z.object({ login: z.string().trim().toLowerCase().min(1).max(120), password: z.string().min(1).max(100) }))
  if (!d) return bad(c)
  const tk = throttleKey(c, 'a', d.login)
  if (await loginBlocked(c.env.DB, tk)) return c.json({ error: 'تلاش‌های ناموفق زیاد بود؛ ۱۵ دقیقه بعد دوباره تلاش کنید' }, 429)
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE (email = ? OR username = ?) AND role != 'customer'").bind(d.login, d.login).first<any>()
  const ok = row ? await verifyPassword(d.password, row.password_hash) : false
  if (!row || !ok) { await loginFail(c.env.DB, tk); return c.json({ error: 'نام کاربری یا رمز عبور نادرست است' }, 401) }
  if (row.status !== 'active') return c.json({ error: 'این حساب غیرفعال است' }, 403)
  await loginClear(c.env.DB, tk)
  await startSession(c, row.id)
  await c.env.DB.prepare('INSERT INTO activity_logs (user_id, action, detail, created_at) VALUES (?,?,?,?)').bind(row.id, 'login', '', Date.now()).run()
  return c.json({ ok: true })
})

admin.get('/me', staff, (c) => {
  const u = c.get('user')!
  return c.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role }, permissions: [...c.get('perms')] })
})
admin.get('/meta', staff, (c) => c.json({ permissions: PERMISSIONS, roles: ROLE_LABELS, presets: ROLE_PRESETS }))

/* ---------- dashboard ---------- */
admin.get('/stats', need('analytics.view'), async (c) => {
  const db = c.env.DB
  const since = Date.now() - 30 * 86400000
  const one = async (sql: string, ...a: unknown[]) => (await db.prepare(sql).bind(...a).first<{ n: number }>())?.n ?? 0
  const recent = await db.prepare('SELECT id, name, total, status, payment_status AS paymentStatus, created_at AS createdAt FROM orders ORDER BY id DESC LIMIT 6').all()
  return c.json({
    totalSales: await one("SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE payment_status = 'paid'"),
    monthSales: await one("SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE payment_status = 'paid' AND created_at >= ?", since),
    orders: await one('SELECT COUNT(*) AS n FROM orders'),
    customers: await one("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'"),
    products: await one('SELECT COUNT(*) AS n FROM products WHERE active = 1'),
    pendingOrders: await one("SELECT COUNT(*) AS n FROM orders WHERE status IN ('awaiting_verification','pending_payment','processing')"),
    pendingPayments: await one("SELECT COUNT(*) AS n FROM orders WHERE payment_status = 'pending_verification'"),
    recent: recent.results,
  })
})

/* ---------- orders ---------- */
admin.get('/orders', need('orders.view'), async (c) => {
  const q = c.req.query()
  const where = ['1=1']; const args: unknown[] = []
  if (q.status) { where.push('o.status = ?'); args.push(q.status) }
  if (q.payment) { where.push('o.payment_status = ?'); args.push(q.payment) }
  if (q.q) { const n = Number(latin(q.q)); where.push('(o.id = ? OR o.name LIKE ? OR o.phone LIKE ?)'); args.push(Number.isFinite(n) ? n : -1, like(q.q), like(q.q)) }
  const { per, page: pg } = page(c)
  const w = where.join(' AND ')
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE ${w}`).bind(...args).first<{ n: number }>()
  const rows = await c.env.DB.prepare(
    `SELECT o.id, o.status, o.payment_status AS paymentStatus, o.total, o.created_at AS createdAt, o.name, o.phone FROM orders o WHERE ${w} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
  ).bind(...args, per, (pg - 1) * per).all()
  return c.json({ items: rows.results, total: total?.n ?? 0, perPage: per })
})

admin.get('/orders/:id', need('orders.view'), async (c) => {
  const id = Number(c.req.param('id'))
  const o = await c.env.DB.prepare(
    `SELECT o.id, o.status, o.payment_status AS paymentStatus, o.payment_method AS paymentMethod, o.subtotal, o.discount, o.total, o.coupon_code AS couponCode,
            o.name, o.phone, o.address, o.postal_code AS postalCode, o.receipt_key AS receiptKey, o.created_at AS createdAt, o.user_id AS userId,
            u.email AS customerEmail
     FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
  ).bind(id).first()
  if (!o) return c.json({ error: 'سفارش پیدا نشد' }, 404)
  const items = await c.env.DB.prepare('SELECT product_id AS productId, name, price, qty FROM order_items WHERE order_id = ?').bind(id).all()
  const notes = await c.env.DB.prepare('SELECT n.id, n.body, n.created_at AS createdAt, u.name AS author FROM order_notes n JOIN users u ON u.id = n.user_id WHERE n.order_id = ? ORDER BY n.id DESC').bind(id).all()
  const history = await c.env.DB.prepare('SELECT h.id, h.action, h.detail, h.created_at AS createdAt, u.name AS author FROM order_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.order_id = ? ORDER BY h.id DESC').bind(id).all()
  return c.json({ order: o, items: items.results, notes: notes.results, history: history.results })
})

const hist = (c: C, orderId: number, action: string, detail = '') =>
  c.env.DB.prepare('INSERT INTO order_history (order_id, user_id, action, detail, created_at) VALUES (?,?,?,?,?)').bind(orderId, c.get('user').id, action, detail, Date.now())

admin.patch('/orders/:id/status', need('orders.manage'), async (c) => {
  const id = Number(c.req.param('id'))
  const d = await parse(c, z.object({ status: z.enum(['awaiting_verification', 'pending_payment', 'processing', 'shipped', 'completed', 'cancelled']) }))
  if (!d) return bad(c)
  const o = await c.env.DB.prepare('SELECT status, payment_status FROM orders WHERE id = ?').bind(id).first<{ status: string; payment_status: string }>()
  if (!o) return c.json({ error: 'سفارش پیدا نشد' }, 404)
  if (['processing', 'shipped', 'completed'].includes(d.status) && o.payment_status !== 'paid') return bad(c, 'ابتدا رسید پرداخت را تأیید کنید')
  const stmts = [c.env.DB.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(d.status, id), hist(c, id, 'status', `${o.status} → ${d.status}`)]
  if (d.status === 'cancelled' && o.status !== 'cancelled') {
    const items = await c.env.DB.prepare('SELECT product_id, qty, variant_id FROM order_items WHERE order_id = ?').bind(id).all<{ product_id: number; qty: number; variant_id: number | null }>()
    for (const i of items.results) stmts.push(i.variant_id ? c.env.DB.prepare('UPDATE product_variants SET stock = stock + ? WHERE id = ?').bind(i.qty, i.variant_id) : c.env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').bind(i.qty, i.product_id))
  }
  await c.env.DB.batch(stmts)
  await log(c, 'order_status', `#${id} ${o.status} → ${d.status}`)
  return c.json({ ok: true })
})

admin.post('/orders/:id/payment', need('payments.approve'), async (c) => {
  const id = Number(c.req.param('id'))
  const d = await parse(c, z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(300).optional() }))
  if (!d) return bad(c)
  const o = await c.env.DB.prepare('SELECT payment_status FROM orders WHERE id = ?').bind(id).first<{ payment_status: string }>()
  if (!o) return c.json({ error: 'سفارش پیدا نشد' }, 404)
  if (o.payment_status !== 'pending_verification') return bad(c, 'این سفارش در انتظار بررسی رسید نیست')
  const approve = d.decision === 'approve'
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE orders SET payment_status = ?, status = ? WHERE id = ?').bind(approve ? 'paid' : 'rejected', approve ? 'processing' : 'pending_payment', id),
    hist(c, id, approve ? 'payment_approved' : 'payment_rejected', d.reason || ''),
  ])
  await log(c, approve ? 'payment_approved' : 'payment_rejected', `#${id}`)
  return c.json({ ok: true })
})

admin.post('/orders/:id/notes', need('orders.manage'), async (c) => {
  const id = Number(c.req.param('id'))
  const d = await parse(c, z.object({ body: z.string().trim().min(1).max(1000) }))
  if (!d) return bad(c)
  const ex = await c.env.DB.prepare('SELECT 1 AS x FROM orders WHERE id = ?').bind(id).first()
  if (!ex) return c.json({ error: 'سفارش پیدا نشد' }, 404)
  await c.env.DB.prepare('INSERT INTO order_notes (order_id, user_id, body, created_at) VALUES (?,?,?,?)').bind(id, c.get('user')!.id, d.body, Date.now()).run()
  return c.json({ ok: true })
})

/* ---------- categories & products ---------- */
admin.get('/categories', staff, async (c) => c.json({ items: (await c.env.DB.prepare('SELECT id, name FROM categories ORDER BY sort, id').all()).results }))
admin.post('/categories', need('products.create'), async (c) => {
  const d = await parse(c, z.object({ name: z.string().trim().min(2).max(40) }))
  if (!d) return bad(c)
  const r = await c.env.DB.prepare('INSERT INTO categories (slug, name, sort) VALUES (?,?,?)').bind(`cat-${Date.now().toString(36)}`, d.name, 50).run()
  await log(c, 'category_created', d.name)
  return c.json({ id: r.meta.last_row_id, name: d.name })
})

const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(3000).default(''),
  price: z.number().int().min(1).max(10_000_000_000),
  discountPercent: z.number().int().min(0).max(90),
  categoryId: z.number().int().positive().nullable(),
  stock: z.number().int().min(0).max(1_000_000),
  featured: z.boolean(), bestseller: z.boolean(), active: z.boolean(),
  keepImages: z.array(z.string()).max(8).default([]),
  variants: z.array(z.object({ id: z.number().int().positive().optional(), name: z.string().trim().min(1).max(60), priceDelta: z.number().int().min(-1_000_000_000).max(1_000_000_000), stock: z.number().int().min(0).max(1_000_000) })).max(20).default([]),
})
async function syncVariants(c: C, productId: number, vs: { id?: number; name: string; priceDelta: number; stock: number }[]) {
  const cur = (await c.env.DB.prepare('SELECT id FROM product_variants WHERE product_id = ? AND active = 1').bind(productId).all()).results.map((r: any) => r.id as number)
  const keep = vs.filter((v) => v.id && cur.includes(v.id)).map((v) => v.id as number)
  const stmts: any[] = cur.filter((id: number) => !keep.includes(id)).map((id: number) => c.env.DB.prepare('UPDATE product_variants SET active = 0 WHERE id = ?').bind(id))
  for (const v of vs) {
    stmts.push(v.id && cur.includes(v.id)
      ? c.env.DB.prepare('UPDATE product_variants SET name = ?, price_delta = ?, stock = ? WHERE id = ?').bind(v.name, v.priceDelta, v.stock, v.id)
      : c.env.DB.prepare('INSERT INTO product_variants (product_id, name, price_delta, stock, active) VALUES (?,?,?,?,1)').bind(productId, v.name, v.priceDelta, v.stock))
  }
  if (stmts.length) await c.env.DB.batch(stmts)
}
async function readProductForm(c: C) {
  const form = await c.req.formData().catch(() => null)
  if (!form) return null
  let raw: unknown
  try { raw = JSON.parse(String(form.get('payload') || '')) } catch { return null }
  const r = productSchema.safeParse(raw)
  if (!r.success) return null
  const files = form.getAll('images').filter((f: unknown): f is File => f instanceof File && f.size > 0)
  return { data: r.data, files }
}
const BAD_FORM = 'اطلاعات محصول کامل نیست (نام، قیمت، تخفیف ۰–۹۰٪ و موجودی را بررسی کنید)'
const BAD_IMG = 'هر تصویر باید JPG، PNG یا WebP و حداکثر ۵ مگابایت باشد (حداکثر ۸ تصویر)'

async function saveFiles(c: C, files: File[]): Promise<string[] | null> {
  const keys: string[] = []
  for (const f of files) {
    const k = await storeImage(c.env, 'products', f)
    if (!k) { await Promise.all(keys.map((x) => c.env.FILES.delete(x))); return null }
    keys.push(k)
  }
  return keys
}

admin.get('/products', need('products.edit'), async (c) => {
  const q = c.req.query()
  const where = ['1=1']; const args: unknown[] = []
  if (q.q) { where.push('p.name LIKE ?'); args.push(like(q.q)) }
  const { per, page: pg } = page(c)
  const w = where.join(' AND ')
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM products p WHERE ${w}`).bind(...args).first<{ n: number }>()
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.price, p.discount_percent AS discountPercent, ${STOCK_EXPR} AS stock, p.active, p.featured, p.bestseller, p.images, c.name AS category
     FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${w} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
  ).bind(...args, per, (pg - 1) * per).all<any>()
  return c.json({ items: rows.results.map((r) => ({ ...r, images: JSON.parse(r.images || '[]') })), total: total?.n ?? 0, perPage: per })
})

admin.get('/products/:id', need('products.edit'), async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(Number(c.req.param('id'))).first<any>()
  if (!r) return c.json({ error: 'محصول پیدا نشد' }, 404)
  return c.json({ product: { id: r.id, name: r.name, description: r.description, price: r.price, discountPercent: r.discount_percent, categoryId: r.category_id, stock: r.stock, featured: !!r.featured, bestseller: !!r.bestseller, active: !!r.active, images: JSON.parse(r.images || '[]'), variants: (await c.env.DB.prepare('SELECT id, name, price_delta AS priceDelta, stock FROM product_variants WHERE product_id = ? AND active = 1 ORDER BY id').bind(r.id).all()).results } })
})

admin.post('/products', need('products.create'), async (c) => {
  const f = await readProductForm(c)
  if (!f) return bad(c, BAD_FORM)
  if (f.files.length && !can(c, 'products.images')) return c.json({ error: 'اجازه آپلود تصویر ندارید' }, 403)
  if (f.files.length > 8) return bad(c, BAD_IMG)
  const keys = await saveFiles(c, f.files)
  if (!keys) return bad(c, BAD_IMG)
  const d = f.data
  const r = await c.env.DB.prepare(
    'INSERT INTO products (name, description, price, discount_percent, category_id, stock, featured, bestseller, active, images, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  ).bind(d.name, d.description, d.price, d.discountPercent, d.categoryId, d.stock, +d.featured, +d.bestseller, +d.active, JSON.stringify(keys), Date.now()).run()
  await syncVariants(c, r.meta.last_row_id as number, d.variants)
  await log(c, 'product_created', d.name)
  return c.json({ id: r.meta.last_row_id })
})

admin.put('/products/:id', need('products.edit'), async (c) => {
  const id = Number(c.req.param('id'))
  const cur = await c.env.DB.prepare('SELECT images FROM products WHERE id = ?').bind(id).first<{ images: string }>()
  if (!cur) return c.json({ error: 'محصول پیدا نشد' }, 404)
  const f = await readProductForm(c)
  if (!f) return bad(c, BAD_FORM)
  const existing: string[] = JSON.parse(cur.images || '[]')
  const keep = f.data.keepImages.filter((k) => existing.includes(k))
  const removed = existing.filter((k) => !keep.includes(k))
  if ((f.files.length || removed.length) && !can(c, 'products.images')) return c.json({ error: 'اجازه تغییر تصاویر ندارید' }, 403)
  if (keep.length + f.files.length > 8) return bad(c, BAD_IMG)
  const added = await saveFiles(c, f.files)
  if (!added) return bad(c, BAD_IMG)
  const d = f.data
  await c.env.DB.prepare(
    'UPDATE products SET name=?, description=?, price=?, discount_percent=?, category_id=?, stock=?, featured=?, bestseller=?, active=?, images=? WHERE id=?',
  ).bind(d.name, d.description, d.price, d.discountPercent, d.categoryId, d.stock, +d.featured, +d.bestseller, +d.active, JSON.stringify([...keep, ...added]), id).run()
  await syncVariants(c, id, d.variants)
  await Promise.all(removed.map((k) => c.env.FILES.delete(k)))
  await log(c, 'product_updated', `#${id} ${d.name}`)
  return c.json({ ok: true })
})

admin.delete('/products/:id', need('products.delete'), async (c) => {
  const id = Number(c.req.param('id'))
  const cur = await c.env.DB.prepare('SELECT name, images FROM products WHERE id = ?').bind(id).first<{ name: string; images: string }>()
  if (!cur) return c.json({ error: 'محصول پیدا نشد' }, 404)
  const used = await c.env.DB.prepare('SELECT 1 AS x FROM order_items WHERE product_id = ? LIMIT 1').bind(id).first()
  if (used) {
    await c.env.DB.prepare('UPDATE products SET active = 0 WHERE id = ?').bind(id).run()
    await log(c, 'product_deactivated', `#${id} ${cur.name}`)
    return c.json({ ok: true, softDeleted: true })
  }
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM favorites WHERE product_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM reviews WHERE product_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id),
  ])
  await Promise.all((JSON.parse(cur.images || '[]') as string[]).map((k) => c.env.FILES.delete(k)))
  await log(c, 'product_deleted', `#${id} ${cur.name}`)
  return c.json({ ok: true })
})

/* ---------- customers & messages ---------- */
admin.get('/customers', need('customers.view'), async (c) => {
  const q = c.req.query()
  const where = ["u.role = 'customer'"]; const args: unknown[] = []
  if (q.q) { where.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)'); args.push(like(q.q), like(q.q), like(q.q)) }
  if (q.status) { where.push('u.status = ?'); args.push(q.status) }
  const { per, page: pg } = page(c)
  const w = where.join(' AND ')
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users u WHERE ${w}`).bind(...args).first<{ n: number }>()
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at AS createdAt,
       (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders,
       (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid') AS spent
     FROM users u WHERE ${w} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
  ).bind(...args, per, (pg - 1) * per).all()
  return c.json({ items: rows.results, total: total?.n ?? 0, perPage: per })
})
admin.get('/customers/:id', need('customers.view'), async (c) => {
  const id = Number(c.req.param('id'))
  const u = await c.env.DB.prepare("SELECT id, name, email, phone, status, created_at AS createdAt FROM users WHERE id = ? AND role = 'customer'").bind(id).first()
  if (!u) return c.json({ error: 'مشتری پیدا نشد' }, 404)
  const orders = await c.env.DB.prepare('SELECT id, status, payment_status AS paymentStatus, total, created_at AS createdAt FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100').bind(id).all()
  const reviews = await c.env.DB.prepare('SELECT r.id, r.rating, r.body, r.status, r.created_at AS createdAt, p.name AS product FROM reviews r JOIN products p ON p.id = r.product_id WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 50').bind(id).all()
  return c.json({ customer: u, orders: orders.results, reviews: reviews.results })
})
admin.patch('/customers/:id/status', need('customers.manage'), async (c) => {
  const id = Number(c.req.param('id'))
  const d = await parse(c, z.object({ status: z.enum(['active', 'suspended']) }))
  if (!d) return bad(c)
  const r = await c.env.DB.prepare("UPDATE users SET status = ? WHERE id = ? AND role = 'customer'").bind(d.status, id).run()
  if (!r.meta.changes) return c.json({ error: 'مشتری پیدا نشد' }, 404)
  if (d.status === 'suspended') await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run()
  await log(c, d.status === 'suspended' ? 'customer_suspended' : 'customer_activated', `#${id}`)
  return c.json({ ok: true })
})
admin.get('/messages', need('customers.view'), async (c) =>
  c.json({ items: (await c.env.DB.prepare('SELECT id, name, email, phone, message, created_at AS createdAt FROM contact_messages ORDER BY id DESC LIMIT 100').all()).results }))

/* ---------- employees ---------- */
const roleEnum = z.enum(['super_admin', 'admin', 'sales_manager', 'product_manager', 'support_agent', 'order_manager'])
const permList = z.array(z.string()).max(30)
function checkGrant(c: C, role: string, perms: string[]): string | null {
  const actor = c.get('user')!
  if (role === 'super_admin' && actor.role !== 'super_admin') return 'فقط مدیر کل می‌تواند مدیر کل بسازد'
  if (perms.some((p) => !(p in PERMISSIONS))) return 'دسترسی نامعتبر'
  if (actor.role !== 'super_admin' && perms.some((p) => !can(c, p))) return 'نمی‌توانید دسترسی‌ای را بدهید که خودتان ندارید'
  return null
}
const setPerms = (c: C, userId: number, perms: string[]) => [
  c.env.DB.prepare('DELETE FROM user_permissions WHERE user_id = ?').bind(userId),
  ...perms.map((p) => c.env.DB.prepare('INSERT INTO user_permissions (user_id, permission) VALUES (?,?)').bind(userId, p)),
]

admin.get('/employees', need('employees.manage'), async (c) => {
  const users = await c.env.DB.prepare("SELECT id, name, email, username, role, status, created_at AS createdAt FROM users WHERE role != 'customer' ORDER BY id").all<any>()
  const perms = await c.env.DB.prepare('SELECT user_id, permission FROM user_permissions').all<{ user_id: number; permission: string }>()
  return c.json({ items: users.results.map((u) => ({ ...u, permissions: u.role === 'super_admin' ? Object.keys(PERMISSIONS) : perms.results.filter((p) => p.user_id === u.id).map((p) => p.permission) })) })
})

admin.post('/employees', need('employees.manage'), async (c) => {
  const d = await parse(c, z.object({
    name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(120),
    username: z.string().trim().toLowerCase().regex(/^[a-z0-9_.]{3,30}$/), password: z.string().min(10).max(100),
    role: roleEnum, permissions: permList.optional(),
  }))
  if (!d) return bad(c, 'نام، ایمیل، نام‌کاربری انگلیسی (۳ تا ۳۰ کاراکتر) و رمز حداقل ۱۰ کاراکتری را وارد کنید')
  const perms = d.permissions ?? ROLE_PRESETS[d.role]
  const g = checkGrant(c, d.role, perms)
  if (g) return c.json({ error: g }, 403)
  const dup = await c.env.DB.prepare('SELECT 1 AS x FROM users WHERE email = ? OR username = ?').bind(d.email, d.username).first()
  if (dup) return c.json({ error: 'ایمیل یا نام‌کاربری تکراری است' }, 409)
  const r = await c.env.DB.prepare("INSERT INTO users (email, username, name, password_hash, role, status, created_at) VALUES (?,?,?,?,?,'active',?)")
    .bind(d.email, d.username, d.name, await hashPassword(d.password), d.role, Date.now()).run()
  await c.env.DB.batch(setPerms(c, r.meta.last_row_id as number, d.role === 'super_admin' ? [] : perms))
  await log(c, 'employee_created', `${d.username} (${d.role})`)
  return c.json({ id: r.meta.last_row_id })
})

admin.patch('/employees/:id', need('employees.manage'), async (c) => {
  const id = Number(c.req.param('id'))
  const actor = c.get('user')!
  const d = await parse(c, z.object({
    name: z.string().trim().min(2).max(80).optional(), role: roleEnum.optional(), status: z.enum(['active', 'inactive']).optional(),
    permissions: permList.optional(), password: z.string().min(10).max(100).optional(),
  }))
  if (!d) return bad(c)
  const t = await c.env.DB.prepare("SELECT id, role, username FROM users WHERE id = ? AND role != 'customer'").bind(id).first<{ id: number; role: string; username: string }>()
  if (!t) return c.json({ error: 'کارمند پیدا نشد' }, 404)
  if (t.role === 'super_admin' && actor.role !== 'super_admin') return c.json({ error: 'فقط مدیر کل می‌تواند مدیر کل را ویرایش کند' }, 403)
  if (id === actor.id && (d.status === 'inactive' || (d.role && d.role !== actor.role))) return bad(c, 'نمی‌توانید وضعیت یا نقش خودتان را تغییر دهید')
  const role = d.role ?? t.role
  const perms = d.permissions ?? (d.role ? ROLE_PRESETS[d.role] : undefined)
  const g = checkGrant(c, role, perms ?? [])
  if (g) return c.json({ error: g }, 403)
  const stmts = []
  if (d.name) stmts.push(c.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(d.name, id))
  if (d.role) stmts.push(c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(d.role, id))
  if (d.status) stmts.push(c.env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(d.status, id))
  if (d.password) stmts.push(c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(d.password), id))
  if (perms) stmts.push(...setPerms(c, id, role === 'super_admin' ? [] : perms))
  if (d.status === 'inactive' || d.password || d.role || d.permissions) stmts.push(c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id))
  if (stmts.length) await c.env.DB.batch(stmts)
  await log(c, 'employee_updated', `${t.username}: ${Object.keys(d).filter((k) => k !== 'password').join(',')}${d.password ? ',password' : ''}`)
  return c.json({ ok: true })
})

admin.get('/employees/:id/logs', need('employees.manage'), async (c) =>
  c.json({ items: (await c.env.DB.prepare('SELECT id, action, detail, created_at AS createdAt FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 100').bind(Number(c.req.param('id'))).all()).results }))

/* ---------- settings ---------- */
const KEYS_PAY = ['c2c_enabled', 'c2c_card', 'c2c_holder', 'c2c_bank', 'c2c_instructions']
const KEYS_STORE = ['store_phone', 'store_email', 'store_address']
const readKeys = async (c: C, keys: string[]) => {
  const r = await c.env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`).bind(...keys).all()
  return Object.fromEntries(r.results.map((x: any) => [x.key, x.value]))
}
const writeKeys = (c: C, kv: Record<string, string>) =>
  c.env.DB.batch(Object.entries(kv).map(([k, v]) => c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v)))

admin.get('/settings/payment', need('payments.settings'), async (c) => {
  const s = await readKeys(c, KEYS_PAY)
  return c.json({ enabled: s.c2c_enabled === '1', card: s.c2c_card || '', holder: s.c2c_holder || '', bank: s.c2c_bank || '', instructions: s.c2c_instructions || '' })
})
admin.put('/settings/payment', need('payments.settings'), async (c) => {
  const d = await parse(c, z.object({ enabled: z.boolean(), card: z.string().max(40), holder: z.string().trim().max(80), bank: z.string().trim().max(60), instructions: z.string().trim().max(500) }))
  if (!d) return bad(c)
  const card = latin(d.card).replace(/[\s-]/g, '')
  if (card && !/^\d{16}$/.test(card)) return bad(c, 'شماره کارت باید ۱۶ رقم باشد')
  if (d.enabled && (!card || !d.holder || !d.bank)) return bad(c, 'برای فعال‌سازی، شماره کارت، نام صاحب کارت و نام بانک را وارد کنید')
  await writeKeys(c, { c2c_enabled: d.enabled ? '1' : '0', c2c_card: card, c2c_holder: d.holder, c2c_bank: d.bank, c2c_instructions: d.instructions })
  await log(c, 'payment_settings_updated', d.enabled ? 'card-to-card enabled' : 'card-to-card disabled')
  return c.json({ ok: true })
})
admin.get('/settings/store', need('settings.manage'), async (c) => {
  const s = await readKeys(c, KEYS_STORE)
  return c.json({ phone: s.store_phone || '', email: s.store_email || '', address: s.store_address || '' })
})
admin.put('/settings/store', need('settings.manage'), async (c) => {
  const d = await parse(c, z.object({ phone: z.string().trim().max(40), email: z.string().trim().max(120), address: z.string().trim().max(300) }))
  if (!d) return bad(c)
  await writeKeys(c, { store_phone: d.phone, store_email: d.email, store_address: d.address })
  await log(c, 'store_settings_updated')
  return c.json({ ok: true })
})
