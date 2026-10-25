import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createEmptyArchiveFilters,
  filterPublishedAlbums,
  getAlbumYear,
  getArchiveFilterOptions,
  type ArchiveFilters,
} from '../src/lib/archiveSearch.js'
import type { Album } from '../src/types/album.js'

function makeAlbum(overrides: Partial<Album> = {}): Album {
  return {
    id: 'album-1',
    slug: 'album-1',
    title: 'Sunday Gathering',
    eventName: 'Community Worship',
    category: 'Worship',
    eventDate: '2024-04-14',
    status: 'published',
    mediaType: 'photo',
    createdAt: '2024-04-14T10:00:00.000Z',
    ...overrides,
  }
}

const noFilters = (): ArchiveFilters => createEmptyArchiveFilters()

test('search is case-insensitive, partial, and ignores surrounding whitespace', () => {
  const albums = [makeAlbum(), makeAlbum({ id: 'album-2', slug: 'album-2', title: 'Spring Service' })]
  const results = filterPublishedAlbums(albums, { ...noFilters(), query: '  sUNdAy  ' })
  assert.deepEqual(results.map((album) => album.id), ['album-1'])
})

test('search matches explicit event, category, and valid event year metadata', () => {
  const album = makeAlbum()
  for (const query of ['community', 'wors', '2024']) {
    assert.deepEqual(filterPublishedAlbums([album], { ...noFilters(), query }), [album])
  }
})

test('search does not treat description as event or category metadata', () => {
  const album = makeAlbum({ description: 'A youth gathering in the hills.' })
  assert.deepEqual(filterPublishedAlbums([album], { ...noFilters(), query: 'youth' }), [])
})

test('search and event, category, and year filters combine in one pipeline', () => {
  const match = makeAlbum()
  const differentEvent = makeAlbum({ id: 'album-2', slug: 'album-2', eventName: 'Choir Practice' })
  const differentYear = makeAlbum({ id: 'album-3', slug: 'album-3', eventDate: '2023-04-14' })
  const results = filterPublishedAlbums([match, differentEvent, differentYear], {
    query: 'Sunday',
    event: 'community worship',
    category: 'worship',
    year: '2024',
  })
  assert.deepEqual(results, [match])
})

test('year extraction accepts valid ISO dates and rejects missing or invalid dates', () => {
  assert.equal(getAlbumYear('2024-02-29'), '2024')
  assert.equal(getAlbumYear('2024-12-31T23:30:00-02:00'), '2024')
  assert.equal(getAlbumYear(undefined), undefined)
  assert.equal(getAlbumYear(''), undefined)
  assert.equal(getAlbumYear('not-a-date'), undefined)
  assert.equal(getAlbumYear('2023-02-29'), undefined)
  assert.equal(getAlbumYear('2024-01-02T25:00:00Z'), undefined)
})

test('filter options come from published metadata and omit invalid dates', () => {
  const options = getArchiveFilterOptions([
    makeAlbum({ eventName: 'Community Worship', category: 'Worship', eventDate: '2024-04-14' }),
    makeAlbum({ id: 'album-2', slug: 'album-2', eventName: 'community worship', category: 'Worship', eventDate: '2023-01-02' }),
    makeAlbum({ id: 'album-3', slug: 'album-3', eventName: 'Hidden draft event', category: 'Private', eventDate: '2022-03-01', status: 'draft' }),
    makeAlbum({ id: 'album-4', slug: 'album-4', eventDate: 'bad-date' }),
  ])
  assert.deepEqual(options, {
    events: ['Community Worship'],
    categories: ['Worship'],
    years: ['2024', '2023'],
  })
})

test('clearing one filter broadens results and resetting filters restores all published albums', () => {
  const first = makeAlbum()
  const second = makeAlbum({ id: 'album-2', slug: 'album-2', category: 'Community' })
  const filtered = { query: '', event: '', category: 'Worship', year: '' }
  assert.deepEqual(filterPublishedAlbums([first, second], filtered), [first])
  assert.deepEqual(filterPublishedAlbums([first, second], { ...filtered, category: '' }), [first, second])
  assert.deepEqual(filterPublishedAlbums([first, second], createEmptyArchiveFilters()), [first, second])
})

test('draft albums are never returned by public filtering', () => {
  const draft = makeAlbum({ status: 'draft', title: 'Private Draft' })
  assert.deepEqual(filterPublishedAlbums([draft], { ...noFilters(), query: 'private' }), [])
})

test('no published albums and no matching results both return an empty collection', () => {
  const draft = makeAlbum({ status: 'draft' })
  const published = makeAlbum()
  assert.deepEqual(filterPublishedAlbums([draft], noFilters()), [])
  assert.deepEqual(filterPublishedAlbums([published], { ...noFilters(), query: 'no match' }), [])
})
