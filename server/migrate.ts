import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type Database from 'better-sqlite3'
import { createD1 } from './adapters'

const root = path.resolve(import.meta.dirname ?? '.', '..')

/** Applies migrations/*.sql in order, once each (tracked in _migrations). */
export function migrate(db: Database.Database) {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)')
  const done = new Set((db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name))
  const dir = path.join(root, 'migrations')
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue
    db.transaction(() => {
      db.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?,?)').run(f, Date.now())
    })()
    console.log('migration applied:', f)
  }
}

// CLI:  npm run railway:admin   -> applies migrations, then admin-account.sql
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dataDir = process.env.DATA_DIR || './data'
  fs.mkdirSync(dataDir, { recursive: true })
  const db = createD1(path.join(dataDir, 'meza.db')).raw
  migrate(db)
  if (process.argv.includes('--admin')) {
    db.exec(fs.readFileSync(path.join(root, 'admin-account.sql'), 'utf8'))
    console.log('admin account ensured (username: admin_meza)')
  }
}
