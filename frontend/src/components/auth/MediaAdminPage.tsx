import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../app/AuthProvider'
import {
  createAlbum,
  deleteAlbum,
  deleteMedia,
  getUploadLimits,
  getUploadStatuses,
  listManagedAlbums,
  retryMedia,
  updateAlbum,
  uploadImageBatch,
  updateMediaStatus,
  type UploadLimits,
  type AlbumDraft,
  type ManagedAlbum,
  type UploadProgress,
  type UploadStatus,
} from '../../lib/archiveApi'
import { PageShell } from '../layout/PageShell'
import { Container } from '../ui/Container'
import { Button } from '../ui/Button'

const emptyDraft: AlbumDraft = { title: '', slug: '', description: '', event_name: '', category: '', event_date: '' }

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function fileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function validateFiles(files: readonly File[], limits: UploadLimits) {
  const totalBytes = files.reduce((total, file) => total + file.size, 0)
  if (files.length > limits.maxBatchFiles) return `Choose no more than ${limits.maxBatchFiles} images per batch.`
  if (files.some((file) => file.size < 1 || file.size > limits.maxFileSizeBytes)) {
    return `Each image must be no larger than ${fileSize(limits.maxFileSizeBytes)}.`
  }
  if (totalBytes > limits.maxBatchBytes) return `A batch cannot exceed ${fileSize(limits.maxBatchBytes)}.`
  if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
    return 'Choose JPEG, PNG, or WebP images.'
  }
  return ''
}

function ManagedAlbumCover({ album }: { album: ManagedAlbum }) {
  const [failed, setFailed] = useState(false)
  if (!album.cover || failed) {
    return <span role="img" aria-label={`Cover image unavailable for ${album.title}`}>Cover image unavailable</span>
  }
  return <img
    src={album.cover.src}
    srcSet={album.cover.srcSet}
    sizes="(min-width: 1200px) 360px, 85vw"
    alt=""
    width={album.cover.width}
    height={album.cover.height}
    loading="lazy"
    onError={() => setFailed(true)}
  />
}

