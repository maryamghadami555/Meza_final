import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'

import { Env, Vars, User, COOKIE, loadPerms, hashPassword, verifyPassword, sha256, startSession, parse, bad, unauth, storeImage, throttleKey, loginBlocked, loginFail, loginClear } from './lib'
import { admin } from './admin'
import './admin3'
import { registerPhase3 } from './phase3'
import { STOCK_EXPR } from './lib'

const app = new Hono<{ Bindings: Env; Variables: Vars }>()

/* ---------- middleware ---------- */
app.use('/api/*', async (c, next) => {
  // CSRF defence in depth (cookie is also SameSite=Lax): reject cross-origin state changes.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin')
    if (origin && new URL(origin).host !== new URL(c.req.url).host) return c.json({ error: 'درخواست نامعتبر است' }, 403)
  }
  c.set('user', null)
  c.set('perms', new Set())
  const token = getCookie(c, COOKIE)
  if (token) {
    const row = await c.env.DB.prepare(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.status FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
      .bind(await sha256(token), Date.now())
      .first<User>()
    if (row && row.status === 'active') { c.set('user', row); c.set('perms', await loadPerms(c.env.DB, row)) }
  }
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'same-origin')
})

app.onError((err, c) => {
  console.error('unhandled', err)
  return c.json({ error: 'خطای داخلی سرور' }, 500)
})

const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role })

/* ---------- auth ---------- */
const phoneRe = /^09\d{9}$/
const postalRe = /^\d{10}$/

app.post('/api/auth/register', async (c) => {
  const d = await parse(c, z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().max(120),
    phone: z.string().trim().regex(phoneRe),
    password: z.string().min(8).max(100),
  }))
  if (!d) return bad(c, 'نام، ایمیل، شماره موبایل (۰۹…) و رمز عبور (حداقل ۸ کاراکتر) را درست وارد کنید')
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(d.email).first()
  if (exists) return c.json({ error: 'این ایمیل قبلاً ثبت شده است' }, 409)
  const res = await c.env.DB.prepare(
    "INSERT INTO users (email, name, phone, password_hash, role, status, created_at) VALUES (?,?,?,?,'customer','active',?)",
  )
    .bind(d.email, d.name, d.phone, await hashPassword(d.password), Date.now())
    .run()
  const id = res.meta.last_row_id as number
  await startSession(c, id)
  return c.json({ user: { id, email: d.email, name: d.name, phone: d.phone, role: 'customer' } })
})

app.post('/api/auth/login', async (c) => {
  const d = await parse(c, z.object({ email: z.string().trim().toLowerCase().max(120), password: z.string().max(100) }))
  if (!d) return bad(c)
  const tk = throttleKey(c, 'u', d.email)
  if (await loginBlocked(c.env.DB, tk)) return c.json({ error: 'تلاش‌های ناموفق زیاد بود؛ ۱۵ دقیقه بعد دوباره تلاش کنید' }, 429)
  const row = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND role = \'customer\'').bind(d.email).first<User & { password_hash: string }>()
  const ok = row ? await verifyPassword(d.password, row.password_hash) : false
  if (!row || !ok) { await loginFail(c.env.DB, tk); return c.json({ error: 'ایمیل یا رمز عبور نادرست است' }, 401) }
  await loginClear(c.env.DB, tk)
  if (row.status !== 'active') return c.json({ error: 'حساب کاربری شما غیرفعال است' }, 403)
  await startSession(c, row.id)
  return c.json({ user: publicUser(row) })
})

app.post('/api/auth/logout', async (c) => {
  const token = getCookie(c, COOKIE)
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

app.get('/api/me', async (c) => {
  const u = c.get('user')
  if (!u) return c.json({ user: null, favorites: [] })
  const favs = await c.env.DB.prepare('SELECT product_id FROM favorites WHERE user_id = ?').bind(u.id).all<{ product_id: number }>()
  return c.json({ user: publicUser(u), favorites: favs.results.map((f) => f.product_id) })
})

app.patch('/api/me', async (c) => {
  const u = c.get('user')
  if (!u) return unauth(c)
  const d = await parse(c, z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().regex(phoneRe) }))
  if (!d) return bad(c)
  await c.env.DB.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').bind(d.name, d.phone, u.id).run()
  return c.json({ user: publicUser({ ...u, ...d }) })
})

