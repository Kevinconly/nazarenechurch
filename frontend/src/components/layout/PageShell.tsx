import type { ReactNode } from 'react'
import { Container } from '../ui/Container'
import { Divider } from '../ui/Divider'
import { Logo } from '../ui/Logo'
import { ThemeControl } from './ThemeControl'
import { Link } from 'react-router-dom'
import { useAuth } from '../../app/AuthProvider'
import { useState } from 'react'
import { LogIn, ShieldCheck } from 'lucide-react'

type PageShellProps = {
  children: ReactNode
  activePage?: 'home' | 'album' | 'staff'
}

export function PageShell({ children, activePage = 'home' }: PageShellProps) {
  const auth = useAuth()
  const [signOutError, setSignOutError] = useState('')
  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <Container className="header-inner">
          <a href="/" className="brand-link" aria-label="Church of the Nazarene Remera, home">
            <Logo />
            <span className="brand-name">Remera</span>
          </a>
          <div className="header-actions">
            <nav className="site-nav" aria-label="Main navigation">
              <a href="/" aria-current={activePage === 'home' ? 'page' : undefined}>Home</a>
              <a href="/#gallery" aria-current={activePage === 'album' ? 'page' : undefined}>Gallery</a>
              {auth.user ? <Link className="staff-nav-link" to="/admin" aria-label={auth.user.role} aria-current={activePage === 'staff' ? 'page' : undefined}><ShieldCheck aria-hidden="true" /><span>{auth.user.role}</span></Link> : <Link className="staff-nav-link" to="/admin/sign-in" aria-label="Staff sign in" aria-current={activePage === 'staff' ? 'page' : undefined}><LogIn aria-hidden="true" /><span>Staff sign in</span></Link>}
            </nav>
            <ThemeControl />
            {auth.user && <button className="sign-out-button" type="button" onClick={() => { setSignOutError(''); void auth.signOut().catch(() => setSignOutError('Sign-out failed. Please try again.')) }}>Sign out</button>}
          </div>
          {signOutError && <span className="sign-out-error" role="alert">{signOutError}</span>}
        </Container>
      </header>
      {children}
      <footer className="site-footer">
        <Container>
          <Divider />
          <div className="footer-inner">
            <Logo variant="extended-grey" />
            <p>Church of the Nazarene — Remera</p>
            <span>A shared archive of our community’s photographs and films.</span>
          </div>
        </Container>
      </footer>
    </div>
  )
}
