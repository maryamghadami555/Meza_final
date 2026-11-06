import type { Hono } from 'hono'
import { z } from 'zod'
import { Env, Vars, bad, unauth, parse, storeImage, hashPassword, sha256, decryptText, publicUrl, sendMail, loginBlocked, loginFail, throttleKey } from './lib'

type A = Hono<{ Bindings: Env; Variables: Vars }>
type C = any

async function readForm<T extends z.ZodTypeAny>(c: C, schema: T) {
  const form = await c.req.formData().catch(() => null)
  if (!form) return null
  let raw: unknown
  try { raw = JSON.parse(String(form.get('payload') || '')) } catch { return null }
  const r = schema.safeParse(raw)
  return r.success ? { data: r.data as z.infer<T>, form: form as FormData } : null
}
const filesOf = (form: FormData, name: string) => form.getAll(name).filter((f): f is File => f instanceof File && f.size > 0)
const BAD_IMG = 'تصویر باید JPG، PNG یا WebP و حداکثر ۵ مگابایت باشد'

export function registerPhase3(app: A) {
  /* ================= tickets (customer) ================= */
  app.get('/api/tickets-unread', async (c) => {
    const u = c.get('user')
    if (!u) return c.json({ count: 0 })
    const r = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM ticket_messages m JOIN tickets t ON t.id = m.ticket_id WHERE t.user_id = ? AND m.is_staff = 1 AND m.read_at IS NULL').bind(u.id).first<{ n: number }>()
    return c.json({ count: r?.n ?? 0 })
  })

  app.get('/api/tickets', async (c) => {
    const u = c.get('user')
    if (!u) return unauth(c)
    const r = await c.env.DB.prepare(
      `SELECT t.id, t.subject, t.category, t.priority, t.status, t.updated_at AS updatedAt,
         (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id AND m.is_staff = 1 AND m.read_at IS NULL) AS unread
       FROM tickets t WHERE t.user_id = ? ORDER BY t.updated_at DESC LIMIT 100`,
    ).bind(u.id).all()
    return c.json({ items: r.results })
  })

  app.post('/api/tickets', async (c) => {
    const u = c.get('user')
    if (!u) return unauth(c)
    const f = await readForm(c, z.object({
      subject: z.string().trim().min(3).max(120), category: z.enum(['order', 'payment', 'product', 'technical', 'other']),
      priority: z.enum(['low', 'normal', 'high']), body: z.string().trim().min(2).max(2000),
    }))
    if (!f) return bad(c, 'موضوع (حداقل ۳ کاراکتر)، دسته‌بندی و متن پیام را وارد کنید')
    const imgs = filesOf(f.form, 'image')
    let key: string | null = null
    if (imgs[0]) { key = await storeImage(c.env, 'tickets', imgs[0]); if (!key) return bad(c, BAD_IMG) }
    const now = Date.now()
    const r = await c.env.DB.prepare("INSERT INTO tickets (user_id, subject, category, priority, status, created_at, updated_at) VALUES (?,?,?,?,'open',?,?)")
      .bind(u.id, f.data.subject, f.data.category, f.data.priority, now, now).run()
    await c.env.DB.prepare('INSERT INTO ticket_messages (ticket_id, sender_id, is_staff, body, image_key, created_at) VALUES (?,?,0,?,?,?)')
      .bind(r.meta.last_row_id, u.id, f.data.body, key, now).run()
    return c.json({ id: r.meta.last_row_id })
  })

  app.get('/api/tickets/:id', async (c) => {
    const u = c.get('user')
    if (!u) return unauth(c)
    const id = Number(c.req.param('id'))
    const t = await c.env.DB.prepare('SELECT id, subject, category, priority, status, created_at AS createdAt FROM tickets WHERE id = ? AND user_id = ?').bind(id, u.id).first()
    if (!t) return c.json({ error: 'تیکت پیدا نشد' }, 404)
    await c.env.DB.prepare('UPDATE ticket_messages SET read_at = ? WHERE ticket_id = ? AND is_staff = 1 AND read_at IS NULL').bind(Date.now(), id).run()
    const m = await c.env.DB.prepare('SELECT id, is_staff AS isStaff, body, image_key AS imageKey, created_at AS createdAt, read_at AS readAt FROM ticket_messages WHERE ticket_id = ? ORDER BY id').bind(id).all()
    return c.json({ ticket: t, messages: m.results })
  })

  app.post('/api/tickets/:id/messages', async (c) => {
    const u = c.get('user')
    if (!u) return unauth(c)
    const id = Number(c.req.param('id'))
    const t = await c.env.DB.prepare('SELECT status FROM tickets WHERE id = ? AND user_id = ?').bind(id, u.id).first<{ status: string }>()
    if (!t) return c.json({ error: 'تیکت پیدا نشد' }, 404)
    if (t.status === 'closed') return bad(c, 'این تیکت بسته شده است')
    const f = await readForm(c, z.object({ body: z.string().trim().max(2000) }))
    if (!f) return bad(c)
    const imgs = filesOf(f.form, 'image')
    if (!f.data.body && !imgs.length) return bad(c, 'متن یا تصویر وارد کنید')
    let key: string | null = null
    if (imgs[0]) { key = await storeImage(c.env, 'tickets', imgs[0]); if (!key) return bad(c, BAD_IMG) }
    const now = Date.now()
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO ticket_messages (ticket_id, sender_id, is_staff, body, image_key, created_at) VALUES (?,?,0,?,?,?)').bind(id, u.id, f.data.body, key, now),
      c.env.DB.prepare("UPDATE tickets SET status = 'open', updated_at = ? WHERE id = ?").bind(now, id),
    ])
    return c.json({ ok: true })
  })

  /* ================= reviews (customer) ================= */
  const purchase = (db: D1Database, userId: number, productId: number) =>
    db.prepare("SELECT o.id FROM orders o JOIN order_items i ON i.order_id = o.id WHERE o.user_id = ? AND i.product_id = ? AND o.payment_status = 'paid' AND o.status != 'cancelled' ORDER BY o.id DESC LIMIT 1")
      .bind(userId, productId).first<{ id: number }>()

  app.get('/api/products/:id/review-eligibility', async (c) => {
    const u = c.get('user')
    if (!u) return c.json({ canReview: false, reason: 'login' })
    const pid = Number(c.req.param('id'))
    if (await c.env.DB.prepare('SELECT 1 AS x FROM reviews WHERE product_id = ? AND user_id = ?').bind(pid, u.id).first()) return c.json({ canReview: false, reason: 'already' })
    return c.json(await purchase(c.env.DB, u.id, pid) ? { canReview: true } : { canReview: false, reason: 'not_purchased' })
  })

  app.post('/api/reviews', async (c) => {
    const u = c.get('user')
    if (!u) return unauth(c)
    const f = await readForm(c, z.object({ productId: z.number().int().positive(), rating: z.number().int().min(1).max(5), body: z.string().trim().max(1000) }))
    if (!f) return bad(c, 'امتیاز ۱ تا ۵ را انتخاب کنید')
    const { productId, rating, body } = f.data
    const o = await purchase(c.env.DB, u.id, productId)
    if (!o) return bad(c, 'فقط خریداران این محصول می‌توانند نظر ثبت کنند')
    if (await c.env.DB.prepare('SELECT 1 AS x FROM reviews WHERE product_id = ? AND user_id = ?').bind(productId, u.id).first()) return c.json({ error: 'قبلاً برای این محصول نظر ثبت کرده‌اید' }, 409)
    const imgs = filesOf(f.form, 'images')
    if (imgs.length > 3) return bad(c, 'حداکثر ۳ تصویر')
    const keys: string[] = []
    for (const im of imgs) {
      const k = await storeImage(c.env, 'reviews', im)
      if (!k) { await Promise.all(keys.map((x) => c.env.FILES.delete(x))); return bad(c, BAD_IMG) }
      keys.push(k)
    }
    await c.env.DB.prepare("INSERT INTO reviews (product_id, user_id, order_id, rating, body, images, status, created_at) VALUES (?,?,?,?,?,?,'pending',?)")
      .bind(productId, u.id, o.id, rating, body, JSON.stringify(keys), Date.now()).run()
    return c.json({ ok: true })
  })

  /* ================= online payment (Zarinpal) ================= */
  app.post('/api/orders/:id/pay', async (c) => {
    const u = c.get('user')
    if (!u) return unauth(c)
    const id = Number(c.req.param('id'))
    const o = await c.env.DB.prepare('SELECT total, payment_method, payment_status, phone FROM orders WHERE id = ? AND user_id = ?').bind(id, u.id).first<{ total: number; payment_method: string; payment_status: string; phone: string }>()
    if (!o) return c.json({ error: 'سفارش پیدا نشد' }, 404)
    if (o.payment_method !== 'online' || o.payment_status !== 'unpaid') return bad(c, 'این سفارش قابل پرداخت آنلاین نیست')
    const cfg = await getGateway(c)
    if (!cfg) return c.json({ error: 'درگاه پرداخت آنلاین به‌درستی تنظیم نشده است' }, 400)
    const res = await zarinpal(cfg.sandbox, 'request', {
      merchant_id: cfg.merchant, amount: o.total * 10, // toman -> rial
      callback_url: `${publicUrl(c)}/api/payments/zarinpal/callback?order=${id}`, description: `سفارش #${id}`, metadata: { mobile: o.phone },
    })
    const authority = res?.data?.authority
    if (res?.data?.code !== 100 || !authority) return c.json({ error: 'اتصال به درگاه ناموفق بود؛ دوباره تلاش کنید' }, 502)
    await c.env.DB.prepare('UPDATE orders SET gateway_authority = ? WHERE id = ?').bind(authority, id).run()
    return c.json({ url: `${cfg.base}/pg/StartPay/${authority}` })
  })

  // The gateway sends the browser back here. Payment is trusted ONLY after server-side verification.
  app.get('/api/payments/zarinpal/callback', async (c) => {
    const id = Number(c.req.query('order'))
    const authority = c.req.query('Authority') || ''
    const back = (flag: string) => c.redirect(`${publicUrl(c)}/account/orders/${id}?pay=${flag}`)
    const o = await c.env.DB.prepare('SELECT total, payment_status, gateway_authority FROM orders WHERE id = ? AND payment_method = ?').bind(id, 'online').first<{ total: number; payment_status: string; gateway_authority: string | null }>()
    if (!o || !authority || o.gateway_authority !== authority) return back('failed')
    if (o.payment_status === 'paid') return back('ok')
    if (c.req.query('Status') !== 'OK') return back('failed')
    const cfg = await getGateway(c)
    if (!cfg) return back('failed')
    const v = await zarinpal(cfg.sandbox, 'verify', { merchant_id: cfg.merchant, amount: o.total * 10, authority })
    if (v?.data?.code === 100 || v?.data?.code === 101) {
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE orders SET payment_status = 'paid', status = 'processing', gateway_ref = ? WHERE id = ? AND payment_status = 'unpaid'").bind(String(v.data.ref_id ?? ''), id),
        c.env.DB.prepare("INSERT INTO order_history (order_id, user_id, action, detail, created_at) VALUES (?,NULL,'payment_online',?,?)").bind(id, `ref ${v.data.ref_id ?? ''}`, Date.now()),
      ])
      return back('ok')
    }
    return back('failed')
  })

  /* ================= password reset ================= */
  app.post('/api/auth/forgot', async (c) => {
    const d = await parse(c, z.object({ email: z.string().trim().toLowerCase().email().max(120) }))
    if (!d) return bad(c, 'ایمیل معتبر وارد کنید')
    const tk = throttleKey(c, 'f', d.email)
    if (await loginBlocked(c.env.DB, tk)) return c.json({ error: 'درخواست‌های زیاد؛ کمی بعد دوباره تلاش کنید' }, 429)
    await loginFail(c.env.DB, tk) // every request counts toward the limit
    const u = await c.env.DB.prepare("SELECT id FROM users WHERE email = ? AND status = 'active'").bind(d.email).first<{ id: number }>()
    if (u) {
      const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(u.id),
        c.env.DB.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)').bind(await sha256(token), u.id, Date.now() + 3600000),
      ])
      const link = `${publicUrl(c)}/reset-password?token=${token}`
      await sendMail(c.env, d.email, 'بازیابی رمز عبور — MEZA ACCESSORY',
        `<div dir="rtl" style="font-family:Tahoma,sans-serif"><p>برای تعیین رمز جدید روی لینک زیر بزنید (تا یک ساعت معتبر است):</p><p><a href="${link}">${link}</a></p><p>اگر شما درخواست نداده‌اید، این ایمیل را نادیده بگیرید.</p></div>`)
    }
    return c.json({ ok: true }) // same answer whether or not the account exists
  })

  app.post('/api/auth/reset', async (c) => {
    const d = await parse(c, z.object({ token: z.string().min(20).max(100), password: z.string().min(8).max(100) }))
    if (!d) return bad(c, 'رمز جدید باید حداقل ۸ کاراکتر باشد')
    const row = await c.env.DB.prepare('SELECT r.user_id, u.role FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ? AND r.expires_at > ?').bind(await sha256(d.token), Date.now()).first<{ user_id: number; role: string }>()
    if (!row) return bad(c, 'لینک بازیابی نامعتبر یا منقضی شده است')
    if (row.role !== 'customer' && d.password.length < 10) return bad(c, 'رمز کارمندان باید حداقل ۱۰ کاراکتر باشد')
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(d.password), row.user_id),
      c.env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(row.user_id),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
    ])
    return c.json({ ok: true })
  })
}

/* ---------- gateway helpers (shared with admin3.ts) ---------- */
export async function zarinpal(sandbox: boolean, op: 'request' | 'verify', body: unknown): Promise<any> {
  const base = sandbox ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com'
  try {
    const r = await fetch(`${base}/pg/v4/payment/${op}.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
    return await r.json()
  } catch { return null }
}
export async function getGateway(c: C): Promise<{ merchant: string; sandbox: boolean; base: string } | null> {
  if (!c.env.SETTINGS_KEY) return null
  const r = await c.env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('online_enabled','online_merchant_enc','online_sandbox')").all()
  const s = Object.fromEntries(r.results.map((x: any) => [x.key, x.value]))
  if (s.online_enabled !== '1' || !s.online_merchant_enc) return null
  try {
    const sandbox = s.online_sandbox === '1'
    return { merchant: await decryptText(c.env.SETTINGS_KEY, s.online_merchant_enc), sandbox, base: sandbox ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com' }
  } catch { return null }
}
