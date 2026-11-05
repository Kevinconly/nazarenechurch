import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import session from 'express-session'
import bcrypt from 'bcryptjs'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import type { User, UserRepository } from '../src/auth/userRepository.js'
import type { Role } from '../src/auth/roles.js'
import type { ArchiveRepository } from '../src/types/archive.js'

type Stored = User & { passwordHash: string }
const now = new Date().toISOString()
const disabledForTest = new Set<string>()
const testPassword = randomBytes(24).toString('base64url')
const newAccountPassword = randomBytes(24).toString('base64url')
const testSessionSecret = randomBytes(32).toString('base64url')
const adminHash = await bcrypt.hash(testPassword, 4)
const adminId = randomUUID()
const editorId = randomUUID()
const contributorId = randomUUID()
const disabledId = randomUUID()
const baseUsers: Stored[] = [
  { id: adminId, email: 'admin@example.test', role: 'Administrator', active: true, createdAt: now, passwordHash: adminHash },
  { id: editorId, email: 'editor@example.test', role: 'Editor', active: true, createdAt: now, passwordHash: adminHash },
  { id: contributorId, email: 'contributor@example.test', role: 'Contributor', active: true, createdAt: now, passwordHash: adminHash },
  { id: disabledId, email: 'disabled@example.test', role: 'Editor', active: false, createdAt: now, passwordHash: adminHash },
]
const emptyArchive: ArchiveRepository = {
  async listPublishedAlbums(page, pageSize) { return { items: [], page, pageSize, total: 0, totalPages: 0 } },
  async listPublishedMedia() { return null },
}

// PostgreSQL casts text to UUID for comparisons, so IDs match regardless of hex case.
function sameId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function makeUsers(): UserRepository {
  const records = structuredClone(baseUsers)
  return {
    async findByEmail(email) { const user = records.find((item) => item.email.toLowerCase() === email.toLowerCase()); return user ? { ...user } : null },
    async findActiveById(id) { const user = records.find((item) => sameId(item.id, id) && item.active && !disabledForTest.has(item.id)); return user ? { id: user.id, email: user.email, role: user.role, active: user.active, createdAt: user.createdAt } : null },
    async list() { return records.map(({ passwordHash: _hash, ...user }) => user) },
    async create(email, passwordHash, role) { const user = { id: randomUUID(), email, role, active: true, createdAt: now, passwordHash }; records.push(user); const { passwordHash: _hash, ...safe } = user; return safe },
    async update(id, values) { const user = records.find((item) => sameId(item.id, id)); if (!user) return null; if (values.role) user.role = values.role; if (values.active !== undefined) user.active = values.active; const { passwordHash: _hash, ...safe } = user; return safe },
  } as unknown as UserRepository
}

class ExpiringStore extends session.Store {
  private readonly sessions = new Map<string, session.SessionData>()
  private expired = false
  override get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void) {
    callback(null, this.expired ? null : this.sessions.get(sid) ?? null)
  }
  override set(sid: string, value: session.SessionData, callback?: (err?: unknown) => void) {
    this.sessions.set(sid, value)
    callback?.()
  }
  override destroy(sid: string, callback?: (err?: unknown) => void) {
    this.sessions.delete(sid)
    callback?.()
  }
  override touch(sid: string, value: session.SessionData, callback?: () => void) {
    this.sessions.set(sid, value)
    callback?.()
  }
  expireAll() { this.expired = true }
}

async function withApi(run: (base: string) => Promise<void>, sessionStore: session.Store = new session.MemoryStore()) {
  const app = createApp(emptyArchive, { users: makeUsers(), sessionStore, sessionSecret: testSessionSecret, cookieSecure: false })
  const server = createServer(app)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  try { await run(`http://127.0.0.1:${address.port}`) } finally { server.close(); await once(server, 'close') }
}

function cookie(response: Response): string {
  const raw = response.headers.get('set-cookie')
  assert.ok(raw, 'expected a session cookie')
  return raw.split(';', 1)[0]!
}

async function signIn(base: string, email = 'admin@example.test') {
  const csrfResponse = await fetch(`${base}/api/auth/csrf`)
  const csrfCookie = cookie(csrfResponse)
  const { csrfToken } = await csrfResponse.json() as { csrfToken: string }
  const response = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { cookie: csrfCookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email, password: testPassword }) })
  return { response, csrfCookie, csrfToken }
}

async function signedIn(base: string, email = 'admin@example.test') {
  const { response } = await signIn(base, email)
  assert.equal(response.status, 200)
  const { user, csrfToken } = await response.json() as { user: User; csrfToken: string }
  return {
    user,
    headers: { cookie: cookie(response), 'content-type': 'application/json', 'x-csrf-token': csrfToken },
  }
}

