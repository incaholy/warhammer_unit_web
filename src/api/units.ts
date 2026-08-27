/* Catalog unit resource functions — `GET /units` (paged, filterable),
 * `GET /units/facets` (per-faction counts), and `GET /units/{id}`.
 * See SPEC.md → "Routing & views" (CatalogView / UnitView). */

import { apiGet } from './client'
import type { Page, Unit_Read, UnitFacets, UUID } from './types'
import { parsed } from './parse'
import * as S from './schemas.gen'

export interface ListUnitsParams {
  faction_id?: UUID
  subfaction_id?: UUID
  /** Free-text search over unit names. */
  q?: string
  /** Only units in the caller's inventory. Filtered server-side on purpose:
   *  narrowing a page in the browser hides owned units that fall on other pages
   *  and makes every derived count wrong. Requires a signed-in caller (401). */
  owned?: boolean
  limit?: number
  offset?: number
}

function toQueryString(params: ListUnitsParams): string {
  const search = new URLSearchParams()
  if (params.faction_id) search.set('faction_id', params.faction_id)
  if (params.subfaction_id) search.set('subfaction_id', params.subfaction_id)
  if (params.q) search.set('q', params.q)
  // Only sent when on: `owned=false` is the default, so omitting it keeps the URL
  // and the query key stable for the common case.
  if (params.owned) search.set('owned', 'true')
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  if (params.offset !== undefined) search.set('offset', String(params.offset))
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

/** `GET /units` — the paged catalog. `total` (for "N of M") is in the body. */
export function listUnits(params: ListUnitsParams = {}): Promise<Page<Unit_Read>> {
  const path = `/units${toQueryString(params)}`
  return apiGet(path).then((d) => parsed(S.Page_Unit_Read_, d, path))
}

export interface UnitFacetsParams {
  q?: string
  subfaction_id?: UUID
  owned?: boolean
}

/** `GET /units/facets` — per-faction unit counts for the current filter,
 * respecting the search term. Powers the catalog rail without downloading rows. */
export function unitFacets(params: UnitFacetsParams = {}): Promise<UnitFacets> {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.subfaction_id) search.set('subfaction_id', params.subfaction_id)
  // The rail has to share the list's filter, or it reports counts for units the
  // list is not showing.
  if (params.owned) search.set('owned', 'true')
  const qs = search.toString()
  const path = `/units/facets${qs ? `?${qs}` : ''}`
  return apiGet(path).then((d) => parsed(S.UnitFacets, d, path))
}

/** `GET /units/{id}` — a single datasheet. */
export function getUnit(id: UUID): Promise<Unit_Read> {
  return apiGet(`/units/${id}`).then((d) => parsed(S.Unit_Read, d, '/units/{id}'))
}
