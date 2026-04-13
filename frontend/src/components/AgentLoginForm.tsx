import { useState, type FormEvent } from 'react'
import { loginAgentPanel } from '../api/callsApi'
import { setAgentPanelToken } from '../agent/agentPanelToken'
import './AgentLoginForm.css'

type Props = {
  apiBase: string
  onLoggedIn: () => void
}

export function AgentLoginForm({ apiBase, onLoggedIn }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const token = await loginAgentPanel(apiBase, username.trim(), password)
      setAgentPanelToken(token)
      onLoggedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="agent-login">
      <div className="agent-login__card">
        <p className="agent-login__eyebrow">Agent workstation</p>
        <h1 className="agent-login__title">Sign in</h1>
        <p className="agent-login__lead">
          Enter the operator ID and password configured on the server (<code>AGENT_PANEL_USERNAME</code> /{' '}
          <code>AGENT_PANEL_PASSWORD</code>).
        </p>
        <form className="agent-login__form" onSubmit={(e) => void submit(e)}>
          <label className="agent-login__field">
            <span className="agent-login__label">Operator ID</span>
            <input
              className="agent-login__input"
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              required
            />
          </label>
          <label className="agent-login__field">
            <span className="agent-login__label">Password</span>
            <input
              className="agent-login__input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              required
            />
          </label>
          {error ? <p className="agent-login__error">{error}</p> : null}
          <button type="submit" className="agent-login__submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
