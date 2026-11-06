// Usage: npm run create-admin -- you@example.com "Full Name" "a-strong-password"
// Writes admin.sql (gitignored). Then run:
//   npx wrangler d1 execute meza-db --remote --file admin.sql
import { webcrypto as crypto } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const [email, name, password] = process.argv.slice(2)
if (!email || !name || !password) {
  console.error('Usage: npm run create-admin -- <email> "<name>" "<password>"')
  process.exit(1)
}
if (password.length < 12) {
  console.error('Admin password must be at least 12 characters.')
  process.exit(1)
}
const b64 = (u8) => Buffer.from(u8).toString('base64')
const salt = crypto.getRandomValues(new Uint8Array(16))
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256))
const hash = `pbkdf2$100000$${b64(salt)}$${b64(bits)}`
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
writeFileSync(
  'admin.sql',
  `INSERT INTO users (email, name, password_hash, role, status, created_at) VALUES (${q(email.toLowerCase())}, ${q(name)}, ${q(hash)}, 'super_admin', 'active', ${Date.now()});\n`,
)
console.log('admin.sql written. Run: npx wrangler d1 execute meza-db --remote --file admin.sql\nThen delete admin.sql.')
