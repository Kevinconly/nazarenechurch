export type CaptionTrack = {
  src: string
  srcLang: string
  label: string
  default?: boolean
}

type MediaBase = {
  id: string
  src: string
  thumbnailSrc?: string
  caption?: string
  width?: number
  height?: number
}

export type PhotoMedia = MediaBase & {
  type: 'photo'
  alt: string
}

export type VideoMedia = MediaBase & {
  type: 'video'
  alt: string
  durationSeconds?: number
  captionTracks?: readonly CaptionTrack[]
}

export type MediaItem = PhotoMedia | VideoMedia
