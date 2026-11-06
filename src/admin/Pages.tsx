import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, Upload } from 'lucide-react'
import { api, date, imgUrl, num, PAYMENT, STATUS, toman } from '../api'
import { useAdmin } from './AdminApp'

const Pager = ({ total, per, page, onPage }: { total: number; per: number; page: number; onPage: (n: number) => void }) => {
  const n = Math.ceil(total / per)
  return n > 1 ? <div className="pager">{Array.from({ length: n }, (_, k) => k + 1).map((k) => <button key={k} className={k === page ? 'on' : ''} onClick={() => onPage(k)}>{num(k)}</button>)}</div> : null
}
const useList = <T,>(path: string, extra: Record<string, string>) => {
  const [sp, setSp] = useSearchParams()
  const [d, setD] = useState<{ items: T[]; total: number; perPage: number } | null>(null)
  const [err, setErr] = useState('')
  const qs = new URLSearchParams([...sp.entries(), ...Object.entries(extra)]).toString()
  useEffect(() => { setD(null); setErr(''); api<{ items: T[]; total: number; perPage: number }>(`${path}?${sp.toString()}`).then(setD).catch((e) => setErr(e.message)) }, [sp.toString(), qs])
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setSp(n) }
  return { sp, set, d, err }
}

/* ---------- orders ---------- */
export function Orders() {
  const { sp, set, d, err } = useList<any>('/admin/orders', {})
  return (
    <>
      <div className="filters">
        <input className="adm-in" placeholder="جستجو: شماره، نام یا موبایل" defaultValue={sp.get('q') || ''} onKeyDown={(e) => e.key === 'Enter' && set('q', (e.target as HTMLInputElement).value)} />
        <select value={sp.get('status') || ''} onChange={(e) => set('status', e.target.value)} aria-label="وضعیت"><option value="">همه وضعیت‌ها</option>{Object.entries(STATUS).filter(([k]) => k !== 'rejected').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={sp.get('payment') || ''} onChange={(e) => set('payment', e.target.value)} aria-label="پرداخت"><option value="">همه پرداخت‌ها</option>{Object.entries(PAYMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      {err && <p className="notice err">{err}</p>}{!d && !err && <p className="notice">در حال بارگذاری…</p>}
      {d && <div className="card tbl-wrap"><table><thead><tr><th>#</th><th>مشتری</th><th>موبایل</th><th>مبلغ</th><th>وضعیت</th><th>پرداخت</th><th>تاریخ</th></tr></thead><tbody>
        {d.items.map((o) => <tr key={o.id}><td><Link to={`/admin/orders/${o.id}`}>{num(o.id)}</Link></td><td>{o.name}</td><td dir="ltr">{o.phone}</td><td>{toman(o.total)}</td><td><span className={'tag ' + o.status}>{STATUS[o.status]}</span></td><td>{PAYMENT[o.paymentStatus]}</td><td>{date(o.createdAt)}</td></tr>)}
        {!d.items.length && <tr><td colSpan={7} className="muted">سفارشی پیدا نشد.</td></tr>}</tbody></table></div>}
      {d && <Pager total={d.total} per={d.perPage} page={Number(sp.get('page') || 1)} onPage={(n) => set('page', String(n))} />}
    </>
  )
}

export function OrderPage() {
  const { id } = useParams()
  const { can } = useAdmin()
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [note, setNote] = useState(''); const [reason, setReason] = useState('')
  const load = () => api<any>(`/admin/orders/${id}`).then(setD).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [id])
  const act = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); await load() } catch (e) { setErr((e as Error).message) } }
  if (!d) return <p className={err ? 'notice err' : 'notice'}>{err || 'در حال بارگذاری…'}</p>
  const o = d.order
  return (
    <>
      <h2 className="pt">سفارش #{num(o.id)}</h2>
      {err && <p className="notice err" role="alert">{err}</p>}
      <div className="card info">
        <div><small>مشتری</small><Link to={`/admin/customers/${o.userId}`}>{o.name}</Link></div><div><small>موبایل</small><span dir="ltr">{o.phone}</span></div>
        <div><small>ایمیل</small><span dir="ltr">{o.customerEmail}</span></div><div><small>تاریخ</small>{date(o.createdAt)}</div>
        <div><small>وضعیت سفارش</small><span className={'tag ' + o.status}>{STATUS[o.status]}</span></div><div><small>پرداخت</small>{PAYMENT[o.paymentStatus]}</div>
        <div className="full"><small>نشانی</small>{o.address} (کدپستی {o.postalCode})</div>
      </div>
      <div className="card">
        {d.items.map((i: any) => <div className="mini" key={i.productId}><span>{i.name} × {num(i.qty)}</span><span>{toman(i.price * i.qty)}</span></div>)}
        {o.discount > 0 && <div className="mini"><span>تخفیف {o.couponCode}</span><span>−{toman(o.discount)}</span></div>}
        <div className="mini tot"><span>جمع کل</span><span>{toman(o.total)}</span></div>
      </div>
      {o.receiptKey && (
        <div className="card"><h3>رسید پرداخت</h3>
          <a href={imgUrl(o.receiptKey)} target="_blank" rel="noreferrer"><img className="receipt-prev" src={imgUrl(o.receiptKey)} alt="رسید" /></a>
          {o.paymentStatus === 'pending_verification' && can('payments.approve') && (
            <div className="form" style={{ marginTop: 12 }}>
              <input placeholder="دلیل رد (اختیاری)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="buy"><button className="btn" onClick={() => act(() => api(`/admin/orders/${id}/payment`, { json: { decision: 'approve' } }))}>تأیید پرداخت</button>
                <button className="btn ghost" onClick={() => act(() => api(`/admin/orders/${id}/payment`, { json: { decision: 'reject', reason } }))}>رد رسید</button></div>
            </div>)}
        </div>)}
      {can('orders.manage') && (
        <div className="card form"><h3>تغییر وضعیت</h3>
          <select value={o.status} onChange={(e) => act(() => api(`/admin/orders/${id}/status`, { method: 'PATCH', json: { status: e.target.value } }))}>
            {Object.entries(STATUS).filter(([k]) => k !== 'rejected').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <h3>یادداشت داخلی</h3>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn sm" disabled={!note.trim()} onClick={() => act(async () => { await api(`/admin/orders/${id}/notes`, { json: { body: note } }); setNote('') })}>افزودن یادداشت</button>
        </div>)}
      {d.notes.length > 0 && <div className="card"><h3>یادداشت‌ها</h3>{d.notes.map((n: any) => <p key={n.id}><b>{n.author}</b> <small className="muted">{date(n.createdAt)}</small><br />{n.body}</p>)}</div>}
      <div className="card"><h3>تاریخچه</h3>{!d.history.length && <p className="muted">—</p>}{d.history.map((h: any) => <p key={h.id}><small className="muted">{date(h.createdAt)}</small> {h.author || 'مشتری'} — {h.action} {h.detail}</p>)}</div>
    </>
  )
}

