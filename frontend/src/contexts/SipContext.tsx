/**
 * SipContext — manages the sip.js UserAgent lifecycle and exposes
 * clean React hooks for the agent softphone UI.
 *
 * Lifecycle:
 *  1. On mount: fetch /api/agent/credentials
 *  2. Request microphone permission
 *  3. Create sip.js UserAgent and connect to FreeSWITCH WSS
 *  4. Listen for incoming Invitations → expose via pendingInvitation state
 *  5. acceptCall / rejectCall / hangup / sendDtmf / placeCall
 *
 * Audio: remote track is piped to a hidden <audio id="remoteAudio"> element
 * rendered inside SipProvider so it is always in the DOM.
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
import {
  UserAgent,
  Registerer,
  Inviter,
  Invitation,
  type Session,
  type SessionDescriptionHandler,
} from 'sip.js'
import { fetchAgentCredentials } from '../api/callsApi'
import { normalizeBaseUrl } from '../api/callsApi'

// ─── Types ───────────────────────────────────────────────────────────────────

export type SipStatus = 'idle' | 'connecting' | 'registered' | 'error' | 'mic_denied'

type SipContextValue = {
  sipStatus: SipStatus
  activeSession: Session | null
  pendingInvitation: Invitation | null
  acceptCall: () => Promise<void>
  rejectCall: () => void
  hangup: () => void
  sendDtmf: (digit: string) => void
  placeCall: (number: string) => void
}

// ─── Context ─────────────────────────────────────────────────────────────────

const SipContext = createContext<SipContextValue | null>(null)

export function useSip(): SipContextValue {
  const ctx = useContext(SipContext)
  if (!ctx) throw new Error('useSip must be used inside <SipProvider>')
  return ctx
}

// ─── Audio helper ─────────────────────────────────────────────────────────────

function attachRemoteAudio(session: Session): void {
  const pc = (
    session.sessionDescriptionHandler as (SessionDescriptionHandler & {
      peerConnection?: RTCPeerConnection
    }) | undefined
  )?.peerConnection
  if (!pc) return

  const audioEl = document.getElementById('remoteAudio') as HTMLAudioElement | null
  if (!audioEl) return

  const remoteStream = new MediaStream()
  pc.getReceivers().forEach((receiver) => {
    if (receiver.track) remoteStream.addTrack(receiver.track)
  })
  audioEl.srcObject = remoteStream
  void audioEl.play().catch(() => { /* autoplay blocked — user must interact first */ })
}

// ─── Provider ─────────────────────────────────────────────────────────────────

type Props = { baseUrl: string; agentSessionId?: string; children: ReactNode }

