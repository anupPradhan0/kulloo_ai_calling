import { useCallback, useMemo, useState } from 'react'
import { API_ENDPOINTS } from '../api/endpoints'
import type { ApiEndpoint } from '../api/types'
import { DEFAULT_API_BASE_URL } from '../api/constants'

type TestResult = {
  status: number
  statusText: string
  contentType: string
  bodyPreview: string
  error?: string
}

function buildPath(path: string, paramValues: Record<string, string>): string {
  let out = path
  for (const [key, value] of Object.entries(paramValues)) {
    out = out.replace(`:${key}`, encodeURIComponent(value))
  }
  if (out.includes(':')) {
    throw new Error('Fill all path parameters before testing.')
  }
  return out
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const arr = m.get(k) ?? []
    arr.push(item)
    m.set(k, arr)
  }
  return m
}

export function ApiExplorer() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_API_BASE_URL)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [bodyOverrides, setBodyOverrides] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, TestResult | undefined>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const groups = useMemo(() => groupBy(API_ENDPOINTS, (e) => e.group), [])

  const initBodyJson = useCallback((ep: ApiEndpoint) => {
    if (bodyOverrides[ep.id] !== undefined) return bodyOverrides[ep.id]
    if (ep.bodyTemplate !== undefined) {
      return JSON.stringify(ep.bodyTemplate, null, 2)
    }
    return '{}'
  }, [bodyOverrides])

  const runTest = async (ep: ApiEndpoint) => {
    setLoadingId(ep.id)
    setResults((r) => ({ ...r, [ep.id]: undefined }))

    try {
      const params: Record<string, string> = {}
      for (const p of ep.pathParams ?? []) {
        const v = paramValues[`${ep.id}:${p.name}`] ?? ''
        if (!v.trim()) {
          throw new Error(`Missing path param: ${p.name}`)
        }
        params[p.name] = v.trim()
      }

      const path = buildPath(ep.path, params)
      const url = `${baseUrl.replace(/\/$/, '')}${path}`

      const headers: Record<string, string> = {}
      let body: string | undefined

      if (ep.method === 'POST') {
        headers['Content-Type'] = 'application/json'
        const raw = initBodyJson(ep).trim()
        body = raw === '' ? '{}' : raw
        try {
          JSON.parse(body)
        } catch {
          throw new Error('Request body must be valid JSON.')
        }
      }
      if (ep.idempotencyHeader) {
        headers['Idempotency-Key'] = crypto.randomUUID()
      }

      const res = await fetch(url, { method: ep.method, headers, body })

      const contentType = res.headers.get('content-type') ?? ''
      const binary =
        ep.responseHint === 'binary' ||
        contentType.includes('audio') ||
        contentType.includes('octet-stream')

      let bodyPreview: string
      if (binary) {
        const buf = await res.arrayBuffer()
        bodyPreview = `[binary ${buf.byteLength} bytes — ${contentType || 'unknown type'}]`
      } else {
        const text = await res.text()
        bodyPreview =
          text.length > 12000 ? `${text.slice(0, 12000)}\n… [truncated]` : text
      }

      setResults((r) => ({
        ...r,
        [ep.id]: {
          status: res.status,
          statusText: res.statusText,
          contentType,
          bodyPreview,
        },
      }))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setResults((r) => ({
        ...r,
        [ep.id]: {
          status: 0,
          statusText: 'Error',
          contentType: '',
          bodyPreview: '',
          error: msg,
        },
      }))
    } finally {
      setLoadingId(null)
    }
  }

  const setParam = (epId: string, name: string, value: string) => {
    setParamValues((p) => ({ ...p, [`${epId}:${name}`]: value }))
  }

  return (
    <div className="explorer">
      <section className="panel base-panel">
        <label className="field">
          <span className="field-label">API base URL</span>
          <input
            className="input"
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <p className="hint">
          Only user-facing routes are shown. Override the base URL with{' '}
          <code>VITE_API_BASE_URL</code> in <code>.env</code> for local backends.
        </p>
      </section>

      {[...groups.entries()].map(([groupName, endpoints]) => (
        <section key={groupName} className="panel group-panel">
          <h2 className="group-title">{groupName}</h2>
          <ul className="endpoint-list">
            {endpoints.map((ep) => (
              <li key={ep.id} className="endpoint-card">
                <div className="endpoint-head">
                  <span className={`method method-${ep.method}`}>{ep.method}</span>
                  <code className="path">{ep.path}</code>
                  {ep.methodNote ? (
                    <span className="method-note">({ep.methodNote})</span>
                  ) : null}
                </div>
                <p className="desc">{ep.description}</p>

                {ep.pathParams?.map((p) => (
                  <label key={p.name} className="field inline">
                    <span className="field-label">{p.name}</span>
                    <input
                      className="input mono"
                      placeholder={p.placeholder}
                      value={paramValues[`${ep.id}:${p.name}`] ?? ''}
                      onChange={(e) => setParam(ep.id, p.name, e.target.value)}
                    />
                  </label>
                ))}

                {ep.method === 'POST' ? (
                  <label className="field">
                    <span className="field-label">JSON body</span>
                    <textarea
                      className="textarea mono"
                      rows={ep.bodyTemplate && Object.keys(ep.bodyTemplate).length > 0 ? 8 : 3}
                      value={initBodyJson(ep)}
                      onChange={(e) =>
                        setBodyOverrides((b) => ({ ...b, [ep.id]: e.target.value }))
                      }
                      spellCheck={false}
                    />
                  </label>
                ) : null}

                <div className="actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={loadingId === ep.id}
                    onClick={() => void runTest(ep)}
                  >
                    {loadingId === ep.id ? 'Testing…' : 'Test'}
                  </button>
                </div>

                <ResultPanel result={results[ep.id]} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function ResultPanel({ result }: { result?: TestResult }) {
  if (!result) return null
  return (
    <div className={`result ${result.error ? 'result-error' : ''}`}>
      {result.error ? (
        <p className="result-error-msg">{result.error}</p>
      ) : (
        <>
          <div className="result-meta">
            <strong>{result.status}</strong> {result.statusText}
            {result.contentType ? (
              <span className="result-ct"> — {result.contentType}</span>
            ) : null}
          </div>
          <pre className="result-body mono">{result.bodyPreview}</pre>
        </>
      )}
    </div>
  )
}
