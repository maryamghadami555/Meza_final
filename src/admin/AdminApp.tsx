import { createContext, useContext, useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { Crown, CreditCard, Headset, LayoutDashboard, LogOut, Mail, Menu, Package, Settings, ShoppingCart, Star, UserCog, Users, X } from 'lucide-react'
import { api, date, num, PAYMENT, STATUS, toman } from '../api'
import { DashCharts } from './Charts'
import { Tickets, TicketView, Satisfaction } from './Pages2'
import { Orders, OrderPage, Products, ProductEditor, Customers, CustomerPage, Employees } from './Pages'

export type Meta = { permissions: Record<string, string>; roles: Record<string, string>; presets: Record<string, string[]> }
type Me = { user: { id: number; name: string; email: string; role: string }; permissions: string[] }
const Ctx = createContext<{ me: Me; meta: Meta; can: (p: string) => boolean }>(null as never)
export const useAdmin = () => useContext(Ctx)

function Login({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ login: '', password: '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  return (
    <div className="adm-login">
      <div className="adm-login-art" aria-hidden><div className="logo big"><b>MEZA</b><span>ACCESSORY</span></div><p>مزا، تکمیل‌کننده استایل</p></div>
      <form className="card form adm-login-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await api('/admin/login', { json: f }); onDone() } catch (x) { setErr((x as Error).message) } finally { setBusy(false) } }}>
        <Crown size={34} strokeWidth={1.3} />
        <h1>ورود به پنل مدیریت</h1>
        <label>نام کاربری یا ایمیل<input required autoComplete="username" dir="ltr" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} /></label>
        <label>رمز عبور<input type="password" required autoComplete="current-password" dir="ltr" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        {err && <p className="err-t" role="alert">{err}</p>}
        <button className="btn wide" disabled={busy}>{busy ? 'در حال ورود…' : 'ورود به پنل'}</button>
        <p className="muted"><Link to="/forgot">فراموشی رمز عبور</Link></p>
      </form>
    </div>
  )
}

function Dashboard() {
  const { me, can } = useAdmin()
  const [s, setS] = useState<any>(null); const [err, setErr] = useState('')
  useEffect(() => { if (can('analytics.view')) api('/admin/stats').then(setS).catch((e) => setErr(e.message)) }, [])
  if (!can('analytics.view')) return <div className="card"><h2>خوش آمدید {me.user.name}</h2><p className="muted">از منوی کناری بخش مورد نظر را انتخاب کنید.</p></div>
  if (err) return <p className="notice err">{err}</p>
  if (!s) return <p className="notice">در حال بارگذاری…</p>
  const cards = [['فروش ۳۰ روز اخیر', toman(s.monthSales)], ['کل فروش (پرداخت‌شده)', toman(s.totalSales)], ['تعداد سفارش‌ها', num(s.orders)], ['تعداد مشتریان', num(s.customers)], ['محصولات فعال', num(s.products)], ['سفارش‌های در جریان', num(s.pendingOrders)], ['رسیدهای در انتظار تأیید', num(s.pendingPayments)]]
  return (
    <>
      <div className="stat-grid">{cards.map(([l, v]) => <div className="card stat" key={l}><small>{l}</small><strong>{v}</strong></div>)}</div>
      <DashCharts canSales={can('analytics.view')} canSat />
      <div className="card"><h3>آخرین سفارش‌ها</h3>
        <div className="tbl-wrap"><table><thead><tr><th>#</th><th>مشتری</th><th>مبلغ</th><th>وضعیت</th><th>پرداخت</th><th>تاریخ</th></tr></thead><tbody>
          {s.recent.map((o: any) => <tr key={o.id}><td><NavLink to={`/admin/orders/${o.id}`}>{num(o.id)}</NavLink></td><td>{o.name}</td><td>{toman(o.total)}</td><td><span className={'tag ' + o.status}>{STATUS[o.status]}</span></td><td>{PAYMENT[o.paymentStatus]}</td><td>{date(o.createdAt)}</td></tr>)}
          {!s.recent.length && <tr><td colSpan={6} className="muted">سفارشی ثبت نشده است.</td></tr>}
        </tbody></table></div>
      </div>
    </>
  )
}

