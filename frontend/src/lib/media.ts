const archiveOrigin = 'https://remera-archive.invalid'

/** Reject empty, protocol-relative, and non-HTTP(S) media URLs before rendering. */
export function isSafeMediaSource(source: string | undefined): source is string {
  if (!source?.trim() || source.startsWith('//')) return false

  try {
    const url = new URL(source, archiveOrigin)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function formatAlbumDate(value: string | undefined): string | undefined {
  if (!value) return undefined

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined

  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

export function formatDuration(seconds: number | undefined): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return undefined
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remainder}`
}