test('valid credentials establish an HTTP-only session without exposing password hashes', async () => {
  await withApi(async (base) => {
    const { response } = await signIn(base)
    assert.equal(response.status, 200)
    const setCookie = response.headers.get('set-cookie')!
    assert.match(setCookie, /HttpOnly/i)
    assert.match(setCookie, /SameSite=Lax/i)
    assert.match(setCookie, /Expires=/i)
    const cookieValue = cookie(response)
    const payload = await response.json() as { user: User; csrfToken: string }
    assert.equal(payload.user.role, 'Administrator')
    assert.equal('passwordHash' in payload.user, false)
    const me = await fetch(`${base}/api/auth/me`, { headers: { cookie: cookieValue } })
    assert.equal(me.status, 200)
  })
})

test('sign-in validates inputs, requires CSRF, and returns generic invalid credentials', async () => {
  await withApi(async (base) => {
    const csrf = await fetch(`${base}/api/auth/csrf`)
    const { csrfToken } = await csrf.json() as { csrfToken: string }
    const noCsrf = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { cookie: cookie(csrf), 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', password: 'bad' }) })
    assert.equal(noCsrf.status, 403)
    const malformed = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { cookie: cookie(csrf), 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email: 'not-an-email', password: 'x' }) })
    assert.equal(malformed.status, 400)
    const extraFields = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { cookie: cookie(csrf), 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email: 'admin@example.test', password: testPassword, role: 'Administrator' }) })
    assert.equal(extraFields.status, 400)
    const oversized = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { cookie: cookie(csrf), 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email: 'admin@example.test', password: 'x'.repeat(17_000) }) })
    assert.equal(oversized.status, 413)
    const invalid = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { cookie: cookie(csrf), 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email: 'unknown@example.test', password: testPassword }) })
    assert.equal(invalid.status, 401)
    assert.deepEqual(await invalid.json(), { error: 'Invalid email or password.', status: 401 })
    const disabled = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { cookie: cookie(csrf), 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email: 'disabled@example.test', password: testPassword }) })
    assert.equal(disabled.status, 401)
  })
})

test('public album content stays public while protected operations require authentication', async () => {
  await withApi(async (base) => {
    const publicAlbums = await fetch(`${base}/api/albums`)
    assert.equal(publicAlbums.status, 200)
    const me = await fetch(`${base}/api/auth/me`)
    assert.equal(me.status, 401)
    const users = await fetch(`${base}/api/admin/users`)
    assert.equal(users.status, 401)
    const invalidCookie = await fetch(`${base}/api/auth/me`, { headers: { cookie: 'remera.sid=invalid-session-signature' } })
    assert.equal(invalidCookie.status, 401)
  })
})

test('all roles can sign in, but user administration is Administrator-only', async () => {
  await withApi(async (base) => {
    for (const [email, role] of [['editor@example.test', 'Editor'], ['contributor@example.test', 'Contributor']] as const) {
      const { response } = await signIn(base, email)
      assert.equal(response.status, 200)
      const { user } = await response.json() as { user: User }
      assert.equal(user.role, role as Role)
      const access = await fetch(`${base}/api/admin/users`, { headers: { cookie: cookie(response) } })
      assert.equal(access.status, 403)
    }
    const { response } = await signIn(base)
    const csrfToken = (await response.clone().json() as { csrfToken: string }).csrfToken
    const ownId = (await response.json() as { user: User }).user.id
    const selfChange = await fetch(`${base}/api/admin/users/${ownId}`, { method: 'PATCH', headers: { cookie: cookie(response), 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ role: 'Contributor' }) })
    assert.equal(selfChange.status, 400)
  })
})

test('sign-out invalidates the session and old session cookies cannot be reused', async () => {
  await withApi(async (base) => {
    const { response } = await signIn(base)
    const sessionCookie = cookie(response)
    const { csrfToken } = await response.json() as { csrfToken: string }
    const signOut = await fetch(`${base}/api/auth/sign-out`, { method: 'POST', headers: { cookie: sessionCookie, 'x-csrf-token': csrfToken } })
    assert.equal(signOut.status, 204)
    const me = await fetch(`${base}/api/auth/me`, { headers: { cookie: sessionCookie } })
    assert.equal(me.status, 401)
  })
})

test('disabled accounts lose an already established session on the next protected request', async () => {
  await withApi(async (base) => {
    const { response } = await signIn(base, 'editor@example.test')
    const sessionCookie = cookie(response)
    disabledForTest.add(editorId)
    try {
      const me = await fetch(`${base}/api/auth/me`, { headers: { cookie: sessionCookie } })
      assert.equal(me.status, 401)
    } finally { disabledForTest.clear() }
  })
})

