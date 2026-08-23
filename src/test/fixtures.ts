/* Typed test fixtures, so a stub cannot claim a shape the API never returns.
 *
 * ROADMAP F4: a stub answers whatever the test author expected, so a suite can be
 * fully green against a contract the real backend does not honour. The helper
 * every test file used took `body: unknown`, which meant `{ id: 'u1' }` stood in
 * for a `Unit_Read` with fifteen required fields — it typechecked, it passed, and
 * it proved nothing about the real response.
 *
 * These builders are typed against `src/api/types.ts`, which re-exports the
 * schema generated from the backend's own `openapi.json` (F2). So a backend field
 * rename stops these compiling, and every test that lied about the shape is
 * listed by one `tsc` run rather than discovered at runtime.
 *
 * Each takes a `Partial` override, so a test still says only what it cares about
 * while the rest of the shape stays real.
 */

import type {
  Ability_Read,
  Army_Read,
  ArmyUnit_Read,
  Faction_Read,
  FactionTaxonomy,
  Page,
  Shortfall_Read,
  Token,
  Unit_Read,
  UnitFacets,
  User_Read,
  UserUnit_Read,
  Validation_Read,
  Weapon_Read,
} from '../api/types'

/** The one error shape every non-2xx carries (backend ROADMAP R9). Not in the
 *  generated schema: the backend builds error bodies by hand in its exception
 *  handlers, so FastAPI never publishes them. */
export interface ApiErrorBody {
  detail: string
  code?: string
  field?: string | null
  request_id?: string
  errors?: { code: string; field: string | null; detail: string }[]
}

/** Every body the API can actually return.
 *
 * This union is what makes the helper *constrain* rather than merely annotate. A
 * plain `jsonResponse<T>(body: T)` infers `T` from whatever it is handed, so
 * `{ id: 'u9' }` standing in for a fifteen-field `Unit_Read` still compiles —
 * which is the exact lie F4 is about. Constrained to this union, a literal that
 * matches no real response shape fails the typecheck. */
type ApiBody =
  | Unit_Read
  | Army_Read
  | Faction_Read
  | User_Read
  | UserUnit_Read
  | ArmyUnit_Read
  | Weapon_Read
  | Ability_Read
  | Validation_Read
  | UnitFacets
  | Token
  | FactionTaxonomy
  | ApiErrorBody
  | Shortfall_Read[]
  | Page<Unit_Read>
  | Page<Army_Read>
  | Page<Faction_Read>
  | Page<UserUnit_Read>

/** A JSON `Response` whose body must be a shape the API can really return. */
export function jsonResponse<T extends ApiBody>(body: T, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

/** The pagination envelope every collection returns (backend ROADMAP R4). */
export function page<T>(items: T[], over: Partial<Page<T>> = {}): Page<T> {
  return { items, total: items.length, limit: 50, offset: 0, ...over }
}

export function makeUnit(over: Partial<Unit_Read> = {}): Unit_Read {
  return {
    id: 'u1',
    unit_name: 'Intercessor',
    faction_id: 'f1',
    subfaction_id: null,
    movement: 6,
    toughness: 4,
    armor_save: 3,
    wounds: 2,
    invulnerable_save: null,
    leadership: 6,
    objective_control: 1,
    points: 100,
    keywords: [],
    weapons: [],
    abilities: [],
    ...over,
  }
}

export function makeFaction(over: Partial<Faction_Read> = {}): Faction_Read {
  return { id: 'f1', name: 'Imperium', subfactions: [], ...over }
}

export function makeArmy(over: Partial<Army_Read> = {}): Army_Read {
  return {
    id: 'a1',
    name: 'The Hollow Vigil',
    faction_id: 'f1',
    subfaction_id: null,
    description: null,
    points_limit: null,
    created_at: '2026-01-01T00:00:00Z',
    points_total: 0,
    units: [],
    ...over,
  }
}

export function makeArmyUnit(over: Partial<ArmyUnit_Read> = {}): ArmyUnit_Read {
  return { unit: makeUnit(), amount: 1, ...over }
}

export function makeUserUnit(over: Partial<UserUnit_Read> = {}): UserUnit_Read {
  return { unit: makeUnit(), amount: 1, ...over }
}

export function makeUser(over: Partial<User_Read> = {}): User_Read {
  return { id: 'user-1', username: 'kesh', email: 'kesh@x.io', is_admin: false, ...over }
}

export function makeFacets(over: Partial<UnitFacets> = {}): UnitFacets {
  return { total: 0, by_faction: {}, ...over }
}

export function makeWeapon(over: Partial<Weapon_Read> = {}): Weapon_Read {
  return {
    id: 'w1',
    name: 'Bolt rifle',
    category: 'range',
    keywords: [],
    range_inches: 24,
    attacks: '2',
    weapon_skill: 3,
    strength: 4,
    armor_piercing: 1,
    damage: '1',
    ...over,
  }
}

export function makeAbility(over: Partial<Ability_Read> = {}): Ability_Read {
  return { id: 'ab1', name: 'Oath of Moment', description: 'reroll', ...over }
}

export function makeShortfall(over: Partial<Shortfall_Read> = {}): Shortfall_Read {
  return { unit: makeUnit(), in_list: 1, owned: 0, need: 1, ...over }
}

export function makeValidation(over: Partial<Validation_Read> = {}): Validation_Read {
  return { ok: true, points_total: 0, points_limit: null, issues: [], ...over }
}
