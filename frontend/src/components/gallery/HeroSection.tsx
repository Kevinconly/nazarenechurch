import { ArrowDown } from 'lucide-react'
import { Container } from '../ui/Container'
import { SectionHeading } from '../ui/SectionHeading'

export function HeroSection() {
  return (
    <section className="gallery-hero" id="home" aria-labelledby="home-title">
      <Container className="gallery-hero__grid">
        <div className="gallery-hero__copy">
          <p className="eyebrow">Church of the Nazarene <span aria-hidden="true">·</span> Remera</p>
          <SectionHeading
            title="A place for the memories we share."
            id="home-title"
            description="Explore the moments, gatherings, and stories that have shaped our church community."
            level="page"
          />
          <a className="gallery-hero__link" href="#gallery">
            <span>Explore the gallery</span>
            <ArrowDown size={17} strokeWidth={1.8} aria-hidden="true" />
          </a>
        </div>
        <aside className="gallery-hero__aside" aria-label="About the Remera archive">
          <span className="gallery-hero__aside-label">A shared record</span>
          <p>Photographs and films, gathered with care and kept for generations to come.</p>
          <span className="gallery-hero__aside-rule" aria-hidden="true" />
          <span className="gallery-hero__aside-meta">Remera community archive</span>
        </aside>
      </Container>
    </section>
  )
}
