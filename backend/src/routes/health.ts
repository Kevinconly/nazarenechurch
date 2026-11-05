import { Router } from 'express'
import { getPool } from '../db/pool.js'

export const healthRouter = Router()

healthRouter.get('/', (_request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.json({ status: 'ok', service: 'remera-archive-api' })
})

healthRouter.get('/ready', async (_request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  try {
    await getPool().query('SELECT 1')
    response.json({ status: 'ready' })
  } catch {
    response.status(503).json({ status: 'unavailable' })
  }
})
