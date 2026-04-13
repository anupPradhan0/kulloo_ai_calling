import { useCallback, useEffect, useMemo, useState } from 'react'
import { getEffectiveApiBaseUrl } from '../api/constants'
import { DEFAULT_API_BASE_URL } from '../api/constants'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import {
  claimAgentSession,
  heartbeatAgentSession,
  releaseAgentSession,
} from '../api/callsApi'
import { agentDebugLog } from '../agent/agentDebugLog'
import { getOrCreateAgentSessionId } from '../agent/sessionId'
import { AgentDebugPanel } from '../components/AgentDebugPanel'
import { PhoneDialer } from '../components/PhoneDialer'
import { CallHistoryPanel } from '../components/CallHistoryPanel'
import { AgentWsProvider } from '../contexts/AgentWsContext'
import { SipProvider, useSip } from '../contexts/SipContext'
import { StatusToggle } from '../components/StatusToggle'
import { IncomingCallModal } from '../components/IncomingCallModal'
import { ActiveCallPanel } from '../components/ActiveCallPanel'
import './AgentPage.css'

function AgentPageContent({
  baseUrl,
  apiBase,
  onBaseUrlChange,
}: {
  baseUrl: string
  /** Debounced origin used for API / WS / SIP (avoids reconnect on every keystroke). */
  apiBase: string
  onBaseUrlChange: (url: string) => void
}) {
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
        <StatusToggle baseUrl={apiBase} />
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
            <PhoneDialer baseUrl={apiBase} onCallPlaced={bumpHistory} />
          )}
        </div>
        <div className="agent-column agent-column--history">
          <CallHistoryPanel baseUrl={apiBase} refreshToken={refreshToken} />
        </div>
      </div>
      <AgentDebugPanel />
    </div>
  )
}

type ClaimState = 'loading' | 'ready' | 'blocked'

const API_BASE_DEBOUNCE_MS = 450

export function AgentPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_API_BASE_URL)
  const apiBase = useDebouncedValue(baseUrl, API_BASE_DEBOUNCE_MS)
  const sessionId = useMemo(() => getOrCreateAgentSessionId(), [])
  const [claim, setClaim] = useState<ClaimState>('loading')

  const tryClaim = useCallback(async () => {
    // Stay on the workstation UI during reclaim after the debounced URL changes (no full-page flash).
    setClaim((s) => (s === 'ready' ? 'ready' : 'loading'))
    agentDebugLog(`session/claim request (sessionId=${sessionId.slice(0, 8)}…)`)
    try {
      const { ok } = await claimAgentSession(apiBase, sessionId)
      if (ok) {
        agentDebugLog('session/claim OK — single-agent lock acquired')
      } else {
        agentDebugLog('session/claim 409 — another tab holds the lock')
      }
      setClaim(ok ? 'ready' : 'blocked')
    } catch (e) {
      agentDebugLog(`session/claim error: ${e instanceof Error ? e.message : String(e)}`)
      setClaim('blocked')
    }
  }, [apiBase, sessionId])

  useEffect(() => {
    void tryClaim()
  }, [tryClaim])

  useEffect(() => {
    if (claim !== 'ready') return
    const t = window.setInterval(() => {
      void heartbeatAgentSession(apiBase, sessionId).catch((e) => {
        agentDebugLog(`session/heartbeat failed: ${e instanceof Error ? e.message : String(e)} — lock may be lost`)
        setClaim('blocked')
      })
    }, 25_000)
    return () => window.clearInterval(t)
  }, [claim, apiBase, sessionId])

  useEffect(() => {
    return () => {
      void releaseAgentSession(apiBase, sessionId)
    }
  }, [apiBase, sessionId])

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
    <AgentWsProvider baseUrl={apiBase}>
      <SipProvider baseUrl={apiBase} agentSessionId={sessionId}>
        <AgentPageContent
          baseUrl={baseUrl}
          apiBase={apiBase}
          onBaseUrlChange={setBaseUrl}
        />
      </SipProvider>
    </AgentWsProvider>
  )
}