export function SipProvider({ baseUrl, agentSessionId, children }: Props) {
  const [sipStatus, setSipStatus]             = useState<SipStatus>('idle')
  const [activeSession, setActiveSession]     = useState<Session | null>(null)
  const [pendingInvitation, setPendingInvitation] = useState<Invitation | null>(null)

  const uaRef         = useRef<UserAgent | null>(null)
  const registererRef = useRef<Registerer | null>(null)

  // ── Boot: fetch credentials → request mic → start UserAgent ─────────────
  useEffect(() => {
    let cancelled = false

    async function init() {
      setSipStatus('connecting')
      try {
        // 1. Fetch SIP credentials from backend
        const creds = await fetchAgentCredentials(
          normalizeBaseUrl(baseUrl),
          agentSessionId,
        )

        // 2. Request microphone (browser will prompt once)
        await navigator.mediaDevices.getUserMedia({ audio: true })

        if (cancelled) return

        // 3. Build sip.js UserAgent
        const uri = UserAgent.makeURI(`sip:${creds.username}@${creds.domain}`)
        if (!uri) throw new Error('Invalid SIP URI from credentials')

        const ua = new UserAgent({
          uri,
          authorizationUsername: creds.username,
          authorizationPassword: creds.password,
          transportOptions: {
            server: creds.wssUrl,
          },
          sessionDescriptionHandlerFactoryOptions: {
            iceServers: [{ urls: creds.stunServer }],
            iceGatheringTimeout: 5000,
          },
          // Don't auto-answer — we handle invitations manually
          delegate: {
            onInvite(invitation: Invitation) {
              if (cancelled) return
              setPendingInvitation(invitation)

              // If caller hangs up before agent answers, clear the state
              invitation.stateChange.addListener((state) => {
                if (state === 'Terminated') {
                  setPendingInvitation((prev) => (prev === invitation ? null : prev))
                  setActiveSession((prev) => (prev === invitation ? null : prev))
                }
              })
            },
          },
        })

        uaRef.current = ua
        await ua.start()

        if (cancelled) { void ua.stop(); return }

        // 4. Register so FreeSWITCH can reach us via bridge(user/agentX@domain)
        const registerer = new Registerer(ua)
        registererRef.current = registerer

        registerer.stateChange.addListener((state) => {
          if (state === 'Registered')   setSipStatus('registered')
          if (state === 'Unregistered') setSipStatus('idle')
          if (state === 'Terminated')   setSipStatus('error')
        })

        await registerer.register()
      } catch (err: any) {
        if (!cancelled) {
          console.error('[SipContext] init failed:', err)
          if (err?.name === 'NotAllowedError' || err?.name === 'NotFoundError') {
            setSipStatus('mic_denied')
          } else {
            setSipStatus('error')
          }
        }
      }
    }

    void init()

    return () => {
      cancelled = true
      registererRef.current?.unregister().catch(() => {})
      uaRef.current?.stop().catch(() => {})
      uaRef.current = null
      registererRef.current = null
    }
  }, [baseUrl, agentSessionId])

  // ── acceptCall ────────────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!pendingInvitation) return
    const invitation = pendingInvitation
    setPendingInvitation(null)

    await invitation.accept()
    setActiveSession(invitation)
    // Slight delay to let ICE settle before attaching audio
    setTimeout(() => attachRemoteAudio(invitation), 300)

    invitation.stateChange.addListener((state) => {
      if (state === 'Terminated') setActiveSession(null)
    })
  }, [pendingInvitation])

  // ── rejectCall ────────────────────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    pendingInvitation?.reject()
    setPendingInvitation(null)
  }, [pendingInvitation])

  // ── hangup ────────────────────────────────────────────────────────────────
  const hangup = useCallback(() => {
    if (!activeSession) return
    const session = activeSession

    // Different method depending on call state
    if (session.state === 'Establishing') {
      if (session instanceof Invitation) void session.reject()
      else if (session instanceof Inviter) void session.cancel()
    } else if (session.state === 'Established') {
      void session.bye()
    }
    setActiveSession(null)
  }, [activeSession])

  // ── sendDtmf ──────────────────────────────────────────────────────────────
  const sendDtmf = useCallback((digit: string) => {
    if (!activeSession || activeSession.state !== 'Established') return
    activeSession.info({ requestOptions: {
      body: {
        contentDisposition: 'render',
        contentType: 'application/dtmf-relay',
        content: `Signal=${digit}\r\nDuration=100`,
      },
    }}).catch(() => {})
  }, [activeSession])

  // ── placeCall ─────────────────────────────────────────────────────────────
  const placeCall = useCallback((number: string) => {
    const ua = uaRef.current
    if (!ua) return

    // We need credentials to know the FS domain
    fetchAgentCredentials(normalizeBaseUrl(baseUrl), agentSessionId).then((creds) => {
      const target = UserAgent.makeURI(`sip:${number}@${creds.domain}`)
      if (!target) return

      const inviter = new Inviter(ua, target)
      setActiveSession(inviter)

      inviter.stateChange.addListener((state) => {
        if (state === 'Established') attachRemoteAudio(inviter)
        if (state === 'Terminated')  setActiveSession(null)
      })

      void inviter.invite()
    }).catch(() => {})
  }, [baseUrl, agentSessionId])

  return (
    <SipContext.Provider value={{
      sipStatus,
      activeSession,
      pendingInvitation,
      acceptCall,
      rejectCall,
      hangup,
      sendDtmf,
      placeCall,
    }}>
      {/* Hidden audio element — remote track is attached here on answer */}
      <audio id="remoteAudio" autoPlay playsInline style={{ display: 'none' }} />
      {children}
    </SipContext.Provider>
  )
}
