import type { Album } from '../../types/album'
import { Container } from '../ui/Container'
import { Divider } from '../ui/Divider'
import { EmptyState } from '../ui/EmptyState'
import { SectionHeading } from '../ui/SectionHeading'
import { AlbumCard } from './AlbumCard'

type FeaturedAlbumsSectionProps = {
  albums: readonly Album[]
}

export function FeaturedAlbumsSection({ albums }: FeaturedAlbumsSectionProps) {
  const publishedAlbumCount = albums.filter((album) => !album.developmentPreview).length

  return (
    <section className="featured-section" id="gallery" aria-labelledby="featured-heading">
      <Container>
        <div className="featured-section__heading">
          <div>
            <p className="eyebrow">The collection</p>
            <SectionHeading
              title="Featured albums"
              id="featured-heading"
              description="A growing collection of photographs and films from our community."
              level="section"
            />
          </div>
          {publishedAlbumCount > 0 && <span className="featured-section__count">{publishedAlbumCount} published {publishedAlbumCount === 1 ? 'album' : 'albums'}</span>}
        </div>
        {albums.length > 0 ? (
          <div className="album-grid">
            {albums.map((album) => <AlbumCard key={album.id} album={album} />)}
          </div>
        ) : (
          <div className="featured-section__empty">
            <Divider />
            <EmptyState
              title="The archive is being prepared"
              description="There are no published albums yet. When the collection is ready, its stories will be gathered here."
            />
          </div>
        )}
      </Container>
    </section>
  )
}
