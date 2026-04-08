/**
 * ActiveCallPanel — replaces the PhoneDialer when the agent is in an active WebRTC call.
 * Displays duration, mute toggle, DTMF keypad, and Hangup button.
 */
import { useEffect, useState } from 'react'
import { useSip } from '../contexts/SipContext'
import { useAgentWs } from '../contexts/AgentWsContext'
import './ActiveCallPanel.css'

export function ActiveCallPanel() {
  const { activeSession, hangup, sendDtmf } = useSip()
  const { liveCall } = useAgentWs()

  const [durationStr, setDurationStr] = useState('00:00')
  const [muted, setMuted] = useState(false)

  // ─── Duration timer ────────────────────────────────────────────────────────
  useEffect(() => {
    const start = Date.now()
    const timer = setInterval(() => {
      const diff = Date.now() - start
      const mins = Math.floor(diff / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setDurationStr(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // ─── Mute toggle ───────────────────────────────────────────────────────────
  const toggleMute = () => {
    if (!activeSession) return
    const pc = (activeSession.sessionDescriptionHandler as any)?.peerConnection as RTCPeerConnection | undefined
    if (!pc) return

    const senders = pc.getSenders()
    senders.forEach((sender) => {
      if (sender.track && sender.track.kind === 'audio') {
        sender.track.enabled = muted // if currently muted, enable it
      }
    })
    setMuted(!muted)
  }

  // ─── Event handlers ────────────────────────────────────────────────────────
  const handleHangup = () => { void hangup() }
  const handleDtmf = (digit: string) => void sendDtmf(digit)

  // If there's an active outbound call, liveCall might be null initially (until backend WS sync),
  // so we fallback to the destination URI.
  const callerNumber = liveCall?.from ?? activeSession?.remoteIdentity.uri.user ?? 'Unknown'

  return (
    <div className="active-call">
      <div className="active-call__header">
        <div className="active-call__status">
          <span className="active-call__dot" aria-hidden></span>
          Connected
        </div>
        <div className="active-call__duration">{durationStr}</div>
      </div>

      <div className="active-call__info">
        <div className="active-call__avatar" aria-hidden>📞</div>
        <h2 className="active-call__number">{callerNumber}</h2>
        {liveCall && <p className="active-call__details">To: {liveCall.to}</p>}
      </div>

      <div className="active-call__controls">
        <button
          type="button"
          className={`active-call__btn active-call__btn--mute ${muted ? 'is-active' : ''}`}
          onClick={toggleMute}
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
          aria-pressed={muted}
        >
          {muted ? '🔇 Unmute' : '🎤 Mute'}
        </button>

        <button
          type="button"
          className="active-call__btn active-call__btn--hangup"
          onClick={handleHangup}
        >
          ☎️ End Call
        </button>
      </div>

      <div className="active-call__dtmf">
        <p className="active-call__dtmf-label">Keypad (DTMF)</p>
        <div className="active-call__keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
            <button
              key={k}
              type="button"
              className="active-call__key"
              onClick={() => handleDtmf(k)}
              aria-label={`Send DTMF ${k}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