app.post('/api/me/password', async (c) => {
  const u = c.get('user')
  if (!u) return unauth(c)
  const d = await parse(c, z.object({ current: z.string().max(100), next: z.string().min(8).max(100) }))
  if (!d) return bad(c, 'رمز جدید باید حداقل ۸ کاراکتر باشد')
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(u.id).first<{ password_hash: string }>()
  if (!row || !(await verifyPassword(d.current, row.password_hash))) return c.json({ error: 'رمز فعلی نادرست است' }, 400)
  const keep = await sha256(getCookie(c, COOKIE) || '')
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(d.next), u.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(u.id, keep),
  ])
  return c.json({ ok: true })
})

/* ---------- addresses ---------- */
app.get('/api/addresses', async (c) => {
  const u = c.get('user')
  if (!u) return unauth(c)
  const r = await c.env.DB.prepare('SELECT id, title, address, postal_code AS postalCode FROM addresses WHERE user_id = ? ORDER BY id DESC').bind(u.id).all()
  return c.json({ items: r.results })
})
app.post('/api/addresses', async (c) => {
  const u = c.get('user')
  if (!u) return unauth(c)
  const d = await parse(c, z.object({ title: z.string().trim().min(2).max(40), address: z.string().trim().min(10).max(300), postalCode: z.string().regex(postalRe) }))
  if (!d) return bad(c, 'عنوان، نشانی کامل و کدپستی ۱۰ رقمی را وارد کنید')
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?').bind(u.id).first<{ n: number }>()
  if ((n?.n ?? 0) >= 10) return bad(c, 'حداکثر ۱۰ نشانی می‌توانید ذخیره کنید')
  await c.env.DB.prepare('INSERT INTO addresses (user_id, title, address, postal_code) VALUES (?,?,?,?)').bind(u.id, d.title, d.address, d.postalCode).run()
  return c.json({ ok: true })
})
app.delete('/api/addresses/:id', async (c) => {
  const u = c.get('user')
  if (!u) return unauth(c)
  await c.env.DB.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), u.id).run()
  return c.json({ ok: true })
})

/* ---------- catalogue ---------- */
const FINAL = '(p.price * (100 - p.discount_percent) / 100)'
const mapProduct = (r: any) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  price: r.price,
  discountPercent: r.discount_percent,
  finalPrice: Math.round((r.price * (100 - r.discount_percent)) / 100),
  stock: r.avail_stock ?? r.stock,
  hasVariants: !!r.variant_count,
  featured: !!r.featured,
  bestseller: !!r.bestseller,
  images: JSON.parse(r.images || '[]') as string[],
  category: r.category_name ? { name: r.category_name, slug: r.category_slug } : null,
  rating: Math.round((r.rating || 0) * 10) / 10,
  reviewCount: r.review_count || 0,
  sold: r.sold || 0,
})
const SELECT_PRODUCT = `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
  COALESCE((SELECT AVG(rating) FROM reviews r WHERE r.product_id = p.id AND r.status = 'approved'), 0) AS rating,
  (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.status = 'approved') AS review_count,
  COALESCE((SELECT SUM(qty) FROM order_items oi WHERE oi.product_id = p.id), 0) AS sold,
  ${STOCK_EXPR} AS avail_stock,
  (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.active = 1) AS variant_count,
  ${FINAL} AS final_price
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`

