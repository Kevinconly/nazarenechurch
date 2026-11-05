import type { Album, AlbumStatus } from '../types/album'
import type { MediaItem } from '../types/media'
import { Upload } from 'tus-js-client'
import { getSupabaseAnonKey, getSupabaseClient, getSupabaseUrl, invokeSupabaseFunction } from './supabase'

export type PageResult<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type AlbumDraft = {
  title: string
  slug: string
  description?: string
  event_name?: string
  category?: string
  event_date?: string
}

export type ManagedAlbum = Album & {
  eventName?: string
  category?: string
  eventDate?: string
  deletedAt?: string
}

export type UploadStatus = {
  id: string
  album_id: string
  original_filename: string
  file_size_bytes: number
  status: string
  scan_status: string
  processing_status: string
  created_at: string
  upload_jobs?: { status: string; error_code: string | null; retry_count: number } | null
}
export type UploadLimits = {
  maxFileSizeBytes: number
  maxBatchFiles: number
  maxBatchBytes: number
  maxConcurrentUploads: number
  retentionDays: number
}

type UploadSession = { id: string; path: string }
export type UploadProgress = {
  id: string
  fileName: string
  loaded: number
  total: number
  status: 'uploading' | 'scanning' | 'failed'
  error?: string
}
const MAX_ACTIVE_UPLOADS = 3

export async function listPublishedAlbums(): Promise<readonly Album[]> {
  const page = await invokeSupabaseFunction<PageResult<Album>>('archive/albums?page=1&pageSize=100')
  return page.items
}

export async function getPublishedAlbum(slug: string): Promise<{ album: Album; media: readonly MediaItem[] } | null> {
  try {
    return await invokeSupabaseFunction<{ album: Album; items: MediaItem[] }>(`archive/albums/${encodeURIComponent(slug)}`)
      .then(({ album, items }) => ({ album, media: items }))
  } catch (error) {
    if (error instanceof Error && error.message === 'Published album not found.') return null
    throw error
  }
}

export async function listManagedAlbums(): Promise<readonly ManagedAlbum[]> {
  const result = await invokeSupabaseFunction<{ items: ManagedAlbum[] }>('archive/admin/albums')
  return result.items
}

export async function createAlbum(draft: AlbumDraft): Promise<ManagedAlbum> {
  const result = await invokeSupabaseFunction<{ album: ManagedAlbum }>('archive/admin/albums', 'POST', draft)
  return result.album
}

export async function updateAlbum(id: string, changes: Partial<AlbumDraft> & { status?: AlbumStatus; cover_media_id?: string | null }): Promise<ManagedAlbum> {
  const result = await invokeSupabaseFunction<{ album: ManagedAlbum }>(`archive/admin/albums/${encodeURIComponent(id)}`, 'PATCH', changes)
  return result.album
}

export async function deleteAlbum(id: string): Promise<void> {
  await invokeSupabaseFunction(`archive/admin/albums/${encodeURIComponent(id)}`, 'DELETE', { confirm: true })
}

export async function getUploadStatuses(): Promise<readonly UploadStatus[]> {
  const result = await invokeSupabaseFunction<{ items: UploadStatus[] }>('archive/admin/uploads')
  return result.items
}

export async function getUploadLimits(): Promise<UploadLimits> {
  const result = await invokeSupabaseFunction<{ limits: UploadLimits }>('archive/admin/upload-limits')
  return result.limits
}

export async function uploadImageBatch(
  albumId: string,
  files: readonly File[],
  onProgress: (progress: UploadProgress) => void,
  limits: UploadLimits,
): Promise<void> {
  if (files.length < 1 || files.length > limits.maxBatchFiles) {
    throw new Error(`Choose between 1 and ${limits.maxBatchFiles} images per batch.`)
  }
  const totalSize = files.reduce((total, file) => total + file.size, 0)
  if (files.some((file) => file.size < 1 || file.size > limits.maxFileSizeBytes)
      || totalSize > limits.maxBatchBytes
      || files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
    throw new Error('The image format or file size does not meet the configured upload limits.')
  }
  const client = getSupabaseClient()
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw new Error('Unable to access the authenticated upload session.')
  if (!sessionData.session) throw new Error('Sign in before uploading images.')
  const supabaseUrl = getSupabaseUrl()
  const anonKey = getSupabaseAnonKey()
  let firstError: Error | undefined
  const concurrency = Math.min(MAX_ACTIVE_UPLOADS, limits.maxConcurrentUploads)
  for (let offset = 0; offset < files.length; offset += concurrency) {
    const batch = files.slice(offset, offset + concurrency)
    const { items: sessions } = await invokeSupabaseFunction<{ items: UploadSession[] }>(
      `archive/admin/albums/${encodeURIComponent(albumId)}/uploads`,
      'POST',
      {
        files: batch.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type,
          alt: file.name.replace(/\.[^.]+$/, ''),
        })),
      },
    )
    if (sessions.length !== batch.length) throw new Error('The server did not reserve every image in this upload batch.')
    await Promise.all(sessions.map(async (session, index) => {
      const file = batch[index]
      if (!file) return
      try {
        onProgress({ id: session.id, fileName: file.name, loaded: 0, total: file.size, status: 'uploading' })
        await uploadWithProgress(supabaseUrl, anonKey, sessionData.session.access_token, session.path, file, (loaded, total) => {
          onProgress({ id: session.id, fileName: file.name, loaded, total, status: 'uploading' })
        })
        await invokeSupabaseFunction(`archive/admin/media/${encodeURIComponent(session.id)}/complete`, 'POST')
        onProgress({ id: session.id, fileName: file.name, loaded: file.size, total: file.size, status: 'scanning' })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Image upload failed.'
        onProgress({ id: session.id, fileName: file.name, loaded: 0, total: file.size, status: 'failed', error: message })
        firstError ??= error instanceof Error ? error : new Error('Image upload failed.')
        try {
          await deleteMedia(session.id)
        } catch (cleanupError) {
          firstError ??= cleanupError instanceof Error ? cleanupError : new Error('Unable to cancel the failed upload reservation.')
        }
      }
    }))
  }
  if (firstError) throw firstError
}

function uploadWithProgress(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  path: string,
  file: File,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      chunkSize: 6 * 1024 * 1024,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: 'media-quarantine',
        objectName: path,
        contentType: file.type,
        cacheControl: '3600',
      },
      onError: () => reject(new Error('Resumable image upload failed. Retry the upload or choose the file again.')),
      onProgress,
      onSuccess: () => resolve(),
    })
    void upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]!)
      upload.start()
    }).catch(() => reject(new Error('Unable to resume the image upload.')))
  })
}

export async function updateMediaStatus(id: string, status: 'published' | 'approved') {
  await invokeSupabaseFunction(`archive/admin/media/${encodeURIComponent(id)}`, 'PATCH', { status })
}

export async function deleteMedia(id: string) {
  await invokeSupabaseFunction(`archive/admin/media/${encodeURIComponent(id)}`, 'DELETE', { confirm: true })
}

export async function retryMedia(id: string) {
  await invokeSupabaseFunction(`archive/admin/media/${encodeURIComponent(id)}/retry`, 'POST')
}
