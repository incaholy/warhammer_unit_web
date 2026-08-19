/* TypeScript mirrors of the backend response/request schemas
 * (../warhammer_unit/app/api/*). Hand-written for now; SPEC.md's roadmap step 12
 * replaces this with `openapi-typescript` output generated from /openapi.json.
 * Names match the backend (`Unit_Read`, `Army_Read`, …) so a rename there surfaces
 * as a diff here. */

export type UUID = string

/** The pagination envelope every list endpoint returns (backend `Page[T]`).
 * `total` is the count across the filter, ignoring paging — it lives in the
 * body, not a header (see ARCHITECTURE.md §2.3 / ROADMAP R4). */
export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

// ---- Catalog ----

export interface Weapon_Read {
  id: UUID
  name: string
  category: 'range' | 'melee'
  keywords: string[]
  range_inches: number | null
  attacks: string
  weapon_skill: number
  strength: number
  armor_piercing: number
  damage: string
}

export interface Ability_Read {
  id: UUID
  name: string
  description: string
}

export interface Unit_Read {
  id: UUID
  unit_name: string
  faction_id: UUID
  subfaction_id: UUID | null
  movement: number
  toughness: number
  armor_save: number
  wounds: number
  invulnerable_save: number | null
  leadership: number
  objective_control: number
  points: number
  keywords: string[]
  weapons: Weapon_Read[]
  abilities: Ability_Read[]
}

export interface Subfaction_Read {
  id: UUID
  name: string
}

export interface Faction_Read {
  id: UUID
  name: string
  subfactions: Subfaction_Read[]
}

/** `GET /taxonomy` — allowed subfactions per faction name. */
export type FactionTaxonomy = Record<string, string[]>

/** `GET /units/facets` — per-faction unit counts for the current filter,
 * computed server-side (replaces the client download-and-count). */
export interface UnitFacets {
  total: number
  by_faction: Record<UUID, number>
}

// ---- User data ----

export interface User_Read {
  id: UUID
  username: string
  email: string
  is_admin: boolean
}

export interface Token {
  access_token: string
  token_type: string
}

/** Both inventory (`UserUnit_Read`) and army (`ArmyUnit_Read`) rows are a catalog
 * unit plus an amount. */
export interface UnitEntry_Read {
  unit: Unit_Read
  amount: number
}
export type UserUnit_Read = UnitEntry_Read
export type ArmyUnit_Read = UnitEntry_Read

export interface Army_Read {
  id: UUID
  name: string
  faction_id: UUID
  subfaction_id: UUID | null
  description: string | null
  points_limit: number | null
  created_at: string
  points_total: number
  units: ArmyUnit_Read[]
}

export interface Shortfall_Read {
  unit: Unit_Read
  in_list: number
  owned: number
  need: number
}

export interface ValidationIssue_Read {
  kind: string
  detail: string
  unit: Unit_Read | null
}

export interface Validation_Read {
  ok: boolean
  points_total: number
  points_limit: number | null
  issues: ValidationIssue_Read[]
}

// ---- Request bodies ----

export interface Register_Create {
  username: string
  email: string
  password: string
}

export interface Army_Create {
  name: string
  faction_id: UUID
  subfaction_id?: UUID | null
  description?: string | null
  points_limit?: number | null
}

export type Army_Update = Partial<Omit<Army_Create, never>>

/** `POST …/units` and `POST /me/inventory` bodies (amount defaults to 1). */
export interface UnitAdd {
  unit_id: UUID
  amount?: number
}

/** The `PATCH` set-amount body for inventory/army units. */
export interface AmountSet {
  amount: number
}
