import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { apiUrl } from './lib/api-url'

const root = document.getElementById('root')!
const { protocol, hostname, port, href } = window.location
const inferredPort =
  port || (protocol === 'https:' ? '443' : protocol === 'http:' ? '80' : '(default)')
const apiBase = import.meta.env.VITE_API_BASE_URL?.trim() || '(same-origin / relative /api)'

console.info(
  `[Kulloo] UI loaded\n` +
    `  Page URL:     ${href}\n` +
    `  Host:         ${hostname}\n` +
    `  Origin:       ${window.location.origin}\n` +
    `  Port:         ${inferredPort}\n` +
    `  Example API:  ${apiUrl('/api/health/live')}\n` +
    `  API base:     ${apiBase}\n`,
)

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