/* ---------- products ---------- */
export function Products() {
  const { can } = useAdmin()
  const { sp, set, d, err } = useList<any>('/admin/products', {})
  const [msg, setMsg] = useState('')
  const reload = () => set('t', String(Date.now()))
  return (
    <>
      <div className="filters"><input className="adm-in" placeholder="جستجوی نام محصول" defaultValue={sp.get('q') || ''} onKeyDown={(e) => e.key === 'Enter' && set('q', (e.target as HTMLInputElement).value)} />
        {can('products.create') && <Link className="btn sm" to="/admin/products/new"><Plus size={14} />محصول جدید</Link>}</div>
      {err && <p className="notice err">{err}</p>}{msg && <p className="notice ok">{msg}</p>}{!d && !err && <p className="notice">در حال بارگذاری…</p>}
      {d && <div className="card tbl-wrap"><table><thead><tr><th>تصویر</th><th>نام</th><th>دسته</th><th>قیمت</th><th>موجودی</th><th>وضعیت</th><th></th></tr></thead><tbody>
        {d.items.map((p) => <tr key={p.id}><td>{p.images[0] ? <img className="tiny" src={imgUrl(p.images[0])} alt="" /> : '—'}</td><td>{p.name}</td><td>{p.category || '—'}</td>
          <td>{toman(p.price)}{p.discountPercent ? ` (${num(p.discountPercent)}٪−)` : ''}</td><td>{num(p.stock)}</td><td>{p.active ? 'فعال' : 'غیرفعال'}</td>
          <td className="acts"><Link to={`/admin/products/${p.id}`} className="lnk">ویرایش</Link>
            {can('products.delete') && <button className="del" aria-label="حذف" onClick={async () => { if (!confirm(`«${p.name}» حذف شود؟`)) return; try { const r = await api<{ softDeleted?: boolean }>(`/admin/products/${p.id}`, { method: 'DELETE' }); setMsg(r.softDeleted ? 'این محصول در سفارش‌ها استفاده شده و فقط غیرفعال شد.' : 'حذف شد.'); reload() } catch (e) { setMsg((e as Error).message) } }}><Trash2 size={16} /></button>}</td></tr>)}
        {!d.items.length && <tr><td colSpan={7} className="muted">محصولی پیدا نشد.</td></tr>}</tbody></table></div>}
      {d && <Pager total={d.total} per={d.perPage} page={Number(sp.get('page') || 1)} onPage={(n) => set('page', String(n))} />}
    </>
  )
}

