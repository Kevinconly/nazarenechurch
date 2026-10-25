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
            ? 'Browse options will appear alongside published collections as they become available.'
            : 'Browsing options will appear as published albums are added to the collection.'}
        </p>
      </Container>
    </section>
  )
}
