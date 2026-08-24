/* Faction resource functions — `GET /factions` and `GET /taxonomy`.
 * See SPEC.md → "Routing & views" (faction filter, New Army modal). */

import { apiGet } from './client'
import type { Faction_Read, FactionTaxonomy, Page } from './types'
import { z } from 'zod'
import { parsed } from './parse'
import * as S from './schemas.gen'

/** `GET /factions` — every faction with its subfactions (paged). */
export function listFactions(): Promise<Page<Faction_Read>> {
  return apiGet('/factions').then((d) => parsed(S.Page_Faction_Read_, d, '/factions'))
}

/** `GET /taxonomy` — allowed subfaction names keyed by faction name. (Static
 * reference data, kept out of the `/factions/{id}` namespace.) */
export function factionTaxonomy(): Promise<FactionTaxonomy> {
  // No component schema for this one -- the backend returns a bare mapping rather
  // than a named model -- so the shape is declared here instead of generated.
  return apiGet('/taxonomy').then((d) =>
    parsed(z.record(z.string(), z.array(z.string())), d, '/taxonomy'),
  )
}
