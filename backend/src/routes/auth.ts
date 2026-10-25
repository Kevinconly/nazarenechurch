import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { rateLimit } from 'express-rate-limit'
import type { UserRepository } from '../auth/userRepository.js'
import { requireAuth, requireCsrf } from '../auth/middleware.js'
import { credentials } from '../auth/validation.js'
import { HttpError } from '../lib/httpError.js'
import { config } from '../config/env.js'

const csrf = () => randomBytes(32).toString('base64url')
const csrfHash = (token: string) => createHash('sha256').update(token).digest('hex')
const dummyPasswordHash = bcrypt.hash(randomBytes(32).toString('base64url'), 12)

export function createAuthRouter(users: UserRepository) {
  const router = Router()
  const signInLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Try again later.', status: 429 } })

  router.get('/csrf', (request, response) => {
    const token = csrf()
    request.session.csrfTokenHash = csrfHash(token)
    response.setHeader('Cache-Control', 'no-store')
    response.json({ csrfToken: token })
  })

  router.post('/sign-in', signInLimit, requireCsrf, async (request, response, next) => {
    try {
      const { email, password } = credentials(request.body)
      const user = await users.findByEmail(email)
      // Perform a hash comparison even for unknown identifiers to reduce timing differences.
      const passwordHash = user?.passwordHash ?? await dummyPasswordHash
      const valid = await bcrypt.compare(password, passwordHash)
      if (!user || !user.active || !valid) throw new HttpError(401, 'Invalid email or password.')
      await new Promise<void>((resolve, reject) => request.session.regenerate((error) => error ? reject(error) : resolve()))
      request.session.userId = user.id
      const csrfToken = csrf()
      request.session.csrfTokenHash = csrfHash(csrfToken)
      response.setHeader('Cache-Control', 'no-store')
      response.json({ user: { id: user.id, email: user.email, role: user.role }, csrfToken })
    } catch (error) { next(error) }
  })

  router.get('/me', requireAuth(users), (request, response) => {
    const { id, email, role } = request.authUser!
    response.setHeader('Cache-Control', 'no-store')
    response.json({ user: { id, email, role } })
  })

  router.post('/sign-out', requireCsrf, (request, response, next) => {
    request.session.destroy((error) => {
      if (error) return next(error)
      response.clearCookie('remera.sid', { httpOnly: true, secure: config.sessionCookieSecure, sameSite: 'lax', path: '/' })
      response.status(204).end()
    })
  })

  return router
}