type NewImg = { file: File; url: string }
export function ProductEditor() {
  const { id } = useParams(); const nav = useNavigate(); const { can } = useAdmin()
  const [cats, setCats] = useState<{ id: number; name: string }[]>([])
  const [f, setF] = useState({ name: '', description: '', price: '', discountPercent: '0', categoryId: '', stock: '0', featured: false, bestseller: false, active: true })
  const [keep, setKeep] = useState<string[]>([]); const [news, setNews] = useState<NewImg[]>([])
  const [variants, setVariants] = useState<{ id?: number; name: string; priceDelta: string; stock: string }[]>([])
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [newCat, setNewCat] = useState('')
  const loadCats = () => api<{ items: { id: number; name: string }[] }>('/admin/categories').then((r) => setCats(r.items)).catch(() => {})
  useEffect(() => {
    loadCats()
    if (id) api<{ product: any }>(`/admin/products/${id}`).then(({ product: p }) => { setF({ name: p.name, description: p.description, price: String(p.price), discountPercent: String(p.discountPercent), categoryId: p.categoryId ? String(p.categoryId) : '', stock: String(p.stock), featured: p.featured, bestseller: p.bestseller, active: p.active }); setKeep(p.images); setVariants((p.variants || []).map((v: any) => ({ id: v.id, name: v.name, priceDelta: String(v.priceDelta), stock: String(v.stock) }))) }).catch((e) => setErr(e.message))
  }, [id])
  useEffect(() => () => news.forEach((n) => URL.revokeObjectURL(n.url)), [])
  const addFiles = (files: FileList | null) => { if (files) setNews((x) => [...x, ...[...files].map((file) => ({ file, url: URL.createObjectURL(file) }))]) }
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value })
  const canImg = can('products.images')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const form = new FormData()
      form.set('payload', JSON.stringify({ name: f.name, description: f.description, price: Number(f.price), discountPercent: Number(f.discountPercent), categoryId: f.categoryId ? Number(f.categoryId) : null, stock: Number(f.stock), featured: f.featured, bestseller: f.bestseller, active: f.active, keepImages: keep, variants: variants.map((v) => ({ ...(v.id ? { id: v.id } : {}), name: v.name, priceDelta: Number(v.priceDelta) || 0, stock: Number(v.stock) || 0 })) }))
      news.forEach((n) => form.append('images', n.file))
      await api(id ? `/admin/products/${id}` : '/admin/products', { method: id ? 'PUT' : 'POST', form })
      nav('/admin/products')
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  return (
    <form className="card form" onSubmit={submit}>
      <h2>{id ? 'ویرایش محصول' : 'افزودن محصول'}</h2>
      <label>نام محصول *<input required value={f.name} onChange={up('name')} /></label>
      <label>توضیحات<textarea rows={4} value={f.description} onChange={up('description')} /></label>
      <div className="two"><label>قیمت (تومان) *<input required inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, '') })} /></label>
        <label>تخفیف (٪)<input inputMode="numeric" value={f.discountPercent} onChange={(e) => setF({ ...f, discountPercent: e.target.value.replace(/\D/g, '') })} /></label>
        <label>موجودی<input inputMode="numeric" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value.replace(/\D/g, '') })} /></label></div>
      <label>دسته‌بندی<select value={f.categoryId} onChange={up('categoryId')}><option value="">بدون دسته</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {can('products.create') && <div className="coupon"><input placeholder="دسته‌بندی جدید" value={newCat} onChange={(e) => setNewCat(e.target.value)} /><button type="button" className="btn sm" disabled={newCat.trim().length < 2} onClick={async () => { try { const r = await api<{ id: number }>('/admin/categories', { json: { name: newCat } }); setNewCat(''); await loadCats(); setF((x) => ({ ...x, categoryId: String(r.id) })) } catch (x) { setErr((x as Error).message) } }}>افزودن</button></div>}
      <div className="checks"><label className="radio"><input type="checkbox" checked={f.active} onChange={up('active')} />فعال (نمایش در فروشگاه)</label>
        <label className="radio"><input type="checkbox" checked={f.featured} onChange={up('featured')} />محصول ویژه</label>
        <label className="radio"><input type="checkbox" checked={f.bestseller} onChange={up('bestseller')} />پرفروش</label></div>
      <div><strong>تنوع محصول (مثلاً رنگ یا سایز)</strong>
        <p className="muted">اگر تنوع اضافه کنید، موجودی هر گزینه جداگانه حساب می‌شود و «موجودی» بالا نادیده گرفته می‌شود. «تغییر قیمت» به تومان و می‌تواند منفی باشد.</p>
        {variants.map((v, i) => <div className="var-row" key={i}>
          <input placeholder="نام گزینه" required value={v.name} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input placeholder="تغییر قیمت" inputMode="numeric" value={v.priceDelta} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, priceDelta: e.target.value.replace(/[^\d-]/g, '') } : x)))} />
          <input placeholder="موجودی" inputMode="numeric" value={v.stock} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, stock: e.target.value.replace(/\D/g, '') } : x)))} />
          <button type="button" className="del" aria-label="حذف گزینه" onClick={() => setVariants(variants.filter((_, j) => j !== i))}><Trash2 size={16} /></button></div>)}
        {variants.length < 20 && <button type="button" className="btn ghost sm" onClick={() => setVariants([...variants, { name: '', priceDelta: '0', stock: '0' }])}><Plus size={14} />افزودن گزینه</button>}
      </div>
      <div><strong>تصاویر (حداکثر ۸، هر کدام تا ۵ مگابایت)</strong>
        <div className="img-grid">
          {keep.map((k) => <div className="img-cell" key={k}><img src={imgUrl(k)} alt="" />{canImg && <><button type="button" aria-label="حذف تصویر" onClick={() => setKeep(keep.filter((x) => x !== k))}><Trash2 size={14} /></button>
            <label className="rep">جایگزینی<input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => { addFiles(e.target.files); setKeep(keep.filter((x) => x !== k)) }} /></label></>}</div>)}
          {news.map((n, i) => <div className="img-cell new" key={n.url}><img src={n.url} alt="پیش‌نمایش" /><button type="button" aria-label="حذف" onClick={() => { URL.revokeObjectURL(n.url); setNews(news.filter((_, j) => j !== i)) }}><Trash2 size={14} /></button></div>)}
          {canImg && keep.length + news.length < 8 && <label className="img-add"><Upload size={22} />افزودن تصویر<input type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} /></label>}
        </div>
        {!canImg && <p className="muted">اجازه آپلود تصویر ندارید.</p>}
      </div>
      {err && <p className="err-t" role="alert">{err}</p>}
      <button className="btn wide" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیره محصول'}</button>
    </form>
  )
}

