/**
 * IncomingCallModal — overlay when an inbound PSTN call is offered (WS) and/or sip.js INVITE arrives.
 * WS `inbound_call.offered` often fires before the SIP leg reaches the browser; we show the modal
 * on liveCall alone so the agent sees the call immediately, then enable Answer when sip.js is ready.
 */
import type { Invitation } from 'sip.js'
import { useSip } from '../contexts/SipContext'
import { useAgentWs } from '../contexts/AgentWsContext'
import './IncomingCallModal.css'

function callerDisplay(
  liveCall: { from: string; to: string } | null,
  pendingInvitation: Invitation | null,
): { from: string; to: string } {
  if (liveCall) {
    return { from: liveCall.from, to: liveCall.to }
  }
  if (pendingInvitation) {
    const uri = pendingInvitation.remoteIdentity?.uri
    const from = uri?.user ? String(uri.user) : 'unknown'
    return { from, to: 'agent' }
  }
  return { from: 'unknown', to: 'unknown' }
}

export function IncomingCallModal() {
  const { pendingInvitation, acceptCall, rejectCall, sipStatus } = useSip()
  const { liveCall } = useAgentWs()

  if (!liveCall && !pendingInvitation) return null

  const { from, to } = callerDisplay(liveCall, pendingInvitation)
  const canUseSip = Boolean(pendingInvitation)
  const waitingForSip = Boolean(liveCall && !pendingInvitation)

  const handleAnswer = () => {
    if (pendingInvitation) void acceptCall()
  }
  const handleDecline = () => {
    if (pendingInvitation) rejectCall()
  }

  return (
    <div className="incoming-modal-backdrop" role="dialog" aria-modal="true" aria-label="Incoming call">
      <div className="incoming-modal">
        <div className="incoming-modal__ring-icon" aria-hidden>
          <span className="incoming-modal__ring-pulse" />
          <span className="incoming-modal__ring-icon-inner">📞</span>
        </div>

        <p className="incoming-modal__label">Incoming Call</p>

        <div className="incoming-modal__caller">
          <span className="incoming-modal__from">{from}</span>
          <span className="incoming-modal__arrow" aria-hidden>→</span>
          <span className="incoming-modal__to">{to}</span>
        </div>

        {waitingForSip && (
          <p className="incoming-modal__hint">
            {sipStatus === 'registered'
              ? 'Connecting this call to your browser softphone…'
              : 'Softphone is not registered — check microphone permission and that only one Agent tab is open (API credentials).'}
          </p>
        )}

        <div className="incoming-modal__actions">
          <button
            id="incoming-call-decline"
            type="button"
            className="incoming-modal__btn incoming-modal__btn--decline"
            onClick={handleDecline}
            disabled={!canUseSip}
          >
            Decline
          </button>
          <button
            id="incoming-call-answer"
            type="button"
            className="incoming-modal__btn incoming-modal__btn--answer"
            onClick={handleAnswer}
            disabled={!canUseSip}
          >
            Answer
          </button>
        </div>
      </div>
    </div>
  )
}
