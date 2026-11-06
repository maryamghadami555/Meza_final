import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Check, Trash2, X } from 'lucide-react'
import { api, date, imgUrl, num, TICKET_CAT, TICKET_PRI, TICKET_STATUS } from '../api'
import Chat, { type Msg } from '../components/Chat'
import { RatingCharts } from './Charts'

export function Tickets() {
  const [sp, setSp] = useSearchParams()
  const [d, setD] = useState<{ items: any[]; total: number } | null>(null); const [err, setErr] = useState('')
  const qs = sp.toString()
  useEffect(() => { setD(null); api<any>(`/admin/tickets?${qs}`).then(setD).catch((e) => setErr(e.message)) }, [qs])
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n) }
  return (
    <>
      <div className="filters"><input className="adm-in" placeholder="جستجو: شماره، موضوع یا نام" defaultValue={sp.get('q') || ''} onKeyDown={(e) => e.key === 'Enter' && set('q', (e.target as HTMLInputElement).value)} />
        <select value={sp.get('status') || ''} onChange={(e) => set('status', e.target.value)} aria-label="وضعیت"><option value="">همه وضعیت‌ها</option>{Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      {err && <p className="notice err">{err}</p>}{!d && !err && <p className="notice">در حال بارگذاری…</p>}
      {d && <div className="card tbl-wrap"><table><thead><tr><th>#</th><th>موضوع</th><th>مشتری</th><th>دسته</th><th>اولویت</th><th>وضعیت</th><th>آخرین فعالیت</th></tr></thead><tbody>
        {d.items.map((t) => <tr key={t.id}><td><Link to={`/admin/tickets/${t.id}`}>{num(t.id)}</Link></td><td>{t.subject} {t.unread > 0 && <i className="nbadge">{num(t.unread)}</i>}</td><td>{t.customer}</td><td>{TICKET_CAT[t.category]}</td><td>{TICKET_PRI[t.priority]}</td><td><span className={'tag t-' + t.status}>{TICKET_STATUS[t.status]}</span></td><td>{date(t.updatedAt)}</td></tr>)}
        {!d.items.length && <tr><td colSpan={7} className="muted">تیکتی وجود ندارد.</td></tr>}</tbody></table></div>}
    </>
  )
}

export function TicketView() {
  const { id } = useParams()
  const [d, setD] = useState<{ ticket: any; messages: Msg[] } | null>(null); const [err, setErr] = useState('')
  const load = useCallback(() => api<any>(`/admin/tickets/${id}`).then(setD).catch((e) => setErr(e.message)), [id])
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t) }, [load])
  const patch = async (json: object) => { setErr(''); try { await api(`/admin/tickets/${id}`, { method: 'PATCH', json }); load() } catch (e) { setErr((e as Error).message) } }
  if (!d) return <p className={err ? 'notice err' : 'notice'}>{err || 'در حال بارگذاری…'}</p>
  const t = d.ticket
  return (
    <>
      <div className="card"><div className="who"><div><h2>#{num(t.id)} — {t.subject}</h2><small className="muted">{t.customer} · {TICKET_CAT[t.category]} · <span className={'tag t-' + t.status}>{TICKET_STATUS[t.status]}</span></small></div>
        <select value={t.priority} onChange={(e) => patch({ priority: e.target.value })} aria-label="اولویت">{Object.entries(TICKET_PRI).map(([k, v]) => <option key={k} value={k}>اولویت {v}</option>)}</select>
        {t.status === 'closed' ? <button className="btn sm" onClick={() => patch({ status: 'open' })}>بازکردن مجدد</button> : <button className="btn ghost sm" onClick={() => patch({ status: 'closed' })}>بستن تیکت</button>}</div></div>
      {err && <p className="err-t" role="alert">{err}</p>}
      <Chat messages={d.messages} meIsStaff closed={t.status === 'closed'} onSend={async (body, file) => { const form = new FormData(); form.set('body', body); if (file) form.set('image', file); await api(`/admin/tickets/${id}/messages`, { form }); await load() }} />
    </>
  )
}

export function Satisfaction() {
  const [s, setS] = useState<any>(null); const [sp, setSp] = useSearchParams()
  const [d, setD] = useState<{ items: any[] } | null>(null); const [err, setErr] = useState('')
  const qs = sp.toString()
  const load = () => api<any>(`/admin/reviews?${qs}`).then(setD).catch((e) => setErr(e.message))
  useEffect(() => { api('/admin/satisfaction').then(setS).catch(() => {}) }, [])
  useEffect(() => { load() }, [qs])
  const act = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); await load(); api('/admin/satisfaction').then(setS).catch(() => {}) } catch (e) { setErr((e as Error).message) } }
  const ST: Record<string, string> = { pending: 'در انتظار تأیید', approved: 'تأییدشده', rejected: 'ردشده' }
  return (
    <>
      {s && <><div className="stat-grid"><div className="card stat"><small>رضایت مشتریان</small><strong>{num(s.satisfiedPercent)}٪</strong></div><div className="card stat"><small>میانگین امتیاز</small><strong>{num(s.average)} از ۵</strong></div><div className="card stat"><small>نظرات تأییدشده</small><strong>{num(s.total)}</strong></div></div><RatingCharts s={s} /></>}
      <div className="filters"><select value={sp.get('status') || ''} onChange={(e) => { const n = new URLSearchParams(); if (e.target.value) n.set('status', e.target.value); setSp(n) }} aria-label="وضعیت"><option value="">همه نظرات</option>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      {err && <p className="notice err">{err}</p>}{!d && !err && <p className="notice">در حال بارگذاری…</p>}
      {d && !d.items.length && <p className="notice">نظری وجود ندارد.</p>}
      {d?.items.map((r) => (
        <div className="card" key={r.id}>
          <div className="who"><div><strong>{r.customer}</strong> <small className="muted">درباره «{r.product}» · {date(r.createdAt)} {r.orderId ? '· خرید تأییدشده' : ''}</small></div><span className="tag">{ST[r.status]}</span></div>
          <div className="prate">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div><p>{r.body}</p>
          {r.images.length > 0 && <div className="gthumbs">{r.images.map((k: string) => <a key={k} href={imgUrl(k)} target="_blank" rel="noreferrer"><img className="tiny" src={imgUrl(k)} alt="" /></a>)}</div>}
          <div className="buy">
            {r.status !== 'approved' && <button className="btn sm" onClick={() => act(() => api(`/admin/reviews/${r.id}`, { method: 'PATCH', json: { status: 'approved' } }))}><Check size={14} />تأیید</button>}
            {r.status !== 'rejected' && <button className="btn ghost sm" onClick={() => act(() => api(`/admin/reviews/${r.id}`, { method: 'PATCH', json: { status: 'rejected' } }))}><X size={14} />رد</button>}
            <button className="del" aria-label="حذف" onClick={() => confirm('این نظر حذف شود؟') && act(() => api(`/admin/reviews/${r.id}`, { method: 'DELETE' }))}><Trash2 size={16} /></button>
          </div>
        </div>
      ))}
    </>
  )
}
