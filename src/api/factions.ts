/* Faction resource functions — `GET /factions` and `GET /taxonomy`.
 * See SPEC.md → "Routing & views" (faction filter, New Army modal). */

import { apiGet } from './client'
import type { Faction_Read, FactionTaxonomy, Page } from './types'

/** `GET /factions` — every faction with its subfactions (paged). */
export function listFactions(): Promise<Page<Faction_Read>> {
  return apiGet<Page<Faction_Read>>('/factions')
}

/** `GET /taxonomy` — allowed subfaction names keyed by faction name. (Static
 * reference data, kept out of the `/factions/{id}` namespace.) */
export function factionTaxonomy(): Promise<FactionTaxonomy> {
  return apiGet<FactionTaxonomy>('/taxonomy')
}
