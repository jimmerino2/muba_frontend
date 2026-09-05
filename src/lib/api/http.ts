import { ApiError } from './client'

/**
 * The real transport to `/backend`.
 *
 * Everything the backend returns is wrapped in a fixed envelope
 * (`{ success, data, message }` — see muba_backend/API.md "Conventions"), and
 * every authenticated route wants `Authorization: Bearer <token>`. This module
 * owns both concerns so no resource module has to think about either: it hands
 * back `data` directly, or throws the `ApiError` the mock layer already threw,
 * so error handling in the views is identical either way.
 */

/** Where the backend lives. Overridable per-environment via `VITE_API_BASE_URL`
 * — the default matches the backend's own `PORT=4000` default. */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ??
  'http://localhost:4000'

/**
 * `live` talks to the backend; `mock` resolves from the in-memory fixtures in
 * `/lib/api/mock`. Defaults to `live` — the mock layer is kept as a deliberate
 * fallback for demoing without a backend running, not as the normal path.
 *
 * Read once at module load: switching modes mid-session would leave half the
 * app pointing at each store.
 */
export const API_MODE: 'live' | 'mock' =
  (import.meta.env.VITE_API_MODE as string | undefined) === 'mock' ? 'mock' : 'live'

const TOKEN_KEY = 'wayfare.token'

/* --------------------------------------------------------------- session */

/**
 * The bearer token, held in `localStorage` so a page refresh doesn't sign the
 * user out. It is an opaque credential as far as this layer is concerned —
 * API.md is explicit that it must not be decoded client-side, so nothing here
 * inspects or parses it.
 */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    // Private-mode browsers deny storage entirely. Sign-in still works for the
    // life of the tab via the in-memory session; only persistence is lost.
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* see getToken */
  }
}

/* ------------------------------------------------------------- transport */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Appended as a query string; `undefined`/`null` entries are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>
  /** Set false for the handful of routes that take no auth (login, health). */
  auth?: boolean
  /** Overrides the stored token — used during login, before it is persisted. */
  token?: string | null
  /** Aborts the request after this many ms, surfaced as a clear ApiError
   * rather than a silent, unbounded hang. Omitted (the default) means no
   * client-side timeout — most routes are fast enough that one would just
   * be noise. Set explicitly on routes with a documented, occasionally-slow
   * upstream (the Gonka verification call in particular can run 60s+ and
   * has no timeout of its own — see live/verification.ts). */
  timeoutMs?: number
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = new URL(`${API_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

/** The backend's response envelope. `data` is absent on failure. */
interface Envelope<T> {
  success: boolean
  message: string
  data?: T
}

/**
 * One request. Returns the unwrapped `data`, or throws an `ApiError` carrying
 * the backend's own status code and message.
 *
 * The `code` on the thrown error is derived from the status rather than read
 * from the body: API.md notes there is currently no `error.code` field, and
 * inventing one here would be a fiction the views might come to rely on.
 */
export async function http<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, token, timeoutMs } = options

  // A FormData body (a real file upload) must never be JSON.stringify'd or
  // sent under Content-Type: application/json — fetch sets its own
  // multipart boundary header when the body is a FormData instance, and
  // setting Content-Type ourselves would strip that boundary.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  const headers: Record<string, string> = {}
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json'

  const bearer = token !== undefined ? token : auth ? getToken() : null
  if (bearer) headers.Authorization = `Bearer ${bearer}`

  const controller = timeoutMs !== undefined ? new AbortController() : undefined
  const timer =
    controller !== undefined ? setTimeout(() => controller.abort(), timeoutMs) : undefined

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
      signal: controller?.signal,
    })
  } catch (cause) {
    if (controller?.signal.aborted) {
      // Distinct from a network failure: the request was sent and the
      // backend may still be working on it (verification doesn't stop just
      // because this tab gave up waiting) — say so, and point at retrying
      // rather than implying the backend is unreachable.
      throw new ApiError(
        408,
        `This is taking longer than expected (over ${Math.round(timeoutMs! / 1000)}s). The request may still be running on the server — check back in a moment, or retry.`,
        'REQUEST_TIMEOUT',
      )
    }
    // A network-level failure (backend down, wrong port, CORS rejection) never
    // reaches the envelope, so it needs its own message — "Failed to fetch"
    // on its own sends people hunting for a bug in the wrong place.
    throw new ApiError(
      0,
      `Could not reach the WayFare backend at ${API_BASE_URL}. Is it running (npm run dev), and is this origin listed in its CORS_ORIGIN?`,
      'NETWORK_UNAVAILABLE',
    )
  } finally {
    clearTimeout(timer)
  }

  let envelope: Envelope<T> | null = null
  try {
    envelope = (await response.json()) as Envelope<T>
  } catch {
    /* A non-JSON body (a proxy error page, say) leaves `envelope` null. */
  }

  if (!response.ok || envelope?.success === false) {
    throw new ApiError(
      response.status,
      envelope?.message ?? `Request failed with status ${response.status}.`,
      codeFor(response.status),
    )
  }

  // A 200 with no `data` is legitimate for the endpoints that return null
  // (e.g. a claim's blockchain ref before it is verified).
  return (envelope?.data ?? null) as T
}

function codeFor(status: number): string {
  switch (status) {
    case 400:
      return 'INVALID_REQUEST'
    case 401:
      return 'UNAUTHENTICATED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'RESOURCE_NOT_FOUND'
    case 409:
      return 'STATE_CONFLICT'
    case 502:
      return 'UPSTREAM_UNAVAILABLE'
    default:
      return 'REQUEST_FAILED'
  }
}

/**
 * Wraps a plain array in the pagination envelope the components expect.
 *
 * The backend returns bare arrays — it has no pagination of its own — so the
 * slicing happens here. That is honest at demo scale and keeps `DataTable` and
 * every list view unchanged; if the backend grows real pagination, only this
 * function and the `query` it forwards need to move.
 */
export function paginate<T>(
  items: T[],
  query: { page?: number; pageSize?: number } = {},
): { data: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number } } {
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.max(1, query.pageSize ?? 50)
  const start = (page - 1) * pageSize
  return {
    data: items.slice(start, start + pageSize),
    meta: {
      page,
      pageSize,
      total: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    },
  }
}
