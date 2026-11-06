import { z } from 'zod'
import { admin, need, staff, can, log, like, page } from './admin'
import { parse, bad, encryptText, decryptText, publicUrl, storeImage } from './lib'
import { zarinpal } from './phase3'

type C = any
const needAny = (...perms: string[]) => async (c: C, next: () => Promise<void>) => {
  if (!c.get('user')) return c.json({ error: 'ابتدا وارد شوید' }, 401)
  if (!perms.some((p) => c.get('perms').has(p))) return c.json({ error: 'دسترسی کافی ندارید' }, 403)
  await next()
}
const PERIOD = 30 * 86400000

/* ---------- sidebar notifications ---------- */
admin.get('/badges', staff, async (c) => {
  const n = async (perm: string, sql: string) => (can(c, perm) ? (await c.env.DB.prepare(sql).first<{ n: number }>())?.n ?? 0 : 0)
  return c.json({
    tickets: await n('tickets.reply', "SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'"),
    reviews: await n('reviews.manage', "SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'"),
    payments: await n('payments.approve', "SELECT COUNT(*) AS n FROM orders WHERE payment_status = 'pending_verification'"),
  })
})

/* ---------- analytics (30-day periods, last 6) ---------- */
admin.get('/sales', need('analytics.view'), async (c) => {
  const now = Date.now()
  const monthly = await c.env.DB.prepare(
    "SELECT CAST((? - created_at) / ? AS INTEGER) AS b, SUM(total) AS total, COUNT(*) AS orders FROM orders WHERE payment_status = 'paid' AND created_at >= ? GROUP BY b",
  ).bind(now, PERIOD, now - 6 * PERIOD).all()
  const best = await c.env.DB.prepare(
    `SELECT p.name, SUM(i.qty) AS qty, SUM(i.qty * i.price) AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id
     WHERE o.payment_status = 'paid' GROUP BY i.product_id ORDER BY qty DESC LIMIT 5`,
  ).all()
  const cats = await c.env.DB.prepare(
    `SELECT COALESCE(c.name, 'بدون دسته') AS name, SUM(i.qty) AS qty FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id
     LEFT JOIN categories c ON c.id = p.category_id WHERE o.payment_status = 'paid' GROUP BY c.id ORDER BY qty DESC`,
  ).all()
  const recentCustomers = await c.env.DB.prepare("SELECT id, name, created_at AS createdAt FROM users WHERE role = 'customer' ORDER BY id DESC LIMIT 5").all()
  return c.json({ now, period: PERIOD, monthly: monthly.results, best: best.results, categories: cats.results, recentCustomers: recentCustomers.results })
})

admin.get('/satisfaction', needAny('analytics.view', 'reviews.manage'), async (c) => {
  const now = Date.now()
  const dist = await c.env.DB.prepare("SELECT rating, COUNT(*) AS n FROM reviews WHERE status = 'approved' GROUP BY rating").all<{ rating: number; n: number }>()
  const trend = await c.env.DB.prepare(
    "SELECT CAST((? - created_at) / ? AS INTEGER) AS b, AVG(rating) AS avg, COUNT(*) AS n FROM reviews WHERE status = 'approved' AND created_at >= ? GROUP BY b",
  ).bind(now, PERIOD, now - 6 * PERIOD).all()
  const distribution = [1, 2, 3, 4, 5].map((r) => ({ rating: r, n: dist.results.find((x) => x.rating === r)?.n ?? 0 }))
  const total = distribution.reduce((a, x) => a + x.n, 0)
  const sum = distribution.reduce((a, x) => a + x.n * x.rating, 0)
  const satisfied = distribution.filter((x) => x.rating >= 4).reduce((a, x) => a + x.n, 0)
  return c.json({ now, period: PERIOD, total, average: total ? Math.round((sum / total) * 10) / 10 : 0, satisfiedPercent: total ? Math.round((satisfied / total) * 100) : 0, distribution, trend: trend.results })
})

