import assert from 'node:assert/strict'
import type { Pool } from 'pg'
import { test } from 'node:test'
import { UserRepository } from '../src/auth/userRepository.js'

test('refuses to demote the last active Administrator inside a serialized transaction', async () => {
  const statements: string[] = []
  const client = {
    async query(sql: string) {
      statements.push(sql)
      if (sql.includes('SELECT id, email, role')) return { rows: [{ id: 'admin-id', email: 'admin@example.test', role: 'Administrator', active: true, createdAt: new Date().toISOString() }] }
      if (sql.includes('count(*)')) return { rows: [{ count: '1' }] }
      return { rows: [] }
    },
    release() {},
  }
  const pool = { async connect() { return client } } as unknown as Pool
  const repository = new UserRepository(pool)

  await assert.rejects(repository.update('admin-id', { role: 'Contributor' }), (error: unknown) => {
    assert.equal((error as { code?: string }).code, 'LAST_ADMIN')
    return true
  })
  assert.ok(statements.some((sql) => sql.includes('pg_advisory_xact_lock')))
  assert.ok(statements.includes('ROLLBACK'))
  assert.equal(statements.some((sql) => sql.startsWith('UPDATE users')), false)
})
