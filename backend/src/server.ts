import 'dotenv/config'
import { app } from './app.js'
import { config } from './config/env.js'

const server = app.listen(config.port, () => console.info(`Archive API listening on http://localhost:${config.port}`))

function shutdown(signal: string) {
  console.info(`${signal} received; closing HTTP server.`)
  server.close((error) => {
    if (error) { console.error('Server shutdown failed:', error); process.exitCode = 1 }
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
