/* Frontend view of the backend API schema.
 *
 * The concrete resource types are RE-EXPORTED from `./schema`, which is GENERATED
 * from the backend's openapi.json by `npm run gen:api` (ROADMAP R8) — so they
 * cannot drift from the API. A few client-side conveniences that don't map 1:1 to
 * a single backend schema (the generic `Page<T>`, the `UUID` alias, the dict-shaped
 * taxonomy, and the consolidated unit-entry / add bodies) stay hand-defined below.
 *
 * Do not edit `schema.d.ts` by hand — run `npm run gen:api` (or `make gen-api`),
 * which regenerates it from the backend's published openapi.json. CI fails if
 * the committed file is stale (ROADMAP F2). */

import type { components } from './schema'

type Schemas = components['schemas']

// ---- Generated from openapi.json (1:1 with a backend schema) ----

export type Weapon_Read = Schemas['Weapon_Read']
export type Ability_Read = Schemas['Ability_Read']
export type Unit_Read = Schemas['Unit_Read']
export type Subfaction_Read = Schemas['Subfaction_Read']
export type Faction_Read = Schemas['Faction_Read']
export type User_Read = Schemas['User_Read']
export type Token = Schemas['Token']
export type UserUnit_Read = Schemas['UserUnit_Read']
export type ArmyUnit_Read = Schemas['ArmyUnit_Read']
export type Army_Read = Schemas['Army_Read']
export type Shortfall_Read = Schemas['Shortfall_Read']
export type ValidationIssue_Read = Schemas['ValidationIssue_Read']
export type Validation_Read = Schemas['Validation_Read']
export type UnitFacets = Schemas['UnitFacets']
export type Register_Create = Schemas['Register_Create']
export type Army_Create = Schemas['Army_Create']
export type Army_Update = Schemas['Army_Update']
export type AmountSet = Schemas['AmountSet']

// ---- Client-side conveniences (no single backend schema to re-export) ----

export type UUID = string

/** The pagination envelope every list endpoint returns. The backend emits
 * concrete `Page_Unit_Read_` etc.; kept generic here for ergonomics (structurally
 * identical). See ARCHITECTURE.md §2.3 / ROADMAP R4. */
export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

/** `GET /taxonomy` — allowed subfactions per faction name (a dict response, not a
 * named schema). */
export type FactionTaxonomy = Record<string, string[]>

/** Inventory and army rows are both a catalog unit plus an amount — the same
 * shape from either list. */
export type UnitEntry_Read = UserUnit_Read

/** `POST …/units` and `POST /me/inventory` bodies. The backend has one schema per
 * endpoint (ArmyUnitAdd / InventoryAdd), identical in shape. */
export interface UnitAdd {
  unit_id: UUID
  amount?: number
}
