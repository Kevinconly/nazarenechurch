import 'dotenv/config'
import { createInterface } from 'node:readline/promises'
import bcrypt from 'bcryptjs'
import { getPool, closePool } from '../db/pool.js'

async function readHiddenPassword(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run this provisioning command in an interactive terminal so the password can be entered privately.')
  process.stdout.write('Administrator password (12+ characters): ')
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise((resolve, reject) => {
    let password = ''
    const finish = (error?: Error) => {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.off('data', onData)
      process.stdout.write('\n')
      if (error) reject(error)
      else resolve(password)
    }
    const onData = (buffer: Buffer) => {
      for (const char of buffer.toString('utf8')) {
        if (char === '\u0003') return finish(new Error('Cancelled.'))
        if (char === '\r' || char === '\n') return finish()
        if (char === '\u007f' || char === '\b') password = password.slice(0, -1)
        else if ((char.codePointAt(0) ?? 0) >= 32 && !((char.codePointAt(0) ?? 0) >= 127 && (char.codePointAt(0) ?? 0) <= 159)) password += char
      }
    }
    process.stdin.on('data', onData)
  })
}

async function main() {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const email = (await prompt.question('Administrator email: ')).trim()
  prompt.close()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter a valid email address.')
  const password = await readHiddenPassword()
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Password must be at least 12 characters and no more than 72 UTF-8 bytes.')

  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [5815030602])
    const current = await client.query("SELECT 1 FROM users WHERE role = 'Administrator' LIMIT 1")
    if (current.rowCount) throw new Error('An Administrator already exists. Use the admin user-management screen to add accounts.')
    const hash = await bcrypt.hash(password, 12)
    await client.query('INSERT INTO users (email, email_normalized, password_hash, role) VALUES ($1, $2, $3, $4)', [email, email.toLowerCase(), hash, 'Administrator'])
    await client.query('COMMIT')
    console.info(`Initial Administrator provisioned for ${email}.`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

try { await main() }
catch (error) { console.error('Administrator provisioning failed:', error instanceof Error ? error.message : 'Unknown error.'); process.exitCode = 1 }
finally { await closePool() }
