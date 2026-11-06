import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { api, date, num, TICKET_CAT, TICKET_PRI, TICKET_STATUS } from '../api'
import { useAuth } from '../context'
import Chat, { type Msg } from '../components/Chat'

type Row = { id: number; subject: string; category: string; priority: string; status: string; updatedAt: number; unread: number }

export function TicketList() {
  const { user, ready } = useAuth()
  const nav = useNavigate()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ subject: '', category: 'order', priority: 'normal', body: '' })
  const [file, setFile] = useState<File | null>(null)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { if (user) api<{ items: Row[] }>('/tickets').then((r) => setRows(r.items)).catch(() => setRows([])) }, [user])
  if (!ready) return null
  if (!user) return <Navigate to="/login" state={{ from: '/tickets' }} replace />
  return (
    <div className="page">
      <div className="who"><h1 className="pt" style={{ flex: 1, margin: 0 }}>تیکت پشتیبانی</h1><button className="btn sm" onClick={() => setOpen(!open)}>{open ? 'بستن فرم' : 'ارسال تیکت'}</button></div>
      {open && (
        <form className="card form" onSubmit={async (e) => { e.preventDefault(); setErr(''); setBusy(true)
          try { const form = new FormData(); form.set('payload', JSON.stringify(f)); if (file) form.set('image', file); const r = await api<{ id: number }>('/tickets', { form }); nav(`/tickets/${r.id}`) }
          catch (x) { setErr((x as Error).message) } finally { setBusy(false) } }}>
          <label>موضوع<input required minLength={3} maxLength={120} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
          <div className="two">
            <label>دسته‌بندی<select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(TICKET_CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>اولویت<select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(TICKET_PRI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <label>متن پیام<textarea required rows={4} maxLength={2000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
          <label>تصویر پیوست (اختیاری)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
          {err && <p className="err-t" role="alert">{err}</p>}<button className="btn" disabled={busy}>{busy ? 'در حال ارسال…' : 'ثبت تیکت'}</button>
        </form>
      )}
      <h2 style={{ margin: '18px 0 10px' }}>تیکت‌های من</h2>
      {!rows && <p className="notice">در حال بارگذاری…</p>}
      {rows && !rows.length && <p className="notice">هنوز تیکتی ثبت نکرده‌اید.</p>}
      <div className="list">{rows?.map((t) => (
        <Link key={t.id} to={`/tickets/${t.id}`} className="row">
          <div><strong>#{num(t.id)} — {t.subject}</strong><small>{TICKET_CAT[t.category]} · اولویت {TICKET_PRI[t.priority]} · {date(t.updatedAt)}</small></div>
          <div>{t.unread > 0 && <i className="nbadge">{num(t.unread)}</i>}<span className={'tag t-' + t.status}>{TICKET_STATUS[t.status]}</span></div>
        </Link>))}</div>
    </div>
  )
}

export function TicketChat() {
  const { id } = useParams()
  const { user, ready } = useAuth()
  const [d, setD] = useState<{ ticket: Row & { createdAt: number }; messages: Msg[] } | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => api<{ ticket: any; messages: Msg[] }>(`/tickets/${id}`).then(setD).catch((e) => setErr(e.message)), [id])
  useEffect(() => { if (!user) return; load(); const t = setInterval(load, 10000); return () => clearInterval(t) }, [user, load])
  if (!ready) return null
  if (!user) return <Navigate to="/login" replace />
  if (err) return <div className="page"><p className="notice err">{err}</p></div>
  if (!d) return <div className="page"><p className="notice">در حال بارگذاری…</p></div>
  const t = d.ticket
  return (
    <div className="page narrow" style={{ maxWidth: 720 }}>
      <Link to="/tickets" className="muted">← همه تیکت‌ها</Link>
      <h1 className="pt">#{num(t.id)} — {t.subject}</h1>
      <p className="muted">{TICKET_CAT[t.category]} · اولویت {TICKET_PRI[t.priority]} · <span className={'tag t-' + t.status}>{TICKET_STATUS[t.status]}</span></p>
      <Chat messages={d.messages} meIsStaff={false} closed={t.status === 'closed'}
        onSend={async (body, file) => { const form = new FormData(); form.set('payload', JSON.stringify({ body })); if (file) form.set('image', file); await api(`/tickets/${id}/messages`, { form }); await load() }} />
    </div>
  )
}
