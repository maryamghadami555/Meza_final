import { useEffect, useRef, useState } from 'react'
import { Paperclip, Send, X } from 'lucide-react'
import { date, imgUrl, time } from '../api'

export type Msg = { id: number; isStaff: number; body: string; imageKey: string | null; createdAt: number; readAt: number | null }

/** Chat-style thread. `meIsStaff` decides which side is "mine"; own messages show ✓ (sent) / ✓✓ (seen). */
export default function Chat({ messages, meIsStaff, onSend, closed }: { messages: Msg[]; meIsStaff: boolean; onSend: (body: string, file: File | null) => Promise<void>; closed?: boolean }) {
  const [body, setBody] = useState(''); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [messages.length])
  useEffect(() => { if (!file) { setPreview(''); return } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u) }, [file])
  let lastDay = ''
  return (
    <div className="chat">
      <div className="chat-log" aria-live="polite">
        {messages.map((m) => {
          const mine = !!m.isStaff === meIsStaff
          const day = date(m.createdAt); const showDay = day !== lastDay; lastDay = day
          return (
            <div key={m.id}>
              {showDay && <div className="chat-day">{day}</div>}
              <div className={'bubble ' + (mine ? 'mine' : 'theirs')}>
                {m.imageKey && <a href={imgUrl(m.imageKey)} target="_blank" rel="noreferrer"><img src={imgUrl(m.imageKey)} alt="پیوست" /></a>}
                {m.body && <p>{m.body}</p>}
                <small>{time(m.createdAt)}{mine && (m.readAt ? ' ✓✓ دیده شد' : ' ✓ ارسال شد')}</small>
              </div>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      {closed ? <p className="notice">این تیکت بسته شده است.</p> : (
        <form className="chat-form" onSubmit={async (e) => { e.preventDefault(); if (!body.trim() && !file) return; setBusy(true); setErr(''); try { await onSend(body.trim(), file); setBody(''); setFile(null) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) } }}>
          {preview && <div className="chat-prev"><img src={preview} alt="پیش‌نمایش" /><button type="button" aria-label="حذف" onClick={() => setFile(null)}><X size={14} /></button></div>}
          <div className="chat-row">
            <label className="icon-btn" aria-label="پیوست تصویر"><Paperclip size={18} /><input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = '' }} /></label>
            <textarea rows={1} value={body} maxLength={2000} placeholder="پیام خود را بنویسید…" onChange={(e) => setBody(e.target.value)} />
            <button className="icon-btn send" disabled={busy} aria-label="ارسال"><Send size={18} /></button>
          </div>
          {err && <p className="err-t" role="alert">{err}</p>}
        </form>
      )}
    </div>
  )
}
