import { useCallback, useState } from 'react'
import type { OutboundHelloBody } from '../api/callsApi'
import { placeOutboundHello } from '../api/callsApi'
import './PhoneDialer.css'

const KEYS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
]

type Props = {
  baseUrl: string
  onCallPlaced: () => void
}

export function PhoneDialer({ baseUrl, onCallPlaced }: Props) {
  const [dialed, setDialed] = useState('')
  const [from, setFrom] = useState('+918035450404')
  const [provider, setProvider] =
    useState<OutboundHelloBody['provider']>('plivo')
  const [recordingEnabled, setRecordingEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  )

  const append = useCallback((d: string) => {
    setDialed((prev) => (prev + d).slice(0, 32))
    setMessage(null)
  }, [])

  const backspace = useCallback(() => {
    setDialed((prev) => prev.slice(0, -1))
    setMessage(null)
  }, [])

  const handleCall = async () => {
    const to = dialed.trim()
    if (!to) {
      setMessage({ type: 'err', text: 'Enter a number to call.' })
      return
    }
    const fromNum = from.trim()
    if (!fromNum) {
      setMessage({ type: 'err', text: 'Caller number is required.' })
      return
    }

    setBusy(true)
    setMessage(null)
    try {
      const body: OutboundHelloBody = {
        to,
        from: fromNum,
        provider,
        recordingEnabled,
      }
      await placeOutboundHello(baseUrl, body)
      setMessage({ type: 'ok', text: 'Call placed. Check history for status.' })
      onCallPlaced()
    } catch (e) {
      setMessage({
        type: 'err',
        text: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="phone-dialer">
      <div className="phone-frame">
        <div className="phone-earpiece" aria-hidden />
        <div className="phone-screen">
          <div className="dial-readouts">
            <label className="dial-line">
              <span className="dial-line-hint">Your number</span>
              <input
                className="dial-line-input dial-line-input--sm"
                type="text"
                inputMode="tel"
                autoComplete="tel"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                spellCheck={false}
              />
            </label>
            <label className="dial-line">
              <span className="dial-line-hint">Number to call</span>
              <input
                className="dial-line-input dial-line-input--lg"
                type="text"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Enter number"
                value={dialed}
                onChange={(e) =>
                  setDialed(e.target.value.replace(/\s/g, '').slice(0, 32))
                }
                spellCheck={false}
              />
            </label>
          </div>

          <div className="dial-pad">
            {KEYS.map((row, i) => (
              <div className="dial-row" key={i}>
                {row.map((k) => (
                  <button
                    type="button"
                    key={k}
                    className="dial-key"
                    disabled={busy}
                    onClick={() => append(k)}
                  >
                    <span className="dial-key-main">{k}</span>
                    <span className="dial-key-sub">
                      {k === '2'
                        ? 'ABC'
                        : k === '3'
                          ? 'DEF'
                          : k === '4'
                            ? 'GHI'
                            : k === '5'
                              ? 'JKL'
                              : k === '6'
                                ? 'MNO'
                                : k === '7'
                                  ? 'PQRS'
                                  : k === '8'
                                    ? 'TUV'
                                    : k === '9'
                                      ? 'WXYZ'
                                      : ''}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="dial-actions">
            <button
              type="button"
              className="dial-backspace"
              disabled={busy || dialed.length === 0}
              onClick={backspace}
              aria-label="Backspace"
            >
              ⌫
            </button>
            <button
              type="button"
              className="dial-call"
              disabled={busy}
              onClick={() => void handleCall()}
            >
              {busy ? 'Calling…' : 'Call'}
            </button>
          </div>

          <details className="dial-options">
            <summary className="dial-options-summary">More options</summary>
            <div className="dial-options-body">
              <label className="dial-options-field">
                <span className="dial-options-label">Route</span>
                <select
                  className="dial-options-select"
                  value={provider}
                  disabled={busy}
                  onChange={(e) =>
                    setProvider(e.target.value as OutboundHelloBody['provider'])
                  }
                >
                  <option value="sip-local">Local test</option>
                  <option value="plivo">Plivo</option>
                  <option value="twilio">Twilio</option>
                  <option value="freeswitch">FreeSWITCH</option>
                </select>
              </label>
              <label className="dial-options-check">
                <input
                  type="checkbox"
                  checked={recordingEnabled}
                  disabled={busy}
                  onChange={(e) => setRecordingEnabled(e.target.checked)}
                />
                Record call
              </label>
            </div>
          </details>
        </div>
      </div>

      {message ? (
        <p
          className={`dial-toast dial-toast--${message.type}`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}
    </div>
  )
}
