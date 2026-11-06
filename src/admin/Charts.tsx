import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, num, toman } from '../api'

const COLORS = ['#10234f', '#2b55b5', '#6f97dc', '#a9c2ee', '#d3e0f7']
const label = (now: number, period: number, b: number) => new Date(now - b * period).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' })
export const series = (now: number, period: number, rows: any[], key: string) =>
  [5, 4, 3, 2, 1, 0].map((b) => ({ name: label(now, period, b), value: rows.find((r) => r.b === b)?.[key] ?? 0 }))

export const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="card"><h3>{title}</h3><div className="chart-box" dir="ltr">{children}</div></div>
)
const ax = { tick: { fontSize: 12, fontFamily: 'inherit' } }

export function RatingCharts({ s }: { s: any }) {
  const trend = [5, 4, 3, 2, 1, 0].map((b) => { const r = s.trend.find((x: any) => x.b === b); return { name: label(s.now, s.period, b), avg: r ? Math.round(r.avg * 10) / 10 : null, n: r?.n ?? 0 } })
  return (
    <div className="chart-grid">
      <Box title="توزیع امتیازها"><ResponsiveContainer><BarChart data={s.distribution.map((d: any) => ({ name: `${num(d.rating)}★`, value: d.n }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" {...ax} /><YAxis allowDecimals={false} {...ax} /><Tooltip formatter={(v) => [num(Number(v)), 'تعداد']} /><Bar dataKey="value" fill="#6f97dc" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></Box>
      <Box title="روند رضایت (میانگین امتیاز، بازه‌های ۳۰ روزه)"><ResponsiveContainer><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" {...ax} /><YAxis domain={[0, 5]} {...ax} /><Tooltip formatter={(v) => [num(Number(v)), 'میانگین']} /><Line type="monotone" dataKey="avg" stroke="#2b55b5" strokeWidth={3} connectNulls dot /></LineChart></ResponsiveContainer></Box>
    </div>
  )
}

export function DashCharts({ canSales, canSat }: { canSales: boolean; canSat: boolean }) {
  const [sales, setSales] = useState<any>(null); const [sat, setSat] = useState<any>(null)
  useEffect(() => {
    if (canSales) api('/admin/sales').then(setSales).catch(() => {})
    if (canSat) api('/admin/satisfaction').then(setSat).catch(() => {})
  }, [])
  return (
    <>
      {sat && <div className="stat-grid"><div className="card stat"><small>رضایت مشتریان (امتیاز ۴ و ۵)</small><strong>{num(sat.satisfiedPercent)}٪</strong></div><div className="card stat"><small>میانگین امتیاز</small><strong>{num(sat.average)} از ۵</strong></div><div className="card stat"><small>تعداد نظرات تأییدشده</small><strong>{num(sat.total)}</strong></div></div>}
      {sales && (
        <div className="chart-grid">
          <Box title="نمودار فروش (۶ بازه ۳۰ روزه)"><ResponsiveContainer><LineChart data={series(sales.now, sales.period, sales.monthly, 'total')}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" {...ax} /><YAxis width={70} tickFormatter={(v) => num(Math.round(v / 1000) / 1000) + 'M'} {...ax} /><Tooltip formatter={(v) => [toman(Number(v)), 'فروش']} /><Line type="monotone" dataKey="value" stroke="#2b55b5" strokeWidth={3} dot /></LineChart></ResponsiveContainer></Box>
          <Box title="سهم دسته‌ها از فروش"><ResponsiveContainer><PieChart><Pie data={sales.categories} dataKey="qty" nameKey="name" innerRadius={55} outerRadius={90} label={(e: any) => e.name}>{sales.categories.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v) => [num(Number(v)), 'تعداد']} /></PieChart></ResponsiveContainer></Box>
          <Box title="پرفروش‌ترین محصولات"><ResponsiveContainer><BarChart data={sales.best} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} {...ax} /><YAxis type="category" dataKey="name" width={110} {...ax} /><Tooltip formatter={(v) => [num(Number(v)), 'فروش (عدد)']} /><Bar dataKey="qty" fill="#10234f" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></Box>
          <div className="card"><h3>مشتریان تازه‌عضو</h3>{!sales.recentCustomers.length && <p className="muted">—</p>}{sales.recentCustomers.map((u: any) => <p key={u.id}>{u.name} <small className="muted">{new Date(u.createdAt).toLocaleDateString('fa-IR')}</small></p>)}</div>
        </div>
      )}
      {sat && <RatingCharts s={sat} />}
    </>
  )
}
