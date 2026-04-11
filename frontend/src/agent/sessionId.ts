const STORAGE_KEY = 'kulloo-agent-session-id'

/** Stable per-tab session id for single-agent lock (Redis on server). */
export function getOrCreateAgentSessionId(): string {
  try {
    let id = sessionStorage.getItem(STORAGE_KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(STORAGE_KEY, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}
