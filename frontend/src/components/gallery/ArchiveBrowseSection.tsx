import { Container } from '../ui/Container'
import { SectionHeading } from '../ui/SectionHeading'

export function ArchiveBrowseSection({ hasAlbums }: { hasAlbums: boolean }) {
  return (
    <section className="browse-section" aria-labelledby="browse-heading">
      <Container className="browse-section__inner">
        <div className="browse-section__intro">
          <p className="eyebrow">Finding a memory</p>
          <SectionHeading
            title="Browse the archive"
            id="browse-heading"
            description="As albums are added, the collection can be explored by when a moment took place, the gathering it remembers, or the media it holds."
            level="section"
          />
        </div>
        <p className="browse-section__note">
          {hasAlbums
            ? 'Search and filter published albums by title, event, category, or year using the archive controls above.'
            : 'Search and filters are ready to explore published albums as they are added to the collection.'}
        </p>
      </Container>
    </section>
  )
}
