import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { scanWithClamAv } from '../src/clamav.js'
import { MalwareDetectedError } from '../src/pipeline.js'

async function scannerReply(reply: string) {
  const server = net.createServer((socket) => {
    let data = Buffer.alloc(0)
    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk])
      if (data.length >= 13 && data.subarray(-4).equals(Buffer.alloc(4))) {
        socket.end(`stream: ${reply}\0`)
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  return { server, port: address.port }
}

test('accepts a clean ClamAV response and rejects malware detections', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nazarene-clamav-test-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'sample')
  await writeFile(file, Buffer.from('bounded scanner fixture'))

  const cleanScanner = await scannerReply('OK')
  context.after(() => new Promise<void>((resolve) => cleanScanner.server.close(() => resolve())))
  await scanWithClamAv(file, '127.0.0.1', cleanScanner.port, 1000)

  const infectedScanner = await scannerReply('Eicar-Test-Signature FOUND')
  context.after(() => new Promise<void>((resolve) => infectedScanner.server.close(() => resolve())))
  await assert.rejects(
    scanWithClamAv(file, '127.0.0.1', infectedScanner.port, 1000),
    MalwareDetectedError,
  )
})

test('fails closed when the scanner is unavailable', async () => {
  const server = net.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const port = address.port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await assert.rejects(
    scanWithClamAv(path.join(os.tmpdir(), 'missing-upload-fixture'), '127.0.0.1', port, 1000),
    /ClamAV is unavailable/,
  )
})
