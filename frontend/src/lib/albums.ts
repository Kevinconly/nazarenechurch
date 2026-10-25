import type { Album } from '../types/album'

// This is the homepage data boundary. No preview records are bundled; connect a
// published-album API here when that feature is available.
const albumRecords: readonly Album[] = []

export function getPublishedAlbums(): readonly Album[] {
  return albumRecords.filter((album) => album.status === 'published')
}
