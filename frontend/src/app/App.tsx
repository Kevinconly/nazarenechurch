import { Navigate, Route, Routes } from 'react-router-dom'
import { ArchiveBrowseSection } from '../components/gallery/ArchiveBrowseSection'
import { AlbumDetailPage } from '../components/gallery/AlbumDetailPage'
import { FeaturedAlbumsSection } from '../components/gallery/FeaturedAlbumsSection'
import { HeroSection } from '../components/gallery/HeroSection'
import { PageShell } from '../components/layout/PageShell'
import { getPublishedAlbums } from '../lib/albums'

function GalleryHomePage() {
  const albums = getPublishedAlbums()

  return (
    <PageShell>
      <main id="main-content">
        <HeroSection />
        <FeaturedAlbumsSection albums={albums} />
        <ArchiveBrowseSection hasAlbums={albums.length > 0} />
      </main>
    </PageShell>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GalleryHomePage />} />
      <Route path="/gallery/:slug" element={<AlbumDetailPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
