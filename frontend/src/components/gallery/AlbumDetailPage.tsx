import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getAlbumMedia, getPublishedAlbumBySlug } from '../../lib/albums'
import { formatAlbumDate } from '../../lib/media'
import { PageShell } from '../layout/PageShell'
import { Container } from '../ui/Container'
import { SectionHeading } from '../ui/SectionHeading'
import { MediaGrid } from './MediaGrid'
import type { MediaKind } from '../../types/album'

const mediaTypeNames: Record<MediaKind, string> = {
  photo: 'Photographs',
  video: 'Videos',
  mixed: 'Photographs and videos',
}

function AlbumNotFound() {
  return (
    <PageShell activePage="album">
      <main id="main-content" className="album-detail-page">
        <Container>
          <Link className="back-to-gallery" to="/#gallery"><ArrowLeft size={17} aria-hidden="true" />Back to the gallery</Link>
          <section className="album-not-found" aria-labelledby="album-not-found-title">
            <p className="eyebrow">Archive collection</p>
            <h1 id="album-not-found-title">Album not found</h1>
            <p>This album is not available. The link may be incorrect or the album may no longer be published.</p>
            <Link className="text-link" to="/#gallery">Browse the gallery</Link>
          </section>
        </Container>
      </main>
    </PageShell>
  )
}

export function AlbumDetailPage() {
  const { slug } = useParams()
  const album = slug ? getPublishedAlbumBySlug(slug) : undefined

  if (!album) return <AlbumNotFound />

  const media = getAlbumMedia(album.id)
  const eventDate = formatAlbumDate(album.eventDate)
  const mediaCount = album.mediaCount ?? media.length

  return (
    <PageShell activePage="album">
      <main id="main-content" className="album-detail-page">
        <Container>
          <Link className="back-to-gallery" to="/#gallery"><ArrowLeft size={17} aria-hidden="true" />Back to the gallery</Link>
          <article className="album-detail" aria-labelledby="album-title">
            <header className="album-detail__header">
              {album.developmentPreview && (
                <p className="development-preview-notice" role="note">Development preview — not part of the Remera historical archive.</p>
              )}
              <p className="eyebrow">Album</p>
              <SectionHeading id="album-title" level="page" title={album.title} description={album.description} />
              <div className="album-detail__metadata">
                {eventDate && <time dateTime={album.eventDate}>{eventDate}</time>}
                {album.mediaCount !== undefined || media.length > 0
                  ? <span>{mediaCount} {mediaCount === 1 ? 'item' : 'items'}</span>
                  : null}
                {media.length > 0 && <span>{mediaTypeNames[album.mediaType]}</span>}
              </div>
            </header>
            <MediaGrid media={media} expectedCount={album.mediaCount} />
          </article>
        </Container>
      </main>
    </PageShell>
  )
}
