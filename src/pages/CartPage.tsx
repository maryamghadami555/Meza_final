import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { api, imgUrl, num, toman } from '../api'
import { useCart } from '../context'

export default function CartPage() {
  const c = useCart()
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const apply = async () => {
    setMsg('')
    try { c.setCoupon(await api<{ code: string; percent: number }>('/coupons/validate', { json: { code } })); setCode('') } catch (e) { setMsg((e as Error).message) }
  }
  if (!c.items.length) return <div className="page"><h1 className="pt">سبد خرید</h1><p className="notice">سبد خرید شما خالی است.</p><Link to="/shop" className="btn">رفتن به فروشگاه</Link></div>
  return (
    <div className="page">
      <h1 className="pt">سبد خرید</h1>
      <div className="cart">
        <div className="lines">
          {c.items.map((i) => (
            <div className="line" key={i.key}>
              <Link to={`/product/${i.id}`} className="lthumb">{i.image ? <img src={imgUrl(i.image)} alt="" /> : <span className="ph" />}</Link>
              <div className="lbody">
                <Link to={`/product/${i.id}`}><strong>{i.name}</strong></Link>
                {i.variantName && <small className="muted">{i.variantName}</small>}
                <span>{toman(i.finalPrice)}</span>
                <div className="qty sm">
                  <button aria-label="کاهش" onClick={() => c.setQty(i.key, i.qty - 1)}><Minus size={14} /></button><span>{num(i.qty)}</span><button aria-label="افزایش" onClick={() => c.setQty(i.key, i.qty + 1)}><Plus size={14} /></button>
                </div>
              </div>
              <button className="del" aria-label="حذف" onClick={() => c.remove(i.key)}><Trash2 size={18} /></button>
            </div>
          ))}
        </div>
        <aside className="sum">
          <div className="coupon">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="کد تخفیف" aria-label="کد تخفیف" />
            <button className="btn sm" onClick={apply} disabled={!code.trim()}>اعمال</button>
          </div>
          {msg && <p className="err-t">{msg}</p>}
          {c.coupon && <p className="ok-t">کد {c.coupon.code} ({num(c.coupon.percent)}٪) اعمال شد <button className="lnk" onClick={() => c.setCoupon(null)}>حذف</button></p>}
          <dl>
            <dt>جمع جزء</dt><dd>{toman(c.subtotal)}</dd>
            {c.discount > 0 && <><dt>تخفیف</dt><dd>−{toman(c.discount)}</dd></>}
            <dt className="tot">جمع کل</dt><dd className="tot">{toman(c.total)}</dd>
          </dl>
          <button className="btn wide" onClick={() => nav('/checkout')}>ثبت سفارش</button>
        </aside>
      </div>
    </div>
  )
}
