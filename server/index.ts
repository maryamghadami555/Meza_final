import { serve } from '@hono/node-server'
import fs from 'node:fs'
import path from 'node:path'
import app from '../worker/index'
import { createAssets, createD1, createFiles } from './adapters'
import { migrate } from './migrate'

const dataDir = process.env.DATA_DIR || './data' // on Railway: mount a Volume at /data and set DATA_DIR=/data
fs.mkdirSync(dataDir, { recursive: true })
const db = createD1(path.join(dataDir, 'meza.db'))
migrate(db.raw)

const env = { DB: db, FILES: createFiles(path.join(dataDir, 'files')), ASSETS: createAssets('dist'),
  SETTINGS_KEY: process.env.SETTINGS_KEY, RESEND_API_KEY: process.env.RESEND_API_KEY, MAIL_FROM: process.env.MAIL_FROM, PUBLIC_URL: process.env.PUBLIC_URL }
const port = Number(process.env.PORT || 3000)
serve({ fetch: (req: Request) => app.fetch(req, env as never), port, hostname: '0.0.0.0' }, () => console.log(`MEZA listening on :${port}`))
