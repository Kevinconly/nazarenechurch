import 'dotenv/config'
import { app } from './app.js'
import { config } from './config/env.js'
import { closePool } from './db/pool.js'

if (!config.databaseUrl || !URL.canParse(config.databaseUrl)
  || !['postgres:', 'postgresql:'].includes(new URL(config.databaseUrl).protocol)) {
  throw new Error('DATABASE_URL must be set to a valid PostgreSQL connection URL before starting the API.')
}

const server = app.listen(config.port, () => console.info(`Archive API listening on http://localhost:${config.port}`))

function shutdown(signal: string) {
  console.info(`${signal} received; closing HTTP server.`)
  server.close((error) => {
    void closePool().then(() => {
      if (error) { console.error('Server shutdown failed:', error); process.exitCode = 1 }
    }).catch((closeError: unknown) => {
      console.error('Database shutdown failed:', closeError)
      process.exitCode = 1
    })
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
