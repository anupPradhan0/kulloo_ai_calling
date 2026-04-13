const STORAGE_KEY = 'kulloo_agent_panel_token'

export function getAgentPanelToken(): string | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

export function setAgentPanelToken(token: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, token)
  } catch {
    /* ignore */
  }
}

export function clearAgentPanelToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