function PaymentSettings() {
  const [f, setF] = useState({ enabled: false, card: '', holder: '', bank: '', instructions: '' })
  const [msg, setMsg] = useState('')
  useEffect(() => { api<typeof f>('/admin/settings/payment').then(setF).catch((e) => setMsg(e.message)) }, [])
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); setMsg(''); try { await api('/admin/settings/payment', { method: 'PUT', json: f }); setMsg('ذخیره شد ✓') } catch (x) { setMsg((x as Error).message) } }}>
      <h2>پرداخت کارت‌به‌کارت</h2>
      <label className="radio"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />فعال باشد</label>
      <label>شماره کارت مقصد (۱۶ رقم)<input dir="ltr" inputMode="numeric" value={f.card} onChange={(e) => setF({ ...f, card: e.target.value })} /></label>
      <label>نام صاحب کارت<input value={f.holder} onChange={(e) => setF({ ...f, holder: e.target.value })} /></label>
      <label>نام بانک<input value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} /></label>
      <label>توضیحات پرداخت<textarea rows={3} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></label>
      {msg && <p className={msg.includes('✓') ? 'ok-t' : 'err-t'}>{msg}</p>}
      <button className="btn">ذخیره تنظیمات</button>
    </form>
  )
}

function OnlineSettings() {
  const [f, setF] = useState({ enabled: false, sandbox: false, merchantId: '' })
  const [info, setInfo] = useState<{ hasMerchant: boolean; merchantHint: string; keyConfigured: boolean } | null>(null)
  const [msg, setMsg] = useState('')
  const load = () => api<any>('/admin/settings/online').then((r) => { setInfo(r); setF((x) => ({ ...x, enabled: r.enabled, sandbox: r.sandbox })) }).catch((e) => setMsg(e.message))
  useEffect(() => { load() }, [])
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); setMsg(''); try { await api('/admin/settings/online', { method: 'PUT', json: { enabled: f.enabled, sandbox: f.sandbox, ...(f.merchantId ? { merchantId: f.merchantId } : {}) } }); setF((x) => ({ ...x, merchantId: '' })); await load(); setMsg('ذخیره شد ✓') } catch (x) { setMsg((x as Error).message) } }}>
      <h2>پرداخت آنلاین (زرین‌پال)</h2>
      {info && !info.keyConfigured && <p className="notice err">برای ذخیره مرچنت‌کد، متغیر محیطی SETTINGS_KEY باید روی سرور تنظیم شود (راهنما در README).</p>}
      <label className="radio"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />فعال باشد</label>
      <label className="radio"><input type="checkbox" checked={f.sandbox} onChange={(e) => setF({ ...f, sandbox: e.target.checked })} />حالت آزمایشی (Sandbox)</label>
      <label>مرچنت‌کد {info?.hasMerchant && <small className="muted">(ذخیره‌شده: {info.merchantHint}؛ برای تغییر مقدار جدید وارد کنید)</small>}
        <input dir="ltr" autoComplete="off" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={f.merchantId} onChange={(e) => setF({ ...f, merchantId: e.target.value })} /></label>
      {msg && <p className={msg.includes('✓') ? 'ok-t' : 'err-t'}>{msg}</p>}
      <div className="buy"><button className="btn">ذخیره</button>
        <button type="button" className="btn ghost" onClick={async () => { setMsg(''); try { const r = await api<{ ok: boolean; message: string }>('/admin/settings/online/test', { method: 'POST', json: {} }); setMsg(r.ok ? r.message + ' ✓' : r.message) } catch (x) { setMsg((x as Error).message) } }}>آزمون اتصال</button></div>
      <p className="muted">آدرس بازگشت از درگاه به‌صورت خودکار ساخته می‌شود و پرداخت فقط پس از تأیید سمت سرور ثبت می‌شود.</p>
    </form>
  )
}

function StoreSettings() {
  const [f, setF] = useState({ phone: '', email: '', address: '' }); const [msg, setMsg] = useState('')
  useEffect(() => { api<typeof f>('/admin/settings/store').then(setF).catch((e) => setMsg(e.message)) }, [])
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); setMsg(''); try { await api('/admin/settings/store', { method: 'PUT', json: f }); setMsg('ذخیره شد ✓') } catch (x) { setMsg((x as Error).message) } }}>
      <h2>اطلاعات فروشگاه (صفحه تماس با ما)</h2>
      <label>تلفن<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
      <label>ایمیل<input dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      <label>نشانی<textarea rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
      {msg && <p className={msg.includes('✓') ? 'ok-t' : 'err-t'}>{msg}</p>}<button className="btn">ذخیره</button>
    </form>
  )
}

