import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { config } from './config/env.js'
import { healthRouter } from './routes/health.js'
import { createAlbumsRouter } from './routes/albums.js'
import { PostgresArchiveRepository } from './db/archiveRepository.js'
import type { ArchiveRepository } from './types/archive.js'
import { HttpError } from './lib/httpError.js'

export function createApp(repository: ArchiveRepository = new PostgresArchiveRepository()) {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: config.allowedOrigin, methods: ['GET'], optionsSuccessStatus: 204 }))
  app.use((request, _response, next) => { console.info(`${new Date().toISOString()} ${request.method} ${request.path}`); next() })
  app.use('/api/health', healthRouter)
  app.use('/api/albums', createAlbumsRouter(repository))
  app.use((_request, response) => { response.status(404).json({ error: 'Not found', status: 404 }) })

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: error.message, status: error.status })
      return
    }
    if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ error: 'Request body contains invalid JSON.', status: 400 })
      return
    }
    console.error('Request failed:', error instanceof Error ? error.message : error)
    response.status(500).json({ error: 'Internal server error', status: 500 })
  }
  app.use(errorHandler)
  return app
}

export const app = createApp()