/* ---------- review moderation ---------- */
admin.get('/reviews', need('reviews.manage'), async (c) => {
  const status = c.req.query('status')
  const { per, page: pg } = page(c)
  const where = status ? 'WHERE r.status = ?' : ''
  const args = status ? [status] : []
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM reviews r ${where}`).bind(...args).first<{ n: number }>()
  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.rating, r.body, r.images, r.status, r.created_at AS createdAt, r.order_id AS orderId, u.name AS customer, p.name AS product
     FROM reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
  ).bind(...args, per, (pg - 1) * per).all<any>()
  return c.json({ items: rows.results.map((r) => ({ ...r, images: JSON.parse(r.images || '[]') })), total: total?.n ?? 0, perPage: per })
})
admin.patch('/reviews/:id', need('reviews.manage'), async (c) => {
  const id = Number(c.req.param('id'))
  const d = await parse(c, z.object({ status: z.enum(['approved', 'rejected', 'pending']) }))
  if (!d) return bad(c)
  const r = await c.env.DB.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind(d.status, id).run()
  if (!r.meta.changes) return c.json({ error: 'نظر پیدا نشد' }, 404)
  await log(c, 'review_' + d.status, `#${id}`)
  return c.json({ ok: true })
})
admin.delete('/reviews/:id', need('reviews.manage'), async (c) => {
  const id = Number(c.req.param('id'))
  const r = await c.env.DB.prepare('SELECT images FROM reviews WHERE id = ?').bind(id).first<{ images: string }>()
  if (!r) return c.json({ error: 'نظر پیدا نشد' }, 404)
  await c.env.DB.prepare('DELETE FROM reviews WHERE id = ?').bind(id).run()
  await Promise.all((JSON.parse(r.images || '[]') as string[]).map((k) => c.env.FILES.delete(k)))
  await log(c, 'review_deleted', `#${id}`)
  return c.json({ ok: true })
})

/* ---------- tickets (admin) ---------- */
admin.get('/tickets', need('tickets.reply'), async (c) => {
  const q = c.req.query()
  const where = ['1=1']; const args: unknown[] = []
  if (q.status) { where.push('t.status = ?'); args.push(q.status) }
  if (q.q) { where.push('(t.subject LIKE ? OR u.name LIKE ? OR t.id = ?)'); args.push(like(q.q), like(q.q), Number(q.q) || -1) }
  const { per, page: pg } = page(c)
  const w = where.join(' AND ')
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM tickets t JOIN users u ON u.id = t.user_id WHERE ${w}`).bind(...args).first<{ n: number }>()
  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.subject, t.category, t.priority, t.status, t.updated_at AS updatedAt, u.name AS customer,
       (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id AND m.is_staff = 0 AND m.read_at IS NULL) AS unread
     FROM tickets t JOIN users u ON u.id = t.user_id WHERE ${w} ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`,
  ).bind(...args, per, (pg - 1) * per).all()
  return c.json({ items: rows.results, total: total?.n ?? 0, perPage: per })
})
admin.get('/tickets/:id', need('tickets.reply'), async (c) => {
  const id = Number(c.req.param('id'))
  const t = await c.env.DB.prepare('SELECT t.id, t.subject, t.category, t.priority, t.status, t.created_at AS createdAt, u.name AS customer, u.id AS customerId FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ?').bind(id).first()
  if (!t) return c.json({ error: 'تیکت پیدا نشد' }, 404)
  await c.env.DB.prepare('UPDATE ticket_messages SET read_at = ? WHERE ticket_id = ? AND is_staff = 0 AND read_at IS NULL').bind(Date.now(), id).run()
  const m = await c.env.DB.prepare('SELECT id, is_staff AS isStaff, body, image_key AS imageKey, created_at AS createdAt, read_at AS readAt FROM ticket_messages WHERE ticket_id = ? ORDER BY id').bind(id).all()
  return c.json({ ticket: t, messages: m.results })
})
admin.post('/tickets/:id/messages', need('tickets.reply'), async (c) => {
  const id = Number(c.req.param('id'))
  const t = await c.env.DB.prepare('SELECT status FROM tickets WHERE id = ?').bind(id).first<{ status: string }>()
  if (!t) return c.json({ error: 'تیکت پیدا نشد' }, 404)
  if (t.status === 'closed') return bad(c, 'تیکت بسته است؛ ابتدا آن را دوباره باز کنید')
  const form = await c.req.formData().catch(() => null)
  if (!form) return bad(c)
  const body = String(form.get('body') || '').trim().slice(0, 2000)
  const img = form.get('image')
  const hasImg = img instanceof File && img.size > 0
  if (!body && !hasImg) return bad(c, 'متن یا تصویر وارد کنید')
  let key: string | null = null
  if (hasImg) {
    key = await storeImage(c.env, 'tickets', img as File)
    if (!key) return bad(c, 'تصویر باید JPG، PNG یا WebP و حداکثر ۵ مگابایت باشد')
  }
  const now = Date.now()
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO ticket_messages (ticket_id, sender_id, is_staff, body, image_key, created_at) VALUES (?,?,1,?,?,?)').bind(id, c.get('user').id, body, key, now),
    c.env.DB.prepare("UPDATE tickets SET status = 'answered', updated_at = ? WHERE id = ?").bind(now, id),
  ])
  await log(c, 'ticket_reply', `#${id}`)
  return c.json({ ok: true })
})
admin.patch('/tickets/:id', need('tickets.reply'), async (c) => {
  const id = Number(c.req.param('id'))
  const d = await parse(c, z.object({ status: z.enum(['open', 'answered', 'closed']).optional(), priority: z.enum(['low', 'normal', 'high']).optional() }))
  if (!d || (!d.status && !d.priority)) return bad(c)
  const stmts = []
  if (d.status) stmts.push(c.env.DB.prepare('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?').bind(d.status, Date.now(), id))
  if (d.priority) stmts.push(c.env.DB.prepare('UPDATE tickets SET priority = ? WHERE id = ?').bind(d.priority, id))
  await c.env.DB.batch(stmts)
  await log(c, 'ticket_updated', `#${id} ${d.status || ''} ${d.priority || ''}`)
  return c.json({ ok: true })
})

