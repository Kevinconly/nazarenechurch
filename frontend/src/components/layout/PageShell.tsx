import type { ReactNode } from 'react'
import { Container } from '../ui/Container'
import { Divider } from '../ui/Divider'
import { Logo } from '../ui/Logo'
import { ThemeControl } from './ThemeControl'

type PageShellProps = {
  children: ReactNode
  activePage?: 'home' | 'album'
}

export function PageShell({ children, activePage = 'home' }: PageShellProps) {
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
            </nav>
            <ThemeControl />
          </div>
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
