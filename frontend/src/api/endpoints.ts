import type { ApiEndpoint } from './types'

/**
 * User-facing HTTP surface only: health, placing a call via hello, and
 * reading recordings. Internal routes (carrier webhooks, Plivo XML, metrics,
 * local disk listing) are omitted — see `doc/reference/api.md` for the full map.
 */
export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: 'health-live',
    group: 'Status',
    method: 'GET',
    path: '/api/health/live',
    description: 'Quick check that the API process is responding.',
  },
  {
    id: 'health-ready',
    group: 'Status',
    method: 'GET',
    path: '/api/health',
    description: 'Readiness: MongoDB and Redis are reachable.',
  },
  {
    id: 'calls-outbound-hello',
    group: 'Calls',
    method: 'POST',
    path: '/api/calls/outbound/hello',
    description:
      'Start an outbound hello call. A fresh Idempotency-Key is sent on each test.',
    idempotencyHeader: true,
    bodyTemplate: {
      to: '+15551234567',
      from: '+15557654321',
      provider: 'sip-local',
      recordingEnabled: true,
    },
  },
  {
    id: 'calls-recordings',
    group: 'Calls',
    method: 'GET',
    path: '/api/calls/:callId/recordings',
    description: 'List recording metadata for a call you already created.',
    pathParams: [{ name: 'callId', placeholder: 'Call id (from hello response)' }],
  },
  {
    id: 'recordings-metadata',
    group: 'Recordings',
    method: 'GET',
    path: '/api/recordings/:recordingId',
    description: 'Fetch one recording’s metadata from the database.',
    pathParams: [{ name: 'recordingId', placeholder: 'Recording id' }],
  },
  {
    id: 'recordings-file',
    group: 'Recordings',
    method: 'GET',
    path: '/api/recordings/:recordingId/file',
    description: 'Stream the recording audio when a file path is stored.',
    pathParams: [{ name: 'recordingId', placeholder: 'Recording id' }],
    responseHint: 'binary',
  },
]
