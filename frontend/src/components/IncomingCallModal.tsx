/**
 * IncomingCallModal — overlay when an inbound PSTN call is offered (WS) and/or sip.js INVITE arrives.
 * WS `inbound_call.offered` often fires before the SIP leg reaches the browser; we show the modal
 * on liveCall alone so the agent sees the call immediately, then enable Answer when sip.js is ready.
 */
import type { Invitation } from 'sip.js'
import { useEffect, useState } from 'react'
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

const SIP_BRIDGE_HINT_AFTER_MS = 12_000

export function IncomingCallModal() {
  const { pendingInvitation, acceptCall, rejectCall, sipStatus, activeSession } = useSip()
  const { liveCall } = useAgentWs()
  const [showBridgeHint, setShowBridgeHint] = useState(false)
  // Track the callId we already answered so the modal stays hidden even if
  // the SIP session drops mid-call (activeSession becomes null while liveCall
  // is still set because call.ended hasn't arrived yet from the backend).
  const [answeredCallId, setAnsweredCallId] = useState<string | null>(null)

  const canUseSip = Boolean(pendingInvitation)
  const waitingForSip = Boolean(liveCall && !pendingInvitation)

  // Reset answeredCallId when the backend reports call.ended (liveCall clears)
  useEffect(() => {
    if (!liveCall) setAnsweredCallId(null)
  }, [liveCall])

  useEffect(() => {
    if (!waitingForSip) {
      setShowBridgeHint(false)
      return
    }
    const t = window.setTimeout(() => setShowBridgeHint(true), SIP_BRIDGE_HINT_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [waitingForSip, liveCall?.callId])

  // Hide modal when:
  //  - nothing is happening
  //  - call is actively connected (activeSession)
  //  - we already answered this call (even if SIP session dropped mid-call)
  const alreadyHandled = Boolean(liveCall && answeredCallId === liveCall.callId)
  if ((!liveCall && !pendingInvitation) || activeSession || alreadyHandled) return null

  const { from, to } = callerDisplay(liveCall, pendingInvitation)

  const handleAnswer = () => {
    if (pendingInvitation) {
      setAnsweredCallId(liveCall?.callId ?? null)
      void acceptCall()
    }
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
            {showBridgeHint && sipStatus === 'registered' && (
              <>
                {' '}
                If this stays stuck, the PSTN call may have landed on a different FreeSWITCH node than
                the one where you registered (WSS :7443). For WebRTC agent mode, route inbound media only
                to that node — see <code className="incoming-modal__code">kamailio/dispatcher.list</code>.
              </>
            )}
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
