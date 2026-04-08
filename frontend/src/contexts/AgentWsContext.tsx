/**
 * AgentWsContext — connects to the backend WebSocket at /ws/agent and surfaces
 * real-time call lifecycle events to the Agent page.
 *
 * Events received from the backend (agent-ws.service.ts):
 *   inbound_call.offered  — a new PSTN call has arrived and is waiting
 *   call.answered         — the bridge is up
 *   call.ended            — call hung up / completed
 *
 * The context reconnects automatically (exponential backoff, max 5 retries).
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { normalizeBaseUrl } from '../api/callsApi'

// ─── Types ───────────────────────────────────────────────────────────────────

export type LiveCall = {
  callId: string
  from: string
  to: string
  calledAt: string
}

type WsStatus = 'connecting' | 'connected' | 'disconnected'

type AgentWsContextValue = {
  liveCall: LiveCall | null
  wsStatus: WsStatus
  clearLiveCall: () => void
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AgentWsContext = createContext<AgentWsContextValue | null>(null)

export function useAgentWs(): AgentWsContextValue {
  const ctx = useContext(AgentWsContext)
  if (!ctx) throw new Error('useAgentWs must be used inside <AgentWsProvider>')
  return ctx
}

// ─── Provider ────────────────────────────────────────────────────────────────

type Props = { baseUrl: string; children: ReactNode }

export function AgentWsProvider({ baseUrl, children }: Props) {
  const [liveCall, setLiveCall] = useState<LiveCall | null>(null)
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef(0)
  const unmountedRef = useRef(false)

  const clearLiveCall = useCallback(() => setLiveCall(null), [])

  const connect = useCallback(() => {
    if (unmountedRef.current) return

    // Convert HTTP base URL → WS URL (ws:// or wss://)
    const base = normalizeBaseUrl(baseUrl)
    const wsUrl = base.replace(/^http/, 'ws') + '/ws/agent'

    setWsStatus('connecting')
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      retryRef.current = 0
      setWsStatus('connected')
    }

    ws.onmessage = (evt) => {
      let msg: unknown
      try { msg = JSON.parse(evt.data as string) } catch { return }
      const event = msg as Record<string, unknown>

      if (event.type === 'inbound_call.offered') {
        setLiveCall({
          callId:   String(event.callId ?? ''),
          from:     String(event.from   ?? 'unknown'),
          to:       String(event.to     ?? 'unknown'),
          calledAt: String(event.calledAt ?? new Date().toISOString()),
        })
      } else if (event.type === 'call.ended') {
        setLiveCall(null)
      }
    }

    ws.onclose = () => {
      if (unmountedRef.current) return
      setWsStatus('disconnected')
      wsRef.current = null

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s — then stop
      const delay = Math.min(1000 * 2 ** retryRef.current, 16_000)
      if (retryRef.current < 5) {
        retryRef.current++
        setTimeout(connect, delay)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [baseUrl])

  useEffect(() => {
    unmountedRef.current = false
    connect()
    // Keepalive ping every 25s
    const ping = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping')
      }
    }, 25_000)

    return () => {
      unmountedRef.current = true
      clearInterval(ping)
      wsRef.current?.close()
    }
  }, [connect])

  return (
    <AgentWsContext.Provider value={{ liveCall, wsStatus, clearLiveCall }}>
      {children}
    </AgentWsContext.Provider>
  )
}
