import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Trash2, User } from 'lucide-react'
import { api, date, num, PAYMENT, STATUS, toman } from '../api'
import type { OrderRow, Product } from '../types'
import { useAuth } from '../context'
import ProductCard from '../components/ProductCard'

type Addr = { id: number; title: string; address: string; postalCode: string }
const tabs = [['orders', 'سفارش‌های من'], ['favorites', 'علاقه‌مندی‌ها'], ['addresses', 'نشانی‌ها'], ['profile', 'مشخصات و رمز عبور']] as const

function Orders() {
  const [rows, setRows] = useState<OrderRow[] | null>(null)
  useEffect(() => { api<{ items: OrderRow[] }>('/orders').then((r) => setRows(r.items)).catch(() => setRows([])) }, [])
  if (!rows) return <p className="notice">در حال بارگذاری…</p>
  if (!rows.length) return <p className="notice">هنوز سفارشی ثبت نکرده‌اید.</p>
  return <div className="list">{rows.map((o) => (
    <Link key={o.id} to={`/account/orders/${o.id}`} className="row">
      <div><strong>سفارش #{num(o.id)}</strong><small>{date(o.createdAt)} — {num(o.itemCount)} کالا</small></div>
      <div><span className={'tag ' + o.status}>{STATUS[o.status] || o.status}</span><small>{PAYMENT[o.paymentStatus]}</small></div>
      <b>{toman(o.total)}</b><ChevronLeft size={18} />
    </Link>))}</div>
}

function Favorites() {
  const [items, setItems] = useState<Product[] | null>(null)
  const { favs } = useAuth()
  useEffect(() => { api<{ items: Product[] }>('/favorites').then((r) => setItems(r.items)).catch(() => setItems([])) }, [])
  if (!items) return <p className="notice">در حال بارگذاری…</p>
  const shown = items.filter((p) => favs.includes(p.id))
  return shown.length ? <div className="grid">{shown.map((p) => <ProductCard key={p.id} p={p} />)}</div> : <p className="notice">لیست علاقه‌مندی‌های شما خالی است.</p>
}

function Addresses() {
  const [items, setItems] = useState<Addr[]>([])
  const [f, setF] = useState({ title: '', address: '', postalCode: '' })
  const [err, setErr] = useState('')
  const load = () => api<{ items: Addr[] }>('/addresses').then((r) => setItems(r.items)).catch(() => {})
  useEffect(() => { load() }, [])
  return (
    <>
      <div className="list">{items.map((a) => <div className="row" key={a.id}><div><strong>{a.title}</strong><small>{a.address} — کدپستی {a.postalCode}</small></div><button className="del" aria-label="حذف" onClick={async () => { await api(`/addresses/${a.id}`, { method: 'DELETE' }); load() }}><Trash2 size={18} /></button></div>)}</div>
      <form className="card form" onSubmit={async (e) => { e.preventDefault(); setErr(''); try { await api('/addresses', { json: f }); setF({ title: '', address: '', postalCode: '' }); load() } catch (x) { setErr((x as Error).message) } }}>
        <h3>افزودن نشانی</h3>
        <label>عنوان (مثلاً منزل)<input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label>نشانی کامل<textarea required minLength={10} rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
        <label>کدپستی<input required dir="ltr" inputMode="numeric" pattern="\d{10}" value={f.postalCode} onChange={(e) => setF({ ...f, postalCode: e.target.value })} /></label>
        {err && <p className="err-t">{err}</p>}<button className="btn">ذخیره نشانی</button>
      </form>
    </>
  )
}

function Profile() {
  const { user, setUser } = useAuth()
  const [f, setF] = useState({ name: user?.name || '', phone: user?.phone || '' })
  const [p, setP] = useState({ current: '', next: '' })
  const [m1, setM1] = useState(''); const [m2, setM2] = useState('')
  return (
    <>
      <form className="card form" onSubmit={async (e) => { e.preventDefault(); setM1(''); try { const r = await api<{ user: typeof user }>('/me', { method: 'PATCH', json: f }); if (r.user) setUser(r.user); setM1('ذخیره شد ✓') } catch (x) { setM1((x as Error).message) } }}>
        <h3>مشخصات</h3>
        <label>نام<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>موبایل<input required dir="ltr" pattern="09\d{9}" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label>ایمیل<input disabled dir="ltr" value={user?.email} /></label>
        {m1 && <p className="muted">{m1}</p>}<button className="btn">ذخیره</button>
      </form>
      <form className="card form" onSubmit={async (e) => { e.preventDefault(); setM2(''); try { await api('/me/password', { json: p }); setP({ current: '', next: '' }); setM2('رمز عبور تغییر کرد ✓') } catch (x) { setM2((x as Error).message) } }}>
        <h3>تغییر رمز عبور</h3>
        <label>رمز فعلی<input type="password" required autoComplete="current-password" dir="ltr" value={p.current} onChange={(e) => setP({ ...p, current: e.target.value })} /></label>
        <label>رمز جدید (حداقل ۸ کاراکتر)<input type="password" required minLength={8} autoComplete="new-password" dir="ltr" value={p.next} onChange={(e) => setP({ ...p, next: e.target.value })} /></label>
        {m2 && <p className="muted">{m2}</p>}<button className="btn">تغییر رمز</button>
      </form>
    </>
  )
}

export default function Account() {
  const { user, ready, logout } = useAuth()
  const [sp, setSp] = useSearchParams()
  if (!ready) return <div className="page"><p className="notice">در حال بارگذاری…</p></div>
  if (!user) return <Navigate to="/login" state={{ from: '/account' }} replace />
  const tab = sp.get('tab') || 'orders'
  return (
    <div className="page">
      <div className="who"><span className="avatar big"><User size={30} /></span><div><h1>{user.name}</h1><small className="muted">{user.email}</small></div><button className="btn ghost sm" onClick={() => logout()}>خروج</button></div>
      <div className="chips">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setSp({ tab: k })}>{l}</button>)}</div>
      {tab === 'orders' && <Orders />}{tab === 'favorites' && <Favorites />}{tab === 'addresses' && <Addresses />}{tab === 'profile' && <Profile />}
    </div>
  )
}
