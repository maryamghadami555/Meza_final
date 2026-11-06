import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context'
import { api } from '../api'

function useDest() {
  const loc = useLocation()
  return (loc.state as { from?: string } | null)?.from || '/account'
}

export function Login() {
  const { user, login } = useAuth()
  const nav = useNavigate()
  const dest = useDest()
  const [f, setF] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={dest} replace />
  return (
    <div className="page narrow">
      <form className="card form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await login(f.email, f.password); nav(dest, { replace: true }) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) } }}>
        <h1>ورود به حساب کاربری</h1>
        <label>ایمیل<input type="email" autoComplete="email" required dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>رمز عبور<input type="password" autoComplete="current-password" required dir="ltr" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        {err && <p className="err-t" role="alert">{err}</p>}
        <button className="btn wide" disabled={busy}>{busy ? 'در حال ورود…' : 'ورود'}</button>
        <p className="muted"><Link to="/forgot">رمز عبور را فراموش کرده‌اید؟</Link></p>
        <p className="muted">حساب ندارید؟ <Link to="/register" state={{ from: dest }}>ثبت‌نام کنید</Link></p>
      </form>
    </div>
  )
}

export function Register() {
  const { user, register } = useAuth()
  const nav = useNavigate()
  const dest = useDest()
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={dest} replace />
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="page narrow">
      <form className="card form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await register(f); nav(dest, { replace: true }) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) } }}>
        <h1>ثبت‌نام</h1>
        <label>نام و نام خانوادگی<input required autoComplete="name" value={f.name} onChange={up('name')} /></label>
        <label>ایمیل<input type="email" required autoComplete="email" dir="ltr" value={f.email} onChange={up('email')} /></label>
        <label>شماره موبایل<input required inputMode="numeric" autoComplete="tel" dir="ltr" placeholder="09123456789" pattern="09\d{9}" value={f.phone} onChange={up('phone')} /></label>
        <label>رمز عبور (حداقل ۸ کاراکتر)<input type="password" required minLength={8} autoComplete="new-password" dir="ltr" value={f.password} onChange={up('password')} /></label>
        {err && <p className="err-t" role="alert">{err}</p>}
        <button className="btn wide" disabled={busy}>{busy ? 'در حال ثبت…' : 'ایجاد حساب'}</button>
        <p className="muted">قبلاً ثبت‌نام کرده‌اید؟ <Link to="/login" state={{ from: dest }}>وارد شوید</Link></p>
      </form>
    </div>
  )
}

export function Forgot() {
  const [email, setEmail] = useState(''); const [done, setDone] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  return (
    <div className="page narrow">
      <form className="card form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await api('/auth/forgot', { json: { email } }); setDone(true) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) } }}>
        <h1>بازیابی رمز عبور</h1>
        {done ? <p className="notice ok">اگر این ایمیل ثبت شده باشد، لینک بازیابی برای شما ارسال می‌شود (تا یک ساعت معتبر است).</p> : <>
          <label>ایمیل حساب<input type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {err && <p className="err-t" role="alert">{err}</p>}<button className="btn wide" disabled={busy}>{busy ? 'در حال ارسال…' : 'ارسال لینک بازیابی'}</button></>}
        <p className="muted"><Link to="/login">بازگشت به ورود</Link></p>
      </form>
    </div>
  )
}

export function Reset() {
  const token = new URLSearchParams(useLocation().search).get('token') || ''
  const [pw, setPw] = useState(''); const [done, setDone] = useState(false); const [err, setErr] = useState('')
  return (
    <div className="page narrow">
      <form className="card form" onSubmit={async (e) => { e.preventDefault(); setErr(''); try { await api('/auth/reset', { json: { token, password: pw } }); setDone(true) } catch (x) { setErr((x as Error).message) } }}>
        <h1>تعیین رمز جدید</h1>
        {done ? <p className="notice ok">رمز عبور تغییر کرد. اکنون می‌توانید وارد شوید.</p> : <>
          <label>رمز جدید (حداقل ۸ کاراکتر)<input type="password" required minLength={8} autoComplete="new-password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          {err && <p className="err-t" role="alert">{err}</p>}<button className="btn wide" disabled={!token}>ثبت رمز جدید</button></>}
        <p className="muted"><Link to="/login">ورود</Link></p>
      </form>
    </div>
  )
}