app.get('/api/categories', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT c.id, c.slug, c.name, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS count
     FROM categories c ORDER BY c.sort, c.id`,
  ).all()
  return c.json({ items: r.results })
})

app.get('/api/products', async (c) => {
  const q = c.req.query()
  const where = ['p.active = 1']
  const args: unknown[] = []
  if (q.q) { where.push('p.name LIKE ?'); args.push(`%${q.q.slice(0, 60)}%`) }
  if (q.category) { where.push('c.slug = ?'); args.push(q.category) }
  if (q.min && Number(q.min) >= 0) { where.push(`${FINAL} >= ?`); args.push(Number(q.min)) }
  if (q.max && Number(q.max) > 0) { where.push(`${FINAL} <= ?`); args.push(Number(q.max)) }
  if (q.featured === '1') where.push('p.featured = 1')
  if (q.bestseller === '1') where.push('p.bestseller = 1')
  if (q.inStock === '1') where.push(`${STOCK_EXPR} > 0`)
  const order: Record<string, string> = {
    newest: 'p.id DESC', price_asc: 'final_price ASC', price_desc: 'final_price DESC', popular: 'sold DESC, p.id DESC', rating: 'rating DESC, review_count DESC',
  }
  const perPage = Math.min(Math.max(Number(q.perPage) || 12, 1), 24)
  const page = Math.max(Number(q.page) || 1, 1)
  const w = where.join(' AND ')
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${w}`).bind(...args).first<{ n: number }>()
  const rows = await c.env.DB.prepare(`${SELECT_PRODUCT} WHERE ${w} ORDER BY ${order[q.sort] || order.newest} LIMIT ? OFFSET ?`)
    .bind(...args, perPage, (page - 1) * perPage)
    .all()
  return c.json({ items: rows.results.map(mapProduct), total: total?.n ?? 0, page, perPage })
})

app.get('/api/products/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const row = await c.env.DB.prepare(`${SELECT_PRODUCT} WHERE p.id = ? AND p.active = 1`).bind(id).first()
  if (!row) return c.json({ error: 'محصول پیدا نشد' }, 404)
  const product = mapProduct(row)
  const related = await c.env.DB.prepare(`${SELECT_PRODUCT} WHERE p.active = 1 AND p.id != ? AND p.category_id = ? ORDER BY p.id DESC LIMIT 4`)
    .bind(id, (row as any).category_id ?? 0)
    .all()
  const reviews = await c.env.DB.prepare(
    `SELECT r.id, r.rating, r.body, r.images, r.created_at AS createdAt, u.name AS author,
            EXISTS (SELECT 1 FROM orders o WHERE o.id = r.order_id) AS verified
     FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ? AND r.status = 'approved' ORDER BY r.id DESC LIMIT 20`,
  ).bind(id).all()
  const variants = await c.env.DB.prepare('SELECT id, name, price_delta AS priceDelta, stock FROM product_variants WHERE product_id = ? AND active = 1 ORDER BY id').bind(id).all()
  return c.json({ product, variants: variants.results, related: related.results.map(mapProduct), reviews: reviews.results.map((r: any) => ({ ...r, images: JSON.parse(r.images || '[]') })) })
})

/* ---------- favorites ---------- */
app.get('/api/favorites', async (c) => {
  const u = c.get('user')
  if (!u) return unauth(c)
  const r = await c.env.DB.prepare(`${SELECT_PRODUCT} WHERE p.active = 1 AND p.id IN (SELECT product_id FROM favorites WHERE user_id = ?) ORDER BY p.id DESC`).bind(u.id).all()
  return c.json({ items: r.results.map(mapProduct) })
})
app.post('/api/favorites/:id', async (c) => {
  const u = c.get('user')
  if (!u) return unauth(c)
  const id = Number(c.req.param('id'))
  const has = await c.env.DB.prepare('SELECT 1 AS x FROM favorites WHERE user_id = ? AND product_id = ?').bind(u.id, id).first()
  if (has) {
    await c.env.DB.prepare('DELETE FROM favorites WHERE user_id = ? AND product_id = ?').bind(u.id, id).run()
    return c.json({ favorite: false })
  }
  const exists = await c.env.DB.prepare('SELECT 1 AS x FROM products WHERE id = ?').bind(id).first()
  if (!exists) return c.json({ error: 'محصول پیدا نشد' }, 404)
  await c.env.DB.prepare('INSERT INTO favorites (user_id, product_id) VALUES (?,?)').bind(u.id, id).run()
  return c.json({ favorite: true })
})

