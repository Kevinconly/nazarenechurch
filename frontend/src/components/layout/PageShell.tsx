import type { ReactNode } from 'react'
import { Container } from '../ui/Container'
import { Divider } from '../ui/Divider'
import { Logo } from '../ui/Logo'

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <Container className="header-inner">
          <a href="/" className="brand-link" aria-label="Church of the Nazarene Remera, home">
            <Logo />
            <span className="brand-name">Remera</span>
          </a>
          <nav className="site-nav" aria-label="Main navigation">
            <a href="/" aria-current="page">Home</a>
            <a href="#gallery">Gallery</a>
          </nav>
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
