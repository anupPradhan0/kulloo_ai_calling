/**
 * Ring buffer + subscribers for on-page Agent troubleshooting (inbound Plivo → WS → SIP).
 * No secrets — never pass passwords/tokens here.
 */

const MAX_LINES = 120
let lines: string[] = []
const listeners = new Set<() => void>()

export function agentDebugLog(message: string): void {
  const ts = new Date().toISOString().slice(11, 23)
  const line = `${ts} ${message}`
  lines = [...lines.slice(-(MAX_LINES - 1)), line]
  listeners.forEach((fn) => {
    fn()
  })
  if (typeof console !== 'undefined' && console.debug) {
    console.debug(`[agent] ${message}`)
  }
}

export function getAgentDebugLines(): string[] {
  return [...lines]
}

/** Stable text snapshot for `useSyncExternalStore` (must not return a new reference when content is unchanged). */
export function getAgentDebugText(): string {
  return lines.join('\n')
}

export function subscribeAgentDebugLog(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => listeners.delete(onStoreChange)
}

export function clearAgentDebugLog(): void {
  lines = []
  listeners.forEach((fn) => {
    fn()
  })
}
