import { useEffect, useState } from 'react'
import './App.css'
import { getEffectiveApiBaseUrl } from './api/constants'
import { ApiExplorer } from './components/ApiExplorer'
import { AgentPage } from './pages/AgentPage'

export default function App() {
  const [tab, setTab] = useState<'explorer' | 'agent'>('explorer')
  /** Avoid loading WS/SIP/mic until the user opens Agent at least once. */
  const [agentMounted, setAgentMounted] = useState(false)
  useEffect(() => {
    if (tab === 'agent') setAgentMounted(true)
  }, [tab])

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Kulloo</h1>
        <p className="subtitle">
          Public API tools and agent dialer: check status, place hello calls, and
          browse call history from the database.
        </p>
        <p className="api-base-hint">
          <span className="api-base-hint__label">API base URL</span>
          <code className="api-base-hint__url">{getEffectiveApiBaseUrl()}</code>
        </p>
        <nav className="app-nav" aria-label="Primary">
          <button
            type="button"
            className={`app-nav-btn ${tab === 'explorer' ? 'app-nav-btn--active' : ''}`}
            onClick={() => setTab('explorer')}
          >
            API explorer
          </button>
          <button
            type="button"
            className={`app-nav-btn ${tab === 'agent' ? 'app-nav-btn--active' : ''}`}
            onClick={() => setTab('agent')}
          >
            Agent
          </button>
        </nav>
      </header>
      {/* Keep both mounted so Agent WS/SIP stay up when switching tabs (avoids disconnect storms). */}
      <div
        className="app-main app-main--narrow"
        hidden={tab !== 'explorer'}
        aria-hidden={tab !== 'explorer'}
      >
        <ApiExplorer />
      </div>
      {agentMounted ? (
        <div hidden={tab !== 'agent'} aria-hidden={tab !== 'agent'}>
          <AgentPage />
        </div>
      ) : null}
    </div>
  )
}