/* ---------- customers ---------- */
export function Customers() {
  const { sp, set, d, err } = useList<any>('/admin/customers', {})
  return (
    <>
      <div className="filters"><input className="adm-in" placeholder="جستجو: نام، ایمیل یا موبایل" defaultValue={sp.get('q') || ''} onKeyDown={(e) => e.key === 'Enter' && set('q', (e.target as HTMLInputElement).value)} />
        <select value={sp.get('status') || ''} onChange={(e) => set('status', e.target.value)} aria-label="وضعیت"><option value="">همه</option><option value="active">فعال</option><option value="suspended">تعلیق‌شده</option></select></div>
      {err && <p className="notice err">{err}</p>}{!d && !err && <p className="notice">در حال بارگذاری…</p>}
      {d && <div className="card tbl-wrap"><table><thead><tr><th>نام</th><th>ایمیل</th><th>موبایل</th><th>سفارش‌ها</th><th>خرید (پرداخت‌شده)</th><th>وضعیت</th></tr></thead><tbody>
        {d.items.map((u) => <tr key={u.id}><td><Link to={`/admin/customers/${u.id}`}>{u.name}</Link></td><td dir="ltr">{u.email}</td><td dir="ltr">{u.phone}</td><td>{num(u.orders)}</td><td>{toman(u.spent)}</td><td>{u.status === 'active' ? 'فعال' : 'تعلیق'}</td></tr>)}
        {!d.items.length && <tr><td colSpan={6} className="muted">مشتری‌ای پیدا نشد.</td></tr>}</tbody></table></div>}
      {d && <Pager total={d.total} per={d.perPage} page={Number(sp.get('page') || 1)} onPage={(n) => set('page', String(n))} />}
    </>
  )
}

