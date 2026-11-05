import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../app/AuthProvider'
import { authApi, type AppRole, type ManagedUser } from '../../lib/authApi'
import { PageShell } from '../layout/PageShell'
import { Container } from '../ui/Container'
import { Button } from '../ui/Button'

const roleOptions: AppRole[] = ['MEDIA_ADMIN', 'REGULAR_USER']

function roleName(role: AppRole) {
  return {
    SUPER_ADMIN: 'Super Admin',
    MEDIA_ADMIN: 'Media Admin',
    REGULAR_USER: 'Regular User',
  }[role]
}

export function AdminPage() {
  const auth = useAuth()
  const location = useLocation()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AppRole>('MEDIA_ADMIN')
  const [busy, setBusy] = useState(false)

  const loadUsers = useCallback(async () => {
    const result = await authApi.listUsers()
    setUsers(result.items)
  }, [])

  useEffect(() => {
    if (auth.user?.role === 'SUPER_ADMIN') {
      void loadUsers().catch((error: unknown) => setProblem(error instanceof Error ? error.message : 'Unable to load accounts.'))
    }
  }, [auth.user, loadUsers])

  if (auth.loading) return <PageShell activePage="staff"><main id="main-content"><Container><p role="status">Checking sign-in status…</p></Container></main></PageShell>
  if (!auth.user) return <Navigate to="/admin/sign-in" replace state={{ from: location }} />
  if (auth.user.role === 'MEDIA_ADMIN') return <Navigate to="/admin/media" replace />

  return <PageShell activePage="staff">
    <main id="main-content" className="admin-page">
      <Container>
        <p className="eyebrow">Super Admin area</p>
        <h1>Account access</h1>
        <p className="admin-identity">Signed in as <strong>{auth.user.email}</strong> · Role: <strong>{roleName(auth.user.role)}</strong></p>
        {auth.user.role !== 'SUPER_ADMIN' ? <section className="auth-panel" role="status"><h2>Access not available</h2><p>Your role does not have permission to manage user accounts. Contact a Super Admin if you need access.</p></section> : <>
          <section className="admin-users" aria-labelledby="users-heading">
            <h2 id="users-heading">User accounts</h2>
            <p>Only Super Admins can invite users or change roles and account status.</p>
            {problem && <p className="auth-error" role="alert">{problem}</p>}
            {message && <p role="status">{message}</p>}
            <div className="admin-user-list">
              {users.map((user) => <div className="admin-user" key={user.id}>
                <span><strong>{user.email}</strong><small>{user.active ? 'Active' : 'Disabled'} · {roleName(user.role)}{user.id === auth.user?.id ? ' · You' : ''}</small></span>
                {user.id !== auth.user?.id && <div className="admin-user__controls">
                  <label className="visually-hidden" htmlFor={`role-${user.id}`}>Role for {user.email}</label>
                  <select
                    id={`role-${user.id}`}
                    value={user.role}
                    disabled={user.role === 'SUPER_ADMIN'}
                    onChange={async (event) => {
                      try {
                        setProblem('')
                        await authApi.updateUser(user.id, { role: event.target.value as AppRole })
                        await loadUsers()
                        setMessage('Role updated.')
                      } catch (error) {
                        setProblem(error instanceof Error ? error.message : 'Update failed.')
                      }
                    }}
                  >
                    {user.role === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">Super Admin</option>}
                    {roleOptions.map((item) => <option key={item} value={item}>{roleName(item)}</option>)}
                  </select>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={user.role === 'SUPER_ADMIN' && users.filter((item) => item.role === 'SUPER_ADMIN' && item.active).length <= 1}
                    onClick={async () => {
                      try {
                        setProblem('')
                        await authApi.updateUser(user.id, { active: !user.active })
                        await loadUsers()
                        setMessage('Account status updated.')
                      } catch (error) {
                        setProblem(error instanceof Error ? error.message : 'Update failed.')
                      }
                    }}
                  >{user.active ? 'Disable' : 'Enable'}</Button>
                </div>}
              </div>)}
            </div>
          </section>
          <section className="auth-panel admin-create" aria-labelledby="create-user-title">
            <h2 id="create-user-title">Invite an account</h2>
            <p>Supabase sends an invitation email. Email delivery must be configured before this can be used.</p>
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => {
              event.preventDefault()
              setBusy(true)
              setProblem('')
              setMessage('')
              try {
                await authApi.createUser({ email, role })
                setEmail('')
                setRole('MEDIA_ADMIN')
                await loadUsers()
                setMessage('Invitation sent.')
              } catch (error) {
                setProblem(error instanceof Error ? error.message : 'Invitation failed.')
              } finally {
                setBusy(false)
              }
            }}>
              <label htmlFor="new-email">Email</label>
              <input id="new-email" type="email" autoComplete="off" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
              <label htmlFor="new-role">Role</label>
              <select id="new-role" value={role} onChange={(event) => setRole(event.target.value as AppRole)}>
                {roleOptions.map((item) => <option key={item} value={item}>{roleName(item)}</option>)}
              </select>
              <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send invitation'}</Button>
            </form>
          </section>
        </>}
      </Container>
    </main>
  </PageShell>
}
