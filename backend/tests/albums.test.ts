import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import type { AlbumRecord, ArchiveRepository, MediaRecord, PageResult } from '../src/types/archive.js'

const visibleAlbum: AlbumRecord = {
  id: 'published-id', slug: 'community-day', title: 'Community Day', description: null,
  eventName: 'Community gathering', category: 'Fellowship', eventDate: '2025-02-10',
  publishedAt: '2025-02-11T00:00:00.000Z', coverUrl: null, mediaType: 'photo', mediaCount: 1,
}
const visibleMedia: MediaRecord = {
  id: 'media-id', albumId: visibleAlbum.id, type: 'photo', url: '/media/photo.jpg',
  thumbnailUrl: null, alt: 'Community gathering', caption: null, width: 1200, height: 800, durationSeconds: null,
}

function page<T>(items: T[], total: number, current: number, pageSize: number): PageResult<T> {
  return { items, page: current, pageSize, total, totalPages: Math.ceil(total / pageSize) }
}

const repository: ArchiveRepository = {
  async listPublishedAlbums(current, pageSize) {
    // These records stand in for the repository's SQL status predicate; no production fixtures are added.
    const all = [visibleAlbum]
    const start = (current - 1) * pageSize
    return page(all.slice(start, start + pageSize), all.length, current, pageSize)
  },
  async listPublishedMedia(slug, current, pageSize) {
    if (slug !== visibleAlbum.slug) return null // draft-only albums are indistinguishable from missing albums
    const all = [visibleMedia]
    const start = (current - 1) * pageSize
    return page(all.slice(start, start + pageSize), all.length, current, pageSize)
  },
}

async function withApi(run: (baseUrl: string) => Promise<void>) {
  const server = createServer(createApp(repository))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  try { await run(`http://127.0.0.1:${address.port}`) } finally { server.close(); await once(server, 'close') }
}

test('lists published albums with validated pagination metadata', async () => {
  await withApi(async (base) => {
    const response = await fetch(`${base}/api/albums?page=1&pageSize=1`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { items: [visibleAlbum], page: 1, pageSize: 1, total: 1, totalPages: 1 })
  })
})

test('rejects invalid pagination and malformed slugs predictably', async () => {
  await withApi(async (base) => {
    const invalidPage = await fetch(`${base}/api/albums?page=0`)
    assert.equal(invalidPage.status, 400)
    assert.deepEqual(await invalidPage.json(), { error: 'Query parameter "page" must be between 1 and 1000000000.', status: 400 })
    const invalidSlug = await fetch(`${base}/api/albums/hello--world/media`)
    assert.equal(invalidSlug.status, 400)
  })
})

test('returns only published album media and hides missing or unpublished albums', async () => {
  await withApi(async (base) => {
    const response = await fetch(`${base}/api/albums/community-day/media?pageSize=1`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { items: [visibleMedia], page: 1, pageSize: 1, total: 1, totalPages: 1 })
    const hidden = await fetch(`${base}/api/albums/draft-album/media`)
    assert.equal(hidden.status, 404)
    assert.deepEqual(await hidden.json(), { error: 'Published album not found.', status: 404 })
  })
})

test('returns an empty page beyond the available result range', async () => {
  await withApi(async (base) => {
    const response = await fetch(`${base}/api/albums?page=2&pageSize=1`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { items: [], page: 2, pageSize: 1, total: 1, totalPages: 1 })
  })
})
