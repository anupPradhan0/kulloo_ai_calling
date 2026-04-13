/** Production API origin; used when `VITE_API_BASE_URL` is not set in `.env`. */
export const PUBLIC_DEFAULT_API_ORIGIN = 'https://kulloocall.anuppradhan.in'

/**
 * Set `VITE_API_BASE_URL` in `.env` to override (e.g. `http://127.0.0.1:5000` for a local backend).
 * With Docker + nginx, the UI is often same-origin with the API; using this full URL still works.
 */
export const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || PUBLIC_DEFAULT_API_ORIGIN

/** Resolved API origin (default or `VITE_API_BASE_URL`); falls back to `window.location.origin` only if base is empty. */
export function getEffectiveApiBaseUrl(): string {
  const base = DEFAULT_API_BASE_URL.trim()
  if (base) return base.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}
