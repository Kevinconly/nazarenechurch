import assert from 'node:assert/strict'
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
const adminHash = await bcrypt.hash('a-strong-password-123', 4)
const baseUsers: Stored[] = [
  { id: 'f49e10c4-5511-4a2c-9979-65348f730821', email: 'admin@example.test', role: 'Administrator', active: true, createdAt: now, passwordHash: adminHash },
  { id: 'a90a4b40-b910-4ba9-a949-7f5a64e03f91', email: 'editor@example.test', role: 'Editor', active: true, createdAt: now, passwordHash: adminHash },
  { id: '4a465cd0-19d8-41f4-a51a-01305a04ae61', email: 'contributor@example.test', role: 'Contributor', active: true, createdAt: now, passwordHash: adminHash },
  { id: '9d4d5e64-26bc-411d-89ad-a06f0a8ac091', email: 'disabled@example.test', role: 'Editor', active: false, createdAt: now, passwordHash: adminHash },
]
const emptyArchive: ArchiveRepository = {
  async listPublishedAlbums(page, pageSize) { return { items: [], page, pageSize, total: 0, totalPages: 0 } },
  async listPublishedMedia() { return null },
}

function makeUsers(): UserRepository {
  const records = structuredClone(baseUsers)
  return {
    async findByEmail(email) { const user = records.find((item) => item.email.toLowerCase() === email.toLowerCase()); return user ? { ...user } : null },
    async findActiveById(id) { const user = records.find((item) => item.id === id && item.active && !disabledForTest.has(id)); return user ? { id: user.id, email: user.email, role: user.role, active: user.active, createdAt: user.createdAt } : null },
    async list() { return records.map(({ passwordHash: _hash, ...user }) => user) },
    async create(email, passwordHash, role) { const user = { id: crypto.randomUUID(), email, role, active: true, createdAt: now, passwordHash }; records.push(user); const { passwordHash: _hash, ...safe } = user; return safe },
    async update(id, values) { const user = records.find((item) => item.id === id); if (!user) return null; if (values.role) user.role = values.role; if (values.active !== undefined) user.active = values.active; const { passwordHash: _hash, ...safe } = user; return safe },
  } as unknown as UserRepository
}

async function withApi(run: (base: string) => Promise<void>) {
  const app = createApp(emptyArchive, { users: makeUsers(), sessionStore: new session.MemoryStore(), sessionSecret: 'test-session-secret-that-is-long-enough', cookieSecure: false })
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
  const response = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { cookie: csrfCookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email, password: 'a-strong-password-123' }) })
  return { response, csrfCookie, csrfToken }
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
    const invalid = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { cookie: cookie(csrf), 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email: 'unknown@example.test', password: 'a-strong-password-123' }) })
    assert.equal(invalid.status, 401)
    assert.deepEqual(await invalid.json(), { error: 'Invalid email or password.', status: 401 })
    const disabled = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { cookie: cookie(csrf), 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email: 'disabled@example.test', password: 'a-strong-password-123' }) })
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
    disabledForTest.add('a90a4b40-b910-4ba9-a949-7f5a64e03f91')
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
    const rejectedMassAssignment = await fetch(`${base}/api/admin/users`, { method: 'POST', headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email: 'new-contributor@example.test', password: 'an-account-password-12', role: 'Contributor', active: false }) })
    assert.equal(rejectedMassAssignment.status, 400)
    const created = await fetch(`${base}/api/admin/users`, { method: 'POST', headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email: 'new-contributor@example.test', password: 'an-account-password-12', role: 'Contributor' }) })
    assert.equal(created.status, 201)
    const body = await created.json() as { user: Record<string, unknown> }
    assert.equal(body.user.role, 'Contributor')
    assert.equal('passwordHash' in body.user, false)
    const updated = await fetch(`${base}/api/admin/users/${body.user.id as string}`, { method: 'PATCH', headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ role: 'Editor' }) })
    assert.equal(updated.status, 200)
    assert.equal(((await updated.json()) as { user: User }).user.role, 'Editor')
    const accountLogin = await fetch(`${base}/api/auth/sign-in`, { method: 'POST', headers: { cookie: sessionCookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ email: 'new-contributor@example.test', password: 'an-account-password-12' }) })
    assert.equal(accountLogin.status, 200)
    assert.equal(((await accountLogin.json()) as { user: User }).user.role, 'Editor')
  })
})
