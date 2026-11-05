import { HttpError } from './httpError.js'

/**
 * Reject unsupported query parameters instead of silently ignoring them.
 * This keeps future filters and pagination from accidentally accepting
 * attacker-controlled keys that the route does not validate.
 */
export function rejectUnknownQuery(query: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(query).some((key) => !allowed.includes(key))) {
    throw new HttpError(400, 'Request contains an unsupported query parameter.')
  }
}