export function MediaAdminPage() {
  const auth = useAuth()
  const location = useLocation()
  const [albums, setAlbums] = useState<readonly ManagedAlbum[]>([])
  const [uploads, setUploads] = useState<readonly UploadStatus[]>([])
  const [uploadLimits, setUploadLimits] = useState<UploadLimits>({
    maxFileSizeBytes: 50 * 1024 * 1024,
    maxBatchFiles: 10,
    maxBatchBytes: 250 * 1024 * 1024,
    maxConcurrentUploads: 3,
    retentionDays: 30,
  })
  const [selectedAlbumId, setSelectedAlbumId] = useState('')
  const [draft, setDraft] = useState<AlbumDraft>(emptyDraft)
  const [editingId, setEditingId] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<UploadProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [message, setMessage] = useState('')

  const canManage = auth.user?.role === 'SUPER_ADMIN' || auth.user?.role === 'MEDIA_ADMIN'
  const loadAlbums = useCallback(async () => {
    const records = await listManagedAlbums()
    setAlbums(records)
    if (!selectedAlbumId && records.length > 0) setSelectedAlbumId(records[0]!.id)
  }, [selectedAlbumId])

  const loadUploads = useCallback(async () => {
    setUploads(await getUploadStatuses())
  }, [])

  const loadUploadLimits = useCallback(async () => {
    setUploadLimits(await getUploadLimits())
  }, [])

  const refresh = useCallback(async () => {
    setProblem('')
    try {
      await Promise.all([loadAlbums(), loadUploads(), loadUploadLimits()])
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Unable to load media management data.')
    } finally {
      setLoading(false)
    }
  }, [loadAlbums, loadUploads, loadUploadLimits])

  useEffect(() => {
    if (!canManage) return
    void refresh()
    const interval = window.setInterval(() => { void loadUploads().catch((error: unknown) => setProblem(error instanceof Error ? error.message : 'Unable to refresh upload status.')) }, 5000)
    return () => window.clearInterval(interval)
  }, [canManage, loadUploads, refresh])

  function updateDraft(key: keyof AlbumDraft, value: string) {
    setDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === 'title' && !editingId ? { slug: slugify(value) } : {}),
    }))
  }

  async function saveAlbum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setProblem('')
    setMessage('')
    try {
      if (editingId) {
        await updateAlbum(editingId, draft)
        setMessage('Album changes saved.')
      } else {
        const created = await createAlbum(draft)
        setSelectedAlbumId(created.id)
        setMessage('Draft album created.')
      }
      setEditingId('')
      setDraft(emptyDraft)
      await loadAlbums()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Unable to save the album.')
    } finally {
      setBusy(false)
    }
  }

  function beginEdit(album: ManagedAlbum) {
    setEditingId(album.id)
    setDraft({
      title: album.title,
      slug: album.slug,
      description: album.description ?? '',
      event_name: album.eventName ?? '',
      category: album.category ?? '',
      event_date: album.eventDate ?? '',
    })
    document.getElementById('album-form-title')?.focus()
  }

  async function togglePublication(album: ManagedAlbum) {
    setBusy(true)
    setProblem('')
    setMessage('')
    try {
      await updateAlbum(album.id, { status: album.status === 'published' ? 'draft' : 'published' })
      await loadAlbums()
      setMessage(album.status === 'published' ? 'Album unpublished.' : 'Album published.')
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Unable to update album publication.')
    } finally {
      setBusy(false)
    }
  }

  async function removeAlbum(album: ManagedAlbum) {
    if (!window.confirm(`Delete “${album.title}”? It will be removed from the public gallery. Deleted media is eligible for automatic purge after ${uploadLimits.retentionDays} days.`)) return
    setBusy(true)
    setProblem('')
    setMessage('')
    try {
      await deleteAlbum(album.id)
      if (selectedAlbumId === album.id) setSelectedAlbumId('')
      if (editingId === album.id) {
        setEditingId('')
        setDraft(emptyDraft)
      }
      await loadAlbums()
      setMessage('Album deleted from publication.')
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Unable to delete the album.')
    } finally {
      setBusy(false)
    }
  }

  function chooseFiles(files: FileList | null) {
    const images = Array.from(files ?? [])
    setSelectedFiles(images)
    setProgress([])
    setProblem(validateFiles(images, uploadLimits))
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    chooseFiles(event.dataTransfer.files)
  }

  async function startUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedAlbumId || selectedFiles.length === 0) {
      setProblem('Choose an album and at least one image.')
      return
    }
    const fileProblem = validateFiles(selectedFiles, uploadLimits)
    if (fileProblem) {
      setProblem(fileProblem)
      return
    }
    setBusy(true)
    setProblem('')
    setMessage('')
    setProgress([])
    try {
      await uploadImageBatch(selectedAlbumId, selectedFiles, (next) => {
        setProgress((current) => {
          const previous = current.findIndex((item) => item.id === next.id)
          if (previous < 0) return [...current, next]
          return current.map((item, index) => index === previous ? next : item)
        })
      }, uploadLimits)
      setMessage('Uploads queued for validation, malware scanning, and image processing. They are not public yet.')
      setSelectedFiles([])
      await loadUploads()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'One or more uploads failed.')
      await loadUploads().catch((loadError: unknown) => setProblem(loadError instanceof Error ? loadError.message : 'Unable to refresh upload status.'))
    } finally {
      setBusy(false)
    }
  }

  async function changeMediaStatus(item: UploadStatus) {
    if (item.status === 'approved' && !window.confirm('Publish this processed image in its published album?')) return
    setBusy(true)
    setProblem('')
    try {
      await updateMediaStatus(item.id, item.status === 'published' ? 'approved' : 'published')
      await loadUploads()
      setMessage(item.status === 'published' ? 'Image unpublished.' : 'Image published.')
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Unable to change image publication.')
    } finally {
      setBusy(false)
    }
  }

  async function removeMedia(item: UploadStatus) {
    if (!window.confirm(`Delete ${item.original_filename}? It will be hidden immediately and eligible for automatic purge after ${uploadLimits.retentionDays} days.`)) return
    setBusy(true)
    setProblem('')
    try {
      await deleteMedia(item.id)
      await loadUploads()
      setMessage('Image removed from publication.')
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Unable to delete the image.')
    } finally {
      setBusy(false)
    }
  }

  async function retryFailedMedia(item: UploadStatus) {
    setBusy(true)
    setProblem('')
    setMessage('')
    try {
      await retryMedia(item.id)
      await loadUploads()
      setMessage(`Retry queued for ${item.original_filename}.`)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Unable to retry the image processing job.')
    } finally {
      setBusy(false)
    }
  }

  if (auth.loading) return <PageShell activePage="staff"><main id="main-content"><Container><p role="status">Checking sign-in status…</p></Container></main></PageShell>
  if (!auth.user) return <Navigate to="/admin/sign-in" replace state={{ from: location }} />

  return <PageShell activePage="staff">
    <main id="main-content" className="media-admin-page">
      <Container>
        <p className="eyebrow">Media administration</p>
        <h1>Gallery management</h1>
        <p className="admin-identity">Signed in as <strong>{auth.user.email}</strong>. Uploaded images stay private until scanning, processing, and explicit publication are complete.</p>
        {!canManage ? <section className="auth-panel" role="status"><h2>Access not available</h2><p>Your role cannot manage albums or media.</p></section> : <>
          {problem && <p className="media-admin__notice media-admin__notice--error" role="alert">{problem}</p>}
          {message && <p className="media-admin__notice" role="status">{message}</p>}
          {loading ? <p role="status">Loading albums and media…</p> : <>
            <section className="media-admin__panel" aria-labelledby="albums-heading">
              <div className="media-admin__section-heading">
                <div><p className="eyebrow">Collection</p><h2 id="albums-heading">Albums</h2></div>
                <span>{albums.length} {albums.length === 1 ? 'album' : 'albums'}</span>
              </div>
              {albums.length === 0 ? <p className="media-admin__empty">No albums yet. Create a draft album to begin.</p> : (
                <div className="media-admin__album-grid">
                  {albums.map((album) => <article className="media-admin__album" key={album.id}>
                    <div className="media-admin__album-cover">
                      <ManagedAlbumCover key={album.cover?.src ?? album.id} album={album} />
                    </div>
                    <div className="media-admin__album-content">
                      <div className="media-admin__album-status"><span>{statusLabel(album.status)}</span><span>{album.mediaCount ?? 0} items</span></div>
                      <h3>{album.title}</h3>
                      {album.description && <p>{album.description}</p>}
                      <div className="media-admin__album-actions">
                        <Button variant="outline" type="button" disabled={busy} onClick={() => beginEdit(album)}>Edit</Button>
                        <Button variant="secondary" type="button" disabled={busy} onClick={() => setSelectedAlbumId(album.id)}>Upload images</Button>
                        <Button type="button" disabled={busy} onClick={() => void togglePublication(album)}>{album.status === 'published' ? 'Unpublish' : 'Publish'}</Button>
                        <Button variant="outline" type="button" disabled={busy} onClick={() => void removeAlbum(album)}>Delete</Button>
                      </div>
                    </div>
                  </article>)}
                </div>
              )}
            </section>

            <div className="media-admin__workspace">
              <section className="media-admin__panel" aria-labelledby="album-form-title">
                <h2 id="album-form-title" tabIndex={-1}>{editingId ? 'Edit album' : 'Create album'}</h2>
                <form className="media-admin__form" onSubmit={(event) => void saveAlbum(event)}>
                  <label htmlFor="album-title">Title</label>
                  <input id="album-title" required maxLength={200} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} />
                  <label htmlFor="album-slug">URL slug</label>
                  <input id="album-slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={200} value={draft.slug} onChange={(event) => updateDraft('slug', event.target.value)} />
                  <label htmlFor="album-description">Description</label>
                  <textarea id="album-description" rows={4} maxLength={5000} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} />
                  <label htmlFor="album-event">Event</label>
                  <input id="album-event" maxLength={200} value={draft.event_name} onChange={(event) => updateDraft('event_name', event.target.value)} />
                  <label htmlFor="album-category">Category</label>
                  <input id="album-category" maxLength={120} value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} />
                  <label htmlFor="album-date">Event date</label>
                  <input id="album-date" type="date" value={draft.event_date} onChange={(event) => updateDraft('event_date', event.target.value)} />
                  <div className="media-admin__form-actions">
                    <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Create draft'}</Button>
                    {editingId && <Button variant="outline" type="button" onClick={() => { setEditingId(''); setDraft(emptyDraft) }}>Cancel edit</Button>}
                  </div>
                </form>
              </section>

              <section className="media-admin__panel" aria-labelledby="upload-heading">
                <h2 id="upload-heading">Upload images</h2>
                <p>JPEG, PNG, or WebP · maximum {fileSize(uploadLimits.maxFileSizeBytes)} each · {uploadLimits.maxBatchFiles} files / {fileSize(uploadLimits.maxBatchBytes)} per batch · {uploadLimits.maxConcurrentUploads} simultaneous uploads. Originals remain private; only scanned and processed images can be published.</p>
                <form className="media-admin__form" onSubmit={(event) => void startUpload(event)}>
                  <label htmlFor="upload-album">Destination album</label>
                  <select id="upload-album" required value={selectedAlbumId} onChange={(event) => setSelectedAlbumId(event.target.value)}>
                    <option value="">Choose an album</option>
                    {albums.map((album) => <option key={album.id} value={album.id}>{album.title} · {statusLabel(album.status)}</option>)}
                  </select>
                  <label className="media-admin__dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
                    <input id="album-files" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { chooseFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
                    <strong>Choose images or drop them here</strong>
                    <span>Multiple files supported. Uploads run in batches of up to 10.</span>
                  </label>
                  {selectedFiles.length > 0 && <ul className="media-admin__file-list" aria-label="Selected images">
                    {selectedFiles.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><span>{file.name}</span><small>{fileSize(file.size)}</small></li>)}
                  </ul>}
                  {progress.length > 0 && <ul className="media-admin__progress-list" aria-label="Upload progress" aria-live="polite">
                    {progress.map((item) => <li key={item.id}>
                      <span>{item.fileName}</span>
                      <progress value={item.loaded} max={item.total}>{Math.round(item.loaded / item.total * 100)}%</progress>
                      <small>{item.status === 'uploading' ? `${Math.round(item.loaded / item.total * 100)}%` : item.status === 'scanning' ? 'Queued for scanning' : item.error}</small>
                    </li>)}
                  </ul>}
                  <Button type="submit" disabled={busy || selectedFiles.length === 0 || !selectedAlbumId || Boolean(validateFiles(selectedFiles, uploadLimits))}>{busy ? 'Uploading…' : 'Upload selected images'}</Button>
                </form>
              </section>
            </div>

            <section className="media-admin__panel media-admin__uploads" aria-labelledby="upload-status-heading">
              <div className="media-admin__section-heading"><h2 id="upload-status-heading">Upload and processing status</h2><Button variant="outline" type="button" disabled={busy} onClick={() => void loadUploads().catch((error: unknown) => setProblem(error instanceof Error ? error.message : 'Unable to refresh upload status.'))}>Refresh</Button></div>
              {uploads.length === 0 ? <p className="media-admin__empty">No uploads have been submitted.</p> : (
                <div className="media-admin__upload-list">
                  {uploads.map((item) => <article className="media-admin__upload" key={item.id}>
                    <div><strong>{item.original_filename}</strong><span>{fileSize(item.file_size_bytes)} · {statusLabel(item.status)}</span></div>
                    <div className="media-admin__upload-status">
                      <span>Scan: {statusLabel(item.scan_status)}</span>
                      <span>Processing: {statusLabel(item.processing_status)}</span>
                      {item.upload_jobs?.error_code && <span className="auth-error">Issue: {statusLabel(item.upload_jobs.error_code)}</span>}
                    </div>
                    <div className="media-admin__album-actions">
                      {(item.status === 'scan_failed' || item.status === 'processing_failed') && item.upload_jobs?.status === 'dead_letter' && <Button variant="outline" type="button" disabled={busy} onClick={() => void retryFailedMedia(item)}>Retry</Button>}
                      {(item.status === 'approved' || item.status === 'published') && <Button variant="outline" type="button" disabled={busy} onClick={() => void changeMediaStatus(item)}>{item.status === 'published' ? 'Unpublish image' : 'Publish image'}</Button>}
                      {item.status !== 'deleted' && <Button variant="outline" type="button" disabled={busy} onClick={() => void removeMedia(item)}>Delete image</Button>}
                    </div>
                  </article>)}
                </div>
              )}
            </section>
          </>}
        </>}
      </Container>
    </main>
  </PageShell>
}
