import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'
import type { Product, User, Variant } from './types'

/* ---------- auth + favorites ---------- */
type AuthCtx = {
  user: User | null; ready: boolean; favs: number[]
  login: (email: string, password: string) => Promise<void>
  register: (d: { name: string; email: string; phone: string; password: string }) => Promise<void>
  logout: () => Promise<void>
  toggleFav: (id: number) => Promise<boolean>
  setUser: (u: User) => void
}
const Auth = createContext<AuthCtx>(null as never)
export const useAuth = () => useContext(Auth)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [favs, setFavs] = useState<number[]>([])
  const [ready, setReady] = useState(false)
  useEffect(() => {
    api<{ user: User | null; favorites: number[] }>('/me')
      .then((r) => { setUser(r.user); setFavs(r.favorites) })
      .catch(() => {})
      .finally(() => setReady(true))
  }, [])
  const value: AuthCtx = {
    user, ready, favs, setUser,
    login: async (email, password) => {
      const r = await api<{ user: User }>('/auth/login', { json: { email, password } })
      setUser(r.user)
      api<{ favorites: number[] }>('/me').then((m) => setFavs(m.favorites)).catch(() => {})
    },
    register: async (d) => { const r = await api<{ user: User }>('/auth/register', { json: d }); setUser(r.user); setFavs([]) },
    logout: async () => { await api('/auth/logout', { method: 'POST', json: {} }); setUser(null); setFavs([]) },
    toggleFav: async (id) => {
      const r = await api<{ favorite: boolean }>(`/favorites/${id}`, { method: 'POST', json: {} })
      setFavs((f) => (r.favorite ? [...f, id] : f.filter((x) => x !== id)))
      return r.favorite
    },
  }
  return <Auth.Provider value={value}>{children}</Auth.Provider>
}

/* ---------- cart (browser storage; the server re-prices everything at checkout) ---------- */
export type CartItem = { key: string; id: number; variantId: number | null; variantName: string; name: string; finalPrice: number; price: number; image: string; qty: number; stock: number }
type Coupon = { code: string; percent: number } | null
type CartCtx = {
  items: CartItem[]; count: number; subtotal: number; discount: number; total: number; coupon: Coupon
  add: (p: Product, qty?: number, variant?: Variant) => void
  setQty: (key: string, qty: number) => void
  remove: (key: string) => void
  clear: () => void
  setCoupon: (c: Coupon) => void
}
const Cart = createContext<CartCtx>(null as never)
export const useCart = () => useContext(Cart)

const KEY = 'meza_cart_v2'
const load = (): { items: CartItem[]; coupon: Coupon } => {
  try { return JSON.parse(localStorage.getItem(KEY) || '') } catch { return { items: [], coupon: null } }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => { const s = load(); return { items: s.items || [], coupon: s.coupon || null } })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage unavailable */ } }, [state])
  const add = useCallback((p: Product, qty = 1, variant?: Variant) => setState((s) => {
    const key = `${p.id}:${variant?.id ?? 0}`
    const stock = variant ? variant.stock : p.stock
    const cur = s.items.find((i) => i.key === key)
    const q = Math.min((cur?.qty || 0) + qty, Math.max(stock, 1), 20)
    const unit = Math.max(Math.round(((p.price + (variant?.priceDelta || 0)) * (100 - p.discountPercent)) / 100), 0)
    const item: CartItem = { key, id: p.id, variantId: variant?.id ?? null, variantName: variant?.name || '', name: p.name, finalPrice: unit, price: p.price, image: p.images[0] || '', qty: q, stock }
    return { ...s, items: cur ? s.items.map((i) => (i.key === key ? item : i)) : [...s.items, item] }
  }), [])
  const value = useMemo<CartCtx>(() => {
    const subtotal = state.items.reduce((a, i) => a + i.finalPrice * i.qty, 0)
    const discount = state.coupon ? Math.floor((subtotal * state.coupon.percent) / 100) : 0
    return {
      items: state.items, count: state.items.reduce((a, i) => a + i.qty, 0), subtotal, discount, total: subtotal - discount, coupon: state.coupon,
      add,
      setQty: (key, qty) => setState((s) => ({ ...s, items: s.items.map((i) => (i.key === key ? { ...i, qty: Math.min(Math.max(qty, 1), i.stock || 1, 20) } : i)) })),
      remove: (key) => setState((s) => ({ ...s, items: s.items.filter((i) => i.key !== key) })),
      clear: () => setState({ items: [], coupon: null }),
      setCoupon: (coupon) => setState((s) => ({ ...s, coupon })),
    }
  }, [state, add])
  return <Cart.Provider value={value}>{children}</Cart.Provider>
}
