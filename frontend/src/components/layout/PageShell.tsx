import type { ReactNode } from 'react'
import { Container } from '../ui/Container'
import { Divider } from '../ui/Divider'
import { Logo } from '../ui/Logo'

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="page-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <header className="site-header"><Container className="header-inner"><a href="/" className="brand-link" aria-label="Church of the Nazarene Remera, home"><Logo /><span className="brand-name">Remera</span></a><span className="header-caption">Community archive</span></Container></header>
    {children}
    <footer className="site-footer"><Container><Divider /><div className="footer-inner"><Logo variant="extended-grey" /><p>Church of the Nazarene — Remera</p><span>Preserving memories for generations to come.</span></div></Container></footer>
  </div>
}
