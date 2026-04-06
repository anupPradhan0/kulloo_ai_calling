export type HttpMethod = 'GET' | 'POST'

export type ResponseHint = 'json' | 'xml' | 'binary'

export interface PathParamSpec {
  name: string
  placeholder: string
  required?: boolean
}

export interface ApiEndpoint {
  id: string
  group: string
  method: HttpMethod
  /** Path from origin, e.g. `/api/health/live` */
  path: string
  description: string
  /** For routes registered as `all()` — we still use one verb in the browser */
  methodNote?: string
  bodyTemplate?: Record<string, unknown> | null
  idempotencyHeader?: boolean
  pathParams?: PathParamSpec[]
  responseHint?: ResponseHint
}
