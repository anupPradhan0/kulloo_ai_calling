import { DEFAULT_API_BASE_URL } from './constants'
import { getAgentPanelToken } from '../agent/agentPanelToken'

export type CallDirection = 'inbound' | 'outbound'

export type ApiCall = {
  _id: string
  callSid?: string
  direction: CallDirection
  provider: string
  upstreamProvider?: string
  upstreamCallId?: string
  from: string
  to: string
  status: string
  correlationId?: string
  providerCallId?: string
  recordingEnabled?: boolean
  timestamps?: Record<string, string>
  lastError?: string
  createdAt?: string
  updatedAt?: string
}

export type ListCallsResponse = {
  success: boolean
  count: number
  data: ApiCall[]
}

export type OutboundHelloBody = {
  to: string
  from: string
  provider: 'sip-local' | 'twilio' | 'plivo' | 'freeswitch'
  recordingEnabled: boolean
}

export function normalizeBaseUrl(base: string): string {
  return base.replace(/\/$/, '')
}

function withPanelHeaders(headers: HeadersInit = {}): HeadersInit {
  const h = new Headers(headers)
  const tok = getAgentPanelToken()
  if (tok) {
    h.set('X-Agent-Panel-Token', tok)
  }
  return h
}

export async function fetchRecentCalls(
  baseUrl: string,
  limit = 200,
): Promise<ListCallsResponse> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/calls?limit=${limit}`
  const res = await fetch(url)
  const text = await res.text()
  if (!res.ok) {
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  return JSON.parse(text) as ListCallsResponse
}

export async function placeOutboundHello(
  baseUrl: string,
  body: OutboundHelloBody,
): Promise<unknown> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/calls/outbound/hello`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const j = JSON.parse(text) as { message?: string; error?: string }
      message = j.message ?? j.error ?? message
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export function getDefaultBaseUrl(): string {
  return DEFAULT_API_BASE_URL
}

// ─── Agent softphone API ──────────────────────────────────────────────────────

export type AgentCredentials = {
  wssUrl: string
  domain: string
  username: string
  password: string
  stunServer: string
}

export async function fetchAgentCredentials(
  baseUrl: string,
  agentSessionId?: string,
): Promise<AgentCredentials> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/agent/credentials`
  const headers = withPanelHeaders()
  if (agentSessionId) {
    headers.set('X-Agent-Session-Id', agentSessionId)
  }
  const res = await fetch(url, { headers })
  const text = await res.text()
  if (!res.ok) throw new Error(text || `${res.status} ${res.statusText}`)
  const json = JSON.parse(text) as { success: boolean; data: AgentCredentials }
  return json.data
}

export async function claimAgentSession(
  baseUrl: string,
  sessionId: string,
): Promise<{ ok: boolean }> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/agent/session/claim`
  const res = await fetch(url, {
    method: 'POST',
    headers: withPanelHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ sessionId }),
  })
  if (res.status === 409) {
    return { ok: false }
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  return { ok: true }
}

export async function heartbeatAgentSession(
  baseUrl: string,
  sessionId: string,
): Promise<void> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/agent/session/heartbeat`
  const res = await fetch(url, {
    method: 'POST',
    headers: withPanelHeaders({ 'X-Agent-Session-Id': sessionId }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
}

export async function releaseAgentSession(baseUrl: string, sessionId: string): Promise<void> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/agent/session/release`
  await fetch(url, {
    method: 'POST',
    headers: withPanelHeaders({ 'X-Agent-Session-Id': sessionId }),
    keepalive: true,
  })
}

export async function setAgentStatus(
  baseUrl: string,
  status: 'available' | 'offline',
): Promise<void> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/agent/status`
  const res = await fetch(url, {
    method: 'POST',
    headers: withPanelHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
}

export async function fetchAgentPanelConfig(
  baseUrl: string,
): Promise<{ authRequired: boolean }> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/agent/panel/config`
  const res = await fetch(url)
  const text = await res.text()
  if (!res.ok) {
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  const j = JSON.parse(text) as { success: boolean; authRequired: boolean }
  return { authRequired: Boolean(j.authRequired) }
}

export async function loginAgentPanel(
  baseUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/agent/panel/login`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const text = await res.text()
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const j = JSON.parse(text) as { message?: string }
      message = j.message ?? message
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }
  const j = JSON.parse(text) as { success: boolean; token?: string }
  if (!j.token) {
    throw new Error('No token in response')
  }
  return j.token
}

export async function logoutAgentPanel(baseUrl: string): Promise<void> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/agent/panel/logout`
  await fetch(url, { method: 'POST', headers: withPanelHeaders() })
}
