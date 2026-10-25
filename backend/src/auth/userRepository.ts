import type { Pool } from 'pg'
import { getPool } from '../db/pool.js'
import type { Role } from './roles.js'

export type User = { id: string; email: string; role: Role; active: boolean; createdAt: string }
export type AuthUser = User & { passwordHash: string }
type UserRow = { id: string; email: string; role: Role; active: boolean; createdAt: string; passwordHash?: string }

function publicUser(row: UserRow): User { return { id: row.id, email: row.email, role: row.role, active: row.active, createdAt: row.createdAt } }

export class UserRepository {
  constructor(private readonly configuredPool?: Pool) {}
  private get pool(): Pool { return this.configuredPool ?? getPool() }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const result = await this.pool.query<UserRow>(`SELECT id, email, role, active, created_at AS "createdAt", password_hash AS "passwordHash" FROM users WHERE email_normalized = $1`, [email.toLowerCase()])
    return result.rows[0] ? { ...publicUser(result.rows[0]), passwordHash: result.rows[0].passwordHash! } : null
  }

  async findActiveById(id: string): Promise<User | null> {
    const result = await this.pool.query<UserRow>(`SELECT id, email, role, active, created_at AS "createdAt" FROM users WHERE id = $1`, [id])
    const row = result.rows[0]
    return row?.active ? publicUser(row) : null
  }

  async list(): Promise<User[]> {
    const result = await this.pool.query<UserRow>(`SELECT id, email, role, active, created_at AS "createdAt" FROM users ORDER BY created_at, id`)
    return result.rows.map(publicUser)
  }

  async create(email: string, passwordHash: string, role: Role): Promise<User> {
    const result = await this.pool.query<UserRow>(`INSERT INTO users (email, email_normalized, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role, active, created_at AS "createdAt"`, [email.trim(), email.trim().toLowerCase(), passwordHash, role])
    return publicUser(result.rows[0]!)
  }

  async update(id: string, values: { role?: Role; active?: boolean }): Promise<User | null> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1)', [5815030603])
      const target = await client.query<UserRow>(`SELECT id, email, role, active, created_at AS "createdAt" FROM users WHERE id = $1 FOR UPDATE`, [id])
      const current = target.rows[0]
      if (!current) { await client.query('COMMIT'); return null }
      if (current.active && current.role === 'Administrator' && (values.role !== undefined || values.active === false)) {
        const count = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM users WHERE role = 'Administrator' AND active = true`)
        if (Number(count.rows[0]?.count ?? 0) <= 1) {
          const error = new Error('At least one active Administrator must remain.') as Error & { code: string }
          error.code = 'LAST_ADMIN'
          throw error
        }
      }
      const result = await client.query<UserRow>(`UPDATE users SET role = COALESCE($2, role), active = COALESCE($3, active), updated_at = now() WHERE id = $1 RETURNING id, email, role, active, created_at AS "createdAt"`, [id, values.role ?? null, values.active ?? null])
      await client.query('COMMIT')
      return result.rows[0] ? publicUser(result.rows[0]) : null
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  }

}
