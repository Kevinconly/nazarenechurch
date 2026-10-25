export type AppRole = 'Contributor' | 'Editor' | 'Administrator'
export type AuthUser = { id: string; email: string; role: AppRole }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init.headers } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    if (response.status === 401 && path !== '/auth/sign-in') window.dispatchEvent(new Event('auth:unauthorized'))
    throw new Error(body.error ?? `Request failed (${response.status}).`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const authApi = {
  me: () => request<{ user: AuthUser }>('/auth/me'),
  csrf: () => request<{ csrfToken: string }>('/auth/csrf'),
  signIn: (email: string, password: string, csrfToken: string) => request<{ user: AuthUser; csrfToken: string }>('/auth/sign-in', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ email, password }) }),
  signOut: (csrfToken: string) => request<void>('/auth/sign-out', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } }),
  listUsers: () => request<{ items: Array<AuthUser & { active: boolean; createdAt: string }> }>('/admin/users'),
  createUser: (body: { email: string; password: string; role: AppRole }, csrfToken: string) => request<{ user: AuthUser }>('/admin/users', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body) }),
  updateUser: (id: string, body: { role?: AppRole; active?: boolean }, csrfToken: string) => request<{ user: AuthUser }>('/admin/users/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body) }),
}
