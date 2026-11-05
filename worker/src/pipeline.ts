import { createHash } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import sharp, { type Metadata } from 'sharp'

export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 40_000_000
export const MAX_IMAGE_DIMENSION = 10_000
export const MAX_VARIANT_BYTES = 25 * 1024 * 1024

export type PipelineLimits = {
  maxUploadBytes: number
  maxImagePixels: number
  maxImageDimension: number
  maxVariantBytes: number
}

export const DEFAULT_PIPELINE_LIMITS: PipelineLimits = {
  maxUploadBytes: MAX_FILE_BYTES,
  maxImagePixels: MAX_IMAGE_PIXELS,
  maxImageDimension: MAX_IMAGE_DIMENSION,
  maxVariantBytes: MAX_VARIANT_BYTES,
}

export type AcceptedMime = 'image/jpeg' | 'image/png' | 'image/webp'
export type VariantType = 'thumbnail' | 'medium' | 'large'
export type ProcessedVariant = {
  variant_type: VariantType
  storage_path: string
  width: number
  height: number
  file_size_bytes: number
  checksum_sha256: string
  local_path: string
}

export class ImageValidationError extends Error {}
export class MalwareDetectedError extends Error {}

sharp.concurrency(1)

const signatureMime = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const

export function detectImageMime(header: Uint8Array): AcceptedMime {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return signatureMime.jpeg
  }
  if (header.length >= 8
      && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
      && header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a) {
    return signatureMime.png
  }
  if (header.length >= 12
      && header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46
      && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50) {
    return signatureMime.webp
  }
  throw new ImageValidationError('The uploaded data is not a supported image format.')
}

export async function inspectImage(filePath: string, limits = DEFAULT_PIPELINE_LIMITS) {
  const stat = await fs.stat(filePath)
  if (stat.size < 1 || stat.size > limits.maxUploadBytes) {
    throw new ImageValidationError('The uploaded file exceeds the configured size limit.')
  }
  const handle = await fs.open(filePath, 'r')
  const header = Buffer.alloc(12)
  try {
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    const detectedMimeType = detectImageMime(header.subarray(0, bytesRead))
    let metadata: Metadata
    try {
      metadata = await sharp(filePath, {
        failOn: 'error',
        limitInputPixels: limits.maxImagePixels,
        sequentialRead: true,
      }).metadata()
    } catch {
      throw new ImageValidationError('The uploaded data could not be decoded as a supported image.')
    }
    const expectedFormat = {
      'image/jpeg': 'jpeg',
      'image/png': 'png',
      'image/webp': 'webp',
    }[detectedMimeType]
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height) {
      throw new ImageValidationError('The image signature and decoded format do not match.')
    }
    if (metadata.pages !== undefined && metadata.pages !== 1) {
      throw new ImageValidationError('Animated or multi-page images are not accepted.')
    }
    const swapsOrientation = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8
    const width = swapsOrientation ? metadata.height : metadata.width
    const height = swapsOrientation ? metadata.width : metadata.height
    if (width > limits.maxImageDimension || height > limits.maxImageDimension
        || metadata.width * metadata.height > limits.maxImagePixels) {
      throw new ImageValidationError('Image dimensions exceed the configured limit.')
    }
    return {
      detectedMimeType,
      width,
      height,
      fileSize: stat.size,
    }
  } finally {
    await handle.close()
  }
}

export async function checksumFile(filePath: string): Promise<string> {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) digest.update(chunk)
  return digest.digest('hex')
}

export async function createImageVariants(
  inputPath: string,
  outputDirectory: string,
  albumId: string,
  mediaId: string,
  jobId: string,
  limits = DEFAULT_PIPELINE_LIMITS,
): Promise<{ width: number; height: number; variants: ProcessedVariant[] }> {
  const input = await inspectImage(inputPath, limits)
  await fs.mkdir(outputDirectory, { recursive: true, mode: 0o700 })
  const targets: Array<{ type: VariantType; edge: number; quality: number }> = [
    { type: 'thumbnail', edge: 480, quality: 82 },
    { type: 'medium', edge: 1600, quality: 85 },
    { type: 'large', edge: 3000, quality: 88 },
  ]
  const variants: ProcessedVariant[] = []
  for (const target of targets) {
    const outputPath = path.join(outputDirectory, `${target.type}.jpg`)
    const result = await sharp(inputPath, {
      failOn: 'error',
      limitInputPixels: limits.maxImagePixels,
      sequentialRead: true,
    })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: target.edge, height: target.edge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: target.quality, mozjpeg: true })
      .toFile(outputPath)
    if (result.size < 1 || result.size > limits.maxVariantBytes) {
      throw new ImageValidationError('A processed image variant exceeds the output-size limit.')
    }
    variants.push({
      variant_type: target.type,
      storage_path: `${albumId}/${mediaId}/${jobId}/${target.type}.jpg`,
      width: result.width,
      height: result.height,
      file_size_bytes: result.size,
      checksum_sha256: await checksumFile(outputPath),
      local_path: outputPath,
    })
  }
  return { width: input.width, height: input.height, variants }
}