/* ---------- settings / contact ---------- */
app.get('/api/settings/public', async (c) => {
  const r = await c.env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
  const s = Object.fromEntries(r.results.map((x) => [x.key, x.value]))
  const c2c = s.c2c_enabled === '1'
  return c.json({
    cardToCard: c2c ? { enabled: true, card: s.c2c_card, holder: s.c2c_holder, bank: s.c2c_bank, instructions: s.c2c_instructions } : { enabled: false },
    online: { enabled: s.online_enabled === '1' },
    store: { phone: s.store_phone, email: s.store_email, address: s.store_address },
  })
})

app.post('/api/contact', async (c) => {
  const d = await parse(c, z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120).optional().or(z.literal('')),
    phone: z.string().trim().regex(phoneRe).optional().or(z.literal('')),
    message: z.string().trim().min(5).max(2000),
  }))
  if (!d) return bad(c, 'نام و متن پیام را وارد کنید')
  await c.env.DB.prepare('INSERT INTO contact_messages (name, email, phone, message, created_at) VALUES (?,?,?,?,?)')
    .bind(d.name, d.email || null, d.phone || null, d.message, Date.now()).run()
  return c.json({ ok: true })
})

/* ---------- coupons ---------- */
async function findCoupon(db: D1Database, code: string) {
  return db.prepare('SELECT code, percent, max_uses, used FROM coupons WHERE code = ? AND active = 1')
    .bind(code.trim().toUpperCase())
    .first<{ code: string; percent: number; max_uses: number; used: number }>()
    .then((r) => (r && (r.max_uses === 0 || r.used < r.max_uses) ? r : null))
}
app.post('/api/coupons/validate', async (c) => {
  const d = await parse(c, z.object({ code: z.string().trim().min(1).max(30) }))
  if (!d) return bad(c)
  const cp = await findCoupon(c.env.DB, d.code)
  if (!cp) return c.json({ error: 'کد تخفیف معتبر نیست' }, 404)
  return c.json({ code: cp.code, percent: cp.percent })
})

