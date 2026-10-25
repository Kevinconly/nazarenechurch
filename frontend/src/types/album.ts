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
  /** Explicit event name; do not infer this value from the title or description. */
  eventName?: string
  /** Explicit archive category assigned to the album. */
  category?: string
  /** ISO-8601 calendar date or date-time for the event represented by this album. */
  eventDate?: string
  publishedAt?: string
  status: AlbumStatus
  cover?: AlbumCover
  mediaType: MediaKind
  mediaCount?: number
  createdAt: string
  /** Set only on records from the explicitly development-only preview module. */
  developmentPreview?: true
}
