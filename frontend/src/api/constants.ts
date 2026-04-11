/**
 * When `VITE_USE_RELATIVE_API=true` (e.g. production Docker behind nginx), use same-origin
 * `/api/...` and `/ws/...` so one hostname serves UI + API.
 * Otherwise set `VITE_API_BASE_URL` for a separate backend origin.
 */
const useRelativeApi =
  import.meta.env.VITE_USE_RELATIVE_API === 'true' ||
  import.meta.env.VITE_USE_RELATIVE_API === '1'

/** Override with `VITE_API_BASE_URL` in `.env` (e.g. local backend). Empty = same origin as the page (`/api/...`). */
export const DEFAULT_API_BASE_URL = useRelativeApi
  ? ''
  : import.meta.env.VITE_API_BASE_URL?.trim() || ''

/** Resolved origin used for `/api` and `/ws` (relative mode → current page origin). */
export function getEffectiveApiBaseUrl(): string {
  const base = DEFAULT_API_BASE_URL.trim()
  if (base) return base.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}
