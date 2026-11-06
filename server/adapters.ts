// Lets the SAME Hono API code from /worker run on Railway (Node) by emulating the
// Cloudflare bindings it uses: D1 (-> SQLite file), R2 (-> files on a volume), ASSETS (-> ./dist).
import Database from 'better-sqlite3'
import fs from 'node:fs/promises'
import path from 'node:path'

type Row = Record<string, unknown>

class Stmt {
  constructor(private db: Database.Database, readonly sql: string, private args: unknown[] = []) {}
  bind(...a: unknown[]) { return new Stmt(this.db, this.sql, a) }
  private norm() { return this.args.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v)) as any[] }
  runSync() {
    const i = this.db.prepare(this.sql).run(...this.norm())
    return { success: true, results: [] as Row[], meta: { last_row_id: Number(i.lastInsertRowid), changes: i.changes } }
  }
  async run() { return this.runSync() }
  async first<T = Row>(col?: string): Promise<T | null> {
    const r = this.db.prepare(this.sql).get(...this.norm()) as Row | undefined
    if (!r) return null
    return (col ? r[col] : r) as T
  }
  async all<T = Row>() {
    return { success: true, results: this.db.prepare(this.sql).all(...this.norm()) as T[], meta: {} }
  }
}

export function createD1(file: string) {
  const raw = new Database(file)
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  return {
    raw,
    prepare: (sql: string) => new Stmt(raw, sql),
    batch: async (stmts: Stmt[]) => raw.transaction(() => stmts.map((s) => s.runSync()))(),
  }
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css',
  svg: 'image/svg+xml', json: 'application/json', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', txt: 'text/plain',
}
const ext = (p: string) => path.extname(p).slice(1).toLowerCase()

export function createFiles(dir: string) {
  const root = path.resolve(dir)
  const full = (key: string) => {
    const p = path.resolve(root, key)
    if (!p.startsWith(root + path.sep)) throw new Error('invalid key')
    return p
  }
  return {
    async put(key: string, value: ArrayBuffer) {
      const p = full(key)
      await fs.mkdir(path.dirname(p), { recursive: true })
      await fs.writeFile(p, Buffer.from(value))
    },
    async get(key: string) {
      try {
        const buf = await fs.readFile(full(key))
        return { body: new Response(buf).body, httpMetadata: { contentType: MIME[ext(key)] } }
      } catch { return null }
    },
    async delete(key: string) { await fs.rm(full(key), { force: true }) },
  }
}

export function createAssets(distDir: string) {
  const root = path.resolve(distDir)
  const send = async (p: string, immutable: boolean) => {
    const buf = await fs.readFile(p)
    return new Response(buf, { headers: { 'Content-Type': MIME[ext(p)] || 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' } })
  }
  return {
    async fetch(req: Request) {
      const url = new URL(req.url)
      const p = path.resolve(root, '.' + decodeURIComponent(url.pathname))
      if (!p.startsWith(root)) return new Response('Forbidden', { status: 403 })
      try {
        if ((await fs.stat(p)).isFile()) return await send(p, url.pathname.startsWith('/assets/'))
      } catch { /* fall through */ }
      if (url.pathname.startsWith('/assets/')) return new Response('Not found', { status: 404 })
      return send(path.join(root, 'index.html'), false) // SPA fallback
    },
  }
}
