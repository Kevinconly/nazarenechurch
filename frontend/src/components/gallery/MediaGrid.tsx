import { useRef, useState } from 'react'
import { EmptyState } from '../ui/EmptyState'
import type { MediaItem, PhotoMedia, VideoMedia } from '../../types/media'
import { formatDuration, isSafeMediaSource } from '../../lib/media'
import { PhotoViewer } from './PhotoViewer'

function UnavailableMedia({ kind, description }: { kind: string; description: string }) {
  return (
    <div className="media-unavailable" role="status">
      <strong>{kind} unavailable</strong>
      <span>{description}</span>
    </div>
  )
}

function PhotoTile({ photo, onOpen }: { photo: PhotoMedia; onOpen: (photo: PhotoMedia, button: HTMLButtonElement) => void }) {
  const [sourceFailed, setSourceFailed] = useState(!isSafeMediaSource(photo.src))
  const [thumbnailFailed, setThumbnailFailed] = useState(false)
  const thumbnailSource = photo.thumbnailSrc && isSafeMediaSource(photo.thumbnailSrc) ? photo.thumbnailSrc : undefined
  const displayedSource = thumbnailSource && !thumbnailFailed ? thumbnailSource : photo.src
  const label = photo.caption || photo.alt

  return (
    <figure className="media-tile">
      {sourceFailed ? (
        <UnavailableMedia kind="Photograph" description={photo.alt} />
      ) : (
        <button
          className="media-tile__photo-button"
          type="button"
          onClick={(event) => onOpen(photo, event.currentTarget)}
          aria-label={`Open photograph: ${label}`}
        >
          <img
            src={displayedSource}
            alt=""
            width={photo.width}
            height={photo.height}
            loading="lazy"
            onError={() => {
              if (thumbnailSource && !thumbnailFailed) setThumbnailFailed(true)
              else setSourceFailed(true)
            }}
          />
          <span className="visually-hidden">Open photograph</span>
        </button>
      )}
      {photo.caption && <figcaption>{photo.caption}</figcaption>}
    </figure>
  )
}

function VideoTile({ video }: { video: VideoMedia }) {
  const [sourceFailed, setSourceFailed] = useState(!isSafeMediaSource(video.src))
  const duration = formatDuration(video.durationSeconds)
  const poster = video.thumbnailSrc && isSafeMediaSource(video.thumbnailSrc) ? video.thumbnailSrc : undefined

  return (
    <figure className="media-tile">
      {sourceFailed ? (
        <UnavailableMedia kind="Video" description={video.alt} />
      ) : (
        <video
          className="media-tile__video"
          src={video.src}
          poster={poster}
          controls
          playsInline
          preload="none"
          width={video.width}
          height={video.height}
          aria-label={video.alt}
          onError={() => setSourceFailed(true)}
        >
          {video.captionTracks?.filter((track) => isSafeMediaSource(track.src)).map((track) => (
            <track key={`${track.srcLang}-${track.src}`} kind="captions" src={track.src} srcLang={track.srcLang} label={track.label} default={track.default} />
          ))}
          Your browser does not support video playback. {video.alt}
        </video>
      )}
      <figcaption>
        <span>{video.caption || video.alt}</span>
        {duration && <span className="media-tile__duration">{duration}</span>}
      </figcaption>
    </figure>
  )
}

export function MediaGrid({ media, expectedCount }: { media: readonly MediaItem[]; expectedCount?: number }) {
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const returnFocusRef = useRef<HTMLButtonElement>(null)
  const photos = media.filter((item): item is PhotoMedia => item.type === 'photo' && isSafeMediaSource(item.src))
  const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId) ?? null

  if (media.length === 0) {
    return (
      <div className="album-detail__empty">
        {expectedCount && expectedCount > 0
          ? <EmptyState title="Album media is unavailable" description={`This album lists ${expectedCount} items, but its media records could not be retrieved.`} />
          : <EmptyState title="No media in this album yet" description="This album is available, but it does not contain any published photographs or videos." />}
      </div>
    )
  }

  return (
    <>
      <div className="media-grid">
        {media.map((item) => item.type === 'photo'
          ? <PhotoTile key={item.id} photo={item} onOpen={(photo, button) => { returnFocusRef.current = button; setSelectedPhotoId(photo.id) }} />
          : <VideoTile key={item.id} video={item} />)}
      </div>
      <PhotoViewer
        photo={selectedPhoto}
        photos={photos}
        onSelect={(photo) => setSelectedPhotoId(photo.id)}
        onClose={() => setSelectedPhotoId(null)}
        returnFocusRef={returnFocusRef}
      />
    </>
  )
}
