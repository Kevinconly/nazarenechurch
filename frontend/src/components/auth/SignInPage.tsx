import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../app/AuthProvider'
import { Button } from '../ui/Button'
import { Container } from '../ui/Container'
import { PageShell } from '../layout/PageShell'

export function SignInPage() {
  const { user, loading, signIn, error: authError } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!loading && user) return <Navigate to="/admin" replace />
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError('')
    try { await signIn(email, password) } catch (failure) { setError(failure instanceof Error ? failure.message : 'Sign-in failed.'); setPassword('') }
    finally { setBusy(false) }
  }
  if (loading) return <PageShell activePage="staff"><main id="main-content"><Container><p role="status">Checking sign-in status…</p></Container></main></PageShell>
  return <PageShell activePage="staff">
    <main id="main-content" className="auth-page">
      <Container>
        <section className="auth-panel" aria-labelledby="sign-in-title">
          <p className="eyebrow">Staff access</p>
          <h1 id="sign-in-title">Sign in</h1>
          <p>Sign in with an account provided by a church administrator.</p>
          <form onSubmit={submit} noValidate>
            <label htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
            <label htmlFor="auth-password">Password</label>
            <input id="auth-password" type="password" autoComplete="current-password" required maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} />
            {error && <p className="auth-error" role="alert">{error}</p>}
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            <Button type="submit" disabled={busy || !email.trim() || !password}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
          <Link className="text-link" to={location.state?.from?.pathname ?? '/'}>Return to the public archive</Link>
        </section>
      </Container>
    </main>
  </PageShell>
}
