/* The one HTTP client every resource function goes through. It owns the base URL,
 * the JWT header, JSON/form encoding, 204 handling, and turning non-2xx responses
 * into a typed ApiError. Nothing else reads the token or hard-codes a path.
 * See SPEC.md → "HTTP client". */

import { z, type ZodType } from 'zod'

import { parsed } from './parse'

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
  // The correlation key. The backend puts it in every error body and exposes
  // X-Request-ID cross-origin specifically so a user's report ties to a log line
  // and a Sentry event (backend ROADMAP R7). Collecting it and dropping it makes
  // that whole mechanism stop one step short of the person who needs it.
  request_id: z.string().optional(),
})

export class ApiError extends Error {
  readonly status: number
  readonly code?: ErrorCode
  /** Ties this failure to its server log line and Sentry event. */
  readonly requestId?: string
  readonly field?: string
  readonly errors?: FieldError[]

  constructor(
    status: number,
    message: string,
    code?: ErrorCode,
    field?: string,
    errors?: FieldError[],
    requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.field = field
    this.errors = errors
    this.requestId = requestId
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

async function request(path: string, options: RequestOptions = {}): Promise<ApiResponse<unknown>> {
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
    // Prefer the header: it is present even on a response whose body never made it
    // (a proxy error page, a truncated stream), which is exactly when a user most
    // needs something to quote.
    let requestId: string | undefined = res.headers.get('X-Request-ID') ?? undefined
    try {
      const parsed = apiErrorBodySchema.safeParse(await res.json())
      if (parsed.success) {
        message = parsed.data.detail
        code = parsed.data.code
        field = parsed.data.field
        errors = parsed.data.errors
        requestId ??= parsed.data.request_id
      }
      // A body that doesn't match the shape keeps the status-derived message.
    } catch {
      // Non-JSON error body — keep the status-derived message.
    }
    throw new ApiError(res.status, message, code, field, errors, requestId)
  }

  // `unknown`, not `T`: nothing has checked this body yet. The wrappers below are
  // the only way out of this module, and every one that returns a body parses it.
  const data: unknown = res.status === 204 ? undefined : await res.json()
  return { data, headers: res.headers }
}

// ---- Convenience wrappers (return just the body) ----
//
// Every wrapper that returns a body REQUIRES the schema to check it against
// (ARCHITECTURE §2.2). This used to be a convention -- each resource function
// remembered to `.then(parsed(...))` -- and a call site that forgot compiled fine
// and handed the view a type nothing had checked. Now forgetting is a type error: there is
// no signature that returns a body without a schema. A caller that genuinely wants
// the raw body has to say so, visibly, with `z.unknown()`.
//
// The path in a ResponseShapeError is the real one requested, query string and
// ids included, so the console line matches the request in the network tab.

async function requestParsed<T>(
  path: string,
  schema: ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const { data } = await request(path, options)
  return parsed(schema, data, path)
}

export function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  return requestParsed(path, schema)
}

export function apiPost<T>(path: string, schema: ZodType<T>, json?: unknown): Promise<T> {
  return requestParsed(path, schema, { method: 'POST', json })
}

/** POST a URL-encoded form — used only for `POST /auth/login` (OAuth2 password form). */
export function apiPostForm<T>(
  path: string,
  schema: ZodType<T>,
  form: Record<string, string>,
): Promise<T> {
  return requestParsed(path, schema, { method: 'POST', form })
}

export function apiPatch<T>(path: string, schema: ZodType<T>, json?: unknown): Promise<T> {
  return requestParsed(path, schema, { method: 'PATCH', json })
}

/** No schema: a DELETE answers `204` with no body, so there is nothing to check. */
export async function apiDelete(path: string): Promise<void> {
  await request(path, { method: 'DELETE' })
}
