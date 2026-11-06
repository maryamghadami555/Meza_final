import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Heart, Minus, Plus, Star, X } from 'lucide-react'
import { api, date, imgUrl, num, toman } from '../api'
import type { Product, Variant } from '../types'
import { useAuth, useCart } from '../context'
import ProductCard, { Thumb } from '../components/ProductCard'

type Review = { id: number; rating: number; body: string; images: string[]; createdAt: number; author: string; verified: number }

function ReviewBox({ productId, onDone }: { productId: number; onDone: () => void }) {
  const [rating, setRating] = useState(0); const [body, setBody] = useState('')
  const [files, setFiles] = useState<{ f: File; url: string }[]>([])
  const [err, setErr] = useState(''); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false)
  useEffect(() => () => files.forEach((x) => URL.revokeObjectURL(x.url)), [])
  if (ok) return <p className="notice ok">نظر شما ثبت شد و پس از تأیید مدیر نمایش داده می‌شود.</p>
  return (
    <form className="card form" onSubmit={async (e) => { e.preventDefault(); if (!rating) { setErr('امتیاز را انتخاب کنید'); return } setBusy(true); setErr('')
      try { const form = new FormData(); form.set('payload', JSON.stringify({ productId, rating, body })); files.forEach((x) => form.append('images', x.f)); await api('/reviews', { form }); setOk(true); onDone() }
      catch (x) { setErr((x as Error).message) } finally { setBusy(false) } }}>
      <h3>نظر شما درباره این محصول</h3>
      <div className="stars" role="radiogroup" aria-label="امتیاز">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} ستاره`} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)}><Star size={26} fill={n <= rating ? 'currentColor' : 'none'} /></button>)}</div>
      <textarea rows={3} maxLength={1000} placeholder="تجربه خود را بنویسید…" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="img-grid">
        {files.map((x, i) => <div className="img-cell new" key={x.url}><img src={x.url} alt="پیش‌نمایش" /><button type="button" aria-label="حذف" onClick={() => { URL.revokeObjectURL(x.url); setFiles(files.filter((_, j) => j !== i)) }}><X size={14} /></button></div>)}
        {files.length < 3 && <label className="img-add">افزودن عکس<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFiles([...files, { f, url: URL.createObjectURL(f) }]); e.target.value = '' }} /></label>}
      </div>
      {err && <p className="err-t" role="alert">{err}</p>}<button className="btn" disabled={busy}>{busy ? 'در حال ارسال…' : 'ثبت نظر'}</button>
    </form>
  )
}

export default function ProductPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user, favs, toggleFav } = useAuth()
  const cart = useCart()
  const [d, setD] = useState<{ product: Product; variants: Variant[]; related: Product[]; reviews: Review[] } | null>(null)
  const [err, setErr] = useState('')
  const [img, setImg] = useState(0); const [qty, setQty] = useState(1); const [vid, setVid] = useState<number | null>(null)
  const [zoom, setZoom] = useState<string | null>(null); const [added, setAdded] = useState(false)
  const [elig, setElig] = useState<{ canReview: boolean; reason?: string } | null>(null)

  const load = () => api<{ product: Product; variants: Variant[]; related: Product[]; reviews: Review[] }>(`/products/${id}`).then((r) => { setD(r); setVid((v) => v ?? r.variants.find((x) => x.stock > 0)?.id ?? r.variants[0]?.id ?? null) }).catch((e) => setErr(e.message))
  useEffect(() => { setD(null); setErr(''); setImg(0); setQty(1); setVid(null); load() }, [id])
  useEffect(() => { if (user) api<{ canReview: boolean; reason?: string }>(`/products/${id}/review-eligibility`).then(setElig).catch(() => {}); else setElig(null) }, [id, user])

  if (err) return <div className="page"><p className="notice err">{err}</p><Link to="/shop" className="btn">بازگشت به فروشگاه</Link></div>
  if (!d) return <div className="page"><p className="notice">در حال بارگذاری…</p></div>
  const p = d.product
  const variant = d.variants.find((v) => v.id === vid)
  const stock = d.variants.length ? variant?.stock ?? 0 : p.stock
  const unit = Math.max(Math.round(((p.price + (variant?.priceDelta || 0)) * (100 - p.discountPercent)) / 100), 0)
  const full = p.price + (variant?.priceDelta || 0)
  const fav = favs.includes(p.id)
  return (
    <div className="page">
      <div className="pd">
        <div className="gallery">
          <div className="gmain" onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`) }} onMouseLeave={() => setZoom(null)}>
            {p.images[img] ? <img src={imgUrl(p.images[img])} alt={p.name} style={zoom ? { transformOrigin: zoom, transform: 'scale(2)' } : undefined} /> : <Thumb p={p} />}
          </div>
          {p.images.length > 1 && <div className="gthumbs">{p.images.map((k, n) => <button key={k} className={n === img ? 'on' : ''} onClick={() => setImg(n)} aria-label={`تصویر ${n + 1}`}><img src={imgUrl(k)} alt="" /></button>)}</div>}
        </div>
        <div className="pd-info">
          {p.category && <Link to={`/shop?category=${p.category.slug}`} className="muted">{p.category.name}</Link>}
          <h1>{p.name}</h1>
          <div className="prate"><Star size={16} fill="currentColor" />{p.reviewCount ? `${num(p.rating)} از ۵ — ${num(p.reviewCount)} نظر` : 'هنوز نظری ثبت نشده'}</div>
          <div className="pprice big"><strong>{toman(unit)}</strong>{p.discountPercent > 0 && <><s>{toman(full)}</s><em>{num(p.discountPercent)}٪ تخفیف</em></>}</div>
          <p className="desc">{p.description}</p>
          {d.variants.length > 0 && <div className="chips" role="radiogroup" aria-label="گزینه‌ها">{d.variants.map((v) => <button key={v.id} role="radio" aria-checked={v.id === vid} className={v.id === vid ? 'on' : ''} disabled={v.stock < 1} onClick={() => { setVid(v.id); setQty(1) }}>{v.name}{v.stock < 1 && ' (ناموجود)'}</button>)}</div>}
          <span className={'stock ' + (stock > 0 ? 'in' : 'out')}>{stock > 0 ? `موجود در انبار (${num(stock)} عدد)` : 'ناموجود'}</span>
          <div className="buy">
            <div className="qty">
              <button aria-label="کاهش" onClick={() => setQty(Math.max(1, qty - 1))}><Minus size={16} /></button><span>{num(qty)}</span>
              <button aria-label="افزایش" onClick={() => setQty(Math.min(stock, 20, qty + 1))}><Plus size={16} /></button>
            </div>
            <button className="btn" disabled={stock < 1 || (d.variants.length > 0 && !variant)} onClick={() => { cart.add(p, qty, variant); setAdded(true); setTimeout(() => setAdded(false), 2000) }}>{added ? 'به سبد اضافه شد ✓' : 'افزودن به سبد خرید'}</button>
            <button className={'icon-btn' + (fav ? ' on' : '')} aria-label="علاقه‌مندی" aria-pressed={fav} onClick={() => (user ? toggleFav(p.id).catch(() => {}) : nav('/login'))}><Heart size={20} fill={fav ? 'currentColor' : 'none'} /></button>
          </div>
        </div>
      </div>

      <section className="sec">
        <div className="sec-h"><h2>نظرات مشتریان</h2></div>
        {elig?.canReview && <ReviewBox productId={p.id} onDone={() => setElig({ canReview: false, reason: 'already' })} />}
        {elig && !elig.canReview && elig.reason === 'not_purchased' && <p className="muted">فقط خریداران این محصول می‌توانند نظر ثبت کنند.</p>}
        {!d.reviews.length && <p className="notice">هنوز نظری برای این محصول ثبت نشده است.</p>}
        {d.reviews.map((r) => (
          <div className="review" key={r.id}>
            <div className="prate">{Array.from({ length: r.rating }, (_, k) => <Star key={k} size={14} fill="currentColor" />)}</div>
            <strong>{r.author}</strong>{r.verified ? <small className="badge">خرید تأییدشده</small> : null}
            <p>{r.body}</p>
            {r.images.length > 0 && <div className="gthumbs">{r.images.map((k) => <a key={k} href={imgUrl(k)} target="_blank" rel="noreferrer"><img className="tiny" src={imgUrl(k)} alt="تصویر نظر" /></a>)}</div>}
            <small className="muted">{date(r.createdAt)}</small>
          </div>
        ))}
      </section>
      {d.related.length > 0 && <section className="sec"><div className="sec-h"><h2>محصولات مرتبط</h2></div><div className="grid">{d.related.map((r) => <ProductCard key={r.id} p={r} />)}</div></section>}
    </div>
  )
}
