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
  KillTeam_Detail,
  KillTeam_Read,
  KillTeamRule_Read,
  KTAbility_Read,
  KTEquipment_Read,
  KTFaction_Read,
  KTOperative_ListRead,
  KTPloy_Read,
  KTSelectionRule_Read,
  KTWeapon_Read,
  Page,
  Shortfall_Read,
  Token,
  Unit_Read,
  UnitFacets,
  User_Read,
  UserUnit_Read,
  Validation_Read,
  Universal_Read,
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
  | ApiErrorBody
  | Shortfall_Read[]
  | KTFaction_Read
  | KillTeam_Read
  | KillTeam_Detail
  | KTOperative_ListRead
  | Universal_Read
  | KTSelectionRule_Read[]
  | Page<Unit_Read>
  | Page<Army_Read>
  | Page<Faction_Read>
  | Page<UserUnit_Read>
  | Page<KTFaction_Read>
  | Page<KillTeam_Read>
  | Page<KTOperative_ListRead>

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

export function makeValidation(over: Partial<Validation_Read> = {}): Validation_Read {
  return { ok: true, points_total: 0, points_limit: null, issues: [], ...over }
}

// ---- Kill Team (ROADMAP KF2) ----
//
// `position` is set explicitly everywhere a collection is built, because printed
// order is the catalog's whole ordering contract (KILLTEAM.md #25) and a fixture
// that left it at a default would make an ordering assertion unfalsifiable.

export function makeKTFaction(over: Partial<KTFaction_Read> = {}): KTFaction_Read {
  return { id: 'ktf1', name: 'Tyranids', ...over }
}

export function makeKillTeam(over: Partial<KillTeam_Read> = {}): KillTeam_Read {
  return { id: 'kt1', name: 'Raveners', faction_id: 'ktf1', ...over }
}

export function makeKTWeapon(over: Partial<KTWeapon_Read> = {}): KTWeapon_Read {
  return {
    id: 'ktw1',
    name: 'Scything talons',
    category: 'melee',
    range: 0,
    attacks: 5,
    hit: 3,
    normal_damage: 4,
    crit_damage: 5,
    weapon_rules: [],
    position: 0,
    ...over,
  }
}

export function makeKTAbility(over: Partial<KTAbility_Read> = {}): KTAbility_Read {
  return { id: 'kta1', name: 'Pounce', description: 'A printed ability.', position: 0, ...over }
}

export function makeKTOperative(
  over: Partial<KTOperative_ListRead> = {},
): KTOperative_ListRead {
  return {
    id: 'kto1',
    name: 'Ravener Warrior',
    apl: 2,
    move: 6,
    save: 4,
    wounds: 12,
    keywords: ['RAVENER', 'TYRANID'],
    availability: 'roster',
    position: 0,
    weapons: [makeKTWeapon()],
    abilities: [makeKTAbility()],
    kill_team_id: 'kt1',
    ...over,
  }
}

export function makeKillTeamRule(over: Partial<KillTeamRule_Read> = {}): KillTeamRule_Read {
  return { id: 'ktr1', name: 'Burrow', description: 'A printed rule.', group: null, position: 0, ...over }
}

export function makeKTPloy(over: Partial<KTPloy_Read> = {}): KTPloy_Read {
  return {
    id: 'ktp1',
    name: 'Predatory Instincts',
    kind: 'strategy',
    cp_cost: 1,
    description: 'A printed ploy.',
    position: 0,
    ...over,
  }
}

export function makeKTEquipment(over: Partial<KTEquipment_Read> = {}): KTEquipment_Read {
  return { id: 'kte1', name: 'Grisly Trophy', description: 'A printed piece.', position: 0, ...over }
}

export function makeKTSelectionRule(
  over: Partial<KTSelectionRule_Read> = {},
): KTSelectionRule_Read {
  return { id: 'kts1', position: 0, depth: 0, kind: 'heading', text: 'Select', ...over }
}

export function makeKillTeamDetail(over: Partial<KillTeam_Detail> = {}): KillTeam_Detail {
  return {
    id: 'kt1',
    name: 'Raveners',
    faction_id: 'ktf1',
    // Two of each where order is the point, and NAMED so that printed order and
    // alphabetical order disagree. A fixture with one row, or with rows that happen
    // to be alphabetical, cannot fail an ordering assertion -- `position` is the
    // catalog's whole ordering contract (#25), so it has to be falsifiable here.
    rules: [
      makeKillTeamRule({ id: 'ktr1', name: 'Tunnel', position: 0 }),
      makeKillTeamRule({ id: 'ktr2', name: 'Burrow', position: 1 }),
    ],
    ploys: [
      makeKTPloy({ id: 'ktp1', name: 'Predatory Instincts', kind: 'strategy', position: 0 }),
      makeKTPloy({ id: 'ktp2', name: 'Lurking Horror', kind: 'firefight', position: 1 }),
    ],
    equipment: [
      makeKTEquipment({ id: 'kte1', name: 'Grisly Trophy', position: 0 }),
      makeKTEquipment({ id: 'kte2', name: 'Chameleonic Mutation', position: 1 }),
    ],
    // `KTOperative_ListRead` is `KTOperative_Read` plus `kill_team_id`, so one
    // builder serves both reads; the extra field is harmless here.
    operatives: [
      makeKTOperative({ id: 'kto1', name: 'Ravener Leader', position: 0 }),
      makeKTOperative({ id: 'kto2', name: 'Ravener Warrior', position: 1 }),
    ],
    // A heading, an indented line and its note — the three `kind`s a composition
    // actually renders differently (#44, #45, #30).
    selection_rules: [
      makeKTSelectionRule({ id: 'kts1', position: 0, depth: 0, kind: 'heading', text: 'Select' }),
      makeKTSelectionRule({ id: 'kts2', position: 1, depth: 1, kind: 'line', text: 'One LEADER' }),
      makeKTSelectionRule({ id: 'kts3', position: 2, depth: 1, kind: 'note', text: 'A footnote.' }),
    ],
    ...over,
  }
}

export function makeUniversal(over: Partial<Universal_Read> = {}): Universal_Read {
  return {
    ploys: [makeKTPloy({ id: 'ktp-u', name: 'Command Re-roll' })],
    equipment: [makeKTEquipment({ id: 'kte-u', name: 'Frag Grenade' })],
    ...over,
  }
}
