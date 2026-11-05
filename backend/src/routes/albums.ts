import { Router } from 'express'
import type { ArchiveRepository } from '../types/archive.js'
import { HttpError } from '../lib/httpError.js'
import { parsePagination } from '../lib/pagination.js'
import { rejectUnknownQuery } from '../lib/query.js'

const publicQueryParameters = ['page', 'pageSize'] as const

export function createAlbumsRouter(repository: ArchiveRepository) {
  const router = Router()

  router.get('/', async (request, response) => {
    rejectUnknownQuery(request.query, publicQueryParameters)
    const { page, pageSize } = parsePagination(request.query)
    response.json(await repository.listPublishedAlbums(page, pageSize))
  })

  router.get('/:slug/media', async (request, response) => {
    const slug = request.params.slug
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new HttpError(400, 'Album slug is invalid.')
    rejectUnknownQuery(request.query, publicQueryParameters)
    const { page, pageSize } = parsePagination(request.query)
    const result = await repository.listPublishedMedia(slug, page, pageSize)
    if (!result) throw new HttpError(404, 'Published album not found.')
    response.json(result)
  })

  return router
}
