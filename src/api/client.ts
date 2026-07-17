/* The one HTTP client every resource function goes through. It owns the base URL,
 * the JWT header, JSON/form encoding, 204 handling, and turning non-2xx responses
 * into a typed ApiError. Nothing else reads the token or hard-codes a path.
 * See SPEC.md → "HTTP client". */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

const TOKEN_KEY = 'muster.token'

/** The single place the JWT is read from / written to (localStorage). */
export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
}

/** Listeners fired when the API returns 401 (token stale/invalid). The auth layer
 * subscribes to bounce the user to /login. */
type UnauthorizedListener = () => void
const unauthorizedListeners = new Set<UnauthorizedListener>()

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

/** The shape of the backend's error body: `{ "detail": message, "field"? }`. */
interface ApiErrorBody {
  detail?: string
  field?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly field?: string

  constructor(status: number, message: string, field?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.field = field
  }
}

export interface ApiResponse<T> {
  data: T
  headers: Headers
}

interface RequestOptions {
  method?: string
  /** JSON request body (default encoding). */
  json?: unknown
  /** URL-encoded form body — used only for the OAuth2 login route. */
  form?: Record<string, string>
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {}

  const token = tokenStore.get()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let body: string | undefined
  if (options.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(options.form).toString()
  } else if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.json)
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  })

  // A stale/invalid token: clear it and let the auth layer react (→ /login).
  if (res.status === 401) {
    tokenStore.clear()
    unauthorizedListeners.forEach((listener) => listener())
  }

  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`
    let field: string | undefined
    try {
      const errorBody = (await res.json()) as ApiErrorBody
      if (errorBody.detail) message = errorBody.detail
      field = errorBody.field
    } catch {
      // Non-JSON error body — keep the status-derived message.
    }
    throw new ApiError(res.status, message, field)
  }

  const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T)
  return { data, headers: res.headers }
}

// ---- Convenience wrappers (return just the body) ----

export async function apiGet<T>(path: string): Promise<T> {
  return (await request<T>(path)).data
}

/** Like apiGet but also exposes response headers (e.g. X-Total-Count on /units). */
export function apiGetWithHeaders<T>(path: string): Promise<ApiResponse<T>> {
  return request<T>(path)
}

export async function apiPost<T>(path: string, json?: unknown): Promise<T> {
  return (await request<T>(path, { method: 'POST', json })).data
}

/** POST a URL-encoded form — used only for `POST /auth/login` (OAuth2 password form). */
export async function apiPostForm<T>(path: string, form: Record<string, string>): Promise<T> {
  return (await request<T>(path, { method: 'POST', form })).data
}

export async function apiPatch<T>(path: string, json?: unknown): Promise<T> {
  return (await request<T>(path, { method: 'PATCH', json })).data
}

export async function apiDelete(path: string): Promise<void> {
  await request<void>(path, { method: 'DELETE' })
}
