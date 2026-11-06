import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gem, Mail, MapPin, Phone, ShieldCheck, Sparkles } from 'lucide-react'
import { api } from '../api'
import type { Settings } from '../types'

export function About() {
  const v = [[Gem, 'کیفیت', 'انتخاب دقیق مواد و دوخت نگین‌ها، برای درخششی ماندگار.'], [ShieldCheck, 'اعتماد', 'ارسال امن، پرداخت شفاف و پشتیبانی پاسخ‌گو.'], [Sparkles, 'رضایت مشتری', 'نظر شما مسیر انتخاب محصولات بعدی ماست.']] as const
  return (
    <div className="page">
      <h1 className="pt">درباره ما</h1>
      <div className="card prose">
        <p>مزا، تکمیل‌کننده استایل؛ برندی برای کسانی که معتقدند جزئیات، استایل را خاص می‌کنند. ما اکسسوری‌هایی ظریف و کاربردی را برای استفاده روزمره و مهمانی‌ها گردآوری می‌کنیم.</p>
        <p>این متن معرفی نمونه است؛ داستان و ارزش‌های برند را در فایل <code>src/pages/Static.tsx</code> با متن اصلی خودتان جایگزین کنید.</p>
      </div>
      <div className="grid three">{v.map(([I, t, d]) => <div className="card perk-card" key={t}><I size={30} strokeWidth={1.4} /><h3>{t}</h3><p>{d}</p></div>)}</div>
    </div>
  )
}

export function Contact() {
  const [s, setS] = useState<Settings['store'] | null>(null)
  const [f, setF] = useState({ name: '', email: '', phone: '', message: '' })
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState(false)
  useEffect(() => { api<Settings>('/settings/public').then((r) => setS(r.store)).catch(() => {}) }, [])
  return (
    <div className="page narrow">
      <h1 className="pt">تماس با ما</h1>
      <div className="card contact">
        {s?.phone && <div><Phone size={20} /><span dir="ltr">{s.phone}</span></div>}
        {s?.email && <div><Mail size={20} /><span dir="ltr">{s.email}</span></div>}
        {s?.address && <div><MapPin size={20} /><span>{s.address}</span></div>}
        {s && !s.phone && !s.email && !s.address && <p className="muted">اطلاعات تماس فروشگاه هنوز ثبت نشده است.</p>}
      </div>
      <form className="card form" onSubmit={async (e) => { e.preventDefault(); setMsg(''); try { await api('/contact', { json: f }); setOk(true); setF({ name: '', email: '', phone: '', message: '' }) } catch (x) { setMsg((x as Error).message) } }}>
        <h2>ارسال پیام</h2>
        {ok && <p className="notice ok">پیام شما ارسال شد.</p>}
        <label>نام<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>ایمیل (اختیاری)<input type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>موبایل (اختیاری)<input dir="ltr" pattern="09\d{9}" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label>پیام<textarea required minLength={5} rows={4} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></label>
        {msg && <p className="err-t">{msg}</p>}<button className="btn wide">ارسال پیام</button>
      </form>
    </div>
  )
}

export const NotFound = () => <div className="page"><p className="notice">صفحه مورد نظر پیدا نشد.</p><Link to="/" className="btn">بازگشت به خانه</Link></div>
