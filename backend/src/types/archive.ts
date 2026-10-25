export type AlbumStatus = 'draft' | 'published'
export type MediaStatus = 'draft' | 'published'
export type MediaType = 'photo' | 'video'

export type AlbumRecord = {
  id: string
  slug: string
  title: string
  description: string | null
  eventName: string | null
  category: string | null
  eventDate: string | null
  publishedAt: string | null
  coverUrl: string | null
  mediaType: 'photo' | 'video' | 'mixed'
  mediaCount: number
}

export type MediaRecord = {
  id: string
  albumId: string
  type: MediaType
  url: string
  thumbnailUrl: string | null
  alt: string
  caption: string | null
  width: number | null
  height: number | null
  durationSeconds: number | null
}

export type PageResult<T> = { items: T[]; page: number; pageSize: number; total: number; totalPages: number }

export interface ArchiveRepository {
  listPublishedAlbums(page: number, pageSize: number): Promise<PageResult<AlbumRecord>>
  listPublishedMedia(albumSlug: string, page: number, pageSize: number): Promise<PageResult<MediaRecord> | null>
}
