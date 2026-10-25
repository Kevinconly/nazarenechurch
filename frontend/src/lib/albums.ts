import type { Album } from '../types/album'
import type { MediaItem } from '../types/media'
import { developmentAlbumFixtures } from './development/albumFixtures'

// Replace these empty production records with the API adapter when available.
const publishedAlbumRecords: readonly Album[] = []
const albumRecords: readonly Album[] = import.meta.env.DEV
  ? [...publishedAlbumRecords, ...developmentAlbumFixtures]
  : publishedAlbumRecords

// Media is intentionally separate from the album cover. This empty lookup is
// the media data boundary for a future API integration.
const mediaRecordsByAlbumId: Readonly<Record<string, readonly MediaItem[]>> = {}

export function getPublishedAlbums(): readonly Album[] {
  return albumRecords.filter((album) => album.status === 'published')
}

export function getPublishedAlbumBySlug(slug: string): Album | undefined {
  return albumRecords.find((album) => album.slug === slug && album.status === 'published')
}

export function getAlbumMedia(albumId: string): readonly MediaItem[] {
  return mediaRecordsByAlbumId[albumId] ?? []
}
