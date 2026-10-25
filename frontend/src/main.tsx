import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/lato/400.css'
import '@fontsource/lato/700.css'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App'
import { ThemeProvider } from './app/ThemeProvider'
import './styles/index.css'
import './styles/gallery.css'
import './styles/album-detail.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider><BrowserRouter><App /></BrowserRouter></ThemeProvider>
  </StrictMode>,
)
