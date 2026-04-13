import { useCallback, useEffect, useMemo, useState } from 'react'
import { getEffectiveApiBaseUrl } from '../api/constants'
import { DEFAULT_API_BASE_URL } from '../api/constants'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import {
  claimAgentSession,
  fetchAgentPanelConfig,
  heartbeatAgentSession,
  logoutAgentPanel,
  normalizeBaseUrl,
  releaseAgentSession,
} from '../api/callsApi'
import { clearAgentPanelToken, getAgentPanelToken } from '../agent/agentPanelToken'
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
import { AgentLoginForm } from '../components/AgentLoginForm'
import './AgentPage.css'

function AgentPageContent({
  baseUrl,
  apiBase,
  onBaseUrlChange,
  showPanelLogout,
  onPanelLogout,
}: {
  baseUrl: string
  /** Debounced origin used for API / WS / SIP (avoids reconnect on every keystroke). */
  apiBase: string
  onBaseUrlChange: (url: string) => void
  showPanelLogout: boolean
  onPanelLogout: () => void
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
          {showPanelLogout ? (
            <button
              type="button"
              className="agent-panel-logout"
              onClick={onPanelLogout}
            >
              Log out
            </button>
          ) : null}
          <StatusToggle baseUrl={apiBase} />
        </div>
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

type PanelGate = 'loading' | 'login' | 'ready'

const API_BASE_DEBOUNCE_MS = 450

function isPanelAuthErrorMessage(msg: string): boolean {
  return msg.includes('AGENT_PANEL_AUTH_REQUIRED') || msg.includes('Agent panel login required')
}

export function AgentPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_API_BASE_URL)
  const apiBase = useDebouncedValue(baseUrl, API_BASE_DEBOUNCE_MS)
  const apiOrigin = useMemo(
    () => normalizeBaseUrl(baseUrl) || getEffectiveApiBaseUrl(),
    [baseUrl],
  )
  const sessionId = useMemo(() => getOrCreateAgentSessionId(), [])
  const [claim, setClaim] = useState<ClaimState>('loading')
  const [panelGate, setPanelGate] = useState<PanelGate>('loading')
  const [panelAuthConfigured, setPanelAuthConfigured] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchAgentPanelConfig(apiOrigin)
      .then((cfg) => {
        if (cancelled) return
        if (!cfg.authRequired) {
          setPanelAuthConfigured(false)
          setPanelGate('ready')
          return
        }
        setPanelAuthConfigured(true)
        setPanelGate(getAgentPanelToken() ? 'ready' : 'login')
      })
      .catch(() => {
        if (cancelled) return
        setPanelAuthConfigured(false)
        setPanelGate('ready')
      })
    return () => {
      cancelled = true
    }
  }, [apiOrigin])

  const handlePanelLogout = useCallback(() => {
    void logoutAgentPanel(apiBase).finally(() => {
      clearAgentPanelToken()
      setPanelGate('login')
      setClaim('loading')
    })
  }, [apiBase])

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
      const msg = e instanceof Error ? e.message : String(e)
      agentDebugLog(`session/claim error: ${msg}`)
      if (isPanelAuthErrorMessage(msg)) {
        clearAgentPanelToken()
        setPanelGate('login')
        setClaim('loading')
        return
      }
      setClaim('blocked')
    }
  }, [apiBase, sessionId])

  useEffect(() => {
    if (panelGate !== 'ready') return
    void tryClaim()
  }, [panelGate, tryClaim])

  useEffect(() => {
    if (claim !== 'ready') return
    const t = window.setInterval(() => {
      void heartbeatAgentSession(apiBase, sessionId).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e)
        agentDebugLog(`session/heartbeat failed: ${msg} — lock may be lost`)
        if (isPanelAuthErrorMessage(msg)) {
          clearAgentPanelToken()
          setPanelGate('login')
          setClaim('loading')
          return
        }
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

  if (panelGate === 'loading') {
    return (
      <div className="agent-page agent-page--gate">
        <p className="agent-gate-msg">Loading agent…</p>
      </div>
    )
  }

  if (panelGate === 'login') {
    return (
      <AgentLoginForm
        apiBase={apiOrigin}
        onLoggedIn={() => {
          setPanelGate('ready')
        }}
      />
    )
  }

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
          showPanelLogout={panelAuthConfigured}
          onPanelLogout={handlePanelLogout}
        />
      </SipProvider>
    </AgentWsProvider>
  )
}
