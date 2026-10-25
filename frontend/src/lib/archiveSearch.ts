import type { Album } from '../types/album.js'

export type ArchiveFilters = {
  query: string
  event: string
  category: string
  year: string
}

export type ArchiveFilterOptions = {
  events: string[]
  categories: string[]
  years: string[]
}

export function createEmptyArchiveFilters(): ArchiveFilters {
  return { query: '', event: '', category: '', year: '' }
}

function normalize(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, ' ').toLowerCase() ?? ''
}

/** Return the calendar year from a valid ISO-8601 event date without timezone shifts. */
export function getAlbumYear(eventDate: string | undefined): string | undefined {
  const value = eventDate?.trim()
  if (!value) return undefined

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value)
  if (!match) return undefined

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12) return undefined

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (day < 1 || day > daysInMonth[month - 1]) return undefined

  // A date-time must also be parseable (for example, reject an invalid hour).
  if (value.length > 10 && Number.isNaN(Date.parse(value))) return undefined
  return match[1]
}

function publishedAlbums(albums: readonly Album[]): Album[] {
  return albums.filter((album) => album.status === 'published')
}

function distinctMetadataValues(values: Array<string | undefined>): string[] {
  const distinct = new Map<string, string>()
  for (const value of values) {
    const displayValue = value?.trim().replace(/\s+/g, ' ')
    const key = normalize(displayValue)
    if (displayValue && key && !distinct.has(key)) distinct.set(key, displayValue)
  }
  return [...distinct.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
}

export function getArchiveFilterOptions(albums: readonly Album[]): ArchiveFilterOptions {
  const published = publishedAlbums(albums)
  return {
    events: distinctMetadataValues(published.map((album) => album.eventName)),
    categories: distinctMetadataValues(published.map((album) => album.category)),
    years: distinctMetadataValues(published.map((album) => getAlbumYear(album.eventDate)))
      .sort((left, right) => Number(right) - Number(left)),
  }
}

export function filterPublishedAlbums(albums: readonly Album[], filters: ArchiveFilters): Album[] {
  const query = normalize(filters.query)
  const event = normalize(filters.event)
  const category = normalize(filters.category)
  const year = normalize(filters.year)

  return publishedAlbums(albums).filter((album) => {
    const albumYear = getAlbumYear(album.eventDate)
    const matchesQuery = !query || [album.title, album.eventName, album.category, albumYear]
      .some((value) => normalize(value).includes(query))

    return matchesQuery
      && (!event || normalize(album.eventName) === event)
      && (!category || normalize(album.category) === category)
      && (!year || albumYear === year)
  })
}

export function hasActiveArchiveFilters(filters: ArchiveFilters): boolean {
  return Boolean(normalize(filters.query) || normalize(filters.event) || normalize(filters.category) || normalize(filters.year))
}
