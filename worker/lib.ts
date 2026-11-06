import { setCookie } from 'hono/cookie'
import { z } from 'zod'

export type Env = { DB: D1Database; FILES: R2Bucket; ASSETS: Fetcher; SETTINGS_KEY?: string; RESEND_API_KEY?: string; MAIL_FROM?: string; PUBLIC_URL?: string }
export type User = { id: number; email: string; name: string; phone: string | null; role: string; status: string }
export type Vars = { user: User | null; perms: Set<string> }

export const COOKIE = 'meza_session'
export const SESSION_DAYS = 14
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/* ---------- permissions ---------- */
export const PERMISSIONS: Record<string, string> = {
  'orders.view': 'مشاهده سفارش‌ها',
  'orders.manage': 'مدیریت سفارش‌ها',
  'payments.approve': 'تأیید/رد رسید پرداخت',
  'payments.settings': 'تنظیمات پرداخت',
  'customers.view': 'مشاهده مشتریان و پیام‌ها',
  'customers.manage': 'مدیریت حساب مشتریان',
  'products.create': 'ایجاد محصول',
  'products.edit': 'ویرایش محصول',
  'products.delete': 'حذف محصول',
  'products.images': 'آپلود تصویر محصول',
  'tickets.reply': 'پاسخ به تیکت‌ها',
  'reviews.manage': 'مدیریت نظرات',
  'employees.manage': 'مدیریت کارمندان',
  'analytics.view': 'مشاهده آمار',
  'settings.manage': 'تنظیمات فروشگاه',
}
export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'مدیر کل', admin: 'مدیر', sales_manager: 'مدیر فروش',
  product_manager: 'مدیر محصول', support_agent: 'پشتیبان', order_manager: 'مدیر سفارش',
}
const ALL = Object.keys(PERMISSIONS)
export const ROLE_PRESETS: Record<string, string[]> = {
  super_admin: ALL,
  admin: ALL.filter((p) => p !== 'employees.manage'),
  sales_manager: ['orders.view', 'orders.manage', 'payments.approve', 'customers.view', 'analytics.view'],
  product_manager: ['products.create', 'products.edit', 'products.delete', 'products.images', 'reviews.manage'],
  support_agent: ['tickets.reply', 'customers.view', 'orders.view', 'reviews.manage'],
  order_manager: ['orders.view', 'orders.manage', 'payments.approve'],
}

export async function loadPerms(db: D1Database, u: User): Promise<Set<string>> {
  if (u.role === 'customer') return new Set()
  if (u.role === 'super_admin') return new Set(ALL)
  const r = await db.prepare('SELECT permission FROM user_permissions WHERE user_id = ?').bind(u.id).all<{ permission: string }>()
  return new Set(r.results.map((x) => x.permission).filter((p) => p in PERMISSIONS))
}

/* ---------- crypto ---------- */
const enc = new TextEncoder()
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const b64url = (b: Uint8Array) => b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256))
}
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$100000$${b64(salt)}$${b64(await pbkdf2(password, salt, 100000))}`
}
export async function verifyPassword(password: string, stored: string) {
  const [alg, iter, salt, hash] = stored.split('$')
  if (alg !== 'pbkdf2') return false
  const actual = await pbkdf2(password, unb64(salt), Number(iter))
  const expected = unb64(hash)
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}
export async function sha256(text: string) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/* ---------- sessions & request helpers ---------- */
export async function startSession(c: any, userId: number) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)))
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)')
    .bind(await sha256(token), userId, Date.now() + SESSION_DAYS * 86400000).run()
  setCookie(c, COOKIE, token, {
    httpOnly: true, secure: new URL(c.req.url).protocol === 'https:' || c.req.header('X-Forwarded-Proto') === 'https', sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400,
  })
}
export const parse = async <T extends z.ZodTypeAny>(c: any, schema: T): Promise<z.infer<T> | null> => {
  const body = await c.req.json().catch(() => null)
  const r = schema.safeParse(body)
  return r.success ? r.data : null
}
export const bad = (c: any, msg = 'اطلاعات ارسال‌شده معتبر نیست') => c.json({ error: msg }, 400)
export const unauth = (c: any) => c.json({ error: 'ابتدا وارد حساب کاربری شوید' }, 401)

/* ---------- login throttling (5 failures / 15 min per IP+identity) ---------- */
export const throttleKey = (c: any, scope: string, id: string) => `${scope}|${c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || '-'}|${id}`
export async function loginBlocked(db: D1Database, key: string) {
  const r = await db.prepare('SELECT n, ts FROM login_attempts WHERE k = ?').bind(key).first<{ n: number; ts: number }>()
  return !!r && Date.now() - r.ts < 900000 && r.n >= 5
}
export async function loginFail(db: D1Database, key: string) {
  const now = Date.now()
  await db.prepare(
    `INSERT INTO login_attempts (k, n, ts) VALUES (?,1,?)
     ON CONFLICT(k) DO UPDATE SET n = CASE WHEN ? - ts > 900000 THEN 1 ELSE n + 1 END, ts = CASE WHEN ? - ts > 900000 THEN ? ELSE ts END`,
  ).bind(key, now, now, now, now).run()
}
export const loginClear = (db: D1Database, key: string) => db.prepare('DELETE FROM login_attempts WHERE k = ?').bind(key).run()

/* ---------- images (R2) ---------- */
export function sniff(b: Uint8Array): [string, string] | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ['image/jpeg', 'jpg']
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ['image/png', 'png']
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return ['image/webp', 'webp']
  return null
}
/** Validates size + real file signature (not the client-supplied type), stores under a random name. */
export async function storeImage(env: Env, folder: 'receipts' | 'products' | 'tickets' | 'reviews', file: File): Promise<string | null> {
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return null
  const buf = await file.arrayBuffer()
  const kind = sniff(new Uint8Array(buf.slice(0, 12)))
  if (!kind) return null
  const key = `${folder}/${crypto.randomUUID()}.${kind[1]}`
  await env.FILES.put(key, buf, { httpMetadata: { contentType: kind[0] } })
  return key
}

/* ---------- misc ---------- */
export const STOCK_EXPR = `(CASE WHEN EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active = 1)
  THEN (SELECT COALESCE(SUM(v.stock),0) FROM product_variants v WHERE v.product_id = p.id AND v.active = 1) ELSE p.stock END)`

async function aesKey(secret: string) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function encryptText(secret: string, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(text))
  return `${b64(iv)}.${b64(ct)}`
}
export async function decryptText(secret: string, value: string) {
  const [iv, ct] = value.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(secret), unb64(ct))
  return new TextDecoder().decode(pt)
}
export const publicUrl = (c: any) => {
  if (c.env.PUBLIC_URL) return String(c.env.PUBLIC_URL).replace(/\/$/, '')
  const u = new URL(c.req.url)
  return `${c.req.header('X-Forwarded-Proto') || u.protocol.replace(':', '')}://${u.host}`
}
export async function sendMail(env: Env, to: string, subject: string, html: string) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return false
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html }),
  })
  return r.ok
}
