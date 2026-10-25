import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatAlbumDate, isSafeMediaSource } from '../../lib/media'
import type { Album, MediaKind } from '../../types/album'

const mediaLabels: Record<MediaKind, string> = {
  photo: 'Photographs',
  video: 'Video',
  mixed: 'Photographs and video',
}

function AlbumCoverImage({ album }: { album: Album }) {
  const cover = album.cover
  const [sourceFailed, setSourceFailed] = useState(!cover || !isSafeMediaSource(cover.src))

  if (sourceFailed || !cover) {
    return <div className="album-card__cover-placeholder" role="img" aria-label={`Cover image unavailable for ${album.title}`} />
  }

  return <img src={cover.src} alt="" width={cover.width} height={cover.height} loading="lazy" onError={() => setSourceFailed(true)} />
}

export function AlbumCard({ album }: { album: Album }) {
  const date = formatAlbumDate(album.eventDate)

  return (
    <article className="album-card">
      <Link className="album-card__link" to={`/gallery/${encodeURIComponent(album.slug)}`}>
        <div className="album-card__cover">
          <AlbumCoverImage album={album} />
        </div>
        <div className="album-card__body">
          <div className="album-card__meta">
            {date && <time dateTime={album.eventDate}>{date}</time>}
            <span>{mediaLabels[album.mediaType]}</span>
          </div>
          {album.developmentPreview && <span className="development-preview-label">Development preview · not an archive record</span>}
          <h3>{album.title}</h3>
          {album.description && <p>{album.description}</p>}
          {album.mediaCount !== undefined && !album.developmentPreview && <span className="album-card__count">{album.mediaCount} {album.mediaCount === 1 ? 'item' : 'items'}</span>}
        </div>
      </Link>
    </article>
  )
}
