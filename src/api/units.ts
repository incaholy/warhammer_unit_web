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
  limit?: number
  offset?: number
}

function toQueryString(params: ListUnitsParams): string {
  const search = new URLSearchParams()
  if (params.faction_id) search.set('faction_id', params.faction_id)
  if (params.subfaction_id) search.set('subfaction_id', params.subfaction_id)
  if (params.q) search.set('q', params.q)
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

/** `GET /units/facets` — per-faction unit counts for the current filter,
 * respecting the search term. Powers the catalog rail without downloading rows. */
export function unitFacets(params: { q?: string; subfaction_id?: UUID } = {}): Promise<UnitFacets> {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.subfaction_id) search.set('subfaction_id', params.subfaction_id)
  const qs = search.toString()
  const path = `/units/facets${qs ? `?${qs}` : ''}`
  return apiGet(path).then((d) => parsed(S.UnitFacets, d, path))
}

/** `GET /units/{id}` — a single datasheet. */
export function getUnit(id: UUID): Promise<Unit_Read> {
  return apiGet(`/units/${id}`).then((d) => parsed(S.Unit_Read, d, '/units/{id}'))
}
