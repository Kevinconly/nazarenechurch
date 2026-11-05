import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { config } from './config/env.js'
import { healthRouter } from './routes/health.js'
import { createAlbumsRouter } from './routes/albums.js'
import { PostgresArchiveRepository } from './db/archiveRepository.js'
import type { ArchiveRepository } from './types/archive.js'
import { HttpError } from './lib/httpError.js'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import { createAuthRouter } from './routes/auth.js'
import { createAdminUsersRouter } from './routes/adminUsers.js'
import { UserRepository } from './auth/userRepository.js'
import { getPool } from './db/pool.js'
import { createHash, randomUUID } from 'node:crypto'

function createDatabaseSessionStore(): session.Store {
  let store: session.Store | undefined
  const getStore = () => {
    if (!store) {
      store = new PgSessionStore({ pool: getPool(), tableName: 'auth_sessions', createTableIfMissing: false, pruneSessionInterval: 15 * 60 })
      postgresStore = store as InstanceType<typeof PgSessionStore>
    }
    return store
  }
  const hashSessionId = (sid: string) => createHash('sha256').update(sid).digest('hex')
  return new (class extends session.Store {
    override get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void) { getStore().get(hashSessionId(sid), callback) }
    override set(sid: string, value: session.SessionData, callback?: (err?: unknown) => void) { getStore().set(hashSessionId(sid), value, callback) }
    override destroy(sid: string, callback?: (err?: unknown) => void) { getStore().destroy(hashSessionId(sid), callback) }
    override touch(sid: string, value: session.SessionData, callback?: () => void) { getStore().touch?.(hashSessionId(sid), value, callback) }
  })()
}

const PgSessionStore = connectPgSimple(session)
let postgresStore: InstanceType<typeof PgSessionStore> | undefined

export async function closeSessionStore() {
  await postgresStore?.close()
  postgresStore = undefined
}

export function createApp(repository: ArchiveRepository = new PostgresArchiveRepository(), options: {
  users?: UserRepository
  sessionStore?: session.Store
  sessionSecret?: string
  cookieSecure?: boolean
} = {}) {
  const app = express()
  const users = options.users ?? new UserRepository()
  app.disable('x-powered-by')
  // Use the flat query parser so nested/duplicate parameters cannot smuggle
  // objects into validation helpers.
  app.set('query parser', 'simple')
  // Escape HTML-significant characters in JSON responses as defence in depth
  // for clients that render API values without context-aware escaping.
  app.set('json escape', true)
  if (config.trustProxyHops > 0) app.set('trust proxy', config.trustProxyHops)
  app.use((request, response, next) => {
    const requestId = randomUUID()
    response.setHeader('X-Request-Id', requestId)
    const startedAt = process.hrtime.bigint()
    response.on('finish', () => {
      const durationMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000)
      // Log the path without the query string so search terms and tokens are not persisted.
      console.info(JSON.stringify({ level: 'info', requestId, method: request.method, path: request.originalUrl.split('?', 1)[0], status: response.statusCode, durationMs }))
    })
    next()
  })
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    frameguard: { action: 'deny' },
    hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
  }))
  app.use(cors({ origin: config.allowedOrigin, credentials: true, maxAge: 600, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'], optionsSuccessStatus: 204 }))
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests. Try again later.', status: 429 },
    skip: (request) => request.path.startsWith('/health'),
  }))
  app.use(express.json({ limit: '16kb', strict: true }))
  app.use(session({
    name: 'remera.sid',
    secret: options.sessionSecret ?? config.sessionSecret,
    store: options.sessionStore ?? createDatabaseSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: options.cookieSecure ?? config.sessionCookieSecure, sameSite: 'lax', path: '/', maxAge: config.sessionMaxAgeMs },
  }))
  app.use(['/api/auth', '/api/admin'], (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use('/api/health', healthRouter)
  app.use('/api/albums', createAlbumsRouter(repository))
  app.use('/api/auth', createAuthRouter(users))
  app.use('/api/admin/users', createAdminUsersRouter(users))
  app.use((_request, response) => { response.status(404).json({ error: 'Not found', status: 404 }) })

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: error.message, status: error.status })
      return
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      response.status(409).json({ error: 'An account with that email already exists.', status: 409 })
      return
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'LAST_ADMIN') {
      response.status(409).json({ error: 'At least one active Administrator must remain.', status: 409 })
      return
    }
    if (typeof error === 'object' && error !== null && 'type' in error && (error.type === 'entity.too.large' || error.type === 'entity.parse.failed')) {
      const status = error.type === 'entity.too.large' ? 413 : 400
      response.status(status).json({ error: status === 413 ? 'Request body is too large.' : 'Request body contains invalid JSON.', status })
      return
    }
    if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ error: 'Request body contains invalid JSON.', status: 400 })
      return
    }
    const requestId = response.getHeader('X-Request-Id')
    console.error(JSON.stringify({
      level: 'error',
      requestId: typeof requestId === 'string' ? requestId : undefined,
      message: error instanceof Error ? error.message : String(error),
    }))
    response.status(500).json({ error: 'Internal server error', status: 500 })
  }
  app.use(errorHandler)
  return app
}

export const app = createApp()