export function CustomerPage() {
  const { id } = useParams(); const { can } = useAdmin()
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('')
  const load = () => api<any>(`/admin/customers/${id}`).then(setD).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [id])
  if (!d) return <p className={err ? 'notice err' : 'notice'}>{err || 'در حال بارگذاری…'}</p>
  const c = d.customer
  return (
    <>
      <div className="card info"><div><small>نام</small>{c.name}</div><div><small>ایمیل</small><span dir="ltr">{c.email}</span></div><div><small>موبایل</small><span dir="ltr">{c.phone}</span></div><div><small>عضویت</small>{date(c.createdAt)}</div><div><small>وضعیت</small>{c.status === 'active' ? 'فعال' : 'تعلیق‌شده'}</div></div>
      {can('customers.manage') && <button className="btn sm" onClick={async () => { setErr(''); try { await api(`/admin/customers/${id}/status`, { method: 'PATCH', json: { status: c.status === 'active' ? 'suspended' : 'active' } }); load() } catch (e) { setErr((e as Error).message) } }}>{c.status === 'active' ? 'تعلیق حساب' : 'فعال‌سازی مجدد'}</button>}
      {err && <p className="err-t">{err}</p>}
      <div className="card tbl-wrap"><h3>سفارش‌ها</h3><table><tbody>{d.orders.map((o: any) => <tr key={o.id}><td><Link to={`/admin/orders/${o.id}`}>#{num(o.id)}</Link></td><td>{toman(o.total)}</td><td>{STATUS[o.status]}</td><td>{PAYMENT[o.paymentStatus]}</td><td>{date(o.createdAt)}</td></tr>)}{!d.orders.length && <tr><td className="muted">سفارشی ندارد.</td></tr>}</tbody></table></div>
      <div className="card"><h3>نظرات</h3>{!d.reviews.length && <p className="muted">نظری ثبت نکرده است.</p>}{d.reviews.map((r: any) => <p key={r.id}>{'★'.repeat(r.rating)} <b>{r.product}</b> — {r.body}</p>)}</div>
    </>
  )
}

/* ---------- employees ---------- */
export function Employees() {
  const { meta, me } = useAdmin()
  const [items, setItems] = useState<any[]>([]); const [err, setErr] = useState('')
  const [edit, setEdit] = useState<any | null>(null); const [logs, setLogs] = useState<{ name: string; items: any[] } | null>(null)
  const load = () => api<{ items: any[] }>('/admin/employees').then((r) => setItems(r.items)).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])
  const blank = { id: 0, name: '', email: '', username: '', password: '', role: 'order_manager', status: 'active', permissions: meta.presets.order_manager }
  return (
    <>
      <div className="filters"><button className="btn sm" onClick={() => setEdit(blank)}><Plus size={14} />کارمند جدید</button></div>
      {err && <p className="notice err">{err}</p>}
      <div className="card tbl-wrap"><table><thead><tr><th>نام</th><th>نام کاربری</th><th>نقش</th><th>وضعیت</th><th></th></tr></thead><tbody>
        {items.map((u) => <tr key={u.id}><td>{u.name}</td><td dir="ltr">{u.username || u.email}</td><td>{meta.roles[u.role]}</td><td>{u.status === 'active' ? 'فعال' : 'غیرفعال'}</td>
          <td className="acts"><button className="lnk" onClick={() => setEdit({ ...u, password: '' })}>ویرایش</button><button className="lnk" onClick={async () => { const r = await api<{ items: any[] }>(`/admin/employees/${u.id}/logs`); setLogs({ name: u.name, items: r.items }) }}>لاگ</button></td></tr>)}</tbody></table></div>
      {logs && <div className="card"><h3>فعالیت‌های {logs.name}</h3><button className="lnk" onClick={() => setLogs(null)}>بستن</button>{!logs.items.length && <p className="muted">—</p>}{logs.items.map((l) => <p key={l.id}><small className="muted">{date(l.createdAt)}</small> {l.action} {l.detail}</p>)}</div>}
      {edit && (
        <form className="card form" onSubmit={async (e) => { e.preventDefault(); setErr('')
          try {
            if (edit.id) await api(`/admin/employees/${edit.id}`, { method: 'PATCH', json: { name: edit.name, role: edit.role, status: edit.status, permissions: edit.permissions, ...(edit.password ? { password: edit.password } : {}) } })
            else await api('/admin/employees', { json: { name: edit.name, email: edit.email, username: edit.username, password: edit.password, role: edit.role, permissions: edit.permissions } })
            setEdit(null); load()
          } catch (x) { setErr((x as Error).message) } }}>
          <h3>{edit.id ? 'ویرایش کارمند' : 'کارمند جدید'}</h3>
          <label>نام<input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
          {!edit.id && <><label>ایمیل<input required type="email" dir="ltr" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
            <label>نام کاربری (انگلیسی)<input required dir="ltr" pattern="[a-zA-Z0-9_.]{3,30}" value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></label></>}
          <label>{edit.id ? 'رمز جدید (اختیاری)' : 'رمز عبور (حداقل ۱۰ کاراکتر)'}<input type="password" dir="ltr" minLength={10} required={!edit.id} autoComplete="new-password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></label>
          <label>نقش<select value={edit.role} disabled={edit.id === me.user.id} onChange={(e) => setEdit({ ...edit, role: e.target.value, permissions: meta.presets[e.target.value] })}>{Object.entries(meta.roles).filter(([k]) => k !== 'super_admin' || me.user.role === 'super_admin').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {edit.id > 0 && <label>وضعیت<select value={edit.status} disabled={edit.id === me.user.id} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">فعال</option><option value="inactive">غیرفعال</option></select></label>}
          <fieldset className="perms"><legend>دسترسی‌ها</legend>{edit.role === 'super_admin' ? <p className="muted">مدیر کل همه دسترسی‌ها را دارد.</p> :
            Object.entries(meta.permissions).map(([k, v]) => <label className="radio" key={k}><input type="checkbox" checked={edit.permissions.includes(k)} onChange={(e) => setEdit({ ...edit, permissions: e.target.checked ? [...edit.permissions, k] : edit.permissions.filter((x: string) => x !== k) })} />{v}</label>)}</fieldset>
          {err && <p className="err-t" role="alert">{err}</p>}
          <div className="buy"><button className="btn">ذخیره</button><button type="button" className="btn ghost" onClick={() => setEdit(null)}>انصراف</button></div>
        </form>)}
    </>
  )
}
