import assert from 'node:assert/strict'
import type { Pool } from 'pg'
import { test } from 'node:test'
import { PostgresArchiveRepository } from '../src/db/archiveRepository.js'

test('database queries enforce published album and media boundaries and bind pagination', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = []
  const fakePool = {
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql, values })
      if (sql.includes('SELECT id FROM albums')) return { rows: [{ id: 'album-id' }] }
      if (sql.includes('SELECT count(*)')) return { rows: [{ total: '0' }] }
      return { rows: [] }
    },
  } as unknown as Pool
  const repo = new PostgresArchiveRepository(fakePool)

  await repo.listPublishedAlbums(2, 10)
  const albumList = calls.find((call) => call.sql.includes('FROM albums a'))
  assert.ok(albumList)
  assert.match(albumList.sql, /WHERE a\.status = 'published'/)
  assert.match(albumList.sql, /m\.status = 'published'/)
  assert.deepEqual(albumList.values, [10, 10])

  calls.length = 0
  await repo.listPublishedMedia('public-album', 3, 5)
  const albumLookup = calls.find((call) => call.sql.includes('SELECT id FROM albums'))
  const mediaList = calls.find((call) => call.sql.includes('FROM media WHERE'))
  assert.ok(albumLookup)
  assert.match(albumLookup.sql, /status = 'published'/)
  assert.ok(mediaList)
  assert.match(mediaList.sql, /status = 'published'/)
  assert.deepEqual(mediaList.values, ['album-id', 5, 10])
})
