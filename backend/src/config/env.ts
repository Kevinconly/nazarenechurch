const port = Number(process.env.PORT ?? 3001)
const allowedOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.')
if (!URL.canParse(allowedOrigin)) throw new Error('FRONTEND_ORIGIN must be a valid URL.')

export const config = { port, allowedOrigin }
