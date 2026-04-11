import { useState } from 'react'
import './App.css'
import { getEffectiveApiBaseUrl } from './api/constants'
import { ApiExplorer } from './components/ApiExplorer'
import { AgentPage } from './pages/AgentPage'

export default function App() {
  const [tab, setTab] = useState<'explorer' | 'agent'>('explorer')

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
      {tab === 'explorer' ? (
        <div className="app-main app-main--narrow">
          <ApiExplorer />
        </div>
      ) : (
        <AgentPage />
      )}
    </div>
  )
}
