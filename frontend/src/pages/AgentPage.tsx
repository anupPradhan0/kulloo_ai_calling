import { useState } from 'react'
import { DEFAULT_API_BASE_URL } from '../api/constants'
import { PhoneDialer } from '../components/PhoneDialer'
import { CallHistoryPanel } from '../components/CallHistoryPanel'
import './AgentPage.css'

export function AgentPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_API_BASE_URL)
  const [refreshToken, setRefreshToken] = useState(0)

  const bumpHistory = () => setRefreshToken((n) => n + 1)

  return (
    <div className="agent-page">
      <header className="agent-page-header">
        <p className="agent-eyebrow">Agent</p>
        <h1 className="agent-title">Outbound dialer</h1>
        <p className="agent-lead">
          Place calls and browse inbound and outbound history from the API.
        </p>
      </header>

      <div className="agent-layout">
        <div className="agent-column agent-column--dialer">
          <label className="agent-base-field">
            <span className="agent-base-label">API base URL</span>
            <input
              className="agent-base-input"
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <PhoneDialer baseUrl={baseUrl} onCallPlaced={bumpHistory} />
        </div>
        <div className="agent-column agent-column--history">
          <CallHistoryPanel baseUrl={baseUrl} refreshToken={refreshToken} />
        </div>
      </div>
    </div>
  )
}
