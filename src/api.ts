export async function api<T>(path: string, opts: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch('/api' + path, {
    method: opts.method || (opts.json || opts.form ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: opts.json ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.form ?? (opts.json ? JSON.stringify(opts.json) : undefined),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || 'خطایی رخ داد؛ دوباره تلاش کنید')
  return data as T
}

const fa = new Intl.NumberFormat('fa-IR')
export const num = (n: number) => fa.format(n)
export const toman = (n: number) => `${fa.format(n)} تومان`
export const date = (ms: number) => new Date(ms).toLocaleDateString('fa-IR')
export const imgUrl = (key?: string) => (key ? `/api/files/${key}` : '')

export const STATUS: Record<string, string> = {
  awaiting_verification: 'در انتظار تأیید پرداخت',
  pending_payment: 'در انتظار پرداخت',
  processing: 'در حال پردازش',
  shipped: 'ارسال شد',
  completed: 'تکمیل شد',
  cancelled: 'لغو شد',
  rejected: 'رد شد',
}
export const PAYMENT: Record<string, string> = {
  pending_verification: 'در انتظار بررسی رسید',
  unpaid: 'پرداخت نشده',
  paid: 'پرداخت شده',
  rejected: 'رسید رد شد',
}
export const TICKET_CAT: Record<string, string> = { order: 'سفارش', payment: 'پرداخت', product: 'محصول', technical: 'فنی', other: 'سایر' }
export const TICKET_PRI: Record<string, string> = { low: 'کم', normal: 'عادی', high: 'فوری' }
export const TICKET_STATUS: Record<string, string> = { open: 'در انتظار پاسخ', answered: 'پاسخ داده شد', closed: 'بسته' }
export const time = (ms: number) => new Date(ms).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
