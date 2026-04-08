import { DEFAULT_API_BASE_URL } from './constants'

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