/* ---------- online gateway settings ---------- */
const MERCHANT_RE = /^[0-9a-fA-F-]{36}$/
const readOnline = async (c: C) => {
  const r = await c.env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('online_enabled','online_merchant_enc','online_sandbox')").all()
  return Object.fromEntries(r.results.map((x: any) => [x.key, x.value])) as Record<string, string>
}
admin.get('/settings/online', need('payments.settings'), async (c) => {
  const s = await readOnline(c)
  let hint = ''
  if (s.online_merchant_enc && c.env.SETTINGS_KEY) { try { hint = '••••' + (await decryptText(c.env.SETTINGS_KEY, s.online_merchant_enc)).slice(-4) } catch { hint = '' } }
  return c.json({ provider: 'zarinpal', enabled: s.online_enabled === '1', sandbox: s.online_sandbox === '1', hasMerchant: !!s.online_merchant_enc, merchantHint: hint, keyConfigured: !!c.env.SETTINGS_KEY })
})
admin.put('/settings/online', need('payments.settings'), async (c) => {
  const d = await parse(c, z.object({ enabled: z.boolean(), sandbox: z.boolean(), merchantId: z.string().trim().max(60).optional() }))
  if (!d) return bad(c)
  const s = await readOnline(c)
  let enc = s.online_merchant_enc || ''
  if (d.merchantId) {
    if (!c.env.SETTINGS_KEY) return bad(c, 'متغیر محیطی SETTINGS_KEY تنظیم نشده است؛ README را ببینید')
    if (!MERCHANT_RE.test(d.merchantId)) return bad(c, 'مرچنت‌کد باید ۳۶ کاراکتر (فرمت UUID) باشد')
    enc = await encryptText(c.env.SETTINGS_KEY, d.merchantId)
  }
  if (d.enabled && !enc) return bad(c, 'برای فعال‌سازی ابتدا مرچنت‌کد را وارد کنید')
  await c.env.DB.batch(Object.entries({ online_enabled: d.enabled ? '1' : '0', online_sandbox: d.sandbox ? '1' : '0', online_merchant_enc: enc })
    .map(([k, v]) => c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v)))
  await log(c, 'online_settings_updated', d.enabled ? 'enabled' : 'disabled')
  return c.json({ ok: true })
})
// Validates merchant id + connectivity by opening a minimal payment request (nothing is charged).
admin.post('/settings/online/test', need('payments.settings'), async (c) => {
  const s = await readOnline(c)
  if (!c.env.SETTINGS_KEY || !s.online_merchant_enc) return bad(c, 'ابتدا مرچنت‌کد را ذخیره کنید')
  let merchant = ''
  try { merchant = await decryptText(c.env.SETTINGS_KEY, s.online_merchant_enc) } catch { return bad(c, 'خواندن مرچنت‌کد ممکن نشد؛ SETTINGS_KEY را بررسی کنید') }
  const r = await zarinpal(s.online_sandbox === '1', 'request', { merchant_id: merchant, amount: 10000, callback_url: `${publicUrl(c)}/api/payments/zarinpal/callback?order=0`, description: 'تست اتصال' })
  if (r?.data?.code === 100) return c.json({ ok: true, message: 'اتصال به درگاه و مرچنت‌کد معتبر است.' })
  return c.json({ ok: false, message: `درگاه تنظیمات را نپذیرفت (کد ${r?.errors?.code ?? r?.data?.code ?? 'نامشخص'}).` })
})
