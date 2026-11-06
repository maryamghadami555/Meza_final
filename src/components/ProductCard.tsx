import { Link, useNavigate } from 'react-router-dom'
import { Gem, Heart, Star } from 'lucide-react'
import type { Product } from '../types'
import { imgUrl, num, toman } from '../api'
import { useAuth } from '../context'

export const Thumb = ({ p }: { p: Pick<Product, 'images' | 'name'> }) =>
  p.images[0] ? <img src={imgUrl(p.images[0])} alt={p.name} loading="lazy" /> : <div className="ph"><Gem size={42} strokeWidth={1.2} /></div>

export default function ProductCard({ p }: { p: Product }) {
  const { user, favs, toggleFav } = useAuth()
  const nav = useNavigate()
  const fav = favs.includes(p.id)
  return (
    <article className="pcard">
      <button className={'heart' + (fav ? ' on' : '')} aria-label="افزودن به علاقه‌مندی‌ها" aria-pressed={fav}
        onClick={() => (user ? toggleFav(p.id).catch(() => {}) : nav('/login'))}>
        <Heart size={16} fill={fav ? 'currentColor' : 'none'} />
      </button>
      <Link to={`/product/${p.id}`} className="pimg"><Thumb p={p} />{p.discountPercent > 0 && <em>{num(p.discountPercent)}٪ تخفیف</em>}</Link>
      <div className="pinfo">
        <Link to={`/product/${p.id}`}><h3>{p.name}</h3></Link>
        <div className="prate"><Star size={14} fill="currentColor" />{p.reviewCount ? `${num(p.rating)} (${num(p.reviewCount)})` : 'بدون نظر'}</div>
        <div className="pprice">
          <strong>{toman(p.finalPrice)}</strong>
          {p.discountPercent > 0 && <s>{toman(p.price)}</s>}
        </div>
        <span className={'stock ' + (p.stock > 0 ? 'in' : 'out')}>{p.stock > 0 ? (p.stock <= 3 ? `فقط ${num(p.stock)} عدد باقی مانده` : 'موجود') : 'ناموجود'}</span>
      </div>
    </article>
  )
}
