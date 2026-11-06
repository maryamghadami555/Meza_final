export type Product = {
  id: number; name: string; description: string; price: number; discountPercent: number; finalPrice: number
  stock: number; hasVariants?: boolean; images: string[]; category: { name: string; slug: string } | null
  rating: number; reviewCount: number; sold: number; featured: boolean; bestseller: boolean
}
export type User = { id: number; email: string; name: string; phone: string | null; role: string }
export type Category = { id: number; slug: string; name: string; count: number }
export type Settings = {
  cardToCard: { enabled: boolean; card?: string; holder?: string; bank?: string; instructions?: string }
  online: { enabled: boolean }
  store: { phone: string; email: string; address: string }
}
export type OrderRow = { id: number; status: string; paymentStatus: string; paymentMethod: string; total: number; createdAt: number; itemCount: number }
export type Variant = { id: number; name: string; priceDelta: number; stock: number }