/* ---------- files (R2) ---------- */
app.get('/api/files/:folder/:name', async (c) => {
  const folder = c.req.param('folder')
  const name = c.req.param('name')
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(name) || !['products', 'receipts', 'tickets', 'reviews'].includes(folder)) return c.notFound()
  const key = `${folder}/${name}`
  if (folder === 'receipts') {
    const u = c.get('user')
    if (!u) return unauth(c)
    const owner = await c.env.DB.prepare('SELECT user_id FROM orders WHERE receipt_key = ?').bind(key).first<{ user_id: number }>()
    if (!owner || (owner.user_id !== u.id && !c.get('perms').has('orders.view'))) return c.json({ error: 'دسترسی مجاز نیست' }, 403)
  }
  if (folder === 'tickets') {
    const u = c.get('user')
    if (!u) return unauth(c)
    const t = await c.env.DB.prepare('SELECT t.user_id FROM ticket_messages m JOIN tickets t ON t.id = m.ticket_id WHERE m.image_key = ?').bind(key).first<{ user_id: number }>()
    if (!t || (t.user_id !== u.id && !c.get('perms').has('tickets.reply'))) return c.json({ error: 'دسترسی مجاز نیست' }, 403)
  }
  if (folder === 'reviews') {
    const u = c.get('user')
    const r = await c.env.DB.prepare('SELECT user_id, status FROM reviews WHERE images LIKE ?').bind(`%${key}%`).first<{ user_id: number; status: string }>()
    if (!r || (r.status !== 'approved' && !(u && (u.id === r.user_id || c.get('perms').has('reviews.manage'))))) return c.json({ error: 'دسترسی مجاز نیست' }, 403)
  }
  const obj = await c.env.FILES.get(key)
  if (!obj) return c.notFound()
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': folder === 'products' ? 'public, max-age=31536000, immutable' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

/* ---------- orders ---------- */
const orderSchema = z.object({
  items: z.array(z.object({ productId: z.number().int().positive(), variantId: z.number().int().positive().optional(), qty: z.number().int().min(1).max(20) })).min(1).max(30),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(phoneRe),
  address: z.string().trim().min(10).max(300),
  postalCode: z.string().regex(postalRe),
  paymentMethod: z.enum(['card_to_card', 'online']),
  couponCode: z.string().trim().max(30).optional(),
})

app.post('/api/orders', async (c) => {
  const u = c.get('user')
  if (!u) return unauth(c)
  const form = await c.req.formData().catch(() => null)
  if (!form) return bad(c)
  let payload: unknown
  try { payload = JSON.parse(String(form.get('payload') || '')) } catch { return bad(c) }
  const parsed = orderSchema.safeParse(payload)
  if (!parsed.success) return bad(c, 'اطلاعات سفارش کامل نیست: نام، موبایل ۰۹…، نشانی و کدپستی ۱۰ رقمی را بررسی کنید')
  const d = parsed.data

  const settings = await c.env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('c2c_enabled','online_enabled')").all<{ key: string; value: string }>()
  const s = Object.fromEntries(settings.results.map((x) => [x.key, x.value]))
  if (d.paymentMethod === 'online' && s.online_enabled !== '1') return c.json({ error: 'پرداخت آنلاین فعال نیست' }, 400)
  if (d.paymentMethod === 'card_to_card' && s.c2c_enabled !== '1') return c.json({ error: 'پرداخت کارت‌به‌کارت فعال نیست' }, 400)

  const file = form.get('receipt')
  if (d.paymentMethod === 'card_to_card' && !(file instanceof File)) return bad(c, 'تصویر رسید پرداخت را بارگذاری کنید')

  // Merge duplicate lines (product + variant), then price everything from the DB (never trust client prices).
  const want = new Map<string, { productId: number; variantId: number | null; qty: number }>()
  for (const i of d.items) {
    const k = `${i.productId}:${i.variantId ?? 0}`
    want.set(k, { productId: i.productId, variantId: i.variantId ?? null, qty: (want.get(k)?.qty || 0) + i.qty })
  }
  const pids = [...new Set([...want.values()].map((w) => w.productId))]
  const marks = pids.map(() => '?').join(',')
  const prows = await c.env.DB.prepare(`SELECT id, name, price, discount_percent, stock FROM products WHERE active = 1 AND id IN (${marks})`)
    .bind(...pids).all<{ id: number; name: string; price: number; discount_percent: number; stock: number }>()
  if (prows.results.length !== pids.length) return bad(c, 'یکی از محصولات سبد خرید دیگر موجود نیست')
  const vrows = await c.env.DB.prepare(`SELECT id, product_id, name, price_delta, stock FROM product_variants WHERE active = 1 AND product_id IN (${marks})`)
    .bind(...pids).all<{ id: number; product_id: number; name: string; price_delta: number; stock: number }>()
  let subtotal = 0
  const short: string[] = []
  const lines: { id: number; variantId: number | null; name: string; price: number; qty: number }[] = []
  for (const w of want.values()) {
    const p = prows.results.find((x) => x.id === w.productId)!
    const vs = vrows.results.filter((v) => v.product_id === p.id)
    let delta = 0, stock = p.stock, name = p.name, variantId: number | null = null
    if (vs.length) {
      const v = vs.find((x) => x.id === w.variantId)
      if (!v) return bad(c, `برای «${p.name}» یکی از گزینه‌ها را انتخاب کنید`)
      delta = v.price_delta; stock = v.stock; name = `${p.name} — ${v.name}`; variantId = v.id
    } else if (w.variantId) return bad(c)
    if (stock < w.qty) short.push(name)
    const price = Math.max(Math.round(((p.price + delta) * (100 - p.discount_percent)) / 100), 0)
    subtotal += price * w.qty
    lines.push({ id: p.id, variantId, name, price, qty: w.qty })
  }

  if (short.length) return bad(c, `موجودی کافی نیست: ${short.join('، ')}`)
  let discount = 0
  let couponCode: string | null = null
  if (d.couponCode) {
    const cp = await findCoupon(c.env.DB, d.couponCode)
    if (!cp) return bad(c, 'کد تخفیف معتبر نیست')
    discount = Math.floor((subtotal * cp.percent) / 100)
    couponCode = cp.code
  }
  const total = subtotal - discount

  const online = d.paymentMethod === 'online'
  let receiptKey: string | null = null
  if (!online) {
    receiptKey = await storeImage(c.env, 'receipts', file as File)
    if (!receiptKey) return bad(c, 'رسید باید تصویر JPG، PNG یا WebP و حداکثر ۵ مگابایت باشد')
  }

  const res = await c.env.DB.prepare(
    `INSERT INTO orders (user_id, status, payment_method, payment_status, subtotal, discount, total, coupon_code, name, phone, address, postal_code, receipt_key, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(u.id, online ? 'pending_payment' : 'awaiting_verification', d.paymentMethod, online ? 'unpaid' : 'pending_verification', subtotal, discount, total, couponCode, d.name, d.phone, d.address, d.postalCode, receiptKey, Date.now()).run()
  const orderId = res.meta.last_row_id as number

  const stmts = [
    ...lines.map((l) => c.env.DB.prepare('INSERT INTO order_items (order_id, product_id, name, price, qty, variant_id) VALUES (?,?,?,?,?,?)').bind(orderId, l.id, l.name, l.price, l.qty, l.variantId)),
    ...lines.map((l) => l.variantId
      ? c.env.DB.prepare('UPDATE product_variants SET stock = MAX(stock - ?, 0) WHERE id = ?').bind(l.qty, l.variantId)
      : c.env.DB.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?').bind(l.qty, l.id)),
  ]
  if (couponCode) stmts.push(c.env.DB.prepare('UPDATE coupons SET used = used + 1 WHERE code = ?').bind(couponCode))
  await c.env.DB.batch(stmts)
  return c.json({ id: orderId })
})

app.get('/api/orders', async (c) => {
  const u = c.get('user')
  if (!u) return unauth(c)
  const r = await c.env.DB.prepare(
    `SELECT id, status, payment_status AS paymentStatus, payment_method AS paymentMethod, total, created_at AS createdAt,
            (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS itemCount
     FROM orders o WHERE user_id = ? ORDER BY id DESC LIMIT 100`,
  ).bind(u.id).all()
  return c.json({ items: r.results })
})

app.get('/api/orders/:id', async (c) => {
  const u = c.get('user')
  if (!u) return unauth(c)
  const o = await c.env.DB.prepare(
    `SELECT id, status, payment_status AS paymentStatus, payment_method AS paymentMethod, subtotal, discount, total, coupon_code AS couponCode,
            name, phone, address, postal_code AS postalCode, receipt_key AS receiptKey, created_at AS createdAt
     FROM orders WHERE id = ? AND user_id = ?`,
  ).bind(Number(c.req.param('id')), u.id).first()
  if (!o) return c.json({ error: 'سفارش پیدا نشد' }, 404)
  const items = await c.env.DB.prepare('SELECT product_id AS productId, name, price, qty FROM order_items WHERE order_id = ?').bind((o as any).id).all()
  return c.json({ order: o, items: items.results })
})

// Customer re-uploads a receipt after the admin rejected it.
app.post('/api/orders/:id/receipt', async (c) => {
  const u = c.get('user')
  if (!u) return unauth(c)
  const id = Number(c.req.param('id'))
  const o = await c.env.DB.prepare('SELECT payment_status FROM orders WHERE id = ? AND user_id = ?').bind(id, u.id).first<{ payment_status: string }>()
  if (!o) return c.json({ error: 'سفارش پیدا نشد' }, 404)
  if (o.payment_status !== 'rejected') return bad(c, 'برای این سفارش امکان ارسال رسید جدید وجود ندارد')
  const form = await c.req.formData().catch(() => null)
  const file = form?.get('receipt')
  if (!(file instanceof File)) return bad(c, 'تصویر رسید را بارگذاری کنید')
  const key = await storeImage(c.env, 'receipts', file)
  if (!key) return bad(c, 'رسید باید تصویر JPG، PNG یا WebP و حداکثر ۵ مگابایت باشد')
  await c.env.DB.prepare("UPDATE orders SET receipt_key = ?, payment_status = 'pending_verification', status = 'awaiting_verification' WHERE id = ?").bind(key, id).run()
  return c.json({ ok: true })
})

registerPhase3(app)
app.route('/api/admin', admin)
app.get('/api/health', (c) => c.json({ ok: true }))
app.all('/api/*', (c) => c.json({ error: 'مسیر پیدا نشد' }, 404))
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
