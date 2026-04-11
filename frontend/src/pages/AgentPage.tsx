import { useCallback, useEffect, useMemo, useState } from 'react'
import { getEffectiveApiBaseUrl } from '../api/constants'
import { DEFAULT_API_BASE_URL } from '../api/constants'
import {
  claimAgentSession,
  heartbeatAgentSession,
  releaseAgentSession,
} from '../api/callsApi'
import { getOrCreateAgentSessionId } from '../agent/sessionId'
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
  const answerUrl = `${getEffectiveApiBaseUrl()}/api/plivo/answer`

  return (
    <div className="agent-page">
      <IncomingCallModal />
      <header className="agent-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p className="agent-eyebrow">Agent Workstation</p>
          <h1 className="agent-title">Softphone & Console</h1>
          <p className="agent-lead">
            Take and place calls directly in the browser via WebRTC. Only one browser session can hold this agent line at a time.
          </p>
          <aside className="agent-plivo-note" aria-label="Plivo routing">
            <strong>Plivo inbound (PSTN)</strong> uses your XML <strong>Answer URL</strong> — not this screen. Configure it in Plivo (e.g.{' '}
            <code className="agent-plivo-note__code">{answerUrl}</code>
            ) so Plivo fetches XML and routes the call (IVR or dial Kamailio / FreeSWITCH).
          </aside>
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

type ClaimState = 'loading' | 'ready' | 'blocked'

export function AgentPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_API_BASE_URL)
  const sessionId = useMemo(() => getOrCreateAgentSessionId(), [])
  const [claim, setClaim] = useState<ClaimState>('loading')

  const tryClaim = useCallback(async () => {
    setClaim('loading')
    try {
      const { ok } = await claimAgentSession(baseUrl, sessionId)
      setClaim(ok ? 'ready' : 'blocked')
    } catch {
      setClaim('blocked')
    }
  }, [baseUrl, sessionId])

  useEffect(() => {
    void tryClaim()
  }, [tryClaim])

  useEffect(() => {
    if (claim !== 'ready') return
    const t = window.setInterval(() => {
      void heartbeatAgentSession(baseUrl, sessionId).catch(() => {
        setClaim('blocked')
      })
    }, 25_000)
    return () => window.clearInterval(t)
  }, [claim, baseUrl, sessionId])

  useEffect(() => {
    return () => {
      void releaseAgentSession(baseUrl, sessionId)
    }
  }, [baseUrl, sessionId])

  if (claim === 'loading') {
    return (
      <div className="agent-page agent-page--gate">
        <p className="agent-gate-msg">Reserving agent session…</p>
      </div>
    )
  }

  if (claim === 'blocked') {
    return (
      <div className="agent-page agent-page--gate">
        <h1 className="agent-title">Agent session in use</h1>
        <p className="agent-gate-msg">
          Another browser already has the agent workstation. Close the other tab or device, or ask an admin to clear the lock
          (Redis / restart API). You can retry after they disconnect.
        </p>
        <button type="button" className="agent-gate-retry" onClick={() => void tryClaim()}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <AgentWsProvider baseUrl={baseUrl}>
      <SipProvider baseUrl={baseUrl} agentSessionId={sessionId}>
        <AgentPageContent baseUrl={baseUrl} onBaseUrlChange={setBaseUrl} />
      </SipProvider>
    </AgentWsProvider>
  )
}
