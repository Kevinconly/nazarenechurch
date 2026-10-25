export type MediaKind = 'photo' | 'video' | 'mixed'
export type AlbumStatus = 'draft' | 'published'

export type AlbumCover = {
  src: string
  alt: string
  width: number
  height: number
}

export type Album = {
  id: string
  slug: string
  title: string
  description?: string
  eventDate?: string
  publishedAt?: string
  status: AlbumStatus
  cover?: AlbumCover
  mediaType: MediaKind
  mediaCount?: number
  createdAt: string
}
