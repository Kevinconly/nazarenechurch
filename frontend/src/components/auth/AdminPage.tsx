import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../app/AuthProvider'
import { authApi, type AppRole, type AuthUser } from '../../lib/authApi'
import { PageShell } from '../layout/PageShell'
import { Container } from '../ui/Container'
import { Button } from '../ui/Button'

type ManagedUser = AuthUser & { active: boolean; createdAt: string }
const roleOptions: AppRole[] = ['Contributor', 'Editor', 'Administrator']

export function AdminPage() {
  const auth = useAuth()
  const location = useLocation()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<AppRole>('Contributor')
  const [busy, setBusy] = useState(false)
  const loadUsers = useCallback(async () => { const result = await authApi.listUsers(); setUsers(result.items) }, [])
  useEffect(() => { if (auth.user?.role === 'Administrator') void loadUsers().catch((error: unknown) => setProblem(error instanceof Error ? error.message : 'Unable to load accounts.')) }, [auth.user, loadUsers])

  if (auth.loading) return <PageShell activePage="staff"><main id="main-content"><Container><p role="status">Checking sign-in status…</p></Container></main></PageShell>
  if (!auth.user) return <Navigate to="/admin/sign-in" replace state={{ from: location }} />
  return <PageShell activePage="staff">
    <main id="main-content" className="admin-page">
      <Container>
        <p className="eyebrow">Staff area</p>
        <h1>Account access</h1>
        <p className="admin-identity">Signed in as <strong>{auth.user.email}</strong> · Role: <strong>{auth.user.role}</strong></p>
        {auth.user.role !== 'Administrator' ? <section className="auth-panel" role="status"><h2>Access not available</h2><p>Your role does not have permission to manage user accounts. Contact an Administrator if you need access.</p></section> : <>
          <section className="admin-users" aria-labelledby="users-heading">
            <h2 id="users-heading">User accounts</h2>
            <p>Only Administrators can create accounts or change roles and account status.</p>
            {problem && <p className="auth-error" role="alert">{problem}</p>}
            {message && <p role="status">{message}</p>}
            <div className="admin-user-list">
              {users.map((user) => <div className="admin-user" key={user.id}>
                <span><strong>{user.email}</strong><small>{user.active ? 'Active' : 'Disabled'} · {user.role}{user.id === auth.user?.id ? ' · You' : ''}</small></span>
                {user.id !== auth.user?.id && <div className="admin-user__controls">
                  <label className="visually-hidden" htmlFor={`role-${user.id}`}>Role for {user.email}</label>
                  <select id={`role-${user.id}`} value={user.role} onChange={async (event) => { try { await authApi.updateUser(user.id, { role: event.target.value as AppRole }, auth.csrfToken); await loadUsers(); setMessage('Role updated.') } catch (error) { setProblem(error instanceof Error ? error.message : 'Update failed.') } }}>
                    {roleOptions.map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <Button variant="outline" type="button" onClick={async () => { try { await authApi.updateUser(user.id, { active: !user.active }, auth.csrfToken); await loadUsers(); setMessage('Account status updated.') } catch (error) { setProblem(error instanceof Error ? error.message : 'Update failed.') } }}>{user.active ? 'Disable' : 'Enable'}</Button>
                </div>}
              </div>)}
            </div>
          </section>
          <section className="auth-panel admin-create" aria-labelledby="create-user-title">
            <h2 id="create-user-title">Create an account</h2>
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setProblem(''); setMessage(''); try { await authApi.createUser({ email, password, role }, auth.csrfToken); setEmail(''); setPassword(''); setRole('Contributor'); await loadUsers(); setMessage('Account created.') } catch (error) { setProblem(error instanceof Error ? error.message : 'Account creation failed.') } finally { setBusy(false) } }}>
              <label htmlFor="new-email">Email</label><input id="new-email" type="email" autoComplete="off" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
              <label htmlFor="new-password">Temporary password (12+ characters, at most 72 UTF-8 bytes)</label><input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={password} onChange={(event) => setPassword(event.target.value)} />
              <label htmlFor="new-role">Role</label><select id="new-role" value={role} onChange={(event) => setRole(event.target.value as AppRole)}>{roleOptions.map((item) => <option key={item}>{item}</option>)}</select>
              <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button>
            </form>
          </section>
        </>}
      </Container>
    </main>
  </PageShell>
}