test('Administrator can create a role-assigned account without disclosing its password hash', async () => {
  await withApi(async (base) => {
    const { response } = await signIn(base)
    const sessionCookie = cookie(response)
    const { csrfToken } = await response.json() as { csrfToken: string }
    const rejectedMassAssignment = await fetch(`${base}/api/admin/users`, { method: 'POST', headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email: 'new-contributor@example.test', password: newAccountPassword, role: 'Contributor', active: false }) })
    assert.equal(rejectedMassAssignment.status, 400)
    const created = await fetch(`${base}/api/admin/users`, { method: 'POST', headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email: 'new-contributor@example.test', password: newAccountPassword, role: 'Contributor' }) })
    assert.equal(created.status, 201)
    const body = await created.json() as { user: Record<string, unknown> }
    assert.equal(body.user.role, 'Contributor')
    assert.equal('passwordHash' in body.user, false)
    const updated = await fetch(`${base}/api/admin/users/${body.user.id as string}`, { method: 'PATCH', headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ role: 'Editor' }) })
    assert.equal(updated.status, 200)
    assert.equal(((await updated.json()) as { user: User }).user.role, 'Editor')
    const accountLogin = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email: 'new-contributor@example.test', password: newAccountPassword }) })
    assert.equal(accountLogin.status, 200)
    assert.equal(((await accountLogin.json()) as { user: User }).user.role, 'Editor')
  })
})

test('self account changes cannot be bypassed with an uppercase UUID', async () => {
  await withApi(async (base) => {
    const { user, headers } = await signedIn(base)
    const attempt = await fetch(`${base}/api/admin/users/${user.id.toUpperCase()}`, {
      method: 'PATCH', headers, body: JSON.stringify({ role: 'Contributor' }),
    })
    assert.equal(attempt.status, 400)
    assert.deepEqual(await attempt.json(), { error: 'You cannot change your own role or account status.', status: 400 })
  })
})

test('Editors and Contributors cannot create accounts or change roles and status', async () => {
  await withApi(async (base) => {
    for (const email of ['editor@example.test', 'contributor@example.test'] as const) {
      const { headers } = await signedIn(base, email)
      const create = await fetch(`${base}/api/admin/users`, {
        method: 'POST', headers, body: JSON.stringify({ email: 'new-account@example.test', password: newAccountPassword, role: 'Contributor' }),
      })
      assert.equal(create.status, 403)
      const roleChange = await fetch(`${base}/api/admin/users/${adminId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ role: 'Administrator' }),
      })
      assert.equal(roleChange.status, 403)
      const statusChange = await fetch(`${base}/api/admin/users/${adminId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ active: false }),
      })
      assert.equal(statusChange.status, 403)
    }
  })
})

test('Contributors cannot elevate their own role by manipulating a request', async () => {
  await withApi(async (base) => {
    const { user, headers } = await signedIn(base, 'contributor@example.test')
    const attempt = await fetch(`${base}/api/admin/users/${user.id.toUpperCase()}`, {
      method: 'PATCH', headers, body: JSON.stringify({ role: 'Administrator', active: true }),
    })
    assert.ok(attempt.status === 400 || attempt.status === 403, `expected denial, received ${attempt.status}`)
    const me = await fetch(`${base}/api/auth/me`, { headers: { cookie: headers.cookie } })
    assert.equal(me.status, 200)
    assert.equal(((await me.json()) as { user: User }).user.role, 'Contributor')
  })
})

test('Administrators can update another account supplied with an uppercase UUID', async () => {
  await withApi(async (base) => {
    const { headers } = await signedIn(base)
    const update = await fetch(`${base}/api/admin/users/${contributorId.toUpperCase()}`, {
      method: 'PATCH', headers, body: JSON.stringify({ role: 'Editor' }),
    })
    assert.equal(update.status, 200)
    assert.equal(((await update.json()) as { user: User }).user.role, 'Editor')
  })
})

test('rejects an unknown role instead of defaulting authorization', async () => {
  await withApi(async (base) => {
    const { headers } = await signedIn(base)
    const attempt = await fetch(`${base}/api/admin/users/${editorId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ role: 'Superuser' }),
    })
    assert.equal(attempt.status, 400)
    assert.deepEqual(await attempt.json(), { error: 'Role must be Contributor, Editor, or Administrator.', status: 400 })
  })
})

test('a session the store considers expired is rejected', async () => {
  const store = new ExpiringStore()
  await withApi(async (base) => {
    const { headers } = await signedIn(base)
    const active = await fetch(`${base}/api/auth/me`, { headers: { cookie: headers.cookie } })
    assert.equal(active.status, 200)
    store.expireAll()
    const expired = await fetch(`${base}/api/auth/me`, { headers: { cookie: headers.cookie } })
    assert.equal(expired.status, 401)
  }, store)
})
