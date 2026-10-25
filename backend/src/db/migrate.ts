import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { closePool, getPool } from './pool.js'

async function migrate() {
  const sql = await readFile(resolve(process.cwd(), 'migrations/001_create_archive.sql'), 'utf8')
  const pool = getPool()
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)
  const version = '001_create_archive'
  const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version])
  if (applied.rowCount) {
    console.info('Archive database schema is up to date.')
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version])
    await client.query('COMMIT')
    console.info(`Applied database migration ${version}.`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

try {
  await migrate()
} catch (error) {
  console.error('Database migration failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closePool()
}
