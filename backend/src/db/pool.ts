import pg from 'pg'
import { readFileSync } from 'node:fs'
import { config } from '../config/env.js'

let pool: pg.Pool | undefined

export function getPool(): pg.Pool {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required to use archive data. Copy .env.example to backend/.env and configure PostgreSQL.')
  const protocol = new URL(config.databaseUrl).protocol
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') throw new Error('DATABASE_URL must use the postgres:// or postgresql:// scheme.')
  const ca = config.databaseSslCaFile ? readFileSync(config.databaseSslCaFile, 'utf8') : undefined
  pool ??= new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: 10,
    idleTimeoutMillis: 30_000,
  })
  return pool
}

export async function closePool(): Promise<void> {
  if (pool) {
    const current = pool
    pool = undefined
    await current.end()
  }
}
