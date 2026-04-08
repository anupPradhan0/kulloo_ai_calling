import { useState } from 'react'
import { DEFAULT_API_BASE_URL } from '../api/constants'
import { PhoneDialer } from '../components/PhoneDialer'
import { CallHistoryPanel } from '../components/CallHistoryPanel'
import { AgentWsProvider } from '../contexts/AgentWsContext'
import { SipProvider, useSip } from '../contexts/SipContext'
import { StatusToggle } from '../components/StatusToggle'
import { IncomingCallModal } from '../components/IncomingCallModal'
import { ActiveCallPanel } from '../components/ActiveCallPanel'
import './AgentPage.css'

function AgentPageContent({ baseUrl, onBaseUrlChange }: { baseUrl: string; onBaseUrlChange: (url: string) => void }) {
  const [refreshToken, setRefreshToken] = useState(0)
  const bumpHistory = () => setRefreshToken((n) => n + 1)
  const { activeSession } = useSip()

  return (
    <div className="agent-page">
      <IncomingCallModal />
      <header className="agent-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p className="agent-eyebrow">Agent Workstation</p>
          <h1 className="agent-title">Softphone & Console</h1>
          <p className="agent-lead">
            Take and place calls directly in the browser via WebRTC.
          </p>
        </div>
        <StatusToggle baseUrl={baseUrl} />
      </header>

      <div className="agent-layout">
        <div className="agent-column agent-column--dialer">
          <label className="agent-base-field">
            <span className="agent-base-label">API base URL</span>
            <input
              className="agent-base-input"
              type="url"
              value={baseUrl}
              onChange={(e) => onBaseUrlChange(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          
          {/* Show the active call panel if we are in a call, else show the dialer */}
          {activeSession ? (
            <ActiveCallPanel />
          ) : (
            <PhoneDialer baseUrl={baseUrl} onCallPlaced={bumpHistory} />
          )}
        </div>
        <div className="agent-column agent-column--history">
          <CallHistoryPanel baseUrl={baseUrl} refreshToken={refreshToken} />
        </div>
      </div>
    </div>
  )
}

export function AgentPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_API_BASE_URL)

  return (
    <AgentWsProvider baseUrl={baseUrl}>
      <SipProvider baseUrl={baseUrl}>
        <AgentPageContent baseUrl={baseUrl} onBaseUrlChange={setBaseUrl} />
      </SipProvider>
    </AgentWsProvider>
  )
}
