/* Auth resource functions — thin typed wrappers over the HTTP client for the
 * `/auth/*` and `/me` routes. See SPEC.md → "Auth & session". */

import { apiGet, apiPost, apiPostForm } from './client'
import type { Register_Create, Token, User_Read } from './types'

/** `POST /auth/register` — create an account. The signup form's "Name" field maps
 * to `username`; the server hashes the password. → `201 User_Read`. */
export function register(body: Register_Create): Promise<User_Read> {
  return apiPost<User_Read>('/auth/register', body)
}

/** `POST /auth/login` — OAuth2 password form. The `identifier` (a username *or* an
 * email) is sent in the form's `username` field. → `Token`. */
export function login(identifier: string, password: string): Promise<Token> {
  return apiPostForm<Token>('/auth/login', { username: identifier, password })
}

/** `GET /me` — the current user, using the stored Bearer token. */
export function getMe(): Promise<User_Read> {
  return apiGet<User_Read>('/me')
}
