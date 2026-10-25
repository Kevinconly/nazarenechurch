import type { Album, MediaKind } from '../../types/album'

const mediaLabels: Record<MediaKind, string> = {
  photo: 'Photographs',
  video: 'Video',
  mixed: 'Photographs and video',
}

export function AlbumCard({ album }: { album: Album }) {
  const date = album.eventDate
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(album.eventDate))
    : undefined

  return (
    <article className="album-card">
      <div className="album-card__cover">
        {album.cover ? (
          <img
            src={album.cover.src}
            alt={album.cover.alt}
            width={album.cover.width}
            height={album.cover.height}
            loading="lazy"
          />
        ) : (
          <div className="album-card__cover-placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="album-card__body">
        <div className="album-card__meta">
          {date && <time dateTime={album.eventDate}>{date}</time>}
          <span>{mediaLabels[album.mediaType]}</span>
        </div>
        <h3>{album.title}</h3>
        {album.description && <p>{album.description}</p>}
        {album.mediaCount !== undefined && <span className="album-card__count">{album.mediaCount} {album.mediaCount === 1 ? 'item' : 'items'}</span>}
      </div>
    </article>
  )
}
