/** Override with `VITE_API_BASE_URL` in `.env` (e.g. local backend). */
export const DEFAULT_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  'https://kulloocall.anuppradhan.in'
