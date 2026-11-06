import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Heart, Home, Menu, Search, ShoppingBag, Store, User, X } from 'lucide-react'
import { useAuth, useCart } from '../context'
import { api, num } from '../api'

export const Logo = ({ small }: { small?: boolean }) => (
  <Link to="/" className={'logo' + (small ? ' logo-sm' : '')} aria-label="MEZA ACCESSORY">
    <b>MEZA</b>
    <span>ACCESSORY</span>
  </Link>
)

const links = [
  ['/', 'صفحه اصلی'], ['/shop', 'فروشگاه'], ['/about', 'درباره ما'], ['/contact', 'تماس با ما'], ['/tickets', 'تیکت پشتیبانی'],
] as const

export default function Layout() {
  const { user } = useAuth()
  const { count } = useCart()
  const nav = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (!user) { setUnread(0); return }
    const load = () => api<{ count: number }>('/tickets-unread').then((r) => setUnread(r.count)).catch(() => {})
    load(); const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [user, loc.pathname])
  const search = (e: React.FormEvent) => { e.preventDefault(); nav(`/shop?q=${encodeURIComponent(q.trim())}`); setOpen(false) }

  return (
    <div className="shell">
      <header className="top">
        <div className="topbar">
          <form className="search" onSubmit={search} role="search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در محصولات…" aria-label="جستجو" />
            <button aria-label="جستجو"><Search size={18} /></button>
          </form>
          <Logo />
          <div className="icons">
            <button className="menu-btn" aria-label="منو" onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <Menu size={22} />}</button>
            <Link to={user ? '/account?tab=favorites' : '/login'} aria-label="علاقه‌مندی‌ها" className="hide-sm"><Heart size={22} /></Link>
            <Link to="/cart" aria-label="سبد خرید" className="cart-link">
              <ShoppingBag size={22} />{count > 0 && <i>{num(count)}</i>}
            </Link>
            <Link to={user ? '/account' : '/login'} aria-label="حساب کاربری" className="avatar"><User size={20} /></Link>
          </div>
        </div>
        <nav className={'tabs' + (open ? ' open' : '')} onClick={() => setOpen(false)}>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>{label}{to === '/tickets' && unread > 0 && <i className="nbadge">{num(unread)}</i>}</NavLink>
          ))}
        </nav>
      </header>

      <main key={loc.pathname}><Outlet /></main>

      <footer className="foot">
        <div className="foot-in">
          <div><Logo small /><p>مزا، تکمیل‌کننده استایل</p></div>
          <div><h4>دسترسی سریع</h4>{links.map(([to, l]) => <Link key={to} to={to}>{l}</Link>)}</div>
          <div><h4>حساب کاربری</h4><Link to="/account">پروفایل</Link><Link to="/account?tab=orders">سفارش‌های من</Link><Link to="/account?tab=favorites">علاقه‌مندی‌ها</Link></div>
        </div>
        <small>© MEZA ACCESSORY — تمامی حقوق محفوظ است.</small>
      </footer>

      <nav className="bottom" aria-label="ناوبری موبایل">
        <NavLink to="/" end><Home size={22} />خانه</NavLink>
        <NavLink to="/cart"><ShoppingBag size={22} />سبد خرید</NavLink>
        <NavLink to="/shop"><Store size={22} />فروشگاه</NavLink>
        <NavLink to={user ? '/account' : '/login'}><User size={22} />پروفایل</NavLink>
      </nav>
    </div>
  )
}
