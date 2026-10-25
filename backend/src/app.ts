import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { config } from './config/env.js'
import { healthRouter } from './routes/health.js'

export const app = express()
app.disable('x-powered-by')
app.use(cors({ origin: config.allowedOrigin, methods: ['GET'], optionsSuccessStatus: 204 }))
app.use(express.json({ limit: '16kb' }))
app.use((request, _response, next) => { console.info(`${new Date().toISOString()} ${request.method} ${request.path}`); next() })
app.use('/api/health', healthRouter)
app.use((_request, response) => { response.status(404).json({ error: 'Not found' }) })

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error('Request failed:', error instanceof Error ? error.message : error)
  response.status(500).json({ error: 'Internal server error' })
}
app.use(errorHandler)
