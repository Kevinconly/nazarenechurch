import { HttpError } from './httpError.js'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
export const MAX_PAGE = 1_000_000_000

function integerParam(value: unknown, fallback: number, name: string, max = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new HttpError(400, `Query parameter "${name}" must be a positive integer.`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw new HttpError(400, `Query parameter "${name}" must be between 1 and ${max}.`)
  return parsed
}

export function parsePagination(query: Record<string, unknown>) {
  return {
    page: integerParam(query.page, 1, 'page', MAX_PAGE),
    pageSize: integerParam(query.pageSize, DEFAULT_PAGE_SIZE, 'pageSize', MAX_PAGE_SIZE),
  }
}
