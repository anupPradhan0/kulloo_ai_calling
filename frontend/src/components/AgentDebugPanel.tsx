/**
 * Collapsible on-page log for inbound-call debugging (WS + SIP + claim).
 */
import { useCallback, useSyncExternalStore } from 'react'
import {
  clearAgentDebugLog,
  getAgentDebugLines,
  subscribeAgentDebugLog,
} from '../agent/agentDebugLog'
import './AgentDebugPanel.css'

export function AgentDebugPanel() {
  const text = useSyncExternalStore(subscribeAgentDebugLog, getAgentDebugLines, getAgentDebugLines)
  const joined = text.join('\n')

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(joined).catch(() => undefined)
  }, [joined])

  return (
    <details className="agent-debug">
      <summary className="agent-debug__summary">
        Session debug log ({text.length} lines) — WebSocket + SIP + lock
      </summary>
      <div className="agent-debug__toolbar">
        <button type="button" className="agent-debug__btn" onClick={copy}>
          Copy all
        </button>
        <button type="button" className="agent-debug__btn" onClick={clearAgentDebugLog}>
          Clear
        </button>
      </div>
      <pre className="agent-debug__pre" aria-label="Agent debug log">
        {joined || 'No events yet. Keep this open while testing an inbound call.'}
      </pre>
    </details>
  )
}
