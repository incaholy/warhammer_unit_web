/* Catalog unit resource functions — `GET /units` (paged, filterable) and
 * `GET /units/{id}`. See SPEC.md → "Routing & views" (CatalogView / UnitView). */

import { apiGet, apiGetWithHeaders } from './client'
import type { Unit_Read, UUID } from './types'

export interface ListUnitsParams {
  faction_id?: UUID
  subfaction_id?: UUID
  /** Free-text search over unit names. */
  q?: string
  limit?: number
  offset?: number
}

export interface ListUnitsResult {
  units: Unit_Read[]
  /** Total matching rows, from the `X-Total-Count` header (for "N of M" paging). */
  total: number
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

/** `GET /units` — the paged catalog. Reads the paged total from `X-Total-Count`. */
export async function listUnits(params: ListUnitsParams = {}): Promise<ListUnitsResult> {
  const { data, headers } = await apiGetWithHeaders<Unit_Read[]>(`/units${toQueryString(params)}`)
  const totalHeader = headers.get('X-Total-Count')
  const total = totalHeader !== null ? Number(totalHeader) : data.length
  return { units: data, total }
}

/** `GET /units/{id}` — a single datasheet. */
export function getUnit(id: UUID): Promise<Unit_Read> {
  return apiGet<Unit_Read>(`/units/${id}`)
}
