import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { requireAuth, requireCsrf, requirePermission } from '../auth/middleware.js'
import { newUser, updateUser, userId } from '../auth/validation.js'
import type { UserRepository } from '../auth/userRepository.js'
import { roleHasPermission } from '../auth/roles.js'
import { HttpError } from '../lib/httpError.js'

export function createAdminUsersRouter(users: UserRepository) {
  const router = Router()
  router.use(requireAuth(users))
  router.get('/', requirePermission('users:read'), async (_request, response) => response.json({ items: await users.list() }))
  router.post('/', requirePermission('users:create'), requireCsrf, async (request, response, next) => {
    try {
      const input = newUser(request.body)
      const passwordHash = await bcrypt.hash(input.password, 12)
      const user = await users.create(input.email, passwordHash, input.role)
      response.status(201).json({ user })
    } catch (error) { next(error) }
  })
  router.patch('/:id', requireCsrf, async (request, response, next) => {
    try {
      const rawId = request.params.id
      if (typeof rawId !== 'string') throw new HttpError(400, 'User identifier is invalid.')
      const id = userId(rawId)
      if (id === request.authUser!.id) throw new HttpError(400, 'You cannot change your own role or account status.')
      const values = updateUser(request.body)
      if (values.role !== undefined && !roleHasPermission(request.authUser!.role, 'users:update-role')) throw new HttpError(403, 'You do not have permission to perform this action.')
      if (values.active !== undefined && !roleHasPermission(request.authUser!.role, 'users:update-status')) throw new HttpError(403, 'You do not have permission to perform this action.')
      const user = await users.update(id, values)
      if (!user) throw new HttpError(404, 'User not found.')
      response.json({ user })
    } catch (error) { next(error) }
  })
  return router
}
