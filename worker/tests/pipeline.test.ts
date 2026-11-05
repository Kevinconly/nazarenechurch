import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { createImageVariants, detectImageMime, ImageValidationError, inspectImage, MAX_IMAGE_PIXELS, MAX_FILE_BYTES } from '../src/pipeline.js'

test('detects supported image signatures and rejects other input', () => {
  assert.equal(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg')
  assert.equal(detectImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
  assert.equal(detectImageMime(Buffer.from('RIFF0000WEBP')), 'image/webp')
  assert.throws(() => detectImageMime(Buffer.from('GIF89a')), ImageValidationError)
})

test('inspects file signatures and generates bounded, metadata-free JPEG variants', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nazarene-pipeline-test-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const source = path.join(directory, 'source.png')
  const sourceBytes = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#83d3eb' } })
    .png()
    .toBuffer()
  await writeFile(source, sourceBytes)

  const inspected = await inspectImage(source)
  assert.equal(inspected.detectedMimeType, 'image/png')
  assert.deepEqual([inspected.width, inspected.height], [900, 600])

  const result = await createImageVariants(source, path.join(directory, 'variants'), 'album-id', 'media-id', 'job-id')
  assert.deepEqual(result.variants.map((variant) => variant.variant_type), ['thumbnail', 'medium', 'large'])
  for (const variant of result.variants) {
    assert.ok(variant.file_size_bytes > 0)
    assert.ok(variant.file_size_bytes <= 25 * 1024 * 1024)
    assert.ok(variant.storage_path.startsWith('album-id/media-id/job-id/'))
    assert.equal((await sharp(await readFile(variant.local_path)).metadata()).format, 'jpeg')
    assert.equal((await sharp(await readFile(variant.local_path)).metadata()).exif, undefined)
  }
})

test('rejects unsupported image signatures and files over the configured size limit', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nazarene-validation-test-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const unsupported = path.join(directory, 'unsupported')
  await writeFile(unsupported, Buffer.from('not-an-image'))
  await assert.rejects(inspectImage(unsupported), ImageValidationError)

  const oversized = path.join(directory, 'oversized')
  await writeFile(oversized, Buffer.alloc(MAX_FILE_BYTES + 1))
  await assert.rejects(inspectImage(oversized), ImageValidationError)
  assert.equal(MAX_IMAGE_PIXELS, 40_000_000)
})
