import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createClient } from '@supabase/supabase-js'
import { scanWithClamAv } from './clamav.js'
import { checksumFile, ImageValidationError, MalwareDetectedError, createImageVariants, inspectImage, type PipelineLimits, type ProcessedVariant } from './pipeline.js'

type MediaJob = {
  job: { id: string; media_id: string; retry_count: number }
  media: {
    id: string
    album_id: string
    quarantine_path: string
    file_size_bytes: number
    declared_mime_type: string
  }
}

type PurgeClaim = {
  id: string
  quarantine_path: string
  variant_paths: string[]
}
type WorkerSettings = PipelineLimits & {
  quarantineRetentionDays: number
  maxConcurrentUploads: number
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required worker configuration: ${name}`)
  return value
}

const supabase = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})
const clamAvHost = requiredEnv('CLAMAV_HOST')
const clamAvPort = Number(process.env.CLAMAV_PORT ?? 3310)
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 1)

if (!Number.isInteger(clamAvPort) || clamAvPort < 1 || clamAvPort > 65535) throw new Error('CLAMAV_PORT must be a valid TCP port.')
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) throw new Error('WORKER_CONCURRENCY must be between 1 and 3.')

async function loadSettings(): Promise<WorkerSettings> {
  const { data, error } = await supabase.from('media_settings')
    .select('max_upload_bytes,max_image_pixels,max_image_dimension,max_variant_bytes,quarantine_retention_days,max_concurrent_uploads')
    .eq('singleton', true)
    .single()
  if (error || !data) throw new Error('Unable to load media worker limits.')
  const settings = {
    maxUploadBytes: Number(data.max_upload_bytes),
    maxImagePixels: Number(data.max_image_pixels),
    maxImageDimension: Number(data.max_image_dimension),
    maxVariantBytes: Number(data.max_variant_bytes),
    quarantineRetentionDays: Number(data.quarantine_retention_days),
    maxConcurrentUploads: Number(data.max_concurrent_uploads),
  }
  if (Object.values(settings).some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error('The configured media worker limits are invalid.')
  }
  return settings
}

async function downloadToFile(url: string, destination: string, expectedBytes: number, maxUploadBytes: number): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok || !response.body) throw new Error('Unable to retrieve the private quarantined object.')
  const declaredLength = Number(response.headers.get('content-length'))
  if (expectedBytes > maxUploadBytes || declaredLength > maxUploadBytes || (declaredLength && declaredLength !== expectedBytes)) {
    throw new ImageValidationError('Quarantined object size does not match the authorized upload.')
  }
  let received = 0
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length
      if (received > maxUploadBytes || received > expectedBytes) {
        callback(new ImageValidationError('The quarantined object exceeds its authorized size.'))
        return
      }
      callback(null, chunk)
    },
    flush(callback) {
      if (received !== expectedBytes) callback(new ImageValidationError('The quarantined object is truncated.'))
      else callback()
    },
  })
  await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), limiter, createWriteStream(destination, { flags: 'wx', mode: 0o600 }))
}

async function processJob(job: MediaJob, settings: WorkerSettings): Promise<void> {
  const workDirectory = await mkdtemp(path.join(os.tmpdir(), 'nazarene-media-'))
  const inputPath = path.join(workDirectory, 'quarantined-upload')
  try {
    const { data: signed, error: signedError } = await supabase.storage
      .from('media-quarantine')
      .createSignedUrl(job.media.quarantine_path, 300)
    if (signedError || !signed?.signedUrl) throw new Error('Unable to create a private worker download URL.')
    await downloadToFile(signed.signedUrl, inputPath, job.media.file_size_bytes, settings.maxUploadBytes)
    const inspected = await inspectImage(inputPath, settings)
    if (inspected.detectedMimeType !== job.media.declared_mime_type) {
      throw new ImageValidationError('The detected image format does not match the declared format.')
    }
    const sourceChecksum = await checksumFile(inputPath)
    await scanWithClamAv(inputPath, clamAvHost, clamAvPort)
    const { error: processingStartError } = await supabase.rpc('begin_upload_processing', { p_job_id: job.job.id })
    if (processingStartError) throw new Error('Unable to record successful malware scanning.')

    const { variants, width, height } = await createImageVariants(
      inputPath,
      path.join(workDirectory, 'processed'),
      job.media.album_id,
      job.media.id,
      job.job.id,
      settings,
    )
    await uploadVariants(variants)
    const { error } = await supabase.rpc('complete_upload_job', {
      p_job_id: job.job.id,
      p_checksum_sha256: sourceChecksum,
      p_detected_mime_type: inspected.detectedMimeType,
      p_width: width,
      p_height: height,
      p_variants: variants.map(({ local_path: _localPath, ...variant }) => variant),
    })
    if (error) throw new Error('Unable to record completed image processing.')
  } finally {
    await rm(workDirectory, { recursive: true, force: true })
  }
}

async function uploadVariants(variants: readonly ProcessedVariant[]) {
  for (const variant of variants) {
    const { error } = await supabase.storage
      .from('media-processed')
      .upload(variant.storage_path, await readFile(variant.local_path), {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '31536000',
      })
    if (error) throw new Error('Unable to store a processed image variant.')
  }
}

async function recordFailure(job: MediaJob, error: unknown) {
  const errorCode = error instanceof MalwareDetectedError
    ? 'virus_detected'
    : error instanceof ImageValidationError
      ? 'invalid_image'
      : error instanceof Error && error.message.includes('ClamAV')
        ? 'scan_unavailable'
        : error instanceof Error && error.message.includes('scan')
          ? 'scan_failed'
          : 'processing_failed'
  const retry = errorCode !== 'virus_detected' && errorCode !== 'invalid_image'
  const { error: recordError } = await supabase.rpc('fail_upload_job', {
    p_job_id: job.job.id,
    p_error_code: errorCode,
    p_retry: retry,
  })
  if (recordError) throw new Error('Unable to record the failed media job.')
  console.warn(JSON.stringify({ event: 'media_job_failed', jobId: job.job.id, errorCode }))
}

async function processNext(): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_upload_job')
  if (error) throw new Error('Unable to claim a media processing job.')
  if (!data) return false
  const job = data as MediaJob
  try {
    await processJob(job, await loadSettings())
  } catch (error) {
    await recordFailure(job, error)
  }
  return true
}

async function purgeOldQuarantineFiles(retentionDays: number) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
  const { data: media, error } = await supabase.from('media')
    .select('id,quarantine_path')
    .in('status', ['approved', 'published'])
    .is('quarantine_purged_at', null)
    .lt('created_at', cutoff)
    .limit(100)
  if (error) throw new Error('Unable to find completed uploads for quarantine cleanup.')
  for (const item of media ?? []) {
    const { error: removeError } = await supabase.storage.from('media-quarantine').remove([item.quarantine_path])
    if (removeError) {
      console.warn(JSON.stringify({ event: 'media_quarantine_purge_deferred', mediaId: item.id }))
      continue
    }
    const { error: updateError } = await supabase.from('media')
      .update({ quarantine_purged_at: new Date().toISOString() })
      .eq('id', item.id)
    if (updateError) console.warn(JSON.stringify({ event: 'media_quarantine_purge_marker_failed', mediaId: item.id }))
  }
}

async function purgeTerminalMedia() {
  while (true) {
    const { data, error } = await supabase.rpc('claim_media_purge')
    if (error) throw new Error('Unable to claim expired media for cleanup.')
    if (!data) return
    const claim = data as PurgeClaim
    if (!claim.id || !claim.quarantine_path || !Array.isArray(claim.variant_paths)
        || claim.variant_paths.some((storagePath) => typeof storagePath !== 'string')) {
      throw new Error('The media cleanup claim has an invalid shape.')
    }
    const { error: quarantineError } = await supabase.storage.from('media-quarantine').remove([claim.quarantine_path])
    if (quarantineError) {
      console.warn(JSON.stringify({ event: 'media_purge_deferred', mediaId: claim.id, bucket: 'quarantine' }))
      return
    }
    if (claim.variant_paths.length > 0) {
      const { error: variantsError } = await supabase.storage.from('media-processed').remove(claim.variant_paths)
      if (variantsError) {
        console.warn(JSON.stringify({ event: 'media_purge_deferred', mediaId: claim.id, bucket: 'processed' }))
        return
      }
    }
    const { error: completeError } = await supabase.rpc('complete_media_purge', { p_media_id: claim.id })
    if (completeError) throw new Error('Unable to finalize expired media cleanup.')
    console.info(JSON.stringify({ event: 'media_purged', mediaId: claim.id }))
  }
}

async function cleanup(signal: AbortSignal) {
  while (!signal.aborted) {
    try {
      const settings = await loadSettings()
      await purgeOldQuarantineFiles(settings.quarantineRetentionDays)
      await purgeTerminalMedia()
    } catch (error) {
      console.error(JSON.stringify({
        event: 'media_cleanup_failed',
        reason: error instanceof Error ? error.message : 'unknown',
      }))
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, 60 * 60 * 1000)
      function done() {
        clearTimeout(timer)
        signal.removeEventListener('abort', done)
        resolve()
      }
      if (signal.aborted) {
        done()
        return
      }
      signal.addEventListener('abort', done, { once: true })
    })
  }
}

async function poll(signal: AbortSignal) {
  while (!signal.aborted) {
    const claimed = await processNext()
    if (!claimed) await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

const controller = new AbortController()
process.on('SIGTERM', () => controller.abort())
process.on('SIGINT', () => controller.abort())
const startupSettings = await loadSettings()
if (concurrency > startupSettings.maxConcurrentUploads) {
  throw new Error('WORKER_CONCURRENCY must not exceed the configured upload concurrency limit.')
}
console.info(JSON.stringify({ event: 'media_worker_started', concurrency }))
await Promise.all([
  ...Array.from({ length: concurrency }, () => poll(controller.signal)),
  cleanup(controller.signal),
])
