/* The one HTTP client every resource function goes through. It owns the base URL,
 * the JWT header, JSON/form encoding, 204 handling, and turning non-2xx responses
 * into a typed ApiError. Nothing else reads the token or hard-codes a path.
 * See SPEC.md → "HTTP client". */

import { z } from 'zod'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

/** The API version prefix every resource route mounts under (backend ROADMAP R5).
 * Resource functions pass bare paths ('/units'); this is prepended here so the
 * version lives in exactly one place. `/health` is unversioned but the app never
 * calls it. A future breaking change ships as '/api/v2' by bumping this. */
const API_PREFIX = '/api/v1'

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

/** The backend's stable, machine-readable error codes (mirrors
 * app/core/errors.py `ErrorCode`). Views branch on these, not on status/message. */
export const ERROR_CODES = [
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION',
  'REQUEST_VALIDATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INTERNAL',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

/** One entry in an error's `errors[]` array — same `{code, field, detail}` shape
 * as the top level. `field` is null for non-field (whole-body) errors. */
const apiFieldErrorSchema = z.object({
  code: z.enum(ERROR_CODES).optional().catch(undefined),
  field: z.string().nullable().optional(),
  detail: z.string(),
})
export type FieldError = z.infer<typeof apiFieldErrorSchema>

/** The one error shape the backend returns: `{ detail, code, field?, errors[] }`.
 * `errors` is a uniform array — one element for most failures, all of them for a
 * multi-field validation (ROADMAP R9/C); the top level mirrors `errors[0]`.
 * Parsed at the boundary (not cast) so a wrong shape is caught, not assumed;
 * `code` uses `.catch` so an unknown/future code degrades to `undefined` instead
 * of failing the whole parse. */
const apiErrorBodySchema = z.object({
  detail: z.string(),
  code: z.enum(ERROR_CODES).optional().catch(undefined),
  field: z.string().optional(),
  errors: z.array(apiFieldErrorSchema).optional(),
})

export class ApiError extends Error {
  readonly status: number
  readonly code?: ErrorCode
  readonly field?: string
  readonly errors?: FieldError[]

  constructor(status: number, message: string, code?: ErrorCode, field?: string, errors?: FieldError[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.field = field
    this.errors = errors
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

  const res = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
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
    let code: ErrorCode | undefined
    let field: string | undefined
    let errors: FieldError[] | undefined
    try {
      const parsed = apiErrorBodySchema.safeParse(await res.json())
      if (parsed.success) {
        message = parsed.data.detail
        code = parsed.data.code
        field = parsed.data.field
        errors = parsed.data.errors
      }
      // A body that doesn't match the shape keeps the status-derived message.
    } catch {
      // Non-JSON error body — keep the status-derived message.
    }
    throw new ApiError(res.status, message, code, field, errors)
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
