import { HttpError } from '../lib/httpError.js'
import { isRole } from './roles.js'

export function credentials(body: unknown): { email: string; password: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Email and password are required.')
  const value = body as Record<string, unknown>
  if (typeof value.email !== 'string' || value.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim()) || typeof value.password !== 'string' || value.password.length < 1 || Buffer.byteLength(value.password, 'utf8') > 72) {
    throw new HttpError(400, 'Email or password format is invalid.')
  }
  return { email: value.email.trim(), password: value.password }
}

export function newUser(body: unknown): { email: string; password: string; role: ReturnType<typeof parseRole> } {
  const value = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  if (Object.keys(value).some((key) => !['email', 'password', 'role'].includes(key))) throw new HttpError(400, 'Provide only an email, password, and role.')
  if (typeof value.email !== 'string' || value.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) throw new HttpError(400, 'A valid email is required.')
  if (typeof value.password !== 'string' || value.password.length < 12 || Buffer.byteLength(value.password, 'utf8') > 72) throw new HttpError(400, 'Password must be at least 12 characters and no more than 72 UTF-8 bytes.')
  return { email: value.email.trim(), password: value.password, role: parseRole(value.role) }
}

export function parseRole(value: unknown) {
  if (!isRole(value)) throw new HttpError(400, 'Role must be Contributor, Editor, or Administrator.')
  return value
}

export function updateUser(body: unknown) {
  const value = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  const result: { role?: ReturnType<typeof parseRole>; active?: boolean } = {}
  if ('role' in value) result.role = parseRole(value.role)
  if ('active' in value) {
    if (typeof value.active !== 'boolean') throw new HttpError(400, 'Active must be a boolean.')
    result.active = value.active
  }
  if (!Object.keys(result).length || Object.keys(value).some((key) => !['role', 'active'].includes(key))) throw new HttpError(400, 'Provide only a role and/or active status.')
  return result
}

export function userId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, 'User identifier is invalid.')
  return value
}
