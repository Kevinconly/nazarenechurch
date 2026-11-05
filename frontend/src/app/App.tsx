import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ArchiveBrowseSection } from '../components/gallery/ArchiveBrowseSection'
import { AlbumDetailPage } from '../components/gallery/AlbumDetailPage'
import { FeaturedAlbumsSection } from '../components/gallery/FeaturedAlbumsSection'
import { HeroSection } from '../components/gallery/HeroSection'
import { PageShell } from '../components/layout/PageShell'
import { Container } from '../components/ui/Container'
import { listPublishedAlbums } from '../lib/archiveApi'
import type { Album } from '../types/album'

const MediaAdminPage = lazy(() => import('../components/auth/MediaAdminPage').then(({ MediaAdminPage: page }) => ({ default: page })))
const SignInPage = lazy(() => import('../components/auth/SignInPage').then(({ SignInPage: page }) => ({ default: page })))
const AdminPage = lazy(() => import('../components/auth/AdminPage').then(({ AdminPage: page }) => ({ default: page })))

function GalleryHomePage() {
  const [albums, setAlbums] = useState<readonly Album[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadAlbums() {
    setLoading(true)
    setError('')
    try {
      setAlbums(await listPublishedAlbums())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to load the archive.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAlbums() }, [])

  return (
    <PageShell>
      <main id="main-content">
        <HeroSection />
        <FeaturedAlbumsSection albums={albums} loading={loading} error={error} onRetry={() => void loadAlbums()} />
        <ArchiveBrowseSection hasAlbums={albums.length > 0} />
      </main>
    </PageShell>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageShell><main id="main-content"><Container><p role="status">Loading page…</p></Container></main></PageShell>}>
      <Routes>
        <Route path="/" element={<GalleryHomePage />} />
        <Route path="/gallery/:slug" element={<AlbumDetailPage />} />
        <Route path="/admin/media" element={<MediaAdminPage />} />
        <Route path="/admin/sign-in" element={<SignInPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
