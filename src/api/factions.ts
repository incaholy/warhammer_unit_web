/* Faction resource functions — `GET /factions`.
 * See SPEC.md → "Routing & views" (faction filter, New Army modal). */

import { apiGet } from './client'
import type { Faction_Read, Page } from './types'
import { toQueryString, type PageParams } from './paging'
import { parsed } from './parse'
import * as S from './schemas.gen'

/** `GET /factions` — every faction with its subfactions (paged). */
export function listFactions(params: PageParams = {}): Promise<Page<Faction_Read>> {
  const path = `/factions${toQueryString(params)}`
  return apiGet(path).then((d) => parsed(S.Page_Faction_Read_, d, '/factions'))
}
