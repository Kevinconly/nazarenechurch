import 'dotenv/config'
import { app, closeSessionStore } from './app.js'
import { config } from './config/env.js'
import { closePool } from './db/pool.js'

if (!config.databaseUrl || !URL.canParse(config.databaseUrl)
  || !['postgres:', 'postgresql:'].includes(new URL(config.databaseUrl).protocol)) {
  throw new Error('DATABASE_URL must be set to a valid PostgreSQL connection URL before starting the API.')
}

const server = app.listen(config.port, () => console.info(`Archive API listening on http://localhost:${config.port}`))
// Bound slow or stalled clients so they cannot hold sockets indefinitely.
server.requestTimeout = 30_000
server.headersTimeout = 20_000
server.keepAliveTimeout = 5_000
server.maxRequestsPerSocket = 1_000

function shutdown(signal: string) {
  console.info(`${signal} received; closing HTTP server.`)
  const forceExit = setTimeout(() => {
    console.error('Graceful shutdown timed out; exiting.')
    process.exit(1)
  }, 10_000)
  forceExit.unref()
  server.close((error) => {
    void closeSessionStore().then(() => closePool()).then(() => {
      clearTimeout(forceExit)
      if (error) { console.error('Server shutdown failed:', error); process.exitCode = 1 }
    }).catch((closeError: unknown) => {
      clearTimeout(forceExit)
      console.error('Database shutdown failed:', closeError)
      process.exitCode = 1
    })
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
