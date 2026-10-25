import { createHash } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../lib/httpError.js'
import type { UserRepository } from './userRepository.js'
import { isRole, roleHasPermission, type Permission } from './roles.js'

declare module 'express-session' {
  interface SessionData { userId?: string; csrfTokenHash?: string }
}

export function requireAuth(users: UserRepository) {
  return async (request: Request, _response: Response, next: NextFunction) => {
    try {
      if (!request.session.userId) throw new HttpError(401, 'Authentication required.')
      const user = await users.findActiveById(request.session.userId)
      if (!user || !isRole(user.role)) {
        await new Promise<void>((resolve) => request.session.destroy(() => resolve()))
        throw new HttpError(401, 'Authentication required.')
      }
      request.authUser = user
      next()
    } catch (error) { next(error) }
  }
}

export function requirePermission(permission: Permission) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.authUser) return next(new HttpError(401, 'Authentication required.'))
    if (!isRole(request.authUser.role)) return next(new HttpError(403, 'You do not have permission to perform this action.'))
    if (!roleHasPermission(request.authUser.role, permission)) return next(new HttpError(403, 'You do not have permission to perform this action.'))
    next()
  }
}

export function requireCsrf(request: Request, _response: Response, next: NextFunction) {
  const supplied = request.get('x-csrf-token')
  const suppliedHash = supplied ? createHash('sha256').update(supplied).digest('hex') : ''
  if (!supplied || !request.session.csrfTokenHash || suppliedHash !== request.session.csrfTokenHash) {
    next(new HttpError(403, 'CSRF validation failed.'))
    return
  }
  next()
}

declare global {
  namespace Express { interface Request { authUser?: import('./userRepository.js').User } }
}
