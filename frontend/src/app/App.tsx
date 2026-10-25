import { Navigate, Route, Routes } from 'react-router-dom'
import { EmptyState } from '../components/ui/EmptyState'
import { Container } from '../components/ui/Container'
import { SectionHeading } from '../components/ui/SectionHeading'
import { PageShell } from '../components/layout/PageShell'

function FoundationPage() {
  return (
    <PageShell>
      <main id="main-content">
        <section className="intro-section">
          <Container>
            <p className="eyebrow">A living record of our community</p>
            <SectionHeading
              title="Church of the Nazarene — Remera"
              description="A place for the photographs and films that hold our shared memories."
              level="page"
            />
            <div className="intro-note">
              <span className="status-mark" aria-hidden="true" />
              <p>This archive is at its foundation stage. The public gallery will grow here.</p>
            </div>
          </Container>
        </section>
        <Container>
          <section className="foundation-section" aria-labelledby="foundation-title">
            <div className="foundation-copy">
              <p className="eyebrow">A careful beginning</p>
              <h2 id="foundation-title">Made to remember, together.</h2>
              <p className="body-copy">This space is being prepared to preserve and share the moments, people, and gatherings that have shaped our church community.</p>
            </div>
            <div className="photo-placeholder" role="img" aria-label="Placeholder for future church archive photography">
              <span>Church and community photographs will appear here</span>
            </div>
          </section>
          <div className="archive-empty">
            <EmptyState title="The archive is being prepared" description="No historical photographs or videos have been added yet." />
          </div>
        </Container>
      </main>
    </PageShell>
  )
}

export default function App() {
  // Add the public gallery and album routes here in the next milestone.
  return <Routes><Route path="/" element={<FoundationPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>
}
