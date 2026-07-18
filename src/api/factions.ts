/* Faction resource functions — `GET /factions` and `GET /factions/taxonomy`.
 * See SPEC.md → "Routing & views" (faction filter, New Army modal). */

import { apiGet } from './client'
import type { Faction_Read, FactionTaxonomy } from './types'

/** `GET /factions` — every faction with its subfactions. */
export function listFactions(): Promise<Faction_Read[]> {
  return apiGet<Faction_Read[]>('/factions')
}

/** `GET /factions/taxonomy` — allowed subfaction names keyed by faction name. */
export function factionTaxonomy(): Promise<FactionTaxonomy> {
  return apiGet<FactionTaxonomy>('/factions/taxonomy')
}
