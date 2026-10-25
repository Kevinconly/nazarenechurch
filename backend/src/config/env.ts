import { randomBytes } from 'node:crypto'

const port = Number(process.env.PORT ?? 3001)
const production = process.env.NODE_ENV === 'production'
const allowedOrigin = process.env.FRONTEND_ORIGIN ?? (production ? undefined : 'http://localhost:5173')
const sessionSecret = process.env.SESSION_SECRET?.trim() || undefined
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0)

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.')
if (!allowedOrigin || !URL.canParse(allowedOrigin) || new URL(allowedOrigin).origin !== allowedOrigin) throw new Error('FRONTEND_ORIGIN must be a valid origin URL.')
if (production && new URL(allowedOrigin).protocol !== 'https:') throw new Error('FRONTEND_ORIGIN must use HTTPS in production.')
if (production && (!sessionSecret || Buffer.byteLength(sessionSecret) < 32)) {
  throw new Error('SESSION_SECRET must contain at least 32 bytes in production.')
}
if (sessionSecret && Buffer.byteLength(sessionSecret) < 32) throw new Error('SESSION_SECRET must contain at least 32 bytes.')
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5.')

export const config = {
  port,
  allowedOrigin,
  databaseUrl: process.env.DATABASE_URL,
  databaseSslCaFile: process.env.DATABASE_SSL_CA_FILE?.trim() || undefined,
  sessionSecret: sessionSecret ?? randomBytes(32).toString('base64url'),
  sessionCookieSecure: production || process.env.SESSION_COOKIE_SECURE === 'true',
  sessionMaxAgeMs: 8 * 60 * 60 * 1000,
  trustProxyHops,
}
