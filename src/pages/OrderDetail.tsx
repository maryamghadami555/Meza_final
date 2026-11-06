import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { api, date, num, PAYMENT, STATUS, toman } from '../api'
import { useAuth } from '../context'

type Order = { id: number; status: string; paymentStatus: string; paymentMethod: string; subtotal: number; discount: number; total: number; couponCode: string | null; name: string; phone: string; address: string; postalCode: string; receiptKey: string | null; createdAt: number }
type Item = { productId: number; name: string; price: number; qty: number }

export default function OrderDetail() {
  const { id } = useParams()
  const { user, ready } = useAuth()
  const created = (useLocation().state as { created?: boolean } | null)?.created
  const pay = useSearchParams()[0].get('pay')
  const [d, setD] = useState<{ order: Order; items: Item[] } | null>(null)
  const [err, setErr] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const load = () => api<{ order: Order; items: Item[] }>(`/orders/${id}`).then(setD).catch((e) => setErr(e.message))
  useEffect(() => { if (user) load() }, [id, user])
  if (!ready) return null
  if (!user) return <Navigate to="/login" replace />
  if (err && !d) return <div className="page"><p className="notice err">{err}</p></div>
  if (!d) return <div className="page"><p className="notice">در حال بارگذاری…</p></div>
  const o = d.order
  const startPay = async () => { setErr(''); try { const r = await api<{ url: string }>(`/orders/${o.id}/pay`, { method: 'POST', json: {} }); window.location.href = r.url } catch (x) { setErr((x as Error).message) } }
  return (
    <div className="page">
      {pay === 'ok' && <p className="notice ok">پرداخت با موفقیت انجام شد.</p>}
      {pay === 'failed' && <p className="notice err">پرداخت انجام نشد. می‌توانید دوباره تلاش کنید.</p>}
      {created && o.paymentMethod === 'card_to_card' && <p className="notice ok">سفارش شما ثبت شد. پس از تأیید رسید پرداخت، وضعیت سفارش به‌روزرسانی می‌شود.</p>}
      <h1 className="pt">سفارش #{num(o.id)}</h1>
      <div className="card info">
        <div><small>تاریخ</small>{date(o.createdAt)}</div>
        <div><small>وضعیت سفارش</small><span className={'tag ' + o.status}>{STATUS[o.status] || o.status}</span></div>
        <div><small>وضعیت پرداخت</small>{PAYMENT[o.paymentStatus]}</div>
        <div><small>روش پرداخت</small>{o.paymentMethod === 'online' ? 'آنلاین' : 'کارت‌به‌کارت'}</div>
        <div><small>گیرنده</small>{o.name} — <span dir="ltr">{o.phone}</span></div>
        <div className="full"><small>نشانی</small>{o.address} (کدپستی {o.postalCode})</div>
      </div>
      <div className="card">
        {d.items.map((i, k) => <div className="mini" key={k}><Link to={`/product/${i.productId}`}>{i.name} × {num(i.qty)}</Link><span>{toman(i.price * i.qty)}</span></div>)}
        <div className="mini"><span>جمع جزء</span><span>{toman(o.subtotal)}</span></div>
        {o.discount > 0 && <div className="mini"><span>تخفیف {o.couponCode}</span><span>−{toman(o.discount)}</span></div>}
        <div className="mini tot"><span>جمع کل</span><span>{toman(o.total)}</span></div>
      </div>
      {err && <p className="err-t" role="alert">{err}</p>}
      {o.paymentMethod === 'online' && o.paymentStatus === 'unpaid' && o.status !== 'cancelled' && <button className="btn" onClick={startPay}>پرداخت آنلاین</button>}
      {o.receiptKey && <div className="card"><h3>رسید پرداخت</h3><img className="receipt-prev" src={`/api/files/${o.receiptKey}`} alt="رسید پرداخت" /></div>}
      {o.paymentStatus === 'rejected' && (
        <form className="card form" onSubmit={async (e) => { e.preventDefault(); if (!file) return; setErr(''); const f = new FormData(); f.set('receipt', file); try { await api(`/orders/${o.id}/receipt`, { form: f }); setFile(null); load() } catch (x) { setErr((x as Error).message) } }}>
          <h3>ارسال رسید جدید</h3><p className="muted">رسید قبلی تأیید نشد. لطفاً رسید صحیح را بارگذاری کنید.</p>
          <input type="file" required accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} /><button className="btn">ارسال رسید</button>
        </form>
      )}
    </div>
  )
}
