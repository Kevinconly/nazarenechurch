import { getSupabaseClient, invokeSupabaseFunction } from './supabase'

export type AppRole = 'SUPER_ADMIN' | 'MEDIA_ADMIN' | 'REGULAR_USER'
export type AuthUser = { id: string; email: string; role: AppRole }
export type ManagedUser = AuthUser & { active: boolean; createdAt: string }

export const authApi = {
  async me(): Promise<{ user: AuthUser } | null> {
    const client = getSupabaseClient()
    const { data, error } = await client.auth.getSession()
    if (error) throw new Error('Unable to check the current sign-in status.')
    if (!data.session) return null
    return invokeSupabaseFunction<{ user: AuthUser }>('archive/me')
  },

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password })
    if (error) throw new Error('Invalid email or password.')
    try {
      const current = await authApi.me()
      if (current) return current.user
    } catch (failure) {
      await getSupabaseClient().auth.signOut()
      throw failure
    }
    await getSupabaseClient().auth.signOut()
    throw new Error('This account is not authorized to sign in.')
  },

  async signOut(): Promise<void> {
    const { error } = await getSupabaseClient().auth.signOut()
    if (error) throw new Error('Sign-out failed. Please try again.')
  },

  listUsers: () => invokeSupabaseFunction<{ items: ManagedUser[] }>('admin-users'),

  createUser: (body: { email: string; role: AppRole }) =>
    invokeSupabaseFunction<{ user: ManagedUser }>('admin-users', 'POST', body),

  updateUser: (id: string, body: { role?: AppRole; active?: boolean }) =>
    invokeSupabaseFunction<{ user: AuthUser & { active: boolean } }>(
      `admin-users/${encodeURIComponent(id)}`,
      'PATCH',
      body,
    ),
}
