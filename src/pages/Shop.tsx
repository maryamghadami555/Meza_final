import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, num } from '../api'
import type { Category, Product } from '../types'
import ProductCard from '../components/ProductCard'

export default function Shop() {
  const [sp, setSp] = useSearchParams()
  const [cats, setCats] = useState<Category[]>([])
  const [data, setData] = useState<{ items: Product[]; total: number; perPage: number } | null>(null)
  const [err, setErr] = useState('')
  const [min, setMin] = useState(sp.get('min') || '')
  const [max, setMax] = useState(sp.get('max') || '')
  const page = Number(sp.get('page') || 1)
  const qs = sp.toString()

  useEffect(() => { api<{ items: Category[] }>('/categories').then((r) => setCats(r.items)).catch(() => {}) }, [])
  useEffect(() => {
    setData(null); setErr('')
    api<{ items: Product[]; total: number; perPage: number }>('/products?' + qs).then(setData).catch((e) => setErr(e.message))
  }, [qs])

  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setSp(n) }
  const pages = data ? Math.ceil(data.total / data.perPage) : 0

  return (
    <div className="page">
      <h1 className="pt">فروشگاه</h1>
      <div className="chips">
        <button className={!sp.get('category') ? 'on' : ''} onClick={() => set('category', '')}>همه</button>
        {cats.map((c) => <button key={c.id} className={sp.get('category') === c.slug ? 'on' : ''} onClick={() => set('category', c.slug)}>{c.name}</button>)}
      </div>
      <div className="filters">
        <select value={sp.get('sort') || 'newest'} onChange={(e) => set('sort', e.target.value)} aria-label="مرتب‌سازی">
          <option value="newest">جدیدترین</option><option value="popular">محبوب‌ترین</option><option value="rating">بیشترین امتیاز</option>
          <option value="price_asc">ارزان‌ترین</option><option value="price_desc">گران‌ترین</option>
        </select>
        <form className="range" onSubmit={(e) => { e.preventDefault(); const n = new URLSearchParams(sp); min ? n.set('min', min) : n.delete('min'); max ? n.set('max', max) : n.delete('max'); n.delete('page'); setSp(n) }}>
          <input inputMode="numeric" placeholder="از (تومان)" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} />
          <input inputMode="numeric" placeholder="تا (تومان)" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
          <button className="btn sm">اعمال</button>
        </form>
        <label className="chk"><input type="checkbox" checked={sp.get('inStock') === '1'} onChange={(e) => set('inStock', e.target.checked ? '1' : '')} />فقط موجود</label>
      </div>
      {sp.get('q') && <p className="muted">نتایج جستجو برای «{sp.get('q')}» — {num(data?.total ?? 0)} محصول</p>}
      {err && <p className="notice err">{err}</p>}
      {!data && !err && <p className="notice">در حال بارگذاری…</p>}
      {data && !data.items.length && <p className="notice">محصولی با این فیلترها پیدا نشد.</p>}
      {data && <div className="grid">{data.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
      {pages > 1 && (
        <div className="pager">
          {Array.from({ length: pages }, (_, k) => k + 1).map((n) => <button key={n} className={n === page ? 'on' : ''} onClick={() => set('page', String(n))}>{num(n)}</button>)}
        </div>
      )}
    </div>
  )
}