function Messages() {
  const [items, setItems] = useState<any[] | null>(null)
  useEffect(() => { api<{ items: any[] }>('/admin/messages').then((r) => setItems(r.items)).catch(() => setItems([])) }, [])
  if (!items) return <p className="notice">در حال بارگذاری…</p>
  if (!items.length) return <p className="notice">پیامی وجود ندارد.</p>
  return <div className="list">{items.map((m) => <div className="card" key={m.id}><strong>{m.name}</strong> <small className="muted">{date(m.createdAt)} {m.phone && `— ${m.phone}`} {m.email && `— ${m.email}`}</small><p>{m.message}</p></div>)}</div>
}

const NAV = [
  ['/admin', 'داشبورد', LayoutDashboard, null], ['/admin/orders', 'سفارش‌ها', ShoppingCart, 'orders.view'], ['/admin/products', 'محصولات', Package, 'products.edit'],
  ['/admin/customers', 'کاربران', Users, 'customers.view'], ['/admin/tickets', 'تیکت‌ها', Headset, 'tickets.reply'], ['/admin/satisfaction', 'رضایت مشتری', Star, 'reviews.manage'], ['/admin/messages', 'پیام‌ها', Mail, 'customers.view'], ['/admin/employees', 'کارمندان', UserCog, 'employees.manage'],
  ['/admin/payments', 'درگاه پرداخت', CreditCard, 'payments.settings'], ['/admin/settings', 'تنظیمات', Settings, 'settings.manage'],
] as const

export default function AdminApp() {
  const [state, setState] = useState<'loading' | 'out' | { me: Me; meta: Meta }>('loading')
  const [open, setOpen] = useState(false)
  const [badges, setBadges] = useState<Record<string, number>>({})
  useEffect(() => {
    if (typeof state !== 'object') return
    const f = () => api<Record<string, number>>('/admin/badges').then(setBadges).catch(() => {})
    f(); const t = setInterval(f, 30000)
    return () => clearInterval(t)
  }, [state])
  const load = () => Promise.all([api<Me>('/admin/me'), api<Meta>('/admin/meta')]).then(([me, meta]) => setState({ me, meta })).catch(() => setState('out'))
  useEffect(() => { load() }, [])
  if (state === 'loading') return <p className="notice" style={{ margin: 40 }}>در حال بارگذاری…</p>
  if (state === 'out') return <Login onDone={load} />
  const { me, meta } = state
  const can = (p: string) => me.permissions.includes(p)
  return (
    <Ctx.Provider value={{ me, meta, can }}>
      <div className="adm">
        <aside className={'adm-side' + (open ? ' open' : '')} onClick={() => setOpen(false)}>
          <div className="logo adm-logo"><Crown size={22} /><b>MEZA</b><span>ACCESSORY</span></div>
          {NAV.filter(([, , , p]) => !p || can(p)).map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/admin'}><Icon size={18} />{label}{(() => { const n = ({ '/admin/tickets': badges.tickets, '/admin/satisfaction': badges.reviews, '/admin/orders': badges.payments } as Record<string, number | undefined>)[to]; return n ? <span className="side-badge">{num(n)}</span> : null })()}</NavLink>)}
          <button className="adm-out" onClick={async () => { await api('/auth/logout', { method: 'POST', json: {} }); setState('out') }}><LogOut size={18} />خروج از حساب</button>
        </aside>
        <div className="adm-main">
          <header className="adm-top"><button className="menu-btn adm-menu" aria-label="منو" onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <Menu size={22} />}</button><h1>پنل مدیریت</h1><span>{me.user.name} · {meta.roles[me.user.role]}</span></header>
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<Orders />} /><Route path="orders/:id" element={<OrderPage />} />
            <Route path="products" element={<Products />} /><Route path="products/new" element={<ProductEditor />} /><Route path="products/:id" element={<ProductEditor />} />
            <Route path="customers" element={<Customers />} /><Route path="customers/:id" element={<CustomerPage />} />
            <Route path="tickets" element={<Tickets />} /><Route path="tickets/:id" element={<TicketView />} /><Route path="satisfaction" element={<Satisfaction />} /><Route path="messages" element={<Messages />} /><Route path="employees" element={<Employees />} />
            <Route path="payments" element={<><PaymentSettings /><OnlineSettings /></>} /><Route path="settings" element={<StoreSettings />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </div>
      </div>
    </Ctx.Provider>
  )
}
