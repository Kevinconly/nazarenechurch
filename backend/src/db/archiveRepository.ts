import type { Pool } from 'pg'
import type { AlbumRecord, ArchiveRepository, MediaRecord, PageResult } from '../types/archive.js'
import { getPool } from './pool.js'

type CountRow = { total: string }

function paged<T>(items: T[], total: number, page: number, pageSize: number): PageResult<T> {
  return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
}

export class PostgresArchiveRepository implements ArchiveRepository {
  constructor(private readonly configuredPool?: Pool) {}

  private get pool(): Pool { return this.configuredPool ?? getPool() }

  async listPublishedAlbums(page: number, pageSize: number): Promise<PageResult<AlbumRecord>> {
    const offset = (page - 1) * pageSize
    const [rows, counts] = await Promise.all([
      this.pool.query<AlbumRecord>(`
        SELECT a.id, a.slug, a.title, a.description, a.event_name AS "eventName",
          a.category, a.event_date::text AS "eventDate", a.published_at AS "publishedAt",
          a.cover_url AS "coverUrl",
          CASE WHEN count(m.id) FILTER (WHERE m.status = 'published' AND m.type = 'photo') > 0
            AND count(m.id) FILTER (WHERE m.status = 'published' AND m.type = 'video') > 0 THEN 'mixed'
            WHEN count(m.id) FILTER (WHERE m.status = 'published' AND m.type = 'video') > 0 THEN 'video'
            ELSE 'photo' END AS "mediaType",
          count(m.id) FILTER (WHERE m.status = 'published')::int AS "mediaCount"
        FROM albums a LEFT JOIN media m ON m.album_id = a.id
        WHERE a.status = 'published'
        GROUP BY a.id ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
        LIMIT $1 OFFSET $2`, [pageSize, offset]),
      this.pool.query<CountRow>("SELECT count(*)::text AS total FROM albums WHERE status = 'published'")
    ])
    return paged(rows.rows, Number(counts.rows[0]?.total ?? 0), page, pageSize)
  }

  async listPublishedMedia(albumSlug: string, page: number, pageSize: number): Promise<PageResult<MediaRecord> | null> {
    const album = await this.pool.query<{ id: string }>("SELECT id FROM albums WHERE slug = $1 AND status = 'published'", [albumSlug])
    if (!album.rows[0]) return null
    const albumId = album.rows[0].id
    const offset = (page - 1) * pageSize
    const [rows, counts] = await Promise.all([
      this.pool.query<MediaRecord>(`
        SELECT id, album_id AS "albumId", type, url, thumbnail_url AS "thumbnailUrl", alt,
          caption, width, height, duration_seconds AS "durationSeconds"
        FROM media WHERE album_id = $1 AND status = 'published'
        ORDER BY created_at, id LIMIT $2 OFFSET $3`, [albumId, pageSize, offset]),
      this.pool.query<CountRow>("SELECT count(*)::text AS total FROM media WHERE album_id = $1 AND status = 'published'", [albumId])
    ])
    return paged(rows.rows, Number(counts.rows[0]?.total ?? 0), page, pageSize)
  }
}
