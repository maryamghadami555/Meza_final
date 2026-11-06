import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Gem, Gift, Headset, ShieldCheck, Truck } from 'lucide-react'
import { api } from '../api'
import type { Category, Product } from '../types'
import ProductCard from '../components/ProductCard'

const slides = [
  { t: 'مزا، تکمیل‌کننده استایل', s: 'جزئیاتی که استایل تو را خاص می‌کنند.' },
  { t: 'درخشش در جزئیات', s: 'گردنبند، دستبند، گوشواره و انگشتر با نگین‌های ظریف.' },
  { t: 'هدیه‌ای ماندگار', s: 'برای عزیزانتان، با بسته‌بندی ویژه هدیه.' },
]
const perks = [
  [Gem, 'کیفیت تضمینی'], [Truck, 'ارسال سریع'], [ShieldCheck, 'پرداخت امن'], [Headset, 'پشتیبانی حرفه‌ای'],
] as const

function Row({ title, to, items }: { title: string; to: string; items: Product[] }) {
  if (!items.length) return null
  return (
    <section className="sec">
      <div className="sec-h"><h2>{title}</h2><Link to={to}>مشاهده همه</Link></div>
      <div className="grid">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
    </section>
  )
}

export default function Home() {
  const [i, setI] = useState(0)
  const [cats, setCats] = useState<Category[]>([])
  const [featured, setFeatured] = useState<Product[]>([])
  const [fresh, setFresh] = useState<Product[]>([])
  const [best, setBest] = useState<Product[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 6000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    Promise.all([
      api<{ items: Category[] }>('/categories'),
      api<{ items: Product[] }>('/products?featured=1&perPage=4'),
      api<{ items: Product[] }>('/products?sort=newest&perPage=4'),
      api<{ items: Product[] }>('/products?bestseller=1&perPage=4'),
    ]).then(([c, f, n, b]) => { setCats(c.items); setFeatured(f.items); setFresh(n.items); setBest(b.items) }).catch((e) => setErr(e.message))
  }, [])

  const go = (d: number) => setI((x) => (x + d + slides.length) % slides.length)
  return (
    <>
      <section className="hero">
        <div className="hero-txt">
          <div className="logo big"><b>MEZA</b><span>ACCESSORY</span></div>
          <h1>{slides[i].t}</h1>
          <p>{slides[i].s}</p>
          <Link to="/shop" className="btn"><ChevronLeft size={16} />مشاهده محصولات</Link>
        </div>
        <Gem className="hero-gem" strokeWidth={0.6} aria-hidden />
        <button className="car prev" aria-label="قبلی" onClick={() => go(-1)}><ChevronRight size={18} /></button>
        <button className="car next" aria-label="بعدی" onClick={() => go(1)}><ChevronLeft size={18} /></button>
        <div className="dots">{slides.map((_, k) => <button key={k} aria-label={`اسلاید ${k + 1}`} className={k === i ? 'on' : ''} onClick={() => setI(k)} />)}</div>
      </section>

      <section className="perks">
        <div className="promo">
          <Gift size={64} strokeWidth={1} aria-hidden />
          <div><h3>تخفیف ویژه برای خرید اول</h3><Link to="/shop" className="btn sm"><ChevronLeft size={14} />همین حالا خرید کن</Link></div>
        </div>
        {perks.map(([Icon, label]) => <div key={label} className="perk"><Icon size={30} strokeWidth={1.4} />{label}</div>)}
      </section>

      {err && <p className="notice err">{err}</p>}
      {cats.length > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>دسته‌بندی محصولات</h2></div>
          <div className="cats">{cats.map((c) => <Link key={c.id} to={`/shop?category=${c.slug}`} className="cat"><Gem size={26} strokeWidth={1.3} />{c.name}</Link>)}</div>
        </section>
      )}
      <Row title="محصولات ویژه" to="/shop" items={featured} />
      <Row title="جدیدترین‌ها" to="/shop?sort=newest" items={fresh} />
      <Row title="پرفروش‌ترین‌ها" to="/shop?sort=popular" items={best} />
      {!err && !featured.length && !fresh.length && <p className="notice">هنوز محصولی ثبت نشده است.</p>}
    </>
  )
}
