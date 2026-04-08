import { useCallback, useEffect, useState } from 'react'
import type { ApiCall } from '../api/callsApi'
import { fetchRecentCalls } from '../api/callsApi'
import './CallHistoryPanel.css'

type Props = {
  baseUrl: string
  refreshToken: number
}

function formatWhen(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function statusClass(status: string): string {
  const s = status.replace(/[^a-z0-9_-]/gi, '_')
  return s || 'unknown'
}

export function CallHistoryPanel({ baseUrl, refreshToken }: Props) {
  const [calls, setCalls] = useState<ApiCall[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchRecentCalls(baseUrl, 200)
      setCalls(res.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setCalls([])
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  return (
    <section className="jam-history">
      <div className="jam-history-top">
        <div className="jam-history-intro">
          <h2 className="jam-history-title">Recent calls</h2>
          <p className="jam-history-sub">
            Inbound and outbound rows from MongoDB, newest first. Open a row for
            identifiers and provider fields.
          </p>
        </div>
        <button
          type="button"
          className="jam-btn-refresh"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <div className="jam-history-alert jam-history-alert--err" role="alert">
          {error}
        </div>
      ) : null}

      <div
        className="jam-history-list"
        role="feed"
        aria-busy={loading}
        aria-label="Call history"
      >
        {loading && calls.length === 0 ? (
          <div className="jam-history-empty">Loading call history…</div>
        ) : calls.length === 0 ? (
          <div className="jam-history-empty">No calls in the database yet.</div>
        ) : (
          calls.map((c) => {
            const id = c.callSid ?? c._id
            const inbound = c.direction === 'inbound'
            return (
              <details key={id} className="jam-call-card">
                <summary className="jam-call-summary">
                  <div className="jam-call-summary__main">
                    <time className="jam-call-time" dateTime={c.updatedAt}>
                      {formatWhen(c.updatedAt)}
                    </time>
                    <span
                      className={`jam-dir jam-dir--${inbound ? 'in' : 'out'}`}
                      title={c.direction}
                    >
                      <span className="jam-dir__ico" aria-hidden>
                        {inbound ? '↓' : '↑'}
                      </span>
                      {c.direction}
                    </span>
                    <span
                      className={`jam-status jam-status--${statusClass(c.status)}`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className="jam-call-summary__nums">
                    <div className="jam-num-row">
                      <span className="jam-num-label">From</span>
                      <span className="jam-num-value mono">{c.from}</span>
                    </div>
                    <div className="jam-num-row">
                      <span className="jam-num-label">To</span>
                      <span className="jam-num-value mono">{c.to}</span>
                    </div>
                  </div>
                </summary>
                <div className="jam-call-body">
                  <dl className="jam-call-dl">
                    <div className="jam-call-dl__row">
                      <dt>Call ID</dt>
                      <dd className="mono">{id}</dd>
                    </div>
                    {c.correlationId ? (
                      <div className="jam-call-dl__row">
                        <dt>Correlation</dt>
                        <dd className="mono">{c.correlationId}</dd>
                      </div>
                    ) : null}
                    <div className="jam-call-dl__row">
                      <dt>Provider</dt>
                      <dd>{c.provider}</dd>
                    </div>
                    {c.upstreamProvider ? (
                      <div className="jam-call-dl__row">
                        <dt>Upstream</dt>
                        <dd>
                          {c.upstreamProvider}
                          {c.upstreamCallId ? (
                            <span className="mono jam-call-dl__sub">
                              {' '}
                              · {c.upstreamCallId}
                            </span>
                          ) : null}
                        </dd>
                      </div>
                    ) : null}
                    {c.providerCallId ? (
                      <div className="jam-call-dl__row">
                        <dt>Media / provider call id</dt>
                        <dd className="mono">{c.providerCallId}</dd>
                      </div>
                    ) : null}
                    <div className="jam-call-dl__row">
                      <dt>Recording</dt>
                      <dd>{c.recordingEnabled !== false ? 'Enabled' : 'Off'}</dd>
                    </div>
                    {c.lastError ? (
                      <div className="jam-call-dl__row jam-call-dl__row--err">
                        <dt>Last error</dt>
                        <dd>{c.lastError}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              </details>
            )
          })
        )}
      </div>
    </section>
  )
}
