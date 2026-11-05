import { createReadStream } from 'node:fs'
import net from 'node:net'
import { MalwareDetectedError } from './pipeline.js'

export async function scanWithClamAv(
  filePath: string,
  host: string,
  port: number,
  timeoutMs = 30_000,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    let response = ''
    let finished = false
    let stream: ReturnType<typeof createReadStream> | undefined
    let timer: NodeJS.Timeout | undefined
    const finish = (error?: Error) => {
      if (finished) return
      finished = true
      if (timer) clearTimeout(timer)
      stream?.destroy()
      socket.destroy()
      if (error) reject(error)
      else resolve()
    }
    timer = setTimeout(() => finish(new Error('ClamAV scan timed out.')), timeoutMs)
    socket.setTimeout(timeoutMs)
    socket.on('timeout', () => finish(new Error('ClamAV scan timed out.')))
    socket.on('error', () => finish(new Error('ClamAV is unavailable.')))
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8')
      if (response.length > 4096) {
        finish(new Error('ClamAV returned an invalid scan response.'))
        return
      }
      if (response.includes('FOUND')) {
        finish(new MalwareDetectedError('ClamAV detected malware.'))
      } else if (response.includes('OK')) {
        finish()
      } else if (response.includes('ERROR')) {
        finish(new Error('ClamAV could not scan the quarantined file.'))
      }
    })
    socket.on('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0', 'utf8'))
      stream = createReadStream(filePath, { highWaterMark: 64 * 1024 })
      stream.on('data', (chunk: Buffer) => {
        const length = Buffer.allocUnsafe(4)
        length.writeUInt32BE(chunk.length, 0)
        if (!socket.write(Buffer.concat([length, chunk]))) {
          stream?.pause()
          socket.once('drain', () => stream?.resume())
        }
      })
      stream.on('end', () => {
        const endOfStream = Buffer.alloc(4)
        socket.end(endOfStream)
      })
      stream.on('error', () => {
        finish(new Error('Unable to read the quarantined file for scanning.'))
      })
    })
    socket.on('close', () => {
      if (!finished) {
        finish(response.includes('OK') ? undefined : new Error('ClamAV closed the scan without a result.'))
      }
    })
  })
}
