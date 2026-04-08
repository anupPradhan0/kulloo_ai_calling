/**
 * StatusToggle — lets the agent set their availability.
 * Calls POST /api/agent/status and reflects state visually.
 */
import { useState } from 'react'
import { setAgentStatus } from '../api/callsApi'
import './StatusToggle.css'

type Props = { baseUrl: string }

export function StatusToggle({ baseUrl }: Props) {
  const [status, setStatus] = useState<'available' | 'offline'>('offline')
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    const next = status === 'available' ? 'offline' : 'available'
    setBusy(true)
    try {
      await setAgentStatus(baseUrl, next)
      setStatus(next)
    } catch {
      // silently fail — status stays unchanged
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      id="agent-status-toggle"
      className={`status-toggle status-toggle--${status}`}
      disabled={busy}
      onClick={() => void toggle()}
      aria-label={`Agent status: ${status}. Click to toggle.`}
    >
      <span className="status-toggle__dot" aria-hidden />
      <span className="status-toggle__label">
        {status === 'available' ? 'Available' : 'Offline'}
      </span>
    </button>
  )
}
