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

// Kill Team (ROADMAP KF2+). Re-exports like the rest -- the catalog's shapes are
// generated, so a backend change to a datacard cannot pass typecheck here.
export type KTFaction_Read = Schemas['KTFaction_Read']
export type KillTeam_Read = Schemas['KillTeam_Read']
export type KillTeam_Detail = Schemas['KillTeam_Detail']
export type KillTeamRule_Read = Schemas['KillTeamRule_Read']
export type KTPloy_Read = Schemas['KTPloy_Read']
export type KTEquipment_Read = Schemas['KTEquipment_Read']
export type KTWeapon_Read = Schemas['KTWeapon_Read']
export type KTAbility_Read = Schemas['KTAbility_Read']
export type KTOperative_Read = Schemas['KTOperative_Read']
export type KTOperative_ListRead = Schemas['KTOperative_ListRead']
export type KTSelectionRule_Read = Schemas['KTSelectionRule_Read']
export type Universal_Read = Schemas['Universal_Read']

// Kill Team rosters (ROADMAP KF3) — the half a player writes.
export type KTRoster_ListRead = Schemas['KTRoster_ListRead']
export type KTRoster_Read = Schemas['KTRoster_Read']
export type KTRoster_Create = Schemas['KTRoster_Create']
export type KTRoster_Update = Schemas['KTRoster_Update']
export type KTRosterOperative_Read = Schemas['KTRosterOperative_Read']

// Kill Team games (ROADMAP KF4) -- the live battle. `KTGame_Read` is the whole
// snapshot (KILLTEAM.md #22, #24): every datacard, the team's rules, its ploys and
// the universal ones, the text of each piece of equipment taken. So the game screen
// never calls the catalog.
export type KTGame_ListRead = Schemas['KTGame_ListRead']
export type KTGame_Read = Schemas['KTGame_Read']
export type KTGame_Create = Schemas['KTGame_Create']
export type KTGame_Update = Schemas['KTGame_Update']
export type KTGameOperative_Read = Schemas['KTGameOperative_Read']
export type KTGameOperative_Add = Schemas['KTGameOperative_Add']
export type KTGameOperative_Update = Schemas['KTGameOperative_Update']
export type KTGameOperative_Transform = Schemas['KTGameOperative_Transform']
export type KTGameEquipment_Read = Schemas['KTGameEquipment_Read']
export type KTGameEquipment_Add = Schemas['KTGameEquipment_Add']
export type KTGamePloy_Read = Schemas['KTGamePloy_Read']
export type KTGamePloy_Use = Schemas['KTGamePloy_Use']
export type KTGameRule_Read = Schemas['KTGameRule_Read']
export type KTGameWeapon_Read = Schemas['KTGameWeapon_Read']
export type KTGameAbility_Read = Schemas['KTGameAbility_Read']
export type KTGameEvent_Read = Schemas['KTGameEvent_Read']

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

/** `POST …/units` and `POST /me/inventory` bodies. The backend has one schema per
 * endpoint (ArmyUnitAdd / InventoryAdd), identical in shape. */
export interface UnitAdd {
  unit_id: UUID
  amount?: number
}
