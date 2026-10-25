import 'dotenv/config'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { closePool, getPool } from './pool.js'

async function migrate() {
  const migrationDirectory = resolve(process.cwd(), 'migrations')
  const pool = getPool()
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)
  const files = (await readdir(migrationDirectory)).filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file)).sort()
  for (const file of files) {
    const version = file.replace(/\.sql$/, '')
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version])
    if (applied.rowCount) continue
    const sql = await readFile(resolve(migrationDirectory, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1)', [5815030601])
      const recheck = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version])
      if (!recheck.rowCount) {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version])
        console.info(`Applied database migration ${version}.`)
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }
  console.info('Database schema is up to date.')
}

try {
  await migrate()
} catch (error) {
  console.error('Database migration failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closePool()
}
