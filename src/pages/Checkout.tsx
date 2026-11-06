import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api, num, toman } from '../api'
import type { Settings } from '../types'
import { useAuth, useCart } from '../context'

type Addr = { id: number; title: string; address: string; postalCode: string }

export default function Checkout() {
  const { user, ready } = useAuth()
  const cart = useCart()
  const nav = useNavigate()
  const [s, setS] = useState<Settings | null>(null)
  const [addrs, setAddrs] = useState<Addr[]>([])
  const [f, setF] = useState({ name: user?.name || '', phone: user?.phone || '', address: '', postalCode: '' })
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [method, setMethod] = useState<'card_to_card' | 'online'>('card_to_card')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { api<Settings>('/settings/public').then((r) => { setS(r); if (!r.cardToCard.enabled && r.online.enabled) setMethod('online') }).catch((e) => setErr(e.message)) }, [])
  useEffect(() => { if (user) { setF((x) => ({ ...x, name: x.name || user.name, phone: x.phone || user.phone || '' })); api<{ items: Addr[] }>('/addresses').then((r) => setAddrs(r.items)).catch(() => {}) } }, [user])
  useEffect(() => { if (!file) { setPreview(''); return } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u) }, [file])

  if (!ready) return <div className="page"><p className="notice">در حال بارگذاری…</p></div>
  if (!user) return <Navigate to="/login" state={{ from: '/checkout' }} replace />
  if (!cart.items.length) return <div className="page"><p className="notice">سبد خرید شما خالی است.</p><Link to="/shop" className="btn">رفتن به فروشگاه</Link></div>

  const c2c = s?.cardToCard
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (method === 'card_to_card') {
      if (!file) { setErr('تصویر رسید پرداخت را بارگذاری کنید'); return }
      if (file.size > 5 * 1024 * 1024) { setErr('حجم رسید حداکثر ۵ مگابایت است'); return }
    }
    setBusy(true)
    try {
      const form = new FormData()
      form.set('payload', JSON.stringify({ items: cart.items.map((i) => ({ productId: i.id, variantId: i.variantId ?? undefined, qty: i.qty })), ...f, paymentMethod: method, couponCode: cart.coupon?.code }))
      if (method === 'card_to_card' && file) form.set('receipt', file)
      const r = await api<{ id: number }>('/orders', { form })
      cart.clear()
      if (method === 'online') {
        try { const pay = await api<{ url: string }>(`/orders/${r.id}/pay`, { method: 'POST', json: {} }); window.location.href = pay.url; return } catch { /* order page offers a retry */ }
      }
      nav(`/account/orders/${r.id}`, { replace: true, state: { created: true } })
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="page">
      <h1 className="pt">تسویه حساب</h1>
      <form className="cart" onSubmit={submit}>
        <div className="lines">
          <section className="card form">
            <h2>اطلاعات ارسال</h2>
            {addrs.length > 0 && (
              <label>نشانی‌های ذخیره‌شده
                <select defaultValue="" onChange={(e) => { const a = addrs.find((x) => x.id === Number(e.target.value)); if (a) setF({ ...f, address: a.address, postalCode: a.postalCode }) }}>
                  <option value="">انتخاب کنید…</option>{addrs.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
              </label>
            )}
            <label>نام و نام خانوادگی<input required value={f.name} onChange={up('name')} /></label>
            <label>شماره موبایل<input required dir="ltr" inputMode="numeric" pattern="09\d{9}" value={f.phone} onChange={up('phone')} /></label>
            <label>نشانی کامل<textarea required minLength={10} rows={3} value={f.address} onChange={up('address')} /></label>
            <label>کدپستی (۱۰ رقم)<input required dir="ltr" inputMode="numeric" pattern="\d{10}" value={f.postalCode} onChange={up('postalCode')} /></label>
          </section>

          <section className="card form">
            <h2>روش پرداخت</h2>
            {!s && !err && <p className="muted">در حال بارگذاری…</p>}
            {s && !c2c?.enabled && !s.online.enabled && <p className="notice err">در حال حاضر هیچ روش پرداختی فعال نیست. لطفاً بعداً تلاش کنید.</p>}
            {c2c?.enabled && <label className="radio"><input type="radio" name="pm" checked={method === 'card_to_card'} onChange={() => setMethod('card_to_card')} />کارت‌به‌کارت (آپلود رسید)</label>}
            {s?.online.enabled && <label className="radio"><input type="radio" name="pm" checked={method === 'online'} onChange={() => setMethod('online')} />پرداخت آنلاین (درگاه بانکی)</label>}
            {method === 'online' && s?.online.enabled && <p className="muted">پس از ثبت سفارش به درگاه پرداخت منتقل می‌شوید.</p>}
            {method === 'card_to_card' && c2c?.enabled && (
              <>
                <div className="cardbox">
                  <small>شماره کارت مقصد</small>
                  <strong dir="ltr">{c2c.card}</strong>
                  <span>به نام: {c2c.holder}</span>
                  <span>بانک: {c2c.bank}</span>
                  {c2c.instructions && <p>{c2c.instructions}</p>}
                  <p>مبلغ قابل پرداخت: <b>{toman(cart.total)}</b></p>
                </div>
                <label>تصویر رسید پرداخت (JPG، PNG یا WebP — حداکثر ۵ مگابایت)
                  <input type="file" accept="image/jpeg,image/png,image/webp" required onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </label>
                {preview && <img className="receipt-prev" src={preview} alt="پیش‌نمایش رسید" />}
                <p className="muted">سفارش شما پس از بررسی و تأیید رسید توسط مدیر نهایی می‌شود.</p>
              </>
            )}
          </section>
        </div>
        <aside className="sum">
          <h2>خلاصه سفارش</h2>
          {cart.items.map((i) => <div className="mini" key={i.key}><span>{i.name}{i.variantName && ` (${i.variantName})`} × {num(i.qty)}</span><span>{toman(i.finalPrice * i.qty)}</span></div>)}
          <dl>
            <dt>جمع جزء</dt><dd>{toman(cart.subtotal)}</dd>
            {cart.discount > 0 && <><dt>تخفیف</dt><dd>−{toman(cart.discount)}</dd></>}
            <dt className="tot">جمع کل</dt><dd className="tot">{toman(cart.total)}</dd>
          </dl>
          {err && <p className="err-t" role="alert">{err}</p>}
          <button className="btn wide" disabled={busy || (!c2c?.enabled && !s?.online.enabled)}>{busy ? 'در حال ثبت…' : 'ثبت سفارش'}</button>
        </aside>
      </form>
    </div>
  )
}
