/**
 * IncomingCallModal — full-screen overlay shown when a call is offered to the agent.
 * Visible only when both liveCall (from backend WS) AND pendingInvitation (from sip.js) are set.
 */
import { useSip } from '../contexts/SipContext'
import { useAgentWs } from '../contexts/AgentWsContext'
import './IncomingCallModal.css'

export function IncomingCallModal() {
  const { pendingInvitation, acceptCall, rejectCall } = useSip()
  const { liveCall } = useAgentWs()

  // Only show when FreeSWITCH is both ringing us via WS event AND sip.js Invitation arrived
  if (!liveCall || !pendingInvitation) return null

  const handleAnswer = () => { void acceptCall() }
  const handleDecline = () => rejectCall()

  return (
    <div className="incoming-modal-backdrop" role="dialog" aria-modal="true" aria-label="Incoming call">
      <div className="incoming-modal">
        <div className="incoming-modal__ring-icon" aria-hidden>
          <span className="incoming-modal__ring-pulse" />
          <span className="incoming-modal__ring-icon-inner">📞</span>
        </div>

        <p className="incoming-modal__label">Incoming Call</p>

        <div className="incoming-modal__caller">
          <span className="incoming-modal__from">{liveCall.from}</span>
          <span className="incoming-modal__arrow" aria-hidden>→</span>
          <span className="incoming-modal__to">{liveCall.to}</span>
        </div>

        <div className="incoming-modal__actions">
          <button
            id="incoming-call-decline"
            type="button"
            className="incoming-modal__btn incoming-modal__btn--decline"
            onClick={handleDecline}
          >
            Decline
          </button>
          <button
            id="incoming-call-answer"
            type="button"
            className="incoming-modal__btn incoming-modal__btn--answer"
            onClick={handleAnswer}
          >
            Answer
          </button>
        </div>
      </div>
    </div>
  )
}
